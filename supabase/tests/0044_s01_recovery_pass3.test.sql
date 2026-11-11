-- S-01 D M1, rework pass 3 - what the pass-2 review decisions of 2026-11-08 add.
-- Rows 34, 35 and 36 of the order (row 37 is 0042:79 and 0043's added cases).
--   S-01 d15        - a replacement may not invite a new Owner at the replaced
--                     Owner's own address: invalid_input / p_owner_email, compared
--                     trimmed and without regard to case, before anything is written.
--   A-148           - a deactivation closes the person's enrolment window:
--                     user_deactivate and owner_recover's replacement set
--                     enrolment_open_until null in the write that sets active false;
--                     a reactivation opens a fresh window only if it sends a link.
--   conventions §5  - owner_recover's argument shapes (finding 16): none of the
--                     three, or p_user_id with a name or an email, is invalid_input /
--                     p_user_id; a name with no email is email_required; an email
--                     with no name is invalid_input / p_owner_name. Before any read.
begin;
select no_plan();

-- ── Fixture (S-01 D M1 pass 3). Written by hand, as 0041 and 0043 do.
--
-- System Administrators: f1 Sam Sysadmin (active).
-- Org G (a1): go Owner, active, enrolled, email go@g.test. (Row 34: the refusals,
--             then a different address succeeds.)
-- Org H (a2): ho Owner, active, h@h.test; hd Owner, deactivated, enrolled, the same
--             address h@h.test. (Row 34: a replacement by reactivation is unaffected.)
-- Org I (a3): id Owner, deactivated, i@i.test; no active Owner. (Row 34: the plain
--             invite is unaffected.)
-- Org D (b1): Store Ds. da Owner, active (the actor); dm Manager, active, at Ds,
--             enrolled, window open. (Row 35: user_deactivate, user_reactivate.)
-- Org E (b2): eo Owner, active, enrolled, window open. (Row 35: replaced, then
--             restored by an enrolled reactivation.)
-- Org F (b3): fo Owner, active, never enrolled, window open. (Row 35: replaced, then
--             restored by a reactivation that invites.)
-- Org K (c1): nobody. (Row 36: the argument shapes.)
insert into public.system_administrators (auth_user_id, name, active) values
  ('00000000-0000-0000-0009-0000000000f1', 'Sam Sysadmin', true);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org G'), ('00000000-0000-0000-0000-0000000000a2', 'Org H'),
  ('00000000-0000-0000-0000-0000000000a3', 'Org I'), ('00000000-0000-0000-0000-0000000000b1', 'Org D'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org E'), ('00000000-0000-0000-0000-0000000000b3', 'Org F'),
  ('00000000-0000-0000-0000-0000000000c1', 'Org K');
insert into public.stores (id, org_id, trading_name) values
  ('00000000-0000-0000-0001-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'D Store');

insert into public.users (id, org_id, role, initials, display_name, email, passkey_enrolled_at, active, log, enrolment_open_until) values
  ('00000000-0000-0000-0002-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'owner',   'GO', 'Gus Owner',   'go@g.test', now(), true,  '[]', null),
  ('00000000-0000-0000-0002-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'owner',   'HO', 'Hal Owner',   'h@h.test',  now(), true,  '[]', null),
  ('00000000-0000-0000-0002-0000000000a3', '00000000-0000-0000-0000-0000000000a2', 'owner',   'HD', 'Hal Device',  'h@h.test',  now(), false, '[]', null),
  ('00000000-0000-0000-0002-0000000000a4', '00000000-0000-0000-0000-0000000000a3', 'owner',   'ID', 'Ida Gone',    'i@i.test',  now(), false, '[]', null),
  ('00000000-0000-0000-0002-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'owner',   'DA', 'Dee Actor',   'da@d.test', now(), true,  '[]', null),
  ('00000000-0000-0000-0002-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'manager', 'DM', 'Dan Manager', 'dm@d.test', now(), true,  '[]', now() + interval '1 hour'),
  ('00000000-0000-0000-0002-0000000000b3', '00000000-0000-0000-0000-0000000000b2', 'owner',   'EO', 'Eve Owner',   'eo@e.test', now(), true,  '[]', now() + interval '1 hour'),
  ('00000000-0000-0000-0002-0000000000b4', '00000000-0000-0000-0000-0000000000b3', 'owner',   'FO', 'Fay Owner',   'fo@f.test', null,  true,  '[]', now() + interval '1 hour');
insert into public.store_assignments (org_id, user_id, store_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0002-0000000000b1', '00000000-0000-0000-0001-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0002-0000000000b2', '00000000-0000-0000-0001-0000000000b1');
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

-- Who is calling (0040, 0041, 0043): the Postgres role and §5.4's claims.
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

create function pg_temp.recover(p_org uuid, p_user uuid, p_name text, p_email text, p_replace uuid) returns jsonb language sql as $$
  select pg_temp.run(format('select app.owner_recover(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                               p_org_id => %L::uuid, p_user_id => %L::uuid, p_owner_name => %L, p_owner_email => %L,
                               p_replace_user_id => %L::uuid)',
                            pg_temp.sys('f1'), gen_random_uuid(), p_org, p_user, p_name, p_email, p_replace))
$$;
create function pg_temp.refusal(p_code text, p_key text, p_detail text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', p_code, 'message', p_key, 'details', p_detail)
$$;
create function pg_temp.acts(p_log jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'action' order by n), '{}') from jsonb_array_elements(p_log) with ordinality x(e, n)
$$;
create function pg_temp.ulog(p_user uuid) returns jsonb language sql stable as $$
  select log from public.users where id = p_user
$$;
create function pg_temp.window_of(p_user uuid) returns timestamptz language sql stable as $$
  select enrolment_open_until from public.users where id = p_user
$$;
-- Everything one Organization's rows hold that a refused call could change: the
-- Organization (its log included), every person (theirs included), their PINs and Stores.
create function pg_temp.state(p_org uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'org', (select to_jsonb(o) from public.organizations o where o.id = p_org),
    'people', (select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object(
                 'pin', (select to_jsonb(p) from public.user_pins p where p.user_id = u.id),
                 'stores', (select coalesce(jsonb_agg(a.store_id order by a.store_id), '[]') from public.store_assignments a where a.user_id = u.id))
               order by u.id), '[]') from public.users u where u.org_id = p_org))
$$;
create temp table snap (k text primary key, v jsonb);
create function pg_temp.snap(p_k text, p_org uuid) returns void language sql as $$
  insert into snap values (p_k, pg_temp.state(p_org)) on conflict (k) do update set v = excluded.v
$$;
create function pg_temp.unchanged(p_k text, p_org uuid) returns boolean language sql stable as $$
  select (select v from snap where k = p_k) = pg_temp.state(p_org)
$$;
create temp table got (k text primary key, r jsonb);

-- Source of a function in app, comments stripped (0042's reading).
create function pg_temp.src(p_name text) returns text language sql stable as $$
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = p_name
$$;
-- The statements of a function that set active = false: each from its update to its semicolon.
create function pg_temp.deactivating_updates(p_name text) returns setof text language sql stable as $$
  select m[1] from regexp_matches(pg_temp.src(p_name), '(update\s+public\.users[^;]*set\s+active\s*=\s*false[^;]*);', 'gi') m
$$;

select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- ════════════════════════════════════════════════════════════════════════════
-- Row 34: S-01 d15 — a replacement may not invite at the replaced Owner's address
-- ════════════════════════════════════════════════════════════════════════════
select pg_temp.snap('g', pg_temp.org('a1'));
select is(pg_temp.recover(pg_temp.org('a1'), null, 'Gil New', 'go@g.test', pg_temp.u('a1')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15 - a replacement inviting a new Owner at the replaced Owner''s own address: invalid_input, p_owner_email');
select is(pg_temp.recover(pg_temp.org('a1'), null, 'Gil New', 'GO@G.Test', pg_temp.u('a1')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15 - the same address in another case: invalid_input, p_owner_email (compared without regard to case)');
select is(pg_temp.recover(pg_temp.org('a1'), null, 'Gil New', '   go@g.test  ', pg_temp.u('a1')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15 - the same address padded with spaces: invalid_input, p_owner_email (compared trimmed)');
select ok(pg_temp.unchanged('g', pg_temp.org('a1')),
  'S-01 d15 - nothing written by those refusals: Org G''s rows, its log and every person''s log unchanged');
select is((select jsonb_build_object('active', active, 'role', role) from public.users where id = pg_temp.u('a1')),
  '{"active": true, "role": "owner"}'::jsonb, 'S-01 d15 - the named Owner is still an active Owner');
insert into got select 'g', pg_temp.recover(pg_temp.org('a1'), null, 'Gil New', 'gil@g.test', pg_temp.u('a1'));
select is((select r - 'user_id' from got where k = 'g'), '{"invite": true, "email": "gil@g.test"}'::jsonb,
  'S-01 d15, d11 - a different address succeeds, as row 30 holds');
select is((select active from public.users where id = pg_temp.u('a1')), false,
  'S-01 d11 - and the named Owner is then deactivated');

-- A replacement by reactivation is unaffected: Hal Device shares Hal Owner's address.
insert into got select 'h', pg_temp.recover(pg_temp.org('a2'), pg_temp.u('a3'), null, null, pg_temp.u('a2'));
select is((select r from got where k = 'h'), jsonb_build_object('user_id', pg_temp.u('a3'), 'invite', false, 'email', null),
  'S-01 d15 - a replacement by reactivation is unaffected, even where the restored Owner shares the replaced Owner''s address');
-- The plain invite (no replacement) is unaffected: a new Owner at the deactivated Owner's address.
insert into got select 'i', pg_temp.recover(pg_temp.org('a3'), null, 'Ida New', 'i@i.test', null);
select is((select r - 'user_id' from got where k = 'i'), '{"invite": true, "email": "i@i.test"}'::jsonb,
  'S-01 d15 - the plain invite, with no Owner replaced, is unaffected');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 35: A-148 — a deactivation closes the person's enrolment window
-- ════════════════════════════════════════════════════════════════════════════
-- user_deactivate, by Dee (an active Owner) on her personal session, of Dan (window open).
select pg_temp.as_('authenticated', 'person', gen_random_uuid(), pg_temp.org('b1'), pg_temp.u('b1'));
select is(pg_temp.run(format('select app.user_deactivate(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_user_id => %L::uuid)',
                             pg_temp.u('b1'), gen_random_uuid(), pg_temp.u('b2'))),
  jsonb_build_object('user_id', pg_temp.u('b2')), 'A-148 - user_deactivate of a Manager with an open window succeeds as before');
select is((select jsonb_build_object('active', active, 'window', enrolment_open_until) from public.users where id = pg_temp.u('b2')),
  '{"active": false, "window": null}'::jsonb,
  'A-148 - user_deactivate closes the window: enrolment_open_until null with active false');
select is(pg_temp.run(format('select app.user_reactivate(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_user_id => %L::uuid)',
                             pg_temp.u('b1'), gen_random_uuid(), pg_temp.u('b2'))),
  jsonb_build_object('user_id', pg_temp.u('b2')), 'A-148 - user_reactivate restores Dan');
select is((select jsonb_build_object('active', active, 'window', enrolment_open_until) from public.users where id = pg_temp.u('b2')),
  '{"active": true, "window": null}'::jsonb,
  'A-148 - restored by user_reactivate, the window stays null: the link sent before the deactivation opens nothing');
select pg_temp.as_('sysadmin', 'sysadmin', pg_temp.sys('f1'));

-- owner_recover's replacement, then an enrolled reactivation (Org E).
insert into got select 'e1', pg_temp.recover(pg_temp.org('b2'), null, 'Ezra New', 'ezra@e.test', pg_temp.u('b3'));
select is((select jsonb_build_object('active', active, 'window', enrolment_open_until) from public.users where id = pg_temp.u('b3')),
  '{"active": false, "window": null}'::jsonb,
  'A-148, A-146 - the Owner a replacement deactivates has their window closed in the same act');
insert into got select 'e2', pg_temp.recover(pg_temp.org('b2'), pg_temp.u('b3'), null, null, (select (r ->> 'user_id')::uuid from got where k = 'e1'));
select is((select r from got where k = 'e2'), jsonb_build_object('user_id', pg_temp.u('b3'), 'invite', false, 'email', null),
  'A-148 - Eve (enrolled) restored by a second owner_recover replacing Ezra: no invite');
select is((select jsonb_build_object('active', active, 'window', enrolment_open_until) from public.users where id = pg_temp.u('b3')),
  '{"active": true, "window": null}'::jsonb,
  'A-148 - restored by an enrolled owner_recover reactivation, the window stays null: it sends no link');
select is(pg_temp.window_of((select (r ->> 'user_id')::uuid from got where k = 'e1')), null::timestamptz,
  'A-148 - and Ezra, replaced in turn, has his window closed too');

-- owner_recover's replacement, then a reactivation that invites (Org F).
insert into got select 'f1', pg_temp.recover(pg_temp.org('b3'), null, 'Finn New', 'finn@f.test', pg_temp.u('b4'));
select is(pg_temp.window_of(pg_temp.u('b4')), null::timestamptz,
  'A-148 - Fay, replaced while an invite was outstanding, has her window closed');
insert into got select 'f2', pg_temp.recover(pg_temp.org('b3'), pg_temp.u('b4'), null, null, (select (r ->> 'user_id')::uuid from got where k = 'f1'));
select is((select r from got where k = 'f2'), jsonb_build_object('user_id', pg_temp.u('b4'), 'invite', true, 'email', 'fo@f.test'),
  'A-148, A-117 - Fay (never enrolled) restored: invite true');
select is(pg_temp.window_of(pg_temp.u('b4')), now() + interval '24 hours',
  'A-148, A-131 - a reactivation that sends a link opens a fresh window: now plus 24 hours');

-- Structural: the window is closed in the statement that writes active = false.
select is((select array_agg(f order by f) from unnest(array['user_deactivate', 'owner_recover']) f
            where (select count(*) from pg_temp.deactivating_updates(f)) <> 1
               or exists (select 1 from pg_temp.deactivating_updates(f) s where s !~* 'enrolment_open_until\s*=\s*null')),
  null, 'A-148 - user_deactivate and owner_recover each set active = false in one statement, and that statement sets enrolment_open_until = null');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 36: conventions §5 (finding 16) — owner_recover's argument shapes
-- ════════════════════════════════════════════════════════════════════════════
-- In Org K (nobody), and again for an Organization that does not exist: the
-- arguments are refused before any read, so never not_found.
select pg_temp.snap('k', pg_temp.org('c1'));
select is(pg_temp.recover(pg_temp.org('c1'), null, null, null, null), pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
  'conventions §5 - owner_recover given none of p_user_id, a name and an email: invalid_input, p_user_id');
select is(pg_temp.recover(pg_temp.org('c1'), gen_random_uuid(), 'Kit Name', null, null), pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
  'conventions §5 - owner_recover given p_user_id and a name: invalid_input, p_user_id (both)');
select is(pg_temp.recover(pg_temp.org('c1'), gen_random_uuid(), null, 'kit@k.test', null), pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
  'conventions §5 - owner_recover given p_user_id and an email: invalid_input, p_user_id (both)');
select is(pg_temp.recover(pg_temp.org('c1'), null, 'Kit Name', null, null), pg_temp.refusal('23502', 'email_required'),
  'conventions §5, finding 16 - owner_recover given a name with no email: email_required, as organization_create answers');
select is(pg_temp.recover(pg_temp.org('c1'), null, null, 'kit@k.test', null), pg_temp.refusal('22023', 'invalid_input', 'p_owner_name'),
  'conventions §5, finding 16 - owner_recover given an email with no name: invalid_input, p_owner_name, as organization_create answers');
select ok(pg_temp.unchanged('k', pg_temp.org('c1')), 'conventions §5 - nothing written by those refusals in Org K');
select is(array[pg_temp.recover(gen_random_uuid(), null, null, null, null),
                pg_temp.recover(gen_random_uuid(), gen_random_uuid(), 'Kit Name', null, null),
                pg_temp.recover(gen_random_uuid(), null, 'Kit Name', null, null),
                pg_temp.recover(gen_random_uuid(), null, null, 'kit@k.test', null)],
  array[pg_temp.refusal('22023', 'invalid_input', 'p_user_id'), pg_temp.refusal('22023', 'invalid_input', 'p_user_id'),
        pg_temp.refusal('23502', 'email_required'), pg_temp.refusal('22023', 'invalid_input', 'p_owner_name')],
  'conventions §5 - the same four shapes for an Organization that does not exist: the argument refusal, never not_found (before any read)');

-- ════════════════════════════════════════════════════════════════════════════
-- Row 39 (pass 4, finding 42): S-01 d15 with the STORED address varied — appended
-- after the last assertion, so every earlier line and number holds.
-- Org L (c2): lo Owner, active, stored ' Mixed@Case.TEST ' (case and padding on the
--             stored side). Org N (c3): no Owner, active, stored address null.
-- Org B (c4): bo Owner, active, stored address blank ('   ').
-- ════════════════════════════════════════════════════════════════════════════
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000c2', 'Org L'), ('00000000-0000-0000-0000-0000000000c3', 'Org N'),
  ('00000000-0000-0000-0000-0000000000c4', 'Org B');
insert into public.users (id, org_id, role, initials, display_name, email, passkey_enrolled_at, active, log, enrolment_open_until) values
  ('00000000-0000-0000-0002-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'owner', 'LO', 'Lou Owner', ' Mixed@Case.TEST ', now(), true, '[]', null),
  ('00000000-0000-0000-0002-0000000000c3', '00000000-0000-0000-0000-0000000000c3', 'owner', 'NO', 'Nan Owner', null,                now(), true, '[]', null),
  ('00000000-0000-0000-0002-0000000000c4', '00000000-0000-0000-0000-0000000000c4', 'owner', 'BO', 'Bea Owner', '   ',               now(), true, '[]', null);
select pg_temp.snap('l', pg_temp.org('c2'));
select is(pg_temp.recover(pg_temp.org('c2'), null, 'Lee New', 'mixed@case.test', pg_temp.u('c2')),
  pg_temp.refusal('22023', 'invalid_input', 'p_owner_email'),
  'S-01 d15 (finding 42) - the replaced Owner''s stored address in another case and padded: still their address, invalid_input, p_owner_email');
select ok(pg_temp.unchanged('l', pg_temp.org('c2')), 'S-01 d15 (finding 42) - nothing written in Org L by that refusal');
insert into got select 'n', pg_temp.recover(pg_temp.org('c3'), null, 'Ned New', 'ned@n.test', pg_temp.u('c3'));
insert into got select 'b', pg_temp.recover(pg_temp.org('c4'), null, 'Ben New', 'ben@b.test', pg_temp.u('c4'));
select is(array[(select r - 'user_id' from got where k = 'n'), (select r - 'user_id' from got where k = 'b')],
  array['{"invite": true, "email": "ned@n.test"}'::jsonb, '{"invite": true, "email": "ben@b.test"}'::jsonb],
  'S-01 d15 (finding 42) - a replaced Owner whose stored address is null, or blank, matches nothing: the replacement invites');

select * from finish();
rollback;
