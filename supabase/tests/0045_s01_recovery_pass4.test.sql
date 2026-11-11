-- S-01 D M1, rework pass 4 - what the pass-3 review decisions of 2026-11-08 add.
-- Rows 38 and 40 of the order (row 39 is 0042's two assertions and 0044's added cases).
--   A-150           - a demotion to Employee closes the person's enrolment window:
--                     user_change_role, when the new role is employee, sets
--                     enrolment_open_until null in the statement that writes the
--                     role; a promotion opens a fresh window only if it invites;
--                     any other change leaves it.
--   conventions §5  - "trim" is leading and trailing space, tab, line feed and
--   (finding 48)      carriage return, as the wrapper's .trim() strips them - in
--                     organization_create's and owner_recover's argument checks and
--                     in S-01 d15's comparison.
begin;
select no_plan();

-- ── Fixture (S-01 D M1 pass 4). Written by hand, as 0041, 0043 and 0044 do.
--
-- System Administrators: f1 Sam Sysadmin (active).
-- Org M (d1): Store Ms. m1 Owner, active, enrolled, PIN 1111 (the actor);
--             m2 Owner, active, enrolled, PIN 2222, window open (row 38: demoted to
--             Manager, the window untouched); mm Manager, active, enrolled, PIN 3333,
--             window open (row 38: demoted to Employee, then promoted back);
--             me Employee, active, never enrolled, no email (row 38: promoted).
-- Org T (d2): nobody. (Row 40: owner_recover's new Owner, padded and blank.)
-- Org P (d3): pa Owner, active, pa@p.test. (Row 40: d15 against a tab-padded argument.)
-- Org Q (d4): pb Owner, active, stored address padded with a tab and a line feed.
--             (Row 40: d15 against a tab-padded stored address.)
insert into public.system_administrators (auth_user_id, name, active) values
  ('00000000-0000-0000-0009-0000000000f1', 'Sam Sysadmin', true);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000d1', 'Org M'), ('00000000-0000-0000-0000-0000000000d2', 'Org T'),
  ('00000000-0000-0000-0000-0000000000d3', 'Org P'), ('00000000-0000-0000-0000-0000000000d4', 'Org Q');
insert into public.stores (id, org_id, trading_name) values
  ('00000000-0000-0000-0001-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'M Store');

insert into public.users (id, org_id, role, initials, display_name, email, passkey_enrolled_at, active, log, enrolment_open_until) values
  ('00000000-0000-0000-0002-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'owner',    'MA', 'Mia Actor',    'ma@m.test', now(), true, '[]', null),
  ('00000000-0000-0000-0002-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'owner',    'MB', 'Max Owner',    'mb@m.test', now(), true, '[]', now() + interval '1 hour'),
  ('00000000-0000-0000-0002-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'manager',  'MM', 'Moe Manager',  'mm@m.test', now(), true, '[]', now() + interval '1 hour'),
  ('00000000-0000-0000-0002-0000000000d4', '00000000-0000-0000-0000-0000000000d1', 'employee', 'ME', 'Meg Employee', null,        null,  true, '[]', null),
  ('00000000-0000-0000-0002-0000000000e1', '00000000-0000-0000-0000-0000000000d3', 'owner',    'PA', 'Pat Owner',    'pa@p.test', now(), true, '[]', null),
  ('00000000-0000-0000-0002-0000000000e2', '00000000-0000-0000-0000-0000000000d4', 'owner',    'PB', 'Pip Owner',    E'\tpb@p.test\n', now(), true, '[]', null);
insert into public.store_assignments (org_id, user_id, store_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d1', '00000000-0000-0000-0001-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d2', '00000000-0000-0000-0001-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d3', '00000000-0000-0000-0001-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d4', '00000000-0000-0000-0001-0000000000d1');
create function pg_temp.pin_hash(p_pin text) returns text language sql as $$
  select encode(extensions.hmac(p_pin,
           (select decrypted_secret from vault.decrypted_secrets where name = 'pin_pepper'),
           'sha256'), 'hex')
$$;
insert into public.user_pins (org_id, user_id, pin_hash, set_by) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d1', pg_temp.pin_hash('1111'), 'owner'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d2', pg_temp.pin_hash('2222'), 'owner'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0002-0000000000d3', pg_temp.pin_hash('3333'), 'owner');
-- ── end fixture ─────────────────────────────────────────────────────────────

create function pg_temp.sys(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0009-0000000000' || p)::uuid
$$;
create function pg_temp.org(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid
$$;
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0002-0000000000' || p)::uuid
$$;

-- Who is calling (0040, 0041, 0043, 0044): the Postgres role and §5.4's claims.
create temp table ctx (role text, claims jsonb);
insert into ctx values (null, null);
create function pg_temp.as_(p_role text, p_principal text, p_sub uuid, p_org uuid default null, p_user uuid default null)
returns void language sql as $$
  update ctx set role = p_role,
                 claims = jsonb_strip_nulls(jsonb_build_object('role', coalesce(p_role, 'postgres'), 'sub', p_sub,
                                                               'principal', p_principal, 'org_id', p_org, 'user_id', p_user))
$$;
create function pg_temp.run(p_sql text) returns jsonb language plpgsql as $$
declare c record; v jsonb; v_code text; v_msg text; v_detail text;
begin
  select * into c from ctx;
  perform set_config('request.jwt.claims', coalesce(c.claims::text, ''), true);
  perform set_config('role', coalesce(c.role, 'none'), true);
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
    v := jsonb_build_object('code', v_code, 'message', v_msg, 'details', nullif(v_detail, ''));
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end
$$;

-- user_change_role by Mia (an active Owner) on her personal session (M-04 d30, d51).
create function pg_temp.chrole(p_user uuid, p_role text, p_email text default null, p_pin text default null) returns jsonb language sql as $$
  select pg_temp.run(format('select app.user_change_role(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                               p_terminal_id => null, p_manager_pin => null, p_user_id => %L::uuid, p_role => %L,
                               p_email => %L, p_pin => %L)',
                            pg_temp.u('d1'), gen_random_uuid(), p_user, p_role, p_email, p_pin))
$$;
create function pg_temp.create_org(p_name text, p_owner_name text, p_owner_email text) returns jsonb language sql as $$
  select pg_temp.run(format('select app.organization_create(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_name => %L, p_owner_name => %L, p_owner_email => %L)',
                            pg_temp.sys('f1'), gen_random_uuid(), p_name, p_owner_name, p_owner_email))
$$;
create function pg_temp.recover(p_org uuid, p_user uuid, p_name text, p_email text, p_replace uuid) returns jsonb language sql as $$
  select pg_temp.run(format('select app.owner_recover(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_org_id => %L::uuid, p_user_id => %L::uuid, p_owner_name => %L, p_owner_email => %L,
                               p_replace_user_id => %L::uuid)',
                            pg_temp.sys('f1'), gen_random_uuid(), p_org, p_user, p_name, p_email, p_replace))
$$;
create function pg_temp.refusal(p_code text, p_key text, p_detail text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', p_code, 'message', p_key, 'details', p_detail)
$$;
create function pg_temp.window_of(p_user uuid) returns timestamptz language sql stable as $$
  select enrolment_open_until from public.users where id = p_user
$$;
create function pg_temp.counts() returns jsonb language sql stable as $$
  select jsonb_build_object('orgs', (select count(*) from public.organizations), 'users', (select count(*) from public.users),
                            'org_log', (select coalesce(sum(jsonb_array_length(log)), 0) from public.organizations),
                            'user_log', (select coalesce(sum(jsonb_array_length(log)), 0) from public.users))
$$;
create temp table snap (k text primary key, v jsonb);
create temp table got (k text primary key, r jsonb);
-- Source of a function in app, comments stripped (0042's reading).
create function pg_temp.src(p_name text) returns text language sql stable as $$
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = p_name
$$;
-- The statements of a function that write the role: each from its update to its semicolon.
create function pg_temp.role_updates(p_name text) returns setof text language sql stable as $$
  select m[1] from regexp_matches(pg_temp.src(p_name), '(update\s+public\.users[^;]*set\s+role\s*=[^;]*);', 'gi') m
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Row 38: A-150 — a demotion to Employee closes the person's enrolment window
-- ════════════════════════════════════════════════════════════════════════════
select pg_temp.as_('authenticated', 'person', gen_random_uuid(), pg_temp.org('d1'), pg_temp.u('d1'));

-- Moe, an enrolled Manager with an open window, demoted to Employee.
select is(pg_temp.chrole(pg_temp.u('d3'), 'employee'), jsonb_build_object('user_id', pg_temp.u('d3'), 'invite', false, 'email', null),
  'A-150 - user_change_role demoting an enrolled Manager with an open window to Employee succeeds as before');
select is((select jsonb_build_object('role', role, 'window', enrolment_open_until) from public.users where id = pg_temp.u('d3')),
  '{"role": "employee", "window": null}'::jsonb,
  'A-150 - the demotion to Employee closes the window: enrolment_open_until null with role employee');
-- Promoted back to Manager (enrolled, so no invite); the demotion cleared his PIN (M-04 d39), so a new one.
select is(pg_temp.chrole(pg_temp.u('d3'), 'manager', null, '3334'), jsonb_build_object('user_id', pg_temp.u('d3'), 'invite', false, 'email', null),
  'A-150 - promoted back to Manager: enrolled, so no invite');
select is((select jsonb_build_object('role', role, 'window', enrolment_open_until) from public.users where id = pg_temp.u('d3')),
  '{"role": "manager", "window": null}'::jsonb,
  'A-150 - promoted back without an invite, the window stays null: the link sent before the demotion opens nothing');
-- Meg, a never-enrolled Employee, promoted to Manager: the promotion invites.
select is(pg_temp.chrole(pg_temp.u('d4'), 'manager', 'meg@m.test', '4444'), jsonb_build_object('user_id', pg_temp.u('d4'), 'invite', true, 'email', 'meg@m.test'),
  'A-150, M-04 d43 - a never-enrolled Employee promoted to Manager: invite true');
select is(pg_temp.window_of(pg_temp.u('d4')), now() + interval '24 hours',
  'A-150, A-131 - the promotion that invites opens a fresh window: now plus 24 hours');
-- Max, an Owner with an open window, demoted to Manager: not a demotion to Employee.
insert into snap values ('m2_window', to_jsonb(pg_temp.window_of(pg_temp.u('d2'))));
select is(pg_temp.chrole(pg_temp.u('d2'), 'manager'), jsonb_build_object('user_id', pg_temp.u('d2'), 'invite', false, 'email', null),
  'A-150 - an Owner demoted to Manager succeeds as before');
select is((select jsonb_build_object('role', role, 'window', to_jsonb(enrolment_open_until)) from public.users where id = pg_temp.u('d2')),
  jsonb_build_object('role', 'manager', 'window', (select v from snap where k = 'm2_window')),
  'A-150 - an Owner demoted to Manager keeps their window untouched: only a demotion to Employee closes it');
select isnt((select v from snap where k = 'm2_window'), 'null'::jsonb, 'A-150 - (and that window was open, so untouched is not vacuous)');

-- Structural: the window is written in the statement that writes the role, and nowhere else.
select is((select count(*)::int from pg_temp.role_updates('user_change_role')), 1,
  'A-150 - user_change_role writes the role in exactly one statement');
select ok((select s ~* 'enrolment_open_until\s*=\s*case\s+when\s+p_role\s*=\s*''employee''\s+then\s+null\M' from pg_temp.role_updates('user_change_role') s)
          and regexp_count(pg_temp.src('user_change_role'), 'enrolment_open_until')
              = (select regexp_count(s, 'enrolment_open_until') from pg_temp.role_updates('user_change_role') s),
  'A-150 - that statement sets enrolment_open_until null when the new role is employee, and no other statement touches the column');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 40: conventions §5 (finding 48) — trim is space, tab, line feed, carriage return
-- ════════════════════════════════════════════════════════════════════════════
select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- organization_create: a name and an email padded with a tab and a newline are stored trimmed.
insert into got select 'oc', pg_temp.create_org(E'\t Tab Shop\n', E'\n Tina Tab\t', E'\ttina@tab.test\r\n');
select ok((select r ? 'org_id' from got where k = 'oc'), 'conventions §5 - organization_create with tab- and newline-padded arguments succeeds');
select is((select jsonb_build_object('name', o.name, 'logged', o.log -> 0 -> 'after' ->> 'name', 'owner', u.display_name, 'email', u.email)
             from got g join public.organizations o on o.id = (g.r ->> 'org_id')::uuid
                        join public.users u on u.id = (g.r ->> 'owner_user_id')::uuid where g.k = 'oc'),
  '{"name": "Tab Shop", "logged": "Tab Shop", "owner": "Tina Tab", "email": "tina@tab.test"}'::jsonb,
  'conventions §5, finding 48 - organization_create stores the name, its log entry, the Owner''s name and email trimmed of tab, line feed and carriage return');
-- A blank made only of those characters is refused as a blank, and nothing is written.
insert into snap values ('oc', pg_temp.counts());
select is(array[pg_temp.create_org(E' \t\n\r ', 'Tina Tab', 'tina2@tab.test'),
                pg_temp.create_org('Tab Shop', E'\t\r\n', 'tina2@tab.test'),
                pg_temp.create_org('Tab Shop', 'Tina Tab', E'\n\t \r')],
  array[pg_temp.refusal('22023', 'invalid_input', 'p_name'), pg_temp.refusal('22023', 'invalid_input', 'p_owner_name'),
        pg_temp.refusal('23502', 'email_required')],
  'conventions §5, finding 48 - organization_create: a name, an Owner name or an email made only of whitespace is refused as a blank');
select is(pg_temp.counts(), (select v from snap where k = 'oc'), 'conventions §5 - nothing written by those refusals');

-- owner_recover's new Owner (Org T, nobody): the same.
insert into snap values ('t', pg_temp.counts());
select is(array[pg_temp.recover(pg_temp.org('d2'), null, E'\t\n\r ', 'tom@t.test', null),
                pg_temp.recover(pg_temp.org('d2'), null, 'Tom Tab', E' \r\n\t', null)],
  array[pg_temp.refusal('22023', 'invalid_input', 'p_owner_name'), pg_temp.refusal('23502', 'email_required')],
  'conventions §5, finding 48 - owner_recover: a new Owner''s name or email made only of whitespace is refused as a blank');
select is(pg_temp.counts(), (select v from snap where k = 't'), 'conventions §5 - nothing written by those refusals in Org T');
insert into got select 't', pg_temp.recover(pg_temp.org('d2'), null, E'\n Tom Tab\t', E'\ttom@t.test\r\n', null);
select is((select r - 'user_id' from got where k = 't'), '{"invite": true, "email": "tom@t.test"}'::jsonb,
  'conventions §5, finding 48 - owner_recover returns the new Owner''s address trimmed of tab, line feed and carriage return');
select is((select jsonb_build_object('name', display_name, 'email', email) from public.users where id = (select (r ->> 'user_id')::uuid from got where k = 't')),
  '{"name": "Tom Tab", "email": "tom@t.test"}'::jsonb,
  'conventions §5, finding 48 - and stores the name and address trimmed');

-- S-01 d15: the replaced Owner's address padded with a tab is still their address.
insert into snap values ('p', pg_temp.counts());
select is(pg_temp.recover(pg_temp.org('d3'), null, 'Pam New', E'\tpa@p.test', pg_temp.u('e1')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15, finding 48 - the replaced Owner''s address padded with a tab: invalid_input, p_owner_email');
select is(pg_temp.recover(pg_temp.org('d3'), null, 'Pam New', E'PA@p.test\r\n', pg_temp.u('e1')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15, finding 48 - and in another case with a carriage return and line feed: invalid_input, p_owner_email');
select is(pg_temp.recover(pg_temp.org('d4'), null, 'Pia New', 'pb@p.test', pg_temp.u('e2')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15, finding 48 - a stored address padded with a tab and a line feed is compared trimmed: invalid_input, p_owner_email');
select is(pg_temp.counts(), (select v from snap where k = 'p'), 'S-01 d15 - nothing written by those refusals');
select is((select array_agg(active order by id) from public.users where id in (pg_temp.u('e1'), pg_temp.u('e2'))), array[true, true],
  'S-01 d15 - both named Owners are still active');

select * from finish();
rollback;
