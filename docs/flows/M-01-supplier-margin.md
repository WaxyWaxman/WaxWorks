# M-01 — Suppliers

**Actor:** Employee (Delete/Merge labeled Admin-only by convention, not enforced)
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [M-02 Re-order](M-02-reorder-inventory.md)

**Job:** As an employee, I need a record of every Supplier — how to order from them, what they cost, and how to reach them — so receiving, ordering, and claims all have somewhere to point.

---

## Flow

1. Employee opens **Suppliers** from the top menu. It opens on the card for whichever Supplier was **most recently searched** — not a fixed default — so picking back up where you left off doesn't cost a re-search.
2. A search box filters the Supplier list by name, short code, or account #. Selecting a result opens its card and becomes the new "most recently searched."
3. **New** opens a blank form with every field below; **Edit** opens the same form pre-filled for the selected Supplier; **Copy** duplicates a Supplier under a new id (name suffixed "(copy)", second-hand-default cleared, log reset) as a fast start for a near-identical one. None of these three requires anything beyond being logged in as an Employee.
4. **Delete** removes a Supplier outright — labeled Admin-only, not enforced. **Merge** combines two Supplier records: every Invoice, PendingOrderLine, SupplierClaim, and InventoryItem pointing at the merged-away Supplier is repointed to the survivor, and a Record's `preferredSupplierId` follows too. History is not rewritten, only repointed — also labeled Admin-only, not enforced.
5. Every add, edit, copy, merge, and second-hand-default change is appended to that Supplier's log: who, what, when.

## Fields

| Field | Notes |
|---|---|
| Short name | 4-letter code, used on Invoices (e.g. `FAB1`) |
| Full name | |
| Account # | |
| Order via | `Phone` \| `Email` \| `FTP` \| `Their Website` \| `Fax` \| `Rep` |
| Minimum order qty | An order is "ready to place" once it hits this **quantity**. `0` means quantity doesn't gate it — readiness falls back to the minimum **amount** instead |
| Minimum order amount / basis | Only consulted when qty is `0`. Priced at either `Retail` or `Net` — the basis is its own dropdown |
| Discount | % off **this Supplier's own retail**. One figure, doing double duty: it's also the multiplier in the suggested-retail formula at receiving ([E-02](E-02-receive-inventory.md) decision 8): `suggested_retail = round_up(list_price x (1 + discount / 100))`. There is no separate Margin field |
| Cancel-by | Default days from order-placed to auto-cancel if unfulfilled. Blank means this Supplier doesn't support it. Overridable per individual order (M-02) |
| Currency | |
| Type | `Used` \| `Bargain` \| `New` — default `New` |
| Notes | Free-form, visible to all staff |
| Email | Where orders/claims are sent |
| Backorders allowed | Y/N |
| Rep name / Rep phone / Main phone | |
| Second-hand default | Not a form field — set from the Supplier's card via **Make 2nd-hand default**. Only one Supplier carries it at a time; setting it on one clears it from every other ([E-02](E-02-receive-inventory.md) decision 27) |

A Record's **Preferred Supplier** (set from its titlecard, [E-04](E-04-manage-inventory.md)) is only a default suggestion — the Supplier actually used is recorded on each Invoice/order line, so the same title can be bought from different Suppliers over time without rewriting history.

## Requirements

- Any Employee can New, Edit, or Copy a Supplier — nothing here requires a manager or admin action to actually go through.
- A fresh Supplier's Discount defaults to **0%** until edited.
- Merge repoints every dependent record to the surviving Supplier; it never leaves a dependent record pointing at a Supplier id that no longer exists.
- Every change to a Supplier is logged with who performed it and when.

---

## Inherited from E-02

- Discount drives the suggested retail price at receiving: `suggested_retail = round_up(list_price x (1 + discount / 100))`, applied to the supplier's **pre-discount list price** (decisions 8, 31 — there is no separate Margin field).
- A Supplier can be flagged **default for second-hand** (decision 27) — this is what Receiving pre-selects when Second-hand intake mode is chosen. There is no dedicated second-hand Supplier; this is a plain field on an ordinary Supplier record.
- Nothing about a Supplier is manager-gated (decision 30) — decision 3's old "employees never set margins" carve-out is retired.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | A new Supplier's Discount defaults to **0%** |
| 2 | Changing a Supplier's Discount applies to **future receiving only** — it does not reprice InventoryItems already on hand |
| 3 | Discount is set **per Supplier**, not per category or per item |
| 4 | Every Supplier add, edit, copy, merge, and second-hand-default change is logged with who and when |
| 5 | Only one Supplier at a time may carry the second-hand-default flag ([E-02](E-02-receive-inventory.md) decision 27); setting it on one clears it from every other |
| 6 | **Nothing here is manager- or admin-gated in an enforced sense.** New/Edit/Copy are plain Employee actions. Delete and Merge are labeled Admin-only for when real auth lands, but nothing today actually checks a role |
| 7 | ~~Discount and Margin are two distinct figures~~ — **superseded**: there is no separate Margin field. Discount is one figure that both describes what this Supplier charges off their own retail and drives the suggested-retail formula at receiving |
| 8 | **Suppliers opens on the most recently searched card**, not a fixed default or an empty state |
| 9 | **Merge reassigns every dependent pointer** (Invoice, PendingOrderLine, SupplierClaim, InventoryItem, a Record's preferredSupplierId) to the surviving Supplier rather than rewriting history |
| 10 | A Record carries an optional **Preferred Supplier**, a default only — the Supplier actually used is recorded per order line, not on the Record |

## Open questions

- Does changing a Supplier's Discount reprice existing stock retroactively, or future intake only? Decision 2 answers this — future receiving only.
- Is there a floor/ceiling or MAP (minimum advertised price) constraint?
- **Multi-store:** are Suppliers shared across stores or per-store?
- Minimum order qty/amount and Cancel-by aren't consumed by anything yet — they're captured here for M-02 (placing and tracking orders) to read once that's built.
