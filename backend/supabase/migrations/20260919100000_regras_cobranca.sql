-- =============================================================
--  Regras de cobrança por escolinha
--
--  Cada escolinha cobra de um jeito, e nada aqui é obrigatório — tudo
--  nasce desligado (zero) e o gestor liga o que usa:
--    · desconto por pagar em dia (valor fixo ou %, até X dias antes);
--    · multa e juros ao mês no atraso;
--    · planos por período (bimestral, trimestral…) com desconto próprio;
--    · desconto de irmão, a partir do segundo filho do mesmo responsável;
--    · taxa de matrícula, cobrada uma vez quando o atleta entra;
--    · cobranças avulsas (uniforme, campeonato) lançadas à mão.
--
--  Os campos seguem o que o Asaas recebe numa cobrança (discount,
--  fine, interest), para a integração só repassar as regras.
--
--  As regras são copiadas para cada cobrança no momento em que ela é
--  criada: mudar a multa hoje não altera o que já foi cobrado.
--
--  De quebra, o valor combinado com cada atleta (bolsa, desconto
--  negociado) sai de `alunos` — que o professor lê — e vai para
--  `alunos_cobranca`, só do gestor. O preço da turma continua em
--  `turmas`: ele já é público, aparece no link de matrícula.
-- =============================================================

-- ---------------------------------------------------------------
-- configuração: uma linha por escolinha
-- ---------------------------------------------------------------
create table config_cobranca (
  escolinha_id              uuid primary key references escolinhas (id) on delete cascade,
  -- desconto_valor é em centavos quando o tipo é 'fixo', e em % quando é 'percentual'
  desconto_tipo             text not null default 'fixo' check (desconto_tipo in ('fixo', 'percentual')),
  desconto_valor            numeric(10, 2) not null default 0 check (desconto_valor >= 0),
  desconto_dias             smallint not null default 0 check (desconto_dias between 0 and 28),
  multa_percentual          numeric(5, 2) not null default 0 check (multa_percentual between 0 and 10),
  juros_mes_percentual      numeric(5, 2) not null default 0 check (juros_mes_percentual between 0 and 10),
  taxa_matricula_centavos   integer not null default 0 check (taxa_matricula_centavos >= 0),
  desconto_irmao_percentual numeric(5, 2) not null default 0 check (desconto_irmao_percentual between 0 and 100),
  atualizado_em             timestamptz not null default now(),
  check (desconto_tipo = 'fixo' or desconto_valor <= 100)
);

insert into config_cobranca (escolinha_id) select id from escolinhas;

create or replace function tg_config_cobranca_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into config_cobranca (escolinha_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger config_cobranca_inicial
  after insert on escolinhas
  for each row execute function tg_config_cobranca_inicial();

-- ---------------------------------------------------------------
-- planos por período
-- Sem plano, o atleta paga mês a mês. O plano cobra `meses` de uma vez,
-- com o desconto dele.
-- ---------------------------------------------------------------
create table planos (
  id                  uuid primary key default gen_random_uuid(),
  escolinha_id        uuid not null references escolinhas (id) on delete cascade,
  nome                text not null check (length(btrim(nome)) between 2 and 40),
  meses               smallint not null check (meses in (2, 3, 4, 6, 12)),
  desconto_percentual numeric(5, 2) not null default 0 check (desconto_percentual between 0 and 100),
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now()
);
create index on planos (escolinha_id);

-- ---------------------------------------------------------------
-- o que é combinado com cada atleta — só o gestor lê
-- ---------------------------------------------------------------
create table alunos_cobranca (
  aluno_id             uuid primary key references alunos (id) on delete cascade,
  escolinha_id         uuid not null references escolinhas (id) on delete cascade,
  mensalidade_centavos integer check (mensalidade_centavos >= 0), -- null = herda da turma
  plano_id             uuid references planos (id) on delete set null
);
create index on alunos_cobranca (escolinha_id);

insert into alunos_cobranca (aluno_id, escolinha_id, mensalidade_centavos)
select id, escolinha_id, mensalidade_centavos from alunos where mensalidade_centavos is not null;

-- escolinha vem do atleta, e o plano tem de ser da mesma escolinha
create or replace function tg_alunos_cobranca_coerente()
returns trigger
language plpgsql
as $$
begin
  select escolinha_id into new.escolinha_id from alunos where id = new.aluno_id;
  if new.plano_id is not null and not exists (
    select 1 from planos where id = new.plano_id and escolinha_id = new.escolinha_id
  ) then
    raise exception 'Plano não encontrado nesta escolinha.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger alunos_cobranca_coerente
  before insert or update on alunos_cobranca
  for each row execute function tg_alunos_cobranca_coerente();

-- ---------------------------------------------------------------
-- RLS: as três tabelas são só do gestor
-- ---------------------------------------------------------------
alter table config_cobranca enable row level security;
alter table planos          enable row level security;
alter table alunos_cobranca enable row level security;

do $$
declare t text;
begin
  foreach t in array array['config_cobranca', 'planos', 'alunos_cobranca']
  loop
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
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- cobranças: mensalidade (de 1 ou mais meses) ou avulsa
-- A tabela continua se chamando `mensalidades`, mas agora guarda as
-- duas coisas. Só a mensalidade é única por competência.
-- ---------------------------------------------------------------
alter table mensalidades
  add column tipo                 text not null default 'mensalidade'
                                  check (tipo in ('mensalidade', 'avulsa')),
  add column descricao            text check (length(descricao) <= 120),
  add column meses                smallint not null default 1 check (meses between 1 and 12),
  add column desconto_centavos    integer check (desconto_centavos >= 0),
  add column desconto_dias        smallint check (desconto_dias between 0 and 28),
  add column multa_percentual     numeric(5, 2) check (multa_percentual between 0 and 10),
  add column juros_mes_percentual numeric(5, 2) check (juros_mes_percentual between 0 and 10),
  add column valor_pago_centavos  integer check (valor_pago_centavos >= 0);

-- o que já existia foi cobrado sem regra nenhuma
update mensalidades
   set desconto_centavos = 0, desconto_dias = 0, multa_percentual = 0, juros_mes_percentual = 0,
       valor_pago_centavos = case when status = 'paga' then valor_centavos end;

alter table mensalidades
  alter column desconto_centavos    set not null,
  alter column desconto_dias        set not null,
  alter column multa_percentual     set not null,
  alter column juros_mes_percentual set not null;

alter table mensalidades drop constraint if exists mensalidades_aluno_id_competencia_key;
create unique index mensalidades_uma_por_competencia
  on mensalidades (aluno_id, competencia) where tipo = 'mensalidade';

-- Copia as regras da escolinha para a cobrança que está nascendo. Quem
-- inserir já com um valor (a integração, um ajuste à mão) prevalece.
create or replace function tg_mensalidade_regras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c config_cobranca%rowtype;
begin
  select * into c from config_cobranca where escolinha_id = new.escolinha_id;

  new.multa_percentual     := coalesce(new.multa_percentual, c.multa_percentual, 0);
  new.juros_mes_percentual := coalesce(new.juros_mes_percentual, c.juros_mes_percentual, 0);
  new.desconto_dias        := coalesce(new.desconto_dias, c.desconto_dias, 0);

  -- desconto de pontualidade é da mensalidade; avulsa não tem
  if new.desconto_centavos is null then
    new.desconto_centavos := case
      when new.tipo <> 'mensalidade' or coalesce(c.desconto_valor, 0) = 0 then 0
      when c.desconto_tipo = 'fixo' then least(c.desconto_valor::integer, new.valor_centavos)
      else round(new.valor_centavos * c.desconto_valor / 100)::integer
    end;
  end if;

  return new;
end;
$$;

create trigger mensalidade_regras
  before insert on mensalidades
  for each row execute function tg_mensalidade_regras();

-- ---------------------------------------------------------------
-- quanto a cobrança vale numa data
-- Em dia (até X dias antes do vencimento): valor − desconto.
-- Depois do vencimento: valor + multa + juros ao mês, pro rata por dia.
-- É o mesmo cálculo que o Asaas faz.
-- ---------------------------------------------------------------
create or replace function valor_atualizado(m mensalidades, p_data date default current_date)
returns integer
language sql
stable
as $$
  select case
    when m.status = 'paga' then coalesce(m.valor_pago_centavos, m.valor_centavos)
    when m.status <> 'aberta' then m.valor_centavos
    when p_data <= m.vencimento - m.desconto_dias
      then greatest(m.valor_centavos - m.desconto_centavos, 0)
    when p_data <= m.vencimento then m.valor_centavos
    else m.valor_centavos
         + round(m.valor_centavos * m.multa_percentual / 100)::integer
         + round(m.valor_centavos * m.juros_mes_percentual / 100 / 30 * (p_data - m.vencimento))::integer
  end;
$$;

-- ---------------------------------------------------------------
-- geração das mensalidades
-- Todo mês que ainda não está coberto por uma mensalidade abre um ciclo
-- do plano do atleta: sem plano, um mês; trimestral, três. Trocar de
-- plano vale quando o ciclo atual acaba — sem mês de graça, sem cobrar
-- duas vezes.
-- ---------------------------------------------------------------
create or replace function gerar_mensalidades(p_escolinha uuid, p_competencia date default null)
returns integer
language plpgsql
as $$
declare
  v_comp    date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_criadas integer;
begin
  with base as (
    select
      a.id,
      a.escolinha_id,
      a.matriculado_em,
      coalesce(ac.mensalidade_centavos, t.mensalidade_centavos, 0) as mensal,
      coalesce(p.meses, 1)                   as meses,
      coalesce(p.desconto_percentual, 0)     as desc_plano,
      p.nome                                 as plano_nome,
      coalesce(a.dia_vencimento, e.dia_vencimento) as dia,
      coalesce(c.desconto_irmao_percentual, 0)     as desc_irmao,
      -- o irmão mais antigo na escolinha paga cheio; os outros têm desconto
      a.responsavel_id is not null and row_number() over (
        partition by a.responsavel_id order by a.matriculado_em, a.criado_em, a.id
      ) > 1                                  as e_irmao
    from alunos a
    join escolinhas e            on e.id = a.escolinha_id
    left join turmas t           on t.id = a.turma_id
    left join alunos_cobranca ac on ac.aluno_id = a.id
    left join planos p           on p.id = ac.plano_id and p.ativo
    left join config_cobranca c  on c.escolinha_id = a.escolinha_id
    where a.escolinha_id = p_escolinha and a.ativo
  ),
  calc as (
    select
      b.*,
      round(
        b.mensal * b.meses
        * (1 - b.desc_plano / 100.0)
        * (1 - case when b.e_irmao then b.desc_irmao else 0 end / 100.0)
      )::integer as valor
    from base b
    where date_trunc('month', b.matriculado_em) <= v_comp
      and not exists (
        select 1 from mensalidades m
        where m.aluno_id = b.id
          and m.tipo = 'mensalidade'
          and m.competencia <= v_comp
          and (m.competencia + (m.meses - 1) * interval '1 month') >= v_comp
      )
  ),
  novas as (
    insert into mensalidades (
      escolinha_id, aluno_id, competencia, valor_centavos, vencimento, status,
      tipo, meses, descricao
    )
    select
      c.escolinha_id,
      c.id,
      v_comp,
      c.valor,
      v_comp + (c.dia - 1) * interval '1 day',
      case when c.valor = 0 then 'isenta'::status_mensalidade else 'aberta'::status_mensalidade end,
      'mensalidade',
      c.meses,
      nullif(concat_ws(' · ',
        case when c.meses > 1 then c.plano_nome || ' (' || c.meses || ' meses)' end,
        case when c.desc_plano > 0 then '−' || trim_scale(c.desc_plano) || '% do plano' end,
        case when c.e_irmao and c.desc_irmao > 0 then '−' || trim_scale(c.desc_irmao) || '% de irmão' end
      ), '')
    from calc c
    on conflict (aluno_id, competencia) where tipo = 'mensalidade' do nothing
    returning 1
  )
  select count(*) into v_criadas from novas;

  return v_criadas;
end;
$$;

-- ---------------------------------------------------------------
-- taxa de matrícula: uma vez, quando o atleta entra
-- Vale para qualquer caminho de entrada (cadastro na tela, aprovação da
-- ficha do link). Bolsista? O gestor cancela a cobrança na ficha.
-- ---------------------------------------------------------------
create or replace function tg_taxa_matricula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_taxa integer; v_venc date := current_date + 5;
begin
  select taxa_matricula_centavos into v_taxa from config_cobranca where escolinha_id = new.escolinha_id;
  if coalesce(v_taxa, 0) > 0 then
    insert into mensalidades (
      escolinha_id, aluno_id, competencia, valor_centavos, vencimento, tipo, descricao
    )
    values (
      new.escolinha_id, new.id, date_trunc('month', v_venc)::date, v_taxa, v_venc,
      'avulsa', 'Taxa de matrícula'
    );
  end if;
  return new;
end;
$$;

create trigger taxa_matricula
  after insert on alunos
  for each row execute function tg_taxa_matricula();

-- ---------------------------------------------------------------
-- baixa: grava quanto entrou de fato (com desconto ou multa)
-- ---------------------------------------------------------------
drop function if exists registrar_pagamento(uuid, text, date);

create or replace function registrar_pagamento(
  p_mensalidade uuid,
  p_metodo text default 'pix',
  p_data date default null,
  p_valor integer default null
)
returns integer
language plpgsql
as $$
declare
  m       mensalidades%rowtype;
  v_data  date;
  v_valor integer;
begin
  select * into m from mensalidades where id = p_mensalidade;
  if not found then
    raise exception 'Mensalidade não encontrada.' using errcode = 'P0002';
  end if;

  v_data  := coalesce(p_data, current_date);
  v_valor := coalesce(p_valor, valor_atualizado(m, v_data));

  update mensalidades
     set status = 'paga',
         pago_em = v_data,
         metodo = p_metodo,
         valor_pago_centavos = v_valor
   where id = p_mensalidade;

  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria, mensalidade_id)
  select m.escolinha_id,
         case when m.tipo = 'avulsa'
              then coalesce(m.descricao, 'Cobrança') || ' · ' || a.nome
              else 'Mensalidade ' || a.nome || ' · ' || to_char(m.competencia, 'MM/YYYY') end,
         'entrada',
         v_valor,
         v_data,
         case when m.tipo = 'avulsa' then 'Cobrança avulsa' else 'Mensalidade' end,
         m.id
  from alunos a where a.id = m.aluno_id
  on conflict (mensalidade_id) where mensalidade_id is not null do update
    set valor_centavos = excluded.valor_centavos,
        data = excluded.data;

  return v_valor;
end;
$$;

revoke execute on function registrar_pagamento(uuid, text, date, integer) from public, anon;
grant execute on function registrar_pagamento(uuid, text, date, integer) to authenticated;

create or replace function estornar_pagamento(p_mensalidade uuid)
returns void
language plpgsql
as $$
begin
  delete from lancamentos where mensalidade_id = p_mensalidade;
  update mensalidades
     set status = 'aberta', pago_em = null, metodo = null, valor_pago_centavos = null
   where id = p_mensalidade;
end;
$$;

-- ---------------------------------------------------------------
-- views
-- ---------------------------------------------------------------
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
  (select max(l.enviado_em) from lembretes l where l.mensalidade_id = m.id) as ultimo_lembrete,
  m.tipo,
  m.descricao,
  m.meses,
  m.desconto_centavos,
  m.vencimento - m.desconto_dias as desconto_ate,
  m.multa_percentual,
  m.juros_mes_percentual,
  m.valor_pago_centavos,
  valor_atualizado(m) as valor_atualizado_centavos
from mensalidades m
join alunos a            on a.id = m.aluno_id
left join turmas t       on t.id = a.turma_id
left join responsaveis r on r.id = a.responsavel_id;

-- vw_alunos depende da coluna que sai de `alunos`: recria.
drop view vw_alunos;
alter table alunos drop column mensalidade_centavos;

-- O professor não lê alunos_cobranca: para ele o valor é o da turma,
-- que já é público. A mensalidade "do mês" é a que cobre o mês atual —
-- num plano trimestral, a de dois meses atrás ainda vale.
create view vw_alunos with (security_invoker = on) as
select
  a.id,
  a.escolinha_id,
  a.turma_id,
  a.responsavel_id,
  a.nome,
  a.numero,
  a.posicao,
  a.nascimento,
  a.foto_path,
  a.observacoes,
  a.autoriza_imagem,
  a.ativo,
  a.matriculado_em,
  t.nome                as turma_nome,
  t.professor           as turma_professor,
  coalesce(ac.mensalidade_centavos, t.mensalidade_centavos, 0) as valor_centavos,
  coalesce(a.dia_vencimento, e.dia_vencimento)                as dia_vencimento,
  r.nome                as responsavel_nome,
  r.parentesco          as responsavel_parentesco,
  r.telefone            as responsavel_telefone,
  r.email               as responsavel_email,
  coalesce(f.treinos, 0)      as treinos,
  coalesce(f.presencas, 0)    as presencas,
  coalesce(f.faltas, 0)       as faltas,
  coalesce(f.justificadas, 0) as justificadas,
  f.frequencia,
  m.id                  as mensalidade_id,
  m.status              as mensalidade_status,
  m.vencimento          as mensalidade_vencimento,
  case
    when m.status = 'aberta' and m.vencimento < current_date
      then (current_date - m.vencimento)
    else 0
  end                   as dias_atraso,
  ac.mensalidade_centavos as mensalidade_propria_centavos,
  ac.plano_id,
  p.nome                as plano_nome,
  p.meses               as plano_meses
from alunos a
join escolinhas e            on e.id = a.escolinha_id
left join turmas t           on t.id = a.turma_id
left join responsaveis r     on r.id = a.responsavel_id
left join alunos_cobranca ac on ac.aluno_id = a.id
left join planos p           on p.id = ac.plano_id
left join vw_aluno_frequencia f on f.aluno_id = a.id
left join lateral (
  select m.* from mensalidades m
  where m.aluno_id = a.id
    and m.tipo = 'mensalidade'
    and m.competencia <= date_trunc('month', current_date)::date
    and (m.competencia + (m.meses - 1) * interval '1 month') >= date_trunc('month', current_date)
  order by m.competencia desc
  limit 1
) m on true;

grant select on vw_alunos to authenticated;
revoke all on vw_alunos from anon;

-- ---------------------------------------------------------------
-- link de matrícula: os pais veem a taxa antes de mandar a ficha
-- ---------------------------------------------------------------
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
    'taxa_matricula_centavos', coalesce((
      select taxa_matricula_centavos from config_cobranca where escolinha_id = e.id
    ), 0),
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

grant execute on function escolinha_publica(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- painel: "recebido" passa a ser o que entrou de fato
-- ---------------------------------------------------------------
create or replace function painel_resumo(p_escolinha uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_comp date := date_trunc('month', current_date)::date;
  v jsonb;
begin
  select jsonb_build_object(
    'competencia', v_comp,

    'atletas', (select count(*) from alunos where escolinha_id = p_escolinha and ativo),

    'frequencia_media', (
      select round(avg(f.frequencia))::int
      from vw_aluno_frequencia f
      join alunos a on a.id = f.aluno_id
      where a.escolinha_id = p_escolinha and a.ativo and f.frequencia is not null
    ),

    'previsto', coalesce((select sum(valor_centavos) from mensalidades
                          where escolinha_id = p_escolinha and competencia = v_comp
                            and status <> 'cancelada'), 0),
    'recebido', coalesce((select sum(coalesce(valor_pago_centavos, valor_centavos)) from mensalidades
                          where escolinha_id = p_escolinha and competencia = v_comp
                            and status = 'paga'), 0),
    'aberto',   coalesce((select sum(valor_centavos) from mensalidades
                          where escolinha_id = p_escolinha and competencia = v_comp
                            and status = 'aberta'), 0),
    'atrasado', coalesce((select sum(valor_centavos) from mensalidades
                          where escolinha_id = p_escolinha and status = 'aberta'
                            and vencimento < current_date), 0),
    'pagas',    (select count(*) from mensalidades
                 where escolinha_id = p_escolinha and competencia = v_comp and status = 'paga'
                   and tipo = 'mensalidade'),
    'devedores', (select count(distinct aluno_id) from mensalidades
                  where escolinha_id = p_escolinha and status = 'aberta' and vencimento < current_date),

    'entradas_mes', coalesce((select sum(valor_centavos) from lancamentos
                              where escolinha_id = p_escolinha and tipo = 'entrada'
                                and data >= v_comp), 0),
    'saidas_mes',   coalesce((select sum(valor_centavos) from lancamentos
                              where escolinha_id = p_escolinha and tipo = 'saida'
                                and data >= v_comp), 0),

    'pre_matriculas', (select count(*) from pre_matriculas
                       where escolinha_id = p_escolinha and status = 'pendente'),

    -- treinos já passados que ninguém marcou
    'chamadas_pendentes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data desc) from (
        select id, data, hora, turma_nome, elenco
        from vw_treinos
        where escolinha_id = p_escolinha and status = 'agendado' and data <= current_date
        order by data desc limit 5
      ) x
    ), '[]'::jsonb),

    'proximos_treinos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data, x.hora) from (
        select id, data, hora, local, tipo, adversario, turma_nome, elenco
        from vw_treinos
        where escolinha_id = p_escolinha and status = 'agendado' and data >= current_date
        order by data, hora limit 4
      ) x
    ), '[]'::jsonb),

    -- aniversariantes do mês, na ordem do dia
    'aniversariantes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.dia) from (
        select id, nome, numero, turma_nome, nascimento,
               extract(day from nascimento)::int as dia,
               (extract(year from current_date) - extract(year from nascimento))::int as idade
        from vw_alunos
        where escolinha_id = p_escolinha and ativo and nascimento is not null
          and extract(month from nascimento) = extract(month from current_date)
        order by dia limit 6
      ) x
    ), '[]'::jsonb),

    -- atletas com frequência abaixo de 70%
    'frequencia_baixa', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.frequencia) from (
        select id, nome, numero, turma_nome, frequencia
        from vw_alunos
        where escolinha_id = p_escolinha and ativo and frequencia is not null and frequencia < 70
        order by frequencia limit 8
      ) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

-- ---------------------------------------------------------------
-- portal: cobrança avulsa, valor atualizado e até quando vale o desconto
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
            'tipo', m.tipo, 'descricao', m.descricao, 'meses', m.meses,
            'valor_atualizado_centavos', m.valor_atualizado,
            'desconto_centavos', m.desconto_centavos,
            'desconto_ate', m.vencimento - m.desconto_dias,
            'dias_atraso', case when m.status = 'aberta' and m.vencimento < current_date
                                then current_date - m.vencimento else 0 end
          ) order by m.competencia desc)
          from (
            select mm.*, valor_atualizado(mm) as valor_atualizado from mensalidades mm
            where mm.aluno_id = a.id order by mm.competencia desc, mm.criada_em desc limit 8
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
