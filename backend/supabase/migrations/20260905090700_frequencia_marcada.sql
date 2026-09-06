-- =============================================================
--  Correção: presença marcada antes da matrícula sumia da conta
--
--  A view ignorava todo treino anterior a `alunos.matriculado_em` — a
--  ideia era não punir quem entrou no meio do mês. Só que o corte valia
--  também para presença que o professor tinha marcado de propósito:
--  a linha ficava em `presencas`, mas não aparecia em lugar nenhum.
--
--  Agora o treino entra na conta quando é posterior à matrícula OU
--  quando existe marcação do atleta nele. Quem chegou depois continua
--  sem carregar falta de treino que não viveu, e nada que foi marcado
--  se perde.
-- =============================================================

create or replace view vw_aluno_frequencia with (security_invoker = on) as
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
