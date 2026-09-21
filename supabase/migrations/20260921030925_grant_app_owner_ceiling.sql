-- A-104 (ratified 2026-09-21) — the app owner's ceiling.
--
-- A-101: a merged migration is never edited. 20260921012717_create_app_schema_and_owner.sql
-- is merged, so this file corrects it rather than changing it. Three things:
--
--   1. `waxworks_app` gains `bypassrls`.
--   2. `anon` loses `usage` on schema `app`.
--   3. This comment records what the first migration's closing comment described,
--      because that text is now permanent and describes an alternative A-104 rejected.
--
-- On (3): the first migration closes by saying the header in docs/build/conventions.md
-- §3.3 "ends with `alter function ... owner to waxworks_app`". It did not, and under
-- A-104 it never will. A-104 chose **ownership by construction** instead — every
-- function migration opens with `set role waxworks_app;`, so `create function` yields
-- the right owner with no per-function line anyone can forget — and explicitly rejected
-- the per-function `alter ... owner to` as "works, forgettable". The suite-wide pgTAP
-- assertion in supabase/tests/0003_app_owner_ceiling.test.sql is required either way,
-- and the opener removes the thing it would catch. Read that comment as describing the
-- rejected alternative, not the convention.

-- (1) RLS bypass, granted explicitly.
--
-- A-40 and A-90 both rest on a definer function seeing every row of its tenant and
-- re-asserting the tenant itself. A `nosuperuser` role that is neither table owner nor
-- `bypassrls` is subject to every policy, and that is exactly what the first migration
-- created: at M1 the first definer function would have failed its first DML, and
-- A-86's cross-Store Invoice read, `session_select_store`'s assignment check and every
-- S function would have been impossible.
--
-- Consequence accepted (A-104): the ceiling is all of one Organization's rows for any
-- Organization — which is what it was under `postgres`. The gain over `postgres` is the
-- platform surface, not the tenant boundary; that remains A-40's in-function assertion.
--
-- Precondition, named because A-101 makes this line permanent: `alter role …
-- bypassrls` requires the migration runner to hold the attribute it is granting.
-- Supabase's `postgres` is `rolsuper = f` with `rolbypassrls = t, rolcreaterole
-- = t`, and PostgreSQL 16+ lets such a role grant an attribute it holds. On 15
-- or earlier the same statement needs a superuser and raises 42501. `[db]
-- major_version = 17` in config.toml is therefore load-bearing for this file.
alter role waxworks_app bypassrls;

-- (2) `anon` holds no usage on `app`.
--
-- A-103's "an absent grant denies" applies to the schema as it does to the function.
-- Execute is granted per function, in the migration that creates it, and never in bulk
-- — but without schema usage, a forgotten `revoke` is still uncallable by `anon`.
-- `authenticated` keeps its usage, granted by the first migration. The `sysadmin` role
-- does not exist yet; A-90's S functions need it at M1, and the migration that creates
-- the role grants it usage there.
revoke usage on schema app from anon;

-- What this migration deliberately does NOT do: grant `waxworks_app` any table
-- privilege. A-104 puts `select, insert, update` (and `delete` only where A-54 and A-70
-- permit one) in each table's own migration, and M0 creates no table (A-105 — tables
-- live in `public` and none exists yet).

comment on schema app is 'Wax Works - the write surface: SECURITY DEFINER functions only (A-4, A-105), owned by waxworks_app, which holds bypassrls and no platform privilege (A-103, A-104).';
