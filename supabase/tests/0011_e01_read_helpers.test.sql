-- E-01 D M1 - the read helpers and section 5's two policy shapes, by principal.
-- Rows 13 (a), 14, 16 and 35 (pgTAP half) of the order.
--   A-122 - a personal session reads only while active and a Manager or Owner.
--   A-117 / E-01 d37 - an enrolment session reaches no row.
--   E-01 d36 - an Owner with no Store picked reads nothing store-dimensioned.
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

-- The helpers §5 names, in `authz` (A-124): owned by waxworks_app, functions only,
-- usage and execute for authenticated and sysadmin alone, not exposed to the API.
select has_function('authz', f, 'A-124 - authz.' || f || '() exists')
  from unnest(array['org_id', 'store_id', 'user_id', 'principal', 'org_reachable', 'store_reachable']) f;
select ok((select prosecdef from pg_proc where oid = ('authz.' || f || '()')::regprocedure),
          'A-122 - authz.' || f || '() is a security definer helper over users and store_assignments')
  from unnest(array['org_reachable', 'store_reachable']) f;
select is((select nspowner::regrole::text from pg_namespace where nspname = 'authz'), 'waxworks_app',
  'A-124 - schema authz is owned by waxworks_app');
select ok(has_schema_privilege('authenticated', 'authz', 'usage') and has_schema_privilege('sysadmin', 'authz', 'usage'),
  'A-124 - authenticated and sysadmin hold usage on authz');
select ok(not has_schema_privilege('anon', 'authz', 'usage') and not has_schema_privilege('service_role', 'authz', 'usage'),
  'A-124 - anon and service_role hold no usage on authz');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'authz'
      and p.proname in ('org_id', 'store_id', 'user_id', 'principal', 'org_reachable', 'store_reachable')
      and not (has_function_privilege('authenticated', p.oid, 'execute') and has_function_privilege('sysadmin', p.oid, 'execute'))),
  0, 'A-124 - each of the six helpers is executable by authenticated and sysadmin');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'authz' and p.proname <> 'pin_pepper' and p.proowner::regrole::text <> 'waxworks_app'),
  0, 'A-124 - every function in authz but A-127''s pin_pepper is owned by waxworks_app');

create function pg_temp.reads() returns jsonb language sql as $$
  select jsonb_build_object('terminals', (select count(*) from public.terminals),
                            'users', (select count(*) from public.users),
                            'organizations', (select count(*) from public.organizations))
$$;

-- ── A-117 / E-01 d37: an enrolment session reaches no row (E-01-T23) ───────
select pg_temp.as_session('enrolment', null, null, '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is(pg_temp.reads(), '{"terminals": 0, "users": 0, "organizations": 0}'::jsonb,
  'A-117 - an enrolment session reads no row of any table (E-01 d37, E-01-T23)');
reset role;

-- ── A-122 (1): a personal session reads only while active and Manager or Owner
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is(pg_temp.reads(), '{"terminals": 2, "users": 5, "organizations": 1}'::jsonb,
  'E-01 d27 - an active Manager''s personal session reads the picked Store and the Organization');
reset role;

update public.users set role = 'employee' where id = '00000000-0000-0000-0002-000000000002';
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is(pg_temp.reads(), '{"terminals": 0, "users": 0, "organizations": 0}'::jsonb,
  'A-122 - a personal session of a person demoted to Employee reads nothing, at once (M-04 d45, E-01 d27)');
reset role;

update public.users set role = 'manager', active = false where id = '00000000-0000-0000-0002-000000000002';
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is(pg_temp.reads(), '{"terminals": 0, "users": 0, "organizations": 0}'::jsonb,
  'A-122 - a personal session of a deactivated person reads nothing, at once (E-01 d30)');
reset role;
update public.users set active = true where id = '00000000-0000-0000-0002-000000000002';

-- A stale claim reads nothing: a Manager whose token names a Store they are not assigned to.
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is((select count(*)::int from public.terminals), 0,
  'E-01 d27 - a Manager''s claim naming an unassigned Store reads none of its rows (A-86: the assignment check is live)');
reset role;
-- An Owner may read a Store they are not assigned to.
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select is((select count(*)::int from public.terminals), 1,
  'E-01 d27 - an active Owner reads any Store of the Organization');
reset role;

-- ── E-01 d36: an Owner with no Store picked reads nothing store-dimensioned (E-01-T16)
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', null,
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select is(pg_temp.reads() - 'users', '{"terminals": 0, "organizations": 1}'::jsonb,
  'E-01 d36 - an Owner''s personal session with no Store picked reads nothing store-dimensioned, and its Organization');
reset role;

-- A store session is reachable as minted (A-86).
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          null, '00000000-0000-0000-0009-0000000000a2');
select is((select count(*)::int from public.terminals), 1, 'A-86 - a store session reads its own Store''s rows');
reset role;

select * from finish();
rollback;
