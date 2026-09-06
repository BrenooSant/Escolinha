-- =============================================================
--  Views de leitura
--  security_invoker = on faz a RLS das tabelas de baixo continuar
--  valendo para quem consulta a view.
-- =============================================================

-- Frequência por atleta.
-- Conta treino já realizado que seja posterior à matrícula (para não
-- punir quem entrou no meio do mês) ou que tenha marcação do atleta
-- (para nada que o professor marcou se perder). Falta justificada não
-- derruba o índice — é o mesmo critério da tela de chamada.
create view vw_aluno_frequencia with (security_invoker = on) as
select
  a.id           as aluno_id,
  a.escolinha_id,
  count(t.id)                                          as treinos,
  count(*) filter (where p.marca = 'P')                 as presencas,
  count(*) filter (where p.marca = 'F')                 as faltas,
  count(*) filter (where p.marca = 'J')                 as justificadas,
  case
    when count(t.id) = 0 then null
    else round(100.0 * count(*) filter (where p.marca in ('P', 'J')) / count(t.id))::int
  end                                                   as frequencia
from alunos a
left join treinos t
       on t.turma_id = a.turma_id
      and t.status = 'realizado'
      and (
        t.data >= a.matriculado_em
        or exists (
          select 1 from presencas px
          where px.treino_id = t.id and px.aluno_id = a.id
        )
      )
left join presencas p
       on p.treino_id = t.id
      and p.aluno_id = a.id
group by a.id, a.escolinha_id;

-- Atleta com tudo que as telas precisam: turma, responsável,
-- frequência e a mensalidade do mês corrente.
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
  coalesce(a.mensalidade_centavos, t.mensalidade_centavos, 0) as valor_centavos,
  coalesce(a.dia_vencimento, e.dia_vencimento)               as dia_vencimento,
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
  end                   as dias_atraso
from alunos a
join escolinhas e            on e.id = a.escolinha_id
left join turmas t           on t.id = a.turma_id
left join responsaveis r     on r.id = a.responsavel_id
left join vw_aluno_frequencia f on f.aluno_id = a.id
left join lateral (
  select m.* from mensalidades m
  where m.aluno_id = a.id
    and m.competencia = date_trunc('month', current_date)::date
  limit 1
) m on true;

-- Mensalidades com o nome do atleta e do responsável — alimenta as
-- telas de financeiro e de cobrança.
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
  (select count(*) from lembretes l where l.mensalidade_id = m.id)     as lembretes,
  (select max(l.enviado_em) from lembretes l where l.mensalidade_id = m.id) as ultimo_lembrete
from mensalidades m
join alunos a            on a.id = m.aluno_id
left join turmas t       on t.id = a.turma_id
left join responsaveis r on r.id = a.responsavel_id;

-- Turmas com ocupação e frequência agregada.
create view vw_turmas with (security_invoker = on) as
select
  t.id,
  t.escolinha_id,
  t.nome,
  t.mensalidade_centavos,
  t.capacidade,
  t.professor,
  t.ordem,
  t.ativa,
  count(a.id) filter (where a.ativo)                as atletas,
  t.capacidade - count(a.id) filter (where a.ativo) as vagas,
  round(avg(f.frequencia) filter (where a.ativo))::int as frequencia,
  (
    select coalesce(json_agg(json_build_object(
      'id', h.id, 'dia_semana', h.dia_semana, 'hora', h.hora, 'local', h.local
    ) order by h.dia_semana, h.hora), '[]'::json)
    from turma_horarios h where h.turma_id = t.id
  ) as horarios
from turmas t
left join alunos a              on a.turma_id = t.id
left join vw_aluno_frequencia f on f.aluno_id = a.id
group by t.id;

-- Agenda: treino com turma e o placar da chamada, quando já houve.
create view vw_treinos with (security_invoker = on) as
select
  tr.id,
  tr.escolinha_id,
  tr.turma_id,
  tr.data,
  tr.hora,
  tr.local,
  tr.tipo,
  tr.adversario,
  tr.status,
  tr.observacoes,
  t.nome                                          as turma_nome,
  t.professor                                     as turma_professor,
  count(p.id) filter (where p.marca = 'P')         as presentes,
  count(p.id) filter (where p.marca = 'F')         as faltas,
  count(p.id) filter (where p.marca = 'J')         as justificadas,
  count(p.id)                                      as marcados,
  (select count(*) from alunos a where a.turma_id = tr.turma_id and a.ativo) as elenco
from treinos tr
join turmas t      on t.id = tr.turma_id
left join presencas p on p.treino_id = tr.id
group by tr.id, t.nome, t.professor;

grant select on
  vw_aluno_frequencia, vw_alunos, vw_mensalidades, vw_turmas, vw_treinos
  to authenticated;
