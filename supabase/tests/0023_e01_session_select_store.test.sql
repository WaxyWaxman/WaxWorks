-- E-01 D M1 - app.session_select_store. Rows 3, 5, 17 and 29.
--   E-01 d27 - a Manager picks an assigned Store, an Owner any; the pick is recorded.
--   E-01 d36 - nothing to pick changes nothing.
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

create function pg_temp.pick(p_actor uuid, p_store uuid, p_request uuid default gen_random_uuid(),
                             p_initials text default null, p_terminal uuid default null) returns jsonb
language sql as $$
  select app.session_select_store(p_actor_user_id => p_actor, p_actor_initials => p_initials,
                                  p_terminal_id => p_terminal, p_request_id => p_request, p_store_id => p_store)
$$;

-- ── Header (A-103, A-107, A-104) — session_select_store is not an A-113 exception
select has_function('app', 'session_select_store', array['uuid', 'text', 'uuid', 'uuid', 'uuid'],
  'A-103 - app.session_select_store carries the uniform header and p_store_id');
select is(
  (select array_agg(n order by n) from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'app.session_select_store(uuid, text, uuid, uuid, uuid)'::regprocedure),
  array['p_actor_initials', 'p_actor_user_id', 'p_request_id', 'p_store_id', 'p_terminal_id'],
  'A-113 - session_select_store takes the uniform header: it is none of the five exceptions');
select ok((select prosecdef from pg_proc where oid = 'app.session_select_store(uuid, text, uuid, uuid, uuid)'::regprocedure),
  'A-103 - session_select_store is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'app.session_select_store(uuid, text, uuid, uuid, uuid)'::regprocedure),
  'A-103 - session_select_store sets search_path to empty');
select is((select proowner::regrole::text from pg_proc where oid = 'app.session_select_store(uuid, text, uuid, uuid, uuid)'::regprocedure),
  'waxworks_app', 'A-104 - session_select_store is owned by waxworks_app');
select ok(has_function_privilege('authenticated', 'app.session_select_store(uuid, text, uuid, uuid, uuid)', 'execute'),
  'A-107 - session_select_store: execute granted to authenticated');
select ok(not has_function_privilege('anon', 'app.session_select_store(uuid, text, uuid, uuid, uuid)', 'execute'),
  'A-107 - session_select_store: anon may not execute');
select ok(not has_function_privilege('service_role', 'app.session_select_store(uuid, text, uuid, uuid, uuid)', 'execute'),
  'A-114 - session_select_store: service_role may not execute');
select ok(not has_function_privilege('sysadmin', 'app.session_select_store(uuid, text, uuid, uuid, uuid)', 'execute'),
  'A-90 - session_select_store: sysadmin may not execute');

-- ── A-40 ────────────────────────────────────────────────────────────────────
select pg_temp.as_session('enrolment', null, null, '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select throws_ok(
  $$select pg_temp.pick('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000a1')$$,
  '28000', 'no_tenant', 'A-40 - session_select_store under an enrolment session is refused no_tenant');
reset role;

-- ── E-01 d27: the Manager's pick ───────────────────────────────────────────
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', null,
                          '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is(
  pg_temp.pick('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000a1',
               '00000000-0000-0000-0005-000000000002'),
  '{"selected_store_id": "00000000-0000-0000-0001-0000000000a1",
    "stores": [{"store_id": "00000000-0000-0000-0001-0000000000a1", "trading_name": "A One"}]}'::jsonb,
  'E-01 d27 - a Manager picks a Store they are assigned to, and is offered only theirs');
select throws_ok(
  $$select pg_temp.pick('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000a2')$$,
  '42501', 'role_refused',
  'E-01 d27 - a Manager picking a Store they are not assigned to is refused role_refused (E-01-T13)');
select throws_ok(
  $$select pg_temp.pick('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000b1')$$,
  'WX404', 'not_found',
  'A-40 - another Organization''s Store is not found');
select throws_ok(
  $$select pg_temp.pick('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-0000000000a1')$$,
  '28000', 'actor_mismatch',
  'A-87 - on a personal session the actor is the session holder: anyone else is actor_mismatch');
reset role;

select is((select selected_store_id from public.users where id = '00000000-0000-0000-0002-000000000002'),
  '00000000-0000-0000-0001-0000000000a1'::uuid,
  'E-01 d27 - the pick is recorded at users.selected_store_id, for the hook to copy into the next token (A-87)');
select ok(
  jsonb_path_exists(
    (select log from public.users where id = '00000000-0000-0000-0002-000000000002'),
    '$[*] ? (@.request_id == "00000000-0000-0000-0005-000000000002" && @.principal == "person" && @.terminal_id == null
             && @.actor_user_id == "00000000-0000-0000-0002-000000000002")'),
  'A-94 - the pick''s users.log entry carries the request id, the principal and a null terminal on a personal session');

-- ── E-01 d27: an Owner may pick any active Store of the Organization ───────
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select is(
  pg_temp.pick('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-0000000000a2') ->> 'selected_store_id',
  '00000000-0000-0000-0001-0000000000a2',
  'E-01 d27 - an active Owner may pick a Store they are not assigned to');
reset role;
select is((select selected_store_id from public.users where id = '00000000-0000-0000-0002-000000000003'),
  '00000000-0000-0000-0001-0000000000a2'::uuid, 'E-01 d27 - the Owner''s pick is recorded');

-- E-01 d36: null picks nothing and changes nothing.
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select is(pg_temp.pick('00000000-0000-0000-0002-000000000003', null) ->> 'selected_store_id',
  '00000000-0000-0000-0001-0000000000a2', 'E-01 d36 - a null pick changes nothing and reports the current pick');
reset role;

-- ── Personal session only (E-01 d27) ───────────────────────────────────────
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          null, '00000000-0000-0000-0009-0000000000a1');
select throws_ok(
  $$select pg_temp.pick('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000a1',
                        gen_random_uuid(), 'MM', '00000000-0000-0000-0003-000000000001')$$,
  '42501', 'role_refused', 'E-01 d27 - a store session has no pick: session_select_store is refused role_refused');
reset role;

select * from finish();
rollback;
