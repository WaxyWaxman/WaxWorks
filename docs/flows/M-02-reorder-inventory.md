# M-02 — Re-order inventory

**Actor:** Manager
**Status:** Stub — awaiting flow
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md)

**Job:** As a manager, I need to restock what's selling before it runs out.

---

## Flow

_TBD_

## Requirements

_TBD_

## Inherited from E-02

- **Discogs metadata prefetch happens here.** When a purchase order is placed, the system fetches catalog metadata for the ordered titles in bulk, so receiving mostly hits the local database instead of calling the API per scan.
  - Note: Discogs has no bulk-barcode endpoint, so this is N calls throttled to ~60/min — a background job, not an instant operation. A 300-line PO takes roughly five minutes.
  - The prefetch only covers stock ordered through the system. Second-hand buys, unsolicited items, and everything received before there is PO history will still miss, so live lookup at the receiving desk remains a supported fallback.
- **Backorders are tracked.** The supplier's `Balance` column represents units owed; their lifecycle needs defining here.

## Open questions

- Does the system suggest reorders (reorder points, velocity-based), or is it manual?
- Does it generate and send a purchase order to the supplier, or just produce a list?
- Do backorders auto-match when they arrive on a later invoice? Can they be cancelled? Do they suppress duplicate reorder suggestions?
- Used/one-off stock can't be reordered — does this apply only to new/distributed titles?
