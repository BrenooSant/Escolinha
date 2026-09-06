-- =============================================================
--  Link público de matrícula
--  Cada escolinha tem um código (escolinhas.codigo_matricula). O
--  responsável abre .../#/matricula/<CODIGO> e manda a ficha do filho.
--
--  Nenhuma tabela é exposta ao papel `anon`: o visitante só enxerga o
--  que estas duas funções SECURITY DEFINER devolvem.
-- =============================================================

-- O que a página pública mostra: nome da escolinha e as turmas com vaga.
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

-- Recebe a ficha preenchida pelo responsável e guarda como pendente.
-- Não cria aluno: quem aprova é o professor, no painel.
create or replace function enviar_pre_matricula(p_codigo text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e          record;
  v_id       uuid;
  v_turma    uuid;
  v_nome     text := btrim(coalesce(p_dados ->> 'aluno_nome', ''));
  v_resp     text := btrim(coalesce(p_dados ->> 'resp_nome', ''));
  v_tel      text := btrim(coalesce(p_dados ->> 'resp_telefone', ''));
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

  -- guarda-chuva contra envio repetido e contra enxurrada no formulário
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

  -- a turma escolhida precisa ser desta escolinha
  select t.id into v_turma
  from turmas t
  where t.id = nullif(p_dados ->> 'turma_id', '')::uuid
    and t.escolinha_id = e.id and t.ativa;

  insert into pre_matriculas (
    escolinha_id, aluno_nome, nascimento, posicao, turma_id, observacoes,
    autoriza_imagem, resp_nome, resp_parentesco, resp_telefone, resp_email
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
    nullif(left(btrim(coalesce(p_dados ->> 'resp_email', '')), 120), '')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'protocolo', upper(substr(replace(v_id::text, '-', ''), 1, 6)),
    'escolinha', e.nome
  );
end;
$$;

grant execute on function escolinha_publica(text)          to anon, authenticated;
grant execute on function enviar_pre_matricula(text, jsonb) to anon, authenticated;

-- Gerar um código novo invalida o link antigo — útil se ele vazar.
create or replace function trocar_codigo_matricula(p_escolinha uuid)
returns text
language plpgsql
as $$
declare v_codigo text;
begin
  update escolinhas
     set codigo_matricula = gerar_codigo_matricula()
   where id = p_escolinha
  returning codigo_matricula into v_codigo;

  if v_codigo is null then
    raise exception 'Escolinha não encontrada.' using errcode = 'P0002';
  end if;
  return v_codigo;
end;
$$;

revoke execute on function trocar_codigo_matricula(uuid) from public, anon;
grant execute on function trocar_codigo_matricula(uuid) to authenticated;
