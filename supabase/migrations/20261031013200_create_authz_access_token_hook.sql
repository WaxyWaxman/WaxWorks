set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- authz.access_token_hook — A-125 (with A-87, A-110, A-117, A-122).
-- Supabase Auth calls it as supabase_auth_admin on every token issue and refresh.
-- A security definer owned by waxworks_app, so it reads users, stores and
-- system_administrators past row-level security; in `authz`, which the API does
-- not expose (A-124). A-113's sixth header exception: it takes Auth's event and
-- nothing else.
--
-- It returns the event's claims with §5.4's set:
--   * an active system_administrators row (A-110): with a passkey in `amr`,
--     principal = sysadmin and role = sysadmin; without one, an enrolment
--     session (A-117). An inactive row counts as no row.
--   * the store account of a Store (A-87, E-01 d24, d34): principal = store,
--     org_id, store_id — on its password; it has no second factor.
--   * a person linked at users.auth_user_id: refused if an Employee or inactive
--     (A-122), enrolment and personal sessions alike; with a passkey in `amr`,
--     principal = person, org_id, user_id and the picked store_id (A-87,
--     E-01 d33, d36); without one, principal = enrolment with the person's
--     user_id and no org_id or store_id (A-117, E-01 d37).
--   * nobody: refused. No principal applies, and a token with none reaches
--     nothing anyway (A-40); refusing it says so at sign-in. Not recorded as a
--     decision — see the order's Needs a human.
create or replace function authz.access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth    uuid := nullif(event ->> 'user_id', '')::uuid;
  v_claims  jsonb := coalesce(event -> 'claims', '{}'::jsonb) - 'principal' - 'org_id' - 'store_id' - 'user_id';
  v_passkey boolean;
  v_store   record;
  v_user    record;
begin
  v_passkey := exists (
    select 1 from jsonb_array_elements(coalesce(event -> 'claims' -> 'amr', '[]'::jsonb)) e
     where e ->> 'method' = 'passkey');

  -- A-110: System Administrators first.
  if exists (select 1 from public.system_administrators a where a.auth_user_id = v_auth and a.active) then
    if v_passkey then
      return jsonb_build_object('claims', v_claims || jsonb_build_object('principal', 'sysadmin', 'role', 'sysadmin'));
    end if;
    return jsonb_build_object('claims', v_claims || jsonb_build_object('principal', 'enrolment'));
  end if;

  -- A-87: a Store's store account.
  select s.id, s.org_id into v_store from public.stores s where s.auth_user_id = v_auth;
  if found then
    return jsonb_build_object('claims', v_claims || jsonb_build_object(
      'principal', 'store', 'org_id', v_store.org_id, 'store_id', v_store.id));
  end if;

  -- A-87, A-117, A-122: a person.
  select u.id, u.org_id, u.role, u.active, u.selected_store_id
    into v_user from public.users u where u.auth_user_id = v_auth;
  if found then
    if not v_user.active or v_user.role not in ('manager', 'owner') then
      return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'role_refused'));
    end if;
    if v_passkey then
      return jsonb_build_object('claims', v_claims || jsonb_strip_nulls(jsonb_build_object(
        'principal', 'person', 'org_id', v_user.org_id, 'user_id', v_user.id, 'store_id', v_user.selected_store_id)));
    end if;
    return jsonb_build_object('claims', v_claims || jsonb_build_object('principal', 'enrolment', 'user_id', v_user.id));
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'no_principal'));
end
$$;

-- A-125: supabase_auth_admin alone.
revoke execute on function authz.access_token_hook(jsonb) from public;   -- A-103, A-107
grant  execute on function authz.access_token_hook(jsonb) to supabase_auth_admin;

reset role;
