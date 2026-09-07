-- =============================================================
--  Portal do responsável
--  Cada responsável ganha um link privado com token. Abre sem senha e
--  mostra os filhos: frequência, mensalidades e a última avaliação.
--  É só leitura, com uma exceção — o pai pode avisar que pagou, e o
--  professor confirma depois.
--
--  Como no link de matrícula, nenhuma tabela é exposta ao papel anon:
--  tudo passa por funções SECURITY DEFINER que partem do token.
-- =============================================================

create or replace function gerar_token()
returns text
language sql
volatile
as $$ select encode(gen_random_bytes(16), 'hex'); $$;

-- Entra como anulável para poder preencher linha a linha; só quem ainda
-- não tem token recebe um, para não invalidar os links já distribuídos.
alter table responsaveis add column if not exists token text;
update responsaveis set token = gerar_token() where token is null;
alter table responsaveis alter column token set default gerar_token();
alter table responsaveis alter column token set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'responsaveis_token_unico') then
    alter table responsaveis add constraint responsaveis_token_unico unique (token);
  end if;
end;
$$;

-- o pai avisa que pagou; a confirmação continua sendo do professor
alter table mensalidades
  add column if not exists avisado_em timestamptz,
  add column if not exists aviso_obs  text;

-- ---------------------------------------------------------------
-- o que o link mostra
-- ---------------------------------------------------------------
create or replace function portal_responsavel(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; v jsonb;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    return null;
  end if;

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
            'dias_atraso', case when m.status = 'aberta' and m.vencimento < current_date
                                then current_date - m.vencimento else 0 end
          ) order by m.competencia desc)
          from (
            select * from mensalidades mm
            where mm.aluno_id = a.id order by mm.competencia desc limit 6
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

-- ---------------------------------------------------------------
-- "já paguei" — sinaliza, não dá baixa
-- ---------------------------------------------------------------
create or replace function avisar_pagamento(p_token text, p_mensalidade uuid, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_m record;
begin
  select * into r from responsaveis where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Link inválido.' using errcode = 'P0002';
  end if;

  -- a mensalidade tem de ser de um filho deste responsável.
  -- A variável não pode se chamar `m`: o plpgsql resolveria `m.id` como
  -- ela mesma em vez do alias da tabela.
  select m.* into v_m
  from mensalidades m
  join alunos a on a.id = m.aluno_id
  where m.id = p_mensalidade and a.responsavel_id = r.id;

  if not found then
    raise exception 'Mensalidade não encontrada.' using errcode = 'P0002';
  end if;
  if v_m.status = 'paga' then
    return jsonb_build_object('ok', true, 'ja_paga', true);
  end if;

  update mensalidades
     set avisado_em = now(),
         aviso_obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '')
   where id = p_mensalidade;

  return jsonb_build_object('ok', true, 'ja_paga', false);
end;
$$;

grant execute on function portal_responsavel(text)          to anon, authenticated;
grant execute on function avisar_pagamento(text, uuid, text) to anon, authenticated;
revoke execute on function gerar_token() from public, anon;

-- Se o link vazar, o professor gera outro e o antigo morre.
create or replace function trocar_token_responsavel(p_responsavel uuid)
returns text
language plpgsql
as $$
declare v text;
begin
  update responsaveis set token = gerar_token() where id = p_responsavel returning token into v;
  if v is null then
    raise exception 'Responsável não encontrado.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke execute on function trocar_token_responsavel(uuid) from public, anon;
grant execute on function trocar_token_responsavel(uuid) to authenticated;

-- ---------------------------------------------------------------
-- o aviso do pai precisa aparecer para o professor
-- ---------------------------------------------------------------
-- `create or replace view` só aceita coluna acrescentada no fim, e estas
-- entram no meio. Recriar é seguro: nada mais depende desta view.
drop view if exists vw_mensalidades;
create view vw_mensalidades with (security_invoker = on) as
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
  r.token            as responsavel_token,
  (select count(*) from lembretes l where l.mensalidade_id = m.id)     as lembretes,
  (select max(l.enviado_em) from lembretes l where l.mensalidade_id = m.id) as ultimo_lembrete
from mensalidades m
join alunos a            on a.id = m.aluno_id
left join turmas t       on t.id = a.turma_id
left join responsaveis r on r.id = a.responsavel_id;

grant select on vw_mensalidades to authenticated;
revoke all on vw_mensalidades from anon;
