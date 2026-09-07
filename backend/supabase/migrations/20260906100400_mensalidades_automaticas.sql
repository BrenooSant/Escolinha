-- =============================================================
--  Geração automática das mensalidades
--  Todo dia 1º, cada escolinha ganha a mensalidade do mês de cada
--  atleta ativo — uma linha por aluno, que é o que faz a ficha dele
--  mostrar "Em dia" assim que o pagamento entra.
--
--  A rotina é a mesma `gerar_mensalidades` do botão manual, então rodar
--  à mão continua valendo e nunca duplica.
-- =============================================================

create or replace function gerar_mensalidades_todas(p_competencia date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e     uuid;
  total integer := 0;
begin
  for e in select id from escolinhas loop
    total := total + gerar_mensalidades(e, p_competencia);
  end loop;
  return total;
end;
$$;

revoke execute on function gerar_mensalidades_todas(date) from public, anon, authenticated;

-- `gerar_mensalidades` é SECURITY INVOKER e depende da RLS. Chamada de
-- dentro da rotina (que roda sem usuário), o dono da função definer é
-- quem executa — e ele ignora RLS, que é o que queremos aqui.

-- Agendar só se o pg_cron estiver ligado. Tentar criar a extensão aqui
-- costuma esbarrar em permissão no Supabase — ligar é um clique em
-- Database → Extensions, e aí basta rodar esta migration de novo.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron não está ligado. Ative em Database → Extensions e rode esta migration de novo. Até lá, use o botão "Gerar as do mês" no Financeiro.';
    return;
  end if;

  perform cron.unschedule('gerar-mensalidades-do-mes')
  where exists (select 1 from cron.job where jobname = 'gerar-mensalidades-do-mes');

  perform cron.schedule(
    'gerar-mensalidades-do-mes',
    '0 9 1 * *',                        -- todo dia 1º, 09:00 UTC (06:00 em Brasília)
    $cron$select public.gerar_mensalidades_todas()$cron$
  );

  raise notice 'Rotina mensal agendada: gerar-mensalidades-do-mes';
end;
$$;
