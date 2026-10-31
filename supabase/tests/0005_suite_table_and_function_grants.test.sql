-- Suite-wide, list-free assertions (conventions §3.3): they carry no list of
-- tables or functions and are never edited; each strengthens with every table
-- or function a migration adds.
--
--   A-118 — no product table grants anything to `anon` or `service_role`;
--           `authenticated` holds `select` only; every policy is `for select`.
--   A-4   — every write is a SECURITY DEFINER function: no client grant writes.
--   A-107 — no function in schema `app` or `authz` (A-124) grants `execute` to `public` or `anon`.
--   A-86  — row-level security is on for every table in `public`.
begin;
select no_plan();

-- A-118
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'service_role')),
  0,
  'A-118 - no table or view in public grants any privilege to anon or service_role'
);

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'),
  0,
  'A-118 - authenticated holds nothing but select on any table in public'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  0,
  'A-118 - every row policy on a table in public is for select'
);

-- A-4: the same fact read the way the decision states it.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (   has_table_privilege('authenticated', c.oid, 'insert')
           or has_table_privilege('authenticated', c.oid, 'update')
           or has_table_privilege('authenticated', c.oid, 'delete'))),
  0,
  'A-4 - authenticated holds no insert, update or delete on any table: every write is a definer function'
);

-- A-86 / §5: row-level security on every table.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  0,
  'A-86 - row-level security is enabled on every table in public'
);

-- A-107: a forgotten revoke shows up as a null proacl (the default grants public)
-- or as an explicit public (grantee 0) or anon entry.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'authz')
      and (   p.proacl is null
           or exists (select 1 from aclexplode(p.proacl) a
                       where a.privilege_type = 'EXECUTE'
                         and (a.grantee = 0 or a.grantee = 'anon'::regrole)))),
  0,
  'A-107 - no function in schema app or authz grants execute to public or to anon (A-124)'
);

-- A-124: authz holds functions only, as A-105 has app hold them.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'authz'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')),
  0,
  'A-124 - schema authz contains functions only'
);

select * from finish();
rollback;
