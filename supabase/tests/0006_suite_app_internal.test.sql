-- Suite-wide, list-free assertions over app_internal (A-139), in the shape of
-- 0005's (conventions §3.3): they name no function and strengthen with every
-- helper a migration adds. 0005's A-107 sweep covers `app` and `authz` and is
-- never edited; app_internal's grant rule is stricter — execute to nobody — so
-- it is held here (M-04 D M1 order, finding 33).
--
--   A-107, A-139 — no function in app_internal grants execute to anyone: not
--                  public, not a session role, not the service role.
--   A-104, A-139 — every function there is owned by waxworks_app, runs as its
--                  caller, and sets search_path to empty (A-103).
--   A-139        — no role holds usage on app_internal; it holds functions only.
begin;
select no_plan();

-- A-107, A-139: a null proacl is the default grant to public; any EXECUTE entry
-- whose grantee is not the owner is a grant this schema must not carry.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_internal'
      and (   p.proacl is null
           or exists (select 1 from aclexplode(p.proacl) a
                       where a.privilege_type = 'EXECUTE'
                         and a.grantee <> p.proowner))),
  0,
  'A-139 - no function in schema app_internal grants execute to public or to any role but its owner (A-107)'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_internal'
      and (   p.proowner <> 'waxworks_app'::regrole
           or p.prosecdef
           or not coalesce(p.proconfig @> array['search_path=""'], false))),
  0,
  'A-139 - every function in schema app_internal is owned by waxworks_app, is security invoker, and sets search_path to empty (A-103, A-104)'
);

select is(
  (select count(*)::int
     from pg_namespace n, aclexplode(n.nspacl) a
    where n.nspname = 'app_internal'
      and a.privilege_type = 'USAGE'
      and a.grantee <> n.nspowner),
  0,
  'A-139 - no role but its owner holds usage on schema app_internal'
);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_internal'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')),
  0,
  'A-139 - schema app_internal contains functions only'
);

select * from finish();
rollback;
