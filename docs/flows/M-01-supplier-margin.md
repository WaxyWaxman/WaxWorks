# M-01 — Suppliers

**Actor:** Employee, except **setting a margin** and **merging Suppliers**, which are manager-only ([architecture](../architecture.md) A-28a)
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
- Setting a margin is **manager-only** ([E-02](E-02-receive-inventory.md) d44, [architecture](../architecture.md) A-28a). Creating a Supplier is not — an Employee may add one at the receiving desk and leave it unpriced. E-02 d3's carve-out was struck in error and has been restored.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | A new Supplier's Discount defaults to **0%** |
| 2 | Changing a Supplier's Discount applies to **future receiving only** — it does not reprice InventoryItems already on hand |
| 3 | Discount is set **per Supplier**, not per category or per item |
| 4 | Every Supplier add, edit, copy, merge, and second-hand-default change is logged with who and when |
| 5 | Only one Supplier at a time may carry the second-hand-default flag ([E-02](E-02-receive-inventory.md) decision 27); setting it on one clears it from every other |
| 6 | ~~**Nothing here is manager- or admin-gated in an enforced sense.** New/Edit/Copy are plain Employee actions. Delete and Merge are labeled Admin-only for when real auth lands, but nothing today actually checks a role~~ — **superseded by 11**: this read the retirement of the *manager override* as ungating the flow, which [architecture](../architecture.md) A-28a expressly says it does not |
| 7 | ~~Discount and Margin are two distinct figures~~ — **superseded**: there is no separate Margin field. Discount is one figure that both describes what this Supplier charges off their own retail and drives the suggested-retail formula at receiving |
| 8 | **Suppliers opens on the most recently searched card**, not a fixed default or an empty state |
| 9 | **Merge reassigns every dependent pointer** (Invoice, PendingOrderLine, SupplierClaim, InventoryItem, a Record's preferredSupplierId) to the surviving Supplier rather than rewriting history |
| 10 | A Record carries an optional **Preferred Supplier**, a default only — the Supplier actually used is recorded per order line, not on the Record |
| 11 | **Setting a margin and merging Suppliers are manager-only; New, Edit and Copy are plain Employee actions. Supersedes decision 6.** [M-04](M-04-manage-users.md) d8 retired the *manager override* and amends M-04 d3 and d4 **for override-gated actions only** — it did not touch the **manager-only** set, which [architecture](../architecture.md) A-28a names these two members of expressly, and which the [lexicon](../lexicon.md) keeps as a separate term. A Manager authorizes in place by entering their own initials; both names are recorded (M-04 d3, d4). Whether **deleting** a Supplier joins that set is left open below |

## Open questions

- **Whether deleting a Supplier is manager-only.** Decision 11 settles margin and merge because [architecture](../architecture.md) A-28a names them; it leaves Delete alone because the same row gates "deletions" as an unnamed category, the [lexicon](../lexicon.md)'s *manager-only* entry lists four actions and omits deletions entirely, and [E-07](E-07-manage-customers.md) d12 explicitly ungates deleting a **Customer**. Either A-28a means a narrower set than it reads, or E-07 d12 contradicts it — that is one decision, and it belongs to whoever settles the category rather than to this flow.

- Does changing a Supplier's Discount reprice existing stock retroactively, or future intake only? Decision 2 answers this — future receiving only.
- Is there a floor/ceiling or MAP (minimum advertised price) constraint?
- **Multi-store:** are Suppliers shared across stores or per-store?
- Minimum order qty/amount and Cancel-by aren't consumed by anything yet — they're captured here for M-02 (placing and tracking orders) to read once that's built.
