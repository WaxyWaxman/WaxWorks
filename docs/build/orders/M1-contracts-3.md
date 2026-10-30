# Work order — M1 contracts, third pull request (joint)

**Flow:** none — a follow-up contract pull request for [M-04](../../flows/M-04-manage-users.md) d46 and d47
**Milestone / track:** M1 / joint — no track; `packages/contracts` is neither D's nor U's (conventions §5)
**Status:** In review
**Approved by:** sr-talbot, 2026-10-29 — in session, after reading the Checklist; **both** owners review the pull request (workflow §4: *a change to `packages/contracts`*)
**Pull request:** _once opened_
**Register rows:** none made automatable by this order alone. It changes the fake the M1 **U** order builds against, after [M1-contracts-2](M1-contracts-2.md) (`Accepted`).

## Scope

Bring the in-memory fake up to M-04 d46 and d47, which the M1-contracts-2 review raised and `/flow-clarify M-04` settled on 2026-10-29. **Fake behaviour only:** no input or output schema changes. The functions are `user_change_role` (d46) and `user_reactivate` (d47).

This order writes `packages/contracts/src/fake/` and `tests/contracts-m1.test.ts`, with comments in `packages/contracts/src/identity/` where they describe these rules. It is built interactively with `/develop`.

**Reading list:** [M-04](../../flows/M-04-manage-users.md) decisions 19, 40, 44, 46 and 47; conventions §5's refusal table (`invalid_state`); A-121, for the order of reactivation's checks.

**`_TBD_` conventions this order hits:** none. Both refusals reuse `invalid_state`, the table's *wrong state for the act*, as d44's did: detail `inactive` for d46, and `active` and `pin_not_needed` for d47.

## Checklist

| # | Decision | Binds this order because | Evidence required |
|---|---|---|---|
| 1 | M-04 decision 46 — _"No role change for a deactivated person: a promotion or a demotion of anyone deactivated — Employee, Manager or Owner — is refused; reactivate first."_ | The fake refuses a promotion of an inactive person today (d44), but not a demotion. Any change of role for an inactive person is refused `invalid_state` / `inactive` | unit — a deactivated Manager's demotion and a deactivated Employee's promotion are each refused; both are accepted after reactivation |
| 2 | M-04 decision 47 — _"Reactivation is refused for someone already active, and takes a new PIN only where decision 40's clash requires one: a PIN given when none clashes is refused, and changing a PIN stays Set PIN's."_ | Today the fake reactivates an active person and accepts `p_pin` with no clash. Now an active person is refused `invalid_state` / `active`, and a `p_pin` given where the person's own PIN clashes nowhere is refused `invalid_state` / `pin_not_needed`, **before** anything is written | unit — reactivating an active Manager is refused; a `p_pin` with no clash is refused and the PIN is unchanged; d40's clash path is still accepted with a fresh PIN |

## Evidence

_Written by the developer. One row per Checklist row, in the same order._

_Developed interactively with `/develop` on 2026-10-29 (sr-talbot pairing). `M1` = `tests/contracts-m1.test.ts`. **Red first:** with the tests written and nothing implemented, `pnpm test:repo` → `Tests  3 failed | 532 passed (535)`: the d46 test, and two of the three d47 tests (the third, d40's clash path, passed already). **Green:** `pnpm test` → `Tests  535 passed (535)`; `pnpm typecheck` and `pnpm lint` → 0 errors. Each row's quote is from `vitest run tests/contracts-m1.test.ts tests/contracts.test.ts --reporter=verbose`._

| # | State | Test (name and `file:line`) | Run output | Note |
|---|---|---|---|---|
| 1 | Done | `M1:915` describe *M-04 d46 — no role change for a deactivated person, promotion or demotion, Employee included; reactivate first* | `M-04 d46 —` describe: 1 passed, 0 failed (at review; 2 after the review added the deactivated Owner's case) | `fake/identity.ts`: `if (!u.active)` replaces d44's promotion-only check, after the same-role no-op |
| 2 | Done | `M1:934` describe *M-04 d47 — reactivation is refused for someone already active, and takes a new PIN only on decision 40's clash* (3 tests) | `M-04 d47 —` describe: 3 passed, 0 failed | Both refusals are raised before anything is written; `pinTaken` (a non-refusing check) now backs `pinClash` too |

## Findings

_Written by reviewers (`qa-reviewer`, `architect`), 2026-10-29, against `contracts/m1-third`. **No blocking finding.** **The reviewers' run** (qa-reviewer): `pnpm test` → `Tests  535 passed (535)`; `pnpm typecheck`, `pnpm lint` → exit 0; `check_docs.py` → `0 error(s), 10 warning(s)`; `check_coverage.py --order` → `2/2 checklist rows accounted for; 0 error(s)`; the contract files, verbose → `Tests  470 passed (470)`, d46 1 and d47 3 passed. Not reproduced: the red-first run (it needs the implementation reverted). The architect's run: `-t "M-04 d4[67]"` → `4 passed`. **Both checked the PIN-oracle question and found none:** `pin_not_needed` is decided only from the person's **own old** PIN, before any `p_pin` is tested, so a caller cannot choose the digits tested; the one fact it returns unlogged — nobody holds this deactivated person's current PIN — is not a d32 probe._

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|
| 1 | qa-reviewer, architect | M-04 d46 (*"Employee, Manager or Owner"*) | `tests/contracts-m1.test.ts` (d46 describe) | A deactivated Owner's demotion is untested — the one case where the Owner floor used to interact with `active` | non-blocking | `fixed` — *a deactivated Owner's demotion is refused too* |
| 2 | qa-reviewer | M-04 d46 | same | The test checked only the Manager's role after the refusals, not the Employee's, nor that nothing was logged | observation | `fixed` — both roles checked, and the log's length unchanged by the refusals |
| 3 | qa-reviewer, architect | A-121 | `fake/identity.ts:168` | `pinClash`'s comment had come loose above `pinTaken`, and its list omitted reactivation | observation | `fixed` — moved, and reactivation added (A-121) |
| 4 | architect | A-119, A-121 | `fake/identity.ts:362–377` | The fake's order is right — in reach, `active`, initials (raised), `employee_has_no_pin`, `pin_not_needed`, `pin_clash` (returned, logged), writes — but A-121 fixes only where the clash check sits. A database that ran `pin_clash` before `active` or `pin_not_needed` would write d32's clash log for an act d47 refuses outright | non-blocking — **a Checklist row for the M1 D order** | |
| 5 | qa-reviewer, architect | M-04 d46; d26 | `fake/identity.ts:308–314` | A same-role call on a deactivated person returns success and writes nothing, before the `inactive` check — consistent with d46 (*"a promotion or a demotion"*), and the D order should write nothing too. The Owner floor's `u.active &&` can no longer be false there | observation | |
| 6 | architect | conventions §5 (`invalid_state`: *what state*) | `fake/identity.ts:364, 375` | The `invalid_state` details — `inactive`, `active`, `pin_not_needed`, `employee_has_no_pin`, `no_store` — exist only in the fake and order prose. Screens will branch on them and **D** will copy them | non-blocking | conventions §5 (Needs a human) |
| 7 | architect | M-04 d44, d47 | `fake/identity.ts:441–459` (unchanged) | Not specified: is Set PIN allowed on a **deactivated** Manager or Owner? It decides whether d47's *"two acts"* can run in either order | open question | M-04 (Needs a human) |
| 8 | qa-reviewer | M-04 d47 | — | Not specified: what the screen does when a resubmitted PIN is refused `pin_not_needed` because the clash went away between the prompt and the resubmit | open question | M-04 (Needs a human) |
| 9 | qa-reviewer | register | `docs/qa/e2e-register.md` | No row asserts M-04 d40, d44, d46 or d47; M-04-T3 (d19) still holds | non-blocking | `/qa register M-04` |
| 10 | architect | M-04 d35, d47 | `fake/identity.ts:375` | A Manager with no PIN — a state d35 forbids but the fake does not rule out — would reactivate with none, any `p_pin` refused as not needed. Should be unreachable; untested | observation | |
| 11 | `/code-review` | — | `fake/identity.ts:317` | The Owner floor's `u.active &&` is dead since d46's check precedes it (finding 5's second half, as cleanup) | observation (cleanup) | |
| 12 | `/code-review` | M-04 d47 | `fake/identity.ts:381` | `before.active` in reactivation's log is always `false` now; written as data, it reads as though a reactivation could start active | observation (cleanup) | |
| 13 | `/code-review` | — | `fake/identity.ts:385` | Setting a PIN and logging `pin_set` is still written out in three handlers (the M1-contracts-2 order's finding 14) | observation (cleanup) | |

_`/code-review`, 2026-10-29, against #208 at `83bc615`: nothing blocking; its other four findings are 10 (the PIN-less Manager), 5 (the same-role call), 7 (Set PIN on a deactivated person) and 6 (the `invalid_state` details)._

## Verdict

**Accepted** | **Returned** — _coordinator, date_

### Needs a human

- _None raised while drafting._

_Raised by the review, 2026-10-29:_

- **The M1 D order's Checklist:** assert `user_reactivate`'s full order of checks (finding 4), not only A-121's part of it; and write nothing on a same-role call (finding 5).
- **Conventions §5:** list the `invalid_state` details screens may branch on, or say `detail` is advisory (finding 6).
- **`/flow-clarify M-04`:** Set PIN on a deactivated person (7); the screen's answer to `pin_not_needed` after a clash disappears (8).
- **`/qa register M-04`:** rows for d39–d47 (9).
