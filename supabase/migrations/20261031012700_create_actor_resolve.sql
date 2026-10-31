set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- app.actor_resolve — §6 Identity; A-87, A-113; E-01 d17, d19, d25; A-55.
-- A header exception (A-113): the one place a string becomes a person, so it
-- takes p_initials and p_terminal_id and no actor arguments. Resolves an exact
-- match of the normalised initials (M-04 d20) among the ACTIVE Users assigned
-- to authz.store_id(); anything else is not_found and names nobody.
-- §6's exception for a Sale already Open and locked to a deactivated User is not
-- here: there are no Sales before M4.
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

  select u.id, u.display_name, u.role
    into v_user
    from public.users u
    join public.store_assignments a
      on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
   where u.org_id = v_org_id
     and u.active                                                              -- E-01 d17
     and u.initials = upper(btrim(p_initials));                                -- E-01 d19, M-04 d20
  if not found then
    raise exception 'not_found' using errcode = 'WX404';
  end if;

  return jsonb_build_object('user_id', v_user.id, 'display_name', v_user.display_name, 'role', v_user.role);
end
$$;

revoke execute on function app.actor_resolve(text, uuid, uuid) from public;   -- A-103
grant  execute on function app.actor_resolve(text, uuid, uuid) to authenticated;

reset role;
