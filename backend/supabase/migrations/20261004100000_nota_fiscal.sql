-- =============================================================
--  Nota fiscal de serviço (NFS-e)
--
--  Quem decide é a escolinha, não a plataforma: com CNPJ e a parte
--  municipal resolvida, ela emite; sem CNPJ, nunca vê o assunto. Isso
--  desfaz a pergunta impossível de responder por todo mundo de uma vez
--  — "escolinha de futebol emite nota?" —, que é o que manteve este
--  item parado.
--
--  A emissão vai pelo Asaas, com a chave que a escolinha já conectou.
--  O município não entra no pedido: ele vem da configuração fiscal da
--  conta, lá no Asaas.
--
--  Nasce manual. Nota errada é pior que nota nenhuma: dá trabalho para
--  cancelar e pode gerar imposto indevido. Depois da primeira sair
--  certa, a escolinha liga o automático se quiser.
-- =============================================================

-- ---------------------------------------------------------------
-- a configuração fiscal da escolinha
--
-- Os códigos da reforma tributária (NBS, situação, classificação,
-- indicador de operação) são guardados como texto solto de propósito:
-- a lista válida vive no Asaas e muda, então quem escolhe é o gestor
-- numa lista buscada na hora. Fixar um enum aqui seria garantir que
-- ele envelhece.
-- ---------------------------------------------------------------
create table config_fiscal (
  escolinha_id       uuid primary key references escolinhas (id) on delete cascade,

  -- desligado até o gestor concluir a configuração e emitir a primeira
  ativo              boolean not null default false,
  -- só depois da primeira nota autorizada é que isso pode ser ligado
  emissao_automatica boolean not null default false,

  -- o serviço municipal: por id quando a prefeitura publica a lista,
  -- por código quando não publica (é o caso de quem emite pelo
  -- Portal Nacional)
  servico_id         text,
  servico_codigo     text,
  servico_nome       text,

  descricao_servico  text not null default 'Mensalidade de escolinha de futebol',

  -- impostos
  iss_percentual     numeric(5, 2) not null default 0 check (iss_percentual between 0 and 10),
  retem_iss          boolean not null default false,

  -- reforma tributária: obrigatórios para serviços em geral desde
  -- 01/10/2026, e para o Simples Nacional a partir de 01/01/2027 —
  -- que é o caso da maioria das escolinhas
  nbs_codigo         text,
  situacao_tributaria text,
  classificacao_tributaria text,
  indicador_operacao text,

  ultimo_erro        text,
  ultimo_erro_em     timestamptz,
  configurado_em     timestamptz,
  atualizado_em      timestamptz not null default now(),

  -- ligar exige ter escolhido o serviço: sem ele a prefeitura recusa
  check (not ativo or (servico_nome is not null and (servico_id is not null or servico_codigo is not null)))
);

-- ---------------------------------------------------------------
-- as notas, espelhadas daqui
-- Uma por mensalidade. O fluxo do Asaas é
-- criada → sincronizada → autorizada, e só no fim vêm número, PDF e
-- XML; por isso quase tudo é nulo no começo.
-- ---------------------------------------------------------------
create table notas_fiscais (
  mensalidade_id  uuid primary key references mensalidades (id) on delete cascade,
  escolinha_id    uuid not null references escolinhas (id) on delete cascade,
  asaas_id        text not null unique,
  status          text not null default 'SCHEDULED',
  numero          text,
  codigo_verificacao text,
  pdf_url         text,
  xml_url         text,
  valor_centavos  integer not null check (valor_centavos > 0),
  erro            text,
  emitida_por     uuid references perfis (id) on delete set null,
  criada_em       timestamptz not null default now(),
  atualizada_em   timestamptz not null default now()
);
create index on notas_fiscais (escolinha_id, status);

alter table config_fiscal  enable row level security;
alter table notas_fiscais  enable row level security;

-- Nota fiscal é assunto de gestor: carrega valor e dado fiscal da
-- escolinha, que o professor não vê em lugar nenhum.
do $$
declare t text;
begin
  foreach t in array array['config_fiscal', 'notas_fiscais']
  loop
    execute format(
      'create policy "gestor lê %1$s" on %1$I for select to authenticated using (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor edita %1$s" on %1$I for update to authenticated'
      ' using (e_dono(escolinha_id)) with check (e_dono(escolinha_id))', t);
    execute format('grant select, update on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- Criar linha é coisa das funções do servidor, não da tela: a de
-- config nasce junto com a escolinha, e a de nota nasce da emissão.
create or replace function tg_config_fiscal_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into config_fiscal (escolinha_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger config_fiscal_inicial
  after insert on escolinhas
  for each row execute function tg_config_fiscal_inicial();

insert into config_fiscal (escolinha_id)
select id from escolinhas on conflict do nothing;

-- ---------------------------------------------------------------
-- o portão
-- Três condições, e a tela usa esta função em vez de reimplementá-las:
-- CNPJ (14 dígitos), conta Asaas conectada e configuração concluída.
-- ---------------------------------------------------------------
create or replace function escolinha_emite_nota(p_escolinha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from escolinhas e
    join config_fiscal c on c.escolinha_id = e.id
    where e.id = p_escolinha
      and p_escolinha in (select escolinhas_do_usuario())
      and length(coalesce(e.documento, '')) = 14      -- CNPJ, não CPF
      and c.ativo
      and exists (select 1 from asaas_conta a where a.escolinha_id = e.id)
  );
$$;
revoke execute on function escolinha_emite_nota(uuid) from public, anon;
grant execute on function escolinha_emite_nota(uuid) to authenticated;

-- ---------------------------------------------------------------
-- o que a tela de Ajustes precisa saber para se desenhar
-- Devolve o motivo de não poder emitir, em vez de só `false`: é a
-- diferença entre a tela explicar o que falta e virar mistério.
-- ---------------------------------------------------------------
create or replace function situacao_fiscal(p_escolinha uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tem_cnpj',   length(coalesce(e.documento, '')) = 14,
    'tem_asaas',  exists (select 1 from asaas_conta a where a.escolinha_id = e.id),
    'configurado', c.configurado_em is not null,
    'ativo',      c.ativo,
    'automatico', c.emissao_automatica,
    'emitidas',   (select count(*) from notas_fiscais n
                    where n.escolinha_id = e.id and n.status = 'AUTHORIZED'),
    'ultimo_erro', c.ultimo_erro
  )
  from escolinhas e
  join config_fiscal c on c.escolinha_id = e.id
  where e.id = p_escolinha
    and p_escolinha in (select escolinhas_do_usuario());
$$;
revoke execute on function situacao_fiscal(uuid) from public, anon;
grant execute on function situacao_fiscal(uuid) to authenticated;

-- ---------------------------------------------------------------
-- o webhook escreve por aqui
-- Mesmo desenho de asaas_dar_baixa: fechada para todo mundo, chamada
-- só pela Edge Function com a chave de serviço.
-- ---------------------------------------------------------------
create or replace function nf_atualizar(
  p_asaas_id text,
  p_status   text,
  p_numero   text default null,
  p_pdf      text default null,
  p_xml      text default null,
  p_codigo   text default null,
  p_erro     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_mensalidade uuid;
begin
  update notas_fiscais
     set status = p_status,
         numero = coalesce(p_numero, numero),
         pdf_url = coalesce(p_pdf, pdf_url),
         xml_url = coalesce(p_xml, xml_url),
         codigo_verificacao = coalesce(p_codigo, codigo_verificacao),
         -- erro novo substitui; sucesso limpa o antigo
         erro = case when p_status = 'ERROR' then p_erro else null end,
         atualizada_em = now()
   where asaas_id = p_asaas_id
  returning mensalidade_id into v_mensalidade;

  return v_mensalidade;
end;
$$;
revoke execute on function nf_atualizar(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------
-- a ficha e a tela de cobranças mostram a nota junto da mensalidade
-- ---------------------------------------------------------------
create or replace view vw_notas_fiscais with (security_invoker = on) as
select
  n.*,
  m.competencia,
  m.vencimento,
  a.nome as aluno_nome
from notas_fiscais n
join mensalidades m on m.id = n.mensalidade_id
join alunos a       on a.id = m.aluno_id;

grant select on vw_notas_fiscais to authenticated;
revoke all on vw_notas_fiscais from anon;

-- Função nova no Supabase nasce com EXECUTE para anon: a varredura de
-- 20260924110000 rodou uma vez e não alcança o que vem depois dela.
-- Os revokes acima são o que fecha estas.
