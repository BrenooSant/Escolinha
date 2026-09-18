-- =============================================================
--  Gestor × professor, e o aviso de pagamento em atraso
--
--  Até aqui todo membro fazia tudo. Agora são dois papéis:
--    · gestor (no banco continua `dono`): tudo, como antes;
--    · professor: agenda, chamada e avaliações. Lê atletas, turmas e
--      responsáveis para trabalhar, mas não enxerga dinheiro nenhum —
--      nem mensalidade, nem caixa, nem lembrete de cobrança — e não
--      mexe em cadastro, matrícula, equipe ou dados da escolinha.
--
--  Esconder as telas não bastaria: a API responde a quem tiver a chave
--  anon e um login. Por isso a regra mora aqui, na RLS.
--
--  O professor ainda precisa saber que um atleta está devendo, para o
--  aviso na chamada. Isso vem de alunos_em_atraso(), que devolve só os
--  ids — nenhum valor, nenhuma data.
--
--  Dois vazamentos fechados no caminho:
--    · responsaveis.token abria o portal do responsável, que mostra as
--      mensalidades. A coluna sai do SELECT direto; o link passa a vir
--      de token_responsavel(), que só responde ao gestor.
--    · convites.token era legível por qualquer membro: um professor
--      podia aceitar, com outra conta, um convite de gestor pendente.
-- =============================================================

-- ---------------------------------------------------------------
-- tabelas só do gestor: dinheiro, matrícula e convites
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mensalidades', 'lancamentos', 'lembretes']
  loop
    execute format('drop policy if exists "membro lê %1$s" on %1$I', t);
    execute format('drop policy if exists "membro cria %1$s" on %1$I', t);
    execute format('drop policy if exists "membro edita %1$s" on %1$I', t);
    execute format('drop policy if exists "membro apaga %1$s" on %1$I', t);
    execute format(
      'create policy "gestor lê %1$s" on %1$I for select to authenticated'
      ' using (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor cria %1$s" on %1$I for insert to authenticated'
      ' with check (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor edita %1$s" on %1$I for update to authenticated'
      ' using (e_dono(escolinha_id)) with check (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor apaga %1$s" on %1$I for delete to authenticated'
      ' using (e_dono(escolinha_id))', t);
  end loop;
end;
$$;

drop policy if exists "membro lê pré-matrículas"   on pre_matriculas;
drop policy if exists "membro decide pré-matrícula" on pre_matriculas;
drop policy if exists "membro apaga pré-matrícula"  on pre_matriculas;
create policy "gestor lê pré-matrículas" on pre_matriculas for select to authenticated
  using (e_dono(escolinha_id));
create policy "gestor decide pré-matrícula" on pre_matriculas for update to authenticated
  using (e_dono(escolinha_id)) with check (e_dono(escolinha_id));
create policy "gestor apaga pré-matrícula" on pre_matriculas for delete to authenticated
  using (e_dono(escolinha_id));

drop policy if exists "membro lê convites" on convites;
create policy "gestor lê convites" on convites for select to authenticated
  using (e_dono(escolinha_id));

-- ---------------------------------------------------------------
-- cadastro: todo mundo lê, só o gestor escreve
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['alunos', 'responsaveis', 'turmas', 'quesitos_avaliacao']
  loop
    execute format('drop policy if exists "membro cria %1$s" on %1$I', t);
    execute format('drop policy if exists "membro edita %1$s" on %1$I', t);
    execute format('drop policy if exists "membro apaga %1$s" on %1$I', t);
    execute format(
      'create policy "gestor cria %1$s" on %1$I for insert to authenticated'
      ' with check (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor edita %1$s" on %1$I for update to authenticated'
      ' using (e_dono(escolinha_id)) with check (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor apaga %1$s" on %1$I for delete to authenticated'
      ' using (e_dono(escolinha_id))', t);
  end loop;
end;
$$;

-- turma_horarios não tem escolinha_id: vai pela turma
drop policy if exists "membro cria horários"  on turma_horarios;
drop policy if exists "membro edita horários" on turma_horarios;
drop policy if exists "membro apaga horários" on turma_horarios;
create policy "gestor cria horários" on turma_horarios for insert to authenticated
  with check (exists (select 1 from turmas t where t.id = turma_horarios.turma_id and e_dono(t.escolinha_id)));
create policy "gestor edita horários" on turma_horarios for update to authenticated
  using (exists (select 1 from turmas t where t.id = turma_horarios.turma_id and e_dono(t.escolinha_id)));
create policy "gestor apaga horários" on turma_horarios for delete to authenticated
  using (exists (select 1 from turmas t where t.id = turma_horarios.turma_id and e_dono(t.escolinha_id)));

-- fotos: o professor vê; trocar a foto é mexer no cadastro
do $$
declare acao text;
begin
  foreach acao in array array['insert', 'update', 'delete']
  loop
    execute format('drop policy if exists "membro %1$s fotos" on storage.objects', acao);
    execute format(
      'create policy "gestor %1$s fotos" on storage.objects for %1$s to authenticated %2$s ('
      '  bucket_id = ''fotos'''
      '  and public.e_dono(public.escolinha_do_caminho(name)))',
      acao, case when acao = 'insert' then 'with check' else 'using' end);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- token do portal: fora do SELECT direto
-- Privilégio por coluna: coluna nova em `responsaveis` precisa entrar
-- nesta lista, ou `select` nela dá "permission denied".
-- ---------------------------------------------------------------
revoke select on responsaveis from authenticated;
grant select (id, escolinha_id, nome, parentesco, telefone, email, criado_em)
  on responsaveis to authenticated;

create or replace function token_responsavel(p_responsavel uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.token from responsaveis r
  where r.id = p_responsavel and e_dono(r.escolinha_id);
$$;
revoke execute on function token_responsavel(uuid) from public, anon;
grant execute on function token_responsavel(uuid) to authenticated;

-- Era SECURITY INVOKER e devolvia o token pelo RETURNING — o que agora
-- esbarraria no privilégio de coluna. Passa a conferir o gestor aqui.
-- `extensions` no search_path: gerar_token() usa gen_random_bytes, do
-- pgcrypto, que o Supabase instala nesse schema.
create or replace function trocar_token_responsavel(p_responsavel uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text;
begin
  update responsaveis set token = gerar_token()
   where id = p_responsavel and e_dono(escolinha_id)
  returning token into v;
  if v is null then
    raise exception 'Responsável não encontrado.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke execute on function trocar_token_responsavel(uuid) from public, anon;
grant execute on function trocar_token_responsavel(uuid) to authenticated;

-- A view lia r.token direto e passaria a falhar para todo mundo.
create or replace view vw_mensalidades with (security_invoker = on) as
select
  m.id,
  m.escolinha_id,
  m.aluno_id,
  m.competencia,
  m.valor_centavos,
  m.vencimento,
  m.status,
  m.pago_em,
  m.metodo,
  m.avisado_em,
  m.aviso_obs,
  case
    when m.status = 'aberta' and m.vencimento < current_date
      then (current_date - m.vencimento)
    else 0
  end                as dias_atraso,
  a.nome             as aluno_nome,
  a.numero           as aluno_numero,
  t.nome             as turma_nome,
  r.nome             as responsavel_nome,
  r.telefone         as responsavel_telefone,
  token_responsavel(r.id) as responsavel_token,
  (select count(*) from lembretes l where l.mensalidade_id = m.id)     as lembretes,
  (select max(l.enviado_em) from lembretes l where l.mensalidade_id = m.id) as ultimo_lembrete
from mensalidades m
join alunos a            on a.id = m.aluno_id
left join turmas t       on t.id = a.turma_id
left join responsaveis r on r.id = a.responsavel_id;

-- ---------------------------------------------------------------
-- atraso: vencida há mais que a tolerância da escolinha
-- A tela de Cobranças continua mostrando o vencido desde o primeiro
-- dia — é o gestor quem cobra. A tolerância vale para o aviso que o
-- professor e o responsável veem.
-- ---------------------------------------------------------------
alter table escolinhas
  add column if not exists tolerancia_atraso smallint not null default 5
    check (tolerancia_atraso between 0 and 60);

create or replace function em_atraso(p_status status_mensalidade, p_vencimento date, p_tolerancia integer)
returns boolean
language sql
stable
as $$
  select p_status = 'aberta' and p_vencimento + p_tolerancia < current_date;
$$;

create or replace function alunos_em_atraso(p_escolinha uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.aluno_id
  from mensalidades m
  join escolinhas e on e.id = m.escolinha_id
  where m.escolinha_id = p_escolinha
    and p_escolinha in (select escolinhas_do_usuario())
    and em_atraso(m.status, m.vencimento, e.tolerancia_atraso);
$$;
revoke execute on function alunos_em_atraso(uuid) from public, anon;
grant execute on function alunos_em_atraso(uuid) to authenticated;

-- ---------------------------------------------------------------
-- portal: o mesmo de antes, mais `em_atraso` por filho
-- ---------------------------------------------------------------
create or replace function portal_responsavel(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; v_tol integer; v jsonb;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    return null;
  end if;

  select tolerancia_atraso into v_tol from escolinhas where id = r.escolinha_id;

  select jsonb_build_object(
    'responsavel', jsonb_build_object('nome', r.nome, 'telefone', r.telefone),
    'escolinha', (
      select jsonb_build_object('nome', e.nome, 'cidade', e.cidade, 'chave_pix', e.chave_pix)
      from escolinhas e where e.id = r.escolinha_id
    ),
    'filhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', a.nome,
        'numero', a.numero,
        'turma', a.turma_nome,
        'posicao', a.posicao,
        'frequencia', a.frequencia,
        'treinos', a.treinos,
        'presencas', a.presencas,
        'faltas', a.faltas,
        'justificadas', a.justificadas,

        'em_atraso', exists (
          select 1 from mensalidades mm
          where mm.aluno_id = a.id and em_atraso(mm.status, mm.vencimento, v_tol)
        ),

        'proximos_treinos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'data', t.data, 'hora', t.hora, 'local', t.local,
            'tipo', t.tipo, 'adversario', t.adversario
          ) order by t.data, t.hora)
          from treinos t
          where t.turma_id = a.turma_id and t.status = 'agendado'
            and t.data >= current_date and t.data <= current_date + 14
        ), '[]'::jsonb),

        'mensalidades', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'competencia', m.competencia, 'valor_centavos', m.valor_centavos,
            'vencimento', m.vencimento, 'status', m.status, 'pago_em', m.pago_em,
            'avisado_em', m.avisado_em,
            'dias_atraso', case when m.status = 'aberta' and m.vencimento < current_date
                                then current_date - m.vencimento else 0 end
          ) order by m.competencia desc)
          from (
            select * from mensalidades mm
            where mm.aluno_id = a.id order by mm.competencia desc limit 6
          ) m
        ), '[]'::jsonb),

        -- só as notas; a observação do professor não é para o pai
        'avaliacao', (
          select jsonb_build_object(
            'data', av.data,
            'media', (
              select round(avg(n.nota), 1)
              from avaliacao_notas n where n.avaliacao_id = av.id
            ),
            'notas', coalesce((
              select jsonb_agg(jsonb_build_object('quesito', q.nome, 'nota', n.nota)
                     order by q.ordem, q.nome)
              from avaliacao_notas n
              join quesitos_avaliacao q on q.id = n.quesito_id
              where n.avaliacao_id = av.id
            ), '[]'::jsonb)
          )
          from avaliacoes av
          where av.aluno_id = a.id
          order by av.data desc limit 1
        )
      ) order by a.nome)
      from vw_alunos a
      where a.responsavel_id = r.id and a.ativo
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

grant execute on function portal_responsavel(text) to anon, authenticated;
