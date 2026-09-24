-- =============================================================
--  Espinha de mensagens
--  Lembrete de pagamento e parabéns de aniversário são a mesma coisa
--  com texto diferente: escolher quem recebe hoje, montar o texto e
--  registrar o que saiu. Feitos separados, seriam dois agendamentos,
--  dois históricos e dois lugares para errar.
--
--  O que o banco faz é escolher e redigir. Quem envia, por enquanto, é
--  o gestor: o WhatsApp não tem envio automático sem a Cloud API da
--  Meta, que exige conta verificada e modelo aprovado. A fila já nasce
--  pronta para isso — `canal` existe desde agora, e quando o envio
--  automático entrar, nada aqui muda de forma.
--
--  Tudo nasce desligado, como o resto.
-- =============================================================

-- ---------------------------------------------------------------
-- modelos: um por tipo, por escolinha
-- `dias` quer dizer coisas diferentes em cada tipo, e é de propósito:
-- quantos dias ANTES do vencimento avisar, quantos DEPOIS cobrar. No
-- aniversário não é usado.
-- ---------------------------------------------------------------
create table modelos_mensagem (
  escolinha_id  uuid not null references escolinhas (id) on delete cascade,
  tipo          text not null check (tipo in ('lembrete_vencendo', 'lembrete_atrasado', 'aniversario')),
  ativo         boolean not null default false,
  dias          smallint not null default 3 check (dias between 0 and 60),
  texto         text not null check (length(btrim(texto)) >= 10),
  atualizado_em timestamptz not null default now(),
  primary key (escolinha_id, tipo)
);

-- ---------------------------------------------------------------
-- a fila do dia
-- Uma linha por mensagem que deveria sair hoje. Fica pendente até o
-- gestor mandar ou dispensar, e o texto é gravado junto: mudar o
-- modelo amanhã não reescreve o que já estava na fila, pela mesma
-- razão que mudar a multa não altera cobrança antiga.
-- ---------------------------------------------------------------
create table fila_mensagens (
  id             uuid primary key default gen_random_uuid(),
  escolinha_id   uuid not null references escolinhas (id) on delete cascade,
  tipo           text not null check (tipo in ('lembrete_vencendo', 'lembrete_atrasado', 'aniversario')),
  aluno_id       uuid references alunos (id) on delete cascade,
  responsavel_id uuid references responsaveis (id) on delete set null,
  mensalidade_id uuid references mensalidades (id) on delete cascade,
  telefone       text,
  texto          text not null,
  status         text not null default 'pendente'
    check (status in ('pendente', 'enviada', 'dispensada')),
  canal          text not null default 'whatsapp',
  agendada_para  date not null default current_date,
  enviada_em     timestamptz,
  enviado_por    uuid references perfis (id) on delete set null,
  criado_em      timestamptz not null default now()
);

-- Rodar a rotina duas vezes no mesmo dia não pode duplicar a mensagem.
-- A chave é o que a mensagem é sobre: a mensalidade no lembrete, o
-- atleta no aniversário.
create unique index fila_sem_repetir on fila_mensagens
  (tipo, agendada_para, coalesce(mensalidade_id, aluno_id));
create index on fila_mensagens (escolinha_id, status, agendada_para desc);

-- ---------------------------------------------------------------
-- RLS: mensagem é assunto de gestor
-- Ela carrega valor de mensalidade e telefone de responsável — as duas
-- coisas que o professor não vê em lugar nenhum.
-- ---------------------------------------------------------------
alter table modelos_mensagem enable row level security;
alter table fila_mensagens   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['modelos_mensagem', 'fila_mensagens']
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
-- modelos padrão
-- Vêm escritos para o gestor revisar, não para usar no escuro: é mais
-- fácil corrigir um texto pronto que encarar uma caixa vazia.
-- ---------------------------------------------------------------
create or replace function modelos_mensagem_padrao(p_escolinha uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into modelos_mensagem (escolinha_id, tipo, dias, texto) values
    (p_escolinha, 'lembrete_vencendo', 3,
$t$Olá, {{responsavel}}! Aqui é da {{escolinha}} ⚽

Passando para lembrar que a mensalidade do(a) {{aluno}} vence em {{vencimento}}.

Valor: {{valor}}
{{pix}}
Dá para ver tudo e pagar por aqui: {{link}}

Qualquer dúvida é só chamar!$t$),
    (p_escolinha, 'lembrete_atrasado', 5,
$t$Olá, {{responsavel}}! Aqui é da {{escolinha}} ⚽

A mensalidade do(a) {{aluno}} venceu em {{vencimento}} e está com {{dias_atraso}} de atraso.

Valor atualizado: {{valor}}
{{pix}}
Veja e pague por aqui: {{link}}

Se este mês apertou, chama a gente que conversamos e parcelamos.$t$),
    (p_escolinha, 'aniversario', 0,
$t$Parabéns, {{aluno}}! 🎉⚽

Hoje é o seu dia, e todo mundo aqui na {{escolinha}} está torcendo por você. Que venha mais um ano de muitos gols!

Um abraço de todos do {{turma}}.$t$)
  on conflict do nothing;
$$;

create or replace function tg_modelos_mensagem_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform modelos_mensagem_padrao(new.id);
  return new;
end;
$$;

create trigger modelos_mensagem_inicial
  after insert on escolinhas
  for each row execute function tg_modelos_mensagem_inicial();

-- quem já existe também ganha os modelos, desligados
do $$
declare e uuid;
begin
  for e in select id from escolinhas loop
    perform modelos_mensagem_padrao(e);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- render
-- {{link}} fica de fora de propósito: o endereço do site não mora no
-- banco. Quem troca é a tela, que conhece o domínio e o token.
-- ---------------------------------------------------------------
create or replace function primeiro_nome(p text)
returns text
language sql
immutable
as $$
  select nullif(split_part(btrim(coalesce(p, '')), ' ', 1), '');
$$;

create or replace function render_mensagem(p_texto text, p_dados jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v    text := p_texto;
  dias integer := coalesce((p_dados ->> 'dias_atraso')::integer, 0);
  pix  text := nullif(btrim(coalesce(p_dados ->> 'pix', '')), '');
begin
  v := replace(v, '{{aluno}}',       coalesce(primeiro_nome(p_dados ->> 'aluno'), 'o atleta'));
  v := replace(v, '{{responsavel}}', coalesce(primeiro_nome(p_dados ->> 'responsavel'), 'tudo bem'));
  v := replace(v, '{{escolinha}}',   coalesce(nullif(p_dados ->> 'escolinha', ''), 'escolinha'));
  v := replace(v, '{{turma}}',       coalesce(nullif(p_dados ->> 'turma', ''), 'time'));
  v := replace(v, '{{valor}}',
    coalesce(formatar_brl((p_dados ->> 'valor_centavos')::integer), 'a combinar'));
  v := replace(v, '{{vencimento}}',
    coalesce(to_char(nullif(p_dados ->> 'vencimento', '')::date, 'DD/MM/YYYY'), '—'));
  v := replace(v, '{{dias_atraso}}', dias || ' dia' || case when dias = 1 then '' else 's' end);
  -- sem chave PIX cadastrada a linha inteira some, em vez de sobrar um
  -- "PIX:" pelado no meio da mensagem
  v := replace(v, '{{pix}}' || chr(10), case when pix is null then '' else 'PIX: ' || pix || chr(10) end);
  v := replace(v, '{{pix}}',           coalesce('PIX: ' || pix, ''));
  return v;
end;
$$;

-- ---------------------------------------------------------------
-- montar a fila
-- Cada tipo dispara num dia exato — vence daqui a N, atrasou há N,
-- faz aniversário hoje. É o que faz a rotina ser idempotente sem
-- precisar lembrar do que já mandou.
-- ---------------------------------------------------------------
create or replace function montar_fila(p_escolinha uuid, p_data date default current_date)
returns integer
language plpgsql
as $$
declare
  v_esc    escolinhas%rowtype;
  v_modelo modelos_mensagem%rowtype;
  v_total  integer := 0;
  v_n      integer;
begin
  select * into v_esc from escolinhas where id = p_escolinha;
  if not found then
    return 0;
  end if;

  -- a vencer
  select * into v_modelo from modelos_mensagem
   where escolinha_id = p_escolinha and tipo = 'lembrete_vencendo' and ativo;
  if found then
    insert into fila_mensagens
      (escolinha_id, tipo, aluno_id, responsavel_id, mensalidade_id, telefone, texto, agendada_para)
    select
      m.escolinha_id, 'lembrete_vencendo', m.aluno_id, a.responsavel_id, m.id, m.responsavel_telefone,
      render_mensagem(v_modelo.texto, jsonb_build_object(
        'aluno', m.aluno_nome, 'responsavel', m.responsavel_nome, 'escolinha', v_esc.nome,
        'turma', m.turma_nome, 'valor_centavos', m.valor_atualizado_centavos,
        'vencimento', m.vencimento, 'dias_atraso', 0, 'pix', v_esc.chave_pix)),
      p_data
    from vw_mensalidades m
    join alunos a on a.id = m.aluno_id
    where m.escolinha_id = p_escolinha
      and m.status = 'aberta'
      and m.vencimento = p_data + v_modelo.dias
      and a.ativo
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- atrasada
  select * into v_modelo from modelos_mensagem
   where escolinha_id = p_escolinha and tipo = 'lembrete_atrasado' and ativo;
  if found then
    insert into fila_mensagens
      (escolinha_id, tipo, aluno_id, responsavel_id, mensalidade_id, telefone, texto, agendada_para)
    select
      m.escolinha_id, 'lembrete_atrasado', m.aluno_id, a.responsavel_id, m.id, m.responsavel_telefone,
      render_mensagem(v_modelo.texto, jsonb_build_object(
        'aluno', m.aluno_nome, 'responsavel', m.responsavel_nome, 'escolinha', v_esc.nome,
        'turma', m.turma_nome, 'valor_centavos', m.valor_atualizado_centavos,
        'vencimento', m.vencimento, 'dias_atraso', p_data - m.vencimento, 'pix', v_esc.chave_pix)),
      p_data
    from vw_mensalidades m
    join alunos a on a.id = m.aluno_id
    where m.escolinha_id = p_escolinha
      and m.status = 'aberta'
      and m.vencimento = p_data - v_modelo.dias
      and a.ativo
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- aniversário
  -- Quem está devendo a ponto de ser bloqueado fica de fora: parabéns
  -- e cobrança no mesmo dia queima a escolinha com o responsável.
  select * into v_modelo from modelos_mensagem
   where escolinha_id = p_escolinha and tipo = 'aniversario' and ativo;
  if found then
    insert into fila_mensagens
      (escolinha_id, tipo, aluno_id, responsavel_id, telefone, texto, agendada_para)
    select
      a.escolinha_id, 'aniversario', a.id, a.responsavel_id, r.telefone,
      render_mensagem(v_modelo.texto, jsonb_build_object(
        'aluno', a.nome, 'responsavel', r.nome, 'escolinha', v_esc.nome, 'turma', t.nome)),
      p_data
    from alunos a
    left join responsaveis r on r.id = a.responsavel_id
    left join turmas t       on t.id = a.turma_id
    where a.escolinha_id = p_escolinha
      and a.ativo
      and a.nascimento is not null
      and to_char(a.nascimento, 'MM-DD') = to_char(p_data, 'MM-DD')
      and not exists (
        select 1 from mensalidades m
        where m.aluno_id = a.id
          and em_atraso(m.status, m.vencimento, v_esc.tolerancia_atraso)
      )
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

-- A rotina roda sem usuário nenhum, então precisa ser DEFINER: dentro
-- dela, montar_fila (INVOKER) passa a correr como o dono da função e
-- enxerga todas as escolinhas, que é o que se quer aqui.
create or replace function montar_fila_todas(p_data date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare e uuid; total integer := 0;
begin
  for e in select id from escolinhas loop
    total := total + montar_fila(e, p_data);
  end loop;
  return total;
end;
$$;
revoke execute on function montar_fila_todas(date) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- marcar como enviada
-- O lembrete de cobrança também entra em `lembretes`, que é de onde a
-- tela de Cobranças tira "último lembrete". Dois históricos paralelos
-- para a mesma coisa seria pedir para divergirem.
-- ---------------------------------------------------------------
create or replace function marcar_enviada(p_id uuid)
returns uuid
language plpgsql
as $$
declare f fila_mensagens%rowtype;
begin
  select * into f from fila_mensagens where id = p_id;
  if not found then
    raise exception 'Mensagem não encontrada.' using errcode = '22023';
  end if;
  if not e_dono(f.escolinha_id) then
    raise exception 'Só o gestor envia mensagem.' using errcode = '22023';
  end if;
  if f.status <> 'pendente' then
    return f.id;                      -- clicar duas vezes não duplica
  end if;

  update fila_mensagens
     set status = 'enviada', enviada_em = now(), enviado_por = auth.uid()
   where id = p_id;

  if f.mensalidade_id is not null then
    insert into lembretes (escolinha_id, mensalidade_id, mensagem, enviado_por, canal)
    values (f.escolinha_id, f.mensalidade_id, f.texto, auth.uid(), f.canal);
  end if;

  return f.id;
end;
$$;
revoke execute on function marcar_enviada(uuid) from public, anon;
grant execute on function marcar_enviada(uuid) to authenticated;

-- ---------------------------------------------------------------
-- a fila como a tela precisa dela
-- O token do responsável vem junto porque é com ele que a tela monta
-- o {{link}} que o banco não tinha como preencher.
-- ---------------------------------------------------------------
create or replace view vw_fila_mensagens with (security_invoker = on) as
select
  f.*,
  a.nome                   as aluno_nome,
  t.nome                   as turma_nome,
  r.nome                   as responsavel_nome,
  token_responsavel(r.id)  as responsavel_token,
  m.vencimento,
  m.valor_centavos
from fila_mensagens f
left join alunos a        on a.id = f.aluno_id
left join turmas t        on t.id = a.turma_id
left join responsaveis r  on r.id = f.responsavel_id
left join mensalidades m  on m.id = f.mensalidade_id;

grant select on vw_fila_mensagens to authenticated;
revoke all on vw_fila_mensagens from anon;

-- ---------------------------------------------------------------
-- todo dia de manhã
-- Mesmo cuidado da rotina das mensalidades: sem pg_cron, avisa e
-- segue. O botão "Montar a fila de hoje" na tela cobre o intervalo.
-- ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron não está ligado. Ative em Database → Extensions e rode esta migration de novo. Até lá, use o botão "Montar a fila de hoje" em Mensagens.';
    return;
  end if;

  perform cron.unschedule('montar-fila-de-mensagens')
  where exists (select 1 from cron.job where jobname = 'montar-fila-de-mensagens');

  perform cron.schedule(
    'montar-fila-de-mensagens',
    '0 10 * * *',                     -- todo dia, 10:00 UTC (07:00 em Brasília)
    $cron$select public.montar_fila_todas()$cron$
  );

  raise notice 'Rotina diária agendada: montar-fila-de-mensagens';
end;
$$;
