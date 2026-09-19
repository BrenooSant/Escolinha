-- =============================================================
--  Contrato online
--
--  O gestor escreve o contrato em Ajustes, com campos como {{aluno}} e
--  {{mensalidade}}. Cada vez que salva, nasce uma versão nova — a antiga
--  nunca muda, porque há gente que aceitou exatamente aquele texto.
--
--  O responsável aceita em dois lugares: na ficha do link de matrícula
--  (quem está entrando) e no portal (quem já é aluno). O que fica
--  guardado é a prova do aceite: o texto exato que ele leu, já com os
--  dados preenchidos, o hash SHA-256 desse texto, nome e CPF de quem
--  aceitou, IP, navegador e hora.
--
--  O texto é montado aqui, no banco, nas duas pontas: a prévia que a
--  pessoa lê e o aceite. Se o gestor trocar o contrato no meio da
--  leitura, o hash não bate e o aceite é recusado — ninguém assina um
--  texto que não viu.
--
--  É aceite eletrônico entre particulares (MP 2.200-2/2001, art. 10,
--  § 2º). Não substitui assinatura com certificado digital.
-- =============================================================

alter table escolinhas add column exige_contrato boolean not null default false;

-- CPF de quem mandou a ficha pelo link: vai para o aceite do contrato
alter table pre_matriculas add column resp_cpf text check (resp_cpf ~ '^[0-9]{11}$');

create table contratos_modelo (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  versao       integer not null,
  texto        text not null check (length(btrim(texto)) between 50 and 30000),
  criado_em    timestamptz not null default now(),
  criado_por   uuid references perfis (id) on delete set null default auth.uid(),
  unique (escolinha_id, versao)
);

create or replace function tg_contrato_versao()
returns trigger
language plpgsql
as $$
begin
  select coalesce(max(versao), 0) + 1 into new.versao
  from contratos_modelo where escolinha_id = new.escolinha_id;
  return new;
end;
$$;

create trigger contrato_versao
  before insert on contratos_modelo
  for each row execute function tg_contrato_versao();

create table contratos_aceites (
  id               uuid primary key default gen_random_uuid(),
  escolinha_id     uuid not null references escolinhas (id) on delete cascade,
  modelo_id        uuid not null references contratos_modelo (id) on delete cascade,
  aluno_id         uuid references alunos (id) on delete set null,
  pre_matricula_id uuid references pre_matriculas (id) on delete set null,
  aluno_nome       text not null,
  assinante_nome   text not null,
  assinante_cpf    text not null check (assinante_cpf ~ '^[0-9]{11}$'),
  texto            text not null,
  hash             text not null,
  ip               text,
  user_agent       text,
  origem           text not null check (origem in ('matricula', 'portal')),
  aceito_em        timestamptz not null default now()
);
create index on contratos_aceites (aluno_id);
create index on contratos_aceites (escolinha_id, aceito_em desc);

-- Modelo: o gestor lê e cria versão nova; ninguém edita nem apaga.
-- Aceite: só leitura, e só pelo gestor. Quem grava são as funções abaixo.
alter table contratos_modelo  enable row level security;
alter table contratos_aceites enable row level security;

create policy "gestor lê contratos" on contratos_modelo for select to authenticated
  using (e_dono(escolinha_id));
create policy "gestor cria versão do contrato" on contratos_modelo for insert to authenticated
  with check (e_dono(escolinha_id));
create policy "gestor lê aceites" on contratos_aceites for select to authenticated
  using (e_dono(escolinha_id));

grant select, insert on contratos_modelo to authenticated;
grant select on contratos_aceites to authenticated;
revoke all on contratos_modelo, contratos_aceites from anon;

-- ---------------------------------------------------------------
-- utilitários
-- ---------------------------------------------------------------
create or replace function cpf_valido(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s integer;
  r integer;
  i integer;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;

  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::integer * (11 - i); end loop;
  r := s % 11;
  if (case when r < 2 then 0 else 11 - r end) <> substr(d, 10, 1)::integer then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::integer * (12 - i); end loop;
  r := s % 11;
  return (case when r < 2 then 0 else 11 - r end) = substr(d, 11, 1)::integer;
end;
$$;

create or replace function formatar_documento(p text)
returns text
language sql
immutable
as $$
  select case length(p)
    when 11 then regexp_replace(p, '(\d{3})(\d{3})(\d{3})(\d{2})', '\1.\2.\3-\4')
    when 14 then regexp_replace(p, '(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})', '\1.\2.\3/\4-\5')
    else p
  end;
$$;

create or replace function formatar_brl(p_centavos integer)
returns text
language sql
immutable
as $$
  select 'R$ ' || translate(to_char(p_centavos / 100.0, 'FM999,999,990.00'), ',.', '.,');
$$;

-- Troca os {{campos}} pelos dados da escolinha, do atleta e de quem
-- assina. Campo sem dado vira um traço, nunca some em silêncio.
create or replace function render_contrato(p_texto text, p_escolinha uuid, p_dados jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  e escolinhas%rowtype;
  c config_cobranca%rowtype;
  t turmas%rowtype;
  v text := p_texto;
  nasc date := nullif(p_dados ->> 'nascimento', '')::date;
  cpf text := regexp_replace(coalesce(p_dados ->> 'resp_cpf', ''), '\D', '', 'g');
begin
  select * into e from escolinhas where id = p_escolinha;
  select * into c from config_cobranca where escolinha_id = p_escolinha;
  select * into t from turmas
   where id = nullif(p_dados ->> 'turma_id', '')::uuid and escolinha_id = p_escolinha;

  v := replace(v, '{{escolinha}}', coalesce(e.razao_social, e.nome));
  v := replace(v, '{{documento_escolinha}}', coalesce(formatar_documento(e.documento), '—'));
  v := replace(v, '{{cidade}}', coalesce(nullif(e.cidade, ''), '—'));
  v := replace(v, '{{aluno}}', coalesce(nullif(btrim(p_dados ->> 'aluno_nome'), ''), '—'));
  v := replace(v, '{{nascimento}}', coalesce(to_char(nasc, 'DD/MM/YYYY'), '—'));
  v := replace(v, '{{responsavel}}', coalesce(nullif(btrim(p_dados ->> 'resp_nome'), ''), '—'));
  v := replace(v, '{{cpf_responsavel}}', coalesce(formatar_documento(nullif(cpf, '')), '—'));
  v := replace(v, '{{turma}}', coalesce(t.nome, 'a definir pela escolinha'));
  v := replace(v, '{{mensalidade}}',
    coalesce(formatar_brl(coalesce((p_dados ->> 'mensalidade_centavos')::integer, t.mensalidade_centavos)),
             'o valor da turma'));
  v := replace(v, '{{vencimento}}', coalesce(p_dados ->> 'dia_vencimento', e.dia_vencimento::text));
  v := replace(v, '{{taxa_matricula}}',
    case when coalesce(c.taxa_matricula_centavos, 0) > 0 then formatar_brl(c.taxa_matricula_centavos) else 'isenta' end);
  v := replace(v, '{{multa}}', trim_scale(coalesce(c.multa_percentual, 0)) || '%');
  v := replace(v, '{{juros}}', trim_scale(coalesce(c.juros_mes_percentual, 0)) || '% ao mês');
  v := replace(v, '{{data}}', to_char(current_date, 'DD/MM/YYYY'));
  return v;
end;
$$;

create or replace function hash_texto(p text)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select encode(digest(p, 'sha256'), 'hex'); $$;

-- IP e navegador de quem chamou, pelos cabeçalhos que o PostgREST repassa.
create or replace function origem_requisicao()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ip', btrim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)),
    'user_agent', left(h ->> 'user-agent', 300)
  )
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as h) x;
$$;

create or replace function contrato_vigente(p_escolinha uuid)
returns contratos_modelo
language sql
stable
set search_path = public
as $$
  select m.* from contratos_modelo m
  join escolinhas e on e.id = m.escolinha_id
  where m.escolinha_id = p_escolinha and e.exige_contrato
  order by m.versao desc
  limit 1;
$$;

revoke execute on function
  render_contrato(text, uuid, jsonb), origem_requisicao(), contrato_vigente(uuid)
  from public, anon;

-- ---------------------------------------------------------------
-- link de matrícula: a prévia que o responsável lê antes de enviar
-- ---------------------------------------------------------------
create or replace function contrato_publico(p_codigo text, p_dados jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare e escolinhas%rowtype; m contratos_modelo%rowtype; v text;
begin
  select * into e from escolinhas
   where codigo_matricula = upper(btrim(coalesce(p_codigo, ''))) and matriculas_abertas;
  if not found then
    return null;
  end if;
  m := contrato_vigente(e.id);
  if m.id is null then
    return null;
  end if;
  v := render_contrato(m.texto, e.id, p_dados);
  return jsonb_build_object('versao', m.versao, 'texto', v, 'hash', hash_texto(v));
end;
$$;
grant execute on function contrato_publico(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------
-- portal: quem já é aluno lê e aceita pelo link do responsável
-- ---------------------------------------------------------------
create or replace function dados_contrato_portal(p_token text, p_aluno uuid, p_nome text, p_cpf text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; a record;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Link inválido.' using errcode = 'P0002';
  end if;
  select al.*, ac.mensalidade_centavos as valor_proprio into a
  from alunos al
  left join alunos_cobranca ac on ac.aluno_id = al.id
  where al.id = p_aluno and al.responsavel_id = r.id and al.ativo;
  if not found then
    raise exception 'Atleta não encontrado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'escolinha_id', r.escolinha_id,
    'aluno_id', a.id,
    'aluno_nome', a.nome,
    'nascimento', a.nascimento,
    'turma_id', a.turma_id,
    'mensalidade_centavos', a.valor_proprio,
    'dia_vencimento', a.dia_vencimento,
    'resp_nome', coalesce(nullif(btrim(p_nome), ''), r.nome),
    'resp_cpf', p_cpf
  );
end;
$$;
revoke execute on function dados_contrato_portal(text, uuid, text, text) from public, anon, authenticated;

create or replace function contrato_portal(p_token text, p_aluno uuid, p_nome text, p_cpf text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare d jsonb; m contratos_modelo%rowtype; v text;
begin
  d := dados_contrato_portal(p_token, p_aluno, p_nome, p_cpf);
  m := contrato_vigente((d ->> 'escolinha_id')::uuid);
  if m.id is null then
    return null;
  end if;
  v := render_contrato(m.texto, (d ->> 'escolinha_id')::uuid, d);
  return jsonb_build_object('versao', m.versao, 'texto', v, 'hash', hash_texto(v));
end;
$$;
grant execute on function contrato_portal(text, uuid, text, text) to anon, authenticated;

create or replace function aceitar_contrato_portal(
  p_token text, p_aluno uuid, p_nome text, p_cpf text, p_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare d jsonb; m contratos_modelo%rowtype; v text; o jsonb; v_id uuid;
begin
  if length(btrim(coalesce(p_nome, ''))) < 5 then
    raise exception 'Informe o nome completo de quem aceita.' using errcode = '22023';
  end if;
  if not cpf_valido(p_cpf) then
    raise exception 'CPF inválido — confira os números.' using errcode = '22023';
  end if;

  d := dados_contrato_portal(p_token, p_aluno, p_nome, p_cpf);
  m := contrato_vigente((d ->> 'escolinha_id')::uuid);
  if m.id is null then
    raise exception 'A escolinha não pede contrato no momento.' using errcode = 'P0002';
  end if;
  if exists (select 1 from contratos_aceites where aluno_id = p_aluno) then
    return jsonb_build_object('ok', true, 'ja_assinado', true);
  end if;

  v := render_contrato(m.texto, (d ->> 'escolinha_id')::uuid, d);
  if hash_texto(v) <> coalesce(p_hash, '') then
    raise exception 'O contrato foi atualizado. Leia de novo antes de aceitar.' using errcode = '22023';
  end if;

  o := origem_requisicao();
  insert into contratos_aceites (
    escolinha_id, modelo_id, aluno_id, aluno_nome, assinante_nome, assinante_cpf,
    texto, hash, ip, user_agent, origem
  )
  values (
    (d ->> 'escolinha_id')::uuid, m.id, p_aluno, d ->> 'aluno_nome', btrim(p_nome),
    regexp_replace(p_cpf, '\D', '', 'g'), v, hash_texto(v),
    nullif(o ->> 'ip', ''), o ->> 'user_agent', 'portal'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'ja_assinado', false, 'id', v_id);
end;
$$;
grant execute on function aceitar_contrato_portal(text, uuid, text, text, text) to anon, authenticated;

-- a ficha aprovada leva o aceite para o atleta que nasceu dela
create or replace function tg_aceite_segue_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aluno_id is not null and new.aluno_id is distinct from old.aluno_id then
    update contratos_aceites set aluno_id = new.aluno_id where pre_matricula_id = new.id;
  end if;
  return new;
end;
$$;

create trigger aceite_segue_aluno
  after update of aluno_id on pre_matriculas
  for each row execute function tg_aceite_segue_aluno();

-- ---------------------------------------------------------------
-- ficha do link: aceite junto com o envio
-- ---------------------------------------------------------------
create or replace function enviar_pre_matricula(p_codigo text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e           record;
  v_id        uuid;
  v_turma     uuid;
  v_foto      text := nullif(btrim(coalesce(p_dados ->> 'foto_path', '')), '');
  v_nome      text := btrim(coalesce(p_dados ->> 'aluno_nome', ''));
  v_resp      text := btrim(coalesce(p_dados ->> 'resp_nome', ''));
  v_tel       text := btrim(coalesce(p_dados ->> 'resp_telefone', ''));
  v_pendentes integer;
  v_cpf       text := nullif(regexp_replace(coalesce(p_dados ->> 'resp_cpf', ''), '\D', '', 'g'), '');
  m           contratos_modelo%rowtype;
  v_contrato  text;
  o           jsonb;
begin
  select * into e
  from escolinhas
  where codigo_matricula = upper(btrim(coalesce(p_codigo, '')));

  if not found or not e.matriculas_abertas then
    raise exception 'Link de matrícula inválido ou encerrado.' using errcode = 'P0002';
  end if;

  if length(v_nome) < 3 then
    raise exception 'Informe o nome do atleta.' using errcode = '22023';
  end if;
  if length(v_resp) < 3 then
    raise exception 'Informe o nome do responsável.' using errcode = '22023';
  end if;
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone válido com DDD.' using errcode = '22023';
  end if;

  -- a foto tem de estar na pasta desta escolinha, não em outra
  if v_foto is not null and v_foto not like 'pre/' || e.id::text || '/%' then
    raise exception 'Foto inválida.' using errcode = '22023';
  end if;

  if exists (
    select 1 from pre_matriculas
    where escolinha_id = e.id and status = 'pendente'
      and resp_telefone = v_tel and lower(aluno_nome) = lower(v_nome)
  ) then
    raise exception 'Esta ficha já foi enviada e está em análise.' using errcode = '23505';
  end if;

  -- contrato: se a escolinha pede, a ficha só entra com o aceite, e o
  -- texto aceito tem de ser o mesmo que a prévia mostrou
  m := contrato_vigente(e.id);
  if m.id is not null then
    if not coalesce((p_dados ->> 'contrato_aceito')::boolean, false) then
      raise exception 'Leia e aceite o contrato para enviar a ficha.' using errcode = '22023';
    end if;
    if not cpf_valido(v_cpf) then
      raise exception 'Informe um CPF válido do responsável.' using errcode = '22023';
    end if;
    v_contrato := render_contrato(m.texto, e.id, p_dados);
    if hash_texto(v_contrato) <> coalesce(p_dados ->> 'contrato_hash', '') then
      raise exception 'O contrato foi atualizado. Leia de novo antes de enviar.' using errcode = '22023';
    end if;
  elsif v_cpf is not null and not cpf_valido(v_cpf) then
    raise exception 'CPF inválido — confira os números.' using errcode = '22023';
  end if;

  select count(*) into v_pendentes
  from pre_matriculas
  where escolinha_id = e.id and status = 'pendente' and enviada_em > now() - interval '1 hour';

  if v_pendentes >= 40 then
    raise exception 'Muitas fichas enviadas agora há pouco. Tente de novo em instantes.'
      using errcode = '53400';
  end if;

  select t.id into v_turma
  from turmas t
  where t.id = nullif(p_dados ->> 'turma_id', '')::uuid
    and t.escolinha_id = e.id and t.ativa;

  insert into pre_matriculas (
    escolinha_id, aluno_nome, nascimento, posicao, turma_id, observacoes,
    autoriza_imagem, resp_nome, resp_parentesco, resp_telefone, resp_email, foto_path, resp_cpf
  )
  values (
    e.id,
    left(v_nome, 80),
    nullif(p_dados ->> 'nascimento', '')::date,
    nullif(left(btrim(coalesce(p_dados ->> 'posicao', '')), 40), ''),
    v_turma,
    nullif(left(btrim(coalesce(p_dados ->> 'observacoes', '')), 500), ''),
    coalesce((p_dados ->> 'autoriza_imagem')::boolean, true),
    left(v_resp, 80),
    nullif(left(btrim(coalesce(p_dados ->> 'resp_parentesco', '')), 40), ''),
    left(v_tel, 30),
    nullif(left(btrim(coalesce(p_dados ->> 'resp_email', '')), 120), ''),
    v_foto,
    v_cpf
  )
  returning id into v_id;

  if v_contrato is not null then
    o := origem_requisicao();
    insert into contratos_aceites (
      escolinha_id, modelo_id, pre_matricula_id, aluno_nome, assinante_nome, assinante_cpf,
      texto, hash, ip, user_agent, origem
    )
    values (
      e.id, m.id, v_id, left(v_nome, 80), left(v_resp, 80), v_cpf,
      v_contrato, hash_texto(v_contrato), nullif(o ->> 'ip', ''), o ->> 'user_agent', 'matricula'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'protocolo', upper(substr(replace(v_id::text, '-', ''), 1, 6)),
    'escolinha', e.nome
  );
end;
$$;
grant execute on function enviar_pre_matricula(text, jsonb) to anon, authenticated;

-- o link diz se vai pedir contrato
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
    'exige_contrato', (contrato_vigente(e.id)).id is not null,
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

-- portal: situação do contrato de cada filho
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
        'razao_social', e.razao_social, 'documento', e.documento
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

-- lista de atletas: quem ainda não assinou
create or replace view vw_alunos with (security_invoker = on) as
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
  p.meses               as plano_meses,
  -- só o gestor lê os aceites; para o professor sai sempre falso
  exists (select 1 from contratos_aceites ca where ca.aluno_id = a.id) as contrato_assinado
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

-- ---------------------------------------------------------------
-- prévia para o gestor: o texto com dados de exemplo, antes de salvar
-- ---------------------------------------------------------------
create or replace function previa_contrato(p_escolinha uuid, p_texto text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not e_dono(p_escolinha) then
    raise exception 'Só o gestor edita o contrato.' using errcode = '42501';
  end if;
  return render_contrato(p_texto, p_escolinha, jsonb_build_object(
    'aluno_nome', 'Gabriel Souza Antunes',
    'nascimento', '2015-03-14',
    'resp_nome', 'Cristiane Souza Antunes',
    'resp_cpf', '52998224725',
    'turma_id', (select id from turmas where escolinha_id = p_escolinha and ativa order by ordem limit 1)
  ));
end;
$$;
revoke execute on function previa_contrato(uuid, text) from public, anon;
grant execute on function previa_contrato(uuid, text) to authenticated;
