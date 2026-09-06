-- =============================================================
--  Funções de aplicação (RPC)
--  Salvo onde está anotado, rodam como SECURITY INVOKER: a RLS
--  continua valendo e a função só organiza as operações.
-- =============================================================

-- ---------------------------------------------------------------
-- cadastro: criar a escolinha do usuário recém-registrado
-- ---------------------------------------------------------------
-- SECURITY DEFINER porque no instante da criação o usuário ainda não
-- é membro de nada — não haveria política que permitisse o insert.
create or replace function criar_escolinha(p_nome text, p_cidade text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_turma   record;
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

  -- turmas iniciais, para o painel não nascer vazio
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

  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- numeração de camisa
-- ---------------------------------------------------------------
create or replace function proximo_numero(p_escolinha uuid)
returns smallint
language sql
stable
as $$
  select coalesce(min(n), 1)::smallint
  from generate_series(1, 99) as n
  where not exists (
    select 1 from alunos a
    where a.escolinha_id = p_escolinha and a.ativo and a.numero = n
  );
$$;

-- ---------------------------------------------------------------
-- agenda: materializa treinos a partir da grade semanal das turmas
-- ---------------------------------------------------------------
create or replace function gerar_treinos(p_escolinha uuid, p_de date, p_ate date)
returns integer
language plpgsql
as $$
declare v_criados integer;
begin
  if p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Intervalo inválido para gerar treinos.' using errcode = '22023';
  end if;

  with novos as (
    insert into treinos (escolinha_id, turma_id, data, hora, local)
    select t.escolinha_id, t.id, d::date, h.hora,
           coalesce(h.local, e.local_padrao)
    from turmas t
    join escolinhas e     on e.id = t.escolinha_id
    join turma_horarios h on h.turma_id = t.id
    cross join generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') as d
    where t.escolinha_id = p_escolinha
      and t.ativa
      and extract(dow from d) = h.dia_semana
    on conflict (turma_id, data, hora) do nothing
    returning 1
  )
  select count(*) into v_criados from novos;

  return v_criados;
end;
$$;

-- ---------------------------------------------------------------
-- chamada: grava as marcas e fecha o treino
-- ---------------------------------------------------------------
-- p_marcas: [{"aluno_id": "...", "marca": "P|F|J", "motivo": "..."}]
create or replace function salvar_chamada(p_treino uuid, p_marcas jsonb)
returns integer
language plpgsql
as $$
declare v_total integer;
begin
  if jsonb_typeof(p_marcas) <> 'array' then
    raise exception 'Formato de chamada inválido.' using errcode = '22023';
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

-- ---------------------------------------------------------------
-- financeiro
-- ---------------------------------------------------------------
-- Cria a mensalidade do mês para todo atleta ativo que ainda não tem.
-- Rodar de novo é seguro: só preenche o que falta.
create or replace function gerar_mensalidades(p_escolinha uuid, p_competencia date default null)
returns integer
language plpgsql
as $$
declare
  v_comp    date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_criadas integer;
begin
  with novas as (
    insert into mensalidades (escolinha_id, aluno_id, competencia, valor_centavos, vencimento, status)
    select
      a.escolinha_id,
      a.id,
      v_comp,
      coalesce(a.mensalidade_centavos, t.mensalidade_centavos, 0),
      v_comp + (coalesce(a.dia_vencimento, e.dia_vencimento) - 1) * interval '1 day',
      case when coalesce(a.mensalidade_centavos, t.mensalidade_centavos, 0) = 0
           then 'isenta'::status_mensalidade
           else 'aberta'::status_mensalidade end
    from alunos a
    join escolinhas e  on e.id = a.escolinha_id
    left join turmas t on t.id = a.turma_id
    where a.escolinha_id = p_escolinha
      and a.ativo
      and date_trunc('month', a.matriculado_em) <= v_comp
    on conflict (aluno_id, competencia) do nothing
    returning 1
  )
  select count(*) into v_criadas from novas;

  return v_criadas;
end;
$$;

-- Baixa do pagamento: marca a mensalidade e lança a entrada no caixa,
-- para o financeiro não precisar somar as duas coisas de jeitos diferentes.
create or replace function registrar_pagamento(
  p_mensalidade uuid,
  p_metodo text default 'pix',
  p_data date default null
)
returns void
language plpgsql
as $$
declare m record;
begin
  select * into m from mensalidades where id = p_mensalidade;
  if not found then
    raise exception 'Mensalidade não encontrada.' using errcode = 'P0002';
  end if;

  update mensalidades
     set status = 'paga',
         pago_em = coalesce(p_data, current_date),
         metodo = p_metodo
   where id = p_mensalidade;

  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria, mensalidade_id)
  select m.escolinha_id,
         'Mensalidade ' || a.nome || ' · ' || to_char(m.competencia, 'MM/YYYY'),
         'entrada',
         m.valor_centavos,
         coalesce(p_data, current_date),
         'Mensalidade',
         m.id
  from alunos a where a.id = m.aluno_id
  on conflict (mensalidade_id) where mensalidade_id is not null do update
    set valor_centavos = excluded.valor_centavos,
        data = excluded.data;
end;
$$;

create or replace function estornar_pagamento(p_mensalidade uuid)
returns void
language plpgsql
as $$
begin
  delete from lancamentos where mensalidade_id = p_mensalidade;
  update mensalidades
     set status = 'aberta', pago_em = null, metodo = null
   where id = p_mensalidade;
end;
$$;

-- ---------------------------------------------------------------
-- pré-matrículas vindas do link público
-- ---------------------------------------------------------------
-- Aprovar cria (ou reaproveita) o responsável, cria o atleta e já
-- gera a mensalidade do mês corrente.
create or replace function aprovar_pre_matricula(
  p_id uuid,
  p_turma_id uuid default null,
  p_numero smallint default null
)
returns uuid
language plpgsql
as $$
declare
  pm    record;
  v_resp uuid;
  v_aluno uuid;
  v_turma uuid;
  v_num  smallint;
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

  -- irmãos entram sob o mesmo responsável, casando pelo telefone
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
    nascimento, observacoes, autoriza_imagem
  )
  values (
    pm.escolinha_id, v_turma, v_resp, pm.aluno_nome, v_num, pm.posicao,
    pm.nascimento, pm.observacoes, pm.autoriza_imagem
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

create or replace function recusar_pre_matricula(p_id uuid, p_motivo text default null)
returns void
language plpgsql
as $$
begin
  update pre_matriculas
     set status = 'recusada', motivo_recusa = nullif(btrim(coalesce(p_motivo, '')), ''),
         decidida_em = now(), decidida_por = auth.uid()
   where id = p_id and status = 'pendente';
end;
$$;

-- ---------------------------------------------------------------
-- painel: um resumo só, para a home não fazer seis consultas
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
    'recebido', coalesce((select sum(valor_centavos) from mensalidades
                          where escolinha_id = p_escolinha and competencia = v_comp
                            and status = 'paga'), 0),
    'aberto',   coalesce((select sum(valor_centavos) from mensalidades
                          where escolinha_id = p_escolinha and competencia = v_comp
                            and status = 'aberta'), 0),
    'atrasado', coalesce((select sum(valor_centavos) from mensalidades
                          where escolinha_id = p_escolinha and status = 'aberta'
                            and vencimento < current_date), 0),
    'pagas',    (select count(*) from mensalidades
                 where escolinha_id = p_escolinha and competencia = v_comp and status = 'paga'),
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

-- Mesma regra do arquivo de RLS: tira o grant de PUBLIC e de `anon`, e
-- devolve só a quem está autenticado. As duas funções do link público ficam
-- de fora — elas são liberadas ao anônimo em 20260905090400_publico.sql.
do $$
declare f text;
begin
  foreach f in array array[
    'criar_escolinha(text, text)',
    'proximo_numero(uuid)',
    'gerar_treinos(uuid, date, date)',
    'salvar_chamada(uuid, jsonb)',
    'gerar_mensalidades(uuid, date)',
    'registrar_pagamento(uuid, text, date)',
    'estornar_pagamento(uuid)',
    'aprovar_pre_matricula(uuid, uuid, smallint)',
    'recusar_pre_matricula(uuid, text)',
    'painel_resumo(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
