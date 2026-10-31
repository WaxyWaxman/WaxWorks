# Wax Works — the build plan

**Maintained by:** the coordinator, at the end of every build session. Read first by whoever picks up next.
**Last updated:** 2026-10-31, sr-talbot's session — through #230; E-01 D `Accepted`; this file reshaped as the path to M4

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

## 2. Where we are — 2026-10-31

**E-01 D is `Accepted`** (sr-talbot, 2026-10-31): built in #221, corrected in #225,
its last tests in #230, A-133 and A-134 in #229. The order's Verdict lists what it
carries forward. Everything in the table landed this stretch; read the rows, not this list.

| PR | What it did |
|---|---|
| [#211](https://github.com/WaxyWaxman/WaxWorks/pull/211) | This file through #210 |
| [#212](https://github.com/WaxyWaxman/WaxWorks/pull/212) | **A-122** (a personal session belongs only to an active Manager or Owner); conventions §5's `invalid_state` details become a closed list |
| [#213](https://github.com/WaxyWaxman/WaxWorks/pull/213) | Register rows M-04-T20–T28, E-01-T24; A-120 on E-01-T19 |
| [#214](https://github.com/WaxyWaxman/WaxWorks/pull/214), [#217](https://github.com/WaxyWaxman/WaxWorks/pull/217) | [`E-01-D-M1`](orders/E-01-D-M1.md) drafted (38 rows: the tenancy foundation plus E-01's five functions), then `Approved` by sr-talbot — fixtures-only seed, relinking `Blocked` |
| [#215](https://github.com/WaxyWaxman/WaxWorks/pull/215) | E-01 d38–d39: the throttle's edges; the closure flag is the system's, no actor |
| [#216](https://github.com/WaxyWaxman/WaxWorks/pull/216) | **A-123** — `pin_refusals` and `pin_line_closures` as rows, a per-Store advisory lock |
| [#218](https://github.com/WaxyWaxman/WaxWorks/pull/218) | **A-124** — the row-security helpers live in `authz`, not `auth` (a migration cannot create in `auth`) |
| [#219](https://github.com/WaxyWaxman/WaxWorks/pull/219) | **A-125 to A-128** — the hook as a definer owned by `waxworks_app`, executable by `supabase_auth_admin` only; the `tests/auth` harness (vitest + Playwright, Chromium's virtual authenticator); the pepper read through `authz.pin_pepper()`; `principal = 'service'`, no relinking |
| [#220](https://github.com/WaxyWaxman/WaxWorks/pull/220) | **A-91 amended** — email login on, sign-up off (the store account could not sign in otherwise); claims read from `request.jwt.claims`; A-125 clarified |
| [#221](https://github.com/WaxyWaxman/WaxWorks/pull/221) | **E-01 D built** — 11 migrations, 9 pgTAP files, `tests/auth`, the hook wired in `config.toml`; CI runs `test:auth`. Merged **before its verdict, with red CI** (finding 29) |
| [#222](https://github.com/WaxyWaxman/WaxWorks/pull/222) | The review's 29 findings. **Finding 1 blocked:** a PIN oracle over HTTP GET — PostgREST runs a GET RPC read-only, so a correct PIN named its holder and a wrong one's refusal never committed |
| [#223](https://github.com/WaxyWaxman/WaxWorks/pull/223) | `main` green again: the Supabase CLI prints different JSON under an AI agent than in CI; the harness reads both |
| [#224](https://github.com/WaxyWaxman/WaxWorks/pull/224) | **A-129 to A-132** — read-only refused before any PIN is read; a store session only from a password sign-in; an enrolment session only inside a 24-hour window a link-sending function opened; one Auth user, one row across the three tables. §10 gains the `PUT /auth/v1/user` risk |
| [#225](https://github.com/WaxyWaxman/WaxWorks/pull/225) | **The corrections** — five new migrations (A-101: nothing merged is edited); 374 pgTAP assertions, 33 Auth integration tests. Merged before the re-review finished |
| [#226](https://github.com/WaxyWaxman/WaxWorks/pull/226) | The re-review's findings 30–45. **Finding 1 is closed** (architect, qa-reviewer, `/code-review`). Finding 14 is **not fixed**; two draft decisions and five questions in Needs a human |

**What the E-01 D order still needs before `Accepted`** — all in its Findings table:
finding 14 (a test that cannot catch the regression it names), finding 33 (no test
holds A-132's lock), finding 30 (a System Administrator's enrolment window is never
closed), finding 31 (production's PostgREST rollback setting, unrecorded). None is a
schema change; 14 and 33 are tests, 30 and 31 are a decision and a runbook line each.

**Production** is unchanged since 2026-10-13: M0's two migrations, never seeded, no
hook, no pepper, no System Administrators. **M1's migrations have not been pushed**,
and must not be until §4's *blocks deployment* rows are clear.

**Decided this stretch and ratified by sr-talbot alone:** A-122 to A-132, E-01
d38–d39, the `invalid_input` = `22023` and `read_only` = `25006` notes in conventions
§5, the A-91 amendment. Joint assent is pending on all of them (§4).

**What runs today**, from a clean clone (tooling in §5): `pnpm test` → 536;
`supabase test db` → 374 across 14 files; `pnpm test:auth` → 33 (needs
`supabase start` and Chromium via `playwright install`). **Run `test:auth` with the
agent environment removed too** — `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT pnpm test:auth` —
because the Supabase CLI's JSON differs under an agent and CI sees the second form;
#221 went red on exactly that while three agent-run local passes were green.

**Do not stack pull requests, and gate the push on the state.** #225 merged while
the re-review ran; the commit pushed to it afterwards went nowhere (recovered as
#226). `gh pr view N --json state -q .state && git push` prints `MERGED` and pushes
anyway — use `[ "$(gh pr view N --json state -q .state)" = OPEN ] && git push`.

**Merge after the verdict.** #221 and #225 join #176, #197, #200 and #204 — six
pull requests merged before `/work-order check` finished. Branch protection remains
the owners' call.

---

## 3. The path to M4

**The aim:** reach M4 (the till) with real shop data in production as early as M1
lets us, and hold everything that is not a schema shape or a deployment blocker for
after live testing. §8 fixes what each milestone *contains*; this fixes the order
and the cut. Where this file recommends narrowing a milestone, the narrowing is
_Status: recommended, not yet ratified_ and goes through `/plan-check` before it
binds anything — §8 is the record, not this.

**The one rule that makes "quickly" safe:** a decision that changes a table's shape
is made **before the migration that creates the table**, because A-101 forbids
editing a merged migration and real data makes a reshaping migration expensive.
A decision that changes only a screen, a refusal key, a test or a runbook line can
wait. §4 sorts every open item on that line.

Ask sr-talbot before each step that writes.

### M1 — finish the onboarding slice (now)

| # | Step | Gate | Notes |
|---|---|---|---|
| 1 | **Close E-01 D's review** — the developer fixes findings 14 and 33 (tests only); `/architecture` ratifies or rejects the two drafts (System Administrator window closed by hand; PostgREST `db-tx-end` stays `commit`, with a `Prefer: tx=rollback` test); `/work-order accept` | Verdict by an owner | Nothing here touches a table |
| 2 | **One contract pull request**, both owners review: M-04 d48 in the fake; attempts while closed recorded (d38); the flag's null actor (d39); `linked` and `auth_user_in_use` in the fake; `invalid_input` and `read_only` into `REFUSALS`, `REFUSAL_DETAIL` and conventions §5's table (which `tests/contracts-m1.test.ts` holds equal); `authz.` names in the contracts' comments; the inactive-Store detail once §4 decides it | Merged after review | E-01 U branches on these keys; every M1 order cites the resulting commit |
| 3 | **`M-04-D-M1`** — the Identity function set (`user_add`, `user_change_role`, `user_set_pin`, `user_reactivate`, …), **carrying A-129's guard on every PIN function and A-131's setters** on every link-sending function. Decide `drawer_opens`' writer and `organizations.org_id` (§4) **before drafting** — both are schema | Drafted, `Approved`, built, checked, `Accepted` | The order's Checklist names A-129 and A-131 by their rows |
| 4 | **`S-01-D-M1`** (`organization_create`, System Administrator recovery acts) and **`O-01-D-M1`** (`store_create` with the first shop's values — A-112; the Owner's reset and re-send — A-114). Decide the Store ID sequence and where a System Administrator's passkey enrolment is recorded **before drafting** | As above | Both small; one developer each, in sequence, so neither edits the other's lane |
| 5 | **`E-01-U-M1`**, then **`M-04-U-M1`** with Create Organization and Create Store screens (A-111) | As above | The accept-invite route moves Auth links onto the product's origin (runbook) |
| 6 | **`/qa ready M1`**; `/qa automate` the rows that both tracks make automatable (E-01-T1, T10, T11, T13 at least — order finding 15 says the rest wait on M-04's half) | Both tracks in [status.md](status.md) | — |
| 7 | **Production**: [runbook](runbook.md) §2 in order — templates, email switches, link lifetime, `supabase db push`, hook on, `pin_pepper`, three System Administrators with passkeys, the first Organization and Store through the product | Every §4 *blocks deployment* row clear | **Live testing starts here**, with the onboarding slice alone |

### M2 — catalog and scan

Tables, `resolve_scan`, barcode minting, the MusicBrainz adapter, the configuration
tables A-53 placed here, the starter chart (A-79). **Schema decisions due before the
D order:** Records and genres — Organization or Store (§4); the `release_cache`
shape stands (§11) unless an owner reopens it. **Candidate for after live testing**
— _recommended, not yet ratified_: the coverage check against real shelf stock
(§8 says *measured rather than assumed*; the trigger for switching providers can
be read once real stock is scanned). E-03 search and E-04 titlecard are the U
order; land `resolve_scan` first behind its contract — M3 and M4 both need it.

### M3 — receiving

PurchaseOrder and Invoice tables, the pricing helpers, `invoice_is_paid()` returning
`false` (A-41), `journal_batches` and `journal_lines` with `invoice_finalize`
writing its journal in the same transaction (A-67). **Schema decisions due before
the D order:** `invoice_number` and `SH-YYMMDD-n` across Stores (§4); bigint minor
units across PostgREST (M0 finding 10); the predicates' `pure` label against A-113.
**Candidate for after live testing:** the label print stylesheet, which the
receiving loop does not need to be exercised.

### M4 — the till

Sale functions, locking, counters, the sell screen, split tender, hold and re-open,
returns with routing. **Schema decisions due before the D order:** gift card
currency across Stores (A-51); whose void and which batch (§11). **Candidates for
after live testing** — _recommended, not yet ratified_, via `/plan-check` against
§8: gift cards, the customer ledger and E-07 as a whole, oversold items, the copy
picker. Each is a table group or a screen that a one-shop pilot can run without,
and each is cheaper to shape after a week of real sales than before.

**What this path does not do:** M5's close and receipts, M6's hardening, M7 and
M8. The cron drain's principal (§4) is therefore not on this path, but A-118 forces
it before the receipt job, so it is decided during M4 rather than after.

---

## 4. Open decisions

Three buckets. **Blocks deployment** means production cannot take real data
until it is answered. **Schema** means a table's shape depends on it, so it is
answered before the migration that creates or alters that table — the row names
which. Everything else **waits for live testing** and is listed so it is not lost,
not so it is worked now. Every row points at the record; nothing here is a decision.

### Blocks deployment

| Item | Record | Who | Due |
|---|---|---|---|
| **Who is the second owner?** CLAUDE.md names WaxyWaxman; assents and verdicts this month came from GimpyMatey. Until answered, every decision since A-119 is one owner's | this file | sr-talbot | Before any joint-review claim; before the contract pull request (step 2) |
| **Joint assent on A-119 to A-132, E-01 d38–d39, M-04 d39–d49, the A-91 amendment** | `architecture.md` §2 rows; the flows | the second owner | Before `/qa ready M1` |
| **Production's PostgREST `db-tx-end`** must be `commit` (no client override), or `Prefer: tx=rollback` reopens the PIN oracle A-129 closed. Unrecorded. Draft decision in [E-01-D-M1](orders/E-01-D-M1.md) Needs a human — _recommended, not yet ratified_ | order finding 31 | `/architecture`, then an owner reads the dashboard | Before `supabase db push` |
| **A System Administrator's `enrolment_open_until` is never closed by enrolling** — whoever reads that mailbox can add a passkey that signs in as `sysadmin` for the rest of the window. Draft decision: cleared by hand, recorded in the runbook — _recommended, not yet ratified_ | order finding 30; A-131 | `/architecture` | Before the first System Administrator enrols |
| **Runbook §2's hand steps**: invite and recovery templates reworded (they promise a password that no longer exists); email provider on and sign-up off; link lifetime ≤ 24 h; hook enabled; `pin_pepper` created; three System Administrators with passkeys; `store_create`'s body carries the first shop's values | [runbook](runbook.md) §2 | sr-talbot | In the runbook's order, after M1 merges |
| **E-01 D `Accepted`** — findings 14 and 33 are tests, not code; the order cannot close with a `should` finding that says a decision is untested | [E-01-D-M1](orders/E-01-D-M1.md) | developer, then an owner's verdict | Before `/qa ready M1` |

### Schema — decide before the migration that depends on it

| Item | Record | Decides the shape of | Due before |
|---|---|---|---|
| ~~**`organizations` has no `org_id`**~~ — **answered by A-135** (the root's `id` is its tenant key; no migration) — it uses `id` as its tenant, against A-86's *every table carries `org_id`*. Already on `main`; a later change is a correcting migration against live rows | order finding 20; A-86 | every Organization-dimensioned policy written from here on | `M-04-D-M1` |
| ~~**`drawer_opens` has no §6 writer**, though §8 builds the table at M1~~ — **answered by A-136**: with the print agent | §11; M1-contracts Needs a human | whether the table lands at M1 or waits for M4's till | `M-04-D-M1` |
| **The Store ID sequence** — *the next seven-digit value* (O-01 d2): where it starts, and global or per Organization; the fake starts at `1000001`, globally | [M1-contracts](orders/M1-contracts.md) Needs a human | `stores` and every `SH-…` identifier | `O-01-D-M1` |
| **Where a System Administrator's passkey enrolment is recorded** — A-117 and S-01 d7 give them an enrolment session, but `auth_user_link`'s passkey kind looks only in `users` | [M1-contracts](orders/M1-contracts.md) Needs a human; A-117, A-131 | `system_administrators` | `S-01-D-M1` |
| **Records, genres and the genre map — Organization or Store?** Blocked by `genres.section_id` and `product_tax_code_id` referencing per-Store rows | §11 (user model) | M2's catalog tables and their policies | `M2 D` |
| **`invoice_number` and `SH-YYMMDD-n` collide across Stores** against one Organization-level Supplier — key gains `store_id`, or the minted value carries it | §11 (user model); A-17, A-22, A-32 | M3's Invoice tables | `M3 D` |
| **Bigint minor units across PostgREST** — a `bigint` arrives in JSON as a string or loses precision | M0 finding 10 | every money column's wire type, from M3's first price | `M3 D` |
| **The predicates' `pure` label against A-113's *five exceptions and no others*** | this file (2026-10-30) | the header of every M3 function | `M3 D` |
| **Gift card currency across Stores** with different home currencies | §11; A-51, M-06 d34 | M4's gift card tables — if gift cards stay in M4 | `M4 D` |
| **Whose void is it, and which batch** — A-19 attributes a tender to the lock holder; a void is a later act | §11; M-03 d26 | `sales` and the close's batch keys | `M4 D` |
| **Under what principal the cron drain runs** — A-118 forces it before the receipt job: the service-role key reads no table, `jobs` included | §11; A-92, A-118 | `jobs` and its grants | `M5 D`, decided during M4 |
| **One Auth user is one email**, so a person at two Organizations cannot be invited to the second (A-132's accepted consequence names System Administrators only) | order finding 44 | whether the uniqueness is per table or across them — a constraint already on `main` | `M-04-U-M1`, when the screen shows `auth_user_in_use` |

### Waits for live testing

| Item | Record | Why it can wait |
|---|---|---|
| **An inactive Store picked by an Owner** gets `role_refused` / `owner` — the wrong key; the closed list has no state detail for it | order finding 9; conventions §5 | A key in the contract, not a table; one pilot shop has no inactive Store |
| **A PIN or initials held twice** raise raw `P0003` — failure, not a keyed refusal, and uncounted | order finding 34 | Unreachable while M-04's uniqueness holds |
| **`no_principal` reused** for the A-130 and A-131 refusals — _recommended, not yet ratified_ | order finding 36 | A key; ratify in the contract pull request or later |
| **conventions §5's `employee` row** does not list `auth_user_link` in *Raised by* | order finding 37 | A doc line |
| **A missing PIN while the line is closed** — the code answers `pin_refused`, records nothing | E-01 d38 open question | Behaviour at an edge no screen reaches yet |
| **The hook does not set `role` explicitly** on the store, person and enrolment paths | order findings 19, 38 | Defence in depth; `auth.users.role` is `authenticated` unless changed with the service key |
| **`enrolment_open_until` unbounded; readable Org-wide by every store session; an open enrolment session outlives its window by up to an hour** | order findings 39, 45 | Observations against a one-shop pilot |
| **`print_strict_params`** would put a PIN in a `P0003` detail if ever turned on | order finding 40 | Off by default; a one-line guard whenever the function is next touched |
| **A-129's guard is inline** — M-04 D copies it; a shared `authz` assertion and a suite-wide check would hold it as A-107 holds grants | order finding 41 | Do it in `M-04-D-M1`, where the second copy appears |
| **A personal session on a device holding a store session** | E-01 d27, A-88 | Practice, not code, until observed |
| **How an Owner reads every Store's rows on the Organization screen** | O-01 d4–d5; A-86, A-95 | The screen is post-v1 (A-111 leaves only Create Store at M1) |
| **How a migration-time write is attributed** | §11; A-53 | Production is never seeded (A-109); the first Organization comes through `organization_create` — likely moot, to be confirmed, not assumed |
| **Operator alerting and health**; **the paid Supabase plan and backups**; **A-96's `staging` branch**; **Sentry's allowlist and DSN**; **A-91's key-rule CI job** | §11; A-109; A-96; A-106 | M6 hardening's list |
| **The `release_cache` shape**; **a date-range report as an issuance** | §11 | M2 and M5 respectively, neither a blocker |
| **Auto-renew on `waxworks.store`** (off; expires 2027-10-13) | runbook | A year away; one dashboard switch |
| **Feature scope**: gift cards, the customer ledger and E-07, oversold items, the copy picker (M4); the coverage check (M2); the label stylesheet (M3) | §8 | Candidates for deferral — _recommended, not yet ratified_, through `/plan-check` |

---

## 5. Picking up cold

1. Read this file, then [`workflow.md`](workflow.md) §1–§3, then [`conventions.md`](conventions.md).
2. `git log --oneline -15` and the open pull requests: the state above may have moved.
3. `python scripts/check_docs.py` and `python scripts/check_coverage.py` — both must be clean before anything else is touched.
4. Open [`orders/M0-foundation.md`](orders/M0-foundation.md). Its **Findings** table is the record of the review — 39 rows, each marked — and its **Needs a human** list is where every `disputed` finding's question was collected. Read the Needs a human list before the table: it says who owns what, and most of it is not M0's.
5. Every session ends by updating **§2 and §3 of this file** and, if an order moved, its `Status:` line. A plan that says yesterday's state is the confident wrong answer this repository is built to avoid.

Tooling this machine needed and a fresh one will too: **Node 24** (CI's `NODE_VERSION`; `engines` requires ≥ 22), pnpm **11.0.9** (`packageManager` pins it; `corepack enable pnpm` under Node 24), Docker Desktop **running** — `supabase start` fails with an undescriptive daemon error otherwise and needs nothing else configured — Supabase CLI **2.117.0** (CI pins it; `scoop install supabase` on Windows, **not** `supabase-beta`), Python 3 for the check scripts. Vercel CLI is not needed; the project is linked to the GitHub repository.
