-- =============================================================
--  Row Level Security
--  Regra geral: você enxerga uma linha se for membro da escolinha
--  dona dela. Nenhuma tabela é legível por usuário anônimo — o link
--  público de matrícula passa por funções SECURITY DEFINER
--  (ver 20260905090300_publico.sql).
-- =============================================================

-- Consultada dentro das próprias políticas, então precisa ser
-- SECURITY DEFINER: senão a política de `membros` chamaria a si mesma.
create or replace function escolinhas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select escolinha_id from membros where perfil_id = auth.uid();
$$;

create or replace function e_dono(p_escolinha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membros
    where perfil_id = auth.uid() and escolinha_id = p_escolinha and papel = 'dono'
  );
$$;

-- Função nova nasce com EXECUTE para PUBLIC e, no Supabase, com um grant
-- direto para `anon` vindo das default privileges do projeto. Só tirar de
-- PUBLIC deixa o grant direto de pé — por isso os dois.
revoke execute on function escolinhas_do_usuario() from public, anon;
revoke execute on function e_dono(uuid) from public, anon;
grant execute on function escolinhas_do_usuario() to authenticated;
grant execute on function e_dono(uuid) to authenticated;

alter table perfis          enable row level security;
alter table escolinhas      enable row level security;
alter table membros         enable row level security;
alter table turmas          enable row level security;
alter table turma_horarios  enable row level security;
alter table responsaveis    enable row level security;
alter table alunos          enable row level security;
alter table treinos         enable row level security;
alter table presencas       enable row level security;
alter table mensalidades    enable row level security;
alter table lancamentos     enable row level security;
alter table lembretes       enable row level security;
alter table pre_matriculas  enable row level security;

-- ---------------------------------------------------------------
-- perfis: o seu, e o dos colegas da mesma escolinha
-- ---------------------------------------------------------------
create policy "perfil próprio ou de colega" on perfis for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from membros m
      where m.perfil_id = perfis.id and m.escolinha_id in (select escolinhas_do_usuario())
    )
  );

create policy "edita o próprio perfil" on perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------
-- escolinhas: criadas só via rpc criar_escolinha()
-- ---------------------------------------------------------------
create policy "vê as escolinhas em que é membro" on escolinhas for select to authenticated
  using (id in (select escolinhas_do_usuario()));

create policy "dono edita a escolinha" on escolinhas for update to authenticated
  using (e_dono(id)) with check (e_dono(id));

create policy "dono apaga a escolinha" on escolinhas for delete to authenticated
  using (e_dono(id));

-- ---------------------------------------------------------------
-- membros: quem está no time técnico
-- ---------------------------------------------------------------
create policy "vê os membros da escolinha" on membros for select to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()));

create policy "dono convida" on membros for insert to authenticated
  with check (e_dono(escolinha_id));

create policy "dono muda papel" on membros for update to authenticated
  using (e_dono(escolinha_id)) with check (e_dono(escolinha_id));

-- sair sozinho também vale, desde que não seja o dono
create policy "dono remove ou membro sai" on membros for delete to authenticated
  using (e_dono(escolinha_id) or (perfil_id = auth.uid() and papel <> 'dono'));

-- ---------------------------------------------------------------
-- tabelas do dia a dia: CRUD completo para membros da escolinha
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'turmas', 'responsaveis', 'alunos', 'treinos',
    'presencas', 'mensalidades', 'lancamentos', 'lembretes'
  ]
  loop
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
  end loop;
end;
$$;

-- turma_horarios não tem escolinha_id: vai pela turma
create policy "membro lê horários" on turma_horarios for select to authenticated
  using (exists (
    select 1 from turmas t
    where t.id = turma_horarios.turma_id and t.escolinha_id in (select escolinhas_do_usuario())
  ));

create policy "membro cria horários" on turma_horarios for insert to authenticated
  with check (exists (
    select 1 from turmas t
    where t.id = turma_horarios.turma_id and t.escolinha_id in (select escolinhas_do_usuario())
  ));

create policy "membro edita horários" on turma_horarios for update to authenticated
  using (exists (
    select 1 from turmas t
    where t.id = turma_horarios.turma_id and t.escolinha_id in (select escolinhas_do_usuario())
  ));

create policy "membro apaga horários" on turma_horarios for delete to authenticated
  using (exists (
    select 1 from turmas t
    where t.id = turma_horarios.turma_id and t.escolinha_id in (select escolinhas_do_usuario())
  ));

-- ---------------------------------------------------------------
-- pré-matrículas: o responsável só insere via RPC; o professor lê e decide
-- ---------------------------------------------------------------
create policy "membro lê pré-matrículas" on pre_matriculas for select to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()));

create policy "membro decide pré-matrícula" on pre_matriculas for update to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()))
  with check (escolinha_id in (select escolinhas_do_usuario()));

create policy "membro apaga pré-matrícula" on pre_matriculas for delete to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()));

-- ---------------------------------------------------------------
-- privilégios de tabela
-- O Supabase já concede isso por default privileges, mas ser explícito
-- evita depender da configuração do projeto: sem GRANT, a RLS nem chega
-- a ser avaliada e o erro vira "permission denied for table".
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'perfis', 'escolinhas', 'membros', 'turmas', 'turma_horarios',
    'responsaveis', 'alunos', 'treinos', 'presencas', 'mensalidades',
    'lancamentos', 'lembretes', 'pre_matriculas'
  ]
  loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end;
$$;
