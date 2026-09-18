-- =============================================================
--  Contas a pagar e a receber
--
--  O caixa só registrava o que já tinha acontecido. Agora um lançamento
--  pode nascer pendente, com vencimento: o aluguel do campo que vence
--  dia 10, o patrocínio que entra no fim do mês. Enquanto não é pago,
--  ele não conta no caixa — só na lista de contas e no aviso do painel.
--
--  Conta que se repete (aluguel, salário do auxiliar) é marcada como
--  recorrente: ao pagar, a do mês seguinte já nasce pendente.
--
--  `data` continua sendo a data do caixa: a do pagamento quando pago, e
--  igual ao vencimento enquanto pendente.
-- =============================================================

alter table lancamentos
  add column pago       boolean not null default true,
  add column vencimento date,
  add column recorrente boolean not null default false;

alter table lancamentos
  add constraint lancamentos_pendente_tem_vencimento check (pago or vencimento is not null);

create index lancamentos_pendentes on lancamentos (escolinha_id, vencimento) where not pago;

create or replace function pagar_conta(
  p_lancamento uuid,
  p_data date default null,
  p_valor integer default null
)
returns uuid
language plpgsql
as $$
declare
  l       lancamentos%rowtype;
  v_prox  date;
  v_nova  uuid;
begin
  select * into l from lancamentos where id = p_lancamento;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  if l.pago then
    raise exception 'Esta conta já foi paga.' using errcode = '22023';
  end if;

  update lancamentos
     set pago = true,
         data = coalesce(p_data, current_date),
         valor_centavos = coalesce(p_valor, valor_centavos)
   where id = p_lancamento;

  -- a próxima nasce com o valor combinado, não com o que foi pago desta vez
  if l.recorrente then
    v_prox := (l.vencimento + interval '1 month')::date;
    insert into lancamentos (
      escolinha_id, descricao, tipo, valor_centavos, data, categoria, pago, vencimento, recorrente
    )
    values (
      l.escolinha_id, l.descricao, l.tipo, l.valor_centavos, v_prox, l.categoria, false, v_prox, true
    )
    returning id into v_nova;
  end if;

  return v_nova;
end;
$$;

revoke execute on function pagar_conta(uuid, date, integer) from public, anon;
grant execute on function pagar_conta(uuid, date, integer) to authenticated;

-- painel: caixa só com o que foi pago, e o aviso das contas
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
                                and pago and data >= v_comp), 0),
    'saidas_mes',   coalesce((select sum(valor_centavos) from lancamentos
                              where escolinha_id = p_escolinha and tipo = 'saida'
                                and pago and data >= v_comp), 0),

    -- contas combinadas que ainda não foram pagas ou recebidas
    'contas_vencidas', (select count(*) from lancamentos
                        where escolinha_id = p_escolinha and not pago and vencimento < current_date),
    'contas_semana',   (select count(*) from lancamentos
                        where escolinha_id = p_escolinha and not pago
                          and vencimento between current_date and current_date + 7),

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
