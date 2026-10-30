# Work order — M1 contracts, second pull request (joint)

**Flow:** none — a follow-up contract pull request for [M-04](../../flows/M-04-manage-users.md) d39–d44 and architecture A-120; the flows are [M-04](../../flows/M-04-manage-users.md) and [E-01](../../flows/E-01-authenticate.md)
**Milestone / track:** M1 / joint — no track; `packages/contracts` is neither D's nor U's (conventions §5)
**Status:** Accepted
**Approved by:** sr-talbot, 2026-10-30 — in session, after reading the Checklist; **both** owners review the pull request (workflow §4: *a change to `packages/contracts`*)
**Pull request:** [#204](https://github.com/WaxyWaxman/WaxWorks/pull/204) — merged `f7401f6` before its review finished; the review's tests and findings in [#205](https://github.com/WaxyWaxman/WaxWorks/pull/205) (`fd2ea91`)
**Register rows:** none made automatable by this order alone. It changes the contract the M1 **D** and **U** orders build against, after [M1-contracts](M1-contracts.md) (`Accepted`, contract commit `0ea11aa`).

## Scope

Bring `packages/contracts` up to the decisions made after the M1 contracts order closed:

- **A-120's arguments for `manager_authorize_pin`.**
- **`user_reactivate`'s new PIN** (M-04 d40).
- **The fake's behaviour** for M-04 d43 and d44.
- **Tests that cite** M-04 d39, d41 and d42, which the fake already holds without naming them.

This order writes `packages/contracts/` and `tests/contracts*.test.ts`. It writes **no** migration and no screen. It is built interactively with `/develop`, because the `developer` subagent's hook refuses `packages/contracts/`.

**Contract entries changed:**
- `manager_authorize_pin`: input gains `p_actor_user_id` and `p_actor_initials`.
- `user_reactivate`: input gains `p_pin`.
- `user_change_role`, `user_reset_request`, `user_invite_resend`: fake behaviour only; their inputs and outputs are unchanged.

**Reading list:**
- [conventions](../conventions.md) §3.3 and §5;
- `architecture.md` §2 A-113, A-119 and A-120;
- [M-04](../../flows/M-04-manage-users.md) decisions 19, 28, 32, 33 and 39–44;
- [E-01](../../flows/E-01-authenticate.md) d26 and d31.

**`_TBD_` conventions this order hits:** none. M-04 d44's refusal reuses `invalid_state`, with the detail `inactive` — see row 6.

**Out of this order:** M-04 d45 (a demotion ends a personal session). It is the access-token hook's behaviour (A-87), so it belongs to `/architecture` and then the M1 **D** order, not a contract.

## Checklist

| # | Decision | Binds this order because | Evidence required |
|---|---|---|---|
| 1 | A-120 — _"`manager_authorize_pin` takes the staff session's actor beside the PIN: `p_pin`, `p_terminal_id`, and `p_actor_user_id` with `p_actor_initials`, both null together when no staff session is open on the terminal; when given they are verified as a store session's header verifies them, and recorded on a refused PIN's row. They attribute and never authorize — the PIN alone decides whom it names."_ | The input schema gains the pair, null together. In the fake: a verified pair is recorded on the refusal row; a non-verifying pair refuses `actor_mismatch` **before** the PIN is checked, so it neither counts nor reaches the record | unit — the pair is recorded on a refused PIN; a non-verifying pair is `actor_mismatch` and not counted; one null without the other is `invalid_input` |
| 2 | A-113 — _"The uniform header (§6, A-103) has five named exceptions, and no others"_ — as amended by A-120 (*"its exceptions stay five; this one's argument list grows"*) | `tests/contracts.test.ts`'s exception list and `manager_authorize_pin`'s shape test | unit — exactly five exceptions still; the shape test names the four keys |
| 3 | M-04 decision 40 — _"Reactivation prompts for a new PIN when a Manager's or Owner's has been given to someone else at one of their Stores, exactly as it prompts for new initials."_ | `user_reactivate` gains `p_pin`. With no PIN on a clash, it refuses `pin_clash` (unnamed, logged, M-04 d32). With a PIN, that PIN is clash-checked, set and logged as changed. A PIN given for an Employee is refused, as at Add | unit — no `p_pin` on a clash is a logged `pin_clash`; a fresh `p_pin` reactivates with it; a clashing `p_pin` is refused |
| 4 | M-04 decision 43 — _"Any promotion into Manager or Owner sends the invite while the person has never enrolled a passkey — Manager to Owner included."_ | The fake's `invite` on `user_change_role`: true on Employee → Manager, Employee → Owner and Manager → Owner while `passkey_enrolled_at` is null; never on a demotion | unit — a never-enrolled Manager promoted to Owner is invited, with the address; an enrolled one is not |
| 5 | M-04 decision 42 — _"A promotion may carry a new email address; when it changes the address, the change is logged before and after, and the invite row names where the invite went."_ | Already in the fake (order M1-contracts, finding 14); its test cites the finding, not the decision | unit — the existing test, named for d42 |
| 6 | M-04 decision 44 — _"A promotion, Send reset and Re-send invite are refused for a deactivated Manager or Owner; reactivate first."_ | The fake refuses all three for an inactive person: `invalid_state`, detail `inactive`. The key is the table's *wrong state for the act*, so no new key is needed | unit — each of the three refused for a deactivated Manager; accepted after reactivation |
| 7 | M-04 decision 39 — _"A demotion to Employee clears the person's PIN, and a demotion sent with a PIN is refused."_ | Already in the fake; its tests say *"not yet an M-04 row"* (order M1-contracts, finding 23) | unit — the existing tests, re-pointed to d39; the comments cite the row |
| 8 | M-04 decision 41 — _"A Manager may set the PIN of a Manager or Owner who shares any one of the Manager's Stores, even if that person also holds others."_ | Already in the fake as a placeholder (`fake/identity.ts`, *"Placeholder, not specified"*); now decided | unit — a Manager at A sets the PIN of an Owner at A and B; refused for an Owner at B only |

## Evidence

_Written by the developer. One row per Checklist row, in the same order._

_Developed interactively with `/develop` on 2026-10-30 (sr-talbot pairing). `M1` = `tests/contracts-m1.test.ts`, `C` = `tests/contracts.test.ts`. **Red first:** with the tests written and nothing implemented, `pnpm test:repo` → `Tests  17 failed | 510 passed (527)` — every new behaviour, plus the existing calls the stricter inputs now refuse (after one false start: a patch left six calls with an extra `)`, which failed the file's parse; fixed before the red run counted). **Green:** `pnpm test` → `Tests  527 passed (527)`; `pnpm typecheck` and `pnpm lint` → no errors; `check_docs.py` → `0 error(s), 10 warning(s)`. **Mutants:** removing d44's refusal and narrowing d43's invite to *from Employee* → `2 failed | 525 passed (527)`, the d43 and d44 tests. Each row's quote is from `vitest run tests/contracts-m1.test.ts tests/contracts.test.ts --reporter=verbose` → `Tests  462 passed (462)`._

| # | State | Test (name and `file:line`) | Run output | Note |
|---|---|---|---|---|
| 1 | Done | `M1:746` describe *A-120 — manager_authorize_pin takes the staff session's actor beside the PIN; it attributes and never authorizes*: the pair recorded on a refusal; both null records none; a non-verifying pair is `actor_mismatch` six times with no record and the line still open; one of the pair alone is `invalid_input`; the PIN alone names the result | `A-120 —` describe: 5 passed, 0 failed | The pair is checked by the fake's store-session `actor()`, before the terminal and the PIN (A-103's order) |
| 2 | Done | `C:267` *the non-pure functions without the full header are exactly the five exceptions*; `C:277` *manager_authorize_pin takes p_pin, p_terminal_id and the staff session's actor pair (A-120)* | `A-113 —` describe: 9 passed, 0 failed | The exception test now compares the shared header's own field schemas, not key names: `manager_authorize_pin` names all three keys for an attribution-only pair and stays an exception |
| 3 | Done | `M1:783` describe *M-04 d40 — reactivation prompts for a new PIN …* (4 tests); `M1:641` *M-04 d40, E-01 d26 — reactivation without a new PIN refuses one another Manager took meanwhile* | `M-04 d40`: 5 passed, 0 failed | A fresh PIN is logged as `pin_set`, never as a value; an Employee given one is `invalid_state` / `employee_has_no_pin`, as at Add |
| 4 | Done | `M1:822` describe *M-04 d43 — any promotion into Manager or Owner invites someone who has never enrolled, Manager to Owner included* | `M-04 d43 —` describe: 2 passed, 0 failed | Promotion is upward in M-04 d25's order (Employee, Manager, Owner); Owner → Manager never invites |
| 5 | Done | `M1:724` *M-04 d42 — a promotion that changes the email logs it before and after, and the invite row names the address* | `✓ … > M-04 d42 — a promotion that changes the email logs it before and after, …` (1 passed) | Renamed from the M1 order's finding 14; the behaviour was already there |
| 6 | Done | `M1:841` describe *M-04 d44 — a promotion, Send reset and Re-send invite are refused for a deactivated Manager or Owner; reactivate first* | `M-04 d44 —` describe: 1 passed, 0 failed | `invalid_state` / `inactive`; a demotion of a deactivated person is not a promotion and d44 does not name it, so it is not refused |
| 7 | Done | `M1:620` describe *M-04 d39, E-01 d26 — a demotion to Employee clears the PIN, …*; `M1:633` *M-04 d39 — a demotion given a PIN is refused, …* | `M-04 d39`: 2 passed, 0 failed | Comments in `fake/identity.ts` and `user_change_role.ts` now cite d39 |
| 8 | Done | `M1:859` describe *M-04 d41 — a Manager may set the PIN of a Manager or Owner who shares any one of the Manager's Stores* | `M-04 d41 —` describe: 1 passed, 0 failed | The fake already behaved so; the *Placeholder, not specified* comment now cites d41 |

## Findings

_Written by reviewers (`qa-reviewer`, `architect`), 2026-10-29, against `contracts/m1-followup` at `3ae52be`. **No finding blocks this order.** **The reviewers' run** (qa-reviewer): `pnpm test` → `Test Files  12 passed (12)` / `Tests  527 passed (527)`; the two contract files, verbose → `Tests  462 passed (462)`; `pnpm typecheck`, `pnpm lint` → every member `Done`; `check_docs.py` → `0 error(s), 10 warning(s)`; `check_coverage.py --order` → `8/8 checklist rows accounted for; 0 error(s)`. Not run: database suites (no migration), Playwright, the Evidence's mutants. The architect's own run of the two contract files → `462 passed (462)`._

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|
| 1 | architect, qa-reviewer | M-04 d40 vs A-119; conventions §5 | `fake/identity.ts:364–367`; `docs/architecture.md:207`; `docs/build/conventions.md:335` | M-04 d40 has reactivation's PIN clash logged (d32), and the fake keeps the log, but A-119 lists the refusals whose record is kept as *"the PIN-clash check at Set PIN, Assign and a promotion"* only. A **D** body built to conventions §5 would `raise` at `user_reactivate` and roll the log back. The architect drafted an A-n adding reactivation (Needs a human) | **blocking for the M1 D order** — a decision missing; not for this order | — `/architecture` |
| 2 | qa-reviewer | A-113 (row 2) | Evidence row 2 | The quoted *10 passed* does not reproduce: the describe has 9 (the count matched one test of another describe also titled *A-113 —*) | non-blocking | `fixed` — 9 |
| 3 | qa-reviewer, architect | M-04 d40, d32 | `tests/contracts-m1.test.ts` (d40 describe) | A fresh `p_pin` that also clashes asserts the refusal, not d32's log | non-blocking | `fixed` — `M-04 d40, M-04 d32 — a fresh PIN at reactivation that clashes too is refused unnamed, and logged` (passed on first run: the behaviour was there) |
| 4 | qa-reviewer | M-04 d43 | `tests/contracts-m1.test.ts:822–838` | Employee → Owner while never enrolled is untested | non-blocking | `fixed` — `M-04 d43 — an Employee promoted straight to Owner is invited while never enrolled` (passed on first run) |
| 5 | qa-reviewer, architect | M-04 d44 | `tests/contracts-m1.test.ts:841–856`; `fake/identity.ts:308` | Only a deactivated Manager is tested; d44 names Owners too. The fake also refuses promoting a deactivated **Employee**, which d44's text does not name, and allows demoting a deactivated person, which it does not mention | non-blocking | `fixed` for the Owner — `M-04 d44 — Send reset and Re-send invite are refused for a deactivated Owner too`; the Employee and demotion cases are an M-04 question (Needs a human) |
| 6 | qa-reviewer | A-120, E-01 d31 | `tests/contracts-m1.test.ts:189` | No test shows a line closed by pad refusals carrying a verified pair puts that actor on the flag | non-blocking | `fixed` — `A-120, E-01 d31 — five refusals at the pad with a verified pair close the line, and the flag names that staff session` (passed on first run) |
| 7 | qa-reviewer | A-120 (*"recorded on a refused PIN's row"*) | `fake/state.ts:74` | The refusal row records the staff session's user id, not its initials; whether A-120's *they … recorded* means both is a reading question. E-01 d31 asks for *the Employee*, which the id answers | observation (suspicion) | |
| 8 | architect, qa-reviewer | M-04 d40 | `fake/identity.ts:364–372` | `p_pin` is accepted, and set, when nothing clashes — and `user_reactivate` is not refused for a person already active — so it is a second Set PIN door, Owner-only (M-04 d30) with the same authority. d40 speaks only of the clash | observation | M-04 question (Needs a human) |
| 9 | architect | A-120 *Consequences accepted* | `fake/identity.ts:239` | A caller can attribute pad guesses to any colleague whose initials they know; `actor_mismatch` versus `pin_refused` confirms an (id, initials) pair, as `actor_resolve` already does. A-120 accepts the trust initials carry | observation | |
| 10 | architect | — | the order's header; M-04 d39–d45 | Dated 2026-10-30, the UTC date; the local date of the session was 2026-10-29 | observation | the M-04 rows are merged; left as recorded |
| 11 | qa-reviewer | register | `docs/qa/e2e-register.md` | M-04 has no rows for decisions 39–45; E-01-T19 (the pad naming the open staff session) should cite A-120; M-04-T3, T9, T16, T19 are extended by d39–d44 and not contradicted, so none goes `Stale` | non-blocking | `/qa register M-04` |
| 12 | `/code-review` | A-98 (*the function is the enforcement point*); A-120 | `fake/identity.ts:239` | The fake reads a null `p_actor_user_id` as *no staff session* without checking `p_actor_initials`, so it leans on the wrapper's `refine` for A-120's *null together*. A **D** body copying it would not assert the rule the database must | non-blocking | |
| 13 | `/code-review` | A-120 | `fake/state.ts:74` | Same reading question as 7, from the shape side: the refusal row the **D** track will copy has no column for the initials | observation | with 7 |
| 14 | `/code-review` | — | `fake/identity.ts:372` and the two other PIN-setting handlers | Setting a PIN and logging `pin_set` is written out in `user_set_pin`, `user_change_role` and `user_reactivate`; one `Ctx` helper would keep the three logging alike | observation (cleanup) | |

_`/code-review`, 2026-10-29, against #204 as merged (`f7401f6`): its other five findings are 1 (A-119), 5 and 8 (the unspecified d40/d44 readings — under CLAUDE.md's *do not invent requirements*), and 3–6 (the untested cases, fixed in this verdict's pull request)._

## Verdict

**Accepted** — sr-talbot, 2026-10-29. *Entered on sr-talbot's instruction in session ("accepted") by the coordinator: the judgement is sr-talbot's, the typing is not (workflow §4).*

- **Checklist:** 8 of 8 rows accounted for, every one `Done` (`check_coverage.py --order` → 0 errors).
- **No blocking finding against this order**; the reviewers' own run green (Findings, above). The review's four missing tests landed in [#205](https://github.com/WaxyWaxman/WaxWorks/pull/205).
- **#204 merged before this verdict** (`f7401f6`), the fourth time a contract pull request has; branch protection is the owners' call.
- **Finding 1**, which blocked the M1 **D** order, is answered by **A-121** (ratified 2026-10-29): reactivation's PIN clash joins A-119's kept refusals.
- **The contract commit** the M1 **D** and **U** orders build against is `main` at #205's merge (`fd2ea91`), with A-121 a documents-only change after it.
- **No `Deferred` row.**

### Needs a human

- _None raised while drafting._

_Raised by the review, 2026-10-29:_

- ~~**Before the M1 D order — `/architecture`:** add reactivation's PIN clash to A-119's refusals whose record is kept (finding 1). The architect's draft, _Status: recommended, not yet ratified_: *"Reactivation's PIN clash is a refusal the record must keep. A-119's list becomes: the PIN resolution, and the PIN-clash check at Set PIN, Assign, a promotion and a reactivation (`pin_clash`, M-04 d32, d40)"* — `user_reactivate` then returns `jsonb`, its clash check before any write; amends A-119, conventions §5 and §9's row.~~ — **answered by A-121**, ratified 2026-10-29 by sr-talbot.
- **`/flow-clarify M-04`:** does d44 refuse promoting a deactivated **Employee**, and may a deactivated person be demoted (finding 5)? May `p_pin` be given at reactivation when nothing clashes, and is reactivating an active person refused (finding 8)?
- **`/qa register M-04`:** rows for d39–d45; A-120 added to E-01-T19's citations (finding 11).
