-- E-01 D M1 - the tenancy foundation's tables: their shape, their grants and
-- their isolation. Rows 2, 4, 6, 15, 21, 30, 31 and 38 of the order.
--   A-86  - the Organization is the tenant; the Store a dimension (E-01-T10).
--   A-118 - revoked defaults; select only where section 5 gives a read; user_pins and
--           system_administrators granted to no principal (A-125: the hook reads it as
--           its owner's definer, under A-104's ceiling).
--   A-104 - waxworks_app's DML ceiling.   A-110 / A-90 - the sysadmin role.
--   A-28, A-68 - review_flags, nothing deletes one.   A-123 - the PIN tables.
--
-- Written test-first and NOT YET RUN: no Docker daemon was reachable when
-- this file was written (see the order's Evidence). Its first run is expected red.
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

-- ── The tables (§5 Tenancy, A-110, §5.2, A-123, A-117) ─────────────────────
select has_table('public', t, 'A-86 - table public.' || t || ' exists')
  from unnest(array['organizations', 'stores', 'users', 'store_assignments', 'user_pins', 'terminals',
                    'system_administrators', 'review_flags', 'pin_refusals', 'pin_line_closures']) t;

select has_column('public', t, 'org_id', 'A-86 - ' || t || ' carries org_id')
  from unnest(array['stores', 'users', 'store_assignments', 'user_pins', 'terminals',
                    'review_flags', 'pin_refusals', 'pin_line_closures']) t;
select has_column('public', t, 'store_id', 'A-86 - store-dimensioned ' || t || ' carries store_id')
  from unnest(array['terminals', 'review_flags', 'pin_refusals', 'pin_line_closures']) t;
select has_column('public', 'store_assignments', 'store_id', 'A-89 - store_assignments (org_id, user_id, store_id)');
select hasnt_column('public', 'users', 'store_id', 'A-89 - users carries no store_id: store_assignments is where a User works');
select hasnt_column('public', 'system_administrators', 'org_id', 'A-110 - system_administrators carries no org_id');

select has_column('public', 'users', c, 'A-117 / §5 - users.' || c)
  from unnest(array['role', 'initials', 'display_name', 'email', 'auth_user_id', 'passkey_enrolled_at',
                    'selected_store_id', 'active', 'log']) c;
select has_column('public', t, 'log', 'A-89 - ' || t || '.log')
  from unnest(array['users', 'stores', 'organizations']) t;
select has_column('public', 'system_administrators', c, 'A-110 - system_administrators.' || c)
  from unnest(array['auth_user_id', 'name', 'active', 'added_at', 'added_by', 'deactivated_at']) c;
select has_column('public', 'review_flags', c, '§5.2 - review_flags.' || c)
  from unnest(array['id', 'kind', 'subject_type', 'subject_id', 'actor_user_id', 'context', 'created_at',
                    'request_id', 'terminal_id', 'principal', 'reviewed_at', 'reviewed_by', 'review_note']) c;
select col_is_null('public', 'review_flags', 'actor_user_id', 'A-68 - review_flags.actor_user_id is nullable: null means the system raised it');
select has_column('public', 'pin_refusals', c, 'A-123 - pin_refusals.' || c)
  from unnest(array['terminal_id', 'staff_user_id', 'at', 'counted', 'closure_id', 'request_id', 'principal']) c;
select has_column('public', 'pin_line_closures', c, 'A-123 - pin_line_closures.' || c)
  from unnest(array['closed_at', 'reopens_at', 'terminal_id', 'request_id', 'principal']) c;
select hasnt_column('public', 'pin_line_closures', 'pin_hash', 'A-93 - pin_line_closures holds no hash');

-- ── A-104: waxworks_app's ceiling is DML on each table, delete nowhere here ─
select ok(has_table_privilege('waxworks_app', 'public.' || t, 'select, insert, update'),
          'A-104 - waxworks_app holds select, insert, update on ' || t)
  from unnest(array['organizations', 'stores', 'users', 'store_assignments', 'user_pins', 'terminals',
                    'review_flags', 'pin_refusals', 'pin_line_closures']) t;
-- A-28 / §5.2: flags are acknowledged, never deleted — nobody holds delete.
select is(
  (select count(*)::int from pg_roles r
    where r.rolname in ('waxworks_app', 'authenticated', 'anon', 'service_role', 'sysadmin')
      and has_table_privilege(r.rolname, 'public.review_flags', 'delete')),
  0, 'A-28 - nothing deletes a review flag: no product role and not waxworks_app holds delete on review_flags');

-- ── A-110 / A-118: system_administrators — RLS with no policy, read by the hook's role alone
select ok((select relrowsecurity from pg_class where oid = 'public.system_administrators'::regclass),
  'A-110 - system_administrators has row-level security on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'system_administrators'), 0,
  'A-110 - system_administrators has no policy');
-- The hook role's read is row 15's, with the hook (0012); not asserted here.
select is(
  (select count(*)::int from pg_roles r
    where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin', 'supabase_auth_admin')
      and has_table_privilege(r.rolname, 'public.system_administrators', 'select, insert, update, delete')),
  0, 'A-125 - system_administrators gains no grant: no principal, and not Auth''s own role, reads or writes it');
select ok(has_table_privilege('waxworks_app', 'public.system_administrators', 'select'),
  'A-125 - the hook reads system_administrators as its owner''s definer (A-104''s select)');
select ok(not has_table_privilege('waxworks_app', 'public.system_administrators', 'insert, update, delete'),
  'A-110 - nothing in app or authz writes system_administrators');
select is(
  (select count(*)::int from pg_roles r
    where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin')
      and has_table_privilege(r.rolname, 'public.user_pins', 'select')),
  0, 'A-118 - user_pins is granted to nobody (A-89)');

-- ── A-110 / A-90: the sysadmin role ────────────────────────────────────────
select has_role('sysadmin', 'A-110 - the sysadmin role exists');
select ok(not (select rolcanlogin from pg_roles where rolname = 'sysadmin'), 'A-110 - sysadmin cannot log in');
select ok(pg_has_role('authenticator', 'sysadmin', 'member'), 'A-110 - authenticator may select sysadmin from the JWT role claim');
select ok(has_table_privilege('sysadmin', 'public.' || t, 'select'), 'A-90 - sysadmin reads ' || t)
  from unnest(array['organizations', 'users', 'store_assignments']) t;
select ok(has_table_privilege('sysadmin', 'public.stores_identity', 'select'),
  'A-90 - sysadmin reads stores through the stores_identity view');
select ok(not has_table_privilege('sysadmin', 'public.' || t, 'select'), 'A-90 - sysadmin reads no ' || t)
  from unnest(array['stores', 'user_pins', 'terminals', 'review_flags', 'pin_refusals', 'pin_line_closures',
                    'system_administrators']) t;

-- sysadmin holds no grant on pgTAP's schema (A-90: denied by absence), so it
-- only reads; the assertions run back as postgres.
reset role;
create temp table sysadmin_reads (relation text, n int);
grant all on sysadmin_reads to public;
select pg_temp.as_session('sysadmin', null, null, null, '00000000-0000-0000-0009-0000000000f1', 'sysadmin');
insert into sysadmin_reads
  select 'users', count(*) from public.users
  union all select 'organizations', count(*) from public.organizations
  union all select 'store_assignments', count(*) from public.store_assignments
  union all select 'stores_identity', count(*) from public.stores_identity;
reset role;
select is((select n from sysadmin_reads where relation = 'users'), 6, 'A-90 - sysadmin reads the users of every Organization');
select is((select n from sysadmin_reads where relation = 'organizations'), 2, 'A-90 - sysadmin reads every Organization');
select is((select n from sysadmin_reads where relation = 'store_assignments'), 6, 'A-90 - sysadmin reads every Organization''s store_assignments');
select is((select n from sysadmin_reads where relation = 'stores_identity'), 3, 'A-90 - sysadmin reads every Store''s identity columns through stores_identity');
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
    where table_schema = 'public' and table_name = 'stores_identity'),
  array['active', 'id', 'org_id', 'store_account_email', 'trading_name'],
  'A-90 - stores_identity carries identity columns only');

-- ── A-86: isolation (E-01-T10) ─────────────────────────────────────────────
-- Store session of A1.
select pg_temp.as_session('store', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0001-0000000000a1',
                          null, '00000000-0000-0000-0009-0000000000a1');
select is((select count(*)::int from public.users where org_id <> '00000000-0000-0000-0000-00000000000a'), 0,
  'A-86 - a session of Organization A reads no user of B');
select is((select count(*)::int from public.organizations), 1, 'A-86 - a session of Organization A reads its own Organization only');
select is((select count(*)::int from public.users), 5, 'A-86 - an Organization-level table: the store session reads all of its Organization''s users');
select is((select array_agg(name order by name) from public.terminals), array['Till 1', 'Till 2'],
  'A-86 - a store session of Store A1 reads no Store A2 or Store B1 terminal (E-01-T10)');
select is((select count(*)::int from public.store_assignments), 5,
  'A-86 - store_assignments is Organization-level: the store session reads its Organization''s assignments and none of B''s');
select throws_ok($$select 1 from public.user_pins$$, '42501', null, 'A-89 - a store session is denied user_pins outright');
reset role;

select * from finish();
rollback;
