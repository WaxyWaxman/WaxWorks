# Wax Works — build status

**Maintained by:** the coordinator, from merged pull requests. Read by `/qa ready`.

One row per [architecture](../architecture.md) §8 milestone and track. A row is
filled in only when the pull request that lands it is **merged** — never from a
branch, never from a conversation. "Both landed" is what makes a milestone's
register rows eligible for `Automated` ([workflow](workflow.md) §3 step 7).

| Milestone | Track | Work orders | Landed in | Contract commit | Both landed |
|---|---|---|---|---|---|
| M0 Foundation | joint | [M0-foundation](orders/M0-foundation.md) — `Accepted` 2026-10-13 | [#176](https://github.com/WaxyWaxman/WaxWorks/pull/176), [#177](https://github.com/WaxyWaxman/WaxWorks/pull/177), [#180](https://github.com/WaxyWaxman/WaxWorks/pull/180), [#182](https://github.com/WaxyWaxman/WaxWorks/pull/182); verdict [#188](https://github.com/WaxyWaxman/WaxWorks/pull/188) | `98d3efd` (#180) — the last change to `packages/contracts` | 2026-10-13 — one joint track; row 13 `Deferred` |
| M1 Tenancy and identity | D | [E-01-D-M1](orders/E-01-D-M1.md) — `Accepted` 2026-10-31; [M-04-D-M1](orders/M-04-D-M1.md) — `In review`; S-01 D, O-01 D and the seed order not yet drafted | E-01 D: [#221](https://github.com/WaxyWaxman/WaxWorks/pull/221), [#225](https://github.com/WaxyWaxman/WaxWorks/pull/225), [#230](https://github.com/WaxyWaxman/WaxWorks/pull/230); verdict [#231](https://github.com/WaxyWaxman/WaxWorks/pull/231) | E-01 D built against `19a49ed` (#208); the M1 contract change `5ea9522` (#235) came after it, so its register rows are `Stale` until re-read | — |
| M1 Tenancy and identity | U | | | | |
| M2 Catalog and scan | D | | | | |
| M2 Catalog and scan | U | | | | |
| M3 Receiving | D | | | | |
| M3 Receiving | U | | | | |
| M4 Till | D | | | | |
| M4 Till | U | | | | |
| M5 Close, receipts, review | D | | | | |
| M5 Close, receipts, review | U | | | | |
| M6 Hardening | joint | — | | | |
| M7 Payables (A-39) | D | | | | |
| M7 Payables (A-39) | U | | | | |
| M8 The general ledger (A-80) | D | | | | |
| M8 The general ledger (A-80) | U | | | | |

**Columns.** *Work orders* — the `docs/build/orders/` files, each `Accepted`.
*Landed in* — the merged pull request numbers. *Contract commit* — the
`packages/contracts` commit both tracks were built against; a later change to it
sends the milestone's register rows `Stale`. *Both landed* — the date the second
track merged, which is the date `/qa ready` may pass.

Post-v1 milestones (M-02, M-04 Add and Deactivate, M-06 screens, M-07's functions
and screens, the print agent) are added here as rows when §8 places them — not
before. **M-08 was added on 2026-09-18 when A-80 placed it**; A-79 had already
moved [M-07](../flows/M-07-chart-of-accounts.md)'s *tables* forward into M2 and
M3, where A-67 required them, leaving only its functions and screens post-v1.
