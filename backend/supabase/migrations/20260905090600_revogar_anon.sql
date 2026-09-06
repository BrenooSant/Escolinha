-- =============================================================
--  Correção de privilégios
--  As default privileges do projeto Supabase concedem EXECUTE em toda
--  função nova de `public` diretamente ao papel `anon`. Revogar só de
--  PUBLIC (como as migrations anteriores faziam) não desfaz esse grant
--  direto, então as RPCs de professor continuavam chamáveis sem login.
--
--  Não havia vazamento — todas são SECURITY INVOKER e a RLS devolvia
--  vazio para quem não é membro de nada — mas superfície à toa é
--  superfície: aqui elas são fechadas de fato.
-- =============================================================

do $$
declare f text;
begin
  foreach f in array array[
    'escolinhas_do_usuario()',
    'e_dono(uuid)',
    'criar_escolinha(text, text)',
    'proximo_numero(uuid)',
    'gerar_treinos(uuid, date, date)',
    'salvar_chamada(uuid, jsonb)',
    'gerar_mensalidades(uuid, date)',
    'registrar_pagamento(uuid, text, date)',
    'estornar_pagamento(uuid)',
    'aprovar_pre_matricula(uuid, uuid, smallint)',
    'recusar_pre_matricula(uuid, text)',
    'painel_resumo(uuid)',
    'trocar_codigo_matricula(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- As duas do link público continuam abertas: são a única porta do anônimo.
grant execute on function escolinha_publica(text)           to anon, authenticated;
grant execute on function enviar_pre_matricula(text, jsonb) to anon, authenticated;

-- Mesmo problema do lado das tabelas: garante que `anon` não tenha grant
-- direto em nada. Sem GRANT a RLS nem chega a ser consultada.
do $$
declare t text;
begin
  foreach t in array array[
    'perfis', 'escolinhas', 'membros', 'turmas', 'turma_horarios',
    'responsaveis', 'alunos', 'treinos', 'presencas', 'mensalidades',
    'lancamentos', 'lembretes', 'pre_matriculas'
  ]
  loop
    execute format('revoke all on %I from anon', t);
  end loop;

  foreach t in array array[
    'vw_aluno_frequencia', 'vw_alunos', 'vw_mensalidades', 'vw_turmas', 'vw_treinos'
  ]
  loop
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;
