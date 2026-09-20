# Work order — M0 Foundation (joint)

**Flow:** none — M0 is the one order with no flow ([work-order skill](../../../.claude/skills/work-order/SKILL.md) §draft, step 1)
**Milestone / track:** M0 / joint — no track; the lane hook enforces none
**Status:** Drafted
**Approved by:** _human, date_
**Pull request:** _once opened_
**Register rows:** none — the register holds whole-flow scenarios and M0 delivers no flow; `/qa ready M0` is not a question this order answers

## Scope

Everything [architecture](../../architecture.md) §8 places at M0 (lines 548–549),
so that the first flow order, `E-01-D-M1` and `E-01-U-M1`, starts on a repository
that installs, typechecks, lints, runs an empty vitest suite and an empty pgTAP
suite in CI, deploys a preview, and exposes every §6 function as a typed
signature that throws `not_implemented`. This order builds **no product
behaviour**: no table, no policy, no function body, no screen. It builds the
harness those will land in, and it is the only order that writes to
`packages/contracts/` and `.github/`, because at M0 the joint skeleton *is* the
deliverable and there is no other track for it to belong to.

It is run interactively with `/develop` by a human, not by the `developer`
subagent: the subagent's hook refuses `packages/contracts/` and `.github/` and
those are rows here.

**Contract entries:** every function §6 names, as a signature and stub (A-99);
no schema and no fake behaviour.

**Reading list:** [conventions](../conventions.md) in full; `architecture.md` §1
(lines 15–33), §7 (492–541), §8 M0 rows (548–549); the §2 rows this Checklist
cites — A-1 (41), A-2 (42), A-100 (52), A-8 (150), A-7 (162), A-9 (163), A-10
(164), A-31 (165), A-85 (178), A-97 (179), A-98 (180), A-99 (181), A-101 (182),
A-102 (183), A-103 (184); §6 intro and its function table (451–486) for the
signatures; §9 rows citing A-97 to A-103. No flow. `_TBD_` conventions this
order hits: none — `conventions.md` carries none.

## Checklist

_Derived by the coordinator from the A-n decisions §8 places at M0 and the
decisions that constrain how each is built. No flow decision binds M0. One row
per decision; a decision that binds two deliverables appears once with both
named. Approved by a human before development starts; a decision missing here
is a coordinator error._

Evidence here is mostly `integration` — the deliverable is a harness, and the
test that holds it is a run of the harness itself. **A `manual` row cannot end
`Done`**: `check_coverage.py` requires a test file citing the A-n for every
`Done`, so a row nothing in the tree can hold ends `N/A` with the reason, or the
developer writes the smallest test that does hold it.

| # | Decision | Binds this order because | Evidence required |
|---|---|---|---|
| 1 | A-102 — _"pnpm workspaces, no monorepo task runner, `tsc --noEmit` per member for typecheck and ESLint with `typescript-eslint` and `eslint-config-next` for lint, driven by root `package.json` scripts; the lockfile is committed and CI installs with `--frozen-lockfile`."_ | The monorepo §8 names is this: root `package.json`, `pnpm-workspace.yaml` listing `apps/*`, `packages/*`, `e2e` and **not** `prototype/`, `pnpm-lock.yaml` committed, `pnpm typecheck` / `pnpm lint` / `pnpm test` root scripts each calling members directly | integration — `pnpm install --frozen-lockfile` then each root script exits 0 on the empty tree, output quoted; a test asserting `pnpm-workspace.yaml` excludes `prototype/` and that no Turborepo / Nx config exists |
| 2 | A-10 — _"Supabase runs locally in Docker; migrations are committed. `supabase db reset` gives a reproducible database."_ | `supabase/` initialised with `config.toml`, an empty `migrations/`, a `seed.sql` that runs to completion, and `supabase start` + `supabase db reset` succeeding from a clean checkout | integration — `supabase db reset` output quoted; a pgTAP test that the database is reachable and `select 1` returns |
| 3 | A-101 — _"A migration is `<UTC timestamp>_<verb>_<object>.sql` as `supabase migration new` mints it, ordered by filename, never edited once merged; the seed reaches the database through definer functions wherever one exists, and where it cannot, says so in a comment naming the function it stands in for."_ | The migration harness this order lays down is where the naming holds from the first file. At M0 the seed writes nothing (no table exists), so the discipline is a comment block at the head of `seed.sql` stating the rule, the two exceptions, the claims-per-block form and the refusal against an existing Organization; a lint (script or pgTAP) that every file under `supabase/migrations/` matches `^\d{14}_[a-z]+_[a-z0-9_]+\.sql$` | unit — the filename lint, with a fixture that fails it; the seed header present |
| 4 | A-103 — _"Every definer function starts from one header: `security definer`, `set search_path = ''` with every object schema-qualified, `execute` revoked from `public` and granted to `authenticated` alone (to the `sysadmin` role for an S function), owned by a dedicated non-superuser role that owns the `app` schema, A-94's `p_request_id` and `p_terminal_id` beside the actor arguments, and the first statements of the body asserting tenant, then principal and actor, then the terminal, then the M/O PIN resolution."_ | M0 writes no function body, but it creates the **`app` schema and its dedicated non-superuser owner role** in the first migration, so that M1's first function has an owner that is not `postgres`. The header text itself is [conventions](../conventions.md) §3.3, not this order's to write | integration — a pgTAP test that schema `app` exists, its owner is not a superuser, and the owner is not `postgres` |
| 5 | A-97 — _"CI runs six jobs, wired at M0, and a suite with nothing to run passes rather than being absent."_ In order: `check_docs.py`; `check_coverage.py`; typecheck; lint; vitest; pgTAP against a local Supabase started in the runner. Playwright is a seventh job and is **not** wired at M0. | `.github/workflows/build-check.yml` with the six jobs in A-97's order, pgTAP running against `supabase start` in the runner, installs with `--frozen-lockfile`. `docs-check.yml` stays as it is — deterministic and keyless — because A-97 lists its two scripts as jobs one and two and they may stay in their own file or move; either satisfies the row, the developer says which | integration — the workflow's own green run on this order's pull request, job names and durations quoted; no Playwright job present |
| 6 | A-98 — _"A contract is one file per database function exporting a Zod input schema, a Zod output schema, and one wrapper of a single shape; the fake is chosen by an explicit client at the composition root, never by an environment variable read inside a wrapper; `db-types` is regenerated by D in the same pull request as the migration that changed the schema, and CI fails on a diff."_ | `packages/contracts/` exists with `zod` as its one schema dependency, the `WaxClient` interface with its `rpc` shape, and a **separate entry point** for the fake (empty at M0 — no function has behaviour). `packages/db-types/` exists with the generated output of `supabase gen types typescript --local` against the M0 database, committed, and a CI step that regenerates and fails on a diff | unit — a test that no file under `packages/contracts/src` reads `process.env`; integration — the `db-types` diff step green in CI, quoted |
| 7 | A-99 — _"The M0 contracts skeleton is every §6 function's name, argument list and return shape, with a stub wrapper that throws `not_implemented`; the input and output schemas, the wrapper body and the fake's behaviour land in the contract pull request that opens the milestone building the function."_ | One file per §6 function, under the §6 domain the table places it in, exporting a typed signature whose argument list carries `p_actor_user_id`, `p_actor_initials`, `p_request_id`, `p_terminal_id` (A-94, A-103) and `p_manager_pin` for **M**/**O**, and a wrapper that throws `not_implemented`. The `settings_*` family is one file per configuration group §5 names. **The function list is §6's, read on the day, not this order's** — a function §6 names and the skeleton lacks is a row failure; one the skeleton has and §6 does not name is a contract change nobody approved | unit — a test enumerating the §6 function names (from a committed list the developer derives and the reviewer checks against §6) and asserting each exports a wrapper that throws `not_implemented` |
| 8 | A-2 — _"Next.js App Router on Vercel. Till screens are client components; back-office screens are server-rendered."_ | `apps/web/` scaffolded as Next.js App Router with §7's seven route groups present as empty segments — `(till)`, `(back)`, `print`, `api/cron`, `(auth)`, `(org)`, `(admin)` — and nothing in them but a placeholder page, so that M1 U adds screens to a tree that already has the shape §7 fixes | unit — a test that the seven route-group directories exist under `apps/web/app/` |
| 9 | A-9 — _"Tailwind + shadcn/ui. The prototype's design tokens map onto Tailwind theme variables."_ | Tailwind and shadcn/ui installed in `apps/web`; the prototype's design tokens mapped into the Tailwind theme once, here, so every later screen consumes them by name. The token source is `prototype/`'s stylesheet, harvested (§7) | integration — `pnpm typecheck` and `pnpm lint` green with the theme in place; a unit test that the theme file defines every token name the prototype's stylesheet defines |
| 10 | A-1 — _"Online-only in v1. No offline queue. The PWA caches the app shell; writes fail visibly rather than queuing."_ | The PWA manifest §8 names, and a service worker that caches the **app shell only** — no write is queued, no request is replayed. Nothing else about offline is built | unit — a test that the service worker's cache list contains no route under `api/` and registers no background-sync handler |
| 11 | A-8 — _"No local print agent in v1. Barcode labels and the letter-size finalize summary use browser printing (`window.print()` with `@page` rules)."_ | The `app/print/` route group exists (row 8) and carries one `@page` stylesheet, empty of content, so M3 U's label stylesheet has a home. **Doubt stated:** this may be nothing more than row 8 already delivers; the human strikes it at approval if so | N/A — or unit, a test that `app/print/` carries a stylesheet with an `@page` rule, if kept |
| 12 | A-7 — _"A `jobs` table drained by Vercel Cron."_ | `app/api/cron/` exists (row 8) and `vercel.json` declares one cron schedule pointing at it, handler returning 204 with no work — the `jobs` table itself is M5's. **Doubt stated:** the schedule could equally land at M5 with the table; the human decides whether an empty drain belongs here | N/A — or integration, the cron route returning 204 on the preview deployment, if kept |
| 13 | A-100 — _"Three environments and no others: local, preview, production. A preview deployment runs against a per-branch ephemeral Supabase branch seeded from `seed.sql`, never against production and never against a copy of it."_ | Vercel project linked with a **preview deployment per pull request**, each against a **Supabase branch** created for that pull request; the anon key and URL wired per environment; the service-role key set **only** as a server-runtime variable on preview and production and present in no file. This order's own pull request is the first preview | integration — the preview URL for this pull request, its Supabase branch name, and a `curl` of a page quoted; a unit test that no file in the repository contains `SUPABASE_SERVICE_ROLE` outside `.env.example` as a name with no value, and that no `NEXT_PUBLIC_*` name contains `SERVICE` or `SECRET` |
| 14 | A-100 — _"…the preview URL is access-protected, because an unprotected one is an unauthenticated application against a real database on the public internet."_ | Preview deployment protection enabled on the Vercel project. A setting, not code (§11 line 855); the repository cannot assert it | manual — cannot be held by a test in the tree, so the row ends **`N/A`** with the Vercel setting's name and who enabled it recorded in the Note, and the verifying human named in **Needs a human** |
| 15 | A-85 — _"The end-to-end suite is a top-level `e2e/` directory, outside both apps."_ | `e2e/` exists as a workspace member (A-102) with its own `package.json` depending on `@playwright/test`, a `playwright.config.ts` reading `PLAYWRIGHT_BASE_URL`, an empty `fixtures/`, and **no spec** — the specs are QA's, written by `/qa automate`; no Playwright job in CI (A-97) | integration — `pnpm --filter e2e exec playwright test --list` exits 0 listing zero tests, quoted |
| 16 | A-31 — _"The agent configuration is version-controlled."_ | `.claude/launch.json` gains an `apps/web` dev-server entry beside the prototype's, so `/qa walk` and `preview_start` can target the product; `.gitignore` covers `node_modules`, `.next`, `supabase/.branches`, `.vercel`, `.env*.local`, `test-results`, `playwright-report` | unit — a test that `.gitignore` contains each of those names; `launch.json` entry present |

Sentry, which §8's U cell names, is **not a row**: no A-n decides how Sentry is
configured and A-92 to A-95 (logging) speak to what it may carry, not to its
installation. Wiring the SDK with a DSN per environment is part of row 8's
scaffold and row 13's environment variables; the content rules bind the first
function that writes an event, at M1. If the human wants it as its own row, it is
added at approval, citing A-92.

## Evidence

_Written by the developer. One row per Checklist row, in the same order. Every
cell is exactly one of `Done`, `Deferred`, `Blocked`, `N/A` — a blank cell fails
`check_coverage.py`._

| # | State | Test (name and `file:line`) | Run output | Note |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
| 16 | | | | |

## Findings

_Written by reviewers (`qa-reviewer`, `architect`, `/code-review`). The developer
marks each `fixed` or `disputed`; nothing here is deleted._

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|
| | | | | | blocks \| should \| observation | fixed \| disputed — _why_ |

## Verdict

**Accepted** | **Returned** — _coordinator, date_

### Needs a human

- **Row 14** — the Vercel preview protection setting: who enabled it and when. The repository cannot verify it; §11 line 855 says it is re-verified at M6.
- **Rows 11 and 12** — strike or keep at approval. Both are scaffolding that a later milestone could equally lay down; they are listed so the choice is visible.
- **The `staging` branch** — A-96 (not yet ratified) puts the CI security review on pull requests into `staging`. This order opens its pull request into `main`, as every order does under the [workflow](../workflow.md). If A-96 is ratified before this order merges, whether M0 creates the branch is a question for its owners, not this order.
- **Supabase plan tier** — row 13 requires branching, which A-100 records as a paid feature. The account must be on a tier that has it before the developer reaches row 13.
- **Sentry** — see the note under the Checklist; add a row citing A-92 at approval if wanted.
