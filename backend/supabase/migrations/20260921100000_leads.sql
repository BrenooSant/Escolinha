-- =============================================================
--  CRM de leads
--
--  Funil de quem ainda não é aluno:
--    novo → em contato → aula experimental → ficha enviada → matriculado
--  e, de qualquer ponto, perdido (com o motivo).
--
--  Um lead nasce de três jeitos:
--    · à mão, pelo gestor (ligou, chamou no Instagram, foi indicado);
--    · pelo formulário público "quero uma aula experimental", curto,
--      para a bio do Instagram — registrar_interesse();
--    · pela ficha do link de matrícula: quem manda a ficha entra (ou
--      avança) no funil sozinho, e aprovar ou recusar a ficha fecha o lead.
--
--  É informação comercial: só o gestor lê e mexe.
-- =============================================================

create table leads (
  id               uuid primary key default gen_random_uuid(),
  escolinha_id     uuid not null references escolinhas (id) on delete cascade,
  aluno_nome       text not null check (length(btrim(aluno_nome)) between 2 and 80),
  nascimento       date,
  resp_nome        text check (length(resp_nome) <= 80),
  telefone         text not null check (length(regexp_replace(telefone, '\D', '', 'g')) >= 10),
  email            text check (length(email) <= 120),
  origem           text not null default 'outro'
                   check (origem in ('instagram', 'whatsapp', 'indicacao', 'formulario',
                                     'link_matricula', 'evento', 'passou_na_frente', 'outro')),
  etapa            text not null default 'novo'
                   check (etapa in ('novo', 'contato', 'experimental', 'ficha', 'matriculado', 'perdido')),
  turma_id         uuid references turmas (id) on delete set null,
  aula_em          timestamptz,
  proximo_contato  date,
  motivo_perda     text check (length(motivo_perda) <= 200),
  observacoes      text check (length(observacoes) <= 500),
  pre_matricula_id uuid references pre_matriculas (id) on delete set null,
  aluno_id         uuid references alunos (id) on delete set null,
  criado_em        timestamptz not null default now(),
  etapa_em         timestamptz not null default now()
);
create index on leads (escolinha_id, etapa, criado_em desc);
create index on leads (escolinha_id, proximo_contato) where etapa not in ('matriculado', 'perdido');

-- histórico: anotação de quem atende e as mudanças de etapa
create table leads_notas (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads (id) on delete cascade,
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  texto        text not null check (length(btrim(texto)) between 1 and 1000),
  sistema      boolean not null default false,
  autor        uuid references perfis (id) on delete set null default auth.uid(),
  criado_em    timestamptz not null default now()
);
create index on leads_notas (lead_id, criado_em desc);

create or replace function tg_nota_mesma_escolinha()
returns trigger
language plpgsql
as $$
begin
  select escolinha_id into new.escolinha_id from leads where id = new.lead_id;
  return new;
end;
$$;
create trigger nota_mesma_escolinha
  before insert on leads_notas
  for each row execute function tg_nota_mesma_escolinha();

-- toda troca de etapa fica no histórico, com a data
create or replace function tg_lead_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare rotulo text;
begin
  if new.etapa is distinct from old.etapa then
    new.etapa_em := now();
    rotulo := case new.etapa
      when 'novo' then 'Novo'
      when 'contato' then 'Em contato'
      when 'experimental' then 'Aula experimental'
      when 'ficha' then 'Ficha enviada'
      when 'matriculado' then 'Matriculado'
      when 'perdido' then 'Perdido' || coalesce(' — ' || new.motivo_perda, '')
    end;
    insert into leads_notas (lead_id, escolinha_id, texto, sistema)
    values (new.id, new.escolinha_id, 'Etapa: ' || rotulo, true);
  end if;
  -- saiu de perdido: o motivo não vale mais
  if new.etapa <> 'perdido' then
    new.motivo_perda := null;
  end if;
  return new;
end;
$$;
create trigger lead_etapa
  before update on leads
  for each row execute function tg_lead_etapa();

alter table leads       enable row level security;
alter table leads_notas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['leads', 'leads_notas']
  loop
    execute format(
      'create policy "gestor lê %1$s" on %1$I for select to authenticated using (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor cria %1$s" on %1$I for insert to authenticated with check (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor edita %1$s" on %1$I for update to authenticated'
      ' using (e_dono(escolinha_id)) with check (e_dono(escolinha_id))', t);
    execute format(
      'create policy "gestor apaga %1$s" on %1$I for delete to authenticated using (e_dono(escolinha_id))', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- a ficha do link move o funil
-- Casa pelo telefone (só dígitos) e pelo nome do atleta: é o mesmo
-- critério que a matrícula usa para não duplicar ficha.
-- ---------------------------------------------------------------
create or replace function lead_aberto(p_escolinha uuid, p_telefone text, p_aluno text)
returns uuid
language sql
stable
set search_path = public
as $$
  select id from leads
  where escolinha_id = p_escolinha
    and regexp_replace(telefone, '\D', '', 'g') = regexp_replace(p_telefone, '\D', '', 'g')
    and lower(btrim(aluno_nome)) = lower(btrim(p_aluno))
    and etapa not in ('matriculado', 'perdido')
  order by criado_em desc
  limit 1;
$$;

create or replace function tg_ficha_vira_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_lead uuid;
begin
  v_lead := lead_aberto(new.escolinha_id, new.resp_telefone, new.aluno_nome);
  if v_lead is null then
    insert into leads (
      escolinha_id, aluno_nome, nascimento, resp_nome, telefone, email, origem, etapa,
      turma_id, pre_matricula_id
    )
    values (
      new.escolinha_id, new.aluno_nome, new.nascimento, new.resp_nome, new.resp_telefone,
      new.resp_email, 'link_matricula', 'ficha', new.turma_id, new.id
    );
  else
    update leads
       set etapa = 'ficha', pre_matricula_id = new.id,
           nascimento = coalesce(nascimento, new.nascimento),
           turma_id = coalesce(new.turma_id, turma_id)
     where id = v_lead;
  end if;
  return new;
end;
$$;
create trigger ficha_vira_lead
  after insert on pre_matriculas
  for each row execute function tg_ficha_vira_lead();

create or replace function tg_ficha_decidida_fecha_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'aprovada' then
    update leads set etapa = 'matriculado', aluno_id = new.aluno_id, proximo_contato = null
     where pre_matricula_id = new.id;
  elsif new.status = 'recusada' then
    update leads
       set etapa = 'perdido', proximo_contato = null,
           motivo_perda = coalesce(new.motivo_recusa, 'Ficha recusada')
     where pre_matricula_id = new.id;
  end if;
  return new;
end;
$$;
create trigger ficha_decidida_fecha_lead
  after update of status on pre_matriculas
  for each row execute function tg_ficha_decidida_fecha_lead();

-- ---------------------------------------------------------------
-- formulário público "quero uma aula experimental"
-- Mesmo código do link de matrícula. Quem já está no funil não vira
-- lead duplicado: ganha uma anotação.
-- ---------------------------------------------------------------
create or replace function registrar_interesse(p_codigo text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e       escolinhas%rowtype;
  v_nome  text := btrim(coalesce(p_dados ->> 'aluno_nome', ''));
  v_resp  text := nullif(btrim(coalesce(p_dados ->> 'resp_nome', '')), '');
  v_tel   text := btrim(coalesce(p_dados ->> 'telefone', ''));
  v_obs   text := nullif(left(btrim(coalesce(p_dados ->> 'observacoes', '')), 500), '');
  v_lead  uuid;
  v_novos integer;
begin
  select * into e from escolinhas
   where codigo_matricula = upper(btrim(coalesce(p_codigo, ''))) and matriculas_abertas;
  if not found then
    raise exception 'Link inválido ou encerrado.' using errcode = 'P0002';
  end if;
  if length(v_nome) < 2 then
    raise exception 'Informe o nome da criança.' using errcode = '22023';
  end if;
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then
    raise exception 'Informe um WhatsApp com DDD.' using errcode = '22023';
  end if;

  select count(*) into v_novos from leads
   where escolinha_id = e.id and origem = 'formulario' and criado_em > now() - interval '1 hour';
  if v_novos >= 40 then
    raise exception 'Muitos pedidos agora há pouco. Tente de novo em instantes.' using errcode = '53400';
  end if;

  v_lead := lead_aberto(e.id, v_tel, v_nome);
  if v_lead is not null then
    insert into leads_notas (lead_id, escolinha_id, texto, sistema)
    values (v_lead, e.id, 'Pediu aula experimental de novo pelo formulário' || coalesce(': ' || v_obs, ''), true);
    return jsonb_build_object('ok', true, 'escolinha', e.nome);
  end if;

  insert into leads (
    escolinha_id, aluno_nome, nascimento, resp_nome, telefone, origem, etapa, turma_id,
    observacoes, proximo_contato
  )
  values (
    e.id, left(v_nome, 80), nullif(p_dados ->> 'nascimento', '')::date, left(v_resp, 80),
    left(v_tel, 30), 'formulario', 'novo',
    (select t.id from turmas t
      where t.id = nullif(p_dados ->> 'turma_id', '')::uuid and t.escolinha_id = e.id and t.ativa),
    v_obs, current_date
  );

  return jsonb_build_object('ok', true, 'escolinha', e.nome);
end;
$$;
grant execute on function registrar_interesse(text, jsonb) to anon, authenticated;
revoke execute on function lead_aberto(uuid, text, text) from public, anon;

-- painel: avisos do funil
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

    -- funil: quem espera retorno e quem vem para a aula experimental hoje
    'leads_retorno', (select count(*) from leads
                      where escolinha_id = p_escolinha and etapa not in ('matriculado', 'perdido')
                        and proximo_contato <= current_date),
    'aulas_experimentais_hoje', (select count(*) from leads
                      where escolinha_id = p_escolinha and etapa = 'experimental'
                        and (aula_em at time zone 'America/Sao_Paulo')::date
                            = (now() at time zone 'America/Sao_Paulo')::date),

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
