-- E-01 D M1 - app.actor_resolve. Rows 3, 5, 7, 18, 19, 28, 29 and 33.
--   E-01 d25 - resolves among the Users assigned to authz.store_id() (E-01-T11).
--   E-01 d17 / A-55 - a deactivated User is refused at once (E-01-T8).
--   A-113 - a header exception: p_initials and p_terminal_id, no actor arguments.
--   A-92 - every refusal asserts its SQLSTATE and its key.
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
select has_function('app', 'actor_resolve', array['text', 'uuid', 'uuid'],
  'A-113 - app.actor_resolve(p_initials, p_terminal_id, p_request_id) exists');
select is(
  (select array_agg(n order by n) from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'app.actor_resolve(text, uuid, uuid)'::regprocedure),
  array['p_initials', 'p_request_id', 'p_terminal_id'],
  'A-113 - actor_resolve takes p_initials and p_terminal_id and no actor arguments, beside A-94''s p_request_id');
select ok((select prosecdef from pg_proc where oid = 'app.actor_resolve(text, uuid, uuid)'::regprocedure),
  'A-103 - actor_resolve is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'app.actor_resolve(text, uuid, uuid)'::regprocedure),
  'A-103 - actor_resolve sets search_path to empty');
select is((select proowner::regrole::text from pg_proc where oid = 'app.actor_resolve(text, uuid, uuid)'::regprocedure),
  'waxworks_app', 'A-104 - actor_resolve is owned by waxworks_app');
select ok(has_function_privilege('authenticated', 'app.actor_resolve(text, uuid, uuid)', 'execute'),
  'A-107 - actor_resolve: execute granted to authenticated');
select ok(not has_function_privilege('anon', 'app.actor_resolve(text, uuid, uuid)', 'execute'),
  'A-107 - actor_resolve: anon may not execute');
select ok(not has_function_privilege('service_role', 'app.actor_resolve(text, uuid, uuid)', 'execute'),
  'A-114 - actor_resolve: service_role may not execute');
select ok(not has_function_privilege('sysadmin', 'app.actor_resolve(text, uuid, uuid)', 'execute'),
  'A-90 - actor_resolve: sysadmin may not execute');

-- ── A-40 / A-117: an enrolment session has no tenant ───────────────────────
select pg_temp.as_session('enrolment', null, null, '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select throws_ok(
  $$select app.actor_resolve(p_initials => 'EE', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())$$,
  '28000', 'no_tenant',
  'A-40 - actor_resolve under an enrolment session is refused no_tenant (E-01 d37)');
reset role;

-- ── Store session at A1 ─────────────────────────────────────────────────────
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', null, '00000000-0000-0000-0009-0000000000a1');

select is(
  app.actor_resolve(p_initials => ' ee ', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())
    - 'role',
  '{"user_id": "00000000-0000-0000-0002-000000000001", "display_name": "Eve Employee"}'::jsonb,
  'E-01 d25 - initials typed at A1, trimmed and upper-cased, name the Employee assigned to A1 (E-01 d19: by name)');

-- E-01 d25 / E-01-T11: NN is assigned to A2 only.
select throws_ok(
  $$select app.actor_resolve(p_initials => 'NN', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())$$,
  'WX404', 'not_found',
  'E-01 d25 - initials held only at another Store are not resolved on this Store''s session (E-01-T11)');

-- E-01 d17 / A-55 / E-01-T8: DD is deactivated.
select throws_ok(
  $$select app.actor_resolve(p_initials => 'DD', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())$$,
  'WX404', 'not_found',
  'E-01 d17 - a deactivated User''s initials are refused at the write path (A-55, E-01-T8)');

-- A-94: a terminal of another Store.
select throws_ok(
  $$select app.actor_resolve(p_initials => 'EE', p_terminal_id => '00000000-0000-0000-0003-000000000003', p_request_id => gen_random_uuid())$$,
  '28000', 'terminal_mismatch',
  'A-94 - actor_resolve refuses a terminal of another Store terminal_mismatch');
select throws_ok(
  $$select app.actor_resolve(p_initials => 'EE', p_terminal_id => '00000000-0000-0000-0003-00000000000b', p_request_id => gen_random_uuid())$$,
  '28000', 'terminal_mismatch',
  'A-94 - actor_resolve refuses a terminal of another Organization terminal_mismatch');
reset role;

-- E-01 d17: the deactivation bites at once — M resolves, is deactivated, does not.
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', null, '00000000-0000-0000-0009-0000000000a1');
select is(
  app.actor_resolve(p_initials => 'MM', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid()) ->> 'user_id',
  '00000000-0000-0000-0002-000000000002',
  'E-01 d17 - before the deactivation, MM resolves');
reset role;
update public.users set active = false where id = '00000000-0000-0000-0002-000000000002';
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', null, '00000000-0000-0000-0009-0000000000a1');
select throws_ok(
  $$select app.actor_resolve(p_initials => 'MM', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())$$,
  'WX404', 'not_found',
  'E-01 d17 - in the same session, the moment the deactivation is written, MM is refused');
reset role;

-- A personal session has no terminal and no initials (E-01 d27): store session only.
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select throws_ok(
  $$select app.actor_resolve(p_initials => 'EE', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())$$,
  '42501', 'role_refused',
  'E-01 d27 - actor_resolve is refused on a personal session role_refused');
reset role;

-- E-01 d17's Open Sale exception (§6): N/A until M4 — there are no Sales.

select * from finish();
rollback;
