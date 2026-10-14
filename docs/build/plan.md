# Wax Works — the build plan

**Maintained by:** the coordinator, at the end of every build session. Read first by whoever picks up next.
**Last updated:** 2026-10-13, WaxyWaxman's session — through #198; the M1 contracts order `Returned`

The [workflow](workflow.md) says how an order moves; the [conventions](conventions.md)
say what the code looks like; the [status table](status.md) says what has landed.
This says **where we are, what is next, in what order, and what is waiting on a
human** — so a contributor can open the repository cold and start. Everything here
is a pointer to a file that is the record; nothing here is a decision.

---

## 1. The sequence

Architecture [§8](../architecture.md#8-build-order) fixes the milestones. The
order inside them is this, and the reasons are the three hazards of an agent
build: invented conventions, silent bugs, and context blown by reading everything.

| # | Step | Why this order |
|---|---|---|
| 1 | **M0 as a work order**, cited to A-n only, run interactively by a human | The first order sets the pattern for every later one; the joint skeleton writes `packages/contracts/` and `.github/`, which the `developer` subagent's hook refuses |
| 2 | **M0's review findings fixed and the order `Accepted`** before any M1 order is drafted | An M1 order builds on the contracts skeleton and the owner role; both are wrong today in ways the findings name |
| 3 | **M1 opens with E-01 alone** — `E-01-D-M1` and `E-01-U-M1`, two developers, to `Accepted` — then M-04, then O-01 d3. *Since A-111 (2026-10-13), M1 also carries S-01's Create Organization and O-01 d2's Create Store* | E-01 is the thin vertical slice that proves the whole loop (order → developer → CI → reviewers → merge → `/qa ready`) before a second flow depends on it |
| 4 | **Each milestone opens with a contract pull request** both humans review: the schemas and the fake's behaviour for that milestone's functions (A-99) | The signatures exist since M0; the schemas are written against the specification that ships with the milestone, not guessed earlier |
| 5 | **Never two orders on one flow in one track.** One developer worktree per order, fresh context each time | The unit of work is already small; the failure is two agents editing one lane |
| 6 | `resolve_scan` and `review_flags` land early behind their contracts (§8's dependency note) | M3 and M4 both need them |
| 7 | **`/qa ready Mn`** only when both tracks' orders show `Accepted` in [status.md](status.md) | One track alone is an integration test against the fake |

---

## 2. Where we are — 2026-10-13

**M0 is `Accepted`** ([#188](https://github.com/WaxyWaxman/WaxWorks/pull/188), sr-talbot, 2026-10-13): findings 28 and 29
`discharged`, Checklist 17/17 with row 13 `Deferred`. Its row is in [status.md](status.md).
Every flow is `Specified`. **A-1 to A-116 are ratified except A-96** (the `staging`
branch and CI security review, still *recommended, not yet ratified*). **One M1 order exists:** [`orders/M1-contracts.md`](orders/M1-contracts.md) —
built and **merged as [#197](https://github.com/WaxyWaxman/WaxWorks/pull/197) before
its review ran**, then reviewed after merge and **`Returned`** by WaxyWaxman on
2026-10-13 for two blocking findings: the real client takes every Postgres error for a
refusal (a real DETAIL can carry a PIN hash, A-93), and a demotion keeps a PIN that a
re-promotion never re-checks (E-01 d26). **A-117 and A-118** landed after it
([#198](https://github.com/WaxyWaxman/WaxWorks/pull/198)) and the merged contracts
conflict with both (the order's findings 9 and 10). Zero flow orders exist.

**The flow questions M1 depended on are answered** (#192, #194): PIN throttling per
Store (E-01 d31–d32); **passkey-only sign-in** for Managers and Owners, no password, no
fallback (E-01 d33); no store-account second factor (d34); accepting an invitation
and the Owner with no Store (d35–d36); System Administrators on passkeys now (S-01 d7);
PIN required, Employee email optional, the wide Manager scope, no self-service passkey
recovery (M-04 d35–d38). The first shop's settings are Alberta, CAD, March 31, 80mm
(#193). Conventions §5 now says how the fake knows its session and how refusals are
told apart (#195).

**Production exists and serves the app** — on free plans throughout (A-109):

| Piece | State | Record |
|---|---|---|
| Supabase | `udrtvdlmoaqsgzxobwwq`, `ca-central-1`, Postgres 17, free plan, in the Vercel-managed organization; M0's two migrations, never seeded; sign-up off, `app` exposed | A-109, [runbook](runbook.md) |
| Vercel | `https://wax-works.vercel.app` → `200`; three Production-only variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`); previews hold no database. Every deployment before 2026-10-13 was empty (M0 finding 40) | A-109, M0 finding 40 |
| Auth email | `waxworks.store` (Vercel; expires 2027-10-13, **auto-renew off**); Resend verified on `mail.waxworks.store`; Supabase custom SMTP; Site URL production; invite and recovery templates in `supabase/templates/`. The first test invite landed in spam | A-116, runbook |

**Real shop data may enter production before the paid plan**, with **no backup**
until the upgrade due by M6 (A-109 as amended). It cannot enter yet: the
[runbook](runbook.md) §2 lists what stands between — most of it waits on M1's
migrations (the hook, `pin_pepper`, the System Administrators), plus passkeys for
System Administrators (S-01 d6). The first shop's settings values were answered on 2026-10-13 — Alberta, CAD, March 31, 80mm (A-112, §11).

**The M1 plan-check (2026-10-13)** found the record could support neither the M1
contract pull request nor real data at the end of M1. A-110 to A-116 close the
structural part: System Administrators from a table (A-110), Create Organization
and Create Store at M1 (A-111), `store_create` writing the first shop's defaults
(A-112), five header exceptions (A-113), `auth_user_link` as the service role's one
function and the Owner's reset and re-send at M1 (A-114), the pepper (A-115), and
production Auth (A-116). What remains is in the flows — §3 step 1.

| PR | Landed | What it did |
|---|---|---|
| [#168](https://github.com/WaxyWaxman/WaxWorks/pull/168), [#171](https://github.com/WaxyWaxman/WaxWorks/pull/171) | merged | [`conventions.md`](conventions.md) and the track-aware lane hook; A-97 to A-103 |
| [#172](https://github.com/WaxyWaxman/WaxWorks/pull/172), [#175](https://github.com/WaxyWaxman/WaxWorks/pull/175) | merged | [`orders/M0-foundation.md`](orders/M0-foundation.md) drafted, then approved by sr-talbot |
| [#176](https://github.com/WaxyWaxman/WaxWorks/pull/176) | merged | **M0 built** — and **merged before its verdict**, which is finding 28 and the reason §3 step 1 exists |
| [#177](https://github.com/WaxyWaxman/WaxWorks/pull/177) | merged | The three reviewers' first 28 findings; Supabase CLI pinned in CI |
| [#178](https://github.com/WaxyWaxman/WaxWorks/pull/178), [#179](https://github.com/WaxyWaxman/WaxWorks/pull/179) | merged | A-104, A-105, the A-91 amendment; this file |
| [#180](https://github.com/WaxyWaxman/WaxWorks/pull/180) | merged | **The fix pull request** — the correcting migration (A-101), two pgTAP suites, `app` exposed, the wrapper minting `p_request_id`, `resolve_scan`'s `p_code`, the six §6 return shapes. 18 findings `fixed`, 9 `disputed`, 1 partly each |
| [#181](https://github.com/WaxyWaxman/WaxWorks/pull/181) | merged | **A-106, A-107, A-108 ratified** — the Sentry allowlist precondition, the grant assertion, the wrapper's `request_id`. Propagated into `conventions.md`, the order and this file |
| [#182](https://github.com/WaxyWaxman/WaxWorks/pull/182) | merged | The review's questions collected into the order's **Needs a human**; `architecture.md` §11 gains two open questions; **`tests/` becomes the fifth workspace member** and `e2e` and `db-types` gain lint |
| [#183](https://github.com/WaxyWaxman/WaxWorks/pull/183) | merged | **Checklist rows 7, 15 and 17 amended** by the owner, struck in place — findings 36, 17, 25 |
| [#184](https://github.com/WaxyWaxman/WaxWorks/pull/184) | merged | **The A-102 amendment ratified** — *per member* reaches ESLint, and no TypeScript file sits outside a member |
| [#185](https://github.com/WaxyWaxman/WaxWorks/pull/185) | merged | **`discharged`** — a third terminal state for a blocking finding whose remedy is not code, with its naming requirement. Amends [`workflow.md`](workflow.md) §2, §3, §4 and the `work-order` skill |
| [#186](https://github.com/WaxyWaxman/WaxWorks/pull/186) | merged | This file to the M0 review's end, and two fixes found preparing the verdict |
| [#187](https://github.com/WaxyWaxman/WaxWorks/pull/187) | merged | **A-109** — free-plan Supabase, previews against no database; the key rename; M0 row 13 amended; **finding 40**; amended to allow real data before the upgrade |
| [#188](https://github.com/WaxyWaxman/WaxWorks/pull/188) | merged | **M0 `Accepted`** — findings 28 and 29 `discharged` |
| [#189](https://github.com/WaxyWaxman/WaxWorks/pull/189) | merged **into #187's branch, not `main`** | A-110 to A-116 — stacked on #187, which merged first; none of it reached `main` |
| [#190](https://github.com/WaxyWaxman/WaxWorks/pull/190) | merged | #189's content onto `main`, with the four commits that missed it: the sending domain, two runbook updates, the Auth templates |
| [#197](https://github.com/WaxyWaxman/WaxWorks/pull/197) | merged **before its verdict** | The M1 contracts: the 20 Identity functions, the fake. Reviewed after merge; `Returned` 2026-10-13 |
| [#198](https://github.com/WaxyWaxman/WaxWorks/pull/198) | merged | **A-117** (the enrolment session, `passkey_enrolled_at`) and **A-118** (default table grants revoked; `for select` policies; the pgTAP check); E-01 d37 |

**Three things the review changed that outlive M0.** The **`discharged`** state
(#185), because *every blocking finding `fixed`* had no exit for a finding that
records something irreversible — M0 finding 28 could never have been marked
`fixed`, and neither could any future order's. **`tests/` as a workspace member**
(#182, #184), because 332 assertions including every security assertion in the
review were compiled by nothing and linted by nothing; turning `tsc` on found
three real type errors on the first run. And **A-106**, because removing one
Sentry hook had closed one emission path of several, and the SDK's defaults are
error paths no sample rate gates.

**What runs today.** From a clean clone with Node 24, pnpm 11.0.9, Docker Desktop
and the Supabase CLI **2.117.0** on PATH: `pnpm install --frozen-lockfile`,
`pnpm typecheck` and `pnpm lint` (**five members each** — `apps/web`,
`packages/contracts`, `packages/db-types`, `e2e`, `tests`), `pnpm test`
(**334** repository assertions), `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,realtime,storage-api,mailpit,supavisor`,
`supabase db reset`, `supabase test db` (**19** assertions across four suites),
`pnpm --filter @waxworks/db-types gen` with no diff, `pnpm --filter @waxworks/web build`.
A Vercel project (`pressers/wax-works`) deploys an access-protected preview per
pull request, against **no database** — which, under A-109, is now the design
rather than a gap.

**On the Supabase CLI version.** CI pins 2.117.0 and the `db-types` diff step
compares generator output, so a developer on a different CLI — including
scoop's `supabase-beta` — sees that step go red with nothing changed. Install
the `supabase` package, not `supabase-beta`.

**Do not stack pull requests.** #189 targeted #187's branch; when #187 merged first, #189 merged into that branch and `main` never saw it until #190. A pull request targets `main`, or is retargeted to `main` before anyone merges it.

**Work A-108 created that does not exist yet:** the wrapper still mints
`p_request_id` *after* validating, and `ContractError` does not carry it. The
decision and the code disagree until M1's contract pull request lands the change
and its `invalid_input` test.

---

## 3. Next steps, in order

1. **The M1 contracts follow-up pull request** — one joint contract pull request, branched
   from `main`, `/develop docs/build/orders/M1-contracts.md` run interactively (the
   `developer` subagent's hook refuses `packages/contracts/`). It fixes the order's
   **blocking findings 1 and 2**, carries **A-117's and A-118's contract changes**
   (findings 9 and 10: `p_kind = 'passkey'`, `passkey_enrolled_at` through
   `auth_user_link`, an `enrolment` principal, `email` on `user_change_role` and
   `owner_recover`), and findings 3–8 and 11 unless disputed. Then `/work-order check`
   **before** merge — #197 merged first, as #176 did — and **both owners** review.
   The SQLSTATE values go in with it once sr-talbot agrees to WaxyWaxman's proposal
   (conventions §5, beside the table).
2. **In parallel, optional: the Sentry allowlist** (A-106, *M1's first task*) as its own
   joint order — _Status: recommended, not yet ratified._ It sits in `apps/web`, so it
   cannot ride in the contract pull request. It must drop `detail` and `message` as well
   as `details` (the M1 order's finding 5).
3. **`/plan-check`, then `/architecture`, on what the M1 database order needs** — the
   M1 order's Needs a human: a refusal that must leave a record when a `raise` rolls it
   back (E-01 d31, M-04 d32); `manager_authorize_pin` and the open staff session (A-113
   vs E-01 d31); `drawer_opens` with no writer; whether `auth_user_link` may relink.
   The smaller ones go to `/flow-clarify`: M-04 (a Manager's reach at Set PIN; acts on a
   deactivated person; reactivation and a taken PIN; Manager → Owner invites), E-01 (the
   PIN lockout's edges), O-01 (the Store ID sequence).
4. **`/work-order E-01 D` and `/work-order E-01 U`** once step 1 is merged; a human
   approves each; one `developer` per order in its own worktree. Then M-04; then O-01
   (d2 Create Store, d3 reset) and S-01 (Create Organization) under A-111. The E-01
   **D** order carries A-118's revokes and pgTAP check, A-117's hook change and
   `passkey_enrolled_at`, a test that a **refreshed** passkey session keeps `passkey` in
   its `amr` (only first sign-ins were observed), and A-107's grant assertion with the
   first function migration.
5. **`/qa ready M1`** when both tracks are `Accepted` and merged; then `/qa automate`
   per row, which also takes `--pass-with-no-tests` out of `e2e` (M0 row 15). Then the
   [runbook](runbook.md) §2 steps, and the first real Organization.

**For `/architecture`, before they bite:** `drawer_opens` has no §6 writer though M1
builds the table; the predicates' `pure` label against A-113's *five exceptions and no
others* (before M3); finding 10, bigint minor units across PostgREST (before M3).

---

## 4. Waiting on a human

| Item | Who | Blocks |
|---|---|---|
| **Run `/develop` on the M1 contracts follow-up** (§3 step 1) | sr-talbot or WaxyWaxman | Every M1 flow order |
| **The SQLSTATE values** — WaxyWaxman's proposal beside conventions §5's table (two codes change to `WX404`, `WX409`) | sr-talbot | The follow-up's `REFUSALS` table |
| **Reword the invite and recovery emails** — *create your passkey*, no password, no self-service reset; dashboard and `supabase/templates/` together (runbook) | sr-talbot | The first real Owner's invite |
| **A-109 to A-116, E-01 d31–d36, M-04 d35–d38, S-01 d7 and conventions §5's answers decided by sr-talbot alone** — jointly owned; merged through #187–#195 | WaxyWaxman | Nothing, if the merge review was the second owner's assent; say so if it was not |
| **Auto-renew on `waxworks.store`** — off at purchase, deferred by sr-talbot 2026-10-13 | sr-talbot | Every invite and reset after 2027-10-13 |
| **Auth email lands in spam** — a new domain, and links on `supabase.co` until M1's accept-invite route | sr-talbot | Nothing; tell an invited Owner to check spam meanwhile |
| **The paid Supabase plan** — due by M6; until then real data has no backup (A-109) | sr-talbot | M6's backup restore verification |
| **A-96** — the `staging` branch and the CI security review | sr-talbot, WaxyWaxman | Whether `build-check.yml`'s `staging` trigger and `security-review.yml` stay |
| **Sentry** auth token (for source maps) and allowed-domains (for the public browser DSN) | sr-talbot | Setting a DSN; `@sentry/cli`'s build. Under A-106 no DSN is set until the allowlist ships |
| **M0 row 13's observations** (2026-10-13) — recorded by the coordinator and never checked by a reviewer; the row stays `Deferred` in an `Accepted` order | either owner | Nothing now; re-verified with the platform settings at M6 |

---

## 5. Picking up cold

1. Read this file, then [`workflow.md`](workflow.md) §1–§3, then [`conventions.md`](conventions.md).
2. `git log --oneline -15` and the open pull requests: the state above may have moved.
3. `python scripts/check_docs.py` and `python scripts/check_coverage.py --order docs/build/orders/M0-foundation.md` — both must be clean before anything else is touched.
4. Open [`orders/M0-foundation.md`](orders/M0-foundation.md). Its **Findings** table is the record of the review — 39 rows, each marked — and its **Needs a human** list is where every `disputed` finding's question was collected. Read the Needs a human list before the table: it says who owns what, and most of it is not M0's.
5. Every session ends by updating **§2 and §3 of this file** and, if an order moved, its `Status:` line. A plan that says yesterday's state is the confident wrong answer this repository is built to avoid.

Tooling this machine needed and a fresh one will too: **Node 24** (CI's `NODE_VERSION`; `engines` requires ≥ 22), pnpm **11.0.9** (`packageManager` pins it; `corepack enable pnpm` under Node 24), Docker Desktop **running** — `supabase start` fails with an undescriptive daemon error otherwise and needs nothing else configured — Supabase CLI **2.117.0** (CI pins it; `scoop install supabase` on Windows, **not** `supabase-beta`), Python 3 for the check scripts. Vercel CLI is not needed; the project is linked to the GitHub repository.
