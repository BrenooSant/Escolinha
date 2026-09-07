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
