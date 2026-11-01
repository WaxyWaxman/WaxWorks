-- M-04 D M1 - the M / O header's PIN resolution under E-01's throttle.
-- Rows 8, 9 and 10 of the order.
--   E-01 d31, d32 - one limit per Store, counted across the PIN pad and every M / O header.
--   E-01 d38 - what counts: a missing PIN does not; a closed line records, uncounted.
--   E-01 d39, A-123 - the closure's flag is the system's, the closure its subject.
--   A-120 - a refusal names the acting Employee's staff session.
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
    when 'user_change_role'   then return pg_temp.chrole(p_user, 'owner', 'z@a.test', null);   -- no PIN: M-04 d51 would refuse it at the till first
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

-- ── Row 8: one Store, one limit — the pad and the M / O header count together ──
-- Three refusals at the PIN pad under Eve's staff session at A1 …
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', null);
select is(app.manager_authorize_pin(p_pin => '9101', p_terminal_id => pg_temp.t('1'), p_request_id => gen_random_uuid(),
                                    p_actor_user_id => pg_temp.u('01'), p_actor_initials => 'EE') ->> 'message',
  'pin_refused', 'E-01 d32 - refusal 1 of 5, at manager_authorize_pin');
select is(app.manager_authorize_pin(p_pin => '9102', p_terminal_id => pg_temp.t('2'), p_request_id => gen_random_uuid(),
                                    p_actor_user_id => pg_temp.u('01'), p_actor_initials => 'EE') ->> 'message',
  'pin_refused', 'E-01 d32 - refusal 2 of 5, at manager_authorize_pin, the other terminal');
select is(app.manager_authorize_pin(p_pin => '9103', p_terminal_id => pg_temp.t('1'), p_request_id => gen_random_uuid(),
                                    p_actor_user_id => pg_temp.u('01'), p_actor_initials => 'EE') ->> 'message',
  'pin_refused', 'E-01 d32 - refusal 3 of 5, at manager_authorize_pin');
reset role;
-- … M-04 d51: user_set_pin at the till is refused before any PIN is read, so its
-- wrong PIN is neither a refusal row nor a count …
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '9199');
select is(pg_temp.setpin(pg_temp.u('02'), '1212'),
  '{"code": "42501", "message": "role_refused", "details": "person", "hint": null, "raised": true}'::jsonb,
  'M-04 d51 - user_set_pin on a store session: role_refused, person, before the PIN line');
reset role;
select is((select count(*)::int from public.pin_refusals where store_id = pg_temp.s('a1')), 3,
  'M-04 d51 - and its PIN tried nothing: still three refusal rows');
-- … two at user_correct (an M function — d51 leaves Set PIN off the till, so the
-- second door is the M header of an act that sets no PIN), the same staff session …
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '9104');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay F') ->> 'message', 'pin_refused', 'E-01 d32 - refusal 4 of 5, at user_correct');
reset role;
select is((select count(*)::int from public.pin_line_closures), 0, 'E-01 d31 - four refusals across the pad and user_correct do not close the line');
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '9105');
select is(pg_temp.fix_name(pg_temp.u('06'), 'Fay F') ->> 'message', 'pin_refused', 'E-01 d32 - refusal 5 of 5, at user_correct');
reset role;
select is((select count(*)::int from public.pin_line_closures where store_id = pg_temp.s('a1')), 1,
  'E-01 d32 - three at manager_authorize_pin and two at an M function''s header close the Store''s line: one limit (E-01 d31)');
select is((select count(*)::int from public.pin_refusals where closure_id = (select id from public.pin_line_closures) and counted), 5,
  'E-01 d38 - the closure claims the five, from both doors');
-- … and the sixth, at user_add, finds the line closed — even with a correct PIN.
select pg_temp.counter(pg_temp.t('1'), pg_temp.u('01'), 'EE', '2222');
select is(pg_temp.add('employee', 'SX', array[pg_temp.s('a1')], null, null, 'Sixth Try') - 'details',
  '{"code": "WX429", "message": "pin_line_closed", "hint": null}'::jsonb,
  'E-01 d31 - the sixth attempt, at user_add with a correct PIN, is pin_line_closed, returned (A-119)');
select is((pg_temp.add('employee', 'SY', array[pg_temp.s('a1')], null, null, 'Seventh Try') ->> 'details')::timestamptz,
  (select reopens_at from public.pin_line_closures),
  'E-01 d31 - and says when the line reopens');
reset role;
select is((select count(*)::int from public.users where display_name in ('Sixth Try', 'Seventh Try')), 0,
  'E-01 d31 - while closed, user_add adds nobody');
select is((select array_agg(distinct staff_user_id) from public.pin_refusals), array[pg_temp.u('01')],
  'A-120 - every refusal row, at the pad and in the M / O header, names the acting Employee''s staff session as staff_user_id');
select is((select count(*)::int from public.pin_refusals where store_id = pg_temp.s('a1')), 7,
  'E-01 d38 - seven rows: five counted, two while closed');
select is((select array_agg(distinct terminal_id) from public.pin_refusals where not counted), array[pg_temp.t('1')],
  'A-94 - each refusal row names the terminal it was typed at');

-- ── Row 9: E-01 d38's edges through user_correct, at Store A2 ──────────────
-- (The row's example was user_set_pin; M-04 d51 took it off the till, so the
-- edges go through another of the ten.) Gus's staff session at T3, correcting
-- his own name; Nat's PIN 3333 is the correct one.
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', null);
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T'),
  '{"code": "28P01", "message": "pin_refused", "details": null, "hint": null}'::jsonb,
  'E-01 d38 - a null p_manager_pin on a store session is refused pin_refused');
reset role;
select is((select count(*)::int from public.pin_refusals where store_id = pg_temp.s('a2')), 0,
  'E-01 d38 - a missing PIN tried no digits: no row, nothing counted');
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '9201');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T') ->> 'message', 'pin_refused', 'E-01 d38 - refusal 1');
reset role;
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '9202');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T') ->> 'message', 'pin_refused', 'E-01 d38 - refusal 2');
reset role;
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '9203');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T') ->> 'message', 'pin_refused', 'E-01 d38 - refusal 3');
reset role;
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '9204');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T') ->> 'message', 'pin_refused', 'E-01 d38 - refusal 4');
reset role;
-- A success clears nothing.
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '3333');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T'), jsonb_build_object('user_id', pg_temp.u('07')),
  'E-01 d38 - four refusals, then a success: Nat''s PIN authorises user_correct');
reset role;
select is((select count(*)::int from public.pin_line_closures where store_id = pg_temp.s('a2')), 0,
  'E-01 d38 - (four refusals and a success: still open)');
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '9205');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T') ->> 'message', 'pin_refused', 'E-01 d38 - the fifth refusal is itself pin_refused');
reset role;
select is((select count(*)::int from public.pin_line_closures where store_id = pg_temp.s('a2')), 1,
  'E-01 d38 - four refusals, a success, then a fifth close the line: a correct PIN clears nothing');
-- An attempt while closed: recorded, not counted, carrying the closure.
select pg_temp.counter(pg_temp.t('3'), pg_temp.u('07'), 'GG', '3333');
select is(pg_temp.fix_name(pg_temp.u('07'), 'Gus T') ->> 'message', 'pin_line_closed',
  'E-01 d31 - while closed, Nat''s correct PIN at user_correct is pin_line_closed');
reset role;
select is(
  (select jsonb_build_object('counted', r.counted, 'closure', r.closure_id = c.id, 'staff', r.staff_user_id = pg_temp.u('07'),
                             'terminal', r.terminal_id = pg_temp.t('3'))
     from public.pin_refusals r, public.pin_line_closures c
    where r.store_id = pg_temp.s('a2') and c.store_id = pg_temp.s('a2') and not r.counted),
  '{"counted": false, "closure": true, "staff": true, "terminal": true}'::jsonb,
  'E-01 d38 - an attempt while the line is closed writes a row with counted = false and the closure''s id (A-123)');
select is((select count(*)::int from public.pin_line_closures where store_id = pg_temp.s('a2')), 1,
  'E-01 d38 - the attempt while closed starts no second closure');

-- ── Row 10: a closure reached through user_add raises the system's flag ────
-- Org B, Store B1, Bea's staff session at TB.
select pg_temp.counter(pg_temp.t('0b'), pg_temp.u('0c'), 'BE', '9301');
select is(pg_temp.add('employee', 'B1', array[pg_temp.s('b1')]) ->> 'message', 'pin_refused', 'E-01 d39 - user_add refusal 1');
reset role;
select pg_temp.counter(pg_temp.t('0b'), pg_temp.u('0c'), 'BE', '9302');
select is(pg_temp.add('employee', 'B2', array[pg_temp.s('b1')]) ->> 'message', 'pin_refused', 'E-01 d39 - user_add refusal 2');
reset role;
select pg_temp.counter(pg_temp.t('0b'), pg_temp.u('0c'), 'BE', '9303');
select is(pg_temp.add('employee', 'B3', array[pg_temp.s('b1')]) ->> 'message', 'pin_refused', 'E-01 d39 - user_add refusal 3');
reset role;
select pg_temp.counter(pg_temp.t('0b'), pg_temp.u('0c'), 'BE', '9304');
select is(pg_temp.add('employee', 'B4', array[pg_temp.s('b1')]) ->> 'message', 'pin_refused', 'E-01 d39 - user_add refusal 4');
reset role;
select pg_temp.counter(pg_temp.t('0b'), pg_temp.u('0c'), 'BE', '9305');
select is(pg_temp.add('employee', 'B5', array[pg_temp.s('b1')]) ->> 'message', 'pin_refused', 'E-01 d39 - user_add refusal 5 closes the line');
reset role;
select is((select count(*)::int from public.review_flags where kind = 'pin_line_closed' and store_id = pg_temp.s('b1')), 1,
  'A-28 - one flag is raised when user_add''s refusals close the line');
select is(
  (select jsonb_build_object('org', f.org_id = '00000000-0000-0000-0000-00000000000b'::uuid, 'actor_user_id', f.actor_user_id,
                             'subject_type', f.subject_type, 'subject_is_closure', f.subject_id = c.id,
                             'principal', f.principal, 'terminal', f.terminal_id = pg_temp.t('0b'), 'reviewed_at', f.reviewed_at)
     from public.review_flags f join public.pin_line_closures c on c.store_id = f.store_id
    where f.kind = 'pin_line_closed' and f.store_id = pg_temp.s('b1')),
  '{"org": true, "actor_user_id": null, "subject_type": "pin_line_closure", "subject_is_closure": true, "principal": "store", "terminal": true, "reviewed_at": null}'::jsonb,
  'E-01 d39 - the flag raised by a closure at user_add is the system''s: actor_user_id null, the closure its subject (A-123, A-68)');
select is(
  (select count(*)::int from public.pin_refusals r join public.review_flags f on r.closure_id = f.subject_id
    where f.kind = 'pin_line_closed' and f.store_id = pg_temp.s('b1') and r.counted and r.staff_user_id = pg_temp.u('0c')),
  5, 'E-01 d39 - its subject joins to exactly the five refusals that closed the line, each naming Bea''s staff session');
select is((select count(*)::int from public.users where org_id = '00000000-0000-0000-0000-00000000000b'), 2,
  'E-01 d39 - and none of the refused calls added a User');

select * from finish();
rollback;
