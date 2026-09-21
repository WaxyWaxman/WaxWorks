-- A-103: every definer function is owned by a dedicated non-superuser role that
-- owns the `app` schema — never `postgres`. A definer function runs with its
-- owner's rights and bypasses row-level security (A-40's premise), so the owner's
-- privileges are the ceiling on what a bug can reach. This migration creates the
-- ceiling; M1 creates the first function under it.
--
-- Roles are cluster-wide, so the role is created only if absent. It cannot log
-- in: it owns, it is not a session.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'waxworks_app') then
    create role waxworks_app nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;

-- Supabase's `postgres` is not a superuser. To hand a schema or a function to
-- waxworks_app it must be a member of that role; membership is what lets it SET
-- ROLE and ALTER ... OWNER TO. This grants the migration runner that ability and
-- nothing else — waxworks_app itself still cannot log in.
grant waxworks_app to postgres;

create schema if not exists app authorization waxworks_app;

-- The API roles may see the schema exists. What they may EXECUTE is granted per
-- function, in the migration that creates it, per A-103 — never here in bulk.
grant usage on schema app to authenticated;
grant usage on schema app to anon;

-- Migrations run as `postgres`; a function created later must be re-owned. The
-- header in docs/build/conventions.md §3.3 ends with `alter function ... owner to
-- waxworks_app` for exactly this reason.
comment on schema app is 'Wax Works — the write surface: SECURITY DEFINER functions (A-4), owned by waxworks_app (A-103).';
