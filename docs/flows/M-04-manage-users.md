# M-04 — Add/remove employees or managers

**Actor:** Manager
**Status:** Stub — awaiting flow
**Related:** [E-01 Authenticate](E-01-authenticate.md)

**Job:** As a manager, I need to control who has access to the system and at what level.

---

## Flow

_TBD_

## Requirements

_TBD_

## Inherited from other flows

Several flows depend on a **manager override** mechanism. Whatever this flow defines for roles has to support it:

- **E-02:** pricing below cost; adjusting an invoice total beyond ±2%; voiding a finalized invoice.

## Open questions

- Can a manager create another manager, or is there an owner/admin tier above?
- Deactivate vs hard delete — historical transactions must stay attributed to the person who made them.
- Is there an invite flow (email) or does the manager set credentials directly?
- How is a manager override performed in practice — the manager logs in at the terminal, enters a PIN, approves remotely?
- **Multi-store:** can a user belong to several stores? Can a manager administer more than one?
