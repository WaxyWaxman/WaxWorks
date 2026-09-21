-- A-103 — every definer function is owned by a dedicated non-superuser role that
-- owns the `app` schema. M0 creates the schema and the owner so M1's first function
-- has an owner that is not `postgres`.
begin;
select plan(5);

select has_schema('app', 'A-103 — schema app exists');
select is(
  (select nspowner::regrole::text from pg_namespace where nspname = 'app'),
  'waxworks_app',
  'A-103 — schema app is owned by waxworks_app'
);
select isnt(
  (select nspowner::regrole::text from pg_namespace where nspname = 'app'),
  'postgres',
  'A-103 — the owner is not postgres'
);
select ok(
  not (select rolsuper from pg_roles where rolname = 'waxworks_app'),
  'A-103 — waxworks_app is not a superuser'
);
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'waxworks_app'),
  'A-103 — waxworks_app cannot log in: it owns, it is not a session'
);

select * from finish();
rollback;
