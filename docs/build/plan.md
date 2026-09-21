# Wax Works — the build plan

**Maintained by:** the coordinator, at the end of every build session. Read first by whoever picks up next.
**Last updated:** 2026-09-21, the M0 review session (#180 – #185)

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
| 3 | **M1 opens with E-01 alone** — `E-01-D-M1` and `E-01-U-M1`, two developers, to `Accepted` — then M-04, then O-01 d3 | E-01 is the thin vertical slice that proves the whole loop (order → developer → CI → reviewers → merge → `/qa ready`) before a second flow depends on it |
| 4 | **Each milestone opens with a contract pull request** both humans review: the schemas and the fake's behaviour for that milestone's functions (A-99) | The signatures exist since M0; the schemas are written against the specification that ships with the milestone, not guessed earlier |
| 5 | **Never two orders on one flow in one track.** One developer worktree per order, fresh context each time | The unit of work is already small; the failure is two agents editing one lane |
| 6 | `resolve_scan` and `review_flags` land early behind their contracts (§8's dependency note) | M3 and M4 both need them |
| 7 | **`/qa ready Mn`** only when both tracks' orders show `Accepted` in [status.md](status.md) | One track alone is an integration test against the fake |

---

## 2. Where we are — 2026-09-21

Every flow is `Specified`. **A-1 to A-108 are ratified except A-96** (WaxyWaxman's
`staging` branch and CI security review, still *recommended, not yet ratified* —
A-100's and A-85's mentions of it are references, not their own status). Zero flow
orders exist.

**M0 is built and merged, and its 39 findings are worked.** The order is still
`In review`: **the Verdict is blank, and closing it needs two marks and a word,
all three a human's** — see §3 step 1.

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
(**333** repository assertions), `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,realtime,storage-api,mailpit,supavisor`,
`supabase db reset`, `supabase test db` (**19** assertions across four suites),
`pnpm --filter @waxworks/db-types gen` with no diff, `pnpm --filter @waxworks/web build`.
A Vercel project (`pressers/wax-works`) deploys an access-protected preview per
pull request, against **no database**, because no Supabase account exists yet.

**On the Supabase CLI version.** CI pins 2.117.0 and the `db-types` diff step
compares generator output, so a developer on a different CLI — including
scoop's `supabase-beta` — sees that step go red with nothing changed. Install
the `supabase` package, not `supabase-beta`.

**Work A-108 created that does not exist yet:** the wrapper still mints
`p_request_id` *after* validating, and `ContractError` does not carry it. The
decision and the code disagree until M1's contract pull request lands the change
and its `invalid_input` test.

---

## 3. Next steps, in order

Nothing here starts until the step before it is merged.

1. **Close M0 — two marks and a word, all three a human's.** Under #185's
   `discharged` state: **finding 28** naming #180, #182, #183 and the correcting
   migration under A-101; **finding 29** naming A-106. Then the **Verdict**:
   every Checklist row is accounted for (17/17), the suites were green in the
   reviewers' own runs, `check_docs` is clean, and with those two marks the
   blocking findings are answered. Then the coordinator writes M0's row in
   [status.md](status.md). **An agent writes neither the marks nor the verdict**
   ([workflow](workflow.md) §4).
   *Not blocking:* finding 23 (A-97's *runs, in order* against four parallel
   jobs) routes to `/architecture`, and finding 27 (register drift on
   `playwright.config.ts`) to `/qa`. Both are observations.
2. **The M1 contract pull request** (A-99), reviewed by **both** owners: input
   and output schemas and the fake's behaviour for §6's Identity set, plus the
   three header questions the review left open (findings 6 and 24 —
   `actor_resolve`, `manager_authorize_pin`, `terminal_register` and the **S**
   functions cannot take the uniform header; the two predicates; the nine
   `settings_*` groups). It also carries **A-108's wrapper change** and **finding
   34** (`service_role` has no `usage` on `app`, which A-91's Auth write-back
   function will need). `/plan-check` first if any answer touches a recorded
   decision. Finding 10 — how a bigint minor unit crosses PostgREST under
   A-47 — does not block M1 but must be settled before M3's contract pull
   request, where the six output schemas will refuse a JSON number.
3. **`/work-order E-01 D`** and **`/work-order E-01 U`**. A human approves each.
   Dispatch the `developer` subagent per order, in its own worktree, with the
   order's path and nothing else. **A-107's grant assertion lands with M1's first
   function migration**, beside A-104's ownership assertion.
4. **`/qa ready M1`** when both are `Accepted` and merged, then `/qa automate`
   per E-01 register row. The first spec `/qa automate` writes is also when
   `--pass-with-no-tests` comes out of `e2e`'s `test:list` (Checklist row 15).

---

## 4. Waiting on a human

| Item | Who | Blocks |
|---|---|---|
| **Supabase account** on a tier with branching (A-100) | sr-talbot | M0 row 13 (`Deferred`): a Supabase branch per pull request, the environment variables on Vercel, the first preview against a database. Until then previews run the shell against nothing |
| **Three production dashboard settings** the repository cannot assert: preview protection on (verified 2026-09-20), sign-up off, `app` in the exposed schemas | sr-talbot, with the account | Recorded in `architecture.md` §11 and conventions §2.1; re-verified at M6 |
| **A-96** — the `staging` branch and the CI security review | sr-talbot, WaxyWaxman | Whether `build-check.yml`'s `staging` trigger and `security-review.yml` stay. A-100 already says the branch deploys as a preview, not a fourth environment |
| **Three jointly-owned documents amended without the second owner** — Checklist rows 7, 15 and 17 ([#183](https://github.com/WaxyWaxman/WaxWorks/pull/183)); [`workflow.md`](workflow.md) and the `work-order` skill ([#185](https://github.com/WaxyWaxman/WaxWorks/pull/185)). Each carries a note saying so. Approval is *the moment scope is fixed* and `workflow.md` names both owners, so this is sr-talbot's to see rather than to be told. | sr-talbot |
| **M0's verdict** | either owner | #176 merged before gates 3–5 ran; the order cannot be `Accepted` until §3 step 2 above |
| **Sentry** auth token (for source maps) and allowed-domains (for the public browser DSN) | sr-talbot | Neither is decided; `@sentry/cli`'s build is denied until the token is. **And under A-106 no DSN is set in any environment until the allowlist `beforeSend` ships — M1's first task** |

---

## 5. Picking up cold

1. Read this file, then [`workflow.md`](workflow.md) §1–§3, then [`conventions.md`](conventions.md).
2. `git log --oneline -15` and the open pull requests: the state above may have moved.
3. `python scripts/check_docs.py` and `python scripts/check_coverage.py --order docs/build/orders/M0-foundation.md` — both must be clean before anything else is touched.
4. Open [`orders/M0-foundation.md`](orders/M0-foundation.md). Its **Findings** table is the record of the review — 39 rows, each marked — and its **Needs a human** list is where every `disputed` finding's question was collected. Read the Needs a human list before the table: it says who owns what, and most of it is not M0's.
5. Every session ends by updating **§2 and §3 of this file** and, if an order moved, its `Status:` line. A plan that says yesterday's state is the confident wrong answer this repository is built to avoid.

Tooling this machine needed and a fresh one will too: **Node 24** (CI's `NODE_VERSION`; `engines` requires ≥ 22), pnpm **11.0.9** (`packageManager` pins it; `corepack enable pnpm` under Node 24), Docker Desktop **running** — `supabase start` fails with an undescriptive daemon error otherwise and needs nothing else configured — Supabase CLI **2.117.0** (CI pins it; `scoop install supabase` on Windows, **not** `supabase-beta`), Python 3 for the check scripts. Vercel CLI is not needed; the project is linked to the GitHub repository.
