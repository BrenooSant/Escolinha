-- =============================================================
--  Cole tudo de uma vez. Substitui a parte 2 e a parte 3: este arquivo
--  sai das fontes já corrigidas, então rodá-lo não desfaz nada.
--  Idempotente — pode rodar quantas vezes quiser.
-- =============================================================

-- ======================================================
-- 20260906100000_avaliacoes.sql
-- ======================================================
-- =============================================================
--  Avaliação técnica do atleta
--  Nota de 1 a 5 por quesito, mais uma observação, tiradas de tempos
--  em tempos. Os quesitos são por escolinha — cada professor olha para
--  coisas diferentes, e o que vale no Sub-9 não vale no Sub-15.
-- =============================================================

create table if not exists quesitos_avaliacao (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  nome         text not null check (length(btrim(nome)) between 2 and 40),
  ordem        smallint not null default 0,
  ativo        boolean not null default true,
  unique (escolinha_id, nome)
);
create index if not exists quesitos_escolinha_idx on quesitos_avaliacao (escolinha_id);

create table if not exists avaliacoes (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  aluno_id     uuid not null references alunos (id) on delete cascade,
  data         date not null default current_date,
  observacao   text,
  avaliador_id uuid references perfis (id) on delete set null,
  criada_em    timestamptz not null default now(),
  unique (aluno_id, data)
);
create index if not exists avaliacoes_escolinha_idx on avaliacoes (escolinha_id);
create index if not exists avaliacoes_aluno_idx on avaliacoes (aluno_id, data desc);

create table if not exists avaliacao_notas (
  avaliacao_id uuid not null references avaliacoes (id) on delete cascade,
  quesito_id   uuid not null references quesitos_avaliacao (id) on delete cascade,
  nota         smallint not null check (nota between 1 and 5),
  primary key (avaliacao_id, quesito_id)
);

-- como em presencas e mensalidades, a escolinha vem por trigger
create or replace function tg_avaliacao_escolinha()
returns trigger
language plpgsql
as $$
begin
  select escolinha_id into new.escolinha_id from alunos where id = new.aluno_id;
  return new;
end;
$$;

drop trigger if exists avaliacao_escolinha on avaliacoes;
create trigger avaliacao_escolinha
  before insert or update of aluno_id on avaliacoes
  for each row execute function tg_avaliacao_escolinha();

alter table quesitos_avaliacao enable row level security;
alter table avaliacoes         enable row level security;
alter table avaliacao_notas    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['quesitos_avaliacao', 'avaliacoes']
  loop
    execute format('drop policy if exists "membro lê %1$s" on %1$I', t);
    execute format('drop policy if exists "membro cria %1$s" on %1$I', t);
    execute format('drop policy if exists "membro edita %1$s" on %1$I', t);
    execute format('drop policy if exists "membro apaga %1$s" on %1$I', t);
    execute format(
      'create policy "membro lê %1$s" on %1$I for select to authenticated'
      ' using (escolinha_id in (select escolinhas_do_usuario()))', t);
    execute format(
      'create policy "membro cria %1$s" on %1$I for insert to authenticated'
      ' with check (escolinha_id in (select escolinhas_do_usuario()))', t);
    execute format(
      'create policy "membro edita %1$s" on %1$I for update to authenticated'
      ' using (escolinha_id in (select escolinhas_do_usuario()))'
      ' with check (escolinha_id in (select escolinhas_do_usuario()))', t);
    execute format(
      'create policy "membro apaga %1$s" on %1$I for delete to authenticated'
      ' using (escolinha_id in (select escolinhas_do_usuario()))', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- avaliacao_notas não tem escolinha_id: vai pela avaliação
do $$
declare acao text;
begin
  foreach acao in array array['select', 'insert', 'update', 'delete']
  loop
    execute format('drop policy if exists "membro %1$s notas" on avaliacao_notas', acao);
    execute format(
      'create policy "membro %1$s notas" on avaliacao_notas for %1$s to authenticated %2$s ('
      '  exists (select 1 from avaliacoes a where a.id = avaliacao_notas.avaliacao_id'
      '          and a.escolinha_id in (select escolinhas_do_usuario())))',
      acao, case when acao = 'insert' then 'with check' else 'using' end);
  end loop;
end;
$$;
grant select, insert, update, delete on avaliacao_notas to authenticated;
revoke all on avaliacao_notas from anon;

-- ---------------------------------------------------------------
-- quesitos padrão
-- ---------------------------------------------------------------
create or replace function criar_quesitos_padrao(p_escolinha uuid)
returns void
language sql
as $$
  insert into quesitos_avaliacao (escolinha_id, nome, ordem)
  select p_escolinha, nome, ordem
  from (values
    ('Domínio e controle', 1),
    ('Passe', 2),
    ('Finalização', 3),
    ('Marcação', 4),
    ('Condicionamento', 5),
    ('Comportamento', 6)
  ) as q(nome, ordem)
  on conflict (escolinha_id, nome) do nothing;
$$;

-- escolinhas que já existem também ganham os quesitos
do $$
declare e uuid;
begin
  for e in select id from escolinhas loop
    perform criar_quesitos_padrao(e);
  end loop;
end;
$$;

-- e as novas passam a nascer com eles
create or replace function criar_escolinha(p_nome text, p_cidade text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_turma    record;
  v_turma_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Informe o nome da escolinha.' using errcode = '22023';
  end if;

  insert into escolinhas (nome, cidade)
  values (btrim(p_nome), nullif(btrim(coalesce(p_cidade, '')), ''))
  returning id into v_id;

  insert into membros (escolinha_id, perfil_id, papel)
  values (v_id, auth.uid(), 'dono');

  for v_turma in
    select * from (values
      ('Sub-9',  12000, 1, 1, time '17:00'),
      ('Sub-11', 13000, 2, 2, time '18:00'),
      ('Sub-13', 14000, 3, 3, time '18:00'),
      ('Sub-15', 15000, 4, 4, time '19:00')
    ) as t(nome, valor, ordem, dia_semana, hora)
  loop
    insert into turmas (escolinha_id, nome, mensalidade_centavos, ordem)
    values (v_id, v_turma.nome, v_turma.valor, v_turma.ordem)
    returning id into v_turma_id;

    insert into turma_horarios (turma_id, dia_semana, hora)
    values (v_turma_id, v_turma.dia_semana, v_turma.hora);
  end loop;

  perform criar_quesitos_padrao(v_id);

  return v_id;
end;
$$;

revoke execute on function criar_quesitos_padrao(uuid) from public, anon;
revoke execute on function criar_escolinha(text, text) from public, anon;
grant execute on function criar_quesitos_padrao(uuid) to authenticated;
grant execute on function criar_escolinha(text, text) to authenticated;

-- ---------------------------------------------------------------
-- leitura: avaliação com as notas embutidas e a média
-- ---------------------------------------------------------------
drop view if exists vw_avaliacoes;
create view vw_avaliacoes with (security_invoker = on) as
select
  a.id,
  a.escolinha_id,
  a.aluno_id,
  a.data,
  a.observacao,
  a.criada_em,
  p.nome as avaliador_nome,
  round(avg(n.nota), 1)                              as media,
  coalesce(jsonb_agg(
    jsonb_build_object('quesito_id', q.id, 'quesito', q.nome, 'nota', n.nota)
    order by q.ordem, q.nome
  ) filter (where n.nota is not null), '[]'::jsonb)  as notas
from avaliacoes a
left join perfis p                on p.id = a.avaliador_id
left join avaliacao_notas n       on n.avaliacao_id = a.id
left join quesitos_avaliacao q    on q.id = n.quesito_id
group by a.id, p.nome;

grant select on vw_avaliacoes to authenticated;
revoke all on vw_avaliacoes from anon;

-- Grava avaliação e notas de uma vez.
-- p_notas: [{"quesito_id": "...", "nota": 4}]
create or replace function salvar_avaliacao(
  p_aluno uuid,
  p_data date,
  p_notas jsonb,
  p_observacao text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if p_id is null then
    insert into avaliacoes (aluno_id, data, observacao, avaliador_id)
    values (p_aluno, coalesce(p_data, current_date), nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
    on conflict (aluno_id, data) do update
      set observacao = excluded.observacao, avaliador_id = excluded.avaliador_id
    returning id into v_id;
  else
    update avaliacoes
       set data = coalesce(p_data, data),
           observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
           avaliador_id = auth.uid()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
    end if;
  end if;

  delete from avaliacao_notas where avaliacao_id = v_id;

  insert into avaliacao_notas (avaliacao_id, quesito_id, nota)
  select v_id, (n ->> 'quesito_id')::uuid, (n ->> 'nota')::smallint
  from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) n
  where (n ->> 'nota') is not null;

  return v_id;
end;
$$;

revoke execute on function salvar_avaliacao(uuid, date, jsonb, text, uuid) from public, anon;
grant execute on function salvar_avaliacao(uuid, date, jsonb, text, uuid) to authenticated;

-- ======================================================
-- 20260906100100_portal_responsavel.sql
-- ======================================================
-- =============================================================
--  Portal do responsável
--  Cada responsável ganha um link privado com token. Abre sem senha e
--  mostra os filhos: frequência, mensalidades e a última avaliação.
--  É só leitura, com uma exceção — o pai pode avisar que pagou, e o
--  professor confirma depois.
--
--  Como no link de matrícula, nenhuma tabela é exposta ao papel anon:
--  tudo passa por funções SECURITY DEFINER que partem do token.
-- =============================================================

create or replace function gerar_token()
returns text
language sql
volatile
as $$ select encode(gen_random_bytes(16), 'hex'); $$;

-- Entra como anulável para poder preencher linha a linha; só quem ainda
-- não tem token recebe um, para não invalidar os links já distribuídos.
alter table responsaveis add column if not exists token text;
update responsaveis set token = gerar_token() where token is null;
alter table responsaveis alter column token set default gerar_token();
alter table responsaveis alter column token set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'responsaveis_token_unico') then
    alter table responsaveis add constraint responsaveis_token_unico unique (token);
  end if;
end;
$$;

-- o pai avisa que pagou; a confirmação continua sendo do professor
alter table mensalidades
  add column if not exists avisado_em timestamptz,
  add column if not exists aviso_obs  text;

-- ---------------------------------------------------------------
-- o que o link mostra
-- ---------------------------------------------------------------
create or replace function portal_responsavel(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; v jsonb;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    return null;
  end if;

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

-- ---------------------------------------------------------------
-- "já paguei" — sinaliza, não dá baixa
-- ---------------------------------------------------------------
create or replace function avisar_pagamento(p_token text, p_mensalidade uuid, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_m record;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Link inválido.' using errcode = 'P0002';
  end if;

  -- a mensalidade tem de ser de um filho deste responsável.
  -- A variável não pode se chamar `m`: o plpgsql resolveria `m.id` como
  -- ela mesma em vez do alias da tabela.
  select m.* into v_m
  from mensalidades m
  join alunos a on a.id = m.aluno_id
  where m.id = p_mensalidade and a.responsavel_id = r.id;

  if not found then
    raise exception 'Mensalidade não encontrada.' using errcode = 'P0002';
  end if;
  if v_m.status = 'paga' then
    return jsonb_build_object('ok', true, 'ja_paga', true);
  end if;

  update mensalidades
     set avisado_em = now(),
         aviso_obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '')
   where id = p_mensalidade;

  return jsonb_build_object('ok', true, 'ja_paga', false);
end;
$$;

grant execute on function portal_responsavel(text)          to anon, authenticated;
grant execute on function avisar_pagamento(text, uuid, text) to anon, authenticated;
revoke execute on function gerar_token() from public, anon;

-- Se o link vazar, o professor gera outro e o antigo morre.
create or replace function trocar_token_responsavel(p_responsavel uuid)
returns text
language plpgsql
as $$
declare v text;
begin
  update responsaveis set token = gerar_token() where id = p_responsavel returning token into v;
  if v is null then
    raise exception 'Responsável não encontrado.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke execute on function trocar_token_responsavel(uuid) from public, anon;
grant execute on function trocar_token_responsavel(uuid) to authenticated;

-- ---------------------------------------------------------------
-- o aviso do pai precisa aparecer para o professor
-- ---------------------------------------------------------------
-- `create or replace view` só aceita coluna acrescentada no fim, e estas
-- entram no meio. Recriar é seguro: nada mais depende desta view.
drop view if exists vw_mensalidades;
create view vw_mensalidades with (security_invoker = on) as
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
  r.token            as responsavel_token,
  (select count(*) from lembretes l where l.mensalidade_id = m.id)     as lembretes,
  (select max(l.enviado_em) from lembretes l where l.mensalidade_id = m.id) as ultimo_lembrete
from mensalidades m
join alunos a            on a.id = m.aluno_id
left join turmas t       on t.id = a.turma_id
left join responsaveis r on r.id = a.responsavel_id;

grant select on vw_mensalidades to authenticated;
revoke all on vw_mensalidades from anon;

-- ======================================================
-- 20260906100200_convites.sql
-- ======================================================
-- =============================================================
--  Convite de professor
--  Não dá para procurar alguém em auth.users pelo cliente, então o
--  convite é um token: o dono gera, manda o link, e quem abrir já
--  logado entra na equipe. Sem convite pendente, ninguém entra.
-- =============================================================

create table if not exists convites (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  email        text,
  papel        papel_membro not null default 'professor',
  token        text not null unique default gerar_token(),
  criado_por   uuid references perfis (id) on delete set null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '14 days',
  aceito_em    timestamptz,
  aceito_por   uuid references perfis (id) on delete set null
);
create index if not exists convites_escolinha_idx on convites (escolinha_id, aceito_em);

alter table convites enable row level security;

drop policy if exists "membro lê convites"  on convites;
drop policy if exists "dono cria convite"   on convites;
drop policy if exists "dono apaga convite"  on convites;

create policy "membro lê convites" on convites for select to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()));
create policy "dono cria convite" on convites for insert to authenticated
  with check (e_dono(escolinha_id));
create policy "dono apaga convite" on convites for delete to authenticated
  using (e_dono(escolinha_id));

grant select, insert, delete on convites to authenticated;
revoke all on convites from anon;

-- Quem abre o link ainda não é membro, então a leitura do convite e a
-- entrada na equipe precisam passar por fora da RLS.
create or replace function convite_por_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare c record;
begin
  select cv.*, e.nome as escolinha_nome, e.cidade
    into c
  from convites cv
  join escolinhas e on e.id = cv.escolinha_id
  where cv.token = btrim(coalesce(p_token, ''));

  if not found then return null; end if;

  return jsonb_build_object(
    'escolinha', c.escolinha_nome,
    'cidade', c.cidade,
    'papel', c.papel,
    'email', c.email,
    'expirado', c.expira_em < now(),
    'aceito', c.aceito_em is not null,
    'ja_e_membro', exists (
      select 1 from membros m where m.escolinha_id = c.escolinha_id and m.perfil_id = auth.uid()
    )
  );
end;
$$;

create or replace function aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare c record;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta antes de aceitar o convite.' using errcode = '42501';
  end if;

  select * into c from convites where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;
  if c.aceito_em is not null then
    raise exception 'Este convite já foi usado.' using errcode = '22023';
  end if;
  if c.expira_em < now() then
    raise exception 'Este convite expirou. Peça um novo à coordenação.' using errcode = '22023';
  end if;

  insert into membros (escolinha_id, perfil_id, papel)
  values (c.escolinha_id, auth.uid(), c.papel)
  on conflict (escolinha_id, perfil_id) do nothing;

  update convites set aceito_em = now(), aceito_por = auth.uid() where id = c.id;

  return c.escolinha_id;
end;
$$;

revoke execute on function convite_por_token(text) from public, anon;
revoke execute on function aceitar_convite(text)   from public, anon;
grant execute on function convite_por_token(text) to authenticated;
grant execute on function aceitar_convite(text)   to authenticated;

-- O dono pode tirar alguém da equipe; a política de membros já cuida disso,
-- mas a de update precisa existir para trocar o papel — e ninguém pode
-- rebaixar ou remover o último dono.
create or replace function tg_protege_ultimo_dono()
returns trigger
language plpgsql
as $$
declare v_donos integer;
begin
  -- Numa exclusão em cascata o pai já saiu antes dos membros — seja a
  -- escolinha inteira, seja o perfil de quem foi removido do Auth. Nesses
  -- casos não há o que proteger, e barrar impediria a própria exclusão.
  if tg_op = 'DELETE'
     and (not exists (select 1 from escolinhas where id = old.escolinha_id)
          or not exists (select 1 from perfis where id = old.perfil_id)) then
    return old;
  end if;

  if (tg_op = 'DELETE' and old.papel = 'dono')
     or (tg_op = 'UPDATE' and old.papel = 'dono' and new.papel <> 'dono') then
    select count(*) into v_donos
    from membros where escolinha_id = old.escolinha_id and papel = 'dono';
    if v_donos <= 1 then
      raise exception 'A escolinha precisa de pelo menos um dono.' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protege_ultimo_dono on membros;
create trigger protege_ultimo_dono
  before update or delete on membros
  for each row execute function tg_protege_ultimo_dono();

-- ======================================================
-- 20260906100300_foto_matricula.sql
-- ======================================================
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

-- ======================================================
-- 20260906100400_mensalidades_automaticas.sql
-- ======================================================
-- =============================================================
--  Geração automática das mensalidades
--  Todo dia 1º, cada escolinha ganha a mensalidade do mês de cada
--  atleta ativo — uma linha por aluno, que é o que faz a ficha dele
--  mostrar "Em dia" assim que o pagamento entra.
--
--  A rotina é a mesma `gerar_mensalidades` do botão manual, então rodar
--  à mão continua valendo e nunca duplica.
-- =============================================================

create or replace function gerar_mensalidades_todas(p_competencia date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e     uuid;
  total integer := 0;
begin
  for e in select id from escolinhas loop
    total := total + gerar_mensalidades(e, p_competencia);
  end loop;
  return total;
end;
$$;

revoke execute on function gerar_mensalidades_todas(date) from public, anon, authenticated;

-- `gerar_mensalidades` é SECURITY INVOKER e depende da RLS. Chamada de
-- dentro da rotina (que roda sem usuário), o dono da função definer é
-- quem executa — e ele ignora RLS, que é o que queremos aqui.

-- Agendar só se o pg_cron estiver ligado. Tentar criar a extensão aqui
-- costuma esbarrar em permissão no Supabase — ligar é um clique em
-- Database → Extensions, e aí basta rodar esta migration de novo.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron não está ligado. Ative em Database → Extensions e rode esta migration de novo. Até lá, use o botão "Gerar as do mês" no Financeiro.';
    return;
  end if;

  perform cron.unschedule('gerar-mensalidades-do-mes')
  where exists (select 1 from cron.job where jobname = 'gerar-mensalidades-do-mes');

  perform cron.schedule(
    'gerar-mensalidades-do-mes',
    '0 9 1 * *',                        -- todo dia 1º, 09:00 UTC (06:00 em Brasília)
    $cron$select public.gerar_mensalidades_todas()$cron$
  );

  raise notice 'Rotina mensal agendada: gerar-mensalidades-do-mes';
end;
$$;

-- ======================================================
-- 20260906100500_correcoes.sql
-- ======================================================
-- =============================================================
--  Duas correções apanhadas em teste
--
--  1. avisar_pagamento() declarava `m record` e usava `m` também como
--     alias da tabela. O plpgsql resolve o nome como variável, então
--     `m.id` estourava com "record m is not assigned yet".
--
--  2. O gatilho que protege o último dono disparava também na exclusão
--     em cascata — o que tornava impossível apagar uma escolinha e, pior,
--     impediria apagar um usuário no painel do Supabase (auth.users →
--     perfis → membros).
-- =============================================================

create or replace function avisar_pagamento(p_token text, p_mensalidade uuid, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_m record;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Link inválido.' using errcode = 'P0002';
  end if;

  select m.* into v_m
  from mensalidades m
  join alunos a on a.id = m.aluno_id
  where m.id = p_mensalidade and a.responsavel_id = r.id;

  if not found then
    raise exception 'Mensalidade não encontrada.' using errcode = 'P0002';
  end if;
  if v_m.status = 'paga' then
    return jsonb_build_object('ok', true, 'ja_paga', true);
  end if;

  update mensalidades
     set avisado_em = now(),
         aviso_obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '')
   where id = p_mensalidade;

  return jsonb_build_object('ok', true, 'ja_paga', false);
end;
$$;

grant execute on function avisar_pagamento(text, uuid, text) to anon, authenticated;

create or replace function tg_protege_ultimo_dono()
returns trigger
language plpgsql
as $$
declare v_donos integer;
begin
  -- Numa exclusão em cascata o pai já saiu antes dos membros — seja a
  -- escolinha inteira, seja o perfil de quem foi removido do Auth. Nesses
  -- casos não há o que proteger, e barrar impediria a própria exclusão.
  if tg_op = 'DELETE'
     and (not exists (select 1 from escolinhas where id = old.escolinha_id)
          or not exists (select 1 from perfis where id = old.perfil_id)) then
    return old;
  end if;

  if (tg_op = 'DELETE' and old.papel = 'dono')
     or (tg_op = 'UPDATE' and old.papel = 'dono' and new.papel <> 'dono') then
    select count(*) into v_donos
    from membros where escolinha_id = old.escolinha_id and papel = 'dono';
    if v_donos <= 1 then
      raise exception 'A escolinha precisa de pelo menos um dono.' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------- limpeza das escolinhas de teste que ficaram presas ----------
-- Só as que eu criei nos testes; as suas não têm esses nomes.
delete from escolinhas where nome in ('Parte Dois', 'Parte Dois B', 'Verif', 'Arquivo', 'Freq Teste', 'Escolinha Teste');

-- ---------- conferência ----------
select
  (select count(*) from escolinhas)                                          as escolinhas,
  (select count(*) from cron.job where jobname = 'gerar-mensalidades-do-mes') as rotina_mensal,
  (select prosrc like '%v_m record%' from pg_proc
     where proname = 'avisar_pagamento')                                     as avisar_corrigida,
  (select prosrc like '%from perfis where id = old.perfil_id%' from pg_proc
     where proname = 'tg_protege_ultimo_dono')                               as trigger_corrigido;
-- esperado: (as suas) | 1 | true | true
