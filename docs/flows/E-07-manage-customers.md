# E-07 — Manage customers

**Actor:** Employee (nothing here is gated)
**Status:** Specified
**Related:** [E-05 Point of Sale](E-05-sell-a-record.md) · [E-06 Process a return](E-06-process-a-return.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md)

**Job:** As an employee, I need to look someone up so I can attach them to a sale, hold something for them, give them their discount, or settle what's owed between us.

**Scope note:** this flow answers PRD §6's open question — **there is a Customer record.** It exists because holds, special orders, store credit, discounts, and receipt-less returns all need somewhere to hang.

---

## Flow

1. Employee opens **Customers** from the top menu. It opens on the card for whichever Customer was **most recently searched or added** — not a fixed default.
2. A search box filters the Customer list by **name, email, or phone** — not account number, since that's a separate, staff-editable field an Employee is more likely to type into the card itself once they've found the right person.
3. Selecting a result opens its card and becomes the new "most recently searched." **New** opens a blank form with every field below; on submit the new Customer becomes the open card.
4. Every field on an open card — including account number — is **edited in place**, directly on the card. There is no separate Edit function; the card itself is the edit surface.
5. **Delete** removes a Customer outright. Past Sales keep their own record of what happened; they simply no longer point at a Customer.
6. From the card, or from a Sale, the Employee can attach the Customer to the transaction in hand.

A Customer is never required. Most Sales are walk-in and anonymous ([E-05](E-05-sell-a-record.md) d20).

---

## Fields

| Field | Notes |
|---|---|
| **Primary ID** | Internal, permanent, incremental. Never reused, never edited, never even shown as editable — it's the one field on the card that isn't a live input. |
| **Account number** | Store-facing reference. Employee-editable in place, must stay unique. |
| **Account type** | e.g. Regular, Staff, Business. |
| **Name** | |
| **Phone**, **Email** | |
| **Contact preference** | Which channel to use when their order arrives — consumed by the hold timeline in [E-05](E-05-sell-a-record.md). |
| **Mailing address** | Line 1, line 2, city, province/state (2-letter), country. |
| **Global discount** | Percentage, pre-filling the line discount on their Sales; a changed line discount always overrides it ([E-05](E-05-sell-a-record.md)). |
| **Default tax line** | Optional override pointing at a line in the tax table, including an exempt line. Covers wholesale buyers, other stores, and out-of-province shipping. Overrides the item's tax line at the till. |
| **Note** | Free-form, visible to every Employee. |
| **A/R balance** | See below. Not directly editable — derived from movements. |
| **History** | Sold items only, most recent first: title, Sale number ("invoice #"), date. |

---

## A/R balance

A Customer's balance is a **single signed figure**, because money can run in either direction:

| Sign | Meaning | Arises from |
|---|---|---|
| **Positive** | The store owes the Customer — store credit | A `Used Credit` counter buy settled to credit, a Return refunded to credit, gift value assigned to their name |
| **Negative** | The Customer owes the store | An outbound customer invoice issued to a business account and not yet paid |

Store credit is drawn down (or added to) by the **Account Balance** tender at the till, which goes either direction ([E-05](E-05-sell-a-record.md)).

> **Naming.** Store credit is technically a *liability* the store owes, so "accounts receivable" only describes the negative-balance half of this field — but "A/R balance" is the name in use, and a single signed figure still beats two fields that can never both be non-zero.

---

## Business customers and outbound invoices

Some Sales go to other businesses rather than over the counter, and those need an **invoice**, not a till receipt. An outbound **customer invoice** is a Sale rendered as a business document — addressed to the Customer, carrying their account number and terms — and settled later against their account balance rather than tendered on the spot.

This is distinct from a supplier **Invoice** ([E-02](E-02-receive-inventory.md)), which is inbound. Both are invoices in the ordinary business sense; the lexicon qualifies which is meant.

---

## Requirements

- A Customer's identity must survive edits to their account number — history hangs off the permanent Primary ID.
- Nothing here is gated; New/Delete and every field edit are plain Employee actions. Deleting must not orphan a past Sale; it just stops pointing at a Customer.
- A Customer's A/R balance is derived from the movements against it, not typed in directly.
- Contact preference must be reachable from a hold, so the Employee chasing it knows how to make contact.

---

## Inherited from other flows

**From [E-05](E-05-sell-a-record.md):**

- Attaching a Customer pre-fills their global discount and default tax line onto Sale lines.
- The **Account Balance** tender moves the A/R balance either direction (draw down or add to) and requires a Customer.
- A `Used Credit` counter buy may settle to store credit rather than cash.
- A **Held** Sale in the Customer's name is surfaced on their card with its hold reference and age, and is the first rung of the card's action ladder (d19, d20). The age comes from the hold timeline; no threshold is applied to it here.

**From [E-06](E-06-process-a-return.md):**

- A refund may be settled to store credit instead of cash.

**From [M-02](M-02-reorder-inventory.md):**

- A Customer may be attached to an order line; on receipt this becomes a **Held** Sale in their name.
- Open customer-attached lines are listed on the card carrying M-02's own status — Pending and Ordered derived from whether a PO number exists, Shipped (with the supplier's expected date), Backordered, and Cancelled as set ([M-02](M-02-reorder-inventory.md) d12, d22).

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | **There is a Customer record**, settling PRD §6 open question 1 |
| 2 | A Customer is optional on every Sale; anonymous walk-in is the default case |
| 3 | ~~Customer ID is permanent and internal~~ — **superseded by 11**: renamed Primary ID, still permanent and internal |
| 4 | The A/R balance is a **single signed figure** — positive is store credit owed to them, negative is owed to the store |
| 5 | The balance is derived from movements, never entered directly |
| 6 | A Customer carries a global discount that pre-fills line discounts and is overridable per line |
| 7 | A Customer may carry a **default tax line** that overrides the item's at the till |
| 8 | Contact preference is a field, consumed by the hold timeline when an order arrives |
| 9 | ~~Deletion is manager-only~~ — **superseded by 12**: nothing here is gated |
| 10 | **Outbound customer invoices** exist for business accounts and are settled against the A/R balance rather than tendered |
| 11 | The permanent internal key is called **Primary ID**, not Customer ID — an ascending integer, never shown as editable |
| 12 | **Nothing about a Customer is gated.** Search/New/Delete and every field edit are plain Employee actions |
| 13 | **There is no separate Edit function.** Every field on an open card — account number included — is a live input; changes save directly, no modal, no confirm step |
| 14 | **Search covers name, email, and phone — not account number.** Account number is found by opening the right card, not by searching for it |
| 15 | **Customers opens on the most recently searched or added card**, not a fixed default or an empty state |
| 16 | **History lists sold items only** (qty > 0 item lines from tendered Sales) — title, Sale number, date — not Returns or non-tracked/gift-card lines |
| 17 | **Customers is laid out as the till's three tracks.** The frame becomes [E-05](E-05-sell-a-record.md) d29's, by way of [E-02](E-02-receive-inventory.md) d38, which made the same move for Receiving — a retractable customer slab, the open card, and the account — each scrolling on its own, the frame never scrolling; the screen loses its page heading and description, as the other fixed-frame screens did. The slab **pushes** rather than overlays, for [E-03](E-03-search-inventory.md)'s reason rather than the till rail's: the list and the card are read against each other, so an overlay would cover the half being compared to. Shut it is a 52px strip carrying New, Search with a result count, and the cards actually opened. Customers with something waiting to collect **band above everyone else**, the way Find's slab bands by stock state — it is the only state a Customer can be in that anyone has to act on — and a **Waiting** chip filters to that band, sitting apart from the account-type chips because a live state and a stored field are two axes rather than five equivalent things. The sort applies inside the bands, not across them. Below 1180px the account track drops to a bottom strip. Accepted consequence: that strip carries more fixed chrome than the till's or Find's — a waiting band *and* a balance head — so it is allotted 58dvh against their 42–46dvh, and the card above it gives up that height |
| 18 | **New opens a blank card in the middle track, not a modal. Refines decision 13.** d13 made the card the edit surface; a modal rendering the same fields a second time is that rule stopping one step short. The blank card shows Primary ID as assigned-on-save and disables Delete; Name and a unique account number are its only required fields. A search matching nothing offers **New customer named "…"** with the typed text already in the Name field, because that is the counter sequence — you look someone up first and only then discover they need creating |
| 19 | **The account track carries, in order: what is waiting for them, the signed balance, standing, the two till-affecting fields, on-order lines, and recent sales.** Waiting — Held Sales and customer-attached order lines, each with its age and the Customer's contact preference — sits *above* the balance, because a hold does not expire and nothing else chases it ([E-05](E-05-sell-a-record.md) d7): this screen is where "a hold nobody has chased is otherwise invisible" stops being true. The balance keeps the second slot as the figure that can be wrong in a way that costs money, but renders small and grey at zero rather than spending the top of the track on it — most Customers never carry one. **Standing** is spend this year, spend last year, and lifetime with a sale count, answering PRD G-4 and the Manager's "top customers by quantity or life-time value". It is **reporting only**: the moment it becomes tiers, thresholds, or automatic discounts it has crossed **NG-2**, which says there is no loyalty program. Global discount and default tax line move off the card and under the balance, because those three together are what describe a Customer as a *counterparty* rather than as a person. Accepted consequence: the card becomes two surfaces, and someone hunting for the discount will look on the card first |
| 20 | **The card's primary action is a ladder: open a Held Sale, else attach to the Sale in flight, else start a new Sale.** A Customer with something on the hold shelf outranks an anonymous Sale at the till, because the hold is the one that goes stale silently; where both exist the attach is offered underneath as a secondary rather than dropped. **Merging an in-flight Sale into a Held Sale is explicitly not part of this** and is left open — it is a new operation that has to say which lock survives ([E-05](E-05-sell-a-record.md) d23), which reference survives (d3), and what becomes of the absorbed Sale's log. The recorded move, opening the hold and ringing the extra copies onto it, already puts everything in one transaction |

---

## Open questions

- **Terms on outbound invoices.** Net 30, due dates, and whether anything chases an overdue business account is unspecified — this is the receivables side of the same problem [M-05](M-05-accounts-payable.md) solves for payables.
- **Duplicate customers.** Two records for the same person is inevitable at a counter. Merging them — as suppliers can be merged — isn't specified.
- **Data protection.** The record holds name, address, email, phone, and purchase history. Retention, export, and deletion-on-request obligations are unaddressed.
- **Want lists.** PRD §6 mentions want-lists as a reason a customer record might exist; nothing here implements one.
- **Credit limit.** A business account can currently run an unbounded negative balance.
- **Sorting the list.** Decision 17 bands the list but does not order it. The record carries a single **Name** field, so sorting by surname means guessing the final token — which files *Left Bank Cafe (wholesale)* under W. Three ways out: sort the whole string; split the field into given and family name, which leaves every Business card with an empty one; or keep one name field and add an optional **file-under** name, the way a record shop already alphabetises *Beatles, The*. Undecided.
- **When a hold looks overdue.** [E-05](E-05-sell-a-record.md) d7 records that a hold's age is tracked, not a threshold at which it should start looking wrong. Decision 19 states the age and leaves the judgement to whoever reads it; if the band should change colour at *n* days, *n* needs a row.
- **Where the standing figures come from, and who should see them.** Decision 19 records the figures without saying whether they are derived per view or maintained as running totals. PRD G-4 frames customer value as a Manager/Admin job, while decision 12 says nothing about a Customer is gated — so they are shown to Employees, on a counter screen a customer can read over the Employee's shoulder. Same tension [E-03](E-03-search-inventory.md) settles for cost with a toggle.
- **Whether the balance's movements are meant to be visible.** Decision 5 derives the balance from movements; nothing says the movements themselves are shown. The card shows them, on the grounds that a figure with no explanation is one staff distrust — but that is an inference, not a recorded requirement.
