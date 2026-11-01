-- M-04 D M1 - the ten user-administration functions: their header and their record.
-- Rows 1-5, 7, 11 and 12 of the order.
--   A-4, A-103, A-104, A-107 - definer, empty search_path, owner, grants; the M / O header.
--   A-86   - another Organization's user or Store is not_found.
--   A-94   - every log entry carries the request id, the terminal and the principal.
--   M-04 d31, d4 - the authoriser is the PIN's holder on a store session and the
--                  session holder on a personal one; both names recorded.
--   A-119, A-121 - a refusal the record must keep is returned; Add's clash is raised.
--   A-129  - a read-only transaction is refused before any PIN is read.
begin;
select no_plan();

-- ── Fixture (M-04 D M1). These rows stand in for organization_create (S-01),
--    store_create (O-01) and terminal_register, which are other orders' or
--    another flow's; the people are written by hand only where the product
--    function under test cannot be the writer of its own precondition. ───────
--
-- Org A: Stores A1, A2, A3.  Org B: Store B1.
--   01 E  Employee 'EE' Eve Employee   A1                   no email
--   02 M  Manager  'MM' Max Manager    A1        PIN 1111   enrolled
--   03 O  Owner    'OO' Olive Owner    A1, A2    PIN 2222   enrolled
--   04 M  Manager  'NN' Nat Northstore A2        PIN 3333   enrolled
--   05 O  Owner    'QQ' Quinn Owner    A2        PIN 5555   enrolled
--   06 E  Employee 'FF' Fay Floater    A1, A2               no email
--   07 E  Employee 'GG' Gus Twostore   A2                   no email
--   0b M  Manager  'BB' Bo Otherorg    B1 (Org B) PIN 1111
--   0c E  Employee 'BE' Bea Otherorg   B1 (Org B)
-- Terminals: T1, T2 at A1; T3 at A2; TB at B1.

-- A-115: a test does not rely on the seed having run.
select vault.create_secret('m04-test-pepper-fabricated-not-a-secret', 'pin_pepper')
 where not exists (select 1 from vault.secrets where name = 'pin_pepper');

-- A-89: HMAC-SHA-256 of the four digits under the Vault pepper.
create function pg_temp.pin_hash(p_pin text) returns text language sql as $$
  select encode(extensions.hmac(p_pin,
           (select decrypted_secret from vault.decrypted_secrets where name = 'pin_pepper'),
           'sha256'), 'hex')
$$;

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B');

insert into public.stores (id, org_id, trading_name, auth_user_id) values
  ('00000000-0000-0000-0001-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A One',   '00000000-0000-0000-0009-0000000000a1'),
  ('00000000-0000-0000-0001-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A Two',   '00000000-0000-0000-0009-0000000000a2'),
  ('00000000-0000-0000-0001-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'A Three', '00000000-0000-0000-0009-0000000000a3'),
  ('00000000-0000-0000-0001-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B One',   '00000000-0000-0000-0009-0000000000b1');

insert into public.users (id, org_id, role, initials, display_name, email, auth_user_id, passkey_enrolled_at, active) values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-00000000000a', 'employee', 'EE', 'Eve Employee',   null,       null, null, true),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-00000000000a', 'manager',  'MM', 'Max Manager',    'm@a.test', '00000000-0000-0000-0009-000000000002', now(), true),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-00000000000a', 'owner',    'OO', 'Olive Owner',    'o@a.test', '00000000-0000-0000-0009-000000000003', now(), true),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-00000000000a', 'manager',  'NN', 'Nat Northstore', 'n@a.test', '00000000-0000-0000-0009-000000000004', now(), true),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-00000000000a', 'owner',    'QQ', 'Quinn Owner',    'q@a.test', '00000000-0000-0000-0009-000000000005', now(), true),
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-00000000000a', 'employee', 'FF', 'Fay Floater',    null,       null, null, true),
  ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-00000000000a', 'employee', 'GG', 'Gus Twostore',   null,       null, null, true),
  ('00000000-0000-0000-0002-00000000000b', '00000000-0000-0000-0000-00000000000b', 'manager',  'BB', 'Bo Otherorg',    'b@b.test', '00000000-0000-0000-0009-00000000000b', now(), true),
  ('00000000-0000-0000-0002-00000000000c', '00000000-0000-0000-0000-00000000000b', 'employee', 'BE', 'Bea Otherorg',   null,       null, null, true);

insert into public.store_assignments (org_id, user_id, store_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0001-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0001-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0001-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0001-0000000000a2'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0002-00000000000b', '00000000-0000-0000-0001-0000000000b1'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0002-00000000000c', '00000000-0000-0000-0001-0000000000b1');

insert into public.user_pins (org_id, user_id, pin_hash) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000002', pg_temp.pin_hash('1111')),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000003', pg_temp.pin_hash('2222')),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000004', pg_temp.pin_hash('3333')),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0002-000000000005', pg_temp.pin_hash('5555')),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0002-00000000000b', pg_temp.pin_hash('1111'));

insert into public.terminals (id, org_id, store_id, name) values
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', 'Till 1'),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1', 'Till 2'),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a2', 'Till 1'),
  ('00000000-0000-0000-0003-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0001-0000000000b1', 'Till 1');
-- ── end fixture ─────────────────────────────────────────────────────────────

-- Names for the fixture's ids.
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0002-0000000000' || lpad(p, 2, '0'))::uuid
$$;
create function pg_temp.s(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0001-0000000000' || p)::uuid
$$;
create function pg_temp.t(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0003-0000000000' || lpad(p, 2, '0'))::uuid
$$;

-- Who is calling: the header arguments every wrapper below passes (A-103, A-94).
create temp table ctx (actor uuid, initials text, terminal uuid, mpin text, request uuid);
grant all on ctx to public;
insert into ctx values (null, null, null, null, null);
-- Ids the tests mint, by name.
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select id from ids where k = p_k $$;

-- A store session at a terminal's Store (§5.4's claims as the hook mints them),
-- the staff session's actor, and the PIN typed for the M / O line. p_store
-- overrides the Store the claims name (to put a terminal of another Store).
create function pg_temp.counter(p_terminal uuid, p_actor uuid, p_initials text, p_mpin text,
                                p_store uuid default null, p_request uuid default null) returns void
language plpgsql as $$
declare v_org uuid; v_store uuid; v_sub uuid;
begin
  select t.org_id, coalesce(p_store, t.store_id) into v_org, v_store from public.terminals t where t.id = p_terminal;
  select s.auth_user_id into v_sub from public.stores s where s.id = v_store;
  update ctx set actor = p_actor, initials = p_initials, terminal = p_terminal, mpin = p_mpin, request = p_request;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_sub, 'principal', 'store',
                                                              'org_id', v_org, 'store_id', v_store)::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

-- A personal session: the person signed in as themselves (E-01 d27). p_actor
-- overrides the actor argument (for actor_mismatch).
create function pg_temp.desk(p_user uuid, p_actor uuid default null, p_request uuid default null) returns void
language plpgsql as $$
declare v_org uuid; v_sub uuid;
begin
  select u.org_id, u.auth_user_id into v_org, v_sub from public.users u where u.id = p_user;
  update ctx set actor = coalesce(p_actor, p_user), initials = null, terminal = null, mpin = null, request = p_request;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_sub, 'principal', 'person',
                                                              'org_id', v_org, 'user_id', p_user)::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

-- An enrolment session (A-117): null org_id and store_id.
create function pg_temp.enrolment(p_user uuid) returns void language plpgsql as $$
begin
  update ctx set actor = p_user, initials = null, terminal = null, mpin = null, request = null;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'principal', 'enrolment',
                                                              'user_id', p_user)::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

-- A raised error as conventions §5's body, marked `raised` so a test can tell
-- a raised refusal from a returned one (A-119).
create function pg_temp.body(p_code text, p_msg text, p_detail text, p_hint text) returns jsonb language sql as $$
  select jsonb_build_object('code', p_code, 'message', p_msg, 'details', nullif(p_detail, ''), 'hint', nullif(p_hint, ''), 'raised', true)
$$;

-- The ten, each called with the header from ctx, returning what the function
-- returned or what it raised.
create function pg_temp.add(p_role text, p_initials text, p_stores uuid[], p_email text default null,
                            p_pin text default null, p_name text default 'New Hire') returns jsonb
language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_add(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                      p_terminal_id => c.terminal, p_manager_pin => c.mpin,
                      p_display_name => p_name, p_initials => p_initials, p_role => p_role, p_email => p_email,
                      p_store_ids => p_stores, p_pin => p_pin);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.chrole(p_user uuid, p_role text, p_email text default null, p_pin text default null) returns jsonb
language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_change_role(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                              p_terminal_id => c.terminal, p_manager_pin => c.mpin,
                              p_user_id => p_user, p_role => p_role, p_email => p_email, p_pin => p_pin);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.deact(p_user uuid) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_deactivate(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                             p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.react(p_user uuid, p_initials text default null, p_pin text default null) returns jsonb
language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_reactivate(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                             p_terminal_id => c.terminal, p_manager_pin => c.mpin,
                             p_user_id => p_user, p_initials => p_initials, p_pin => p_pin);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.assign(p_user uuid, p_store uuid) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_assign(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                         p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user, p_store_id => p_store);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.unassign(p_user uuid, p_store uuid) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_unassign(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                           p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user, p_store_id => p_store);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

-- user_correct's fields are each optional: omitted is unchanged (the contract).
create function pg_temp.fix_initials(p_user uuid, p_initials text) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_correct(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                          p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user, p_initials => p_initials);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.fix_name(p_user uuid, p_name text) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_correct(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                          p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user, p_display_name => p_name);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.fix_email(p_user uuid, p_email text) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_correct(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                          p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user, p_email => p_email);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.setpin(p_user uuid, p_pin text) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_set_pin(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                          p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user, p_pin => p_pin);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.reset_link(p_user uuid) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_reset_request(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                                p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

create function pg_temp.resend(p_user uuid) returns jsonb language plpgsql as $$
declare c record; v_code text; v_msg text; v_detail text; v_hint text;
begin
  select * into c from ctx;
  return app.user_invite_resend(p_actor_user_id => c.actor, p_actor_initials => c.initials, p_request_id => coalesce(c.request, gen_random_uuid()),
                                p_terminal_id => c.terminal, p_manager_pin => c.mpin, p_user_id => p_user);
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;

-- Each of the ten by name, with arguments that would succeed for a suitable
-- subject — for the assertions that hold of every function alike. None carries
-- a PIN but user_set_pin, which cannot help it: M-04 d51 refuses a PIN-setting
-- act at the till before the actor, so a PIN here would hide what is tested.
create function pg_temp.call(p_fn text, p_user uuid, p_store uuid default null) returns jsonb language plpgsql as $$
begin
  case p_fn
    when 'user_add'           then return pg_temp.add('employee', 'ZQ', array[coalesce(p_store, pg_temp.s('a1'))], null, null, 'Zed Quill');
    when 'user_change_role'   then return pg_temp.chrole(p_user, 'owner', 'z@a.test', null);
    when 'user_deactivate'    then return pg_temp.deact(p_user);
    when 'user_reactivate'    then return pg_temp.react(p_user);
    when 'user_assign'        then return pg_temp.assign(p_user, coalesce(p_store, pg_temp.s('a2')));
    when 'user_unassign'      then return pg_temp.unassign(p_user, coalesce(p_store, pg_temp.s('a1')));
    when 'user_correct'       then return pg_temp.fix_name(p_user, 'Renamed');
    when 'user_set_pin'       then return pg_temp.setpin(p_user, '7777');
    when 'user_reset_request' then return pg_temp.reset_link(p_user);
    when 'user_invite_resend' then return pg_temp.resend(p_user);
  end case;
end
$$;

create function pg_temp.ten() returns text[] language sql immutable as $$
  select array['user_add', 'user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign',
               'user_unassign', 'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']
$$;
-- The nine with a store-session path: all but user_set_pin (M-04 d51).
create function pg_temp.nine() returns text[] language sql immutable as $$
  select array_remove(pg_temp.ten(), 'user_set_pin')
$$;
-- M-04 d51's refusal at the till, as the test wrappers return a raised error.
create function pg_temp.person_refusal() returns jsonb language sql immutable as $$
  select '{"code": "42501", "message": "role_refused", "details": "person", "hint": null, "raised": true}'::jsonb
$$;

-- A user's log, and its entries with a given action.
create function pg_temp.log(p_user uuid) returns jsonb language sql stable as $$
  select log from public.users where id = p_user
$$;
create function pg_temp.acts(p_user uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(e ->> 'action' order by n), '{}') from public.users u, jsonb_array_elements(u.log) with ordinality x(e, n)
   where u.id = p_user
$$;
create function pg_temp.entry(p_user uuid, p_action text) returns jsonb language sql stable as $$
  select e from public.users u, jsonb_array_elements(u.log) with ordinality x(e, n)
   where u.id = p_user and e ->> 'action' = p_action order by n desc limit 1
$$;
-- Clears a Store's PIN throttle state between sections (postgres, not a product path).
create function pg_temp.reopen() returns void language sql as $$
  delete from public.review_flags where kind = 'pin_line_closed';
  delete from public.pin_refusals;
  delete from public.pin_line_closures;
$$;

-- ── Rows 1, 3, 4: each of the ten is a definer function with A-103's header ──
select ok((select bool_and(p.prosecdef) and count(*) = 10
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.ten())),
  'A-4 - each of the ten user functions exists once and is security definer');
select ok((select bool_and(p.proconfig @> array['search_path=""'])
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.ten())),
  'A-103 - each of the ten sets search_path to empty');
select is((select array_agg(distinct p.proowner::regrole::text)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.ten())),
  array['waxworks_app'], 'A-104 - each of the ten is owned by waxworks_app');
select is((select count(*)::int
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.ten())
              and has_function_privilege('authenticated', p.oid, 'execute')
              and not has_function_privilege('anon', p.oid, 'execute')
              and not has_function_privilege('service_role', p.oid, 'execute')
              and not has_function_privilege('sysadmin', p.oid, 'execute')
              and p.proacl is not null
              and not exists (select 1 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE' and a.grantee = 0)),
  10, 'A-107 - each of the ten: execute granted to authenticated, and not to public, anon, service_role or sysadmin (A-103, A-114, A-90)');
select is((select array_agg(p.proname::text order by p.proname)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.ten())
              and (p.proargnames[1:5] = array['p_actor_user_id', 'p_actor_initials', 'p_request_id', 'p_terminal_id', 'p_manager_pin'])),
  (select array_agg(x order by x) from unnest(pg_temp.ten()) x),
  'A-103 - each of the ten takes the M / O header: p_actor_user_id, p_actor_initials, p_request_id, p_terminal_id, p_manager_pin (A-89: never p_manager_user_id)');
select is((select count(*)::int
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.ten())
              and 'p_manager_user_id' = any(p.proargnames)),
  0, 'M-04 d31 - no function takes p_manager_user_id: the authoriser is resolved, never an input');
select ok(not exists (select 1 from information_schema.role_table_grants
                       where table_schema = 'public' and table_name in ('users', 'user_pins', 'store_assignments')
                         and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  'A-4 - authenticated holds no insert, update or delete on users, user_pins or store_assignments');

-- ── Row 3: tenant, then actor, then terminal — each before any PIN is read ──
select pg_temp.enrolment(pg_temp.u('02'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.u('01')) - 'raised')::text) from unnest(pg_temp.ten()) f),
  array['{"code": "28000", "hint": null, "details": null, "message": "no_tenant"}'],
  'A-103 - each of the ten under an enrolment session''s claims is refused 28000 no_tenant (A-40, A-117)');
reset role;

-- A store session whose actor pair does not verify (initials not theirs).
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'XX', '9999');
select is((select array_agg(distinct pg_temp.call(f, pg_temp.u('06')) ->> 'message') from unnest(pg_temp.nine()) f),
  array['actor_mismatch'], 'A-103 - each of the nine with a store-session path, a store-session actor whose initials are not theirs: actor_mismatch');
select is(pg_temp.call('user_set_pin', pg_temp.u('06')), pg_temp.person_refusal(),
  'M-04 d51 - user_set_pin on a store session is refused role_refused, person, at the principal step: before the actor is read');
reset role;
-- An actor not assigned to this Store (Gus is at A2).
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('07'), 'GG', '9999');
select is((select array_agg(distinct pg_temp.call(f, pg_temp.u('06')) ->> 'message') from unnest(pg_temp.nine()) f),
  array['actor_mismatch'], 'A-103 - each of the nine, a store-session actor not assigned to this Store: actor_mismatch');
reset role;
-- A personal session naming another actor.
select pg_temp.desk(pg_temp.u('03'), pg_temp.u('02'));
select is((select array_agg(distinct pg_temp.call(f, pg_temp.u('06')) ->> 'message') from unnest(pg_temp.ten()) f),
  array['actor_mismatch'], 'A-103 - each of the ten, a personal session whose actor is not the session holder: actor_mismatch (§6)');
reset role;
-- A terminal of another Store: the claims name A1, the terminal is A2's.
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('01'), 'EE', '9999', pg_temp.s('a1'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.u('06')) - 'raised')::text) from unnest(pg_temp.nine()) f),
  array['{"code": "28000", "hint": null, "details": null, "message": "terminal_mismatch"}'],
  'A-94 - each of the nine, a terminal of another Store: 28000 terminal_mismatch');
-- M-04 d51: the three that set a PIN only when given one refuse it at the till at
-- the principal step, before the actor, the terminal and the PIN — all wrong here.
select is(pg_temp.add('manager', 'ZP', array[pg_temp.s('a1')], 'zp@a.test', '7777', 'Zed Pin'), pg_temp.person_refusal(),
  'M-04 d51 - user_add carrying a PIN on a store session: role_refused, person, before the actor, the terminal and the PIN');
select is(pg_temp.chrole(pg_temp.u('06'), 'manager', 'z@a.test', '7777'), pg_temp.person_refusal(),
  'M-04 d51 - user_change_role carrying a PIN on a store session: role_refused, person');
select is(pg_temp.react(pg_temp.u('06'), null, '7777'), pg_temp.person_refusal(),
  'M-04 d51 - user_reactivate carrying a PIN on a store session: role_refused, person');
select is(pg_temp.setpin(pg_temp.u('02'), '7777'), pg_temp.person_refusal(),
  'M-04 d51 - user_set_pin on a store session: role_refused, person');
reset role;
select is((select count(*)::int from public.pin_refusals), 0,
  'A-103 - no_tenant, actor_mismatch, terminal_mismatch and M-04 d51''s refusal each come before any PIN is read: no refusal row was written for any of the wrong PINs');
-- Row 41: the same four on a store session whose actor and terminal both verify,
-- with a wrong PIN — without d51 each would reach the PIN and write a refusal row.
create temp table log_51 as select id, log from public.users;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '9999');
select is(pg_temp.add('manager', 'ZQ', array[pg_temp.s('a1')], 'zq@a.test', '7778', 'Zed Que'), pg_temp.person_refusal(),
  'M-04 d51 - user_add carrying a PIN, at the till with a verified actor and a wrong manager PIN: role_refused, person');
select is(pg_temp.chrole(pg_temp.u('06'), 'manager', 'z@a.test', '7778'), pg_temp.person_refusal(),
  'M-04 d51 - user_change_role carrying a PIN, verified actor, wrong manager PIN: role_refused, person');
select is(pg_temp.react(pg_temp.u('06'), null, '7778'), pg_temp.person_refusal(),
  'M-04 d51 - user_reactivate carrying a PIN, verified actor, wrong manager PIN: role_refused, person');
select is(pg_temp.setpin(pg_temp.u('02'), '7778'), pg_temp.person_refusal(),
  'M-04 d51 - user_set_pin, verified actor, wrong manager PIN: role_refused, person');
reset role;
select is((select count(*)::int from public.pin_refusals), 0,
  'M-04 d51 - the wrong manager PIN was never read: pin_refusals unchanged');
select is((select count(*)::int from public.users u left join log_51 b using (id) where b.id is null or u.log is distinct from b.log), 0,
  'M-04 d51 - and users.log unchanged: nobody added, nothing logged');

-- ── Row 2: another Organization's user or Store is not_found, and nothing is written ──
create temp table before_b as select id, log, role, active, initials, display_name from public.users;
create temp table before_sa as select * from public.store_assignments;
select pg_temp.desk(pg_temp.u('03'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.u('0c'), pg_temp.s('b1')) - 'raised')::text) from unnest(pg_temp.ten()) f),
  array['{"code": "WX404", "hint": null, "details": null, "message": "not_found"}'],
  'A-86 - each of the ten, given another Organization''s user (and, for add, assign and unassign, its Store): WX404 not_found');
select is(pg_temp.assign(pg_temp.u('06'), pg_temp.s('b1')) - 'raised',
  '{"code": "WX404", "hint": null, "details": null, "message": "not_found"}'::jsonb,
  'A-86 - user_assign of this Organization''s person to another Organization''s Store: not_found');
select is(pg_temp.unassign(pg_temp.u('06'), pg_temp.s('b1')) ->> 'message', 'not_found',
  'A-86 - user_unassign from another Organization''s Store: not_found');
reset role;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '2222');
select is((select array_agg(distinct pg_temp.call(f, pg_temp.u('0c'), pg_temp.s('b1')) ->> 'message') from unnest(pg_temp.nine()) f),
  array['not_found'], 'A-86 - the same on a store session authorised by an Owner''s PIN, for the nine with a store-session path: not_found');
reset role;
select is((select count(*)::int from public.users u join before_b b using (id)
            where u.log is distinct from b.log or u.role is distinct from b.role or u.active is distinct from b.active
               or u.initials is distinct from b.initials or u.display_name is distinct from b.display_name),
  0, 'A-86 - a cross-Organization call changes no users row and appends no log entry');
select is((select count(*)::int from public.users) - (select count(*)::int from before_b), 0,
  'A-86 - and adds no User');
select ok((select count(*) from public.store_assignments) = (select count(*) from before_sa)
      and not exists (select * from public.store_assignments except select * from before_sa),
  'A-86 - and leaves store_assignments as it was');

-- ── Rows 5 and 7: A-94's columns, and both names, on every log entry ───────
-- On a store session: Eve's staff session at T1, Olive's PIN. One request id.
-- M-04 d51 keeps at the till every act that sets no PIN: Sam (an Employee) takes
-- the six Employee acts; Sol — a Manager who holds a PIN and never enrolled,
-- added at Olive's desk — takes the three Owner acts: a promotion to Owner that
-- carries no PIN (d51, d52), Re-send invite and Send reset. user_set_pin has no
-- store-session path (asserted above).
select pg_temp.desk(pg_temp.u('03'));
insert into ids select 's3', (pg_temp.add('manager', 'S3', array[pg_temp.s('a3')], 's3@a.test', '7101', 'Sol Three') ->> 'user_id')::uuid;
reset role;
create temp table s3_before as select jsonb_array_length(log) as n from public.users where id = pg_temp.id('s3');
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '2222', null, '00000000-0000-0000-0005-0000000000a1');
insert into ids select 's1', (pg_temp.add('employee', 'S1', array[pg_temp.s('a1')], null, null, 'Sam One') ->> 'user_id')::uuid;
select is(pg_temp.fix_name(pg_temp.id('s1'), 'Sam Uno'), jsonb_build_object('user_id', pg_temp.id('s1')), 'A-94 - store session: user_correct');
select is(pg_temp.assign(pg_temp.id('s1'), pg_temp.s('a2')), jsonb_build_object('user_id', pg_temp.id('s1')), 'A-94 - store session: user_assign');
select is(pg_temp.unassign(pg_temp.id('s1'), pg_temp.s('a2')), jsonb_build_object('user_id', pg_temp.id('s1')), 'A-94 - store session: user_unassign');
select is(pg_temp.deact(pg_temp.id('s1')), jsonb_build_object('user_id', pg_temp.id('s1')), 'A-94 - store session: user_deactivate');
select is(pg_temp.react(pg_temp.id('s1')), jsonb_build_object('user_id', pg_temp.id('s1')), 'A-94 - store session: user_reactivate');
select is(pg_temp.chrole(pg_temp.id('s3'), 'owner'),
  jsonb_build_object('user_id', pg_temp.id('s3'), 'invite', true, 'email', 's3@a.test'),
  'A-94 - store session: user_change_role (a PIN holder promoted to Owner, carrying no PIN)');
select is(pg_temp.resend(pg_temp.id('s3')), jsonb_build_object('user_id', pg_temp.id('s3'), 'email', 's3@a.test'), 'A-94 - store session: user_invite_resend');
select is(pg_temp.reset_link(pg_temp.id('s3')), jsonb_build_object('user_id', pg_temp.id('s3'), 'email', 's3@a.test'), 'A-94 - store session: user_reset_request');
reset role;
select ok(pg_temp.id('s1') is not null, 'A-94 - store session: user_add');
select is(pg_temp.acts(pg_temp.id('s1')),
  array['user_added', 'corrected', 'assigned', 'unassigned', 'deactivated', 'reactivated'],
  'A-55 - one users.log entry per act: the six Employee acts at the till, in order');
select is((pg_temp.acts(pg_temp.id('s3')))[(select n from s3_before) + 1 :],
  array['role_changed', 'invite_sent', 'invite_sent', 'reset_link_sent'],
  'A-55 - and the three Owner acts at the till, in order (the promotion invites the never-enrolled, M-04 d43)');
create temp table store_entries as
  select e from public.users u, jsonb_array_elements(u.log) e
   where u.id in (pg_temp.id('s1'), pg_temp.id('s3')) and e ->> 'request_id' = '00000000-0000-0000-0005-0000000000a1';
select is((select count(*)::int from store_entries), 10, 'A-94 - (ten entries carry the store session''s request id)');
select is((select count(*)::int from store_entries
            where e ->> 'terminal_id' = pg_temp.t('1')::text
              and e ->> 'principal' = 'store'
              and (e ->> 'at') is not null),
  10, 'A-94 - on a store session every log entry carries the request id, the terminal and principal store');
select is((select array_agg(distinct jsonb_build_object('actor', e ->> 'actor_user_id', 'manager', e ->> 'manager_user_id')::text)
             from store_entries),
  array[jsonb_build_object('actor', pg_temp.u('01'), 'manager', pg_temp.u('03'))::text],
  'M-04 d4 - on a store session every entry records the acting Employee and the PIN''s holder as authoriser (M-04 d31)');

-- On a personal session: Olive at her desk.
select pg_temp.desk(pg_temp.u('03'), null, '00000000-0000-0000-0005-0000000000b2');
insert into ids select 's2', (pg_temp.add('employee', 'S2', array[pg_temp.s('a2')], null, null, 'Sue Two') ->> 'user_id')::uuid;
select is(pg_temp.fix_name(pg_temp.id('s2'), 'Sue Deux') ->> 'user_id', pg_temp.id('s2')::text, 'A-94 - personal session: user_correct');
select is(pg_temp.assign(pg_temp.id('s2'), pg_temp.s('a1')) ->> 'user_id', pg_temp.id('s2')::text, 'A-94 - personal session: user_assign');
select is(pg_temp.unassign(pg_temp.id('s2'), pg_temp.s('a1')) ->> 'user_id', pg_temp.id('s2')::text, 'A-94 - personal session: user_unassign');
select is(pg_temp.deact(pg_temp.id('s2')) ->> 'user_id', pg_temp.id('s2')::text, 'A-94 - personal session: user_deactivate');
select is(pg_temp.react(pg_temp.id('s2')) ->> 'user_id', pg_temp.id('s2')::text, 'A-94 - personal session: user_reactivate');
select is(pg_temp.chrole(pg_temp.id('s2'), 'manager', 's2@a.test', '7201') ->> 'invite', 'true', 'A-94 - personal session: user_change_role');
select is(pg_temp.setpin(pg_temp.id('s2'), '7202') ->> 'user_id', pg_temp.id('s2')::text, 'A-94 - personal session: user_set_pin');
select is(pg_temp.resend(pg_temp.id('s2')) ->> 'email', 's2@a.test', 'A-94 - personal session: user_invite_resend');
select is(pg_temp.reset_link(pg_temp.id('s2')) ->> 'email', 's2@a.test', 'A-94 - personal session: user_reset_request');
reset role;
select is(cardinality(pg_temp.acts(pg_temp.id('s2'))), 12, 'A-55 - personal session: one entry per act');
select is((select count(*)::int from public.users u, jsonb_array_elements(u.log) e
            where u.id = pg_temp.id('s2')
              and e ->> 'request_id' = '00000000-0000-0000-0005-0000000000b2'
              and e -> 'terminal_id' = 'null'::jsonb
              and e ->> 'principal' = 'person'),
  12, 'A-94 - on a personal session every log entry carries the request id, principal person, and a null terminal');
select is((select array_agg(distinct jsonb_build_object('actor', e ->> 'actor_user_id', 'manager', e ->> 'manager_user_id')::text)
             from public.users u, jsonb_array_elements(u.log) e where u.id = pg_temp.id('s2')),
  array[jsonb_build_object('actor', pg_temp.u('03'), 'manager', pg_temp.u('03'))::text],
  'M-04 d31 - on a personal session the session holder is both names on every entry');

-- ── Row 7: whose PIN authorises ────────────────────────────────────────────
select pg_temp.reopen();
-- Nat holds 3333 at A2 only: at A1 it names nobody (E-01 d26).
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '3333');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay F') - 'details' - 'hint',
  '{"code": "28P01", "message": "pin_refused"}'::jsonb,
  'M-04 d31 - a PIN of a Manager at another Store authorises nothing here: pin_refused, returned (A-119)');
reset role;
select is((select display_name from public.users where id = pg_temp.u('06')), 'Fay Floater',
  'M-04 d31 - the refused call changed nothing');
-- A deactivated holder's PIN authorises nothing at once.
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.deact(pg_temp.u('02')) ->> 'user_id', pg_temp.u('02')::text, 'M-04 d31 - (Olive deactivates Max)');
reset role;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '1111');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay F') ->> 'message', 'pin_refused',
  'A-89 - a deactivated holder''s PIN authorises nothing from the moment the deactivation commits (§6: an active row at the moment of the call)');
reset role;
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.react(pg_temp.u('02')) ->> 'user_id', pg_temp.u('02')::text, 'M-04 d31 - (Olive reactivates Max)');
reset role;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '1111');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay F') ->> 'user_id', pg_temp.u('06')::text,
  'M-04 d31 - reactivated, the same PIN authorises again');
reset role;
-- A demoted holder: the role is read at call time. By hand the row keeps its
-- PIN (no product path leaves a demoted person one, M-04 d39), so only the
-- live role can be what refuses it.
update public.users set role = 'employee' where id = pg_temp.u('02');
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '1111');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay G') ->> 'message', 'pin_refused',
  'A-89 - a demoted holder''s PIN authorises nothing at once: the role is read at the moment of the call');
reset role;
update public.users set role = 'manager' where id = pg_temp.u('02');
select is((select count(*)::int from public.pin_refusals where store_id = pg_temp.s('a1') and staff_user_id = pg_temp.u('01')),
  3, 'E-01 d32 - each refused PIN above was recorded against the Store, naming Eve''s staff session');
select pg_temp.reopen();

-- ── Row 11: a refusal from each path commits its record and nothing else ──
-- The PIN resolution: user_add with a wrong PIN returns pin_refused; the
-- refusal row commits and no User is added.
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '9876');
select is(pg_temp.add('employee', 'GH', array[pg_temp.s('a1')], null, null, 'Ghost Hire'),
  '{"code": "28P01", "message": "pin_refused", "details": null, "hint": null}'::jsonb,
  'A-119 - a refused PIN at an M function is returned (not raised) as conventions §5''s body');
reset role;
select is((select count(*)::int from public.pin_refusals where store_id = pg_temp.s('a1')), 1,
  'A-119 - the refused PIN''s row commits');
select is((select count(*)::int from public.users where display_name = 'Ghost Hire'), 0,
  'A-119 - and the act''s own write is absent');
select pg_temp.reopen();

-- The PIN-clash check, at Set PIN, Assign, a promotion and a reactivation.
select pg_temp.desk(pg_temp.u('03'));
-- Set PIN: Nat (A2) given Olive's 2222 (Olive is at A2).
select is(pg_temp.setpin(pg_temp.u('04'), '2222'),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null}'::jsonb,
  'A-119 - Set PIN''s clash is returned (A-121): conventions §5''s body, no holder named');
-- Assign: Pia holds 3333 at A3; A2 has Nat on 3333.
insert into ids select 'pia', (pg_temp.add('manager', 'PI', array[pg_temp.s('a3')], 'pia@a.test', '3333', 'Pia Thirdstore') ->> 'user_id')::uuid;
select is(pg_temp.assign(pg_temp.id('pia'), pg_temp.s('a2')),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null}'::jsonb,
  'A-119 - Assign''s clash is returned');
-- A promotion: Gus (A2) promoted with Nat's 3333.
select is(pg_temp.chrole(pg_temp.u('07'), 'manager', 'gus@a.test', '3333'),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null}'::jsonb,
  'A-119 - a promotion''s clash is returned');
-- A reactivation: Rex (A2, 4545) deactivated, his PIN then given to Nat.
insert into ids select 'rex', (pg_temp.add('manager', 'RX', array[pg_temp.s('a2')], 'rex@a.test', '4545', 'Rex Returner') ->> 'user_id')::uuid;
select is(pg_temp.deact(pg_temp.id('rex')) ->> 'user_id', pg_temp.id('rex')::text, 'A-121 - (Rex is deactivated)');
select is(pg_temp.setpin(pg_temp.u('04'), '4545') ->> 'user_id', pg_temp.u('04')::text, 'A-121 - (Rex''s PIN is given to Nat meanwhile)');
select is(pg_temp.react(pg_temp.id('rex')),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null}'::jsonb,
  'A-121 - a reactivation''s clash is returned');
reset role;
select is((select count(*)::int from unnest(array[pg_temp.u('04'), pg_temp.id('pia'), pg_temp.u('07'), pg_temp.id('rex')]) x
            where pg_temp.entry(x, 'pin_clash_refused') is not null),
  4, 'A-119 - each of the four clash refusals committed its pin_clash_refused entry on the subject''s log (M-04 d32)');
select is((select pin_hash from public.user_pins where user_id = pg_temp.u('04')), pg_temp.pin_hash('4545'),
  'A-119 - Set PIN''s clash wrote no PIN (Nat holds the PIN set after it)');
select ok(not exists (select 1 from public.store_assignments where user_id = pg_temp.id('pia') and store_id = pg_temp.s('a2')),
  'A-119 - Assign''s clash wrote no assignment');
select is((select role from public.users where id = pg_temp.u('07')), 'employee',
  'A-119 - the promotion''s clash changed no role');
select ok(not exists (select 1 from public.user_pins where user_id = pg_temp.u('07')),
  'A-119 - and set no PIN');
select is((select active from public.users where id = pg_temp.id('rex')), false,
  'A-121 - the reactivation''s clash left them deactivated');
select is((select array_agg(e ->> 'action') from public.users u, jsonb_array_elements(u.log) e
            where u.id = pg_temp.id('rex') and e ->> 'action' not in ('user_added', 'pin_set', 'invite_sent', 'deactivated')),
  array['pin_clash_refused'], 'A-121 - the reactivation logged its clash and nothing else');

-- user_add's clash stays raised and unlogged (M-04 d32's note).
create temp table log_before as select id, log from public.users;
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.add('manager', 'CL', array[pg_temp.s('a2')], 'cl@a.test', '2222', 'Clash Hire'),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null, "raised": true}'::jsonb,
  'M-04 d32 - a PIN clash at Add is raised 23505 pin_clash, naming nobody');
reset role;
select is((select count(*)::int from public.users where display_name = 'Clash Hire'), 0,
  'M-04 d32 - Add''s clash adds nobody');
select is((select count(*)::int from public.users u join log_before b using (id) where u.log is distinct from b.log), 0,
  'M-04 d32 - and leaves no log entry anywhere: there is no row to log against');

-- ── Row 12: a read-only transaction is refused before any PIN is read ──────
-- Runs a call after `set transaction read only` (PostgREST's GET and HEAD),
-- inside a subtransaction that the refusal rolls back.
create function pg_temp.ro(p_fn text, p_user uuid) returns jsonb language plpgsql as $$
declare v_code text; v_msg text; v_detail text; v_hint text; v jsonb;
begin
  execute 'set transaction read only';
  v := pg_temp.call(p_fn, p_user);
  raise exception 'ro_probe' using detail = v::text;   -- roll back whatever ran
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  if v_msg = 'ro_probe' then return v_detail::jsonb; end if;
  return pg_temp.body(v_code, v_msg, v_detail, v_hint);
end
$$;
select pg_temp.reopen();
create temp table log_before_ro as select id, log from public.users;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '9999');
select is((select array_agg(distinct (pg_temp.ro(f, pg_temp.u('06')) - 'raised')::text) from unnest(pg_temp.nine()) f),
  array['{"code": "25006", "hint": null, "details": null, "message": "read_only"}'],
  'A-129 - each of the nine with a store-session path, in a read-only transaction on a store session with a wrong PIN: 25006 read_only');
select is(pg_temp.ro('user_set_pin', pg_temp.u('06')), pg_temp.person_refusal(),
  'M-04 d51 - user_set_pin at the till in a read-only transaction: role_refused, person — refused before the guard, and no PIN is read either way');
reset role;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '2222');
select is((select array_agg(distinct pg_temp.ro(f, pg_temp.u('06')) ->> 'message') from unnest(pg_temp.nine()) f),
  array['read_only'], 'A-129 - and with a correct PIN: read_only');
reset role;
select pg_temp.desk(pg_temp.u('03'));
select is((select array_agg(distinct pg_temp.ro(f, pg_temp.u('06')) ->> 'message') from unnest(pg_temp.ten()) f),
  array['read_only'], 'A-129 - and on a personal session: the guard is on every path of all ten (row 12, at approval)');
reset role;
select is((select current_setting('transaction_read_only')), 'off',
  'A-129 - (each probe ran in a subtransaction; the test transaction is writable again)');
select is((select count(*)::int from public.pin_refusals), 0,
  'A-129 - no refusal row is written in a read-only transaction');
select is((select count(*)::int from public.users u join log_before_ro b using (id) where u.log is distinct from b.log), 0,
  'A-129 - and no log entry');

select * from finish();
rollback;
