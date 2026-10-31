-- E-01 D M1 - app.manager_authorize_pin and the PIN throttle.
-- Rows 20-26, 32, 33, 36, 37, 38 (all but its two-session concurrency case).
--   E-01 d26 - the one active Manager or Owner at this Store holding it, or nobody.
--   E-01 d31, d32, d38, d39; A-119, A-120, A-123, A-89, A-93, A-115.
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

-- ── Header (A-103, A-113, A-120, A-107, A-104) ─────────────────────────────
select has_function('app', 'manager_authorize_pin', array['text', 'uuid', 'uuid', 'uuid', 'text'],
  'A-120 - app.manager_authorize_pin(p_pin, p_terminal_id, p_request_id, p_actor_user_id, p_actor_initials) exists');
select is(
  (select array_agg(n order by n) from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)'::regprocedure),
  array['p_actor_initials', 'p_actor_user_id', 'p_pin', 'p_request_id', 'p_terminal_id'],
  'A-113 - manager_authorize_pin takes p_pin, p_terminal_id, p_request_id and A-120''s staff-session pair, nothing else');
select is((select prorettype::regtype::text from pg_proc where oid = 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)'::regprocedure),
  'jsonb', 'A-119 - manager_authorize_pin returns jsonb: a refusal the record must keep is returned');
select ok((select prosecdef from pg_proc where oid = 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)'::regprocedure),
  'A-103 - manager_authorize_pin is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)'::regprocedure),
  'A-103 - manager_authorize_pin sets search_path to empty');
select is((select proowner::regrole::text from pg_proc where oid = 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)'::regprocedure),
  'waxworks_app', 'A-104 - manager_authorize_pin is owned by waxworks_app');
select ok(has_function_privilege('authenticated', 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)', 'execute'),
  'A-107 - manager_authorize_pin: execute granted to authenticated');
select ok(not has_function_privilege('anon', 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)', 'execute'),
  'A-107 - manager_authorize_pin: anon may not execute');
select ok(not has_function_privilege('service_role', 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)', 'execute'),
  'A-114 - manager_authorize_pin: service_role may not execute');
select ok(not has_function_privilege('sysadmin', 'app.manager_authorize_pin(text, uuid, uuid, uuid, text)', 'execute'),
  'A-90 - manager_authorize_pin: sysadmin may not execute');

-- ── A-89: nothing but the definer reads a hash ─────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.user_pins', 'select')
      and not has_table_privilege('anon', 'public.user_pins', 'select')
      and not has_table_privilege('service_role', 'public.user_pins', 'select')
      and not has_table_privilege('sysadmin', 'public.user_pins', 'select'),
  'A-89 - no client role, the service role or sysadmin reads user_pins');

-- ── A-40 / A-117: tenant first ─────────────────────────────────────────────
select pg_temp.as_session('enrolment', null, null, '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0009-000000000002');
select throws_ok(
  $$select pg_temp.pin('1111', '00000000-0000-0000-0003-000000000001')$$,
  '28000', 'no_tenant',
  'A-40 - manager_authorize_pin under an enrolment session is refused no_tenant');
reset role;

-- Store session only: a personal session carries no PIN (E-01 d27).
select pg_temp.as_session('person', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0009-000000000003');
select throws_ok(
  $$select pg_temp.pin('2222', null)$$,
  '42501', 'role_refused',
  'E-01 d27 - manager_authorize_pin is refused on a personal session role_refused');
reset role;

-- A-94: a terminal of another Store, before any PIN is read; nothing recorded.
select pg_temp.at_a1();
select throws_ok(
  $$select pg_temp.pin('9999', '00000000-0000-0000-0003-000000000003')$$,
  '28000', 'terminal_mismatch',
  'A-94 - manager_authorize_pin refuses a terminal of another Store terminal_mismatch');
reset role;
select is((select count(*)::int from public.pin_refusals), 0,
  'A-94 - a terminal_mismatch writes no pin_refusals row');

-- ── E-01 d26: whom a PIN names ─────────────────────────────────────────────
select pg_temp.at_a1();
select is(pg_temp.pin('1111', '00000000-0000-0000-0003-000000000001'),
  '{"user_id": "00000000-0000-0000-0002-000000000002", "display_name": "Max Manager", "role": "manager"}'::jsonb,
  'E-01 d26 - 1111 at A1 names the one active Manager assigned to A1 holding it, not Org B''s holder of 1111');
reset role;
select is((select count(*)::int from public.pin_refusals), 0,
  'E-01 d38 - a correct PIN writes no refusal row');

-- Refusal 1 of 5 — NN's PIN is held at A2 only (E-01-T12).
select pg_temp.at_a1();
select is(pg_temp.pin('3333', '00000000-0000-0000-0003-000000000001'),
  '{"code": "28P01", "message": "pin_refused", "details": null, "hint": null}'::jsonb,
  'E-01 d26 - a PIN held only at another Store names nobody here: conventions §5''s body, 28P01 pin_refused (A-119, E-01-T12)');
reset role;

-- Refusal 2 of 5 — DD is deactivated.
select pg_temp.at_a1();
select is(pg_temp.pin('4444', '00000000-0000-0000-0003-000000000001'),
  '{"code": "28P01", "message": "pin_refused", "details": null, "hint": null}'::jsonb,
  'E-01 d26 - a deactivated holder''s PIN names nobody (A-122: active at the moment of the call)');
reset role;

-- A-119: the refused PIN's record survives — the call returned, it did not raise.
select is((select count(*)::int from public.pin_refusals
            where store_id = '00000000-0000-0000-0001-0000000000a1' and counted and closure_id is null),
  2, 'A-119 - each refused PIN''s row is written and kept: the refusal is returned, not raised');

-- A-123 / A-94: what a refusal row carries.
select is(
  (select jsonb_build_object('org_id', org_id, 'terminal_id', terminal_id, 'staff_user_id', staff_user_id,
                             'principal', principal, 'has_request', request_id is not null, 'has_at', at is not null)
     from public.pin_refusals order by at, id limit 1),
  jsonb_build_object('org_id', '00000000-0000-0000-0000-00000000000a', 'terminal_id', '00000000-0000-0000-0003-000000000001',
                     'staff_user_id', null, 'principal', 'store', 'has_request', true, 'has_at', true),
  'A-94 - a refusal row carries the request id, the terminal and the principal; no staff session open records none (A-120)');

-- ── A-120: the staff session's actor ───────────────────────────────────────
-- Refusal 3 of 5 — under Eve's open staff session, at the other terminal.
select pg_temp.at_a1();
select is(pg_temp.pin('9999', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0002-000000000001', 'ee')
            ->> 'message',
  'pin_refused', 'A-120 - a wrong PIN under an open staff session is refused');
reset role;
select is((select count(*)::int from public.pin_refusals
            where staff_user_id = '00000000-0000-0000-0002-000000000001'
              and terminal_id = '00000000-0000-0000-0003-000000000002'),
  1, 'A-120 - the refused PIN''s row records whose staff session was open, and at which terminal (E-01 d31, E-01-T19)');

-- A pair that does not verify is refused actor_mismatch before the PIN: no count, no row.
select pg_temp.at_a1();
select throws_ok(
  $$select pg_temp.pin('9998', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0002-000000000001', 'XX')$$,
  '28000', 'actor_mismatch',
  'A-120 - a staff-session pair that does not verify is refused actor_mismatch');
select throws_ok(
  $$select pg_temp.pin('9998', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0002-000000000004', 'NN')$$,
  '28000', 'actor_mismatch',
  'A-120 - a staff-session actor not assigned to this Store is refused actor_mismatch');
reset role;
select is((select count(*)::int from public.pin_refusals), 3,
  'A-120 - an actor_mismatch neither counts nor reaches the record');

-- A-120's half-null pair: conventions §5's note — invalid_input, 22023, the
-- detail naming the argument. Refused before anything is read or written.
select pg_temp.at_a1();
select is(
  pg_temp.err($q$select pg_temp.pin('9995', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0002-000000000001', null)$q$),
  '{"code": "22023", "message": "invalid_input", "details": "p_actor_initials", "hint": null}'::jsonb,
  'A-120 - an actor given without initials is refused 22023 invalid_input, naming p_actor_initials');
select is(
  pg_temp.err($q$select pg_temp.pin('9995', '00000000-0000-0000-0003-000000000002', null, 'EE')$q$),
  '{"code": "22023", "message": "invalid_input", "details": "p_actor_user_id", "hint": null}'::jsonb,
  'A-120 - initials given without an actor are refused 22023 invalid_input, naming p_actor_user_id');
reset role;
select is((select count(*)::int from public.pin_refusals), 3,
  'A-120 - a half pair neither counts nor reaches the record');

-- The PIN alone decides whom it names.
select pg_temp.at_a1();
select is(pg_temp.pin('1111', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0002-000000000001', 'EE') ->> 'user_id',
  '00000000-0000-0000-0002-000000000002',
  'A-120 - the staff session attributes and never authorizes: the PIN alone decides whom it names');
reset role;

-- Refusal 4 of 5.
select pg_temp.at_a1();
select is(pg_temp.pin('7351', '00000000-0000-0000-0003-000000000002') ->> 'message', 'pin_refused',
  'E-01 d31 - the fourth refusal is refused');
reset role;

-- ── E-01 d38: a correct PIN clears nothing; a missing PIN does not count ───
select pg_temp.at_a1();
select is(pg_temp.pin('2222', '00000000-0000-0000-0003-000000000001') ->> 'user_id',
  '00000000-0000-0000-0002-000000000003',
  'E-01 d38 - four refusals, then a success: the Owner''s PIN names the Owner');
select is(pg_temp.pin(null, '00000000-0000-0000-0003-000000000001') - 'hint' - 'details',
  '{"code": "28P01", "message": "pin_refused"}'::jsonb,
  'E-01 d38 - a missing PIN is refused pin_refused');
reset role;
select is((select count(*)::int from public.pin_refusals), 4,
  'E-01 d38 - a missing PIN writes no refusal row and leaves the count where it was');
select is((select count(*)::int from public.pin_line_closures), 0,
  'E-01 d31 - four refusals do not close the line');

-- Refusal 5 of 5 — across two terminals, after a success: the line closes.
select pg_temp.at_a1();
select is(pg_temp.pin('7352', '00000000-0000-0000-0003-000000000001'),
  '{"code": "28P01", "message": "pin_refused", "details": null, "hint": null}'::jsonb,
  'E-01 d31 - the fifth refusal is itself refused pin_refused');
reset role;

select is((select count(*)::int from public.pin_line_closures where store_id = '00000000-0000-0000-0001-0000000000a1'), 1,
  'E-01 d38 - four refusals, a success, then one refusal close the line: the success cleared nothing (E-01-T24)');
select is((select reopens_at - closed_at from public.pin_line_closures), interval '15 minutes',
  'E-01 d31 - the line closes for fifteen minutes');
select is((select jsonb_build_object('terminal_id', terminal_id, 'principal', principal, 'has_request', request_id is not null,
                                     'org_id', org_id)
             from public.pin_line_closures),
  jsonb_build_object('terminal_id', '00000000-0000-0000-0003-000000000001', 'principal', 'store', 'has_request', true,
                     'org_id', '00000000-0000-0000-0000-00000000000a'),
  'A-123 - the closure carries the fifth refusal''s terminal, request id and principal (A-94)');
select is((select count(distinct terminal_id)::int from public.pin_refusals
            where closure_id = (select id from public.pin_line_closures)),
  2, 'E-01 d31 - counted per Store across its terminals: the five came from two terminals (E-01-T18)');
-- E-01 d32: the pad's own check is under the same limit. Every refusal above came
-- through manager_authorize_pin alone, and they closed the line the M / O write
-- path's PIN resolution reads (that resolution is the M-04 D order's to build).
select is((select count(*)::int from public.pin_refusals where closure_id = (select id from public.pin_line_closures) and counted),
  5, 'E-01 d32 - refusals at the PIN pad count toward the Store''s five and close the line on their own (E-01-T20)');
select is((select count(*)::int from public.pin_refusals where closure_id is null and counted), 0,
  'E-01 d38 - the closure spends the five: no counted refusal is left unclaimed (A-123)');

-- ── The flag (A-28, A-68, E-01 d39, A-123) ─────────────────────────────────
select is((select count(*)::int from public.review_flags where kind = 'pin_line_closed'), 1,
  'A-28 - one review flag is raised when the line closes (E-01 d31)');
select is(
  (select jsonb_build_object('store_id', f.store_id, 'org_id', f.org_id, 'actor_user_id', f.actor_user_id,
                             'subject_type', f.subject_type, 'subject_is_closure', f.subject_id = c.id,
                             'has_created_at', f.created_at is not null, 'principal', f.principal,
                             'same_request', f.request_id = c.request_id, 'reviewed_at', f.reviewed_at)
     from public.review_flags f, public.pin_line_closures c
    where f.kind = 'pin_line_closed'),
  jsonb_build_object('store_id', '00000000-0000-0000-0001-0000000000a1', 'org_id', '00000000-0000-0000-0000-00000000000a',
                     'actor_user_id', null, 'subject_type', 'pin_line_closure', 'subject_is_closure', true,
                     'has_created_at', true, 'principal', 'store', 'same_request', true, 'reviewed_at', null),
  'E-01 d39 - the closure flag is the system''s, with no actor (A-68), its Store and time, and the closure as its subject (A-123)');
select is(
  (select count(*)::int from public.pin_refusals r, public.review_flags f
    where f.kind = 'pin_line_closed' and r.closure_id = f.subject_id and r.counted),
  5, 'E-01 d39 - the flag''s subject joins to exactly the five counted refusals that closed the line (E-01-T24)');

-- ── While closed (E-01 d31, d38) ───────────────────────────────────────────
-- The closure as it stood when the line closed, to compare after the attempts.
create temp table closure_before as
  select id, closed_at, reopens_at from public.pin_line_closures;
select pg_temp.at_a1();
select is(
  (select pg_temp.pin('1111', '00000000-0000-0000-0003-000000000002') - 'details'),
  '{"code": "WX429", "message": "pin_line_closed", "hint": null}'::jsonb,
  'E-01 d31 - while closed, even a correct PIN is refused WX429 pin_line_closed (E-01-T18)');
reset role;
select pg_temp.at_a1();
select is(
  (pg_temp.pin('9997', '00000000-0000-0000-0003-000000000001') ->> 'details')::timestamptz,
  (select reopens_at from public.pin_line_closures),
  'E-01 d31 - the closed refusal says when the line reopens: details is reopens_at, and names nobody');
select is(pg_temp.pin('9996', '00000000-0000-0000-0003-000000000001') ->> 'message', 'pin_line_closed',
  'E-01 d31 - a third attempt while closed is refused pin_line_closed');
-- A MISSING PIN while the line is closed is not asserted: E-01 d38 says a missing
-- PIN is refused pin_refused and writes no row, and that every attempt while
-- closed is refused with the reopening time and recorded. Which wins is not
-- recorded - an open question in the order's Needs a human.
reset role;
select is((select count(*)::int from public.pin_refusals r, public.pin_line_closures c
            where r.closure_id = c.id and not r.counted),
  3, 'E-01 d38 - three attempts while closed write three rows, counted = false, carrying the open closure (A-123)');
select is((select count(*)::int from public.pin_line_closures), 1,
  'E-01 d38 - attempts while closed do not start another closure');
select is(
  (select jsonb_build_object('closed_at', c.closed_at = b.closed_at, 'reopens_at', c.reopens_at = b.reopens_at)
     from public.pin_line_closures c join closure_before b on b.id = c.id),
  '{"closed_at": true, "reopens_at": true}'::jsonb,
  'E-01 d38 - attempts while closed do not move reopens_at: the closure is unchanged, not merely fifteen minutes long');
select is((select count(*)::int from public.review_flags), 1,
  'E-01 d38 - attempts while closed raise no further flag');

-- ── After reopening (E-01 d38), at Store A2, with a closure that has passed ─
insert into public.pin_line_closures (id, org_id, store_id, closed_at, reopens_at, terminal_id, request_id, principal) values
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
   now() - interval '20 minutes', now() - interval '5 minutes', '00000000-0000-0000-0003-000000000003', gen_random_uuid(), 'store');
insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, at, counted, closure_id, request_id, principal)
select '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2', '00000000-0000-0000-0003-000000000003',
       null, now() - interval '21 minutes', true, '00000000-0000-0000-0004-000000000001', gen_random_uuid(), 'store'
  from generate_series(1, 5);
-- and four counted, unclaimed refusals from before the window opened
insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, at, counted, closure_id, request_id, principal)
select '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2', '00000000-0000-0000-0003-000000000003',
       null, now() - interval '16 minutes', true, null, gen_random_uuid(), 'store'
  from generate_series(1, 4);

select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          null, '00000000-0000-0000-0009-0000000000a2');
select is(pg_temp.pin('7353', '00000000-0000-0000-0003-000000000003') ->> 'message', 'pin_refused',
  'E-01 d38 - after reopening, one refusal is refused pin_refused, not pin_line_closed');
select is(pg_temp.pin('3333', '00000000-0000-0000-0003-000000000003') ->> 'user_id',
  '00000000-0000-0000-0002-000000000004',
  'E-01 d38 - after reopening, a correct PIN names its holder');
reset role;
select is((select count(*)::int from public.pin_line_closures where store_id = '00000000-0000-0000-0001-0000000000a2'), 1,
  'E-01 d38 - the line reopens with an empty count: one refusal after it does not close it again (E-01-T24)');
select is((select count(*)::int from public.pin_refusals
            where store_id = '00000000-0000-0000-0001-0000000000a2' and counted and closure_id is null
              and at > now() - interval '15 minutes'),
  1, 'E-01 d31 - the window is fifteen minutes: refusals older than it are not counted');

-- ── A-93 / A-89: no digits, no hash, anywhere a record or refusal reaches ──
-- Digits are looked for in the rows less their timestamps and random ids, which
-- could hold any four digits by chance; the 64-character hash in the whole row.
create function pg_temp.tried() returns text[] language sql as $$
  select array['1111', '2222', '3333', '4444', '9999', '9998', '9997', '7351', '7352', '7353', '9996', '5555', '5554', '5553', '5552']
$$;
select is(
  (select count(*)::int from (
     select to_jsonb(r) as j, to_jsonb(r) - 'id' - 'at' - 'request_id' - 'closure_id' as k from public.pin_refusals r
     union all select to_jsonb(c), to_jsonb(c) - 'id' - 'closed_at' - 'reopens_at' - 'request_id' from public.pin_line_closures c
     union all select to_jsonb(f), to_jsonb(f) - 'id' - 'created_at' - 'request_id' - 'subject_id' from public.review_flags f) rows,
     unnest(pg_temp.tried()) d
    where rows.k::text like '%' || d || '%' or rows.j::text like '%' || pg_temp.pin_hash(d) || '%'),
  0, 'A-93 - no refusal row, closure or flag holds a PIN''s digits or its hash (E-01 d31: never the digits)');
select hasnt_column('public', 'pin_refusals', 'pin', 'A-93 - pin_refusals has no pin column');
select hasnt_column('public', 'pin_refusals', 'pin_hash', 'A-93 - pin_refusals has no hash column');

-- Every refusal path: wrong PIN (returned), closed line (returned; its details is
-- the reopening time, asserted above), actor_mismatch and terminal_mismatch (raised).
create temp table refusal_bodies (b jsonb, d text);
grant all on refusal_bodies to public;
select pg_temp.at_a1();
insert into refusal_bodies
  select pg_temp.pin('5552', '00000000-0000-0000-0003-000000000001') - 'details', '5552';
reset role;
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          null, '00000000-0000-0000-0009-0000000000a2');
insert into refusal_bodies values
  (pg_temp.pin('5555', '00000000-0000-0000-0003-000000000003'), '5555'),
  (pg_temp.err($q$select pg_temp.pin('5554', '00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0002-000000000004', 'XX')$q$), '5554'),
  (pg_temp.err($q$select pg_temp.pin('5553', '00000000-0000-0000-0003-000000000001')$q$), '5553');
reset role;
-- The hash is computed back as postgres: the session cannot read the pepper.
select is((select count(*)::int from refusal_bodies where b is not null), 4,
  'A-93 - four refusal paths captured: wrong PIN, closed line, actor_mismatch, terminal_mismatch');
select ok(
  (select bool_and(b::text not like '%' || d || '%' and b::text not like '%' || pg_temp.pin_hash(d) || '%') from refusal_bodies),
  'A-93 - every refusal path of manager_authorize_pin, returned or raised, carries neither the digits nor the hash in message, detail or hint');

-- ── A-127: one accessor reads the pepper ───────────────────────────────────
select has_function('authz', 'pin_pepper', array[]::text[], 'A-127 - authz.pin_pepper() exists');
select is((select proowner::regrole::text from pg_proc where oid = 'authz.pin_pepper()'::regprocedure),
  'pepper_reader', 'A-127 - authz.pin_pepper() is owned by pepper_reader');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'authz.pin_pepper()'::regprocedure),
  'A-127 - authz.pin_pepper() is security definer with an empty search_path');
select ok(has_function_privilege('waxworks_app', 'authz.pin_pepper()', 'execute'),
  'A-127 - waxworks_app may execute authz.pin_pepper()');
select is(
  (select count(*)::int from pg_roles r
    where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin', 'supabase_auth_admin')
      and has_function_privilege(r.rolname, 'authz.pin_pepper()', 'execute')),
  0, 'A-127 - no session role, the service role or Auth''s role executes authz.pin_pepper()');
select ok(not (select rolcanlogin from pg_roles where rolname = 'pepper_reader'), 'A-127 - pepper_reader cannot log in');
select ok(has_table_privilege('pepper_reader', 'vault.decrypted_secrets', 'select'),
  'A-127 - pepper_reader reads vault.decrypted_secrets');
select ok(not has_table_privilege('waxworks_app', 'vault.decrypted_secrets', 'select')
      and not has_schema_privilege('waxworks_app', 'vault', 'usage'),
  'A-127 - waxworks_app holds no grant on vault');
select ok(has_schema_privilege('waxworks_app', 'extensions', 'usage'),
  'A-127 - waxworks_app holds usage on extensions, for hmac');

-- ── A-115: fail closed without the pepper ──────────────────────────────────
delete from vault.secrets where name = 'pin_pepper';
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2',
                          null, '00000000-0000-0000-0009-0000000000a2');
select throws_ok(
  $$select pg_temp.pin('3333', '00000000-0000-0000-0003-000000000003')$$,
  'XX000', 'pin_pepper_missing',
  'A-115 - with the pin_pepper secret absent, manager_authorize_pin is refused XX000 pin_pepper_missing');
reset role;
select throws_ok($$select authz.pin_pepper()$$, 'XX000', 'pin_pepper_missing',
  'A-127 - the accessor itself raises pin_pepper_missing when the secret is absent');

select * from finish();
rollback;
