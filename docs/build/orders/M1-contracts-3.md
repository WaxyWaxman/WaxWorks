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
| 1 | Done | `M1:915` describe *M-04 d46 — no role change for a deactivated person, promotion or demotion, Employee included; reactivate first* | `M-04 d46 —` describe: 1 passed, 0 failed | `fake/identity.ts`: `if (!u.active)` replaces d44's promotion-only check, after the same-role no-op |
| 2 | Done | `M1:934` describe *M-04 d47 — reactivation is refused for someone already active, and takes a new PIN only on decision 40's clash* (3 tests) | `M-04 d47 —` describe: 3 passed, 0 failed | Both refusals are raised before anything is written; `pinTaken` (a non-refusing check) now backs `pinClash` too |

## Findings

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|

## Verdict

**Accepted** | **Returned** — _coordinator, date_

### Needs a human

- _None raised while drafting._
