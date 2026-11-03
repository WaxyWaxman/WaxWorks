-- S-01 D M1 - the three S functions' header and grants, and the bound of the
-- sysadmin role. Rows 1, 3, 4, 5, 6, 8, 9, 12, 24 and 25 of the order.
--   A-4    - each is security definer; no client role writes organizations or users.
--   A-103  - the S form of the header: definer, empty search_path, owner, grants.
--   A-113  - principal, then actor, then the active system_administrators row; no
--            initials, terminal or PIN; the second wall (an M / O function refuses
--            a sysadmin session no_tenant).
--   A-104, A-107 - owned by waxworks_app; execute to sysadmin and to nobody else.
--   A-90   - the sysadmin role's bound: four relations read, three functions run.
--   A-110, A-125, A-143 - system_administrators is written by nothing here.
--   A-118, A-137 - no grant changes.   A-139 - app holds entry points only.
begin;
select no_plan();

-- ── Fixture (S-01 D M1). Organizations and people written by hand stand in for
--    nothing this order builds: they are the states the three functions act on.
--    system_administrators is written as tests/auth/fixtures.ts writes it (A-110:
--    by hand, never by a function). ───────────────────────────────────────────
--
-- System Administrators: f1 Sam Sysadmin (active), f2 Ivy Inactive (inactive).
-- Org A: a1 Owner (active, enrolled), a2 Manager.
-- Org B: b1 Owner (deactivated) — no active Owner, so owner_recover may act.
insert into public.system_administrators (auth_user_id, name, active, deactivated_at) values
  ('00000000-0000-0000-0009-0000000000f1', 'Sam Sysadmin', true,  null),
  ('00000000-0000-0000-0009-0000000000f2', 'Ivy Inactive', false, now());

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B');

insert into public.users (id, org_id, role, initials, display_name, email, passkey_enrolled_at, active) values
  ('00000000-0000-0000-0002-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner',   'OA', 'Olive Owner', 'oa@a.test', now(), true),
  ('00000000-0000-0000-0002-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'manager', 'MA', 'Max Manager', 'ma@a.test', now(), true),
  ('00000000-0000-0000-0002-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner',   'OB', 'Bea Gone',    'ob@b.test', now(), false);
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

-- Who is calling: the Postgres role PostgREST would select and §5.4's claims.
-- Read by pg_temp.run as postgres, before it changes role.
create temp table ctx (role text, claims jsonb);
insert into ctx values (null, null);
create function pg_temp.as_(p_role text, p_principal text, p_sub uuid, p_org uuid default null, p_user uuid default null)
returns void language sql as $$
  update ctx set role = p_role,
                 claims = jsonb_strip_nulls(jsonb_build_object('role', coalesce(p_role, 'postgres'), 'sub', p_sub,
                                                               'principal', p_principal, 'org_id', p_org, 'user_id', p_user))
$$;
-- A System Administrator's session as the hook mints it (A-110): role sysadmin.
create function pg_temp.as_sysadmin(p_sub uuid) returns void language sql as $$
  select pg_temp.as_('sysadmin', 'sysadmin', p_sub)
$$;

-- Runs one statement under ctx's role and claims and returns what it returned,
-- or what it raised as conventions §5's body. The role is put back before it
-- returns, so every assertion runs as postgres (sysadmin holds no grant on
-- pgTAP's schema, A-90).
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

-- The three, by name, with arguments that would succeed for the caller in ctx.
create function pg_temp.call(p_fn text, p_actor uuid) returns jsonb language plpgsql as $$
begin
  case p_fn
    when 'organization_create' then
      return pg_temp.run(format('select app.organization_create(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                                   p_name => %L, p_owner_name => %L, p_owner_email => %L)',
                                p_actor, gen_random_uuid(), 'Header Records', 'Hal Header', 'hal@header.test'));
    when 'owner_recover' then
      return pg_temp.run(format('select app.owner_recover(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                                   p_org_id => %L::uuid, p_user_id => null, p_owner_name => %L, p_owner_email => %L)',
                                p_actor, gen_random_uuid(), pg_temp.org('b'), 'Nina New', 'nina@b.test'));
    when 'owner_reset_request' then
      return pg_temp.run(format('select app.owner_reset_request(p_actor_user_id => %L::uuid, p_request_id => %L::uuid,
                                   p_org_id => %L::uuid, p_user_id => %L::uuid)',
                                p_actor, gen_random_uuid(), pg_temp.org('a'), pg_temp.u('a1')));
  end case;
end
$$;
create function pg_temp.three() returns text[] language sql immutable as $$
  select array['organization_create', 'owner_recover', 'owner_reset_request']
$$;
-- What a header refusal leaves: every count the three could change.
create function pg_temp.footprint() returns text language sql stable as $$
  select concat_ws('/', (select count(*) from public.organizations),
                        (select count(*) from public.users),
                        (select sum(jsonb_array_length(log)) from public.organizations),
                        (select sum(jsonb_array_length(log)) from public.users),
                        (select count(*) from public.users where enrolment_open_until is not null))
$$;
create temp table before_ (fp text);
insert into before_ select pg_temp.footprint();

-- ── Rows 1, 3, 5, 6: each is a definer function with A-103's S header ──────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.three()) and p.prosecdef),
  3, 'A-4 - organization_create, owner_recover and owner_reset_request each exist once and are security definer');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.three()) and p.proconfig @> array['search_path=""']),
  3, 'A-103 - each of the three S functions sets search_path to empty');
select is((select array_agg(distinct p.proowner::regrole::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.three())),
  array['waxworks_app'], 'A-104 - each of the three S functions is owned by waxworks_app (the migration opens with set role)');
select is((select array_agg(p.prorettype::regtype::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.three()) and not p.proretset),
  array['jsonb', 'jsonb', 'jsonb'], 'A-103 - each of the three returns one jsonb value, its contract''s output object (conventions §3.3)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.three())
              and has_function_privilege('sysadmin', p.oid, 'execute')
              and not has_function_privilege('authenticated', p.oid, 'execute')
              and not has_function_privilege('anon', p.oid, 'execute')
              and not has_function_privilege('service_role', p.oid, 'execute')
              and p.proacl is not null
              and not exists (select 1 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE' and a.grantee = 0)),
  3, 'A-107 - each S function grants execute to sysadmin, and not to authenticated, anon, service_role or public (A-90, A-103)');
select ok(not exists (select 1 from pg_roles r, unnest(array['organizations', 'users']) t, unnest(array['insert', 'update', 'delete']) priv
                       where r.rolname in ('authenticated', 'sysadmin', 'anon', 'service_role')
                         and has_table_privilege(r.rolname, 'public.' || t, priv)),
  'A-4 - authenticated, sysadmin, anon and service_role hold no insert, update or delete on organizations or users');

-- The smoke call (A-103, A-107): each runs under a sysadmin session, its body
-- reached with every name qualified under the empty search_path.
select pg_temp.as_sysadmin(pg_temp.sys('f1'));
select ok(pg_temp.call('organization_create', pg_temp.sys('f1')) ?& array['org_id', 'owner_user_id'],
  'A-103 - smoke: organization_create under a sysadmin session returns {org_id, owner_user_id}');
select ok(pg_temp.call('owner_recover', pg_temp.sys('f1')) ?& array['user_id', 'invite', 'email'],
  'A-103 - smoke: owner_recover under a sysadmin session returns {user_id, invite, email}');
select ok(pg_temp.call('owner_reset_request', pg_temp.sys('f1')) ?& array['user_id', 'email'],
  'A-103 - smoke: owner_reset_request under a sysadmin session returns {user_id, email}');
-- Those three wrote; the refusals below are measured from here.
update before_ set fp = pg_temp.footprint();

-- ── Row 4: A-113 — principal, then actor, then the active row ─────────────
-- The grant is the first wall: a session's own role cannot call them at all.
select pg_temp.as_('authenticated', 'store', gen_random_uuid(), pg_temp.org('a'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f1')) ->> 'code') || ' ' || (pg_temp.call(f, pg_temp.sys('f1')) ->> 'message' ~ '^permission denied for function'))
             from unnest(pg_temp.three()) f),
  array['42501 true'], 'A-90 - under the authenticated role (a store, personal or enrolment session) none of the three can be executed: the grant');
-- Past the grant, the function asserts the principal itself: claims of every
-- other principal, carried by the sysadmin role, are refused role_refused / sysadmin.
select pg_temp.as_('sysadmin', 'store', pg_temp.sys('f1'), pg_temp.org('a'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f1')))::text) from unnest(pg_temp.three()) f),
  array['{"code": "42501", "details": "sysadmin", "message": "role_refused"}'],
  'A-113 - under store-session claims each S function is refused role_refused, sysadmin');
select pg_temp.as_('sysadmin', 'person', pg_temp.sys('f1'), pg_temp.org('a'), pg_temp.u('a1'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f1')))::text) from unnest(pg_temp.three()) f),
  array['{"code": "42501", "details": "sysadmin", "message": "role_refused"}'],
  'A-113 - under personal-session claims each S function is refused role_refused, sysadmin (A-87: a System Administrator opens no personal session)');
select pg_temp.as_('sysadmin', 'enrolment', pg_temp.sys('f1'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f1')))::text) from unnest(pg_temp.three()) f),
  array['{"code": "42501", "details": "sysadmin", "message": "role_refused"}'],
  'A-113 - under enrolment-session claims (A-117) each S function is refused role_refused, sysadmin');
-- The actor is the JWT's subject.
select pg_temp.as_sysadmin(pg_temp.sys('f1'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f2')))::text) from unnest(pg_temp.three()) f),
  array['{"code": "28000", "details": null, "message": "actor_mismatch"}'],
  'A-113 - under sysadmin claims with p_actor_user_id other than auth.uid() each is refused actor_mismatch (28000)');
-- An inactive row is refused exactly as no row is (A-110).
select pg_temp.as_sysadmin(pg_temp.sys('f2'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f2')))::text) from unnest(pg_temp.three()) f),
  array['{"code": "42501", "details": "sysadmin", "message": "role_refused"}'],
  'A-113 - sysadmin claims whose system_administrators row is inactive: role_refused, sysadmin');
select pg_temp.as_sysadmin(pg_temp.sys('f9'));
select is((select array_agg(distinct (pg_temp.call(f, pg_temp.sys('f9')))::text) from unnest(pg_temp.three()) f),
  array['{"code": "42501", "details": "sysadmin", "message": "role_refused"}'],
  'A-113 - sysadmin claims with no system_administrators row at all: role_refused, sysadmin');
select is(pg_temp.footprint(), (select fp from before_),
  'A-113 - none of the header refusals above wrote anything: organizations, users, both logs and every window unchanged');

-- The signature: no uniform-header argument.
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.three())
              and p.proargnames[1:2] = array['p_actor_user_id', 'p_request_id']
              and not (p.proargnames && array['p_actor_initials', 'p_terminal_id', 'p_manager_pin', 'p_manager_user_id'])),
  pg_temp.three(),
  'A-113 - each S function takes (p_actor_user_id, p_request_id, …) and no p_actor_initials, p_terminal_id or p_manager_pin');

-- The second wall (A-90): an M / O function refuses a sysadmin session.
select pg_temp.as_sysadmin(pg_temp.sys('f1'));
select is(pg_temp.run(format('select app.user_add(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_display_name => %L, p_initials => null,
                                p_role => %L, p_email => null, p_store_ids => %L::uuid[], p_pin => null)',
                             pg_temp.sys('f1'), gen_random_uuid(), 'Sly Add', 'employee', '{}')) ->> 'code',
  '42501', 'A-90 - a sysadmin session cannot execute user_add: the role holds no grant on it');
-- Past the grant (as postgres, under the same claims), the body's tenant assertion.
update ctx set role = null;
select is(pg_temp.run(format('select app.user_add(p_actor_user_id => %L::uuid, p_actor_initials => null, p_request_id => %L::uuid,
                                p_terminal_id => null, p_manager_pin => null, p_display_name => %L, p_initials => null,
                                p_role => %L, p_email => null, p_store_ids => %L::uuid[], p_pin => null)',
                             pg_temp.sys('f1'), gen_random_uuid(), 'Sly Add', 'employee', '{}')),
  '{"code": "28000", "details": null, "message": "no_tenant"}'::jsonb,
  'A-90 - and under sysadmin claims user_add''s own body refuses no_tenant (28000): the second wall');

-- ── Row 8: A-90 — the sysadmin role's bound ───────────────────────────────
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
              and has_table_privilege('sysadmin', c.oid, 'select')),
  array['organizations', 'store_assignments', 'stores_identity', 'users'],
  'A-90 - sysadmin reads exactly organizations, users, store_assignments and stores_identity');
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace,
                   unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) priv
            where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
              and has_table_privilege('sysadmin', c.oid, priv)),
  null, 'A-90 - and holds no other privilege on any relation in public');
select ok(not has_table_privilege('sysadmin', 'public.' || t, 'select'), 'A-90 - sysadmin holds no privilege on ' || t)
  from unnest(array['stores', 'user_pins', 'system_administrators', 'terminals', 'pin_refusals', 'pin_line_closures', 'review_flags']) t;
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and has_function_privilege('sysadmin', p.oid, 'execute')),
  pg_temp.three(), 'A-90 - among app''s functions sysadmin executes exactly the three S functions');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_internal' and has_function_privilege('sysadmin', p.oid, 'execute')),
  0, 'A-90, A-139 - and none of app_internal''s');

-- ── Row 9: A-110, A-125 — system_administrators is written by nothing here ──
select is((select array_agg(a.grantee::regrole::text || ':' || a.privilege_type order by 1)
             from pg_class c, aclexplode(c.relacl) a
            where c.oid = 'public.system_administrators'::regclass and a.grantee <> c.relowner),
  array['waxworks_app:SELECT'], 'A-125 - system_administrators'' grants are unchanged: waxworks_app select, and nothing else');
select is((select array_agg(n.nspname || '.' || p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('app', 'app_internal', 'authz')
              and regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
                  ~* '(insert\s+into|update|delete\s+from|truncate)\s+(table\s+)?public\.system_administrators'),
  null, 'A-110 - no function in app, app_internal or authz inserts, updates or deletes system_administrators');

-- ── Row 12: A-118, A-137 — no grant changes ────────────────────────────────
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('waxworks_app', c.oid, 'delete')),
  array['store_assignments', 'user_pins'], 'A-137 - waxworks_app''s delete is still on exactly store_assignments and user_pins');

-- ── Row 24: A-139 — app holds entry points only ────────────────────────────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_internal'
              and (has_function_privilege('sysadmin', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'A-139 - sysadmin, authenticated, anon and service_role hold no execute on any app_internal function');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname not in (
              'actor_resolve', 'manager_authorize_pin', 'terminal_register', 'session_select_store', 'auth_user_link',
              'user_add', 'user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign', 'user_unassign',
              'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend',
              'organization_create', 'owner_recover', 'owner_reset_request',
              -- §6 entry points other orders add (O-01 D): named so this list does not refuse them.
              'store_create', 'store_account_reset')),
  null, 'A-139 - app gains the three S entry points and no helper: every function there is one of §6''s');

-- ── Row 25: A-143 — no schema record of a System Administrator's enrolment ──
select is((select array_agg(column_name::text order by column_name::text) from information_schema.columns
            where table_schema = 'public' and table_name = 'system_administrators'),
  array['active', 'added_at', 'added_by', 'auth_user_id', 'deactivated_at', 'enrolment_open_until', 'name'],
  'A-143 - system_administrators'' columns are A-110''s and enrolment_open_until: no passkey_enrolled_at');
select pg_temp.as_('service_role', null, null);
select is(pg_temp.run(format('select app.auth_user_link(p_kind => %L, p_row_id => %L::uuid, p_auth_user_id => %L::uuid, p_request_id => %L::uuid)',
                             'sysadmin', pg_temp.sys('f1'), pg_temp.sys('f1'), gen_random_uuid())),
  '{"code": "22023", "details": "p_kind", "message": "invalid_input"}'::jsonb,
  'A-143 - auth_user_link gains no kind for a System Administrator: p_kind sysadmin is invalid_input');

select * from finish();
rollback;
