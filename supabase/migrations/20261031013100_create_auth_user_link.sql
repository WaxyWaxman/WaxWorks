set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- app.auth_user_link — §6 Identity; A-91, A-113, A-114, A-117.
-- A-91's Auth write-back, called by a Server Action under the service role.
-- A header exception (A-113): in place of tenant and actor it asserts the
-- caller is the service role. Kinds: a `users` row, a `stores` row (the store
-- account), and a person's passkey enrolment (A-117). Logs the act, never a
-- credential (A-93).
--
-- A-128: a row already linked to an Auth user is refused invalid_state /
-- linked - the row it completes is completed once - and every log entry it
-- writes carries principal = 'service', written by the function itself.
create or replace function app.auth_user_link(
  p_kind         text,
  p_row_id       uuid,
  p_auth_user_id uuid,
  p_request_id   uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
  v_found   boolean;
  v_entry   jsonb;
begin
  -- A-113, A-114: the caller is the service role. The grant is the first wall;
  -- this is the second.
  if (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'role_refused' using errcode = '42501', detail = 'service';
  end if;

  v_entry := jsonb_build_object('at', now(), 'actor_user_id', null, 'manager_user_id', null,
                                'request_id', p_request_id, 'terminal_id', null, 'principal', 'service');   -- A-128

  if p_kind = 'passkey' then
    select u.auth_user_id, true into v_current, v_found from public.users u where u.id = p_row_id for update;
    if v_found is null then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if v_current is distinct from p_auth_user_id then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'auth_user_mismatch';   -- A-117
    end if;
    update public.users u
       set passkey_enrolled_at = coalesce(u.passkey_enrolled_at, now()),          -- set once
           log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'passkey_enrolled'))
     where u.id = p_row_id;
    return jsonb_build_object('kind', p_kind, 'row_id', p_row_id);

  elsif p_kind = 'user' then
    select u.auth_user_id, true into v_current, v_found from public.users u where u.id = p_row_id for update;
    if v_found is null then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if v_current is not null then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'linked';   -- A-128
    end if;
    update public.users u
       set auth_user_id = p_auth_user_id,
           log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'auth_user_linked'))
     where u.id = p_row_id;
    return jsonb_build_object('kind', p_kind, 'row_id', p_row_id);

  elsif p_kind = 'store' then
    select s.auth_user_id, true into v_current, v_found from public.stores s where s.id = p_row_id for update;
    if v_found is null then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if v_current is not null then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'linked';   -- A-128
    end if;
    update public.stores s
       set auth_user_id = p_auth_user_id,
           log = s.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'auth_user_linked'))
     where s.id = p_row_id;
    return jsonb_build_object('kind', p_kind, 'row_id', p_row_id);

  else
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_kind';   -- conventions §5's note
  end if;
end
$$;

-- A-114: the service role executes this and nothing else; authenticated and
-- sysadmin are not granted it.
revoke execute on function app.auth_user_link(text, uuid, uuid, uuid) from public;   -- A-103
grant  execute on function app.auth_user_link(text, uuid, uuid, uuid) to service_role;
-- A-104 as amended by A-114: service_role holds usage on app, for this function alone.
grant usage on schema app to service_role;

reset role;
