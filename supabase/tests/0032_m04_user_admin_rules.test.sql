-- M-04 D M1 - the rules the ten functions enforce. Rows 13-31 and 33-37 of the order.
--   M-04 d30, d37, d41 - who may touch whom.   M-04 d27, d34, d35, d36 - what a User must hold.
--   M-04 d13, d16, d20 - initials, unique among the active at a Store.
--   M-04 d28, d32, d39, d40, d47, d48 - the PIN.   M-04 d26 - the Owner floor.
--   M-04 d33, d42, d43, d44, d46; A-114, A-117, A-131 - role changes, links and the enrolment window.
--   M-04 d18, d22, d45; A-55, A-93 - deactivation, correction, demotion and the record.
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
-- subject — for the assertions that hold of every function alike.
create function pg_temp.call(p_fn text, p_user uuid, p_store uuid default null) returns jsonb language plpgsql as $$
begin
  case p_fn
    when 'user_add'           then return pg_temp.add('employee', 'ZQ', array[coalesce(p_store, pg_temp.s('a1'))], null, null, 'Zed Quill');
    when 'user_change_role'   then return pg_temp.chrole(p_user, 'manager', 'z@a.test', '7777');
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

create function pg_temp.owner_refusal() returns jsonb language sql immutable as $$
  select '{"code": "42501", "message": "role_refused", "details": "owner", "hint": null, "raised": true}'::jsonb
$$;
create function pg_temp.state(p_detail text) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', 'WX409', 'message', 'invalid_state', 'details', p_detail, 'hint', null, 'raised', true)
$$;
create function pg_temp.required(p_key text) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', '23502', 'message', p_key, 'details', null, 'hint', null, 'raised', true)
$$;

-- ── Row 13: M-04 d30 — a Manager touches Employees at their own Stores only ──
-- Max's PIN at A1, under Eve's staff session.
create temp table sa_13 as select * from public.store_assignments;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '1111');
select is(pg_temp.add('manager', 'NM', array[pg_temp.s('a1')], 'nm@a.test', '8001', 'New Manager'), pg_temp.owner_refusal(),
  'M-04 d30 - a Manager adding a Manager: 42501 role_refused, owner');
select is(pg_temp.chrole(pg_temp.u('01'), 'manager', 'eve@a.test', '8002'), pg_temp.owner_refusal(),
  'M-04 d30 - a Manager promoting an Employee: role_refused, owner');
select is(pg_temp.deact(pg_temp.u('04')), pg_temp.owner_refusal(),
  'M-04 d30 - a Manager deactivating a Manager: role_refused, owner');
select is(pg_temp.assign(pg_temp.u('04'), pg_temp.s('a1')), pg_temp.owner_refusal(),
  'M-04 d30 - a Manager assigning a Manager: role_refused, owner');
select is(pg_temp.assign(pg_temp.u('01'), pg_temp.s('a2')), pg_temp.owner_refusal(),
  'M-04 d30 - a Manager assigning an Employee at a Store not their own: role_refused, owner');
select is(pg_temp.add('employee', 'NE', array[pg_temp.s('a2')], null, null, 'Not Mine'), pg_temp.owner_refusal(),
  'M-04 d30 - a Manager adding an Employee at a Store not their own: role_refused, owner');
reset role;
select ok((select count(*) from public.store_assignments) = (select count(*) from sa_13)
      and (select count(*)::int from public.users where display_name in ('New Manager', 'Not Mine')) = 0
      and (select role from public.users where id = pg_temp.u('01')) = 'employee'
      and (select active from public.users where id = pg_temp.u('04')),
  'M-04 d30 - none of the refused calls wrote anything');
-- An Employee's PIN authorises nothing. No product path gives an Employee a
-- PIN (M-04 d28), so the row is written by hand to show the role is checked.
insert into public.user_pins (org_id, user_id, pin_hash) values
  ('00000000-0000-0000-0000-00000000000a', pg_temp.u('01'), pg_temp.pin_hash('6666'));
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '6666');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay F') ->> 'message', 'pin_refused',
  'M-04 d30 - an Employee''s PIN on a store session authorises nothing: pin_refused');
reset role;
delete from public.user_pins where user_id = pg_temp.u('01');
select pg_temp.reopen();

-- ── Row 14: M-04 d37 — one shared Store is reach for deactivate, reactivate, correct ──
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '1111');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay Floater'), jsonb_build_object('user_id', pg_temp.u('06')),
  'M-04 d37 - a Manager at A corrects an Employee at A and B: accepted');
select is(pg_temp.deact(pg_temp.u('06')), jsonb_build_object('user_id', pg_temp.u('06')),
  'M-04 d37 - a Manager at A deactivates an Employee at A and B: accepted');
select is(pg_temp.react(pg_temp.u('06')), jsonb_build_object('user_id', pg_temp.u('06')),
  'M-04 d37 - a Manager at A reactivates an Employee at A and B: accepted');
select is(pg_temp.deact(pg_temp.u('07')), pg_temp.owner_refusal(),
  'M-04 d37 - a Manager at A deactivating an Employee at B only: role_refused, owner');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus G'), pg_temp.owner_refusal(),
  'M-04 d37 - correcting an Employee at B only: role_refused, owner');
select is(pg_temp.react(pg_temp.u('07')), pg_temp.owner_refusal(),
  'M-04 d37 - reactivating an Employee at B only: role_refused, owner (reach is checked before anything else)');
select is(pg_temp.unassign(pg_temp.u('06'), pg_temp.s('a2')), pg_temp.owner_refusal(),
  'M-04 d37 - the same Manager unassigning the A-and-B Employee from B: role_refused, owner (assignment stays at their own Stores)');
reset role;
select ok(exists (select 1 from public.store_assignments where user_id = pg_temp.u('06') and store_id = pg_temp.s('a2'))
      and (select active from public.users where id = pg_temp.u('07')),
  'M-04 d37 - the refused calls changed nothing');

-- ── Row 15: M-04 d41 — a Manager sets the PIN of anyone who shares a Store ──
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '1111');
-- Olive holds A1 and A2; Nat holds 3333 at A2.
select is(pg_temp.setpin(pg_temp.u('03'), '3333'),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null}'::jsonb,
  'M-04 d41 - a Manager at A setting the PIN of an Owner at A and B is clash-checked at B too: pin_clash (M-04 d28: at every Store of the holder)');
select is(pg_temp.setpin(pg_temp.u('03'), '2468'), jsonb_build_object('user_id', pg_temp.u('03')),
  'M-04 d41 - a Manager at A sets the PIN of an Owner at A and B: accepted');
select is(pg_temp.setpin(pg_temp.u('05'), '2469'), pg_temp.owner_refusal(),
  'M-04 d41 - of an Owner at B only: role_refused, owner');
reset role;
select is((select pin_hash from public.user_pins where user_id = pg_temp.u('03')), pg_temp.pin_hash('2468'),
  'M-04 d41 - the accepted PIN is stored as its keyed hash');
select is((select pin_hash from public.user_pins where user_id = pg_temp.u('05')), pg_temp.pin_hash('5555'),
  'M-04 d41 - the refused one left Quinn''s PIN as it was');

-- ── Rows 19 and 20: the clash at the holder's second Store, unnamed and logged ──
select is((pg_temp.entry(pg_temp.u('03'), 'pin_clash_refused') - 'at' - 'request_id'),
  jsonb_build_object('action', 'pin_clash_refused', 'store_id', pg_temp.s('a2'), 'actor_user_id', pg_temp.u('01'),
                     'manager_user_id', pg_temp.u('02'), 'terminal_id', pg_temp.t('1'), 'principal', 'store'),
  'M-04 d32 - the refused clash appends pin_clash_refused to the subject''s users.log: actor, authoriser, the Store, the time, no digits');
select ok((pg_temp.entry(pg_temp.u('03'), 'pin_clash_refused') ->> 'at') is not null,
  'M-04 d32 - the clash entry carries its time');
select pg_temp.reopen();

-- ── Row 23: M-04 d26 — the Owner floor, under the Owners' lock ─────────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.deact(pg_temp.u('05')), jsonb_build_object('user_id', pg_temp.u('05')),
  'M-04 d26 - with two active Owners, one may go');
select is(pg_temp.chrole(pg_temp.u('03'), 'manager') - 'raised',
  '{"code": "23514", "message": "owner_floor", "details": null, "hint": null}'::jsonb,
  'M-04 d26 - the last active Owner demoting themselves: 23514 owner_floor');
select is(pg_temp.chrole(pg_temp.u('03'), 'employee') ->> 'message', 'owner_floor',
  'M-04 d26 - nor to Employee');
select is(pg_temp.deact(pg_temp.u('03')) ->> 'message', 'owner_floor',
  'M-04 d26 - the last active Owner deactivating themselves: owner_floor');
select is(pg_temp.react(pg_temp.u('05')), jsonb_build_object('user_id', pg_temp.u('05')),
  'M-04 d26 - (Quinn is reactivated)');
reset role;
select ok((select role = 'owner' and active from public.users where id = pg_temp.u('03')),
  'M-04 d26 - the refusals left Olive an active Owner');

-- ── Row 16: M-04 d27 — Employees and Managers hold a Store; Owners may not ──
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.add('employee', 'NS', '{}'::uuid[], null, null, 'No Store'), pg_temp.state('no_store'),
  'M-04 d27 - an Employee added with no Store: invalid_state, no_store');
select is(pg_temp.add('manager', 'NS', '{}'::uuid[], 'ns@a.test', '8101', 'No Store'), pg_temp.state('no_store'),
  'M-04 d27 - a Manager added with no Store: invalid_state, no_store');
insert into ids select 'rae', (pg_temp.add('owner', null, '{}'::uuid[], 'rae@a.test', null, 'Rae Roamer') ->> 'user_id')::uuid;
select ok(pg_temp.id('rae') is not null, 'M-04 d27 - an Owner is added with no Store, no initials and no PIN (M-04 d34, d35)');
select is(pg_temp.chrole(pg_temp.id('rae'), 'manager'), pg_temp.state('no_store'),
  'M-04 d27 - demoting a Store-less Owner: invalid_state, no_store');
select is(pg_temp.unassign(pg_temp.u('01'), pg_temp.s('a1')), pg_temp.state('last_store'),
  'M-04 d27 - unassigning an Employee''s last Store: invalid_state, last_store');
select is(pg_temp.unassign(pg_temp.u('05'), pg_temp.s('a2')), jsonb_build_object('user_id', pg_temp.u('05')),
  'M-04 d27 - an Owner unassigned from their last Store: accepted');
reset role;
select ok((select count(*)::int from public.users where display_name = 'No Store') = 0
      and exists (select 1 from public.store_assignments where user_id = pg_temp.u('01') and store_id = pg_temp.s('a1'))
      and not exists (select 1 from public.store_assignments where user_id = pg_temp.u('05')),
  'M-04 d27 - the refusals wrote nothing; the Owner holds no Store');

-- ── Row 18: M-04 d34 — assignment requires initials ────────────────────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.assign(pg_temp.id('rae'), pg_temp.s('a1')), pg_temp.required('initials_required'),
  'M-04 d34 - assigning a person with no initials: 23502 initials_required');
select is(pg_temp.add('employee', null, array[pg_temp.s('a1')], null, null, 'No Initials'), pg_temp.required('initials_required'),
  'M-04 d34 - user_add with a Store and no initials: initials_required');
select is(pg_temp.add('employee', '   ', array[pg_temp.s('a1')], null, null, 'No Initials'), pg_temp.required('initials_required'),
  'M-04 d20 - initials that trim to nothing are no initials: initials_required');

-- ── Row 21: M-04 d35 — whoever holds a Store as Manager or Owner holds a PIN ──
select is(pg_temp.add('manager', 'PR', array[pg_temp.s('a1')], 'pr@a.test', null, 'Pin Required'), pg_temp.required('pin_required'),
  'M-04 d35 - user_add of a Manager with a Store and no PIN: 23502 pin_required');
select is(pg_temp.chrole(pg_temp.u('07'), 'manager', 'gus@a.test', null), pg_temp.required('pin_required'),
  'M-04 d35 - a promotion into Manager of someone with no PIN, given none: pin_required');
select is(pg_temp.fix_initials(pg_temp.id('rae'), 'ra'), jsonb_build_object('user_id', pg_temp.id('rae')),
  'M-04 d34 - (Correct gives the Store-less Owner initials)');
select is(pg_temp.assign(pg_temp.id('rae'), pg_temp.s('a1')), pg_temp.required('pin_required'),
  'M-04 d35 - an Owner''s first assignment with initials and no PIN: pin_required');
reset role;
select ok(not exists (select 1 from public.store_assignments where user_id = pg_temp.id('rae'))
      and (select role from public.users where id = pg_temp.u('07')) = 'employee',
  'M-04 d35 - the refusals wrote nothing');

-- ── Row 19: the PIN as a keyed hash, set and cleared, logged as changed ────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.setpin(pg_temp.id('rae'), '8080'), jsonb_build_object('user_id', pg_temp.id('rae')),
  'M-04 d28 - an Owner sets a Store-less Owner''s PIN');
reset role;
select is((select pin_hash from public.user_pins where user_id = pg_temp.id('rae')), pg_temp.pin_hash('8080'),
  'A-89 - stored as HMAC-SHA-256 under authz.pin_pepper(), hex');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.setpin(pg_temp.id('rae'), null), jsonb_build_object('user_id', pg_temp.id('rae')),
  'M-04 d28 - and clears it: a person holding no Store may hold no PIN (M-04 d35)');
select is(pg_temp.setpin(pg_temp.u('04'), null), pg_temp.required('pin_required'),
  'M-04 d35 - clearing the PIN of a Manager who holds a Store: pin_required');
reset role;
select ok(not exists (select 1 from public.user_pins where user_id = pg_temp.id('rae')), 'M-04 d28 - the cleared PIN has no row');
select is((select array_agg(e ->> 'action' order by n) from public.users u, jsonb_array_elements(u.log) with ordinality x(e, n)
            where u.id = pg_temp.id('rae') and e ->> 'action' like 'pin%'),
  array['pin_set', 'pin_cleared'], 'M-04 d28 - pin_set and pin_cleared are logged');
select is((select count(*)::int from public.users u, jsonb_array_elements(u.log) e
            where u.id = pg_temp.id('rae') and e ->> 'action' like 'pin%' and (e ? 'before' or e ? 'after' or e::text like '%8080%')),
  0, 'M-04 d28 - logged as changed, never as a value: no before, no after, no digits');

-- ── Row 17: M-04 d13, d20 — initials unique among the active at a Store ────
select pg_temp.desk(pg_temp.u('03'));
insert into ids select 'jo', (pg_temp.add('employee', ' jd ', array[pg_temp.s('a1')], null, null, 'Jo Dee') ->> 'user_id')::uuid;
reset role;
select is((select initials from public.users where id = pg_temp.id('jo')), 'JD',
  'M-04 d20 - '' jd '' is stored as JD: trimmed and upper-cased on write');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.add('employee', 'jd', array[pg_temp.s('a1')], null, null, 'Jay Dover'),
  '{"code": "23505", "message": "initials_clash", "details": "Jo Dee", "hint": null, "raised": true}'::jsonb,
  'M-04 d13 - a clash at user_add: 23505 initials_clash, naming the holder');
insert into ids select 'jules', (pg_temp.add('employee', 'JD', array[pg_temp.s('a2')], null, null, 'Jules Dean') ->> 'user_id')::uuid;
select ok(pg_temp.id('jules') is not null, 'E-01 d25 - the same initials at another Store: accepted');
select is(pg_temp.assign(pg_temp.id('jules'), pg_temp.s('a1')),
  '{"code": "23505", "message": "initials_clash", "details": "Jo Dee", "hint": null, "raised": true}'::jsonb,
  'M-04 d27 - a clash at user_assign: initials_clash, naming the holder');
select is(pg_temp.fix_initials(pg_temp.u('06'), 'jd'),
  '{"code": "23505", "message": "initials_clash", "details": "Jo Dee", "hint": null, "raised": true}'::jsonb,
  'M-04 d22 - a clash at user_correct: initials_clash, naming the holder');
select is(pg_temp.deact(pg_temp.id('jo')) ->> 'user_id', pg_temp.id('jo')::text, 'M-04 d16 - (Jo Dee is deactivated)');
insert into ids select 'jack', (pg_temp.add('employee', 'JD', array[pg_temp.s('a1')], null, null, 'Jack Dunn') ->> 'user_id')::uuid;
select ok(pg_temp.id('jack') is not null, 'M-04 d16 - a deactivated holder''s initials do not clash: a new hire takes JD');
select is(pg_temp.react(pg_temp.id('jo')),
  '{"code": "23505", "message": "initials_clash", "details": "Jack Dunn", "hint": null, "raised": true}'::jsonb,
  'M-04 d19 - a clash at user_reactivate: initials_clash, naming the holder');
select is(pg_temp.react(pg_temp.id('jo'), 'jo'), jsonb_build_object('user_id', pg_temp.id('jo')),
  'M-04 d19 - reactivated under new initials');
reset role;
select is((select initials from public.users where id = pg_temp.id('jo')), 'JO', 'M-04 d19 - the new initials, normalised');
select is((select initials from public.users where id = pg_temp.u('06')), 'FF', 'M-04 d22 - the refused correction left Fay''s initials');
select ok(not exists (select 1 from public.store_assignments where user_id = pg_temp.id('jules') and store_id = pg_temp.s('a1')),
  'M-04 d27 - the refused assignment wrote nothing');
select is((select count(*)::int from public.users where display_name = 'Jay Dover'), 0, 'M-04 d13 - the refused add wrote nothing');

-- ── Row 22: M-04 d39 — a demotion to Employee clears the PIN ───────────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.chrole(pg_temp.u('07'), 'manager', 'gus@a.test', '4040') ->> 'invite', 'true', 'M-04 d39 - (Gus promoted to Manager)');
select is(pg_temp.chrole(pg_temp.u('07'), 'employee'), jsonb_build_object('user_id', pg_temp.u('07'), 'invite', false, 'email', null),
  'M-04 d39 - Gus demoted to Employee');
reset role;
select ok(not exists (select 1 from public.user_pins where user_id = pg_temp.u('07')), 'M-04 d39 - the demotion leaves no user_pins row');
select ok(pg_temp.entry(pg_temp.u('07'), 'pin_cleared') is not null, 'M-04 d39 - and logs pin_cleared');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.chrole(pg_temp.u('07'), 'manager'), pg_temp.required('pin_required'),
  'M-04 d39 - a promotion back without a PIN: pin_required');
select is(pg_temp.chrole(pg_temp.u('07'), 'manager', null, '4041') ->> 'user_id', pg_temp.u('07')::text, 'M-04 d39 - (promoted back with a new PIN)');
select is(pg_temp.chrole(pg_temp.u('07'), 'employee', null, '4042'), pg_temp.state('employee_has_no_pin'),
  'M-04 d39 - a demotion sent with a PIN: invalid_state, employee_has_no_pin');
select is(pg_temp.chrole(pg_temp.u('07'), 'employee') ->> 'user_id', pg_temp.u('07')::text, 'M-04 d39 - (demoted again)');
select is(pg_temp.add('employee', 'EP', array[pg_temp.s('a1')], null, '4043', 'Pinned Employee'), pg_temp.state('employee_has_no_pin'),
  'M-04 d28 - user_add of an Employee with a PIN: employee_has_no_pin');
select is(pg_temp.deact(pg_temp.u('06')) ->> 'user_id', pg_temp.u('06')::text, 'M-04 d28 - (Fay deactivated)');
select is(pg_temp.react(pg_temp.u('06'), null, '4044'), pg_temp.state('employee_has_no_pin'),
  'M-04 d28 - user_reactivate of an Employee given a PIN: employee_has_no_pin');
select is(pg_temp.react(pg_temp.u('06')) ->> 'user_id', pg_temp.u('06')::text, 'M-04 d28 - (Fay reactivated without one)');
select is(pg_temp.setpin(pg_temp.u('01'), '4045'), pg_temp.state('employee_has_no_pin'),
  'M-04 d28 - user_set_pin on an Employee: employee_has_no_pin');
reset role;
select ok(not exists (select 1 from public.user_pins where user_id in (pg_temp.u('07'), pg_temp.u('06'), pg_temp.u('01'))),
  'M-04 d28 - Employees hold no PIN');

-- ── Row 24: M-04 d36 — an Employee's email is optional; a Manager's is not ──
select pg_temp.desk(pg_temp.u('03'));
insert into ids select 'ne', (pg_temp.add('employee', 'NE', array[pg_temp.s('a1')], null, null, 'No Email') ->> 'user_id')::uuid;
select ok(pg_temp.id('ne') is not null, 'M-04 d36 - an Employee with no email: accepted');
select is(pg_temp.add('manager', 'ME', array[pg_temp.s('a1')], null, '4646', 'Mail Less'), pg_temp.required('email_required'),
  'M-04 d33 - user_add of a Manager with no email: 23502 email_required');
select is(pg_temp.chrole(pg_temp.u('06'), 'manager', null, '4747'), pg_temp.required('email_required'),
  'M-04 d33 - a promotion into Manager of someone with no email, given none: email_required');
select is(pg_temp.fix_email(pg_temp.u('02'), null), pg_temp.required('email_required'),
  'M-04 d29 - user_correct nulling a Manager''s email: email_required');
select is(pg_temp.fix_email(pg_temp.id('ne'), null), jsonb_build_object('user_id', pg_temp.id('ne')),
  'M-04 d36 - user_correct nulling an Employee''s email: accepted');
reset role;
select is((select email from public.users where id = pg_temp.u('02')), 'm@a.test', 'M-04 d29 - the refused correction kept Max''s email');

-- ── Row 25: M-04 d43 — any promotion invites the never-enrolled ───────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.chrole(pg_temp.u('07'), 'manager', 'gus@a.test', '4848'),
  jsonb_build_object('user_id', pg_temp.u('07'), 'invite', true, 'email', 'gus@a.test'),
  'M-04 d33 - Employee to Manager invites, returning the address');
select is(pg_temp.chrole(pg_temp.u('07'), 'owner'),
  jsonb_build_object('user_id', pg_temp.u('07'), 'invite', true, 'email', 'gus@a.test'),
  'M-04 d43 - Manager to Owner for someone never enrolled invites');
select is(pg_temp.chrole(pg_temp.u('02'), 'owner'),
  jsonb_build_object('user_id', pg_temp.u('02'), 'invite', false, 'email', null),
  'M-04 d43 - Manager to Owner for someone enrolled: invite false (A-117)');
reset role;
select is((select count(*)::int from public.users u, jsonb_array_elements(u.log) e
            where u.id = pg_temp.u('07') and e ->> 'action' = 'invite_sent'),
  4, 'M-04 d43 - each of Gus''s four promotions, never enrolled, logged invite_sent');
select is(pg_temp.entry(pg_temp.u('02'), 'invite_sent'), null, 'M-04 d43 - the enrolled Manager''s promotion logged no invite_sent');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.chrole(pg_temp.u('02'), 'manager') ->> 'invite', 'false', 'M-04 d43 - (Max back to Manager)');
reset role;

-- ── Row 26: M-04 d42 — a promotion that changes the address logs it ────────
select pg_temp.desk(pg_temp.u('03'));
insert into ids select 'ivy', (pg_temp.add('employee', 'IV', array[pg_temp.s('a1')], 'ivy@old.test', null, 'Ivy Vale') ->> 'user_id')::uuid;
select is(pg_temp.chrole(pg_temp.id('ivy'), 'manager', 'ivy@new.test', '4949'),
  jsonb_build_object('user_id', pg_temp.id('ivy'), 'invite', true, 'email', 'ivy@new.test'),
  'M-04 d42 - a promotion with a new email invites to the new address');
reset role;
select is(pg_temp.entry(pg_temp.id('ivy'), 'role_changed') -> 'before', '{"role": "employee", "email": "ivy@old.test"}'::jsonb,
  'M-04 d42 - role_changed''s before carries the old email');
select is(pg_temp.entry(pg_temp.id('ivy'), 'role_changed') -> 'after', '{"role": "manager", "email": "ivy@new.test"}'::jsonb,
  'M-04 d42 - and its after the new');
select is(pg_temp.entry(pg_temp.id('ivy'), 'invite_sent') -> 'after', '{"email": "ivy@new.test"}'::jsonb,
  'M-04 d42 - invite_sent names the new address');
select is((select email from public.users where id = pg_temp.id('ivy')), 'ivy@new.test', 'M-04 d42 - the address is changed');

-- ── Row 27: M-04 d46 — no role change for the deactivated; same role writes nothing ──
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.deact(pg_temp.u('06')) ->> 'user_id', pg_temp.u('06')::text, 'M-04 d46 - (Fay deactivated)');
select is(pg_temp.deact(pg_temp.id('ivy')) ->> 'user_id', pg_temp.id('ivy')::text, 'M-04 d46 - (Ivy deactivated)');
select is(pg_temp.deact(pg_temp.id('rae')) ->> 'user_id', pg_temp.id('rae')::text, 'M-04 d46 - (Rae deactivated)');
create temp table log_27 as select id, log from public.users;
select is(pg_temp.chrole(pg_temp.u('06'), 'manager', 'fay@a.test', '5050'), pg_temp.state('inactive'),
  'M-04 d46 - promoting a deactivated Employee: invalid_state, inactive');
select is(pg_temp.chrole(pg_temp.id('ivy'), 'owner'), pg_temp.state('inactive'),
  'M-04 d44 - promoting a deactivated Manager: inactive');
select is(pg_temp.chrole(pg_temp.id('ivy'), 'employee'), pg_temp.state('inactive'),
  'M-04 d46 - demoting a deactivated Manager: inactive');
select is(pg_temp.chrole(pg_temp.id('rae'), 'manager'), pg_temp.state('inactive'),
  'M-04 d46 - demoting a deactivated Owner: inactive');
select is(pg_temp.chrole(pg_temp.u('01'), 'employee'), jsonb_build_object('user_id', pg_temp.u('01'), 'invite', false, 'email', null),
  'M1-contracts-3 finding 5 - a same-role call on an active person: invite false');
select is(pg_temp.chrole(pg_temp.id('ivy'), 'manager', 'x@a.test', '5151'),
  jsonb_build_object('user_id', pg_temp.id('ivy'), 'invite', false, 'email', null),
  'M1-contracts-3 finding 5 - a same-role call on a deactivated person: invite false, before inactive is asked');
reset role;
select is((select count(*)::int from public.users u join log_27 b using (id) where u.log is distinct from b.log), 0,
  'M-04 d46 - none of these calls changed any log');
select ok((select role = 'manager' and email = 'ivy@new.test' from public.users where id = pg_temp.id('ivy'))
      and (select pin_hash from public.user_pins where user_id = pg_temp.id('ivy')) = pg_temp.pin_hash('4949'),
  'M-04 d46 - and the same-role call wrote nothing it was given');

-- ── Row 28: M-04 d44 — no link reaches a deactivated person ────────────────
create temp table eou_28 as select enrolment_open_until as v from public.users where id = pg_temp.id('ivy');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.reset_link(pg_temp.id('ivy')), pg_temp.state('inactive'), 'M-04 d44 - Send reset to a deactivated Manager: inactive');
select is(pg_temp.resend(pg_temp.id('ivy')), pg_temp.state('inactive'), 'M-04 d44 - Re-send invite to a deactivated Manager: inactive');
reset role;
select is((select enrolment_open_until from public.users where id = pg_temp.id('ivy')), (select v from eou_28),
  'A-131 - the refused calls wrote no enrolment_open_until');

-- ── Row 29: M-04 d48 — no PIN is set for a deactivated person ──────────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.setpin(pg_temp.id('ivy'), '5252'), pg_temp.state('inactive'), 'M-04 d48 - Set PIN for a deactivated Manager: inactive');
reset role;
select is((select pin_hash from public.user_pins where user_id = pg_temp.id('ivy')), pg_temp.pin_hash('4949'),
  'M-04 d48 - the stored hash is unchanged');

-- ── Row 30: M-04 d47 — user_reactivate's order of checks ───────────────────
select pg_temp.desk(pg_temp.u('03'));
create temp table log_30 as select log from public.users where id = pg_temp.u('02');
select is(pg_temp.react(pg_temp.u('02')), pg_temp.state('active'),
  'M-04 d47 - reactivating someone already active: invalid_state, active');
reset role;
select is((select log from public.users where id = pg_temp.u('02')), (select log from log_30),
  'M-04 d47 - and their log is unchanged');
select pg_temp.desk(pg_temp.u('03'));
insert into ids select 'kim', (pg_temp.add('manager', 'KK', array[pg_temp.s('a2')], 'kim@a.test', '6060', 'Kim Keeper') ->> 'user_id')::uuid;
select is(pg_temp.deact(pg_temp.id('kim')) ->> 'user_id', pg_temp.id('kim')::text, 'M-04 d47 - (Kim deactivated)');
insert into ids select 'kay', (pg_temp.add('employee', 'KK', array[pg_temp.s('a2')], null, null, 'Kay Kew') ->> 'user_id')::uuid;
select is(pg_temp.react(pg_temp.id('kim')),
  '{"code": "23505", "message": "initials_clash", "details": "Kay Kew", "hint": null, "raised": true}'::jsonb,
  'M-04 d47 - reused initials: initials_clash, raised');
reset role;
select ok(pg_temp.entry(pg_temp.id('kim'), 'pin_clash_refused') is null and not (select active from public.users where id = pg_temp.id('kim')),
  'M-04 d47 - the initials step refused: still deactivated, and no later step wrote a clash entry');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.react(pg_temp.id('kim'), 'KM', '6161'), pg_temp.state('pin_not_needed'),
  'M-04 d47 - a fresh PIN where nothing clashes: invalid_state, pin_not_needed');
reset role;
select ok(pg_temp.entry(pg_temp.id('kim'), 'pin_clash_refused') is null
      and (select initials from public.users where id = pg_temp.id('kim')) = 'KK'
      and (select pin_hash from public.user_pins where user_id = pg_temp.id('kim')) = pg_temp.pin_hash('6060'),
  'M-04 d47 - pin_not_needed wrote nothing: no clash entry, initials and PIN as they were');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.setpin(pg_temp.u('04'), '6060') ->> 'user_id', pg_temp.u('04')::text,
  'M-04 d40 - (Kim''s old PIN is given to Nat at A2 meanwhile: Kim is deactivated, so it does not clash)');
select is(pg_temp.react(pg_temp.id('kim'), 'KM'),
  '{"code": "23505", "message": "pin_clash", "details": null, "hint": null}'::jsonb,
  'M-04 d40 - the old PIN held meanwhile: pin_clash, returned');
reset role;
select ok(pg_temp.entry(pg_temp.id('kim'), 'pin_clash_refused') ->> 'store_id' = pg_temp.s('a2')::text
      and not (select active from public.users where id = pg_temp.id('kim'))
      and (select initials from public.users where id = pg_temp.id('kim')) = 'KK',
  'M-04 d40 - the clash is logged on Kim (M-04 d32) and nothing else is written');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.react(pg_temp.id('kim'), 'km', '6262'), jsonb_build_object('user_id', pg_temp.id('kim')),
  'M-04 d40 - a fresh PIN resolving the clash: reactivated');
reset role;
select ok((select active and initials = 'KM' from public.users where id = pg_temp.id('kim'))
      and (select pin_hash from public.user_pins where user_id = pg_temp.id('kim')) = pg_temp.pin_hash('6262'),
  'M-04 d40 - active, the new initials, the new PIN');
select is((pg_temp.acts(pg_temp.id('kim')))[cardinality(pg_temp.acts(pg_temp.id('kim'))) - 1 :],
  array['pin_set', 'reactivated'], 'M-04 d40 - pin_set is logged with the reactivation');

-- ── Row 34: M-04 d22 — a correction logged before and after ─────────────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.fix_initials(pg_temp.id('ne'), ' nx '), jsonb_build_object('user_id', pg_temp.id('ne')), 'M-04 d22 - initials corrected');
select is(pg_temp.fix_name(pg_temp.id('ne'), 'Nell Exe'), jsonb_build_object('user_id', pg_temp.id('ne')), 'M-04 d22 - display name corrected');
select is(pg_temp.fix_email(pg_temp.id('ne'), 'nell@a.test'), jsonb_build_object('user_id', pg_temp.id('ne')), 'M-04 d22 - email corrected');
reset role;
select is(
  (select jsonb_agg(jsonb_build_object('before', e -> 'before', 'after', e -> 'after') order by n)
     from public.users u, jsonb_array_elements(u.log) with ordinality x(e, n)
    where u.id = pg_temp.id('ne') and e ->> 'action' = 'corrected'),
  '[{"before": {"initials": "NE", "display_name": "No Email", "email": null},   "after": {"initials": "NE", "display_name": "No Email", "email": null}},
    {"before": {"initials": "NE", "display_name": "No Email", "email": null},   "after": {"initials": "NX", "display_name": "No Email", "email": null}},
    {"before": {"initials": "NX", "display_name": "No Email", "email": null},   "after": {"initials": "NX", "display_name": "Nell Exe", "email": null}},
    {"before": {"initials": "NX", "display_name": "Nell Exe", "email": null},   "after": {"initials": "NX", "display_name": "Nell Exe", "email": "nell@a.test"}}]'::jsonb,
  'M-04 d22 - each correction is logged with the values before and after (A-55)');
select is((select initials from public.users where id = pg_temp.id('ne')), 'NX', 'M-04 d20 - corrected initials are normalised');

-- ── Row 36: A-114 — an Owner's Send reset and Re-send invite ───────────────
-- A Manager's PIN at A2 (Nat now holds 6060), under Gus's staff session.
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '6060');
select is(pg_temp.reset_link(pg_temp.u('03')), pg_temp.owner_refusal(), 'A-114 - a Manager calling user_reset_request: role_refused, owner');
select is(pg_temp.resend(pg_temp.u('03')), pg_temp.owner_refusal(), 'A-114 - a Manager calling user_invite_resend: role_refused, owner');
reset role;
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.reset_link(pg_temp.u('01')), pg_temp.state('employee'), 'A-114 - Send reset to an Employee: invalid_state, employee');
select is(pg_temp.resend(pg_temp.u('01')), pg_temp.state('employee'), 'A-114 - Re-send invite to an Employee: invalid_state, employee');
select is(pg_temp.resend(pg_temp.u('05')), pg_temp.state('enrolled'), 'A-117 - Re-send invite to someone enrolled: invalid_state, enrolled');
reset role;
-- ── Row 37: A-131 — every link-sending act opens the 24-hour window ────────
update public.users set enrolment_open_until = null where id in (pg_temp.u('05'), pg_temp.id('kim'));
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.reset_link(pg_temp.u('05')), jsonb_build_object('user_id', pg_temp.u('05'), 'email', 'q@a.test'),
  'A-114 - Send reset to an enrolled Owner returns the address the Server Action sends to');
select is(pg_temp.resend(pg_temp.id('kim')), jsonb_build_object('user_id', pg_temp.id('kim'), 'email', 'kim@a.test'),
  'A-114 - Re-send invite to a never-enrolled Manager returns the address');
reset role;
select ok(pg_temp.entry(pg_temp.u('05'), 'reset_link_sent') is not null and pg_temp.entry(pg_temp.id('kim'), 'invite_sent') is not null,
  'A-114 - logged reset_link_sent and invite_sent');
select is((select enrolment_open_until from public.users where id = pg_temp.u('05')), now() + interval '24 hours',
  'A-131 - user_reset_request sets enrolment_open_until to now() + 24 hours');
select is((select enrolment_open_until from public.users where id = pg_temp.id('kim')), now() + interval '24 hours',
  'A-131 - user_invite_resend sets it');
select is((select enrolment_open_until from public.users where id = pg_temp.id('rae')), now() + interval '24 hours',
  'A-131 - user_add of an Owner sets it');
select is((select enrolment_open_until from public.users where id = pg_temp.id('ivy')), now() + interval '24 hours',
  'A-131 - user_change_role, when it invites, sets it');
select is((select enrolment_open_until from public.users where id = pg_temp.id('ne')), null,
  'A-131 - an Employee''s Add leaves it null');
select is((select enrolment_open_until from public.users where id = pg_temp.u('02')), null,
  'A-131 - a non-inviting promotion (Max, enrolled, to Owner) leaves it null');
-- A refused call leaves it unchanged: Ivy's (row 28) above; and here, with it null.
update public.users set enrolment_open_until = null where id = pg_temp.u('01');
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.resend(pg_temp.u('01')) ->> 'message', 'invalid_state', 'A-131 - (a refused Re-send)');
reset role;
select is((select enrolment_open_until from public.users where id = pg_temp.u('01')), null,
  'A-131 - a refused call leaves enrolment_open_until unchanged');

-- ── Row 33: M-04 d45 — a demotion ends the person's personal session's reads ──
create function pg_temp.reads() returns jsonb language sql stable as $$
  select jsonb_build_object('users', (select count(*) from public.users), 'assignments', (select count(*) from public.store_assignments),
                            'organizations', (select count(*) from public.organizations), 'reachable', authz.org_reachable())
$$;
select pg_temp.desk(pg_temp.u('07'));
select ok((pg_temp.reads() ->> 'reachable')::boolean and (pg_temp.reads() ->> 'users')::int > 0,
  'M-04 d45 - (before: Gus, an Owner, reads his Organization on a personal session)');
reset role;
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.chrole(pg_temp.u('07'), 'employee') ->> 'user_id', pg_temp.u('07')::text, 'M-04 d45 - (Olive demotes Gus to Employee)');
reset role;
select pg_temp.desk(pg_temp.u('07'));
select is(pg_temp.reads(), '{"users": 0, "assignments": 0, "organizations": 0, "reachable": false}'::jsonb,
  'M-04 d45 - immediately after the demotion commits, his personal-session claims reach nothing: org_reachable false, the identity tables read nothing (A-122)');
reset role;

-- ── Row 31: M-04 d18, d16 — deactivation bites at the write path at once ───
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.deact(pg_temp.u('02')) ->> 'user_id', pg_temp.u('02')::text, 'M-04 d18 - (Olive deactivates Max)');
reset role;
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', null);
select throws_ok($$select app.actor_resolve(p_initials => 'MM', p_terminal_id => pg_temp.t('1'), p_request_id => gen_random_uuid())$$,
  'WX404', 'not_found', 'M-04 d18 - after user_deactivate commits, actor_resolve by their initials is not_found');
select is(app.manager_authorize_pin(p_pin => '1111', p_terminal_id => pg_temp.t('1'), p_request_id => gen_random_uuid()) ->> 'message',
  'pin_refused', 'M-04 d18 - and their PIN at manager_authorize_pin is pin_refused');
reset role;
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.add('employee', 'mm', array[pg_temp.s('a1')], null, null, 'Mo Mint') ->> 'invite', 'false',
  'M-04 d16 - a new hire at the Store takes their initials');
reset role;
select pg_temp.reopen();

-- ── Row 35: A-55 — the shape of each act's entry ───────────────────────────
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.assign(pg_temp.u('01'), pg_temp.s('a2')) ->> 'user_id', pg_temp.u('01')::text, 'A-55 - (Eve assigned to A2)');
select is(pg_temp.unassign(pg_temp.u('01'), pg_temp.s('a2')) ->> 'user_id', pg_temp.u('01')::text, 'A-55 - (and unassigned)');
reset role;
create function pg_temp.keys(p jsonb) returns text[] language sql immutable as $$
  select array_agg(k order by k) from jsonb_object_keys(p) k
$$;
create function pg_temp.base() returns text[] language sql immutable as $$
  select array['action', 'actor_user_id', 'at', 'manager_user_id', 'principal', 'request_id', 'terminal_id']
$$;
select is(pg_temp.entry(pg_temp.id('jo'), 'user_added') -> 'after',
  jsonb_build_object('role', 'employee', 'initials', 'JD', 'store_ids', jsonb_build_array(pg_temp.s('a1')), 'email', null),
  'A-55 - user_added: after carries role, initials, store_ids and email');
select is(pg_temp.entry(pg_temp.u('07'), 'role_changed') - 'at' - 'request_id' - 'actor_user_id' - 'manager_user_id' - 'terminal_id' - 'principal',
  '{"action": "role_changed", "before": {"role": "owner"}, "after": {"role": "employee"}}'::jsonb,
  'A-55 - role_changed: before and after carry the role');
select is(pg_temp.entry(pg_temp.u('02'), 'deactivated') - 'at' - 'request_id' - 'actor_user_id' - 'manager_user_id' - 'terminal_id' - 'principal',
  '{"action": "deactivated", "before": {"active": true}, "after": {"active": false}}'::jsonb,
  'A-55 - deactivated: before and after carry active');
select is(pg_temp.entry(pg_temp.id('kim'), 'reactivated') - 'at' - 'request_id' - 'actor_user_id' - 'manager_user_id' - 'terminal_id' - 'principal',
  '{"action": "reactivated", "before": {"active": false, "initials": "KK"}, "after": {"active": true, "initials": "KM"}}'::jsonb,
  'A-55 - reactivated: before and after carry active and initials');
select is(pg_temp.entry(pg_temp.u('01'), 'assigned') ->> 'store_id', pg_temp.s('a2')::text, 'A-55 - assigned names the Store');
select is(pg_temp.entry(pg_temp.u('01'), 'unassigned') ->> 'store_id', pg_temp.s('a2')::text, 'A-55 - unassigned names the Store');
select is(pg_temp.keys(pg_temp.entry(pg_temp.id('kim'), 'pin_set')), pg_temp.base(),
  'A-93 - pin_set carries the header columns and nothing else: no value, no hash');
select is(pg_temp.keys(pg_temp.entry(pg_temp.id('rae'), 'pin_cleared')), pg_temp.base(), 'A-93 - pin_cleared likewise');
select is(pg_temp.keys(pg_temp.entry(pg_temp.u('05'), 'reset_link_sent')), pg_temp.base(), 'A-93 - reset_link_sent: never the link');
select is(pg_temp.keys(pg_temp.entry(pg_temp.id('kim'), 'invite_sent')), pg_temp.base(), 'A-93 - invite_sent: never the link');

-- The sweep: no four-digit run in any users.log entry, once its ids and times
-- are taken out (a uuid or a timestamp can hold four digits by chance).
select is(
  (select count(*)::int from public.users u, jsonb_array_elements(u.log) e
    where regexp_replace(regexp_replace(e::text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'g'),
                         '"at": "[^"]*"', '', 'g') ~ '[0-9]{4}'),
  0, 'A-93 - no users.log entry, after every PIN-bearing act in this file, holds a four-digit run (M-04 d28)');
select is(
  (select count(*)::int from public.users u, jsonb_array_elements(u.log) e, public.user_pins p
    where e::text like '%' || p.pin_hash || '%'),
  0, 'A-93 - and none holds a stored hash');
select ok((select bool_and(pin_hash ~ '^[0-9a-f]{64}$') from public.user_pins),
  'A-89 - every user_pins row is a 64-character hex HMAC, never the digits');
select is(
  (select count(*)::int from public.pin_refusals r
    where (to_jsonb(r) - 'id' - 'at' - 'request_id' - 'closure_id' - 'org_id' - 'store_id' - 'terminal_id' - 'staff_user_id')::text ~ '[0-9]{4}'),
  0, 'A-93 - no refusal row holds digits');

-- ── Row 19: with the pepper absent, every function fails closed ────────────
delete from vault.secrets where name = 'pin_pepper';
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '2468');
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.u('06')) - 'raised')::text) from unnest(pg_temp.ten()) f),
  array['{"code": "XX000", "hint": null, "details": null, "message": "pin_pepper_missing"}'],
  'A-115 - with the pin_pepper secret absent, each of the ten on a store session raises XX000 pin_pepper_missing');
reset role;
select pg_temp.desk(pg_temp.u('03'));
select is(pg_temp.setpin(pg_temp.u('04'), '1357') ->> 'message', 'pin_pepper_missing',
  'A-115 - on a personal session, setting a PIN raises pin_pepper_missing');
select is(pg_temp.add('manager', 'PZ', array[pg_temp.s('a3')], 'pz@a.test', '1357', 'Pepper Less') ->> 'message', 'pin_pepper_missing',
  'A-115 - and adding a Manager with a PIN');
reset role;

select * from finish();
rollback;
