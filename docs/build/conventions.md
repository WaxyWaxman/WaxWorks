# Wax Works — build conventions

**Status:** Drafted 2026-09-20 — the recipe the developer follows; ratified parts are quoted from [architecture](../architecture.md), the rest is `_TBD_` until `/architecture` answers it
**Owners:** sr-talbot, WaxyWaxman
**Read by:** the `developer` subagent and `/develop`, before the first line of code; `qa-reviewer` and `architect`, when judging a diff

What a developer needs to know about the stack that no flow document says. Every
rule here is either **quoted** from [architecture.md](../architecture.md) with its
A-n or section, or is marked `_TBD_` with the question that owns it. Nothing here
is a decision; a rule that turns out wrong is fixed in the architecture first and
here second. Where this document and the architecture disagree, the architecture
wins and this is the bug.

The [workflow](workflow.md) says who writes what. This says how.

---

## 1. Commands

Every command is run from the repository root. The **Track** column says who runs
it in the course of an order; CI runs all of them (workflow §3 gate 1).

| Purpose | Command | Track |
|---|---|---|
| Install | `_TBD_` — package manager and workspace tool are not decided (architecture §7 names a monorepo and nothing else) | both |
| Start local Supabase | `supabase start` (A-10: Supabase runs locally in Docker) | D, U for integration |
| Rebuild the database from migrations and seed | `supabase db reset` (A-10) | D |
| Run the database tests | `supabase test db` — pgTAP under `supabase/tests/` (§7) | D |
| Generate `packages/db-types` | `supabase gen types typescript --local > packages/db-types/…` — `_TBD_` exact target file and when it is regenerated (open question 2 in §8) | D |
| Typecheck | `_TBD_` | both |
| Lint | `_TBD_` | both |
| Unit tests, screens | vitest in `apps/web/` (`.claude/skills/qa/SKILL.md` §Levels) | U |
| Decision-to-test gate | `python scripts/check_coverage.py --order docs/build/orders/<order>.md` | both |
| Document gate | `python scripts/check_docs.py` | both |
| End-to-end | `npx playwright test` from `e2e/` — QA's, not the developer's (A-85; workflow §1) | neither |

Until the `_TBD_` rows are filled, a developer who needs one of them stops and
files it under **Needs a human** rather than choosing a tool.

---

## 2. Repository layout

The tree is fixed by architecture §7. The developer creates files only where §7
already places them; a file that fits nowhere is a question for `/architecture`.

| Path | Holds | Written by |
|---|---|---|
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

---

## 3. Database track (D)

### 3.1 Migrations

- One file per migration under `supabase/migrations/`, "numbered SQL" (§7).
  Naming beyond the number: `_TBD_` (open question 5 in §8). Until then:
  `<UTC timestamp>_<verb>_<object>.sql`, as `supabase migration new` produces.
  _Status: recommended, not yet ratified._
- **A merged migration is never edited.** A wrong migration is followed by a
  correcting one. This is the append-only rule the decision tables already live
  by, applied to schema.
- One migration per coherent group of Checklist rows — a table and its policies,
  a function and its tests — so a reviewer can read one file against the rows it
  serves.
- The seed exercises the write surface: `supabase/seed.sql` calls definer
  functions (A-4) rather than inserting rows, so the seed is also the first
  integration test of every function it touches. The fixture rule in
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
| Immutability and sealing | a check in the write path calling `invoice_is_paid()` / `period_is_sealed()`, never a trigger | A-41, A-80 |
| Voids | appended reversing rows; a record is deleted only where nothing cites it and no money moved | A-54, A-70 |
| `search_path` | `_TBD_` — set explicitly in every definer function; the value is for `/architecture` to fix | — |

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
  wrappers (§7). How the fake is registered and switched: `_TBD_` (open
  question 2 in §8). A screen may **check first** for the user's sake; it never
  checks **instead** of the function (`.claude/skills/develop/SKILL.md` §Rules).
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
| Schema library | `_TBD_` — open question 2 in §8 |
| Wrapper signature | `_TBD_` |
| Fake registration and switch (env var, provider) | `_TBD_` |
| What lands at M0 | `_TBD_` — signatures for every §6 function, schemas per milestone. _Status: recommended, not yet ratified_ (open question 3 in §8) |
| How `packages/db-types` is regenerated and by whom | `_TBD_` |

---

## 6. Do not

- Write a table directly from the client, ever (A-4).
- Use a float anywhere money or a rate passes (A-15, A-47).
- Gate an action the spec says to flag (A-28), or flag one it says to gate (A-28a).
- Edit `packages/contracts/`, a merged migration, a spec, the register, or your own Checklist.
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

## 8. Open questions

Owner: `/architecture`, unless stated. Each becomes a proposed A-n or a §7/§8
note, ratified before the M0 order is approved. Items 1 and 5 restate questions
the [workflow](workflow.md) already lists.

1. **Which suites run in CI at M0** — typecheck, lint, vitest, pgTAP at M0; Playwright with the first `/qa automate`. _Status: recommended, not yet ratified._
2. **The contracts package shape** — schema library, wrapper signature, how the in-memory fake is registered and switched, how and when `packages/db-types` is regenerated.
3. **Contracts skeleton scope at M0** — signatures only, or full schemas (§8 says "every function signature agreed"; §7 says each contract carries schemas and a wrapper).
4. **Environments** — what database a Vercel preview deployment runs against (local Supabase in CI, one shared preview project, Supabase branching); ~~where secrets live~~ — **partly answered by A-92 (not yet ratified):** `staging` is a branch after `main`, and the one secret CI holds is the `ANTHROPIC_API_KEY` read by `security-review.yml` alone; the preview database and every other secret remain open; the service-role key server-side only (A-91).
5. **Migration and seed conventions** — file naming, ordering, and the seed-through-functions rule (§3.1 here is the recommendation).
6. **Package manager, workspace tool, typecheck and lint commands** — §7 says monorepo and nothing more.
7. **`search_path` and the definer-function boilerplate** — one copyable header every function starts from.
