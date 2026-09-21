-- =============================================================
--  Pagamento pelo Asaas — o pai paga pelo link, a baixa é sozinha
--
--  A escolinha conecta a conta Asaas dela. A cobrança nasce nessa
--  conta, então o dinheiro é dela desde o começo — nada passa pela
--  plataforma. O Asaas não manda e-mail nem SMS para ninguém: quem
--  mostra o boleto, o Pix e o cartão é o link do responsável.
--
--  Quando o pagamento entra, o Asaas chama o webhook e a mensalidade
--  recebe baixa com o valor que realmente caiu. Ninguém confere extrato.
--
--  A chave de API dá acesso amplo à conta da escolinha (dá para
--  transferir dinheiro com ela). Por isso ela mora em `asaas_segredo`,
--  uma tabela com RLS ligada e nenhuma policy: ninguém que entra pela
--  API do app lê, nem o gestor. Só o servidor, com a chave de serviço.
-- =============================================================

create table asaas_conta (
  escolinha_id    uuid primary key references escolinhas (id) on delete cascade,
  ambiente        text not null default 'producao' check (ambiente in ('sandbox', 'producao')),
  -- só para a tela dizer "conectada": ...1234
  chave_final     text not null check (chave_final ~ '^[A-Za-z0-9]{4}$'),
  conta_nome      text,
  conta_email     text,
  wallet_id       text,
  -- identifica a escolinha no webhook, que é o mesmo endereço para todas
  webhook_token   text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  webhook_id      text,
  conectada_em    timestamptz not null default now(),
  ultimo_evento_em timestamptz,
  ultimo_erro     text,
  ultimo_erro_em  timestamptz
);

create table asaas_segredo (
  escolinha_id uuid primary key references escolinhas (id) on delete cascade,
  api_key      text not null,
  atualizada_em timestamptz not null default now()
);

-- Cobrança do Asaas espelhada aqui: uma por mensalidade, criada na hora
-- em que o responsável decide pagar.
create table asaas_cobrancas (
  mensalidade_id uuid primary key references mensalidades (id) on delete cascade,
  escolinha_id   uuid not null references escolinhas (id) on delete cascade,
  asaas_id       text not null unique,
  status         text not null default 'PENDING',
  valor_centavos integer not null check (valor_centavos > 0),
  vencimento     date not null,
  invoice_url    text,
  boleto_url     text,
  pix_payload    text,
  criada_em      timestamptz not null default now(),
  atualizada_em  timestamptz not null default now()
);
create index on asaas_cobrancas (escolinha_id, status);

-- O pagador no Asaas: precisa de nome e CPF, que o portal pede uma vez.
create table responsaveis_cobranca (
  responsavel_id   uuid primary key references responsaveis (id) on delete cascade,
  escolinha_id     uuid not null references escolinhas (id) on delete cascade,
  cpf              text not null check (cpf ~ '^([0-9]{11}|[0-9]{14})$'),
  asaas_customer_id text,
  criado_em        timestamptz not null default now()
);
create index on responsaveis_cobranca (escolinha_id);

-- Webhook: o Asaas reenvia o mesmo evento até receber 200. Guardar o id
-- do evento é o que impede dar baixa duas vezes.
create table asaas_eventos (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid references escolinhas (id) on delete cascade,
  evento_id    text not null unique,
  tipo         text not null,
  payload      jsonb not null,
  recebido_em  timestamptz not null default now(),
  processado_em timestamptz,
  erro         text
);
create index on asaas_eventos (escolinha_id, recebido_em desc);

-- ---------------------------------------------------------------
-- RLS
-- O gestor vê a situação da conexão e as cobranças; a chave e os
-- eventos crus são só do servidor.
-- ---------------------------------------------------------------
alter table asaas_conta            enable row level security;
alter table asaas_segredo          enable row level security;
alter table asaas_cobrancas        enable row level security;
alter table responsaveis_cobranca  enable row level security;
alter table asaas_eventos          enable row level security;

create policy "gestor lê a conexão" on asaas_conta for select to authenticated
  using (e_dono(escolinha_id));
create policy "gestor desconecta" on asaas_conta for delete to authenticated
  using (e_dono(escolinha_id));
grant select, delete on asaas_conta to authenticated;

create policy "gestor lê as cobranças" on asaas_cobrancas for select to authenticated
  using (e_dono(escolinha_id));
grant select on asaas_cobrancas to authenticated;

create policy "gestor lê o cadastro de cobrança" on responsaveis_cobranca for select to authenticated
  using (e_dono(escolinha_id));
grant select on responsaveis_cobranca to authenticated;

-- asaas_segredo e asaas_eventos ficam sem policy: nem o gestor lê
revoke all on asaas_segredo, asaas_eventos from authenticated, anon;

-- ---------------------------------------------------------------
-- o portal e as telas precisam saber se dá para pagar por aqui
-- ---------------------------------------------------------------
create or replace function escolinha_aceita_online(p_escolinha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from asaas_conta where escolinha_id = p_escolinha); $$;
grant execute on function escolinha_aceita_online(uuid) to anon, authenticated;

-- ---------------------------------------------------------------
-- baixa vinda do webhook
-- Roda como dona da função (o webhook não tem usuário logado) e é
-- idempotente: pagar de novo o que já está pago não duplica lançamento.
-- ---------------------------------------------------------------
create or replace function asaas_dar_baixa(
  p_asaas_id text,
  p_valor_centavos integer,
  p_data date,
  p_metodo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare c asaas_cobrancas%rowtype; m mensalidades%rowtype;
begin
  select * into c from asaas_cobrancas where asaas_id = p_asaas_id;
  if not found then
    return null;
  end if;

  select * into m from mensalidades where id = c.mensalidade_id;
  if not found then
    return null;
  end if;

  update asaas_cobrancas
     set status = 'RECEIVED', atualizada_em = now()
   where mensalidade_id = c.mensalidade_id;

  if m.status = 'paga' then
    return m.id;
  end if;

  perform registrar_pagamento(m.id, coalesce(p_metodo, 'asaas'), p_data, p_valor_centavos);
  return m.id;
end;
$$;

-- Estorno, chargeback ou cobrança apagada: a mensalidade volta a ficar
-- em aberto, e o lançamento do caixa sai junto.
create or replace function asaas_desfazer_baixa(p_asaas_id text, p_status text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare c asaas_cobrancas%rowtype;
begin
  select * into c from asaas_cobrancas where asaas_id = p_asaas_id;
  if not found then
    return null;
  end if;

  update asaas_cobrancas set status = p_status, atualizada_em = now()
   where mensalidade_id = c.mensalidade_id;

  perform estornar_pagamento(c.mensalidade_id);
  return c.mensalidade_id;
end;
$$;

revoke execute on function
  asaas_dar_baixa(text, integer, date, text), asaas_desfazer_baixa(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------
-- portal: diz se o pagamento online está ligado
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
      select jsonb_build_object(
        'nome', e.nome, 'cidade', e.cidade, 'chave_pix', e.chave_pix,
        'razao_social', e.razao_social, 'documento', e.documento,
        -- com a conta conectada, o link mostra boleto, Pix e cartão
        'aceita_online', escolinha_aceita_online(e.id)
      )
      from escolinhas e where e.id = r.escolinha_id
    ),
    'filhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'nome', a.nome,
        -- null quando a escolinha não pede contrato
        'contrato', case
          when (contrato_vigente(r.escolinha_id)).id is null then null
          else coalesce(
            (select jsonb_build_object('status', 'assinado', 'aceito_em', ca.aceito_em)
               from contratos_aceites ca where ca.aluno_id = a.id order by ca.aceito_em desc limit 1),
            jsonb_build_object('status', 'pendente')
          )
        end,
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
            'avisado_em', m.avisado_em, 'metodo', m.metodo,
            'valor_pago_centavos', m.valor_pago_centavos,
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
