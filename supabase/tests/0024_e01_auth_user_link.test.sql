-- E-01 D M1 - app.auth_user_link, the service role's one function. Row 27.
--   A-114 - granted to service_role alone; it executes nothing else in app.
--   A-117 - the passkey kind: auth_user_mismatch, passkey_enrolled_at once, logged.
--   Relinking is BLOCKED (approval, 2026-10-31): only "does not replace" is held.
--
-- Written test-first and NOT YET RUN: no Docker daemon was reachable when
-- this file was written (see the order's Evidence). Its first run is expected red.
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

create function pg_temp.link(p_kind text, p_row uuid, p_auth uuid, p_request uuid default gen_random_uuid()) returns jsonb
language sql as $$
  select app.auth_user_link(p_kind => p_kind, p_row_id => p_row, p_auth_user_id => p_auth, p_request_id => p_request)
$$;
-- The service role, as Supabase's secret key selects it (A-109, A-114).
create function pg_temp.as_service() returns void language sql as $$
  select pg_temp.as_session(null, null, null, null, null, 'service_role')
$$;

-- A Manager added but not yet linked, and an unlinked Store.
insert into public.users (id, org_id, role, initials, display_name, email, auth_user_id, active) values
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-00000000000a', 'manager', 'UU', 'Una Unlinked', 'u@a.test', null, true);
insert into public.stores (id, org_id, trading_name, auth_user_id) values
  ('00000000-0000-0000-0001-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'A Three', null);

-- ── Header and grants (A-113, A-114, A-103, A-104, A-107) ──────────────────
select has_function('app', 'auth_user_link', array['text', 'uuid', 'uuid', 'uuid'],
  'A-113 - app.auth_user_link(p_kind, p_row_id, p_auth_user_id, p_request_id) exists');
select is(
  (select array_agg(n order by n) from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'app.auth_user_link(text, uuid, uuid, uuid)'::regprocedure),
  array['p_auth_user_id', 'p_kind', 'p_request_id', 'p_row_id'],
  'A-113 - auth_user_link takes the kind and id of the row it completes and the Auth user id, beside p_request_id, and nothing else');
select ok((select prosecdef from pg_proc where oid = 'app.auth_user_link(text, uuid, uuid, uuid)'::regprocedure),
  'A-103 - auth_user_link is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'app.auth_user_link(text, uuid, uuid, uuid)'::regprocedure),
  'A-103 - auth_user_link sets search_path to empty');
select is((select proowner::regrole::text from pg_proc where oid = 'app.auth_user_link(text, uuid, uuid, uuid)'::regprocedure),
  'waxworks_app', 'A-104 - auth_user_link is owned by waxworks_app');
select ok(has_function_privilege('service_role', 'app.auth_user_link(text, uuid, uuid, uuid)', 'execute'),
  'A-114 - auth_user_link: execute granted to service_role');
select ok(not has_function_privilege('authenticated', 'app.auth_user_link(text, uuid, uuid, uuid)', 'execute'),
  'A-114 - auth_user_link: authenticated may not execute');
select ok(not has_function_privilege('sysadmin', 'app.auth_user_link(text, uuid, uuid, uuid)', 'execute'),
  'A-114 - auth_user_link: sysadmin may not execute');
select ok(not has_function_privilege('anon', 'app.auth_user_link(text, uuid, uuid, uuid)', 'execute'),
  'A-107 - auth_user_link: anon may not execute');
select ok(has_schema_privilege('service_role', 'app', 'usage'),
  'A-114 - service_role holds usage on schema app');
select is(
  (select array_agg(p.proname::text)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and has_function_privilege('service_role', p.oid, 'execute')),
  array['auth_user_link'],
  'A-114 - service_role executes auth_user_link and nothing else in app');

-- An authenticated session cannot reach it at all: a grant denial, not a refusal key.
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          null, '00000000-0000-0000-0009-0000000000a1');
select throws_ok(
  $$select pg_temp.link('user', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0009-000000000006')$$,
  '42501', null, 'A-114 - a store session is denied execute on auth_user_link');
reset role;

-- ── The user and store kinds (A-91, A-114) ─────────────────────────────────
select pg_temp.as_service();
select is(pg_temp.link('user', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0009-000000000006',
                       '00000000-0000-0000-0005-000000000003'),
  '{"kind": "user", "row_id": "00000000-0000-0000-0002-000000000006"}'::jsonb,
  'A-114 - the service role links a new Auth user to a users row');
select is(pg_temp.link('store', '00000000-0000-0000-0001-0000000000a3', '00000000-0000-0000-0009-0000000000a3',
                       '00000000-0000-0000-0005-000000000004'),
  '{"kind": "store", "row_id": "00000000-0000-0000-0001-0000000000a3"}'::jsonb,
  'A-114 - the service role links a store account to a stores row');
reset role;
select is((select auth_user_id from public.users where id = '00000000-0000-0000-0002-000000000006'),
  '00000000-0000-0000-0009-000000000006'::uuid, 'A-114 - users.auth_user_id is written');
select is((select auth_user_id from public.stores where id = '00000000-0000-0000-0001-0000000000a3'),
  '00000000-0000-0000-0009-0000000000a3'::uuid, 'A-114 - stores.auth_user_id is written');
select ok(jsonb_path_exists((select log from public.users where id = '00000000-0000-0000-0002-000000000006'),
            '$[*] ? (@.request_id == "00000000-0000-0000-0005-000000000003")'),
  'A-94 - the link is logged on users.log with its request id');
select ok(jsonb_path_exists((select log from public.stores where id = '00000000-0000-0000-0001-0000000000a3'),
            '$[*] ? (@.request_id == "00000000-0000-0000-0005-000000000004")'),
  'A-94 - the link is logged on stores.log with its request id');

-- A-128: a row already linked is refused invalid_state / linked — another Auth
-- user or the same one, users or stores.
select pg_temp.as_service();
select is(
  pg_temp.err($$select pg_temp.link('user', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-0000000000ff')$$),
  '{"code": "WX409", "message": "invalid_state", "details": "linked", "hint": null}'::jsonb,
  'A-128 - a users row already linked is refused WX409 invalid_state, linked');
select is(
  pg_temp.err($$select pg_temp.link('user', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002')$$),
  '{"code": "WX409", "message": "invalid_state", "details": "linked", "hint": null}'::jsonb,
  'A-128 - even to the same Auth user: the row it completes is completed once');
select is(
  pg_temp.err($$select pg_temp.link('store', '00000000-0000-0000-0001-0000000000a1', '00000000-0000-0000-0009-0000000000ff')$$),
  '{"code": "WX409", "message": "invalid_state", "details": "linked", "hint": null}'::jsonb,
  'A-128 - a stores row already linked is refused WX409 invalid_state, linked');
reset role;
select is((select auth_user_id from public.users where id = '00000000-0000-0000-0002-000000000002'),
  '00000000-0000-0000-0009-000000000002'::uuid,
  'A-128 - auth_user_link never replaces an existing link');
select ok(jsonb_path_exists((select log from public.users where id = '00000000-0000-0000-0002-000000000006'),
            '$[*] ? (@.request_id == "00000000-0000-0000-0005-000000000003" && @.principal == "service")'),
  'A-128 - the row auth_user_link writes carries principal = service');

-- ── The passkey kind (A-117) ───────────────────────────────────────────────
select pg_temp.as_service();
select is(
  pg_temp.err($$select pg_temp.link('passkey', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000003')$$),
  '{"code": "WX409", "message": "invalid_state", "details": "auth_user_mismatch", "hint": null}'::jsonb,
  'A-117 - a passkey enrolment for a row not linked to p_auth_user_id is refused WX409 invalid_state, auth_user_mismatch');
select is(pg_temp.link('passkey', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002',
                       '00000000-0000-0000-0005-000000000005'),
  '{"kind": "passkey", "row_id": "00000000-0000-0000-0002-000000000002"}'::jsonb,
  'A-117 - the service role records a passkey enrolment for the linked row');
reset role;
create temp table first_enrolment as
  select passkey_enrolled_at as at from public.users where id = '00000000-0000-0000-0002-000000000002';
select isnt((select at from first_enrolment), null, 'A-117 - passkey_enrolled_at is set');
select ok(jsonb_path_exists((select log from public.users where id = '00000000-0000-0000-0002-000000000002'),
            '$[*] ? (@.action == "passkey_enrolled" && @.request_id == "00000000-0000-0000-0005-000000000005")'),
  'A-117 - the enrolment is logged on users.log, never a credential (A-93)');

update public.users set passkey_enrolled_at = passkey_enrolled_at - interval '1 day'
 where id = '00000000-0000-0000-0002-000000000002';
select pg_temp.as_service();
select pg_temp.link('passkey', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
reset role;
select is((select passkey_enrolled_at from public.users where id = '00000000-0000-0000-0002-000000000002'),
  (select at - interval '1 day' from first_enrolment),
  'A-117 - passkey_enrolled_at is set once: a second enrolment leaves it where it was');
select is((select passkey_enrolled_at from public.users where id = '00000000-0000-0000-0002-000000000004'), null,
  'A-117 - the refused enrolment set nothing on another row');

select * from finish();
rollback;
