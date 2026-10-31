-- E-01 D M1 - the review's corrections (the order's Findings 1-11), each named
-- for the decision that settles it.
--   A-129 - a read-only transaction is refused before any PIN is read (Finding 1).
--   A-130 - a store session only from a password sign-in (Finding 2).
--   A-131 - an enrolment session only inside an issued window (Finding 3).
--   A-132 - one Auth user, one row (Finding 4); A-114, A-87 - null ids and
--           Employees refused by auth_user_link (Findings 5, 6).
--   A-89  - a duplicate refuses rather than picking a row (Finding 8).
--   A-103 - the staff-session actor before the terminal (Finding 10).
--   A-125 (clarified 2026-10-31) - no_principal asserted (Finding 11).
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
-- Runs a statement after `set transaction read only`, as PostgREST runs an RPC
-- called by GET or HEAD, inside a subtransaction that the refusal rolls back.
create function pg_temp.err_ro(p_sql text) returns jsonb language plpgsql as $$
declare
  v_code text; v_msg text; v_detail text; v_hint text;
begin
  execute 'set transaction read only';
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                          v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return jsonb_build_object('code', v_code, 'message', v_msg,
                            'details', nullif(v_detail, ''), 'hint', nullif(v_hint, ''));
end
$$;

create function pg_temp.pin(p_pin text, p_terminal uuid, p_actor uuid default null, p_initials text default null,
                            p_request uuid default gen_random_uuid()) returns jsonb
language sql as $$
  select app.manager_authorize_pin(p_pin => p_pin, p_terminal_id => p_terminal, p_request_id => p_request,
                                   p_actor_user_id => p_actor, p_actor_initials => p_initials)
$$;
create function pg_temp.at_a1() returns void language sql as $$
  select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                            null, '00000000-0000-0000-0009-0000000000a1')
$$;
create function pg_temp.link(p_kind text, p_row uuid, p_auth uuid, p_request uuid default gen_random_uuid()) returns jsonb
language sql as $$
  select app.auth_user_link(p_kind => p_kind, p_row_id => p_row, p_auth_user_id => p_auth, p_request_id => p_request)
$$;
create function pg_temp.as_service() returns void language sql as $$
  select pg_temp.as_session(null, null, null, null, null, 'service_role')
$$;
create function pg_temp.hook(p_auth uuid, p_method text) returns jsonb language sql as $$
  select authz.access_token_hook(jsonb_build_object(
    'user_id', p_auth, 'authentication_method', p_method,
    'claims', jsonb_build_object('sub', p_auth, 'role', 'authenticated', 'aud', 'authenticated',
                                 'amr', jsonb_build_array(jsonb_build_object('method', p_method, 'timestamp', 1)))))
$$;

-- ── Finding 1 — A-129: a read-only transaction is refused before any PIN is read
-- PostgREST runs an RPC called by GET or HEAD read-only. A correct PIN would name
-- its holder and a wrong one could write no record, so neither may run.
select pg_temp.at_a1();
select is(
  pg_temp.err_ro($q$select pg_temp.pin('1111', '00000000-0000-0000-0003-000000000001')$q$),
  '{"code": "25006", "message": "read_only", "details": null, "hint": null}'::jsonb,
  'A-129 - manager_authorize_pin in a read-only transaction is refused 25006 read_only, a correct PIN included');
select is(
  pg_temp.err_ro($q$select pg_temp.pin('9999', '00000000-0000-0000-0003-000000000001')$q$),
  '{"code": "25006", "message": "read_only", "details": null, "hint": null}'::jsonb,
  'A-129 - a wrong PIN in a read-only transaction is refused the same, before any PIN is compared');
reset role;
select is((select current_setting('transaction_read_only')), 'off',
  'A-129 - (the probe ran in a subtransaction; the test transaction is writable again)');
select is((select count(*)::int from public.pin_refusals), 0,
  'A-129 - a read-only refusal writes nothing');
-- The guard runs after the header: tenant first (A-103, A-129).
select pg_temp.as_session('enrolment', null, null, '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select is(
  pg_temp.err_ro($q$select pg_temp.pin('1111', '00000000-0000-0000-0003-000000000001')$q$) - 'hint' - 'details',
  '{"code": "28000", "message": "no_tenant"}'::jsonb,
  'A-129 - the read-only guard runs after the tenant check: no tenant is still no_tenant');
reset role;
-- And before the pepper (A-129: before the pepper is read).
delete from vault.secrets where name = 'pin_pepper';
select pg_temp.at_a1();
select is(
  pg_temp.err_ro($q$select pg_temp.pin('1111', '00000000-0000-0000-0003-000000000001')$q$) ->> 'message',
  'read_only',
  'A-129 - the read-only guard runs before the pepper is read');
reset role;
select vault.create_secret('e01-test-pepper-fabricated-not-a-secret', 'pin_pepper')
 where not exists (select 1 from vault.secrets where name = 'pin_pepper');
update public.user_pins p set pin_hash = pg_temp.pin_hash(x.pin)
  from (values ('00000000-0000-0000-0002-000000000002'::uuid, '1111'), ('00000000-0000-0000-0002-000000000003'::uuid, '2222'),
               ('00000000-0000-0000-0002-000000000004'::uuid, '3333'), ('00000000-0000-0000-0002-000000000005'::uuid, '4444'),
               ('00000000-0000-0000-0002-00000000000b'::uuid, '1111')) x(user_id, pin)
 where p.user_id = x.user_id;

-- ── Finding 10 — A-103's order: the staff-session actor before the terminal ──
-- A-113: the exceptions keep A-103's assertion order for what they assert, and
-- A-103 puts principal and actor before the terminal; A-120 verifies the pair
-- "as a store session's header verifies them".
select pg_temp.at_a1();
select throws_ok(
  $$select pg_temp.pin('9998', '00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0002-000000000001', 'XX')$$,
  '28000', 'actor_mismatch',
  'A-103 - with both a wrong terminal and an unverified staff-session pair, the actor is refused first (A-113, A-120)');
reset role;

-- ── Finding 8 — A-89 "the one": a duplicate refuses, it never picks a row ───
-- Fixtures break M-04's uniqueness by hand, which no product function can.
insert into public.users (id, org_id, role, initials, display_name, email, active) values
  ('00000000-0000-0000-0002-0000000000d1', '00000000-0000-0000-0000-00000000000a', 'manager', 'EE', 'Dup Initials', null, true);
insert into public.store_assignments (org_id, user_id, store_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-0000000000d1', '00000000-0000-0000-0001-0000000000a1');
insert into public.user_pins (org_id, user_id, pin_hash) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-0000000000d1', pg_temp.pin_hash('1111'));
select pg_temp.at_a1();
select is(
  pg_temp.err($q$select app.actor_resolve(p_initials => 'EE', p_terminal_id => '00000000-0000-0000-0003-000000000001', p_request_id => gen_random_uuid())$q$) ->> 'code',
  'P0003',
  'E-01 d25 - initials held twice at a Store resolve to nobody: actor_resolve raises rather than picking one (A-89)');
select is(
  pg_temp.err($q$select app.terminal_register(p_actor_initials => 'EE', p_name => 'Till 9', p_request_id => gen_random_uuid())$q$) ->> 'code',
  'P0003',
  'E-01 d25 - terminal_register refuses initials held twice rather than picking one (A-113)');
select is(
  pg_temp.err($q$select pg_temp.pin('1111', '00000000-0000-0000-0003-000000000001')$q$) ->> 'code',
  'P0003',
  'E-01 d26 - a PIN held twice at a Store names nobody: manager_authorize_pin raises rather than picking one (A-89)');
reset role;
select is((select count(*)::int from public.pin_refusals), 0,
  'E-01 d26 - the duplicate PIN''s refusal writes no row and counts nothing');
delete from public.user_pins where user_id = '00000000-0000-0000-0002-0000000000d1';
delete from public.store_assignments where user_id = '00000000-0000-0000-0002-0000000000d1';
delete from public.users where id = '00000000-0000-0000-0002-0000000000d1';

-- ── Findings 4, 5, 6 — auth_user_link (A-132, A-128, A-114) ────────────────
insert into public.users (id, org_id, role, initials, display_name, email, auth_user_id, active) values
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-00000000000a', 'manager', 'UU', 'Una Unlinked', 'u@a.test', null, true);
insert into public.stores (id, org_id, trading_name, auth_user_id) values
  ('00000000-0000-0000-0001-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'A Three', null);
insert into public.system_administrators (auth_user_id, name, active) values
  ('00000000-0000-0000-0009-0000000000f1', 'Active Admin', true);

select pg_temp.as_service();
-- Finding 4 / A-132: the Owner's Auth user onto a Store.
select is(
  pg_temp.err($q$select pg_temp.link('store', '00000000-0000-0000-0001-0000000000a3', '00000000-0000-0000-0009-000000000003')$q$),
  '{"code": "WX409", "message": "invalid_state", "details": "auth_user_in_use", "hint": null}'::jsonb,
  'A-132 - an Auth user already linked to a users row is refused for a Store: invalid_state, auth_user_in_use');
select is(
  pg_temp.err($q$select pg_temp.link('user', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0009-0000000000a1')$q$),
  '{"code": "WX409", "message": "invalid_state", "details": "auth_user_in_use", "hint": null}'::jsonb,
  'A-132 - an Auth user already a Store''s account is refused for a person: invalid_state, auth_user_in_use');
select is(
  pg_temp.err($q$select pg_temp.link('user', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0009-0000000000f1')$q$),
  '{"code": "WX409", "message": "invalid_state", "details": "auth_user_in_use", "hint": null}'::jsonb,
  'A-132 - an Auth user that is a System Administrator is refused for a person: invalid_state, auth_user_in_use');
-- Findings 5, 6: null ids are refused with a key, and nothing is logged.
select is(
  pg_temp.err($q$select pg_temp.link('passkey', '00000000-0000-0000-0002-000000000006', null)$q$),
  '{"code": "22023", "message": "invalid_input", "details": "p_auth_user_id", "hint": null}'::jsonb,
  'A-117 - the passkey kind with a null Auth user is refused invalid_input, not taken as a match for an unlinked row');
select is(
  pg_temp.err($q$select pg_temp.link('user', '00000000-0000-0000-0002-000000000006', null)$q$),
  '{"code": "22023", "message": "invalid_input", "details": "p_auth_user_id", "hint": null}'::jsonb,
  'A-114 - the user kind with a null Auth user is refused invalid_input');
select is(
  pg_temp.err($q$select pg_temp.link('store', '00000000-0000-0000-0001-0000000000a3', null)$q$),
  '{"code": "22023", "message": "invalid_input", "details": "p_auth_user_id", "hint": null}'::jsonb,
  'A-114 - the store kind with a null Auth user is refused invalid_input');
select is(
  pg_temp.err($q$select pg_temp.link('user', null, '00000000-0000-0000-0009-0000000000e6')$q$),
  '{"code": "22023", "message": "invalid_input", "details": "p_row_id", "hint": null}'::jsonb,
  'A-114 - a null row id is refused invalid_input');
-- Finding 6: Employees have no Auth user (A-87).
select is(
  pg_temp.err($q$select pg_temp.link('user', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0009-0000000000e1')$q$),
  '{"code": "WX409", "message": "invalid_state", "details": "employee", "hint": null}'::jsonb,
  'A-87 - an Employee''s row is refused a link: invalid_state, employee');
reset role;
select is(
  (select jsonb_build_object('auth', auth_user_id, 'enrolled', passkey_enrolled_at, 'log', jsonb_array_length(log))
     from public.users where id = '00000000-0000-0000-0002-000000000006'),
  '{"auth": null, "enrolled": null, "log": 0}'::jsonb,
  'A-114 - the refused calls linked nothing, enrolled nothing and logged nothing');
select is((select auth_user_id from public.stores where id = '00000000-0000-0000-0001-0000000000a3'), null,
  'A-132 - the Store refused the Owner''s Auth user stays unlinked');
select is((select auth_user_id from public.users where id = '00000000-0000-0000-0002-000000000001'), null,
  'A-87 - the Employee stays without an Auth user');

-- ── Finding 3 — A-131: the passkey kind closes the enrolment window ─────────
update public.users set enrolment_open_until = now() + interval '24 hours'
 where id = '00000000-0000-0000-0002-000000000002';
select pg_temp.as_service();
select is(pg_temp.link('passkey', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002') ->> 'kind',
  'passkey', 'A-131 - the passkey enrolment is recorded');
reset role;
select is((select enrolment_open_until from public.users where id = '00000000-0000-0000-0002-000000000002'), null,
  'A-131 - the first passkey enrolment clears enrolment_open_until');

-- ── Findings 2, 3, 11 — the hook (A-130, A-131, A-125 clarified) ───────────
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000a1', 'password') #>> '{claims,principal}', 'store',
  'A-130 - a store account''s password token is a store session');
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000a1', 'otp'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-130 - a store account signed in by a link gets no token');
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000a1', 'magiclink'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-130 - nor by any method but password');

-- A person: outside a window, a link's token gets nothing; inside it, enrolment.
update public.users set enrolment_open_until = null where id = '00000000-0000-0000-0002-000000000003';
select is(pg_temp.hook('00000000-0000-0000-0009-000000000003', 'otp'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-131 - with no enrolment window, a person''s link token gets no session (M-04 d38: re-enrolled through an Owner)');
update public.users set enrolment_open_until = now() - interval '1 minute' where id = '00000000-0000-0000-0002-000000000003';
select is(pg_temp.hook('00000000-0000-0000-0009-000000000003', 'otp'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-131 - with the window passed, a person''s link token gets no session');
update public.users set enrolment_open_until = now() + interval '24 hours' where id = '00000000-0000-0000-0002-000000000003';
select is(pg_temp.hook('00000000-0000-0000-0009-000000000003', 'otp') #>> '{claims,principal}', 'enrolment',
  'A-131 - inside the window an Owner''s link token is an enrolment session (A-117)');
select is(pg_temp.hook('00000000-0000-0000-0009-000000000003', 'passkey') #>> '{claims,principal}', 'person',
  'A-131 - a passkey sign-in needs no window');

-- System Administrators carry the same window (A-131).
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000f1', 'otp'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-131 - a System Administrator''s link token outside a window gets no session');
update public.system_administrators set enrolment_open_until = now() + interval '24 hours'
 where auth_user_id = '00000000-0000-0000-0009-0000000000f1';
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000f1', 'otp') #>> '{claims,principal}', 'enrolment',
  'A-131 - inside the window it is an enrolment session');
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000f1', 'passkey') #>> '{claims,principal}', 'sysadmin',
  'A-110 - with a passkey it is a sysadmin session, window or not');

-- Finding 11 — A-125, clarified 2026-10-31: an Auth user matching no row.
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000ee', 'passkey'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-125 - an Auth user matching no row is refused no_principal');
update public.system_administrators set active = false, deactivated_at = now()
 where auth_user_id = '00000000-0000-0000-0009-0000000000f1';
select is(pg_temp.hook('00000000-0000-0000-0009-0000000000f1', 'passkey'),
  '{"error": {"http_code": 403, "message": "no_principal"}}'::jsonb,
  'A-110 - an inactive System Administrator is refused exactly as no row is: no_principal (A-125)');

-- ── Finding 33 — A-132: same-table duplicates, and the lock ─────────────────
select pg_temp.as_service();
-- Max Manager's Auth user onto Una, another users row.
select is(
  pg_temp.err($q$select pg_temp.link('user', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0009-000000000002')$q$),
  '{"code": "WX409", "message": "invalid_state", "details": "auth_user_in_use", "hint": null}'::jsonb,
  'A-132 - an Auth user already linked to a users row is refused for another users row: invalid_state, auth_user_in_use');
-- Store A1's account onto Store A3.
select is(
  pg_temp.err($q$select pg_temp.link('store', '00000000-0000-0000-0001-0000000000a3', '00000000-0000-0000-0009-0000000000a1')$q$),
  '{"code": "WX409", "message": "invalid_state", "details": "auth_user_in_use", "hint": null}'::jsonb,
  'A-132 - an Auth user already a Store''s account is refused for another Store: invalid_state, auth_user_in_use');
reset role;

-- The lock (A-132: "checked under an advisory lock"). A two-session race needs
-- two connections, which a pgTAP file does not have; what one session can show
-- is that a link takes the transaction-scoped advisory lock on its Auth id's key
-- and still holds it when the call returns, so a concurrent link of the same id
-- waits until this transaction ends. pg_locks splits the bigint key into
-- classid (high 32 bits) and objid (low 32 bits), objsubid 1.
create function pg_temp.auth_lock_held(p_auth uuid) returns boolean language sql as $$
  select exists (
    select 1 from pg_catalog.pg_locks l
     where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid() and l.granted
       and l.objsubid = 1 and l.mode = 'ExclusiveLock'
       and ((l.classid::bigint << 32) | l.objid::bigint)
           = pg_catalog.hashtextextended('auth_user:' || p_auth::text, 0))
$$;
select is(pg_temp.auth_lock_held('00000000-0000-0000-0009-0000000000e7'), false,
  'A-132 - before the link, no advisory lock is held on the Auth id');
select pg_temp.as_service();
select is(pg_temp.link('user', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0009-0000000000e7') ->> 'kind',
  'user', 'A-132 - a free Auth user links to a person');
reset role;
select is(pg_temp.auth_lock_held('00000000-0000-0000-0009-0000000000e7'), true,
  'A-132 - the link holds the transaction-scoped advisory lock on its Auth id until the transaction ends');

select has_column('public', 'users', 'enrolment_open_until', 'A-131 - users.enrolment_open_until');
select has_column('public', 'system_administrators', 'enrolment_open_until', 'A-131 - system_administrators.enrolment_open_until');

select * from finish();
rollback;
