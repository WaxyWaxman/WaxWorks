-- E-01 D M1 - the access-token hook, called directly as Supabase Auth calls it.
-- The unit half of rows 9-17 and 35; the integration half is not in this file.
--   A-87, A-110, A-117, A-122; E-01 d24, d33, d34, d36, d37.
--
begin;
select no_plan();

-- ── Fixture (E-01 D M1 — fixtures only, row 8: these rows stand in for
--    organization_create, store_create, user_add, user_assign, user_set_pin and
--    terminal_register, which are other orders' or are under test here) ───────
--
-- Org A: Store A1 and Store A2.  Org B: Store B1.
--   E  Employee  'EE'  A1
--   M  Manager   'MM'  A1        PIN 1111   linked to Auth user ..09..02
--   O  Owner     'OO'  A1        PIN 2222   linked to Auth user ..09..03
--   N  Manager   'NN'  A2 only   PIN 3333   linked to Auth user ..09..04
--   D  Manager   'DD'  A1        PIN 4444   DEACTIVATED, linked ..09..05
--   B  Manager   'BB'  B1 (Org B) PIN 1111  linked to Auth user ..09..0b
-- Terminals: T1, T2 at A1; T3 at A2; TB at B1.

-- A-115: the seed creates the fabricated local pepper; a test does not rely on
-- the seed having run, so it makes one inside its own transaction if absent.
select vault.create_secret('e01-test-pepper-fabricated-not-a-secret', 'pin_pepper')
 where not exists (select 1 from vault.secrets where name = 'pin_pepper');

-- A-89: HMAC-SHA-256 of the four digits under the Vault pepper.
create function pg_temp.pin_hash(p_pin text) returns text language sql as $$
  select encode(extensions.hmac(p_pin,
           (select decrypted_secret from vault.decrypted_secrets where name = 'pin_pepper'),
           'sha256'), 'hex')
$$;

-- §5.4's claims, as the access-token hook would mint them, then the
-- `authenticated` role PostgREST would select. `p_role` is the JWT role claim.
create function pg_temp.as_session(p_principal text, p_org uuid, p_store uuid, p_user uuid, p_sub uuid,
                                   p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_sub, 'principal', p_principal,
                                         'org_id', p_org, 'store_id', p_store, 'user_id', p_user))::text,
    true);
  perform set_config('role', p_role, true);
end
$$;

-- Runs a statement and returns what it raised as conventions §5's body, or null.
-- Used where a test needs the DETAIL (invalid_state's closed list) or must show
-- a raised error carries no digits (A-93).
create function pg_temp.err(p_sql text) returns jsonb language plpgsql as $$
declare
  v_code text; v_msg text; v_detail text; v_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                          v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return jsonb_build_object('code', v_code, 'message', v_msg,
                            'details', nullif(v_detail, ''), 'hint', nullif(v_hint, ''));
end
$$;

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B');

insert into public.stores (id, org_id, trading_name, auth_user_id) values
  ('00000000-0000-0000-0001-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A One', '00000000-0000-0000-0009-0000000000a1'),
  ('00000000-0000-0000-0001-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A Two', '00000000-0000-0000-0009-0000000000a2'),
  ('00000000-0000-0000-0001-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B One', '00000000-0000-0000-0009-0000000000b1');

insert into public.users (id, org_id, role, initials, display_name, email, auth_user_id, active) values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-00000000000a', 'employee', 'EE', 'Eve Employee', null, null, true),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-00000000000a', 'manager',  'MM', 'Max Manager',  'm@a.test', '00000000-0000-0000-0009-000000000002', true),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-00000000000a', 'owner',    'OO', 'Olive Owner',  'o@a.test', '00000000-0000-0000-0009-000000000003', true),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-00000000000a', 'manager',  'NN', 'Nat Twostore', 'n@a.test', '00000000-0000-0000-0009-000000000004', true),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-00000000000a', 'manager',  'DD', 'Dee Departed', 'd@a.test', '00000000-0000-0000-0009-000000000005', false),
  ('00000000-0000-0000-0002-00000000000b', '00000000-0000-0000-0000-00000000000b', 'manager',  'BB', 'Bo Otherorg',  'b@b.test', '00000000-0000-0000-0009-00000000000b', true);

insert into public.store_assignments (org_id, user_id, store_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0001-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0002-00000000000b', '00000000-0000-0000-0001-0000000000b1');

insert into public.user_pins (org_id, user_id, pin_hash) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000002', pg_temp.pin_hash('1111')),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000003', pg_temp.pin_hash('2222')),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000004', pg_temp.pin_hash('3333')),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000005', pg_temp.pin_hash('4444')),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0002-00000000000b', pg_temp.pin_hash('1111'));

insert into public.terminals (id, org_id, store_id, name) values
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', 'Till 1'),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', 'Till 2'),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2', 'Till 1'),
  ('00000000-0000-0000-0003-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0001-0000000000b1', 'Till 1');
-- ── end fixture ─────────────────────────────────────────────────────────────

-- The access-token hook's own logic, called as Supabase Auth calls it: an event
-- carrying the Auth user id and the claims about to be signed, `amr` among them.
-- This is the UNIT half of rows 9-17 and 35; the Checklist's integration half —
-- real tokens from local Supabase Auth — is not here (see the order's Evidence).
create function pg_temp.hook(p_auth uuid, p_method text) returns jsonb language sql as $$
  select authz.access_token_hook(jsonb_build_object(
    'user_id', p_auth,
    'authentication_method', p_method,
    'claims', jsonb_build_object('sub', p_auth, 'role', 'authenticated', 'aud', 'authenticated',
                                 'amr', jsonb_build_array(jsonb_build_object('method', p_method, 'timestamp', 1)))))
$$;

insert into public.system_administrators (auth_user_id, name, active, added_at) values
  ('00000000-0000-0000-0009-0000000000f1', 'Active Admin', true, now()),
  ('00000000-0000-0000-0009-0000000000f2', 'Former Admin', false, now() - interval '1 year');
update public.system_administrators set deactivated_at = now() where auth_user_id = '00000000-0000-0000-0009-0000000000f2';
update public.users set selected_store_id = '00000000-0000-0000-0001-0000000000a1' where id = '00000000-0000-0000-0002-000000000002';
-- A-131: an enrolment session exists only inside a window an Owner or a System
-- Administrator opened. M-04's and S-01's link-sending functions set it; this
-- fixture sets it by hand for the enrolment cases below.
update public.users set enrolment_open_until = now() + interval '24 hours'
 where id in ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0002-000000000004');
update public.system_administrators set enrolment_open_until = now() + interval '24 hours'
 where auth_user_id = '00000000-0000-0000-0009-0000000000f1';

-- ── Grants ─────────────────────────────────────────────────────────────────
select has_function('authz', 'access_token_hook', array['jsonb'], 'A-125 - the access-token hook is authz.access_token_hook(jsonb)');
select is(
  (select array_agg(n order by n) from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'authz.access_token_hook(jsonb)'::regprocedure),
  array['event'], 'A-125 - the hook takes Auth''s event and nothing else: A-113''s sixth exception');
select ok((select prosecdef from pg_proc where oid = 'authz.access_token_hook(jsonb)'::regprocedure),
  'A-125 - the hook is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'authz.access_token_hook(jsonb)'::regprocedure),
  'A-103 - the hook sets search_path to empty');
select is((select proowner::regrole::text from pg_proc where oid = 'authz.access_token_hook(jsonb)'::regprocedure),
  'waxworks_app', 'A-125 - the hook is owned by waxworks_app');
select ok(has_function_privilege('supabase_auth_admin', 'authz.access_token_hook(jsonb)', 'execute')
      and has_schema_privilege('supabase_auth_admin', 'authz', 'usage'),
  'A-125 - supabase_auth_admin may execute the hook');
select ok(not has_function_privilege('authenticated', 'authz.access_token_hook(jsonb)', 'execute'),
  'A-125 - authenticated may not execute the hook');
select ok(not has_function_privilege('anon', 'authz.access_token_hook(jsonb)', 'execute'),
  'A-125 - anon may not execute the hook');
select ok(not has_function_privilege('sysadmin', 'authz.access_token_hook(jsonb)', 'execute'),
  'A-125 - sysadmin may not execute the hook');
select ok(not has_function_privilege('service_role', 'authz.access_token_hook(jsonb)', 'execute'),
  'A-114 - service_role may not execute the hook');

-- ── E-01 d24, d34: the store account (E-01-T9) ─────────────────────────────
select is(
  (select c - 'sub' - 'role' - 'aud' - 'amr' from (select pg_temp.hook('00000000-0000-0000-0009-0000000000a1', 'password') -> 'claims' c) x),
  '{"principal": "store", "org_id": "00000000-0000-0000-0000-00000000000a", "store_id": "00000000-0000-0000-0001-0000000000a1"}'::jsonb,
  'E-01 d24 - a store account''s password token is a store session carrying its Organization and Store (A-87)');
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000a1', 'password') #>> '{claims,principal}', 'store',
  'E-01 d34 - the store account has no second factor: its password token is a store session, never an enrolment session');

-- ── E-01 d33: a person's passkey token is a personal session ───────────────
select is(
  (select c - 'sub' - 'role' - 'aud' - 'amr' from (select pg_temp.hook('00000000-0000-0000-0009-000000000002', 'passkey') -> 'claims' c) x),
  '{"principal": "person", "org_id": "00000000-0000-0000-0000-00000000000a", "user_id": "00000000-0000-0000-0002-000000000002",
    "store_id": "00000000-0000-0000-0001-0000000000a1"}'::jsonb,
  'E-01 d33 - a Manager''s passkey token is a personal session carrying org_id, user_id and the selected store_id (E-01 d27)');

-- ── A-117 / E-01 d37: anything but a passkey is an enrolment session ───────
select is(
  (select c - 'sub' - 'role' - 'aud' - 'amr' from (select pg_temp.hook('00000000-0000-0000-0009-000000000002', 'otp') -> 'claims' c) x),
  '{"principal": "enrolment", "user_id": "00000000-0000-0000-0002-000000000002"}'::jsonb,
  'A-117 - a person''s OTP token (an invitation link) is an enrolment session with null org_id and store_id (E-01 d37)');
select isnt(pg_temp.hook('00000000-0000-0000-0009-000000000002', 'otp') #>> '{claims,principal}', 'person',
  'E-01 d33 - a person''s OTP-only token is never principal=person');

-- ── E-01 d36: an Owner with no Store picked ────────────────────────────────
select is(pg_temp.hook('00000000-0000-0000-0009-000000000003', 'passkey') #>> '{claims,store_id}', null,
  'E-01 d36 - an Owner with no Store picked gets a personal session with no store_id');
select is(pg_temp.hook('00000000-0000-0000-0009-000000000003', 'passkey') #>> '{claims,principal}', 'person',
  'E-01 d36 - and it is a personal session');

-- ── A-110: System Administrators ───────────────────────────────────────────
select is(
  (select c - 'sub' - 'aud' - 'amr' from (select pg_temp.hook('00000000-0000-0000-0009-0000000000f1', 'passkey') -> 'claims' c) x),
  '{"principal": "sysadmin", "role": "sysadmin"}'::jsonb,
  'A-110 - an active system_administrators row yields principal=sysadmin, the sysadmin role, and null org_id, store_id, user_id');
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000f2', 'passkey'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-110 - an inactive system_administrators row is refused exactly as no row is: no_principal (A-125, clarified 2026-10-31)');
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000f1', 'otp') #>> '{claims,principal}', 'enrolment',
  'A-117 - a System Administrator''s token without a passkey is an enrolment session');

-- ── A-122 (2): no token for an Employee or an inactive person ──────────────
select ok(pg_temp.hook('00000000-0000-0000-0009-000000000005', 'passkey') ? 'error',
  'A-122 - the hook returns an error, not a token, for a deactivated person');
update public.users set role = 'employee' where id = '00000000-0000-0000-0002-000000000004';
select ok(pg_temp.hook('00000000-0000-0000-0009-000000000004', 'passkey') ? 'error',
  'A-122 - the hook returns an error for a person demoted to Employee (M-04 d45)');
select ok(pg_temp.hook('00000000-0000-0000-0009-000000000004', 'otp') ? 'error',
  'A-122 - and refuses an enrolment session to a demoted Employee: a stale link enrols nothing');

select * from finish();
rollback;
