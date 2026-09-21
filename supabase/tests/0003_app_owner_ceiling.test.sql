-- A-104 — the app owner's ceiling. A-103 named a dedicated non-superuser owner and
-- called its privileges "the ceiling" without saying what the ceiling holds; the M0
-- migration created a role that was neither table owner nor `bypassrls`, so at M1 the
-- first definer function would have been subject to every RLS policy and failed its
-- first DML. A-101 forbids editing the merged migration, so a correcting one follows it.
begin;
select plan(8);

-- RLS bypass is granted explicitly, because A-40 and A-90 both rest on a definer
-- function seeing every row of its tenant and re-asserting the tenant itself.
select ok(
  (select rolbypassrls from pg_roles where rolname = 'waxworks_app'),
  'A-104 - waxworks_app holds bypassrls: a definer function sees every row of its tenant'
);

-- The ceiling is the product tables and nothing on the platform.
select ok(
  not (select rolsuper from pg_roles where rolname = 'waxworks_app'),
  'A-104 - waxworks_app is still not a superuser'
);
select ok(
  not (select rolcreaterole from pg_roles where rolname = 'waxworks_app'),
  'A-104 - waxworks_app cannot create a role'
);
select ok(
  not (select rolcreatedb from pg_roles where rolname = 'waxworks_app'),
  'A-104 - waxworks_app cannot create a database'
);
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'waxworks_app'),
  'A-104 - waxworks_app cannot log in: it owns, it is not a session'
);

-- An absent grant denies (A-103), and that applies to the schema as to the function:
-- without usage, a forgotten revoke is still uncallable by anon.
select ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'A-104 - anon holds no usage on schema app'
);
select ok(
  has_schema_privilege('authenticated', 'app', 'usage'),
  'A-104 - authenticated does hold usage on schema app'
);

-- Ownership by construction: every function migration opens `set role waxworks_app`,
-- so `create function` yields the right owner with no per-function line to forget.
-- Vacuously true at M0 - no function exists yet - and it is the suite-wide assertion
-- A-104 requires from the first function onward.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proowner::regrole::text <> 'waxworks_app'),
  0,
  'A-104 - every function in schema app is owned by waxworks_app'
);

select * from finish();
rollback;
