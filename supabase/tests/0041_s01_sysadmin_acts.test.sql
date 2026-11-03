-- S-01 D M1 - what the three S functions do. Rows 2, 7, 10, 13 (runtime), 14,
-- 15, 16, 17, 18, 19, 20, 21 and 23 (runtime) of the order.
--   S-01 d2, d5   - organization_create: the Organization and its first Owner, no
--                   initials, no Store; the invite is logged, never sent here.
--   S-01 d3, d9   - owner_recover: refused while an active Owner exists; restores the
--                   original row or invites a new Owner; logged on both.
--   S-01 d8       - owner_reset_request to a deactivated Owner: invalid_state, inactive.
--   A-86, A-135   - the Organization is the tenant's root; another's ids are not_found.
--   A-90, A-110   - every act appends organizations.log with the System Administrator.
--   A-94          - request id, a null terminal, principal sysadmin on every entry.
--   A-114, A-93   - link sent, never the link.   A-117 - invite by passkey_enrolled_at.
--   A-131         - every link-sending act opens the 24-hour window, with its log.
--   A-119, A-129  - neither binds: every refusal is raised and writes nothing.
--   A-140         - a System Administrator deactivated during the wait is refused.
--   O-01 d5       - the Organization's Owners read what was done from outside.
begin;
select no_plan();

-- ── Fixture (S-01 D M1). The states the three act on, written by hand. ──────
--
-- System Administrators: f1 Sam Sysadmin (active).
-- Org A: a1 Owner (active, enrolled, one earlier log entry), a2 Manager,
--        a3 Owner (deactivated), a4 Owner (active, no email — M-04 d33 makes it
--        unreachable; the fake's not_found branch, fake/identity.ts:607).
-- Org B: b1 Owner (deactivated, enrolled, initials OB, one earlier log entry, a
--        window that closed long ago), b2 Manager (active).
-- Org C: c1 Owner (deactivated, never enrolled).
-- Org D: nobody.
-- Org E: e1 Owner (deactivated) — for the A-140 case at the end.
insert into public.system_administrators (auth_user_id, name, active) values
  ('00000000-0000-0000-0009-0000000000f1', 'Sam Sysadmin', true);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B'),
  ('00000000-0000-0000-0000-00000000000c', 'Org C'),
  ('00000000-0000-0000-0000-00000000000d', 'Org D'),
  ('00000000-0000-0000-0000-00000000000e', 'Org E');

insert into public.users (id, org_id, role, initials, display_name, email, passkey_enrolled_at, active, log, enrolment_open_until) values
  ('00000000-0000-0000-0002-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner',   'OA', 'Olive Owner', 'oa@a.test', now(), true,
   '[{"action": "user_added"}]', null),
  ('00000000-0000-0000-0002-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'manager', 'MA', 'Max Manager', 'ma@a.test', now(), true,  '[]', null),
  ('00000000-0000-0000-0002-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'owner',   'OX', 'Oz Gone',     'ox@a.test', now(), false, '[]', null),
  ('00000000-0000-0000-0002-0000000000a4', '00000000-0000-0000-0000-00000000000a', 'owner',   'ON', 'No Mail',     null,        null,  true,  '[]', null),
  ('00000000-0000-0000-0002-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner',   'OB', 'Bea Gone',    'ob@b.test', now(), false,
   '[{"action": "deactivated"}]', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0002-0000000000b2', '00000000-0000-0000-0000-00000000000b', 'manager', 'MB', 'Mo Stays',    'mb@b.test', now(), true,  '[]', null),
  ('00000000-0000-0000-0002-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'owner',   null, 'Cy Never',    'oc@c.test', null,  false, '[]', null),
  ('00000000-0000-0000-0002-0000000000e1', '00000000-0000-0000-0000-00000000000e', 'owner',   'OE', 'Eve Gone',    'oe@e.test', null,  false, '[]', null);
-- ── end fixture ─────────────────────────────────────────────────────────────

create function pg_temp.sys(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0009-0000000000' || p)::uuid
$$;
create function pg_temp.org(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000000' || p)::uuid
$$;
create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0002-0000000000' || p)::uuid
$$;
-- The request ids this file sends, by number.
create function pg_temp.r(p int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0007-' || lpad(p::text, 12, '0'))::uuid
$$;

-- Who is calling (see 0040): the Postgres role and §5.4's claims.
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

-- The three, called by Sam (f1) on a sysadmin session.
create function pg_temp.create_org(p_name text, p_owner text, p_email text, p_req uuid) returns jsonb language sql as $$
  select pg_temp.run(format('select app.organization_create(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_name => %L, p_owner_name => %L, p_owner_email => %L)',
                            pg_temp.sys('f1'), p_req, p_name, p_owner, p_email))
$$;
create function pg_temp.recover(p_org uuid, p_user uuid, p_name text, p_email text, p_req uuid) returns jsonb language sql as $$
  select pg_temp.run(format('select app.owner_recover(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_org_id => %L::uuid, p_user_id => %L::uuid, p_owner_name => %L, p_owner_email => %L)',
                            pg_temp.sys('f1'), p_req, p_org, p_user, p_name, p_email))
$$;
create function pg_temp.reset_link(p_org uuid, p_user uuid, p_req uuid) returns jsonb language sql as $$
  select pg_temp.run(format('select app.owner_reset_request(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_org_id => %L::uuid, p_user_id => %L::uuid)',
                            pg_temp.sys('f1'), p_req, p_org, p_user))
$$;
create function pg_temp.refusal(p_code text, p_key text, p_detail text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', p_code, 'message', p_key, 'details', p_detail)
$$;

-- Logs, read as postgres.
create function pg_temp.olog(p_org uuid) returns jsonb language sql stable as $$
  select log from public.organizations where id = p_org
$$;
create function pg_temp.ulog(p_user uuid) returns jsonb language sql stable as $$
  select log from public.users where id = p_user
$$;
create function pg_temp.acts(p_log jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'action' order by n), '{}') from jsonb_array_elements(p_log) with ordinality x(e, n)
$$;
-- Everything one Organization's rows hold that a refused call could change.
create function pg_temp.state(p_org uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'org', (select to_jsonb(o) from public.organizations o where o.id = p_org),
    'users', (select coalesce(jsonb_agg(to_jsonb(u) order by u.id), '[]') from public.users u where u.org_id = p_org))
$$;
create temp table snap (k text primary key, v jsonb);
create function pg_temp.snap(p_k text, p_org uuid) returns void language sql as $$
  insert into snap values (p_k, pg_temp.state(p_org)) on conflict (k) do update set v = excluded.v
$$;
create function pg_temp.unchanged(p_k text, p_org uuid) returns boolean language sql stable as $$
  select (select v from snap where k = p_k) = pg_temp.state(p_org)
$$;
create temp table ids (k text primary key, id uuid);
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select id from ids where k = p_k $$;

select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- ════════════════════════════════════════════════════════════════════════════
-- Row 17: S-01 d2 — onboarding is a System Administrator's act
-- ════════════════════════════════════════════════════════════════════════════
create temp table made (r jsonb);
insert into made select pg_temp.create_org('Spin City', 'A. Beaulieu', 'ab@example.test', pg_temp.r(1));
insert into ids select 'spin', (r ->> 'org_id')::uuid from made;
insert into ids select 'spin_owner', (r ->> 'owner_user_id')::uuid from made;
select is((select array_agg(k order by k) from made, jsonb_object_keys(r) k),
  array['org_id', 'owner_user_id'], 'S-01 d2 - organization_create returns {org_id, owner_user_id}');
select is((select to_jsonb(o) - 'id' - 'created_at' - 'log' from public.organizations o where o.id = pg_temp.id('spin')),
  '{"name": "Spin City", "active": true}'::jsonb, 'S-01 d2 - the Organization is written with its name, active');
select is((select jsonb_build_object('org_id', u.org_id, 'role', u.role, 'display_name', u.display_name, 'email', u.email,
                                     'active', u.active, 'initials', u.initials, 'auth_user_id', u.auth_user_id,
                                     'passkey_enrolled_at', u.passkey_enrolled_at, 'selected_store_id', u.selected_store_id)
             from public.users u where u.id = pg_temp.id('spin_owner')),
  jsonb_build_object('org_id', pg_temp.id('spin'), 'role', 'owner', 'display_name', 'A. Beaulieu', 'email', 'ab@example.test',
                     'active', true, 'initials', null, 'auth_user_id', null, 'passkey_enrolled_at', null, 'selected_store_id', null),
  'S-01 d2 - its first Owner is written: an active Owner of that Organization with the name and email given, not yet linked (A-91), not yet enrolled (A-117)');
select is(pg_temp.acts(pg_temp.olog(pg_temp.id('spin'))), array['organization_created'],
  'S-01 d2 - the Organization''s log holds organization_created');
select is(pg_temp.olog(pg_temp.id('spin')) -> 0 -> 'after',
  jsonb_build_object('name', 'Spin City', 'owner_user_id', pg_temp.id('spin_owner')),
  'S-01 d2 - organization_created records the name and the Owner (fake/identity.ts:571)');
select is(pg_temp.acts(pg_temp.ulog(pg_temp.id('spin_owner'))), array['invite_sent'],
  'S-01 d2, A-114 - the Owner''s log holds invite_sent: the invite is authorised and logged here, sent by the Server Action after the commit (A-91)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(p.proargnames) a
            where n.nspname = 'app' and p.proname in ('organization_create', 'owner_recover', 'owner_reset_request')
              and a ~* '(pass|pin|secret|token|credential)'),
  0, 'S-01 d2 - no S function takes a password, PIN or other credential as an argument (conventions §5)');
-- Names are not unique: nothing says so, and nothing refuses it.
insert into ids select 'spin2', (pg_temp.create_org('Spin City', 'B. Other', 'bo@example.test', pg_temp.r(2)) ->> 'org_id')::uuid;
select is((select count(*)::int from public.organizations where name = 'Spin City'), 2,
  'S-01 d2 - a second organization_create with the same name is a second Organization (uniqueness not specified, so not refused)');

-- ── Row 2: A-86, A-135 — the root row and the Owner, and nothing else ──────
select is((select count(*)::int from public.organizations where id = pg_temp.id('spin')), 1,
  'A-135 - exactly one organizations row carries the new id, its own tenant key');
select is((select count(*)::int from public.users where org_id = pg_temp.id('spin')), 1,
  'A-86 - exactly one users row is keyed by the new Organization');
select is((select array[(select count(*) from public.stores where org_id = pg_temp.id('spin')),
                        (select count(*) from public.store_assignments where org_id = pg_temp.id('spin')),
                        (select count(*) from public.user_pins where org_id = pg_temp.id('spin')),
                        (select count(*) from public.terminals where org_id = pg_temp.id('spin')),
                        (select count(*) from public.review_flags where org_id = pg_temp.id('spin')),
                        (select count(*) from public.pin_refusals where org_id = pg_temp.id('spin'))]::int[]),
  array[0, 0, 0, 0, 0, 0], 'A-86, S-01 d2 - and zero rows in every other identity table: no Store, no assignment, no PIN (M-04 d27)');

-- ── Row 18: S-01 d5 — no initials ──────────────────────────────────────────
select ok((select initials is null from public.users where id = pg_temp.id('spin_owner')),
  'S-01 d5 - the first Owner holds no initials');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(p.proargnames) a
            where n.nspname = 'app' and p.proname = 'organization_create' and a ~* 'initials'),
  0, 'S-01 d5 - organization_create takes no initials argument');
-- The hand-off M-04 d34 names: the Owner takes initials at Assign. A Store of
-- Spin City written by hand stands in for store_create (O-01 D).
insert into public.stores (id, org_id, trading_name) values ('00000000-0000-0000-0001-000000000051', pg_temp.id('spin'), 'Spin City Main');
select pg_temp.as_('authenticated', 'person', gen_random_uuid(), pg_temp.id('spin'), pg_temp.id('spin_owner'));
select is(pg_temp.run(format('select app.user_assign(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_user_id => %L::uuid, p_store_id => %L::uuid)',
                             pg_temp.id('spin_owner'), gen_random_uuid(), pg_temp.id('spin_owner'), '00000000-0000-0000-0001-000000000051')),
  pg_temp.refusal('23502', 'initials_required'),
  'S-01 d5, M-04 d34 - user_assign of the new Owner, on their own personal session, refuses initials_required: Assign is where they take them');
select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- ── Row 16: A-131 — the window opens with the invite ───────────────────────
select is((select enrolment_open_until from public.users where id = pg_temp.id('spin_owner')), now() + interval '24 hours',
  'A-131 - organization_create sets the Owner''s enrolment_open_until to now plus 24 hours, in the transaction of its log entry');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 19: S-01 d3, d9 — owner_recover
-- ════════════════════════════════════════════════════════════════════════════
-- The argument shape the database itself rejects (conventions §5), before anything is read.
select pg_temp.snap('d', pg_temp.org('d'));
select is(pg_temp.recover(pg_temp.org('d'), pg_temp.u('e1'), 'Both Given', 'both@d.test', pg_temp.r(10)),
  pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
  'S-01 d3 - owner_recover given both a p_user_id and a new Owner''s name and email: invalid_input, p_user_id');
select is(pg_temp.recover(pg_temp.org('d'), null, null, null, pg_temp.r(11)),
  pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
  'S-01 d3 - owner_recover given neither: invalid_input, p_user_id');
select is(pg_temp.recover(pg_temp.org('d'), null, 'Name Only', null, pg_temp.r(12)),
  pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
  'S-01 d3 - owner_recover given a name but no email, and no p_user_id: invalid_input, p_user_id (the contract''s refine)');
select ok(pg_temp.unchanged('d', pg_temp.org('d')), 'A-119 - none of the invalid_input refusals wrote anything');

-- An unknown Organization.
select is(pg_temp.recover(gen_random_uuid(), null, 'Nobody', 'no@x.test', pg_temp.r(13)), pg_temp.refusal('WX404', 'not_found'),
  'A-86 - owner_recover for an Organization that does not exist: not_found');

-- A-90: refused while the Organization has an active Owner — before the subject is read.
select pg_temp.snap('a', pg_temp.org('a'));
select is(pg_temp.recover(pg_temp.org('a'), null, 'Nina New', 'nina@a.test', pg_temp.r(14)),
  pg_temp.refusal('WX409', 'invalid_state', 'active_owner'),
  'A-90, S-01 d3 - owner_recover inviting into an Organization with an active Owner: invalid_state, active_owner');
select is(pg_temp.recover(pg_temp.org('a'), pg_temp.u('a3'), null, null, pg_temp.r(15)),
  pg_temp.refusal('WX409', 'invalid_state', 'active_owner'),
  'A-90, S-01 d3 - owner_recover reactivating a deactivated Owner where an active one exists: invalid_state, active_owner');
select is(pg_temp.recover(pg_temp.org('a'), gen_random_uuid(), null, null, pg_temp.r(16)),
  pg_temp.refusal('WX409', 'invalid_state', 'active_owner'),
  'A-90 - with an active Owner, even an unknown p_user_id is active_owner: the count comes before the subject is read (fake/identity.ts:578)');
select ok(pg_temp.unchanged('a', pg_temp.org('a')),
  'A-90 - nothing written by the active_owner refusals: Org A''s row, log and every person, window included, unchanged');

-- Subjects that are not a deactivated Owner of this Organization.
select pg_temp.snap('b', pg_temp.org('b'));
select is(pg_temp.recover(pg_temp.org('b'), pg_temp.u('b2'), null, null, pg_temp.r(17)), pg_temp.refusal('WX404', 'not_found'),
  'S-01 d3 - owner_recover naming a Manager of that Organization: not_found');
select is(pg_temp.recover(pg_temp.org('b'), pg_temp.u('c1'), null, null, pg_temp.r(18)), pg_temp.refusal('WX404', 'not_found'),
  'A-86 - owner_recover naming an Owner of another Organization: not_found, never acted on');
select ok(pg_temp.unchanged('b', pg_temp.org('b')) and (select not active from public.users where id = pg_temp.u('c1')),
  'A-86 - and nothing written in either Organization');

-- Reactivation of an enrolled Owner: the original row, no invite.
create temp table recovered (k text, r jsonb);
insert into recovered select 'b1', pg_temp.recover(pg_temp.org('b'), pg_temp.u('b1'), null, null, pg_temp.r(19));
select is((select r from recovered where k = 'b1'),
  jsonb_build_object('user_id', pg_temp.u('b1'), 'invite', false, 'email', null),
  'S-01 d3, A-117 - reactivating an Owner who has enrolled returns {user_id, invite: false, email: null}');
select is((select jsonb_build_object('id', id, 'active', active, 'role', role, 'initials', initials, 'org_id', org_id)
             from public.users where id = pg_temp.u('b1')),
  jsonb_build_object('id', pg_temp.u('b1'), 'active', true, 'role', 'owner', 'initials', 'OB', 'org_id', pg_temp.org('b')),
  'S-01 d3, M-04 d19 - the Owner''s original row is restored: same id, active, still an Owner, initials kept');
select is(pg_temp.ulog(pg_temp.u('b1')) -> 0, '{"action": "deactivated"}'::jsonb,
  'M-04 d19 - and its earlier log entries are intact (an update, never delete-and-insert — A-118, M-04 d5)');
select is(pg_temp.acts(pg_temp.ulog(pg_temp.u('b1'))), array['deactivated', 'reactivated'],
  'S-01 d9 - the reactivation is logged on the Owner''s own users.log');
select is(pg_temp.ulog(pg_temp.u('b1')) -> -1 ->> 'actor_user_id', pg_temp.sys('f1')::text,
  'S-01 d9 - with the System Administrator as its actor');
select is(pg_temp.ulog(pg_temp.u('b1')) -> -1 -> 'before', '{"active": false, "initials": "OB"}'::jsonb,
  'O-01 d5 - the person''s entry carries the value before');
select is(pg_temp.ulog(pg_temp.u('b1')) -> -1 -> 'after', '{"active": true, "initials": "OB"}'::jsonb,
  'O-01 d5 - and after');
select is(pg_temp.acts(pg_temp.olog(pg_temp.org('b'))), array['owner_reactivated'],
  'S-01 d3 - and on the Organization''s log, owner_reactivated');
select is(pg_temp.olog(pg_temp.org('b')) -> -1 -> 'after', jsonb_build_object('user_id', pg_temp.u('b1')),
  'S-01 d3 - naming the Owner restored (fake/identity.ts:598)');
select is((select enrolment_open_until from public.users where id = pg_temp.u('b1')), '2026-01-01T00:00:00Z'::timestamptz,
  'A-131 - a reactivation of an enrolled Owner sends no link and leaves the window as it was');
select is((select count(*)::int from public.users where org_id = pg_temp.org('b')), 2,
  'M-04 d19 - no new row: the Organization still has its two people');
-- A-122: the restored Owner reaches their Organization again.
select pg_temp.as_('authenticated', 'person', gen_random_uuid(), pg_temp.org('b'), pg_temp.u('b1'));
select is(pg_temp.run('select to_jsonb(authz.org_reachable())'), 'true'::jsonb,
  'A-122 - after reactivation authz.org_reachable() is true under the Owner''s personal-session claims');
select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));
-- And now B has an active Owner, so a second recovery is refused.
select is(pg_temp.recover(pg_temp.org('b'), null, 'Late Comer', 'late@b.test', pg_temp.r(20)),
  pg_temp.refusal('WX409', 'invalid_state', 'active_owner'),
  'A-90 - once restored, a second owner_recover for that Organization is active_owner');

-- Reactivation of an Owner who never enrolled: an invite, and the window.
insert into recovered select 'c1', pg_temp.recover(pg_temp.org('c'), pg_temp.u('c1'), null, null, pg_temp.r(21));
select is((select r from recovered where k = 'c1'),
  jsonb_build_object('user_id', pg_temp.u('c1'), 'invite', true, 'email', 'oc@c.test'),
  'S-01 d3, A-117 - reactivating an Owner who never enrolled returns {user_id, invite: true, email}');
select is((select enrolment_open_until from public.users where id = pg_temp.u('c1')), now() + interval '24 hours',
  'A-131 - and opens their window to now plus 24 hours');
select is(pg_temp.acts(pg_temp.ulog(pg_temp.u('c1'))), array['reactivated'],
  'S-01 d9 - logged reactivated on the person');
select is(pg_temp.acts(pg_temp.olog(pg_temp.org('c'))), array['owner_reactivated'],
  'S-01 d3 - and owner_reactivated on the Organization');

-- A new Owner, for an Organization with nobody.
insert into recovered select 'dee', pg_temp.recover(pg_temp.org('d'), null, 'Dee New', 'dee@d.test', pg_temp.r(22));
insert into ids select 'dee', (r ->> 'user_id')::uuid from recovered where k = 'dee';
select is((select r from recovered where k = 'dee'), jsonb_build_object('user_id', pg_temp.id('dee'), 'invite', true, 'email', 'dee@d.test'),
  'S-01 d3, A-117 - inviting a new Owner returns {user_id, invite: true, email}');
select is((select jsonb_build_object('org_id', org_id, 'role', role, 'display_name', display_name, 'email', email, 'active', active,
                                     'initials', initials, 'auth_user_id', auth_user_id, 'passkey_enrolled_at', passkey_enrolled_at)
             from public.users where id = pg_temp.id('dee')),
  jsonb_build_object('org_id', pg_temp.org('d'), 'role', 'owner', 'display_name', 'Dee New', 'email', 'dee@d.test', 'active', true,
                     'initials', null, 'auth_user_id', null, 'passkey_enrolled_at', null),
  'S-01 d3 - the new Owner is written as organization_create writes one: active, no initials, unlinked, unenrolled');
select is((select count(*)::int from public.store_assignments where user_id = pg_temp.id('dee')), 0,
  'S-01 d3, M-04 d27 - with no Store');
select is(pg_temp.acts(pg_temp.olog(pg_temp.org('d'))), array['owner_invited'],
  'S-01 d3 - logged owner_invited on the Organization (fake/identity.ts:598)');
select is(pg_temp.olog(pg_temp.org('d')) -> -1 -> 'after', jsonb_build_object('user_id', pg_temp.id('dee')),
  'S-01 d3 - naming the Owner invited');
select is((select enrolment_open_until from public.users where id = pg_temp.id('dee')), now() + interval '24 hours',
  'A-131 - and the new Owner''s window opens to now plus 24 hours');

-- Row 15: A-117 — over every owner_recover that succeeded above.
select is((select array_agg(k order by k) from recovered where (r -> 'invite')::boolean and (r ->> 'email') is null),
  null, 'A-117 - no owner_recover returned invite: true with a null email (the contract does not encode it; the database holds it)');
select is((select array_agg(k order by k) from recovered where not (r -> 'invite')::boolean and r -> 'email' <> 'null'::jsonb),
  null, 'A-117 - and every invite: false came with email null');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 20: S-01 d3, d8; M-04 d38 — owner_reset_request
-- ════════════════════════════════════════════════════════════════════════════
select pg_temp.snap('a', pg_temp.org('a'));
select is(pg_temp.reset_link(gen_random_uuid(), pg_temp.u('a1'), pg_temp.r(30)), pg_temp.refusal('WX404', 'not_found'),
  'A-86 - owner_reset_request for an Organization that does not exist: not_found');
select is(pg_temp.reset_link(pg_temp.org('a'), pg_temp.u('a2'), pg_temp.r(31)), pg_temp.refusal('WX404', 'not_found'),
  'S-01 d3 - owner_reset_request naming a Manager: not_found (fake/identity.ts:607)');
select is(pg_temp.reset_link(pg_temp.org('a'), pg_temp.u('a4'), pg_temp.r(32)), pg_temp.refusal('WX404', 'not_found'),
  'S-01 d3 - owner_reset_request naming an Owner with no email: not_found');
select is(pg_temp.reset_link(pg_temp.org('a'), pg_temp.u('b1'), pg_temp.r(33)), pg_temp.refusal('WX404', 'not_found'),
  'A-86 - owner_reset_request naming an Owner of another Organization: not_found');
select is(pg_temp.reset_link(pg_temp.org('a'), pg_temp.u('a3'), pg_temp.r(34)), pg_temp.refusal('WX409', 'invalid_state', 'inactive'),
  'S-01 d8 - a reset link to a deactivated Owner is refused invalid_state, inactive');
select ok(pg_temp.unchanged('a', pg_temp.org('a')),
  'S-01 d8, A-119 - nothing written by those refusals: enrolment_open_until and both logs unchanged');

select is(pg_temp.reset_link(pg_temp.org('a'), pg_temp.u('a1'), pg_temp.r(35)),
  jsonb_build_object('user_id', pg_temp.u('a1'), 'email', 'oa@a.test'),
  'S-01 d3, M-04 d38 - owner_reset_request to an active Owner returns {user_id, email}, the address the Server Action sends to');
select is(pg_temp.acts(pg_temp.olog(pg_temp.org('a'))), array['reset_link_sent'],
  'S-01 d3 - logged reset_link_sent on the Organization');
select is(pg_temp.olog(pg_temp.org('a')) -> -1 -> 'after', jsonb_build_object('user_id', pg_temp.u('a1')),
  'S-01 d3 - naming the Owner (fake/identity.ts:611)');
select is(pg_temp.acts(pg_temp.ulog(pg_temp.u('a1'))), array['user_added', 'reset_link_sent'],
  'S-01 d3, O-01 d5 - and on the Owner''s users.log');
select is((select enrolment_open_until from public.users where id = pg_temp.u('a1')), now() + interval '24 hours',
  'A-131 - owner_reset_request opens the Owner''s window to now plus 24 hours');

-- ════════════════════════════════════════════════════════════════════════════
-- Rows 7, 10, 14, 21: every entry the three wrote
-- ════════════════════════════════════════════════════════════════════════════
create temp table written (tbl text, subject uuid, e jsonb);
insert into written
  select 'organizations', o.id, e from public.organizations o, jsonb_array_elements(o.log) e
   where e ->> 'principal' = 'sysadmin'
  union all
  select 'users', u.id, e from public.users u, jsonb_array_elements(u.log) e
   where e ->> 'principal' = 'sysadmin';
select is((select array_agg(tbl || ':' || (e ->> 'action') order by tbl, e ->> 'action') from written),
  array['organizations:organization_created', 'organizations:organization_created', 'organizations:owner_invited',
        'organizations:owner_reactivated', 'organizations:owner_reactivated', 'organizations:reset_link_sent',
        'users:invite_sent', 'users:invite_sent', 'users:reactivated', 'users:reactivated', 'users:reset_link_sent'],
  'A-90, A-94 - the entries the S calls wrote, and only those, carry principal sysadmin');
select is((select array_agg(distinct x.name) from written w join public.system_administrators x on x.auth_user_id = (w.e ->> 'actor_user_id')::uuid),
  array['Sam Sysadmin'], 'A-90, A-110 - every entry''s actor is the caller''s auth_user_id, resolvable to the system_administrators row''s name');
select is((select count(*)::int from written where (e ->> 'actor_user_id') is null), 0,
  'A-90 - no entry lacks its actor');
select ok((select bool_and(e ? 'terminal_id' and e -> 'terminal_id' = 'null'::jsonb) from written),
  'A-94 - every entry carries terminal_id, null for an S function');
select ok((select bool_and((e ->> 'request_id')::uuid in (select pg_temp.r(n) from generate_series(1, 40) n)) from written),
  'A-94 - every entry carries the request id of the call that wrote it');
select is((select array_agg(e ->> 'action' order by e ->> 'action') from written where (e ->> 'request_id')::uuid = pg_temp.r(35)),
  array['reset_link_sent', 'reset_link_sent'], 'A-94 - one call''s two entries share its request id');
select ok((select bool_and(e ? 'at' and e ? 'manager_user_id' and e -> 'manager_user_id' = 'null'::jsonb) from written),
  'O-01 d5, A-89 - every entry carries its timestamp, in users.log''s shape (no authorising Manager)');
select is((select array_agg(distinct k order by k) from written, jsonb_object_keys(e) k where tbl = 'organizations'),
  array['action', 'actor_user_id', 'after', 'at', 'before', 'manager_user_id', 'principal', 'request_id', 'terminal_id'],
  'O-01 d5 - every organizations.log entry carries actor, timestamp, before and after, and the A-94 columns');
-- A-94: a p_request_id of any value refuses nothing.
insert into ids select 'nullreq', (pg_temp.create_org('No Request', 'N. Request', 'nr@example.test', null) ->> 'org_id')::uuid;
select ok(pg_temp.id('nullreq') is not null and pg_temp.olog(pg_temp.id('nullreq')) -> 0 -> 'request_id' = 'null'::jsonb,
  'A-94 - a null p_request_id refuses nothing: it correlates, it never authorises');
-- A-114, A-93: link sent, never the link.
select is((select count(*)::int from (select e from public.organizations, jsonb_array_elements(log) e
                                      union all select e from public.users, jsonb_array_elements(log) e) x
            where e::text ~* '(http|token|otp)'),
  0, 'A-93, A-114 - no log entry in either table holds a link, a token or a one-time code');

-- Row 21: O-01 d5 — the Organization's Owners read it; no one else does.
select pg_temp.as_('authenticated', 'person', gen_random_uuid(), pg_temp.org('a'), pg_temp.u('a1'));
select is(pg_temp.run(format('select jsonb_build_object(%L, count(*), %L, max(jsonb_array_length(log))) from public.organizations', 'rows', 'entries')),
  '{"rows": 1, "entries": 1}'::jsonb,
  'O-01 d5, S-01 d3 - under an Owner''s personal-session claims their Organization''s row and its log read back');
select is(pg_temp.run(format('select to_jsonb(count(*)) from public.organizations where id = %L::uuid', pg_temp.org('b'))), '0'::jsonb,
  'A-86 - and another Organization''s row and log do not');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 23: A-140 — a System Administrator deactivated during the wait
-- ════════════════════════════════════════════════════════════════════════════
-- One session cannot interleave a second, so the wait is stood in for: the
-- Owner-rows lock (A-138 step 2, owner_recover's first lock) is replaced, inside
-- this rolled-back transaction, by one that takes the same lock and then
-- deactivates Sam — what a concurrent runbook act committing while owner_recover
-- waited would leave. waxworks_app is granted update for that alone.
grant update on public.system_administrators to waxworks_app;   -- this transaction only (rolled back)
create or replace function app_internal.lock_active_owners(p_org_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.users u where u.org_id = p_org_id and u.role = 'owner' and u.active order by u.id for no key update;
  update public.system_administrators set active = false, deactivated_at = pg_catalog.now()
   where auth_user_id = '00000000-0000-0000-0009-0000000000f1';
end
$$;
select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));
select pg_temp.snap('e', pg_temp.org('e'));
select is(pg_temp.recover(pg_temp.org('e'), pg_temp.u('e1'), null, null, pg_temp.r(40)),
  pg_temp.refusal('42501', 'role_refused', 'sysadmin'),
  'A-140 - a System Administrator deactivated between the header and the lock is refused role_refused, sysadmin');
select ok(pg_temp.unchanged('e', pg_temp.org('e')),
  'A-140 - before anything is written: the Owner still deactivated, both logs and the window unchanged');
select is(pg_temp.recover(pg_temp.org('e'), null, 'Ed New', 'ed@e.test', pg_temp.r(41)),
  pg_temp.refusal('42501', 'role_refused', 'sysadmin'),
  'A-140 - and on the invite branch, whose last lock is the same step');
select ok(pg_temp.unchanged('e', pg_temp.org('e')), 'A-140 - nothing written there either');

select * from finish();
rollback;
