-- S-01 D M1, rework pass 2 - what the review decisions of 2026-11-08 add to the
-- three S functions. Rows 28, 29, 30, 31 and 33 of the order (row 27 is
-- structural, 0042, and two-session, tests/auth/s01.test.ts).
--   conventions §5 (finding 4) - organization_create and owner_recover's new Owner:
--                    trimmed; a blank name is invalid_input naming it, a missing
--                    email email_required; nothing written on a refusal.
--   S-01 d10, M-04 d63 - a reactivated Owner keeps their Stores; clashing initials
--                    or a clashing PIN are cleared, and only the clashing value.
--   S-01 d11, A-146 - p_replace_user_id: the named active Owner deactivated and
--                    another restored in one act; the refusals; the floor.
--   S-01 d14       - an invite owner_recover sends is logged on the person.
--   M-04 d63, d34  - the cleared Owner is still refused initials_required at Assign.
begin;
select no_plan();

create function pg_temp.pin_hash(p_pin text) returns text language sql as $$
  select encode(extensions.hmac(p_pin,
           (select decrypted_secret from vault.decrypted_secrets where name = 'pin_pepper'),
           'sha256'), 'hex')
$$;

-- ── Fixture (S-01 D M1 pass 2). The states the decisions act on, written by hand.
--
-- System Administrators: f1 Sam Sysadmin (active).
-- Org P (10): Stores S (1a) and T (1b). pq Owner QR, deactivated, enrolled, at S,
--             PIN 1234; pe Employee QR, active, at S; pm Manager MP, active, at S,
--             PIN 1234. No active Owner. (Row 29's first fixture, row 33.)
-- Org Q (20): Store 2a. qo Owner QK, deactivated, never enrolled, at 2a, PIN 5678;
--             qe Employee EE at 2a; qm Manager MQ at 2a, PIN 9999; qx Employee QK,
--             deactivated, at 2a. Nothing clashes. (Row 29's second fixture, row 31.)
-- Org R (30): Store 3a. ro Owner RR, deactivated, enrolled, at 3a, PIN 3333; re
--             Employee RR at 3a; rm Manager MR at 3a, PIN 4444. Initials clash, the
--             PIN does not. (S-01 d10: only the clashing value.)
-- Org X (40): xo Owner, active, enrolled; xm Manager. (Row 30: replacement by invite.)
-- Org Y (50): Store 5a. yo Owner YY, active, at 5a, PIN 5555; yd Owner YY, deactivated,
--             enrolled, at 5a, PIN 5555. (Row 30: replacement by reactivation.)
-- Org Z (60): za Owner, active; zd1, zd2 Owners, deactivated; zm Manager. (Row 30's refusals.)
-- Org W (70): w1, w2 Owners, both active.
-- Org N (80): nobody. (Row 28 at owner_recover.)
-- Org O (90): o1 Owner, active — another Organization's Owner.
insert into public.system_administrators (auth_user_id, name, active) values
  ('00000000-0000-0000-0009-0000000000f1', 'Sam Sysadmin', true);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000010', 'Org P'), ('00000000-0000-0000-0000-000000000020', 'Org Q'),
  ('00000000-0000-0000-0000-000000000030', 'Org R'), ('00000000-0000-0000-0000-000000000040', 'Org X'),
  ('00000000-0000-0000-0000-000000000050', 'Org Y'), ('00000000-0000-0000-0000-000000000060', 'Org Z'),
  ('00000000-0000-0000-0000-000000000070', 'Org W'), ('00000000-0000-0000-0000-000000000080', 'Org N'),
  ('00000000-0000-0000-0000-000000000090', 'Org O');
insert into public.stores (id, org_id, trading_name) values
  ('00000000-0000-0000-0001-00000000001a', '00000000-0000-0000-0000-000000000010', 'P Store S'),
  ('00000000-0000-0000-0001-00000000001b', '00000000-0000-0000-0000-000000000010', 'P Store T'),
  ('00000000-0000-0000-0001-00000000002a', '00000000-0000-0000-0000-000000000020', 'Q Store'),
  ('00000000-0000-0000-0001-00000000003a', '00000000-0000-0000-0000-000000000030', 'R Store'),
  ('00000000-0000-0000-0001-00000000005a', '00000000-0000-0000-0000-000000000050', 'Y Store');

insert into public.users (id, org_id, role, initials, display_name, email, passkey_enrolled_at, active, log) values
  ('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000010', 'owner',    'QR', 'Quinn Returned', 'pq@p.test', now(), false, '[{"action": "deactivated"}]'),
  ('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000010', 'employee', 'QR', 'Quentin Rack',   null,        null,  true,  '[]'),
  ('00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000010', 'manager',  'MP', 'Mel Pin',        'pm@p.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000021', '00000000-0000-0000-0000-000000000020', 'owner',    'QK', 'Quill Kept',     'qo@q.test', null,  false, '[]'),
  ('00000000-0000-0000-0002-000000000022', '00000000-0000-0000-0000-000000000020', 'employee', 'EE', 'Ed Else',        null,        null,  true,  '[]'),
  ('00000000-0000-0000-0002-000000000023', '00000000-0000-0000-0000-000000000020', 'manager',  'MQ', 'Mo Quiet',       'qm@q.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000024', '00000000-0000-0000-0000-000000000020', 'employee', 'QK', 'Quit Kim',       null,        null,  false, '[]'),
  ('00000000-0000-0000-0002-000000000031', '00000000-0000-0000-0000-000000000030', 'owner',    'RR', 'Rae Returned',   'ro@r.test', now(), false, '[]'),
  ('00000000-0000-0000-0002-000000000032', '00000000-0000-0000-0000-000000000030', 'employee', 'RR', 'Rob Rack',       null,        null,  true,  '[]'),
  ('00000000-0000-0000-0002-000000000033', '00000000-0000-0000-0000-000000000030', 'manager',  'MR', 'Mia Rack',       'rm@r.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000041', '00000000-0000-0000-0000-000000000040', 'owner',    'XO', 'Xavier Gone',    'xo@x.test', now(), true,  '[{"action": "user_added"}]'),
  ('00000000-0000-0000-0002-000000000042', '00000000-0000-0000-0000-000000000040', 'manager',  'XM', 'Xia Manager',    'xm@x.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000051', '00000000-0000-0000-0000-000000000050', 'owner',    'YY', 'Yan Away',       'yo@y.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000052', '00000000-0000-0000-0000-000000000050', 'owner',    'YY', 'Yara Back',      'yd@y.test', now(), false, '[]'),
  ('00000000-0000-0000-0002-000000000061', '00000000-0000-0000-0000-000000000060', 'owner',    'ZA', 'Zed Active',     'za@z.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000062', '00000000-0000-0000-0000-000000000060', 'owner',    'Z1', 'Zoe One',        'z1@z.test', now(), false, '[]'),
  ('00000000-0000-0000-0002-000000000063', '00000000-0000-0000-0000-000000000060', 'owner',    'Z2', 'Zia Two',        'z2@z.test', now(), false, '[]'),
  ('00000000-0000-0000-0002-000000000064', '00000000-0000-0000-0000-000000000060', 'manager',  'ZM', 'Zak Manager',    'zm@z.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000071', '00000000-0000-0000-0000-000000000070', 'owner',    'W1', 'Wes One',        'w1@w.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000072', '00000000-0000-0000-0000-000000000070', 'owner',    'W2', 'Wyn Two',        'w2@w.test', now(), true,  '[]'),
  ('00000000-0000-0000-0002-000000000091', '00000000-0000-0000-0000-000000000090', 'owner',    'OO', 'Oli Other',      'o1@o.test', now(), true,  '[]');
insert into public.store_assignments (org_id, user_id, store_id) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0001-00000000001a'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0001-00000000001a'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0001-00000000001a'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0002-000000000021', '00000000-0000-0000-0001-00000000002a'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0002-000000000022', '00000000-0000-0000-0001-00000000002a'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0002-000000000023', '00000000-0000-0000-0001-00000000002a'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0002-000000000024', '00000000-0000-0000-0001-00000000002a'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0002-000000000031', '00000000-0000-0000-0001-00000000003a'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0002-000000000032', '00000000-0000-0000-0001-00000000003a'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0002-000000000033', '00000000-0000-0000-0001-00000000003a'),
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0002-000000000051', '00000000-0000-0000-0001-00000000005a'),
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0002-000000000052', '00000000-0000-0000-0001-00000000005a');
insert into public.user_pins (org_id, user_id, pin_hash, set_by) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000011', pg_temp.pin_hash('1234'), 'holder'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000013', pg_temp.pin_hash('1234'), 'owner'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0002-000000000021', pg_temp.pin_hash('5678'), 'holder'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0002-000000000023', pg_temp.pin_hash('9999'), 'owner'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0002-000000000031', pg_temp.pin_hash('3333'), 'holder'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0002-000000000033', pg_temp.pin_hash('4444'), 'owner'),
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0002-000000000051', pg_temp.pin_hash('5555'), 'holder'),
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0002-000000000052', pg_temp.pin_hash('5555'), 'holder');
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
create function pg_temp.st(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0001-0000000000' || p)::uuid
$$;

-- Who is calling (0040, 0041): the Postgres role and §5.4's claims.
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

create function pg_temp.create_org(p_name text, p_owner text, p_email text) returns jsonb language sql as $$
  select pg_temp.run(format('select app.organization_create(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_name => %L, p_owner_name => %L, p_owner_email => %L)',
                            pg_temp.sys('f1'), gen_random_uuid(), p_name, p_owner, p_email))
$$;
-- owner_recover with A-146's argument. One request id per call, kept, so a call's entries can be counted.
create temp table reqs (k text primary key, id uuid);
create function pg_temp.recover(p_k text, p_org uuid, p_user uuid, p_name text, p_email text, p_replace uuid) returns jsonb language sql as $$
  insert into reqs values (p_k, gen_random_uuid()) on conflict (k) do update set id = excluded.id;
  select pg_temp.run(format('select app.owner_recover(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_org_id => %L::uuid, p_user_id => %L::uuid, p_owner_name => %L, p_owner_email => %L,
                               p_replace_user_id => %L::uuid)',
                            pg_temp.sys('f1'), (select id from reqs where k = p_k), p_org, p_user, p_name, p_email, p_replace))
$$;
create function pg_temp.req(p_k text) returns uuid language sql stable as $$ select id from reqs where k = p_k $$;
create function pg_temp.refusal(p_code text, p_key text, p_detail text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', p_code, 'message', p_key, 'details', p_detail)
$$;

create function pg_temp.olog(p_org uuid) returns jsonb language sql stable as $$
  select log from public.organizations where id = p_org
$$;
create function pg_temp.ulog(p_user uuid) returns jsonb language sql stable as $$
  select log from public.users where id = p_user
$$;
create function pg_temp.acts(p_log jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'action' order by n), '{}') from jsonb_array_elements(p_log) with ordinality x(e, n)
$$;
create function pg_temp.person(p_user uuid) returns jsonb language sql stable as $$
  select to_jsonb(u) || jsonb_build_object('pin', (select to_jsonb(p) from public.user_pins p where p.user_id = u.id),
                                           'stores', (select coalesce(jsonb_agg(a.store_id order by a.store_id), '[]') from public.store_assignments a where a.user_id = u.id))
    from public.users u where u.id = p_user
$$;
-- Everything one Organization's rows hold that a refused call could change: the
-- Organization, every person, their PINs and their assignments.
create function pg_temp.state(p_org uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'org', (select to_jsonb(o) from public.organizations o where o.id = p_org),
    'people', (select coalesce(jsonb_agg(pg_temp.person(u.id) order by u.id), '[]') from public.users u where u.org_id = p_org))
$$;
create temp table snap (k text primary key, v jsonb);
create function pg_temp.snap(p_k text, p_org uuid) returns void language sql as $$
  insert into snap values (p_k, pg_temp.state(p_org)) on conflict (k) do update set v = excluded.v
$$;
create function pg_temp.unchanged(p_k text, p_org uuid) returns boolean language sql stable as $$
  select (select v from snap where k = p_k) = pg_temp.state(p_org)
$$;
-- Every count organization_create could change.
create function pg_temp.footprint() returns text language sql stable as $$
  select concat_ws('/', (select count(*) from public.organizations), (select count(*) from public.users),
                        (select sum(jsonb_array_length(log)) from public.organizations), (select sum(jsonb_array_length(log)) from public.users))
$$;
create temp table fp (k text primary key, v text);
create function pg_temp.active_owners(p_org uuid) returns uuid[] language sql stable as $$
  select coalesce(array_agg(id order by id), '{}') from public.users where org_id = p_org and role = 'owner' and active
$$;

select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- ════════════════════════════════════════════════════════════════════════════
-- Row 28: conventions §5 (finding 4) — what the database refuses of the arguments
-- ════════════════════════════════════════════════════════════════════════════
insert into fp select 'create', pg_temp.footprint();
select is(pg_temp.create_org('   ', 'Ann Owner', 'ann@example.test'), pg_temp.refusal('22023', 'invalid_input', 'p_name'),
  'S-01 D M1 finding 4 - organization_create with a blank p_name after trim: invalid_input, p_name');
select is(pg_temp.create_org(null, 'Ann Owner', 'ann@example.test'), pg_temp.refusal('22023', 'invalid_input', 'p_name'),
  'S-01 D M1 finding 4 - organization_create with a null p_name: invalid_input, p_name (no longer a bare 23502 from the column)');
select is(pg_temp.create_org('Spin City', '  ', 'ann@example.test'), pg_temp.refusal('22023', 'invalid_input', 'p_owner_name'),
  'S-01 D M1 finding 4 - organization_create with a blank p_owner_name: invalid_input, p_owner_name');
select is(pg_temp.create_org('Spin City', null, 'ann@example.test'), pg_temp.refusal('22023', 'invalid_input', 'p_owner_name'),
  'S-01 D M1 finding 4 - organization_create with a null p_owner_name: invalid_input, p_owner_name');
select is(pg_temp.create_org(' ', ' ', ' '), pg_temp.refusal('22023', 'invalid_input', 'p_name'),
  'S-01 D M1 finding 4 - all three blank: p_name is checked first (the arguments in their order)');
select is(pg_temp.create_org('Spin City', 'Ann Owner', null), pg_temp.refusal('23502', 'email_required'),
  'S-01 D M1 finding 4, A-117 - organization_create with no Owner email: email_required (invite implies email)');
select is(pg_temp.create_org('Spin City', 'Ann Owner', '   '), pg_temp.refusal('23502', 'email_required'),
  'S-01 D M1 finding 4, A-117 - organization_create with an Owner email blank after trim: email_required');
select is(pg_temp.footprint(), (select v from fp where k = 'create'),
  'S-01 D M1 finding 4 - nothing written by those refusals: no Organization, no person, no log entry');
create temp table trimmed (r jsonb);
insert into trimmed select pg_temp.create_org('  Groove Shack  ', '  Gil Owner ', ' gil@example.test  ');
select is((select jsonb_build_object('name', o.name, 'logged', o.log -> 0 -> 'after' ->> 'name', 'owner', u.display_name, 'email', u.email)
             from trimmed t join public.organizations o on o.id = (t.r ->> 'org_id')::uuid join public.users u on u.id = (t.r ->> 'owner_user_id')::uuid),
  '{"name": "Groove Shack", "logged": "Groove Shack", "owner": "Gil Owner", "email": "gil@example.test"}'::jsonb,
  'S-01 D M1 finding 4 - the stored values are the trimmed ones: the name, its log entry, the Owner''s name and email');

-- owner_recover's new-Owner branch, in Org N (nobody).
select pg_temp.snap('n', pg_temp.org('80'));
select is(pg_temp.recover('n1', pg_temp.org('80'), null, '   ', 'nia@n.test', null), pg_temp.refusal('22023', 'invalid_input', 'p_owner_name'),
  'S-01 D M1 finding 4 - owner_recover inviting a new Owner with a blank p_owner_name: invalid_input, p_owner_name');
select is(pg_temp.recover('n2', pg_temp.org('80'), null, 'Nia New', '  ', null), pg_temp.refusal('23502', 'email_required'),
  'S-01 D M1 finding 4, A-117 - owner_recover inviting a new Owner with an email blank after trim: email_required, never invite: true with email ''''');
select ok(pg_temp.unchanged('n', pg_temp.org('80')), 'S-01 D M1 finding 4 - nothing written by those refusals in Org N');
select is(pg_temp.recover('n3', pg_temp.org('80'), null, '  Nia New  ', ' nia@n.test ', null) - 'user_id',
  '{"invite": true, "email": "nia@n.test"}'::jsonb, 'S-01 D M1 finding 4 - a new Owner''s address is returned trimmed');
select is((select jsonb_build_object('name', display_name, 'email', email) from public.users where org_id = pg_temp.org('80')),
  '{"name": "Nia New", "email": "nia@n.test"}'::jsonb, 'S-01 D M1 finding 4 - and stored trimmed');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 29: S-01 d10, M-04 d63 — clashing initials and PIN cleared, Stores kept
-- ════════════════════════════════════════════════════════════════════════════
create temp table kept (k text primary key, v jsonb);
insert into kept values ('pe', pg_temp.person(pg_temp.u('12'))), ('pm', pg_temp.person(pg_temp.u('13')));
create temp table got (k text primary key, r jsonb);
insert into got select 'pq', pg_temp.recover('pq', pg_temp.org('10'), pg_temp.u('11'), null, null, null);
select is((select r from got where k = 'pq'), jsonb_build_object('user_id', pg_temp.u('11'), 'invite', false, 'email', null),
  'S-01 d10 - owner_recover reactivates Quinn (enrolled): {user_id, invite: false, email: null}');
select is((select jsonb_build_object('active', active, 'initials', initials) from public.users where id = pg_temp.u('11')),
  '{"active": true, "initials": null}'::jsonb,
  'S-01 d10 - Quinn is active, and the initials QR, now held by an active Employee at Store S, are cleared');
select is((select count(*)::int from public.user_pins where user_id = pg_temp.u('11')), 0,
  'S-01 d10, A-137 - the PIN an active Manager at Store S now holds is cleared: Quinn''s user_pins row is deleted');
select is((select array_agg(store_id order by store_id) from public.store_assignments where user_id = pg_temp.u('11')),
  array[pg_temp.st('1a')], 'S-01 d10 - Quinn keeps the assignment to Store S: the Stores stay');
select ok(pg_temp.person(pg_temp.u('12')) = (select v from kept where k = 'pe') and pg_temp.person(pg_temp.u('13')) = (select v from kept where k = 'pm'),
  'S-01 d10 - nothing a colleague holds changes: the Employee QR and the Manager with the same PIN are unchanged, row, PIN and Stores');
select is(pg_temp.acts(pg_temp.ulog(pg_temp.u('11'))), array['deactivated', 'reactivated'],
  'S-01 d9, d10, d14 - Quinn''s log gains reactivated, and no invite_sent: an enrolled Owner is not invited');
select is(pg_temp.ulog(pg_temp.u('11')) -> -1 -> 'before', '{"active": false, "initials": "QR", "pin_held": true}'::jsonb,
  'S-01 d10 - the reactivated entry''s before carries the cleared fields: initials QR, a PIN held');
select is(pg_temp.ulog(pg_temp.u('11')) -> -1 -> 'after', '{"active": true, "initials": null, "pin_held": false}'::jsonb,
  'S-01 d10 - and its after: no initials, no PIN (A-93: cleared, never the value)');
select is((select count(*)::int from public.users u, jsonb_array_elements(u.log) e where u.org_id = pg_temp.org('10') and e::text ~ pg_temp.pin_hash('1234')),
  0, 'A-93 - no entry carries the PIN or its hash');

-- Second fixture: nothing clashes — both kept. A deactivated Employee holding QK clashes with nothing.
insert into kept values ('qm_pin', (select to_jsonb(p) from public.user_pins p where p.user_id = pg_temp.u('21')));
insert into got select 'qo', pg_temp.recover('qo', pg_temp.org('20'), pg_temp.u('21'), null, null, null);
select is((select r from got where k = 'qo'), jsonb_build_object('user_id', pg_temp.u('21'), 'invite', true, 'email', 'qo@q.test'),
  'S-01 d10, A-117 - owner_recover reactivates Quill (never enrolled): {user_id, invite: true, email}');
select is((select jsonb_build_object('active', active, 'initials', initials) from public.users where id = pg_temp.u('21')),
  '{"active": true, "initials": "QK"}'::jsonb, 'S-01 d10 - nothing clashes, so Quill keeps QK (only a deactivated Employee holds it)');
select is((select to_jsonb(p) from public.user_pins p where p.user_id = pg_temp.u('21')), (select v from kept where k = 'qm_pin'),
  'S-01 d10 - and keeps the PIN, unchanged, set_by included');
select is(pg_temp.ulog(pg_temp.u('21')) -> 0 -> 'before', '{"active": false, "initials": "QK", "pin_held": true}'::jsonb,
  'S-01 d10 - before: QK, a PIN held');
select is(pg_temp.ulog(pg_temp.u('21')) -> 0 -> 'after', '{"active": true, "initials": "QK", "pin_held": true}'::jsonb,
  'S-01 d10 - after: the same initials and pin_held, as before');

-- Only the clashing value: initials clash, the PIN does not.
insert into got select 'ro', pg_temp.recover('ro', pg_temp.org('30'), pg_temp.u('31'), null, null, null);
select is((select jsonb_build_object('initials', u.initials, 'pin', (select count(*) from public.user_pins p where p.user_id = u.id))
             from public.users u where u.id = pg_temp.u('31')),
  '{"initials": null, "pin": 1}'::jsonb, 'S-01 d10 - only the clashing value is cleared: Rae''s initials RR go, the PIN nobody else holds stays');
select is(pg_temp.ulog(pg_temp.u('31')) -> 0 -> 'after', '{"active": true, "initials": null, "pin_held": true}'::jsonb,
  'S-01 d10 - and the entry says so');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 31: S-01 d14 — an invite owner_recover sends is logged on the person
-- ════════════════════════════════════════════════════════════════════════════
select is(pg_temp.acts(pg_temp.ulog(pg_temp.u('21'))), array['reactivated', 'invite_sent'],
  'S-01 d14 - a reactivated Owner who never enrolled: reactivated, then invite_sent, on their users.log');
select is(pg_temp.ulog(pg_temp.u('21')) -> 1 ->> 'actor_user_id', pg_temp.sys('f1')::text,
  'S-01 d14, M-04 d29 - invite_sent with the System Administrator as its actor');
select is(pg_temp.acts(pg_temp.ulog((select id from public.users where org_id = pg_temp.org('80')))), array['invite_sent'],
  'S-01 d14 - a new Owner owner_recover invites: invite_sent on their own users.log');
select is((select count(*)::int from public.users u, jsonb_array_elements(u.log) e where u.id in (pg_temp.u('11'), pg_temp.u('31')) and e ->> 'action' = 'invite_sent'),
  0, 'S-01 d14 - a reactivated Owner who has enrolled gets no invite_sent');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 33: M-04 d63 — the state row 29 creates, against M-04's functions
-- ════════════════════════════════════════════════════════════════════════════
select pg_temp.as_('authenticated', 'person', gen_random_uuid(), pg_temp.org('10'), pg_temp.u('11'));
select is(pg_temp.run(format('select app.user_assign(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_user_id => %L::uuid, p_store_id => %L::uuid)',
                             pg_temp.u('11'), gen_random_uuid(), pg_temp.u('11'), pg_temp.st('1b'))),
  pg_temp.refusal('23502', 'initials_required'),
  'M-04 d63, d34 - user_assign of the cleared Owner to a further Store T is still refused initials_required');
select is(pg_temp.run(format('select app.user_reactivate(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_user_id => %L::uuid)',
                             pg_temp.u('11'), gen_random_uuid(), pg_temp.u('11'))),
  pg_temp.refusal('WX409', 'invalid_state', 'active'),
  'M-04 d63, d47 - user_reactivate of the now-active Owner is unchanged: invalid_state, active');
select is((select array_agg(store_id order by store_id) from public.store_assignments where user_id = pg_temp.u('11')),
  array[pg_temp.st('1a')], 'M-04 d63 - and Quinn still holds Store S only');
select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- ════════════════════════════════════════════════════════════════════════════
-- Row 30: S-01 d11, A-146 — the replacement
-- ════════════════════════════════════════════════════════════════════════════
-- Called with no Owner to replace, still refused while one exists.
select pg_temp.snap('x', pg_temp.org('40'));
select is(pg_temp.recover('x0', pg_temp.org('40'), null, 'Xena New', 'xena@x.test', null),
  pg_temp.refusal('WX409', 'invalid_state', 'active_owner'),
  'A-146 - p_replace_user_id null with an active Owner: active_owner, as before');
select ok(pg_temp.unchanged('x', pg_temp.org('40')), 'A-146 - nothing written');

-- Replacement by invite.
insert into got select 'x', pg_temp.recover('x', pg_temp.org('40'), null, 'Xena New', 'xena@x.test', pg_temp.u('41'));
create temp table xnew as select (r ->> 'user_id')::uuid as id from got where k = 'x';
select is((select r - 'user_id' from got where k = 'x'), '{"invite": true, "email": "xena@x.test"}'::jsonb,
  'S-01 d11 - replacement by invite returns {user_id, invite: true, email}');
select is(pg_temp.active_owners(pg_temp.org('40')), array[(select id from xnew)],
  'S-01 d11, M-04 d26 - one transaction: the named Owner is inactive and the new one active, so the Organization has exactly one active Owner');
select is((select jsonb_build_object('active', active, 'role', role) from public.users where id = pg_temp.u('41')),
  '{"active": false, "role": "owner"}'::jsonb, 'A-146 - the replaced Owner is deactivated, still an Owner, the row kept (M-04 d5)');
select is(pg_temp.acts(pg_temp.ulog(pg_temp.u('41'))), array['user_added', 'deactivated'],
  'A-146 - the replaced Owner''s users.log gains deactivated, history intact');
select is((pg_temp.ulog(pg_temp.u('41')) -> -1) - 'at' - 'request_id',
  jsonb_build_object('action', 'deactivated', 'actor_user_id', pg_temp.sys('f1'), 'manager_user_id', null, 'terminal_id', null,
                     'principal', 'sysadmin', 'before', jsonb_build_object('active', true), 'after', jsonb_build_object('active', false)),
  'A-146 - deactivated by the System Administrator''s identity, before and after (O-01 d5)');
select is(pg_temp.acts(pg_temp.ulog((select id from xnew))), array['invite_sent'],
  'S-01 d11, d14 - the new Owner''s users.log holds invite_sent');
select is(pg_temp.acts(pg_temp.olog(pg_temp.org('40'))), array['owner_replaced', 'owner_invited'],
  'S-01 d11 - organizations.log holds owner_replaced, then owner_invited');
select is(pg_temp.olog(pg_temp.org('40')) -> 0 -> 'before', jsonb_build_object('user_id', pg_temp.u('41')),
  'A-146 - owner_replaced names the Owner replaced in before');
select is(pg_temp.olog(pg_temp.org('40')) -> 0 -> 'after', jsonb_build_object('user_id', (select id from xnew)),
  'A-146 - and the Owner restored in after: both people named');
select is((select array[(select count(*) from public.organizations o, jsonb_array_elements(o.log) e where o.id = pg_temp.org('40') and (e ->> 'request_id')::uuid = pg_temp.req('x')),
                        (select count(*) from public.users u, jsonb_array_elements(u.log) e where u.org_id = pg_temp.org('40') and (e ->> 'request_id')::uuid = pg_temp.req('x'))]::int[]),
  array[2, 2], 'A-146 - four entries from the one call, two per log, sharing its request id');

-- Replacement by reactivation: Yara (YY, PIN 5555) returns where Yan (YY, PIN 5555) is replaced.
insert into got select 'y', pg_temp.recover('y', pg_temp.org('50'), pg_temp.u('52'), null, null, pg_temp.u('51'));
select is((select r from got where k = 'y'), jsonb_build_object('user_id', pg_temp.u('52'), 'invite', false, 'email', null),
  'S-01 d11 - replacement by reactivation of an enrolled Owner returns {user_id, invite: false, email: null}');
select is(pg_temp.active_owners(pg_temp.org('50')), array[pg_temp.u('52')],
  'S-01 d11, M-04 d26 - Yan inactive, Yara active: one active Owner after the commit');
select is(array[pg_temp.acts(pg_temp.ulog(pg_temp.u('51'))), pg_temp.acts(pg_temp.ulog(pg_temp.u('52')))],
  array[array['deactivated'], array['reactivated']], 'A-146 - each person''s log: deactivated on Yan, reactivated on Yara');
select is(pg_temp.acts(pg_temp.olog(pg_temp.org('50'))), array['owner_replaced', 'owner_reactivated'],
  'A-146 - organizations.log: owner_replaced, then owner_reactivated — four entries, two per log');
select is((select jsonb_build_object('initials', u.initials, 'pin', (select count(*) from public.user_pins p where p.user_id = u.id))
             from public.users u where u.id = pg_temp.u('52')),
  '{"initials": "YY", "pin": 1}'::jsonb,
  'S-01 d10, d11 - the replaced Owner is deactivated first, so their YY and PIN clash with nothing: Yara keeps both (the fake''s order)');

-- The refusals, in Org Z and Org W; nothing written by any.
select pg_temp.snap('z', pg_temp.org('60')), pg_temp.snap('w', pg_temp.org('70')), pg_temp.snap('o', pg_temp.org('90'));
select is(pg_temp.recover('z1', pg_temp.org('60'), pg_temp.u('62'), null, null, pg_temp.u('64')), pg_temp.refusal('WX404', 'not_found'),
  'A-146 - the Owner to replace must be an Owner: a Manager is not_found');
select is(pg_temp.recover('z2', pg_temp.org('60'), pg_temp.u('62'), null, null, pg_temp.u('91')), pg_temp.refusal('WX404', 'not_found'),
  'A-146, A-86 - an Owner of another Organization is not_found, never acted on');
select is(pg_temp.recover('z3', pg_temp.org('60'), null, 'Zara New', 'zara@z.test', gen_random_uuid()), pg_temp.refusal('WX404', 'not_found'),
  'A-146 - an unknown id is not_found');
select is(pg_temp.recover('z4', pg_temp.org('60'), pg_temp.u('62'), null, null, pg_temp.u('63')), pg_temp.refusal('WX409', 'invalid_state', 'inactive'),
  'A-146 - the Owner to replace already deactivated: invalid_state, inactive (the plain call is the remedy)');
select is(pg_temp.recover('z5', pg_temp.org('60'), pg_temp.u('62'), null, null, pg_temp.u('62')), pg_temp.refusal('22023', 'invalid_input', 'p_replace_user_id'),
  'A-146 - the replaced and the restored person are the same: invalid_input, p_replace_user_id');
select is(pg_temp.recover('w1', pg_temp.org('70'), pg_temp.u('72'), null, null, pg_temp.u('71')), pg_temp.refusal('WX409', 'invalid_state', 'active'),
  'A-146, M-04 d47 - restoring an Owner who is already active, beside a replacement: invalid_state, active (the fake''s refusal, fake/identity.ts:599)');
select ok(pg_temp.unchanged('z', pg_temp.org('60')) and pg_temp.unchanged('w', pg_temp.org('70')) and pg_temp.unchanged('o', pg_temp.org('90')),
  'A-146 - nothing written by any of those refusals: Org Z, Org W and Org O unchanged, logs, PINs and Stores included');

select * from finish();
rollback;
