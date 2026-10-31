-- E-01 D M1 — review_flags (§5.2, A-28, A-68), built at M1 (§8), and the PIN
-- throttle's two tables (A-123; E-01 d31, d38, d39). All store-dimensioned under
-- §5's standard policy. Nothing deletes from any of them: waxworks_app holds
-- select, insert, update and no delete (A-104; §5.2 "acknowledged, never deleted").

-- ── review_flags ────────────────────────────────────────────────────────────
create table public.review_flags (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  store_id      uuid not null,
  kind          text not null check (kind in (
                  'below_cost_shelf', 'subtotal_discrepancy', 'negative_stock_sale', 'sale_lock_broken',
                  'journal_imbalance',          -- A-68, system-raised
                  'pin_line_closed',            -- A-123, system-raised
                  'ledger_balance_divergence'   -- A-76, system-raised
                )),
  subject_type  text,
  subject_id    uuid,
  actor_user_id uuid,                -- A-68: null means the system raised it
  context       jsonb,
  created_at    timestamptz not null default now(),
  request_id    uuid,                -- A-94
  terminal_id   uuid,
  principal     text check (principal in ('store', 'person', 'sysadmin', 'service')),   -- A-94, A-128
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  review_note   text,
  foreign key (org_id, store_id) references public.stores (org_id, id),
  foreign key (org_id, actor_user_id) references public.users (org_id, id),
  foreign key (org_id, reviewed_by) references public.users (org_id, id),
  foreign key (org_id, store_id, terminal_id) references public.terminals (org_id, store_id, id)
);
revoke all on public.review_flags from anon, authenticated, service_role;
grant select on public.review_flags to authenticated;
grant select, insert, update on public.review_flags to waxworks_app;
alter table public.review_flags enable row level security;
create policy store_isolation on public.review_flags for select
  using (org_id = authz.org_id() and store_id = authz.store_id() and authz.store_reachable());

-- ── pin_line_closures (A-123) ───────────────────────────────────────────────
-- The line is closed iff a row has reopens_at > now(); no mutable line state.
create table public.pin_line_closures (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  store_id    uuid not null,
  closed_at   timestamptz not null,
  reopens_at  timestamptz not null,
  terminal_id uuid not null,         -- the fifth refusal's
  request_id  uuid,
  principal   text not null check (principal in ('store', 'person', 'sysadmin', 'service')),   -- A-94, A-128
  check (reopens_at = closed_at + interval '15 minutes'),   -- E-01 d31
  unique (org_id, store_id, id),
  foreign key (org_id, store_id) references public.stores (org_id, id),
  foreign key (org_id, store_id, terminal_id) references public.terminals (org_id, store_id, id)
);
create index pin_line_closures_open on public.pin_line_closures (store_id, reopens_at);
revoke all on public.pin_line_closures from anon, authenticated, service_role;
grant select on public.pin_line_closures to authenticated;
grant select, insert, update on public.pin_line_closures to waxworks_app;
alter table public.pin_line_closures enable row level security;
create policy store_isolation on public.pin_line_closures for select
  using (org_id = authz.org_id() and store_id = authz.store_id() and authz.store_reachable());

-- ── pin_refusals (A-123) — never the digits, never the hash (A-93) ──────────
create table public.pin_refusals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  store_id      uuid not null,
  terminal_id   uuid not null,
  staff_user_id uuid,                -- A-120: the open staff session, null when none
  at            timestamptz not null default now(),
  counted       boolean not null,    -- E-01 d38: false for an attempt while the line is closed
  closure_id    uuid,                -- null until a closure claims it
  request_id    uuid,                -- A-94
  principal     text not null check (principal in ('store', 'person', 'sysadmin', 'service')),   -- A-94, A-128
  foreign key (org_id, store_id) references public.stores (org_id, id),
  foreign key (org_id, store_id, terminal_id) references public.terminals (org_id, store_id, id),
  foreign key (org_id, staff_user_id) references public.users (org_id, id),
  foreign key (org_id, store_id, closure_id) references public.pin_line_closures (org_id, store_id, id)
);
-- The count: a Store's counted, unclaimed refusals of the last fifteen minutes.
create index pin_refusals_count on public.pin_refusals (store_id, at) where counted and closure_id is null;
revoke all on public.pin_refusals from anon, authenticated, service_role;
grant select on public.pin_refusals to authenticated;
grant select, insert, update on public.pin_refusals to waxworks_app;
alter table public.pin_refusals enable row level security;
create policy store_isolation on public.pin_refusals for select
  using (org_id = authz.org_id() and store_id = authz.store_id() and authz.store_reachable());
