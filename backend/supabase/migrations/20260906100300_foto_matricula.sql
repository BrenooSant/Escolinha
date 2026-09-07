-- =============================================================
--  Foto do atleta enviada pelo próprio responsável, na matrícula
--
--  O visitante não tem login, então precisa de um canto do bucket onde
--  possa gravar — e só gravar. O caminho é `pre/<escolinha_id>/<arquivo>`:
--  o anônimo insere, mas não lista nem lê; quem enxerga é o professor
--  da escolinha daquela pasta.
-- =============================================================

alter table pre_matriculas add column if not exists foto_path text;

-- a página pública precisa saber o id para montar o caminho do upload
create or replace function escolinha_publica(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare e record; v jsonb;
begin
  select * into e
  from escolinhas
  where codigo_matricula = upper(btrim(coalesce(p_codigo, '')));

  if not found or not e.matriculas_abertas then
    return null;
  end if;

  select jsonb_build_object(
    'id', e.id,
    'nome', e.nome,
    'cidade', e.cidade,
    'codigo', e.codigo_matricula,
    'turmas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'nome', t.nome,
        'mensalidade_centavos', t.mensalidade_centavos,
        'vagas', greatest(t.capacidade - (
          select count(*) from alunos a where a.turma_id = t.id and a.ativo
        ), 0)
      ) order by t.ordem, t.nome)
      from turmas t where t.escolinha_id = e.id and t.ativa
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

create or replace function enviar_pre_matricula(p_codigo text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e           record;
  v_id        uuid;
  v_turma     uuid;
  v_foto      text := nullif(btrim(coalesce(p_dados ->> 'foto_path', '')), '');
  v_nome      text := btrim(coalesce(p_dados ->> 'aluno_nome', ''));
  v_resp      text := btrim(coalesce(p_dados ->> 'resp_nome', ''));
  v_tel       text := btrim(coalesce(p_dados ->> 'resp_telefone', ''));
  v_pendentes integer;
begin
  select * into e
  from escolinhas
  where codigo_matricula = upper(btrim(coalesce(p_codigo, '')));

  if not found or not e.matriculas_abertas then
    raise exception 'Link de matrícula inválido ou encerrado.' using errcode = 'P0002';
  end if;

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do atleta.' using errcode = '22023';
  end if;
  if length(v_resp) < 3 then
    raise exception 'Informe o nome do responsável.' using errcode = '22023';
  end if;
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone válido com DDD.' using errcode = '22023';
  end if;

  -- a foto tem de estar na pasta desta escolinha, não em outra
  if v_foto is not null and v_foto not like 'pre/' || e.id::text || '/%' then
    raise exception 'Foto inválida.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pre_matriculas
    where escolinha_id = e.id and status = 'pendente'
      and resp_telefone = v_tel and lower(aluno_nome) = lower(v_nome)
  ) then
    raise exception 'Esta ficha já foi enviada e está em análise.' using errcode = '23505';
  end if;

  select count(*) into v_pendentes
  from pre_matriculas
  where escolinha_id = e.id and status = 'pendente' and enviada_em > now() - interval '1 hour';

  if v_pendentes >= 40 then
    raise exception 'Muitas fichas enviadas agora há pouco. Tente de novo em instantes.'
      using errcode = '53400';
  end if;

  select t.id into v_turma
  from turmas t
  where t.id = nullif(p_dados ->> 'turma_id', '')::uuid
    and t.escolinha_id = e.id and t.ativa;

  insert into pre_matriculas (
    escolinha_id, aluno_nome, nascimento, posicao, turma_id, observacoes,
    autoriza_imagem, resp_nome, resp_parentesco, resp_telefone, resp_email, foto_path
  )
  values (
    e.id,
    left(v_nome, 80),
    nullif(p_dados ->> 'nascimento', '')::date,
    nullif(left(btrim(coalesce(p_dados ->> 'posicao', '')), 40), ''),
    v_turma,
    nullif(left(btrim(coalesce(p_dados ->> 'observacoes', '')), 500), ''),
    coalesce((p_dados ->> 'autoriza_imagem')::boolean, true),
    left(v_resp, 80),
    nullif(left(btrim(coalesce(p_dados ->> 'resp_parentesco', '')), 40), ''),
    left(v_tel, 30),
    nullif(left(btrim(coalesce(p_dados ->> 'resp_email', '')), 120), ''),
    v_foto
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'protocolo', upper(substr(replace(v_id::text, '-', ''), 1, 6)),
    'escolinha', e.nome
  );
end;
$$;

-- aprovar leva a foto junto para a ficha do atleta
create or replace function aprovar_pre_matricula(
  p_id uuid,
  p_turma_id uuid default null,
  p_numero smallint default null
)
returns uuid
language plpgsql
as $$
declare
  pm      record;
  v_resp  uuid;
  v_aluno uuid;
  v_turma uuid;
  v_num   smallint;
begin
  select * into pm from pre_matriculas where id = p_id;
  if not found then
    raise exception 'Pré-matrícula não encontrada.' using errcode = 'P0002';
  end if;
  if pm.status <> 'pendente' then
    raise exception 'Esta pré-matrícula já foi decidida.' using errcode = '22023';
  end if;

  v_turma := coalesce(p_turma_id, pm.turma_id);
  v_num   := coalesce(p_numero, proximo_numero(pm.escolinha_id));

  select id into v_resp
  from responsaveis
  where escolinha_id = pm.escolinha_id and telefone = pm.resp_telefone
  limit 1;

  if v_resp is null then
    insert into responsaveis (escolinha_id, nome, parentesco, telefone, email)
    values (pm.escolinha_id, pm.resp_nome, pm.resp_parentesco, pm.resp_telefone, pm.resp_email)
    returning id into v_resp;
  end if;

  insert into alunos (
    escolinha_id, turma_id, responsavel_id, nome, numero, posicao,
    nascimento, observacoes, autoriza_imagem, foto_path
  )
  values (
    pm.escolinha_id, v_turma, v_resp, pm.aluno_nome, v_num, pm.posicao,
    pm.nascimento, pm.observacoes, pm.autoriza_imagem, pm.foto_path
  )
  returning id into v_aluno;

  update pre_matriculas
     set status = 'aprovada', aluno_id = v_aluno,
         decidida_em = now(), decidida_por = auth.uid()
   where id = p_id;

  perform gerar_mensalidades(pm.escolinha_id, current_date);

  return v_aluno;
end;
$$;

revoke execute on function aprovar_pre_matricula(uuid, uuid, smallint) from public, anon;
grant execute on function aprovar_pre_matricula(uuid, uuid, smallint) to authenticated;
grant execute on function escolinha_publica(text)           to anon, authenticated;
grant execute on function enviar_pre_matricula(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------
-- Storage: a janelinha do anônimo
-- ---------------------------------------------------------------
-- Só INSERT, só em `pre/<uuid>/`. A regex evita que alguém grave em
-- `pre/qualquercoisa/` e quebre o cast da política de leitura.
drop policy if exists "responsável envia foto na matrícula" on storage.objects;
create policy "responsável envia foto na matrícula" on storage.objects for insert to anon
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = 'pre'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and array_length(storage.foldername(name), 1) = 2
  );

-- As políticas antigas só entendiam `<escolinha_id>/arquivo`; agora
-- precisam entender `pre/<escolinha_id>/arquivo` também.
drop policy if exists "membro vê fotos da escolinha" on storage.objects;
drop policy if exists "membro envia foto"           on storage.objects;
drop policy if exists "membro troca foto"           on storage.objects;
drop policy if exists "membro apaga foto"           on storage.objects;

-- Devolve a escolinha dona do arquivo, entendendo os dois formatos de
-- caminho. Volta NULL em vez de estourar quando a pasta não é um uuid:
-- um arquivo com nome estranho não pode derrubar a leitura de todos.
create or replace function escolinha_do_caminho(caminho text)
returns uuid
language sql
stable
as $$
  select case
    when pasta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then pasta::uuid
  end
  from (
    select case when (storage.foldername(caminho))[1] = 'pre'
                then (storage.foldername(caminho))[2]
                else (storage.foldername(caminho))[1] end as pasta
  ) x
$$;

do $$
declare acao text;
begin
  foreach acao in array array['select', 'insert', 'update', 'delete']
  loop
    execute format('drop policy if exists "membro %1$s fotos" on storage.objects', acao);
    execute format(
      'create policy "membro %1$s fotos" on storage.objects for %1$s to authenticated %2$s ('
      '  bucket_id = ''fotos'''
      '  and public.escolinha_do_caminho(name) in (select public.escolinhas_do_usuario()))',
      acao, case when acao = 'insert' then 'with check' else 'using' end);
  end loop;
end;
$$;
