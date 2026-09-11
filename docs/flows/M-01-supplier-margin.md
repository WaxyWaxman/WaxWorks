# M-01 — Suppliers

**Actor:** Employee, except **setting a margin** and **merging Suppliers**, which are manager-only ([architecture](../architecture.md) A-28a)
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [M-02 Re-order](M-02-reorder-inventory.md) · [M-05 Accounts payable](M-05-accounts-payable.md)

**Job:** As an employee, I need a record of every Supplier — how to order from them, what they cost, and how to reach them — so receiving, ordering, and claims all have somewhere to point.

---

## Flow

1. Employee opens **Suppliers** from the top menu. The screen is the till's **three tracks** (decision 12): a retractable Supplier slab, the open card, and the ledger. It opens on the card for whichever Supplier was **most recently searched** — not a fixed default — so picking back up where you left off doesn't cost a re-search.
2. A search box filters the Supplier list by name, short code, or account #. Selecting a result opens its card and becomes the new "most recently searched."
3. **New** opens a blank form with every field below; **Edit** opens the same form pre-filled for the selected Supplier; **Copy** duplicates a Supplier under a new id (name suffixed "(copy)", second-hand-default cleared, log reset) as a fast start for a near-identical one. None of these three requires anything beyond being logged in as an Employee.
4. **Delete** removes a Supplier outright — labeled Admin-only, not enforced. **Merge** combines two Supplier records: every Invoice, PendingOrderLine, SupplierClaim, and InventoryItem pointing at the merged-away Supplier is repointed to the survivor, and a Record's `preferredSupplierId` follows too. History is not rewritten, only repointed — also labeled Admin-only, not enforced.
5. Every add, edit, copy, merge, and second-hand-default change is appended to that Supplier's log: who, what, when.
6. The **ledger track** carries what is in flight with the Supplier, the outstanding accounts-payable figure, trade over the last 12 months, and recent intake — in that order (decision 14). Every row in it opens the thing it names on the screen that owns it (decision 18).

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
| Billing address | Where payment is remitted. Line 1, line 2, city, province/state (2-letter), country — the same shape a Customer address carries ([E-07](E-07-manage-customers.md)) |
| Shipping address | Where stock ships from — the address a claim is argued against. Same five fields, behind a **Same as billing address** tick that mirrors billing and locks them (decision 13) |
| Second-hand default | Not a form field — set from the Supplier's card via **Make 2nd-hand default**. Only one Supplier carries it at a time; setting it on one clears it from every other ([E-02](E-02-receive-inventory.md) decision 27) |

A Record's **Preferred Supplier** (set from its titlecard, [E-04](E-04-manage-inventory.md)) is only a default suggestion — the Supplier actually used is recorded on each Invoice/order line, so the same title can be bought from different Suppliers over time without rewriting history.

## Requirements

- Any Employee can New, Edit, or Copy a Supplier — nothing here requires a manager or admin action to actually go through.
- A fresh Supplier's Discount defaults to **0%** until edited.
- Merge repoints every dependent record to the surviving Supplier; it never leaves a dependent record pointing at a Supplier id that no longer exists.
- Every change to a Supplier is logged with who performed it and when.
- **Discount is the one gated field on the card.** Every other field saves on change; Discount requires a Manager, because it is the margin (decisions 7, 11, 13).
- **Shipping address never silently diverges from billing.** While *Same as billing address* is ticked the shipping fields mirror it and are locked, and editing billing moves them with it (decision 13).
- **The accounts-payable figure on this screen is read-only and derived** — the rows behind it, and every action against them, live in [M-05](M-05-accounts-payable.md) (decisions 16, 18).
- **Received and Sold are stated on their own bases and say so.** Received is cost of goods; the A/P figure is Invoice totals; Sold excludes copies with no Invoice behind them and counts the exclusion (decision 14).

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
| 12 | **Suppliers is laid out as the till's three tracks.** The frame becomes [E-05](E-05-sell-a-record.md) d29's, by way of [E-02](E-02-receive-inventory.md) d38 and [E-07](E-07-manage-customers.md) d17 — a retractable Supplier slab, the open card, and the ledger, each scrolling on its own, the frame never scrolling; the screen loses its page heading and description as the other fixed-frame screens did. The slab **pushes** rather than overlays, for [E-03](E-03-search-inventory.md)'s reason: the list and the card are read against each other. Shut it is a 52px strip carrying New, Search with a result count, and the cards actually opened, tiled by **short code** rather than initials — that code is the Supplier's identity on every invoice they send. The search covers name, short code and account number, all three, as step 2 already said. Below 1180px the ledger drops to a 58dvh bottom strip, matching E-07 d17's allowance for a track with two fixed bands above its scroll |
| 13 | **The card is the edit surface, with one exception.** Following [E-07](E-07-manage-customers.md) d13 and d18, every field saves on change and New opens a blank card rather than a modal — **except Discount**, which is the margin field (decision 7 as superseded) and stays manager-only (decision 11, [E-02](E-02-receive-inventory.md) d44, [architecture](../architecture.md) A-28a); a Manager authorizes in place with their own initials and both names are recorded ([M-04](M-04-manage-users.md) d3, d4). Accepted consequence: one field on the card behaves unlike every other field on it, so it is drawn locked rather than left to surprise someone. The card also carries **two addresses** — billing and shipping — with a **Same as billing address** tick that mirrors shipping onto billing and **locks** those fields; editing billing while it is ticked moves shipping with it, and unticking leaves the copied values behind as a starting point. A mirrored field that stays typable is one that silently stops mirroring, which is why the lock is part of the decision rather than a styling choice. Nothing consumes either address yet: billing is captured for [M-05](M-05-accounts-payable.md), shipping for [E-04](E-04-manage-inventory.md) claim correspondence |
| 14 | **The ledger track carries, in order: what is in flight with them, outstanding accounts payable, trade over 12 months, and recent intake.** In-flight sits *above* the money for [E-07](E-07-manage-customers.md) d19's reason — a draft Invoice, an overdue PurchaseOrder line and a Pending claim all go stale silently, and this is the screen where that stops being true. It is **grouped by kind — drafts, then orders, then claims — oldest first inside each, capped at three rows and scrolling**, with the per-kind counts in its label so the cap can never hide that a claim exists. The group order is a priority order: a draft is ours to finish, a PurchaseOrder is theirs to ship, a claim is theirs to answer. **Received is cost of goods** — `subtotal + freight + misc`, inbound tax excluded ([architecture](../architecture.md) A-29, [E-02](E-02-receive-inventory.md) d34) — not the Invoice total, and the track says which it is, because the A/P figure above it *is* Invoice totals and the two bases differ on purpose. Any margin shown states the unallocated-freight caveat ([M-03](M-03-daily-summary.md), E-02 d34's accepted consequence). Copies with no Invoice behind them — an oversold copy minted straight from a Sale ([E-05](E-05-sell-a-record.md) d21), or stock predating the system — are **excluded from Sold and the exclusion is counted on the figure** rather than hidden. A foreign-currency Supplier shows its own currency; the store equivalent needs the configured rate ([M-06](M-06-settings.md)) and is not invented |
| 15 | **The card's primary action is a ladder: open the draft Invoice, else process the pending order stream, else start an intake.** Mirrors [E-07](E-07-manage-customers.md) d20's shape and its reasoning — the thing that goes stale silently outranks the thing that does not. **Record a payment** rides underneath as a secondary for a Manager where there is a balance, the slot E-07 d20 gives its own secondary |
| 16 | **An Employee may *view* a Supplier's outstanding accounts-payable figure and trade totals; every accounts-payable *action* remains manager-only.** The [lexicon](../lexicon.md)'s **manager-only** entry defines it as "an action an Employee cannot perform at all" — about performing, not about seeing — so this fills a gap rather than reversing [M-05](M-05-accounts-payable.md) d2 or [architecture](../architecture.md) A-28a. It is written down because the next person reading "manager-only in its entirety" will otherwise reach the opposite conclusion. Recording a payment, applying a claim credit, creating a manual entry and clearing entries all stay where they are. M-05 carries the mirror of this |
| 17 | **The slab bands by accounts-payable state only when it is sorted by it.** A–Z is the default and is a look-up by name; a band across it splits the alphabet in two, so the name being looked for is in one of two places instead of one — a cost with no matching benefit. Under the **Outstanding A/P** sort the split *is* the ordering, so the band is free, and the **Owing** chip covers wanting only that set. [E-07](E-07-manage-customers.md) d17's rule still applies on top: a band that does not actually split the list does not render |
| 18 | **The ledger track carries the accounts-payable figure, not the rows behind it, and every row in the track is a way in.** [M-05](M-05-accounts-payable.md) d3 already shows outstanding Invoices, Pending claims and manual entries in one combined list per Supplier, and it is the screen that can act on them; restating those rows here would mean two places to read the same facts with only one able to do anything about them. The figure links through instead. On the same principle, a draft or past Invoice opens in **Receiving** — deep-linkable, and opening as it was finalized ([E-02](E-02-receive-inventory.md) d36, [architecture](../architecture.md) A-27) — a PurchaseOrder line opens in **What's on Order** ([M-02](M-02-reorder-inventory.md)), and a claim opens in **Claims** ([E-04](E-04-manage-inventory.md)) |

## Open questions

- **Whether deleting a Supplier is manager-only.** Decision 11 settles margin and merge because [architecture](../architecture.md) A-28a names them; it leaves Delete alone because the same row gates "deletions" as an unnamed category, the [lexicon](../lexicon.md)'s *manager-only* entry lists four actions and omits deletions entirely, and [E-07](E-07-manage-customers.md) d12 explicitly ungates deleting a **Customer**. Either A-28a means a narrower set than it reads, or E-07 d12 contradicts it — that is one decision, and it belongs to whoever settles the category rather than to this flow.

- Does changing a Supplier's Discount reprice existing stock retroactively, or future intake only? Decision 2 answers this — future receiving only.
- Is there a floor/ceiling or MAP (minimum advertised price) constraint?
- **Multi-store:** are Suppliers shared across stores or per-store?
- **Per-Supplier trade totals are a first step onto a reporting surface the [PRD](../PRD.md) §7 defers.** "Trend and margin reporting beyond the daily close" is listed there as out of scope and "a reporting surface of its own". Two figures on a Supplier card is not that surface, but when it is built these two must agree with it — recorded here so whoever builds it knows they already exist.
- **What a Supplier "year" is.** Decision 14 fixes the window at a rolling 12 months rather than the this-year / last-year / lifetime [E-07](E-07-manage-customers.md) d19 gives a Customer, because nothing on record says whether a Supplier year is calendar or fiscal. That belongs to the reporting surface above, not to this flow.
- **Whether a Supplier address is one entity or two.** Decision 13 stores billing and shipping separately behind a mirror tick. Whether a Supplier can carry more than two — several warehouses shipping under one account — is unasked and unanswered.
- Minimum order qty/amount and Cancel-by aren't consumed by anything yet — they're captured here for M-02 (placing and tracking orders) to read once that's built.
