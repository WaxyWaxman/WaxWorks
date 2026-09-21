# Wax Works — the build plan

**Maintained by:** the coordinator, at the end of every build session. Read first by whoever picks up next.
**Last updated:** 2026-09-21, the M0 fix session

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

Every flow is `Specified`. A-1 to A-105 are ratified except A-96 (WaxyWaxman's
`staging` branch and CI security review, still *recommended, not yet ratified*).
Zero flow orders exist. **M0 is built and merged, and its 28 findings are now
worked: 18 `fixed`, 9 `disputed`, one (26) partly each. The order is still
`In review` — its Verdict is blank, and the Verdict and the merge are a human's.**

| PR | Landed | What it did |
|---|---|---|
| [#168](https://github.com/WaxyWaxman/WaxWorks/pull/168) | merged | [`conventions.md`](conventions.md), the developer's reading list, Checklist rows quote decisions, track-aware lane hook |
| [#171](https://github.com/WaxyWaxman/WaxWorks/pull/171) | merged | A-97 to A-103: CI jobs, contracts shape, M0 skeleton, environments, migrations and seed, tooling, the definer-function header |
| [#172](https://github.com/WaxyWaxman/WaxWorks/pull/172), [#175](https://github.com/WaxyWaxman/WaxWorks/pull/175) | merged | [`orders/M0-foundation.md`](orders/M0-foundation.md) drafted, then approved by sr-talbot — rows 11, 12 struck, row 17 (Sentry) added |
| [#176](https://github.com/WaxyWaxman/WaxWorks/pull/176) | merged | **M0 built**: pnpm workspace, `apps/web` scaffold with §7's route groups, 49 prototype tokens in Tailwind's theme, app-shell service worker, Sentry from the environment, `packages/contracts` (86 §6 functions as stubs), `packages/db-types`, local Supabase with the first migration and two pgTAP suites, `build-check.yml`, `e2e/` with zero specs. **Merged before the verdict** — see §4 |
| [#177](https://github.com/WaxyWaxman/WaxWorks/pull/177) | merged | The three reviewers' 28 findings on the order; Supabase CLI pinned in CI |
| [#178](https://github.com/WaxyWaxman/WaxWorks/pull/178) | merged 2026-09-20 22:34Z | A-104 (the owner's ceiling), A-105 (functions in `app`, tables in `public`, `app` exposed), A-91 amended (sign-up off) |
| [#179](https://github.com/WaxyWaxman/WaxWorks/pull/179) | merged 2026-09-20 22:35Z | This file |
| the M0 fix pull request | **open** | §3 step 1 below: the correcting migration, two new pgTAP suites, the contracts and `config.toml` fixes, and every Finding marked |

**What the fix pull request carries.** A correcting migration
`20260921030925_grant_app_owner_ceiling.sql` (A-101 — the first is never edited):
`alter role waxworks_app bypassrls`, `revoke usage on schema app from anon`, and a
comment recording that the first migration's closing comment described the
alternative A-104 rejected. Two pgTAP suites, `0003_app_owner_ceiling` and
`0004_app_holds_functions_only` (A-104, A-105). `config.toml` exposes `app` and
turns sign-up off in both its sections; the real client calls
`supabase.schema("app").rpc`; the wrapper **mints** `p_request_id` and the header
drops it (A-94); `resolve_scan` gains `p_code` and the six §6-stated return shapes
replace `z.unknown()`; `tests/contracts.test.ts` walks file → list as well as
list → file; `onRequestError` is removed until A-93's scrubber lands; `e2e/` gains
`typecheck`, `.gitignore` widens to `.env*` + `!.env.example`, and `shadcn` moves
to dev dependencies.

**Nine findings are `disputed` rather than fixed**, each because the answer is
not this order's to give: 6 and 24 are routed to the M1 contract pull request;
10 (how a bigint minor unit crosses the wire) has no decision and bites at M3;
11 waits on A-96's ratification; 17 and 25 are Checklist wording, which a
developer may not edit; 23 is `/architecture`'s; 27 is `/qa`'s; 28 is the record
that #176 merged before its verdict, which no code closes. Finding 26 is partly
each: `shadcn` and `@types/node` are fixed, and the claim that `cn` is an
unrelated package is **wrong** — it is shadcn's own
(`github.com/shadcn-ui/cn`), imported by `components/ui/button.tsx`. Read the
order's Findings table, not this paragraph, before acting on any of them.

**What runs today.** From a clean clone with Node 24, pnpm 11.0.9, Docker Desktop
and the Supabase CLI **2.117.0** on PATH: `pnpm install --frozen-lockfile`,
`pnpm typecheck` (now including `e2e/`), `pnpm lint`, `pnpm test`
(**330** repository assertions, was 307), `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,realtime,storage-api,mailpit,supavisor`,
`supabase db reset`, `supabase test db` (**19** assertions across four suites, was
8 across two), `pnpm --filter @waxworks/db-types gen` with no diff, and
`pnpm --filter @waxworks/web build`. A Vercel project (`pressers/wax-works`)
deploys an access-protected preview per pull request; it runs the app shell
against **no database**, because no Supabase account exists yet.

**On the Supabase CLI version.** CI pins 2.117.0 and the `db-types` diff step
compares generator output, so a developer on a different CLI — including
scoop's `supabase-beta` — will see that step go red with nothing changed. Install
the `supabase` package, not `supabase-beta`.

---

## 3. Next steps, in order

Each step names the entry point. Nothing here is started until the step before it
is merged. Steps 1 and 2 of the previous revision are done: #178 merged, and the
fix pull request is open.

1. **The M0 fix pull request** — built with `/develop docs/build/orders/M0-foundation.md`
   on a branch from `main`. `/work-order check docs/build/orders/M0-foundation.md`
   re-checks the findings only ([workflow](workflow.md) §3 step 5); the reviewers
   run the suites themselves rather than reading this.
2. **`/work-order accept`** — the Verdict, the **Needs a human** list, and row 13's
   deferral written into `architecture.md` §11 as an open question so it cannot be
   dropped. **A human writes the verdict and a human merges; no agent does either.**
   Then the coordinator writes M0's row in [status.md](status.md). The nine
   `disputed` findings all carry a question, and the accept is where they are
   collected rather than lost.
3. **The M1 contract pull request** (A-99): input and output schemas and the fake's
   behaviour for M1's functions — the Identity set in §6 — plus the answers to the
   three header questions the M0 review left open (Findings 6, 24: `actor_resolve`,
   `manager_authorize_pin`, `terminal_register` and the **S** functions cannot take
   the uniform header; the two predicates; the nine `settings_*` groups). Both
   humans review; `/plan-check` first if any answer touches a recorded decision.
   Finding 10's question — how a bigint minor unit crosses the wire — does not
   block M1 but should be settled before M3's contract pull request.
4. **`/work-order E-01 D`** and **`/work-order E-01 U`**. Human approves each.
   Dispatch the `developer` subagent per order, in its own worktree, with the
   order's path and nothing else.
5. **`/qa ready M1`** when both are `Accepted` and merged, then `/qa automate` per
   E-01 register row.

---

## 4. Waiting on a human

| Item | Who | Blocks |
|---|---|---|
| **Supabase account** on a tier with branching (A-100) | sr-talbot | M0 row 13 (`Deferred`): a Supabase branch per pull request, the environment variables on Vercel, the first preview against a database. Until then previews run the shell against nothing |
| **Three production dashboard settings** the repository cannot assert: preview protection on (verified 2026-09-20), sign-up off, `app` in the exposed schemas | sr-talbot, with the account | Recorded in `architecture.md` §11 and conventions §2.1; re-verified at M6 |
| **A-96** — the `staging` branch and the CI security review | sr-talbot, WaxyWaxman | Whether `build-check.yml`'s `staging` trigger and `security-review.yml` stay. A-100 already says the branch deploys as a preview, not a fourth environment |
| **M0's verdict** | either owner | #176 merged before gates 3–5 ran; the order cannot be `Accepted` until step 3 above |
| **Sentry** auth token (for source maps) and allowed-domains (for the public browser DSN) | sr-talbot | Neither is decided; `@sentry/cli`'s build is denied until the token is |

---

## 5. Picking up cold

1. Read this file, then [`workflow.md`](workflow.md) §1–§3, then [`conventions.md`](conventions.md).
2. `git log --oneline -15` and the open pull requests: the state above may have moved.
3. `python scripts/check_docs.py` and `python scripts/check_coverage.py --order docs/build/orders/M0-foundation.md` — both must be clean before anything else is touched.
4. Open [`orders/M0-foundation.md`](orders/M0-foundation.md): its Findings table is the to-do list for step 2 in §3 above.
5. Every session ends by updating **§2 and §3 of this file** and, if an order moved, its `Status:` line. A plan that says yesterday's state is the confident wrong answer this repository is built to avoid.

Tooling this machine needed and a fresh one will too: Node ≥ 22, pnpm 11 (`packageManager` pins it), Docker Desktop, Supabase CLI **2.117.0** (CI pins it; `scoop install supabase` on Windows), Python 3 for the check scripts. Vercel CLI is not needed; the project is linked to the GitHub repository.
