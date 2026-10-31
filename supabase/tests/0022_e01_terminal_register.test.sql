-- E-01 D M1 - app.terminal_register. Rows 3, 5, 28, 29 and 34.
--   E-01 d2 - a terminal is a browser session on a device; it registers once.
--   A-113 - no p_terminal_id; the initials resolve here; attributed to who stood at it.
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

-- ── Header (A-103, A-113, A-107, A-104) ────────────────────────────────────
select has_function('app', 'terminal_register', array['text', 'text', 'uuid'],
  'A-113 - app.terminal_register(p_actor_initials, p_name, p_request_id) exists');
select is(
  (select array_agg(n order by n) from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'app.terminal_register(text, text, uuid)'::regprocedure),
  array['p_actor_initials', 'p_name', 'p_request_id'],
  'A-113 - terminal_register takes no p_terminal_id: it mints the id every later call carries');
select ok((select prosecdef from pg_proc where oid = 'app.terminal_register(text, text, uuid)'::regprocedure),
  'A-103 - terminal_register is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'app.terminal_register(text, text, uuid)'::regprocedure),
  'A-103 - terminal_register sets search_path to empty');
select is((select proowner::regrole::text from pg_proc where oid = 'app.terminal_register(text, text, uuid)'::regprocedure),
  'waxworks_app', 'A-104 - terminal_register is owned by waxworks_app');
select ok(has_function_privilege('authenticated', 'app.terminal_register(text, text, uuid)', 'execute'),
  'A-107 - terminal_register: execute granted to authenticated');
select ok(not has_function_privilege('anon', 'app.terminal_register(text, text, uuid)', 'execute'),
  'A-107 - terminal_register: anon may not execute');
select ok(not has_function_privilege('service_role', 'app.terminal_register(text, text, uuid)', 'execute'),
  'A-114 - terminal_register: service_role may not execute');
select ok(not has_function_privilege('sysadmin', 'app.terminal_register(text, text, uuid)', 'execute'),
  'A-90 - terminal_register: sysadmin may not execute');

-- ── A-40 ────────────────────────────────────────────────────────────────────
select pg_temp.as_session('enrolment', null, null, '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select throws_ok(
  $$select app.terminal_register(p_actor_initials => 'MM', p_name => 'Till 9', p_request_id => gen_random_uuid())$$,
  '28000', 'no_tenant', 'A-40 - terminal_register under an enrolment session is refused no_tenant');
reset role;

-- ── E-01 d2: a browser on a store session registers itself ────────────────
create temp table registered (r jsonb);
grant all on registered to public;
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          null, '00000000-0000-0000-0009-0000000000a1');
insert into registered
  select app.terminal_register(p_actor_initials => ' ee', p_name => 'Till 3',
                               p_request_id => '00000000-0000-0000-0005-000000000001') as r;
reset role;

select is((select r ->> 'registered_by_user_id' from registered), '00000000-0000-0000-0002-000000000001',
  'A-113 - registering a terminal is attributed to whoever stood at it: the initials resolve at this Store');
select is(
  (select jsonb_build_object('org_id', t.org_id, 'store_id', t.store_id, 'name', t.name,
                             'request_id', t.request_id, 'principal', t.principal,
                             'registered_by_user_id', t.registered_by_user_id)
     from public.terminals t, registered x where t.id = (x.r ->> 'terminal_id')::uuid),
  jsonb_build_object('org_id', '00000000-0000-0000-0000-00000000000a', 'store_id', '00000000-0000-0000-0001-0000000000a1',
                     'name', 'Till 3', 'request_id', '00000000-0000-0000-0005-000000000001', 'principal', 'store',
                     'registered_by_user_id', '00000000-0000-0000-0002-000000000001'),
  'E-01 d2 - the terminal is a row of authz.store_id() with its till name, the request id and the principal (A-94)');

-- The id it returns is the one row 29's header verifies.
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          null, '00000000-0000-0000-0009-0000000000a1');
select is(
  app.actor_resolve(p_initials => 'MM', p_terminal_id => (select (r ->> 'terminal_id')::uuid from registered),
                    p_request_id => gen_random_uuid()) ->> 'user_id',
  '00000000-0000-0000-0002-000000000002',
  'E-01 d2 - the registered id is accepted as this Store''s terminal by the next call (A-94)');
reset role;
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          null, '00000000-0000-0000-0009-0000000000a2');
select is(
  pg_temp.err(format('select app.actor_resolve(p_initials => %L, p_terminal_id => %L, p_request_id => gen_random_uuid())',
                     'NN', (select r ->> 'terminal_id' from registered))) - 'details' - 'hint',
  '{"code": "28000", "message": "terminal_mismatch"}'::jsonb,
  'A-94 - the same id on another Store''s session is refused terminal_mismatch');

-- Initials not assigned here resolve to nobody.
select throws_ok(
  $$select app.terminal_register(p_actor_initials => 'EE', p_name => 'Till 9', p_request_id => gen_random_uuid())$$,
  'WX404', 'not_found', 'A-113 - terminal_register resolves initials only among the Users assigned to this Store');
reset role;

-- ── Refused on a personal session (E-01 d2, A-87) ──────────────────────────
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select throws_ok(
  $$select app.terminal_register(p_actor_initials => 'OO', p_name => 'Desk', p_request_id => gen_random_uuid())$$,
  '42501', 'role_refused',
  'E-01 d2 - terminal_register is refused on a personal session: a device holding one is not a terminal');
reset role;

select * from finish();
rollback;
