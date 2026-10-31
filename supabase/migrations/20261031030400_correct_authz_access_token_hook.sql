set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- Corrects authz.access_token_hook (20261031013200, merged; A-101: never edited).
-- From the E-01 D order's review:
--   Finding 2, A-130: a store account's token is issued only when `amr` carries
--     `password`. Any other method — a magic link or one-time code sent to the
--     store account's mailbox — gets no token, so the Owner's reset stays the
--     kill switch (E-01 d34).
--   Finding 3, A-131: an enrolment session (a person's or a System
--     Administrator's token with no passkey) is issued only while
--     enrolment_open_until is in the future; otherwise no token. Supabase Auth
--     mints a self-service link on request, and the database knows which links
--     it asked for.
-- A refusal the record does not name is the same `no_principal` (HTTP 403)
-- A-125 (clarified 2026-10-31) gives an Auth user matching no row: no principal
-- applies to this sign-in. The Employee and inactive refusals stay
-- `role_refused` (A-122). Everything else is unchanged.
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
  v_password boolean;
  v_window  timestamptz;
  v_refused constant jsonb := jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'no_principal'));
  v_store   record;
  v_user    record;
begin
  v_passkey := exists (
    select 1 from jsonb_array_elements(coalesce(event -> 'claims' -> 'amr', '[]'::jsonb)) e
     where e ->> 'method' = 'passkey');
  v_password := exists (
    select 1 from jsonb_array_elements(coalesce(event -> 'claims' -> 'amr', '[]'::jsonb)) e
     where e ->> 'method' = 'password');

  -- A-110: System Administrators first.
  select a.enrolment_open_until into v_window
    from public.system_administrators a where a.auth_user_id = v_auth and a.active;
  if found then
    if v_passkey then
      return jsonb_build_object('claims', v_claims || jsonb_build_object('principal', 'sysadmin', 'role', 'sysadmin'));
    end if;
    -- A-131: an enrolment session only inside the window set by hand.
    if v_window is not null and v_window > now() then
      return jsonb_build_object('claims', v_claims || jsonb_build_object('principal', 'enrolment'));
    end if;
    return v_refused;
  end if;

  -- A-87: a Store's store account.
  select s.id, s.org_id into v_store from public.stores s where s.auth_user_id = v_auth;
  if found then
    -- A-130: a store session only from a password sign-in.
    if not v_password then
      return v_refused;
    end if;
    return jsonb_build_object('claims', v_claims || jsonb_build_object(
      'principal', 'store', 'org_id', v_store.org_id, 'store_id', v_store.id));
  end if;

  -- A-87, A-117, A-122: a person.
  select u.id, u.org_id, u.role, u.active, u.selected_store_id, u.enrolment_open_until
    into v_user from public.users u where u.auth_user_id = v_auth;
  if found then
    if not v_user.active or v_user.role not in ('manager', 'owner') then
      return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'role_refused'));
    end if;
    if v_passkey then
      return jsonb_build_object('claims', v_claims || jsonb_strip_nulls(jsonb_build_object(
        'principal', 'person', 'org_id', v_user.org_id, 'user_id', v_user.id, 'store_id', v_user.selected_store_id)));
    end if;
    -- A-131: an enrolment session only inside the window a link opened.
    if v_user.enrolment_open_until is not null and v_user.enrolment_open_until > now() then
      return jsonb_build_object('claims', v_claims || jsonb_build_object('principal', 'enrolment', 'user_id', v_user.id));
    end if;
    return v_refused;
  end if;

  -- A-125, clarified 2026-10-31: an Auth user matching no row.
  return v_refused;
end
$$;

-- A-125: supabase_auth_admin alone.
revoke execute on function authz.access_token_hook(jsonb) from public;   -- A-103, A-107
grant  execute on function authz.access_token_hook(jsonb) to supabase_auth_admin;

reset role;
