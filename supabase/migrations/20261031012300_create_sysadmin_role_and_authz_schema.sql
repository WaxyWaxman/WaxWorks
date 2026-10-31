-- E-01 D M1 — the principals' groundwork, before any product table.
--
-- 1. The `sysadmin` Postgres role and `system_administrators` (A-110, A-90).
--    A-110: "the migration that creates the table also creates the sysadmin
--    Postgres role A-90 names — nologin, granted to authenticator so the JWT
--    role claim can select it — holding only A-90's grants." The table needs no
--    helper (it has no policy), so it is created here, ahead of the helpers.
-- 2. The `authz` schema for the six row-security helpers (A-124): owned by
--    waxworks_app, NOT exposed in config.toml, usage for authenticated and
--    sysadmin only. The helpers themselves are the next migration, under
--    `set role waxworks_app` (A-104).
-- 3. A-127: the `pepper_reader` role, which alone reads Vault, and
--    waxworks_app's `usage` on `extensions` for hmac. The accessor
--    authz.pin_pepper() is its own migration, under `set role pepper_reader`.
-- 4. A-125: Supabase Auth's role may reach the hook in `authz`.

-- ── 1. sysadmin ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sysadmin') then
    create role sysadmin nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;
grant sysadmin to authenticator;
-- A-104: `authenticated` and `sysadmin` hold usage on `app`; sysadmin executes
-- nothing there until S-01's functions grant it.
grant usage on schema app to sysadmin;
grant usage on schema public to sysadmin;

create table public.system_administrators (
  auth_user_id   uuid primary key,
  name           text not null,
  active         boolean not null default true,
  added_at       timestamptz not null default now(),
  added_by       uuid references public.system_administrators (auth_user_id),
  deactivated_at timestamptz
);
comment on table public.system_administrators is
  'A-110 — System Administrators, written by hand and recorded in the runbook; no org_id; RLS on with no policy.';

-- A-118 / A-125: Supabase's default grants revoked; no policy, and no grant to
-- any principal or to Auth's role. The hook (authz.access_token_hook, A-125)
-- "reads it as its owner's definer": its owner waxworks_app bypasses RLS
-- (A-104) but still needs the table privilege, so it holds `select` — A-104's
-- ceiling, select only, since nothing in app or authz writes it (A-110).
revoke all on public.system_administrators from anon, authenticated, service_role;
grant select on public.system_administrators to waxworks_app;
alter table public.system_administrators enable row level security;

-- ── 2. authz (A-124) ────────────────────────────────────────────────────────
create schema authz authorization waxworks_app;
revoke all on schema authz from public;
grant usage on schema authz to authenticated, sysadmin;
comment on schema authz is
  'Wax Works — the six row-security helpers (A-124). Owned by waxworks_app; not exposed to the API; functions only.';

-- ── 3. The pepper (A-127) ───────────────────────────────────────────────────
-- pepper_reader: nologin, and holds only what reading vault.decrypted_secrets
-- needs — usage on vault, select on the view, and execute on the function the
-- view decrypts through (without it: "permission denied for function
-- _crypto_aead_det_decrypt", observed 2026-10-31). postgres holds each with
-- grant option, and is made a member so the accessor's migration can
-- `set role pepper_reader`, as A-104's opener does for waxworks_app.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pepper_reader') then
    create role pepper_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;
grant pepper_reader to postgres;
grant usage on schema vault to pepper_reader;
grant select on vault.decrypted_secrets to pepper_reader;
grant execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea) to pepper_reader;
-- The accessor lives in authz (A-127), so its owner must be able to create there.
grant usage, create on schema authz to pepper_reader;

-- A-89's keyed hash is pgcrypto's extensions.hmac. waxworks_app may execute it
-- (granted to PUBLIC) but held no usage on its schema, so a PIN check failed
-- "permission denied for schema extensions" (observed at the second test run,
-- 2026-10-31).
grant usage on schema extensions to waxworks_app;

-- ── 4. The hook's caller (A-125) ────────────────────────────────────────────
-- Supabase Auth calls authz.access_token_hook as supabase_auth_admin; executing
-- it needs usage on the schema as well as A-125's execute grant.
grant usage on schema authz to supabase_auth_admin;
