# Wax Works — the build plan

**Maintained by:** the coordinator, at the end of every build session. Read first by whoever picks up next.
**Last updated:** 2026-10-30, sr-talbot's session — through #210; the three M1 contract orders `Accepted`, contract commit `19a49ed`

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

## 2. Where we are — 2026-10-30

**The M1 contracts are done, in three orders, all `Accepted`** (sr-talbot's verdicts):

| Order | Pull requests | Verdict | What it landed |
|---|---|---|---|
| [`M1-contracts`](orders/M1-contracts.md) | [#197](https://github.com/WaxyWaxman/WaxWorks/pull/197), follow-up [#200](https://github.com/WaxyWaxman/WaxWorks/pull/200); verdict [#202](https://github.com/WaxyWaxman/WaxWorks/pull/202) | `Returned` 2026-10-13 (GimpyMatey), then `Accepted` 2026-10-29/30 | The 20 Identity functions, the fake, A-108's wrapper; findings 1 and 2 fixed; A-117's and A-118's contract changes; the SQLSTATEs |
| [`M1-contracts-2`](orders/M1-contracts-2.md) | [#204](https://github.com/WaxyWaxman/WaxWorks/pull/204), review [#205](https://github.com/WaxyWaxman/WaxWorks/pull/205); verdict [#206](https://github.com/WaxyWaxman/WaxWorks/pull/206) | `Accepted` 2026-10-29 | A-120's pad arguments; `user_reactivate`'s `p_pin`; the fake for M-04 d39–d44 |
| [`M1-contracts-3`](orders/M1-contracts-3.md) | [#208](https://github.com/WaxyWaxman/WaxWorks/pull/208); verdict [#209](https://github.com/WaxyWaxman/WaxWorks/pull/209) | `Accepted` 2026-10-29 | The fake for M-04 d46 and d47 |

**The contract commit the M1 D and U orders build against is `19a49ed`** (#208),
plus the one-line M-04 d48 fake fix in §3 step 3. **#197, #200 and #204 merged
before their review finished**; #208 was the first done in order. **No M1 D or U
order exists yet**, and [status.md](status.md)'s M1 rows are empty.

**Decided in this stretch** — read the rows, not this list: **A-119** (a refusal whose
record must be kept is returned, not raised), **A-120** (`manager_authorize_pin` takes
the staff session's actor), **A-121** (reactivation's PIN clash joins A-119's list);
**M-04 d39–d49** (PINs at demotion and reactivation, invites, deactivated people,
Set PIN's scope, the freed-PIN prompt); the **SQLSTATEs** `not_found` = `WX404`,
`invalid_state` = `WX409` (conventions §5). Every flow is `Specified`. **A-1 to A-121
are ratified except A-96** (the `staging` branch and CI security review, still
*recommended, not yet ratified*).

**M0 is `Accepted`** ([#188](https://github.com/WaxyWaxman/WaxWorks/pull/188), sr-talbot, 2026-10-13): findings 28 and 29
`discharged`, Checklist 17/17 with row 13 `Deferred`. Its row is in [status.md](status.md).

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
| [#199](https://github.com/WaxyWaxman/WaxWorks/pull/199) | merged | The M1 contracts order `Returned` — the review's findings; this file through #198 |
| [#200](https://github.com/WaxyWaxman/WaxWorks/pull/200) | merged **before its verdict** | The M1 contracts follow-up: findings 1 and 2, A-117's and A-118's contract changes |
| [#201](https://github.com/WaxyWaxman/WaxWorks/pull/201) | merged | **A-119, A-120** |
| [#202](https://github.com/WaxyWaxman/WaxWorks/pull/202) | merged | **M1-contracts `Accepted`**; the third round's code-review findings applied |
| [#203](https://github.com/WaxyWaxman/WaxWorks/pull/203) | merged | M-04 d39–d45 |
| [#204](https://github.com/WaxyWaxman/WaxWorks/pull/204), [#205](https://github.com/WaxyWaxman/WaxWorks/pull/205) | #204 merged **before its review finished** | The second contract pull request, and its review's tests and findings |
| [#206](https://github.com/WaxyWaxman/WaxWorks/pull/206) | merged | **A-121**; **M1-contracts-2 `Accepted`** |
| [#207](https://github.com/WaxyWaxman/WaxWorks/pull/207) | merged | M-04 d46–d47 |
| [#208](https://github.com/WaxyWaxman/WaxWorks/pull/208), [#209](https://github.com/WaxyWaxman/WaxWorks/pull/209) | merged after its review | The third contract pull request (`19a49ed`); **M1-contracts-3 `Accepted`** |
| [#210](https://github.com/WaxyWaxman/WaxWorks/pull/210) | merged | M-04 d48–d49 — d48 not yet in the fake (§3 step 3) |

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
(**535** repository tests at #208, per [M1-contracts-3](orders/M1-contracts-3.md)'s Evidence), `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,realtime,storage-api,mailpit,supavisor`,
`supabase db reset`, `supabase test db` (**19** assertions across four suites),
`pnpm --filter @waxworks/db-types gen` with no diff, `pnpm --filter @waxworks/web build`.
A Vercel project (`pressers/wax-works`) deploys an access-protected preview per
pull request, against **no database** — which, under A-109, is now the design
rather than a gap.

**On the Supabase CLI version.** CI pins 2.117.0 and the `db-types` diff step
compares generator output, so a developer on a different CLI — including
scoop's `supabase-beta` — sees that step go red with nothing changed. Install
the `supabase` package, not `supabase-beta`.

**Do not stack pull requests.** #189 targeted #187's branch; when #187 merged first, #189 merged into that branch and `main` never saw it until #190. A pull request targets `main`, or is retargeted to `main` before anyone merges it. Branch each from `origin/main`, and check a pull request is `OPEN` before every push.

**Merge after the verdict.** Four contract pull requests (#176 at M0, #197, #200, #204) merged before `/work-order check` finished. Run the check and leave the merge to the owners; branch protection was suggested and is their call.

---

## 3. Next steps, in order

Ask sr-talbot before each step that writes.

1. **One `/architecture` session** for two items that shape the M1 **D** order:
   - **Conventions §5's `invalid_state` details** — list the values screens branch on
     (`inactive`, `active`, `pin_not_needed`, `employee_has_no_pin`, `no_store`,
     `auth_user_mismatch`, `employee`, `enrolled`), or state that `detail` is advisory
     ([M1-contracts-3](orders/M1-contracts-3.md) finding 6; [M1-contracts](orders/M1-contracts.md) Needs a human, *refusal keys the table has no kind for*).
   - **M-04 d45's mechanism** — how a demotion to Employee ends a personal session:
     revoke the refresh tokens, or the access-token hook refuses a personal session to an
     Employee. Amends A-87.
   - Also on the M1-contracts order's list for `/architecture`, not yet routed: a missing
     PIN pepper as a refusal (finding 18, the architect's draft — _Status: recommended,
     not yet ratified._); whether `auth_user_link` may relink; a demoted Employee's
     enrolment by a link sent before the demotion; the personal session's ignored
     arguments (conventions §3.3); `principal` under `service_role` (A-94).
2. **`/qa register M-04`** — rows for d39–d49 (M1-contracts-2 finding 11, M1-contracts-3
   finding 9); add A-120 to E-01-T19's citations.
3. **The d48 fake fix** — `user_set_pin` refuses a deactivated person (M-04 d48; not in
   `packages/contracts/src/fake/identity.ts` at `53dbf08`). A contract change both owners
   review; folded into the next contract work rather than an order of its own.
4. **Draft the onboarding orders** with `/work-order`, against `19a49ed` — sr-talbot asked
   for the onboarding slice first, to reach production and start QA:
   - **E-01 D and U** — store sign-in, initials, the PIN pad, personal passkey sign-in,
     accept-invite and the enrolment session (A-117);
   - **S-01** Create Organization;
   - **O-01** Create Store and the store-account reset.

   **The E-01 D order's Checklist also carries:** A-118's revokes and its pgTAP check;
   A-117's hook, and a test that a **refreshed** passkey session keeps `passkey` in `amr`;
   A-107's grant assertion; A-119's and A-121's returned refusals, asserting
   `user_reactivate`'s full order of checks (in reach, `active`, initials,
   `employee_has_no_pin`, `pin_not_needed`, `pin_clash` — M1-contracts-3 finding 4);
   pgTAP refusal tests asserting both SQLSTATE and key (M1-contracts finding 25);
   nothing written on a same-role `user_change_role` (M1-contracts-3 finding 5).
   **The U order carries M-04 d49's screen.** Each contract order's Needs a human feeds
   these Checklists.
5. **A `developer` per order**, each in its own worktree; `/work-order check`, then
   `accept` — the owners merge after the verdict. Then **`/qa ready M1`**, `/qa automate`
   per row (which also takes `--pass-with-no-tests` out of `e2e`, M0 row 15), and the
   [runbook](runbook.md) §2 production steps.

**Still open against the flows**, from the contract orders' Needs a human: E-01 (the
PIN throttle's edges), O-01 (the Store ID sequence), S-01 / A-117 (where a System
Administrator's passkey enrolment is recorded).

**For `/architecture`, before they bite:** `drawer_opens` has no §6 writer though M1
builds the table; the predicates' `pure` label against A-113's *five exceptions and no
others* (before M3); finding 10, bigint minor units across PostgREST (before M3).

---

## 4. Waiting on a human

| Item | Who | Blocks |
|---|---|---|
| **Who is the second owner?** CLAUDE.md names sr-talbot and WaxyWaxman; recent assents and verdicts came from GimpyMatey | sr-talbot | Treating any assent as joint |
| **Joint assent on this stretch's decisions** — A-119 and A-120 ratified by GimpyMatey alone; A-121, M-04 d39–d49 and the SQLSTATEs by sr-talbot alone | the other owner, once confirmed | Nothing yet; the D order cites them |
| **Approve each step in §3** before it writes | sr-talbot | Each step |
| **Branch protection on `main`** — four contract pull requests merged before their verdict | the owners | Nothing; a process question (workflow §3) |
| **Production's PostgREST version** — check conventions §5's status mapping against it once, from the docs | either owner | Nothing now |
| **Reword the invite and recovery emails** — *create your passkey*, no password, no self-service reset; dashboard and `supabase/templates/` together (runbook) | sr-talbot | The first real Owner's invite |
| **Auto-renew on `waxworks.store`** — off at purchase, deferred by sr-talbot 2026-10-13 | sr-talbot | Every invite and reset after 2027-10-13 |
| **Auth email lands in spam** — a new domain, and links on `supabase.co` until M1's accept-invite route | sr-talbot | Nothing; tell an invited Owner to check spam meanwhile |
| **The paid Supabase plan** — due by M6; until then real data has no backup (A-109) | sr-talbot | M6's backup restore verification |
| **A-96** — the `staging` branch and the CI security review | the owners | Whether `build-check.yml`'s `staging` trigger and `security-review.yml` stay |
| **Sentry** auth token (for source maps) and allowed-domains (for the public browser DSN) | sr-talbot | Setting a DSN; `@sentry/cli`'s build. Under A-106 no DSN is set until the allowlist ships |
| **M0 row 13's observations** (2026-10-13) — recorded by the coordinator and never checked by a reviewer; the row stays `Deferred` in an `Accepted` order | either owner | Nothing now; re-verified with the platform settings at M6 |

---

## 5. Picking up cold

1. Read this file, then [`workflow.md`](workflow.md) §1–§3, then [`conventions.md`](conventions.md).
2. `git log --oneline -15` and the open pull requests: the state above may have moved.
3. `python scripts/check_docs.py` and `python scripts/check_coverage.py` — both must be clean before anything else is touched.
4. Open [`orders/M0-foundation.md`](orders/M0-foundation.md). Its **Findings** table is the record of the review — 39 rows, each marked — and its **Needs a human** list is where every `disputed` finding's question was collected. Read the Needs a human list before the table: it says who owns what, and most of it is not M0's.
5. Every session ends by updating **§2 and §3 of this file** and, if an order moved, its `Status:` line. A plan that says yesterday's state is the confident wrong answer this repository is built to avoid.

Tooling this machine needed and a fresh one will too: **Node 24** (CI's `NODE_VERSION`; `engines` requires ≥ 22), pnpm **11.0.9** (`packageManager` pins it; `corepack enable pnpm` under Node 24), Docker Desktop **running** — `supabase start` fails with an undescriptive daemon error otherwise and needs nothing else configured — Supabase CLI **2.117.0** (CI pins it; `scoop install supabase` on Windows, **not** `supabase-beta`), Python 3 for the check scripts. Vercel CLI is not needed; the project is linked to the GitHub repository.
