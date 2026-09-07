-- =============================================================
--  Duas correções apanhadas em teste
--
--  1. avisar_pagamento() declarava `m record` e usava `m` também como
--     alias da tabela. O plpgsql resolve o nome como variável, então
--     `m.id` estourava com "record m is not assigned yet".
--
--  2. O gatilho que protege o último dono disparava também na exclusão
--     em cascata — o que tornava impossível apagar uma escolinha e, pior,
--     impediria apagar um usuário no painel do Supabase (auth.users →
--     perfis → membros).
-- =============================================================

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

grant execute on function avisar_pagamento(text, uuid, text) to anon, authenticated;

create or replace function tg_protege_ultimo_dono()
returns trigger
language plpgsql
as $$
declare v_donos integer;
begin
  -- Numa exclusão em cascata o pai já saiu antes dos membros — seja a
  -- escolinha inteira, seja o perfil de quem foi removido do Auth. Nesses
  -- casos não há o que proteger, e barrar impediria a própria exclusão.
  if tg_op = 'DELETE'
     and (not exists (select 1 from escolinhas where id = old.escolinha_id)
          or not exists (select 1 from perfis where id = old.perfil_id)) then
    return old;
  end if;

  if (tg_op = 'DELETE' and old.papel = 'dono')
     or (tg_op = 'UPDATE' and old.papel = 'dono' and new.papel <> 'dono') then
    select count(*) into v_donos
    from membros where escolinha_id = old.escolinha_id and papel = 'dono';
    if v_donos <= 1 then
      raise exception 'A escolinha precisa de pelo menos um dono.' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
