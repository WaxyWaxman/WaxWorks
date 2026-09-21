# Wax Works — build conventions

**Status:** Ratified 2026-09-20 — every rule quoted from [architecture](../architecture.md); the seven conventions it first left `_TBD_` are A-97 to A-103
**Owners:** sr-talbot, WaxyWaxman
**Read by:** the `developer` subagent and `/develop`, before the first line of code; `qa-reviewer` and `architect`, when judging a diff

What a developer needs to know about the stack that no flow document says. Every
rule here is **quoted** from [architecture.md](../architecture.md) with its A-n or
section. Nothing here is a decision; a rule that turns out wrong is fixed in the
architecture first and here second. Where this document and the architecture disagree, the architecture
wins and this is the bug.

The [workflow](workflow.md) says who writes what. This says how.

---

## 1. Commands

Every command is run from the repository root. The **Track** column says who runs
it in the course of an order. A-97's six CI jobs, in its order, are the
Document gate, the Decision-to-test gate, Typecheck, Lint, Unit tests and the
database tests (with Start and Rebuild as that job's setup). Playwright is a
seventh job that lands with the first `/qa automate`, not at M0 (A-97).

| Purpose | Command | Track |
|---|---|---|
| Install | `pnpm install` — pnpm workspaces, lockfile committed, `--frozen-lockfile` in CI (A-102) | both |
| Start local Supabase | `supabase start` (A-10: Supabase runs locally in Docker) | D, U for integration |
| Rebuild the database from migrations and seed | `supabase db reset` (A-10) | D |
| Run the database tests | `supabase test db` — pgTAP under `supabase/tests/` (§7) | D |
| Generate `packages/db-types` | `supabase gen types typescript --local > packages/db-types/index.ts` — D regenerates it in the same pull request as the migration that changed the schema; CI re-runs the generator and fails on a diff (A-98) | D |
| Typecheck | `pnpm typecheck` — `tsc --noEmit` in each workspace member (A-102) | both |
| Lint | `pnpm lint` — ESLint with `typescript-eslint` and `eslint-config-next` (A-102) | both |
| Unit tests, screens | `pnpm test` — vitest in `apps/web/` (A-102; `.claude/skills/qa/SKILL.md` §Levels) | U |
| Decision-to-test gate | `python scripts/check_coverage.py --order docs/build/orders/<order>.md` | both |
| Document gate | `python scripts/check_docs.py` | both |
| End-to-end | `npx playwright test` from `e2e/` (A-85) — QA's, not the developer's (workflow §1) | neither |

No task runner (A-102): the root scripts call each member directly. A tool this
table does not name is not the developer's to add — file it under **Needs a
human**.

---

## 2. Repository layout

The tree is fixed by architecture §7. The developer creates files only where §7
already places them; a file that fits nowhere is a question for `/architecture`.

| Path | Holds | Written by |
|---|---|---|
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | the root workspace: `apps/*`, `packages/*`, `e2e` — not `prototype/` (A-102) | the M0 order |
| `apps/web/app/(till)/` | sell, return — client components (A-2) | U |
| `apps/web/app/(back)/` | receive, history, search, titlecard, close, review, settings — server-rendered (A-2) | U |
| `apps/web/app/print/` | print-only routes with `@page` stylesheets (A-8) | U |
| `apps/web/app/api/cron/` | the `jobs` drain (A-7) | U |
| `apps/web/app/(auth)/` | store account sign-in, personal sign-in and second factor, sysadmin sign-in; Server Actions for the Auth admin writes (A-91) | U |
| `apps/web/app/(org)/` | O-01 Organization screen (Owner-only) | U |
| `apps/web/app/(admin)/` | S-01 administration area (A-90) | U |
| `packages/contracts/` | schemas and typed function wrappers — the interface (§7) | **neither** — a contract pull request both humans review |
| `packages/db-types/` | generated from the database (§7) | D |
| `supabase/migrations/` | numbered SQL (§7) | D |
| `supabase/seed.sql` | one Organization, one Store, one Owner, the configuration tables (§7 lists the contents) | D |
| `supabase/tests/` | pgTAP | D |
| `e2e/` | the end-to-end suite, own `package.json` (A-85) | QA |
| `prototype/` | harvested for UI copy and layout, then archived (§7) | nobody, past M0 |

### 2.1 Environments and secrets (A-100)

| Environment | Database | Data | Keys |
|---|---|---|---|
| **Local** | Supabase in Docker, `supabase db reset` (A-10) | `seed.sql` | the toolchain's fixed development keys — public by design, not secrets |
| **Preview** — one Vercel preview deployment per pull request, **access-protected** | a Supabase branch created for the pull request and destroyed with it | `seed.sql` and nothing else — **never** a restore, dump or anonymised copy of production | its own service-role key and its own PIN pepper (Supabase Vault, A-89) |
| **Production** — one Vercel deployment | one Supabase project, the only place a shop's data exists | the shop's; **never seeded** (A-101) | service-role key in the server-runtime environment only |

Three platform settings the repository cannot assert, verified by a human at M0
and re-verified in M6: Vercel preview protection on (A-100); the production
Supabase project's public sign-up **off** (A-91) and its exposed schemas
including `app` (A-105). `config.toml` fixes the latter two for local and every
branch.

**A fourth platform act is gated on code rather than verified (A-106): no
environment is given a Sentry DSN until the outgoing event is built by an
allowlist** — an explicit `integrations` list replacing the SDK's defaults, and
a `beforeSend` that constructs the event from a named set of fields and drops
everything else. The SDK's default integrations are error paths, so
`tracesSampleRate` does not gate them, and the absence of a DSN is currently the
only control. The allowlist **takes `request_id` and drops `ContractError.details`**,
which are fields of the same object (A-108).

There is no staging environment; the `staging` branch A-96 proposes deploys as
a preview like any other (A-100). The **anon key** ships in the client bundle and nothing
follows from holding it (RLS on every read, A-4 on every write). The
**service-role key** is a Vercel environment variable scoped to the server
runtime, never prefixed `NEXT_PUBLIC_`, never in a repository file, never in
`e2e/` (A-91, A-100). Only A-91's four Auth handlers read it. CI holds one secret, the `ANTHROPIC_API_KEY` read by
`security-review.yml` alone (A-96, not yet ratified); `docs-check` and the six
A-97 jobs are keyless.

---

## 3. Database track (D)

### 3.1 Migrations

- One file per migration under `supabase/migrations/`, named
  `<UTC timestamp>_<verb>_<object>.sql` as `supabase migration new` mints it,
  ordered by filename (A-101).
- **A merged migration is never edited.** A wrong migration is followed by a
  correcting one — the append-only rule the decision tables live by, applied to
  schema (A-101).
- One migration per coherent group of Checklist rows — a table with its policies,
  a function with its grants — so a reviewer reads one file against the rows it
  serves (A-101). **Tables and functions never share a migration:** a function
  migration opens with `set role waxworks_app;` (A-104), and DDL under that role
  would make the table `waxworks_app`'s too. **Tables live in `public`, functions
  in `app`, and nothing but functions is ever created in `app`** (A-105).
- **The seed exercises the write surface:** `supabase/seed.sql` calls definer
  functions (A-4) rather than inserting rows, so it is the first integration test
  of every function it touches. **Two exceptions, each commented with the
  function it stands in for:** the bootstrap Organization and first Owner (there
  is no sysadmin principal inside `db reset`), and the Auth half of anything A-91
  covers (`auth_user_id` stays null). The seed sets the session claims
  `auth.org_id()` / `auth.store_id()` / `auth.principal()` before each block,
  **refuses to run against an Organization that already exists, and never runs
  against production** (A-101). The fixture rule in
  `.claude/skills/qa/SKILL.md` §`/qa automate` says the same for `e2e/`.

### 3.2 Every table

Every table carries `org_id`; a Store-dimensioned table carries `store_id` as
well (A-86). **Row-level security is on for every table**, in one of the two
shapes the architecture gives in §5, quoted:

```sql
-- Organization-level
create policy org_isolation on <table>
  using      (org_id = auth.org_id() and auth.org_reachable())
  with check (org_id = auth.org_id() and auth.org_reachable());

-- Store-dimensioned
create policy store_isolation on <table>
  using      (org_id = auth.org_id() and store_id = auth.store_id() and auth.store_reachable())
  with check (org_id = auth.org_id() and store_id = auth.store_id() and auth.store_reachable());
```

The exceptions are named in §5 and nowhere else: `release_cache` (A-6), `jobs`,
the `sysadmin` role's read on identity tables (A-90), `user_pins` with no client
grant at all, and `invoices`' extra select policy. A table without a policy is an
`architect` blocking finding (workflow §3 gate 3).

### 3.3 Every write is a definer function

A-4: every write is a Postgres `SECURITY DEFINER` function; the client never
writes a table (the one exception is A-91's Auth writes). The shape every
function shares, from §3 and §6:

| Element | Rule | Source |
|---|---|---|
| Actor arguments | `p_actor_user_id` **and** `p_actor_initials`; on a personal session the function asserts the actor **is** `auth.user_id()` | §6 |
| Manager-only (**M**) on a store session | takes `p_manager_pin`, resolves it to the one active Manager or Owner assigned to `auth.store_id()` in the same transaction, refuses otherwise; `p_manager_user_id` is what it resolves to, never an input | §6 |
| Owner-only (**O**) | as **M**, then asks whether that person is an Owner and refuses by name | §6 |
| Sysadmin (**S**) | asserts `auth.principal() = 'sysadmin'`; every other function refuses a null `auth.org_id()` | A-90 |
| Tenancy | re-asserts `auth.org_id()` / `auth.store_id()` and the principal inside the function, not only via RLS | A-40 |
| Both names recorded | the actor's and, where one authorized, the Manager's | A-28a, A-55, A-89 |
| Flags, not gates | an action worth a second look proceeds and writes a `review_flags` row with an attributable actor **in the same transaction** | A-28 |
| Money | integer minor units, columns suffixed `_minor` | A-15 |
| Rates | integer parts per million, suffixed `_ppm`, applied once, rounded half away from zero | A-47 |
| Immutability and sealing | a check in the write path calling `invoice_is_paid()` / `period_is_sealed()`, never a trigger **for these two predicates**. A-41 and A-44 keep local triggers on local facts: SaleLines on Closed Sales, voided Sale numbers, `claim_number` | A-41, A-44, A-80 |
| Voids | appended reversing rows; a record is deleted only where nothing cites it and no money moved | A-54, A-70 |
| `search_path` | `set search_path = ''`, every table, type, function and operator schema-qualified — `pg_temp` is otherwise searched first | A-103 |
| Grants | `revoke execute … from public; grant execute … to authenticated` in the same migration; an **S** function grants to the `sysadmin` role instead | A-103, A-90 |
| Owner | `waxworks_app`: the dedicated non-superuser role that owns the `app` schema — never `postgres`. It holds `bypassrls` and DML on every product table, granted in each table's migration; nothing outside the product schemas | A-103, A-104 |
| Ownership by construction | every function migration opens with `set role waxworks_app;` — no per-function `alter … owner to` line; a suite-wide pgTAP assertion holds that every function in `app` is owned by `waxworks_app`, and another that `app` holds functions only | A-104, A-105 |
| Reachability | the real client calls `supabase.schema("app").rpc(...)`; `config.toml` `[api].schemas` exposes `app` | A-105 |
| Correlation | `p_request_id` on every function; `p_terminal_id` on a store session, verified against `auth.store_id()`; both stamped with `principal` on every row and log entry the function writes | A-94 |
| Assertion order | tenant, then principal and actor, then the terminal, then **M**/**O** PIN resolution, then the body | A-103 |

**The header every function starts from (A-103, A-104):**

```sql
set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

create or replace function app.<name>(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,                -- minted by the wrapper; correlates, never authorises (A-94)
  p_terminal_id    uuid default null,   -- store session only; verified below (A-94)
  p_manager_pin    text default null,   -- M / O only; omitted otherwise
  ...
) returns <type>
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id     uuid := auth.org_id();
  v_store_id   uuid := auth.store_id();     -- store-dimensioned functions only
  v_manager_id uuid;                        -- M / O only; resolved, never an argument
begin
  if v_org_id is null then
    raise exception 'no tenant' using errcode = '28000';                       -- A-40, A-90
  end if;
  if auth.principal() = 'person' and p_actor_user_id is distinct from auth.user_id() then
    raise exception 'actor is not the session holder' using errcode = '28000'; -- §6
  end if;
  if auth.principal() = 'store' and not app.terminal_belongs_to(p_terminal_id, v_store_id) then
    raise exception 'terminal is not this Store''s' using errcode = '28000';     -- A-94
  end if;
  -- M / O: v_manager_id := app.manager_authorize_pin(p_manager_pin);          -- §6, A-89
  -- O:     assert that person is an Owner, and refuse by name                 -- §6
  ...
end;
$$;

revoke execute on function app.<name>(...) from public;   -- A-103, A-90
grant  execute on function app.<name>(...) to authenticated;

reset role;
```

Three suite-wide pgTAP assertions (A-104, A-105, A-107) run in every
`supabase test db`: every function in schema `app` is owned by `waxworks_app`;
schema `app` contains functions only; and **no function in `app` grants
`execute` to `public` or to `anon`**. `anon` holds no `usage` on `app` (A-104).

The third carries no list and is never edited: Postgres grants `execute` to
`public` by default, so a forgotten `revoke` shows up as a `public` grant, and
the assertion strengthens with every function added. **There is no
by-construction alternative** — unlike ownership, which A-104's `set role`
opener fixes, `alter default privileges` was tested and has no effect here, so
the `revoke`/`grant` pair stays a discipline and this assertion is its only
check (A-107).

A pgTAP smoke call per function is part of the suite, because a forgotten
qualification under an empty `search_path` fails at runtime, not at creation
(A-103, A-97). **That smoke call also asserts the function's own grants** —
including, for an **S** function, that `execute` is granted to `sysadmin` and
not to `authenticated`. The knowledge rides with the function rather than in a
central list that would be a second copy of §6 (A-107).

The **pure helpers** (`round_to_ending`, `suggested_retail`, `tax_rate_at`,
`upc_a_check_digit`) take every input as an argument and read no table, so their
tests are plain assertions — §6 calls them "the highest-value tests in the
system". Test them from the flows' worked examples.

### 3.4 pgTAP tests

- One file per function or table group under `supabase/tests/`, run by
  `supabase test db`.
- Every test names the decision it holds, in the form `check_coverage.py`
  reads: `E-05 d23`, `E-05 decision 23`, or a bare `A-47`. Put it in the plan
  description or a comment on the assertion:

  ```sql
  select is(sale_lock_holder(:sale_id), :opener, 'E-05 d23 — an Open Sale is locked to the Employee who opened it');
  ```

- A `Done` row whose decision appears in no test file fails the order gate.

---

## 4. Screens track (U)

- **Server or client** per A-2: till screens are client components; back-office
  screens are server-rendered. A component's placement in §7's route groups says
  which.
- **Reads** go from the client straight to RLS-protected views (§3). **Writes**
  go through the typed wrapper in `packages/contracts` to a database function
  (§3). A screen never calls `supabase-js` `insert`/`update`/`delete`.
- **Until D lands**, U builds against the in-memory fake behind the same
  wrappers (§7). The fake is a `WaxClient` built once at the app's or test's
  composition root and passed in; it lives on a separate entry point of
  `packages/contracts` so importing it shows in a diff. **No wrapper reads
  `process.env` and none branches on a flag** (A-98). A screen may **check
  first** for the user's sake; it never checks **instead** of the function
  (`.claude/skills/develop/SKILL.md` §Rules).
- **Styling** is Tailwind + shadcn/ui; the prototype's design tokens map to
  Tailwind theme variables (A-9). Copy and layout are harvested from
  `prototype/`, not its code (§7).
- **Money** is displayed from integer minor units; no float enters the money
  path in the browser either (A-15, A-47).
- **Tests** are vitest, co-located `*.test.ts(x)` beside the component, named
  for the decision exactly as the pgTAP ones are:

  ```ts
  describe("E-01 d1 — terminals are shared; sessions are per-User", () => { … });
  ```

- **Labels and print** use `window.print()` and a route under `app/print/`
  (A-8). No print agent in v1.

---

## 5. The contracts package

`packages/contracts` "is the interface between the two workstreams. For each
database function it holds an input schema, an output schema, and a typed
wrapper. It is written first, jointly" (§7). Neither developer edits it; a change
is a pull request both humans review (§7, workflow §4).

| Question | Answer |
|---|---|
| Schema library | Zod, one library for both tracks (A-98) |
| Wrapper signature | `<fn>(client: WaxClient, input: <Fn>Input): Promise<<Fn>Output>` — parse input, call, parse output, throw a typed error carrying the database `errcode` and message (A-98). The error also carries `request_id` (A-108) |
| Correlation | The wrapper mints `p_request_id` **before it validates**, and for **every** call including a pure helper and a stub, so every `ContractError` carries one; it is **sent** to the database only where A-94 wants the argument. A caller never supplies it (A-94, A-108) |
| Fake registration and switch | by construction at the composition root; `WaxClient` has two implementations, `supabase-js` `rpc` and the fake on a separate entry point; never an environment variable (A-98) |
| Validation in the wrapper | ergonomics only — the function is the enforcement point and asserts everything again (A-4, A-48, A-98) |
| What lands at M0 | every §6 function's signature and a stub wrapper throwing `not_implemented`; schemas and the fake's behaviour arrive in the contract pull request that opens each milestone (A-99) |
| How `packages/db-types` is regenerated and by whom | D, with `supabase gen types typescript --local`, in the same pull request as the migration; CI re-runs it and fails on a diff (A-98) |

---

## 6. Do not

- Write a table directly from the client, ever (A-4).
- Use a float anywhere money or a rate passes (A-15, A-47).
- Gate an action the spec says to flag (A-28), or flag one it says to gate (A-28a).
- Edit `packages/contracts/`, a merged migration, a spec, the register, or your own Checklist.
- Read `process.env` in a wrapper, or switch the fake by flag (A-98).
- Create a function without `set search_path = ''` and the revoke/grant pair (A-103).
- Seed with an `insert` where a definer function exists (A-101).
- Put the service-role key anywhere but the server-runtime environment (A-91, A-100).
- Use `waitForTimeout` or a CSS-path selector in any test — `getByRole` / `getByLabel` (`.claude/skills/qa/SKILL.md`).
- Choose a behaviour the spec does not give. The row is `Blocked`; the question is filed.
- Report a suite as green without pasting its output.

---

## 7. Reading list for an order

The order's Checklist quotes every binding decision. Read, in this order, and no
more than this unless a row sends you further:

1. The order, in full.
2. This document.
3. The flow the order names, in full — for the worked examples and the context
   around each quoted decision.
4. [architecture.md](../architecture.md) §1 and §7 (stack and layout, short);
   the **A-n rows your Checklist cites** in §2; the §5.1 rules for the tables you
   touch; the §6 rows for the functions you implement or consume; the §9 rows
   for your flow.
5. The `packages/contracts` entries the order names.
6. The tests that already exist for the area.
7. [lexicon.md](../lexicon.md) for the terms the code must use — search it for
   the terms in your Checklist rather than reading it end to end.

---

## 8. The decisions this document rests on

Ratified 2026-09-20 and 2026-09-21. Cite the A-n, not this section.

| A-n | Settles |
|---|---|
| A-97 | Six CI jobs from M0; Playwright a seventh, with the first `/qa automate` |
| A-98 | The contracts shape: Zod, one wrapper signature, the fake by construction, `db-types` regenerated by D and checked by CI |
| A-99 | The M0 skeleton: signatures and `not_implemented` stubs; schemas per milestone |
| A-100 | Local, preview, production; a Supabase branch per pull request; no staging environment; no shop data outside production |
| A-101 | Migration naming and immutability; the seed through definer functions with two named exceptions |
| A-102 | pnpm workspaces, no task runner, `tsc` and ESLint |
| A-103 | The definer-function header: `search_path = ''`, grants, owner, assertion order |
| A-104 | The owner's ceiling: `bypassrls`, per-table DML, `set role` opener, no `anon` usage on `app`, the ownership assertion |
| A-105 | Functions in `app`, tables in `public`; `app` exposed to PostgREST and holding functions only |
| A-91 (amended) | Public sign-up off in every environment |
| A-106 | No Sentry DSN in any environment until the event payload is built by an allowlist |
| A-107 | The grant rule held in two places: a list-free suite-wide assertion, and each function's own grants in its smoke test |
| A-108 | The wrapper mints before it validates and on every call; `ContractError` carries `request_id` |

Still open in [architecture](../architecture.md) §11: an enforcement mechanism
for A-91's key rule, and the three platform settings §2.1 names — preview
protection, production sign-up off, `app` exposed — which the repository cannot
assert and a human verifies. A-96's proposed `staging` branch, if ratified, deploys as a preview
like any other and production is cut from it (A-100).
