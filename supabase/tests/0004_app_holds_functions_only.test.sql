-- A-105 — functions live in `app`, tables in `public`; `app` is exposed to PostgREST
-- for rpc and holds no table or view. Because `app` is exposed, a relation placed
-- there would be reachable by PostgREST with only its grants for protection, and
-- §5's two policy shapes are written for `public`. This is the assertion that holds it.
begin;
select plan(3);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')),
  0,
  'A-105 - schema app contains functions only: no table, view, matview, sequence or foreign table'
);

-- The other half of A-105 is that the schema exists to be exposed at all.
select has_schema('app', 'A-105 - schema app exists to hold the write surface');

-- Tables live in public, under §5's two policy shapes. Nothing at M0 creates one;
-- this fixes the direction so M1's first table migration is read against it.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relkind = 'r'),
  0,
  'A-105 - no ordinary table has been created in app'
);

select * from finish();
rollback;
