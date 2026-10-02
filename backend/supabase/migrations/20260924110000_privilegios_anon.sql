-- =============================================================
--  Fecha `anon` em tudo que não é porta pública
--
--  No Supabase, toda função nova de `public` nasce com EXECUTE para
--  `anon` — vem das default privileges do projeto. A migration de 5 de
--  setembro (20260905090600) consertou isso com uma lista fixa, escrita
--  naquele dia. Toda função criada depois ficou por conta de lembrar de
--  revogar, e uma não lembrou: `modelos_mensagem_padrao`.
--
--  Lista fixa não escala. Aqui a lógica se inverte: fecha tudo, e abre
--  só o que está nomeado como porta do anônimo.
--
--  Dois cuidados que fazem a diferença entre varrer e quebrar:
--
--  1. Revogar de PUBLIC junto. Tirar só de `anon` não adianta enquanto
--     PUBLIC tiver EXECUTE — anon é membro de PUBLIC.
--
--  2. Não conceder a `authenticated` em bloco. Há funções fechadas
--     também para ele de propósito (asaas_dar_baixa, montar_fila_todas,
--     gerar_mensalidades_todas); um grant genérico reabriria justo
--     essas. Em vez disso, olha o que ele já podia antes e devolve
--     exatamente isso.
--
--  Funções de gatilho ficam de fora: não são chamáveis direto de
--  maneira útil, e mexer no EXECUTE delas é risco sem ganho.
-- =============================================================

do $$
declare
  f record;
  -- as portas do anônimo: link de matrícula, portal do responsável,
  -- aula experimental e o aceite de contrato
  permitidas text[] := array[
    'escolinha_publica(text)',
    'enviar_pre_matricula(text, jsonb)',
    'portal_responsavel(text)',
    'avisar_pagamento(text, uuid, text)',
    'contrato_publico(text, jsonb)',
    'contrato_portal(text, uuid, text, text)',
    'aceitar_contrato_portal(text, uuid, text, text, text)',
    'registrar_interesse(text, jsonb)',
    'escolinha_aceita_online(uuid)'
  ];
  fechadas integer := 0;
begin
  for f in
    select
      p.oid::regprocedure::text                            as assinatura,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_podia
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      -- nada que pertença a extensão
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    if f.assinatura = any (permitidas) then
      continue;
    end if;

    execute format('revoke execute on function %s from public, anon', f.assinatura);
    if f.auth_podia then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    fechadas := fechadas + 1;
  end loop;

  raise notice 'anon fechado em % funções; % portas públicas mantidas',
    fechadas, array_length(permitidas, 1);
end;
$$;

-- E garante que as portas continuam abertas, caso alguma tenha perdido
-- o grant no caminho.
grant execute on function escolinha_publica(text)                             to anon, authenticated;
grant execute on function enviar_pre_matricula(text, jsonb)                   to anon, authenticated;
grant execute on function portal_responsavel(text)                            to anon, authenticated;
grant execute on function avisar_pagamento(text, uuid, text)                  to anon, authenticated;
grant execute on function contrato_publico(text, jsonb)                       to anon, authenticated;
grant execute on function contrato_portal(text, uuid, text, text)             to anon, authenticated;
grant execute on function aceitar_contrato_portal(text, uuid, text, text, text) to anon, authenticated;
grant execute on function registrar_interesse(text, jsonb)                    to anon, authenticated;
grant execute on function escolinha_aceita_online(uuid)                       to anon, authenticated;
