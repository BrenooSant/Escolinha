-- =============================================================
--  Escolinha — schema base
--  Tudo é multi-tenant: cada linha pertence a uma escolinha e o
--  isolamento é feito por RLS (ver 20260905090100_rls.sql).
--  Dinheiro é sempre inteiro em centavos.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- tipos
-- ---------------------------------------------------------------
create type papel_membro        as enum ('dono', 'professor');
create type tipo_evento         as enum ('treino', 'jogo');
create type status_treino       as enum ('agendado', 'realizado', 'cancelado');
create type marca_presenca      as enum ('P', 'F', 'J');
create type status_mensalidade  as enum ('aberta', 'paga', 'isenta', 'cancelada');
create type tipo_lancamento     as enum ('entrada', 'saida');
create type status_pre_matricula as enum ('pendente', 'aprovada', 'recusada');

-- ---------------------------------------------------------------
-- perfis — espelho de auth.users, preenchido por trigger
-- ---------------------------------------------------------------
create table perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null default 'Professor',
  telefone  text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- escolinhas + quem pode mexer em cada uma
-- ---------------------------------------------------------------

-- Código do link público de matrícula: 8 caracteres, sem 0/O/1/I
-- para não gerar confusão quando o responsável digita à mão.
create or replace function gerar_codigo_matricula()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::int, 1),
    ''
  )
  from generate_series(1, 8);
$$;

create table escolinhas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(btrim(nome)) between 2 and 80),
  cidade            text,
  local_padrao      text,
  chave_pix         text,
  dia_vencimento    smallint not null default 5 check (dia_vencimento between 1 and 28),
  codigo_matricula  text not null unique default gerar_codigo_matricula(),
  matriculas_abertas boolean not null default true,
  criada_em         timestamptz not null default now()
);

create table membros (
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  perfil_id    uuid not null references perfis (id)     on delete cascade,
  papel        papel_membro not null default 'professor',
  criado_em    timestamptz not null default now(),
  primary key (escolinha_id, perfil_id)
);
create index on membros (perfil_id);

-- ---------------------------------------------------------------
-- turmas e a grade semanal de cada uma
-- ---------------------------------------------------------------
create table turmas (
  id                   uuid primary key default gen_random_uuid(),
  escolinha_id         uuid not null references escolinhas (id) on delete cascade,
  nome                 text not null check (length(btrim(nome)) between 1 and 40),
  mensalidade_centavos integer not null default 0 check (mensalidade_centavos >= 0),
  capacidade           smallint not null default 12 check (capacidade > 0),
  professor            text,
  ordem                smallint not null default 0,
  ativa                boolean not null default true,
  unique (escolinha_id, nome)
);
create index on turmas (escolinha_id);

-- dia_semana segue o to_char(..,'D') do Postgres: 0 = domingo … 6 = sábado
create table turma_horarios (
  id         uuid primary key default gen_random_uuid(),
  turma_id   uuid not null references turmas (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora       time not null,
  local      text,
  unique (turma_id, dia_semana, hora)
);
create index on turma_horarios (turma_id);

-- ---------------------------------------------------------------
-- responsáveis e atletas
-- ---------------------------------------------------------------
-- Um responsável pode ter mais de um filho na escolinha, por isso
-- fica em tabela própria em vez de campos soltos no aluno.
create table responsaveis (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  nome         text not null,
  parentesco   text,
  telefone     text,
  email        text,
  criado_em    timestamptz not null default now()
);
create index on responsaveis (escolinha_id);
-- o telefone é a chave natural para não duplicar irmãos
create unique index responsaveis_telefone_unico
  on responsaveis (escolinha_id, telefone)
  where telefone is not null and telefone <> '';

create table alunos (
  id                   uuid primary key default gen_random_uuid(),
  escolinha_id         uuid not null references escolinhas (id) on delete cascade,
  turma_id             uuid references turmas (id)       on delete set null,
  responsavel_id       uuid references responsaveis (id) on delete set null,
  nome                 text not null check (length(btrim(nome)) between 2 and 80),
  numero               smallint check (numero between 1 and 99),
  posicao              text,
  nascimento           date check (nascimento between '1990-01-01' and '2100-01-01'),
  foto_path            text,
  observacoes          text,
  autoriza_imagem      boolean not null default true,
  dia_vencimento       smallint check (dia_vencimento between 1 and 28),
  mensalidade_centavos integer check (mensalidade_centavos >= 0), -- null = herda da turma
  ativo                boolean not null default true,
  matriculado_em       date not null default current_date,
  criado_em            timestamptz not null default now()
);
create index on alunos (escolinha_id);
create index on alunos (turma_id);
create index on alunos (responsavel_id);
-- dois atletas ativos não podem usar a mesma camisa
create unique index alunos_numero_unico
  on alunos (escolinha_id, numero)
  where ativo and numero is not null;

-- ---------------------------------------------------------------
-- agenda: treinos e jogos
-- ---------------------------------------------------------------
create table treinos (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  turma_id     uuid not null references turmas (id)     on delete cascade,
  data         date not null,
  hora         time,
  local        text,
  tipo         tipo_evento   not null default 'treino',
  adversario   text,
  status       status_treino not null default 'agendado',
  observacoes  text,
  criado_em    timestamptz not null default now(),
  unique (turma_id, data, hora)
);
create index on treinos (escolinha_id, data);
create index on treinos (turma_id, data desc);

create table presencas (
  id            uuid primary key default gen_random_uuid(),
  escolinha_id  uuid not null references escolinhas (id) on delete cascade,
  treino_id     uuid not null references treinos (id) on delete cascade,
  aluno_id      uuid not null references alunos (id)  on delete cascade,
  marca         marca_presenca not null,
  motivo        text,
  registrado_em timestamptz not null default now(),
  unique (treino_id, aluno_id)
);
create index on presencas (aluno_id);
create index on presencas (escolinha_id);

-- ---------------------------------------------------------------
-- financeiro
-- ---------------------------------------------------------------
-- competencia é sempre o dia 1º do mês de referência
create table mensalidades (
  id             uuid primary key default gen_random_uuid(),
  escolinha_id   uuid not null references escolinhas (id) on delete cascade,
  aluno_id       uuid not null references alunos (id) on delete cascade,
  competencia    date not null check (extract(day from competencia) = 1),
  valor_centavos integer not null check (valor_centavos >= 0),
  vencimento     date not null,
  status         status_mensalidade not null default 'aberta',
  pago_em        date,
  metodo         text,
  criada_em      timestamptz not null default now(),
  unique (aluno_id, competencia)
);
create index on mensalidades (escolinha_id, competencia);
create index on mensalidades (escolinha_id, status);

create table lancamentos (
  id             uuid primary key default gen_random_uuid(),
  escolinha_id   uuid not null references escolinhas (id) on delete cascade,
  descricao      text not null,
  tipo           tipo_lancamento not null,
  valor_centavos integer not null check (valor_centavos > 0),
  data           date not null default current_date,
  categoria      text,
  mensalidade_id uuid references mensalidades (id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index on lancamentos (escolinha_id, data desc);
create unique index lancamentos_mensalidade_unica
  on lancamentos (mensalidade_id) where mensalidade_id is not null;

create table lembretes (
  id             uuid primary key default gen_random_uuid(),
  escolinha_id   uuid not null references escolinhas (id) on delete cascade,
  mensalidade_id uuid not null references mensalidades (id) on delete cascade,
  canal          text not null default 'whatsapp',
  mensagem       text,
  enviado_em     timestamptz not null default now(),
  enviado_por    uuid references perfis (id) on delete set null
);
create index on lembretes (mensalidade_id, enviado_em desc);
create index on lembretes (escolinha_id);

-- ---------------------------------------------------------------
-- pré-matrículas vindas do link público
-- ---------------------------------------------------------------
create table pre_matriculas (
  id              uuid primary key default gen_random_uuid(),
  escolinha_id    uuid not null references escolinhas (id) on delete cascade,
  aluno_nome      text not null,
  nascimento      date,
  posicao         text,
  turma_id        uuid references turmas (id) on delete set null,
  observacoes     text,
  autoriza_imagem boolean not null default true,
  resp_nome       text not null,
  resp_parentesco text,
  resp_telefone   text not null,
  resp_email      text,
  status          status_pre_matricula not null default 'pendente',
  aluno_id        uuid references alunos (id) on delete set null,
  motivo_recusa   text,
  enviada_em      timestamptz not null default now(),
  decidida_em     timestamptz,
  decidida_por    uuid references perfis (id) on delete set null
);
create index on pre_matriculas (escolinha_id, status, enviada_em desc);

-- ---------------------------------------------------------------
-- triggers utilitários
-- ---------------------------------------------------------------

-- Todo usuário novo do Supabase Auth ganha um perfil. O nome vem do
-- metadata mandado no signUp.
create or replace function tg_criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfis (id, nome)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger criar_perfil_no_signup
  after insert on auth.users
  for each row execute function tg_criar_perfil();

-- presenças herdam a escolinha do treino; assim a RLS não precisa de join
create or replace function tg_presenca_escolinha()
returns trigger
language plpgsql
as $$
begin
  select escolinha_id into new.escolinha_id from treinos where id = new.treino_id;
  return new;
end;
$$;

create trigger presenca_escolinha
  before insert or update of treino_id on presencas
  for each row execute function tg_presenca_escolinha();

-- idem para mensalidades, que herdam a escolinha do aluno
create or replace function tg_mensalidade_escolinha()
returns trigger
language plpgsql
as $$
begin
  select escolinha_id into new.escolinha_id from alunos where id = new.aluno_id;
  return new;
end;
$$;

create trigger mensalidade_escolinha
  before insert or update of aluno_id on mensalidades
  for each row execute function tg_mensalidade_escolinha();
