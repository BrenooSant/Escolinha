-- =============================================================
--  CNPJ/CPF e razão social da escolinha
--
--  Vão no recibo e no Pix copia e cola, e serão o cadastro da subconta
--  quando o Asaas entrar. Só dígitos no banco; a máscara é da tela.
--  Não é segredo — sai impresso em todo recibo —, então fica em
--  `escolinhas`, que toda a equipe lê.
--
--  O portal passa a entregar o que o responsável precisa para pagar pelo
--  Pix e baixar o recibo da mensalidade paga.
-- =============================================================

alter table escolinhas
  add column razao_social text check (length(btrim(razao_social)) between 2 and 100),
  add column documento    text check (documento ~ '^([0-9]{11}|[0-9]{14})$');

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
        'nome', a.nome,
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
