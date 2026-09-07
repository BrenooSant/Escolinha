-- =============================================================
--  Convite de professor
--  Não dá para procurar alguém em auth.users pelo cliente, então o
--  convite é um token: o dono gera, manda o link, e quem abrir já
--  logado entra na equipe. Sem convite pendente, ninguém entra.
-- =============================================================

create table if not exists convites (
  id           uuid primary key default gen_random_uuid(),
  escolinha_id uuid not null references escolinhas (id) on delete cascade,
  email        text,
  papel        papel_membro not null default 'professor',
  token        text not null unique default gerar_token(),
  criado_por   uuid references perfis (id) on delete set null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '14 days',
  aceito_em    timestamptz,
  aceito_por   uuid references perfis (id) on delete set null
);
create index if not exists convites_escolinha_idx on convites (escolinha_id, aceito_em);

alter table convites enable row level security;

drop policy if exists "membro lê convites"  on convites;
drop policy if exists "dono cria convite"   on convites;
drop policy if exists "dono apaga convite"  on convites;

create policy "membro lê convites" on convites for select to authenticated
  using (escolinha_id in (select escolinhas_do_usuario()));
create policy "dono cria convite" on convites for insert to authenticated
  with check (e_dono(escolinha_id));
create policy "dono apaga convite" on convites for delete to authenticated
  using (e_dono(escolinha_id));

grant select, insert, delete on convites to authenticated;
revoke all on convites from anon;

-- Quem abre o link ainda não é membro, então a leitura do convite e a
-- entrada na equipe precisam passar por fora da RLS.
create or replace function convite_por_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare c record;
begin
  select cv.*, e.nome as escolinha_nome, e.cidade
    into c
  from convites cv
  join escolinhas e on e.id = cv.escolinha_id
  where cv.token = btrim(coalesce(p_token, ''));

  if not found then return null; end if;

  return jsonb_build_object(
    'escolinha', c.escolinha_nome,
    'cidade', c.cidade,
    'papel', c.papel,
    'email', c.email,
    'expirado', c.expira_em < now(),
    'aceito', c.aceito_em is not null,
    'ja_e_membro', exists (
      select 1 from membros m where m.escolinha_id = c.escolinha_id and m.perfil_id = auth.uid()
    )
  );
end;
$$;

create or replace function aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare c record;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta antes de aceitar o convite.' using errcode = '42501';
  end if;

  select * into c from convites where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;
  if c.aceito_em is not null then
    raise exception 'Este convite já foi usado.' using errcode = '22023';
  end if;
  if c.expira_em < now() then
    raise exception 'Este convite expirou. Peça um novo à coordenação.' using errcode = '22023';
  end if;

  insert into membros (escolinha_id, perfil_id, papel)
  values (c.escolinha_id, auth.uid(), c.papel)
  on conflict (escolinha_id, perfil_id) do nothing;

  update convites set aceito_em = now(), aceito_por = auth.uid() where id = c.id;

  return c.escolinha_id;
end;
$$;

revoke execute on function convite_por_token(text) from public, anon;
revoke execute on function aceitar_convite(text)   from public, anon;
grant execute on function convite_por_token(text) to authenticated;
grant execute on function aceitar_convite(text)   to authenticated;

-- O dono pode tirar alguém da equipe; a política de membros já cuida disso,
-- mas a de update precisa existir para trocar o papel — e ninguém pode
-- rebaixar ou remover o último dono.
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

drop trigger if exists protege_ultimo_dono on membros;
create trigger protege_ultimo_dono
  before update or delete on membros
  for each row execute function tg_protege_ultimo_dono();
