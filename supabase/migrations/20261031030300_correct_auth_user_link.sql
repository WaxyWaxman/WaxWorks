set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- Corrects app.auth_user_link (20261031013100, merged; A-101: never edited).
-- From the E-01 D order's review:
--   Finding 4, A-132: one Auth user is linked to at most one row across users,
--     stores and system_administrators. The user and store kinds refuse an Auth
--     user id already linked anywhere — invalid_state / auth_user_in_use —
--     checked under a transaction-scoped advisory lock on that id, so two
--     concurrent links of one id cannot both pass the check.
--   Findings 5 and 6, A-114, A-117: a null p_row_id or p_auth_user_id is
--     refused invalid_input (22023, conventions §5's note), the detail naming
--     the argument, before anything is read or logged. The passkey kind no
--     longer takes a null Auth id as matching an unlinked row.
--   Finding 6, A-87 (Employees have no Auth user): the user kind refuses an
--     Employee's row, invalid_state / employee.
--   A-131: the passkey kind clears users.enrolment_open_until — the first
--     enrolment closes the window its link opened.
-- Unchanged: the service-role assertion (A-113), A-128's `linked` and
-- principal = 'service', A-117's auth_user_mismatch and passkey_enrolled_at once.
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
  v_role    text;
  v_found   boolean;
  v_entry   jsonb;
begin
  -- A-113, A-114: the caller is the service role. The grant is the first wall;
  -- this is the second.
  if (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception 'role_refused' using errcode = '42501', detail = 'service';
  end if;

  -- Findings 5, 6: the arguments the database itself rejects (conventions §5).
  if p_kind is null or p_kind not in ('user', 'store', 'passkey') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_kind';
  end if;
  if p_row_id is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_row_id';
  end if;
  if p_auth_user_id is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_auth_user_id';
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
       set passkey_enrolled_at = coalesce(u.passkey_enrolled_at, now()),          -- set once (A-117)
           enrolment_open_until = null,                                         -- A-131: the window closes
           log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'passkey_enrolled'))
     where u.id = p_row_id;
    return jsonb_build_object('kind', p_kind, 'row_id', p_row_id);
  end if;

  -- The user and store kinds: the row, then the Auth user (A-128, A-132).
  if p_kind = 'user' then
    select u.auth_user_id, u.role, true into v_current, v_role, v_found
      from public.users u where u.id = p_row_id for update;
  else
    select s.auth_user_id, null, true into v_current, v_role, v_found
      from public.stores s where s.id = p_row_id for update;
  end if;
  if v_found is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  if v_current is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'linked';   -- A-128
  end if;
  if v_role = 'employee' then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee'; -- A-87: Employees have no Auth user
  end if;

  -- A-132: under a lock on the Auth id, it is linked nowhere else.
  perform pg_advisory_xact_lock(hashtextextended('auth_user:' || p_auth_user_id::text, 0));
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id)
     or exists (select 1 from public.stores s where s.auth_user_id = p_auth_user_id)
     or exists (select 1 from public.system_administrators a where a.auth_user_id = p_auth_user_id) then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'auth_user_in_use';
  end if;

  if p_kind = 'user' then
    update public.users u
       set auth_user_id = p_auth_user_id,
           log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'auth_user_linked'))
     where u.id = p_row_id;
  else
    update public.stores s
       set auth_user_id = p_auth_user_id,
           log = s.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'auth_user_linked'))
     where s.id = p_row_id;
  end if;
  return jsonb_build_object('kind', p_kind, 'row_id', p_row_id);
end
$$;

-- A-114: the service role executes this and nothing else.
revoke execute on function app.auth_user_link(text, uuid, uuid, uuid) from public;   -- A-103, A-107
grant  execute on function app.auth_user_link(text, uuid, uuid, uuid) to service_role;

reset role;
