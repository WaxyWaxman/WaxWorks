# Wax Works — build status

**Maintained by:** the coordinator, from merged pull requests. Read by `/qa ready`.

One row per [architecture](../architecture.md) §8 milestone and track. A row is
filled in only when the pull request that lands it is **merged** — never from a
branch, never from a conversation. "Both landed" is what makes a milestone's
register rows eligible for `Automated` ([workflow](workflow.md) §3 step 7).

| Milestone | Track | Work orders | Landed in | Contract commit | Both landed |
|---|---|---|---|---|---|
| M0 Foundation | joint | — | | | |
| M1 Tenancy and governance | D | | | | |
| M1 Tenancy and governance | U | | | | |
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

**Columns.** *Work orders* — the `docs/build/orders/` files, each `Accepted`.
*Landed in* — the merged pull request numbers. *Contract commit* — the
`packages/contracts` commit both tracks were built against; a later change to it
sends the milestone's register rows `Stale`. *Both landed* — the date the second
track merged, which is the date `/qa ready` may pass.

Post-v1 milestones (M-02, M-04 Add and Deactivate, M-06 screens, M-07, the print
agent) are added here as rows when §8 places them — not before.
