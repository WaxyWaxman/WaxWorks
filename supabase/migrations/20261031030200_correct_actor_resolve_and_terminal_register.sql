set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- Corrects app.actor_resolve (20261031012700) and app.terminal_register
-- (20261031012800), both merged (A-101: never edited). Finding 8 of the E-01 D
-- order's review, A-89 ("the one"), E-01 d25: `select … into strict`, so
-- initials held twice at a Store raise too_many_rows (P0003, a failure, not a
-- refusal key) instead of resolving to whichever row came first. M-04's
-- uniqueness makes the case unreachable through the product; this keeps a
-- broken invariant from attributing work to the wrong person. Everything else is
-- unchanged.

create or replace function app.actor_resolve(
  p_initials    text,
  p_terminal_id uuid,
  p_request_id  uuid                -- A-94, A-113: correlates; this function writes nothing
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id   uuid := authz.org_id();
  v_store_id uuid := authz.store_id();
  v_user     record;
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';                       -- A-40
  end if;
  if authz.principal() is distinct from 'store' then
    raise exception 'role_refused' using errcode = '42501', detail = 'store';  -- store session only
  end if;
  if not exists (select 1 from public.terminals t
                  where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
    raise exception 'terminal_mismatch' using errcode = '28000';               -- A-94
  end if;

  -- A-89, E-01 d25: THE one. `strict` raises too_many_rows (P0003) if two
  -- active Users assigned here hold these initials, instead of picking one.
  begin
    select u.id, u.display_name, u.role
      into strict v_user
      from public.users u
      join public.store_assignments a
        on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.org_id = v_org_id
       and u.active                                                            -- E-01 d17
       and u.initials = upper(btrim(p_initials));                              -- E-01 d19, M-04 d20
  exception
    when no_data_found then
      raise exception 'not_found' using errcode = 'WX404';
  end;

  return jsonb_build_object('user_id', v_user.id, 'display_name', v_user.display_name, 'role', v_user.role);
end
$$;

revoke execute on function app.actor_resolve(text, uuid, uuid) from public;   -- A-103, A-107
grant  execute on function app.actor_resolve(text, uuid, uuid) to authenticated;

create or replace function app.terminal_register(
  p_actor_initials text,
  p_name           text,
  p_request_id     uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id   uuid := authz.org_id();
  v_store_id uuid := authz.store_id();
  v_user_id  uuid;
  v_terminal uuid;
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';                       -- A-40
  end if;
  if authz.principal() is distinct from 'store' then
    raise exception 'role_refused' using errcode = '42501', detail = 'store';  -- E-01 d2: not on a personal session
  end if;

  -- A-89, A-113: resolved exactly as actor_resolve resolves, `strict` included.
  begin
    select u.id
      into strict v_user_id
      from public.users u
      join public.store_assignments a
        on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.org_id = v_org_id
       and u.active
       and u.initials = upper(btrim(p_actor_initials));
  exception
    when no_data_found then
      raise exception 'not_found' using errcode = 'WX404';
  end;

  insert into public.terminals (org_id, store_id, name, registered_by_user_id, request_id, principal)
  values (v_org_id, v_store_id, btrim(p_name), v_user_id, p_request_id, 'store')
  returning id into v_terminal;

  return jsonb_build_object('terminal_id', v_terminal, 'registered_by_user_id', v_user_id);
end
$$;

revoke execute on function app.terminal_register(text, text, uuid) from public;   -- A-103, A-107
grant  execute on function app.terminal_register(text, text, uuid) to authenticated;

reset role;
