-- =============================================================
--  Bloqueio por inadimplência
--  O aviso "Pagamento em atraso" já existia (tolerancia_atraso). Aqui
--  vem o passo seguinte: além de avisar, a escolinha pode impedir que
--  o atleta em atraso seja marcado presente.
--
--  Três níveis, e o padrão é o de hoje — quem não configurar nada
--  continua só vendo o aviso, sem mudança nenhuma de comportamento.
-- =============================================================

alter table escolinhas
  add column if not exists bloqueio_inadimplencia text not null default 'avisar'
    check (bloqueio_inadimplencia in ('avisar', 'liberar_com_motivo', 'impedir')),
  add column if not exists dias_bloqueio smallint not null default 30
    check (dias_bloqueio between 0 and 180);

-- Bloquear antes de avisar não faz sentido: o responsável levaria a
-- porta na cara sem nunca ter visto o aviso. Normaliza o que já existe
-- antes de exigir, senão a migration quebra em quem pôs tolerância alta.
update escolinhas set dias_bloqueio = tolerancia_atraso
where dias_bloqueio < tolerancia_atraso;

alter table escolinhas
  drop constraint if exists bloqueio_depois_do_aviso;
alter table escolinhas
  add constraint bloqueio_depois_do_aviso check (dias_bloqueio >= tolerancia_atraso);

-- ---------------------------------------------------------------
-- quem está bloqueado
-- Irmã de alunos_em_atraso(), com dois contratos a mais: usa
-- dias_bloqueio (não a tolerância do aviso) e devolve vazio enquanto a
-- escolinha estiver só avisando. Assim a tela não precisa saber o modo
-- para desenhar o cadeado — lista vazia é "ninguém bloqueado".
--
-- SECURITY DEFINER pelo mesmo motivo da irmã: o professor não lê
-- mensalidades, e ainda assim precisa receber a lista de ids.
-- ---------------------------------------------------------------
create or replace function alunos_bloqueados(p_escolinha uuid)
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
    and e.bloqueio_inadimplencia <> 'avisar'
    and em_atraso(m.status, m.vencimento, e.dias_bloqueio);
$$;
revoke execute on function alunos_bloqueados(uuid) from public, anon;
grant execute on function alunos_bloqueados(uuid) to authenticated;

-- ---------------------------------------------------------------
-- liberações: a exceção, com nome e motivo
-- Uma por treino e atleta. O gestor libera aquele treino, não o mês —
-- se o atleta continuar devendo, o bloqueio volta no treino seguinte.
-- ---------------------------------------------------------------
create table liberacoes (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  treino_id    uuid not null references treinos (id) on delete cascade,
  aluno_id     uuid not null references alunos (id) on delete cascade,
  motivo       text not null check (length(btrim(motivo)) >= 3),
  liberado_por uuid references perfis (id) on delete set null,
  criado_em    timestamptz not null default now(),
  unique (treino_id, aluno_id)
);
create index on liberacoes (escolinha_id, criado_em desc);
create index on liberacoes (aluno_id, criado_em desc);

alter table liberacoes enable row level security;

-- O professor lê para a tela dele saber que já foi liberado; quem
-- libera é só o gestor.
create policy "membro lê liberações" on liberacoes for select to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()));
create policy "gestor libera" on liberacoes for insert to authenticated
  with check (e_dono(escolinha_id));
-- update existe por causa do ON CONFLICT do liberar_atleta: sem ela o
-- upsert é barrado mesmo com a de insert no lugar.
create policy "gestor refaz a liberação" on liberacoes for update to authenticated
  using (e_dono(escolinha_id)) with check (e_dono(escolinha_id));
create policy "gestor desfaz a liberação" on liberacoes for delete to authenticated
  using (e_dono(escolinha_id));

grant select, insert, update, delete on liberacoes to authenticated;
revoke all on liberacoes from anon;

-- ---------------------------------------------------------------
-- liberar_atleta
-- A RLS já barraria o professor, mas a mensagem dela é genérica.
-- Conferir aqui é o que faz a tela dizer o que aconteceu.
-- ---------------------------------------------------------------
create or replace function liberar_atleta(p_treino uuid, p_aluno uuid, p_motivo text)
returns uuid
language plpgsql
as $$
declare v_esc uuid; v_id uuid;
begin
  select escolinha_id into v_esc from treinos where id = p_treino;
  if v_esc is null then
    raise exception 'Treino não encontrado.' using errcode = '22023';
  end if;
  if not e_dono(v_esc) then
    raise exception 'Só o gestor pode liberar um atleta bloqueado.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo da liberação.' using errcode = '22023';
  end if;

  insert into liberacoes (escolinha_id, treino_id, aluno_id, motivo, liberado_por)
  values (v_esc, p_treino, p_aluno, btrim(p_motivo), auth.uid())
  on conflict (treino_id, aluno_id) do update
    set motivo = excluded.motivo, liberado_por = excluded.liberado_por, criado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function liberar_atleta(uuid, uuid, text) from public, anon;
grant execute on function liberar_atleta(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- a chamada passa a recusar presença de quem está bloqueado
-- Igual à de antes, com a checagem na frente. Ela mora aqui, e não na
-- tela, porque o professor não lê mensalidades: a tela dele nunca
-- saberia sozinha quem está devendo — e porque regra que vale só na
-- tela não vale.
--
-- Só 'P' é barrado. Falta e justificada dizem que o atleta não treinou,
-- que é exatamente o que o bloqueio quer; recusá-las apagaria a
-- chamada do dia inteiro por causa de quem nem apareceu.
-- ---------------------------------------------------------------
create or replace function salvar_chamada(p_treino uuid, p_marcas jsonb)
returns integer
language plpgsql
as $$
declare
  v_total integer;
  v_esc   uuid;
  v_modo  text;
  v_nomes text;
begin
  if jsonb_typeof(p_marcas) <> 'array' then
    raise exception 'Formato de chamada inválido.' using errcode = '22023';
  end if;

  select t.escolinha_id, e.bloqueio_inadimplencia into v_esc, v_modo
  from treinos t
  join escolinhas e on e.id = t.escolinha_id
  where t.id = p_treino;

  if v_modo is not null and v_modo <> 'avisar' then
    select string_agg(a.nome, ', ' order by a.nome) into v_nomes
    from jsonb_array_elements(p_marcas) m
    join alunos a on a.id = (m ->> 'aluno_id')::uuid
    where m ->> 'marca' = 'P'
      and a.id in (select alunos_bloqueados(v_esc))
      and (
        v_modo = 'impedir'
        or not exists (
          select 1 from liberacoes l
          where l.treino_id = p_treino and l.aluno_id = a.id
        )
      );

    -- errcode de propósito não é 42501: o front troca 42501 por um
    -- "sem permissão" genérico e o nome do atleta se perderia.
    if v_nomes is not null then
      raise exception '%', case
        when v_modo = 'impedir'
          then 'Mensalidade em atraso: ' || v_nomes || '. Regularize para marcar presença.'
        else 'Bloqueado por inadimplência: ' || v_nomes || '. Só o gestor pode liberar.'
      end using errcode = '22023';
    end if;
  end if;

  -- quem saiu da lista (trocou de turma, por exemplo) perde a marca
  delete from presencas p
  where p.treino_id = p_treino
    and p.aluno_id not in (
      select (m ->> 'aluno_id')::uuid from jsonb_array_elements(p_marcas) m
    );

  insert into presencas (treino_id, aluno_id, marca, motivo)
  select p_treino,
         (m ->> 'aluno_id')::uuid,
         (m ->> 'marca')::marca_presenca,
         nullif(btrim(coalesce(m ->> 'motivo', '')), '')
  from jsonb_array_elements(p_marcas) m
  on conflict (treino_id, aluno_id) do update
    set marca = excluded.marca,
        motivo = excluded.motivo,
        registrado_em = now();

  get diagnostics v_total = row_count;

  update treinos set status = 'realizado' where id = p_treino and status <> 'cancelado';

  return v_total;
end;
$$;
