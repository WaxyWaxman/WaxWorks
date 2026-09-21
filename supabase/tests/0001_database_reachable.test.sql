-- A-10 — Supabase runs locally in Docker; migrations are committed; `supabase db reset`
-- gives a reproducible database. This suite is the proof the harness stands: it
-- is run by `supabase test db` against the database `db reset` produced.
begin;
select plan(3);

select ok(true, 'A-10 — the database is reachable and pgTAP runs');
select is((select 1), 1, 'A-10 — select 1 returns 1');
select ok(
  (select count(*) from supabase_migrations.schema_migrations) >= 1,
  'A-10 — at least one committed migration has been applied by db reset'
);

select * from finish();
rollback;
