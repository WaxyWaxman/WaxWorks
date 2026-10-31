-- E-01 D M1 — the Tenancy group's identity tables (§5, A-86, A-87, A-89, A-117),
-- each with its grants and §5's policy shape, and the `sysadmin` role's reads
-- (A-90). Out of this file: store_counters, store_settings and A-53's settings
-- tables (O-01 D), drawer_opens (not placed — the order's Scope), and the two
-- system-minted Store identifiers and position (store_create's, O-01 D).
--
-- Every table: Supabase's default grants revoked (A-118); `select` granted to
-- `authenticated` only where §5 gives a read; every policy `for select`;
-- waxworks_app holds select, insert, update (A-104) and delete nowhere here
-- (A-54, A-70: nothing in this order deletes).

-- ── organizations ───────────────────────────────────────────────────────────
-- The Organization is the tenant (A-86): its own id is its org_id.
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  log        jsonb not null default '[]'::jsonb,   -- A-89: organizations.log
  created_at timestamptz not null default now()
);
revoke all on public.organizations from anon, authenticated, service_role;
grant select on public.organizations to authenticated;
grant select, insert, update on public.organizations to waxworks_app;
alter table public.organizations enable row level security;
create policy org_isolation on public.organizations for select
  using (id = authz.org_id() and authz.org_reachable());

-- ── stores (store-dimensioned: the row IS the Store) ────────────────────────
create table public.stores (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id),
  trading_name        text not null,
  store_account_email text,
  auth_user_id        uuid unique,                    -- the store account (A-87, A-91)
  active              boolean not null default true,
  log                 jsonb not null default '[]'::jsonb,   -- A-89: stores.log
  created_at          timestamptz not null default now(),
  unique (org_id, id)
);
revoke all on public.stores from anon, authenticated, service_role;
grant select on public.stores to authenticated;
grant select, insert, update on public.stores to waxworks_app;
alter table public.stores enable row level security;
create policy store_isolation on public.stores for select
  using (org_id = authz.org_id() and id = authz.store_id() and authz.store_reachable());

-- ── users (Organization-level; no store_id — A-89) ──────────────────────────
create table public.users (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id),
  role                text not null check (role in ('employee', 'manager', 'owner')),
  initials            text,
  display_name        text not null,
  email               text,
  auth_user_id        uuid unique,
  passkey_enrolled_at timestamptz,                    -- A-117
  selected_store_id   uuid,                           -- A-87: a personal session's pick
  active              boolean not null default true,
  log                 jsonb not null default '[]'::jsonb,   -- A-55, A-89: users.log
  created_at          timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, selected_store_id) references public.stores (org_id, id)
);
revoke all on public.users from anon, authenticated, service_role;
grant select on public.users to authenticated;
grant select, insert, update on public.users to waxworks_app;
alter table public.users enable row level security;
create policy org_isolation on public.users for select
  using (org_id = authz.org_id() and authz.org_reachable());

-- ── store_assignments (Organization-level — A-86; key all three — A-89) ─────
create table public.store_assignments (
  org_id   uuid not null,
  user_id  uuid not null,
  store_id uuid not null,
  primary key (org_id, user_id, store_id),
  foreign key (org_id, user_id)  references public.users (org_id, id),
  foreign key (org_id, store_id) references public.stores (org_id, id)
);
revoke all on public.store_assignments from anon, authenticated, service_role;
grant select on public.store_assignments to authenticated;
grant select, insert, update on public.store_assignments to waxworks_app;
alter table public.store_assignments enable row level security;
create policy org_isolation on public.store_assignments for select
  using (org_id = authz.org_id() and authz.org_reachable());

-- ── user_pins (A-89: no client grant at all; nothing reads it but the PIN resolution)
create table public.user_pins (
  org_id   uuid not null,
  user_id  uuid primary key,
  pin_hash text not null,          -- HMAC-SHA-256 under the Vault pepper, hex (A-89, A-115)
  foreign key (org_id, user_id) references public.users (org_id, id)
);
revoke all on public.user_pins from anon, authenticated, service_role;
grant select, insert, update on public.user_pins to waxworks_app;
alter table public.user_pins enable row level security;
-- No policy: §5's named exception — user_pins has no client grant at all.

-- ── terminals (store-dimensioned; A-87, A-94) ───────────────────────────────
create table public.terminals (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  store_id              uuid not null,
  name                  text not null,
  registered_at         timestamptz not null default now(),
  registered_by_user_id uuid,          -- A-113: attributable to whoever stood at it
  request_id            uuid,          -- A-94
  principal             text check (principal in ('store', 'person', 'sysadmin', 'service')),   -- A-94, A-128
  unique (org_id, store_id, id),
  foreign key (org_id, store_id) references public.stores (org_id, id),
  foreign key (org_id, registered_by_user_id) references public.users (org_id, id)
);
revoke all on public.terminals from anon, authenticated, service_role;
grant select on public.terminals to authenticated;
grant select, insert, update on public.terminals to waxworks_app;
alter table public.terminals enable row level security;
create policy store_isolation on public.terminals for select
  using (org_id = authz.org_id() and store_id = authz.store_id() and authz.store_reachable());

-- ── The sysadmin role's reads (A-90) ────────────────────────────────────────
-- Exactly organizations, users (log included), store_assignments, and stores'
-- identity columns through a view — no grant on stores itself. Denied by
-- absence everywhere else. Each read is its own select policy, because
-- authz.org_id() is null for this principal and §5's shapes admit nothing.
grant select on public.organizations, public.users, public.store_assignments to sysadmin;
create policy sysadmin_read on public.organizations for select to sysadmin
  using (authz.principal() = 'sysadmin');
create policy sysadmin_read on public.users for select to sysadmin
  using (authz.principal() = 'sysadmin');
create policy sysadmin_read on public.store_assignments for select to sysadmin
  using (authz.principal() = 'sysadmin');

-- A-90's identity columns: trading name, Store ID, position, store account
-- email, active. The Store ID and position are store_create's (O-01 D) and join
-- this view when that order adds them. The view runs as its owner, so it
-- re-asserts the principal itself.
create view public.stores_identity as
  select s.id, s.org_id, s.trading_name, s.store_account_email, s.active
    from public.stores s
   where authz.principal() = 'sysadmin';
revoke all on public.stores_identity from anon, authenticated, service_role;
grant select on public.stores_identity to sysadmin;
