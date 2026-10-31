set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- app.terminal_register — §6 Identity; A-87, A-94, A-113; E-01 d2.
-- A header exception (A-113): no p_terminal_id — it mints the id every later
-- call carries — and it resolves p_actor_initials itself among the active Users
-- assigned to authz.store_id(), exactly as actor_resolve does, because an
-- unregistered browser cannot call actor_resolve. The registration is
-- attributed to whoever stood at it (registered_by_user_id), with A-94's
-- request id and principal on the row. Store session only.
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

  select u.id
    into v_user_id
    from public.users u
    join public.store_assignments a
      on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
   where u.org_id = v_org_id
     and u.active
     and u.initials = upper(btrim(p_actor_initials));
  if not found then
    raise exception 'not_found' using errcode = 'WX404';
  end if;

  insert into public.terminals (org_id, store_id, name, registered_by_user_id, request_id, principal)
  values (v_org_id, v_store_id, btrim(p_name), v_user_id, p_request_id, 'store')
  returning id into v_terminal;

  return jsonb_build_object('terminal_id', v_terminal, 'registered_by_user_id', v_user_id);
end
$$;

revoke execute on function app.terminal_register(text, text, uuid) from public;   -- A-103
grant  execute on function app.terminal_register(text, text, uuid) to authenticated;

reset role;
