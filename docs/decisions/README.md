# Architecture Decision Records

An ADR records a decision that **binds flows not yet written** — persistence,
tenancy, offline strategy, authentication, barcode symbology. Decisions local to a
single flow stay in that flow's decision table instead.

Numbers are permanent, like flow IDs. A reversal is a new ADR that supersedes the
old one; the superseded record stays in place with its status updated.

Start from [`../templates/adr-template.md`](../templates/adr-template.md), or run
`/architecture`.

| # | Decision | Status | Constrains |
|---|---|---|---|
| _none yet_ | | | |

## Candidates

Decisions already visible in the PRD that are not yet written up:

- **Internal barcode scheme** — UPC-A under GS1 number system `2`. Written up in
  PRD §4.3, marked recommended but not ratified. Promote to an ADR on ratification.
- **Multi-store tenancy model** — decided in principle (PRD §6), but the scoping
  questions under "Multi-store consequences" are open.
- **Offline behaviour at the till** — PRD §5, undecided, and the largest structural
  fork in the system.
