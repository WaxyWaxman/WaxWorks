# E-04 — Manage the inventory

**Actor:** Employee (some actions manager-only)
**Status:** Stub — awaiting flow
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md)

**Job:** As an employee, I need to _TBD_.

---

## Flow

_TBD_

## Requirements

_TBD_

## Inherited from E-02

E-02 defers several things here. These are committed requirements, not open questions:

- **Void or amend a finalized invoice** — manager-only. Finalized invoices are immutable, so an amendment is appended as a separate artifact against the original record rather than editing it.
- **Return / credit claim against an invoice** — an employee can flag an invoice as needing one during receiving; the handling lives here.
- **Deferred line problems** — an employee may skip a problem item during receiving and resolve it here instead.

## Open questions

- What does "manage" cover — add new items, edit details, adjust quantities, re-grade condition, change price, mark damaged/lost, move bin location?
- Can an employee set or change prices outside of receiving, or is that manager-controlled?
- How are used records taken in (buying from the public / trade-in / consignment)? Is that in scope for v1?
- Is there a physical stock-take / cycle-count workflow?
- How is negative inventory (see E-05) reconciled once the stock is properly received?
