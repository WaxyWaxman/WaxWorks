# WaxWorks — Product Scope

WaxWorks is the point-of-sale / inventory-management side of the Mr Wax project (the companion piece is the home-collector cataloging app; the two share a data backend but are separate applications). This document covers everything **except Receiving**, which is being scoped separately and will be merged in once both sides settle on a general flow.

Throughout this doc, a **"card"** means one instance/record of a given category — e.g. a specific inventory item is a **titlecard**, a specific supplier is a **supplier card**, etc.

---

## Core concepts (apply across every module below)

These are cross-cutting decisions made during scoping — worth reading before the module sections, since several modules assume them.

### Titlecards

**A titlecard = one condition/price variant, not one physical disc.** A titlecard represents a specific release at a specific condition and price. Multiple physical copies that match exactly (same release, same condition, same price) share a single titlecard and a quantity count. A uniquely-graded used copy simply has a titlecard with qty 1.

**Each titlecard stands alone once created.** **Copy** exists to quickly spin up a new titlecard pre-filled with most of an existing one's information (the usual case: a second copy of the same album in different shape) — but the result is a fully independent card. Editing a titlecard only ever affects that card.

**Sale lines snapshot their own values.** When an item is sold, the transaction stores the price, condition, and title *as they were at the time of sale*. Editing or deleting a titlecard later never rewrites what past sales say they sold for.

### Identifying and scanning items

There are two ways an item resolves to a titlecard, and both are in play at once — staff scan whatever is physically on the item.

**1. Manufacturer barcode (the UPC printed on the sleeve).** Stored at the *release* level and shared by every titlecard for that release, so it is a **lookup key, not a unique identifier**. Scanning it:
- If exactly one titlecard matches → opens it directly. This is the common case and the primary interaction throughout the app.
- If several match (same album, multiple conditions) → shows a short pick-list of the matching titlecards with condition, price, and qty on hand, and staff selects one.

**2. Store-printed label.** An internal code (**Code 128**, encoding the titlecard's ItemID) that resolves to exactly one titlecard with no pick-list. Condition and price are printed as **human-readable text on the label**, not encoded into the barcode itself — so staff can read it at a glance, and re-grading or re-pricing doesn't require the code to change.

Store labels aren't optional in practice: most pre-1980 vinyl and many indie pressings carry no manufacturer barcode at all, so used stock generally needs one.

Two other things are entered through the same barcode field at POS:
- **Gift cards**, whose codes are prefixed `GC` (see Gift Cards below).
- **Non-inventory SKUs**, which are just titlecards with short typed codes like `FREIGHT` (see Track Inventory below).

### Discogs as reference data

Release-level fields (artist, label, catalog #, format, genre, etc.) are fetched from Discogs and cached locally. Titlecard-specific fields (condition, price, on-hand qty, store label) live per-titlecard.

**Search is local-first.** A search queries local inventory and Discogs simultaneously and shows both, but anything already in local inventory displays as *our* titlecard rather than the Discogs version — we don't re-fetch or duplicate an edition we've already catalogued. Results group under the release, with our titlecards nested beneath it as variants (condition / price / qty) and any Discogs-only match shown as a separate catalogue row that isn't in stock.

**Acting on a Discogs result creates a local titlecard.** Any interaction with a catalogue-only result (ordering it, editing it, stocking it) pulls it into local inventory, auto-filling every field it can from Discogs and prompting for the ones it can't — supplier, condition, and anything else store-specific. Custom titles not in Discogs can still be created from scratch via **New**.

If Discogs is unreachable or rate-limited, local inventory search and all POS functions continue to work; only catalogue results are unavailable.

### Classification: genre and section

Every titlecard has a **Genre** (where the item lives in the store) and a **Section** (the broad category it reports under — VINYL, MERCH, etc.). Genre rolls up into Section: all music genres sit under VINYL, while tote bags and shirts sit under MERCH, so end-of-day gives an easy top-level breakdown while later Reporting can drill into specific genres.

Discogs' genre taxonomy is mapped to our own classification via an editable **genre map**. On first import the map takes an educated guess at our genre/section; if it guesses wrong, staff can either correct the map (fixing all future imports) or just override that individual titlecard.

Non-inventory items (freight, gift cards, services) get their own sections so they don't muddy the merchandise breakdown.

### Pricing

Three separate money fields per titlecard:
- **List Price** — MSRP, seeded from Discogs metadata on import.
- **Price** — what we actually sell it for. Initialized from List Price, so a discount off list is visible at a glance.
- **Last Received Cost** — what we last actually paid, set during Receiving.

Final pricing is normally settled at **Receiving**, since that's where the real cost and the sell price needed for margin are known, but Price stays editable on the titlecard afterwards.

**A Price of 0.00 means "ask at the register"** — adding that item to a sale prompts staff for a price. Useful for freight, one-off services, and bargain-bin items priced on the spot.

### Track Inventory

A per-titlecard checkbox, **on by default**. When switched off, the item sells indefinitely with no quantity tracking, no on-hand math, and no low-stock reporting — for things bought in bulk where the exact count doesn't matter (buttons, stickers) and for non-inventory SKUs like `FREIGHT`.

### Inventory quantity lifecycle

```
Pending Order  →  (Process)  →  Total On Order  →  (Receiving)  →  On Hand
                                                                      ├─ on the floor (derived)
                                                                      └─ Qty in Backroom
```

- **Pending Order** — requested but not yet placed with a supplier (no PO yet). Can still be attached to a customer.
- **Total On Order** — placed with a supplier (has a PO), not yet received.
- **Available On Order** — the portion of Total On Order *not* attached to a specific customer (i.e., stock being ordered for the shelf).
- **On Hand** — everything physically in the store, floor stock **and** Backroom combined.
- **Qty in Backroom** — how many of the On Hand units are in the back. Floor stock is simply the remainder and isn't tracked as its own field; if the last copy sells and it was supposedly in the backroom, the system assumes staff walked back and got it, and decrements both without complaint.
- **Available On Hand** — On Hand minus Items Held (and, later, minus anything pulled for an in-progress return).
- **Minimum On Hand** — a per-titlecard flag for desired reorder floor. Purely informational for now; a future Reporting feature will surface titles below this floor (not auto-triggering reorders in v1).

### Staff accounts & roles

Two roles for now: **Admin** and **Staff**. No passwords yet (planned for later) — staff "log in" by entering their initials, which stays active for a 15-minute session on that terminal; if no one's actively logged in, sensitive actions prompt for initials on the spot.

A **terminal** is a browser session on a device — so two browsers on the same physical machine count as two terminals, each with its own staff session.

**Admin-only actions:** hard-adjusting On Hand via Inventory Edit, access to Order Processing, access to Accounts Payable, access to the Gift Card registry, Undo End-of-Day, Delete (Inventory/Suppliers/Customers), and Merge (Suppliers).

### Currency

Settings supports defining currency shorthand codes (CAD, USD, GBP, etc.) with conversion rates, so supplier costs in foreign currency can be converted to store-currency for margin/cost calculations.

### Numbering schemes

PO numbers, Supplier Claim numbers, and sales Invoice numbers each auto-generate ascending from 0, checked for uniqueness against history, with the option for staff to enter one manually.

Held transactions carry a temporary **H-prefixed** number (H1, H2…) to make clear they aren't real invoices. When a hold is tendered into a sale it receives a proper invoice number; the original H-number is retained on the transaction for traceability. A voided invoice **keeps** its number — gaps in the sequence would look like missing paperwork, so a voided-but-numbered invoice is the honest record.

---

## Inventory

On entry: show the last-searched (or most recently added) titlecard.

**Functions**
- **Search** — keyword search (album, artist, song title, label) across local inventory and Discogs simultaneously, local-first as described in Core Concepts; results sorted by On Hand first, then relevance.
- **New** — create a custom titlecard from scratch. Required fields: Preferred Supplier, Artist, Album, Genre.
- **Edit** — open all fields of *this* titlecard for editing; some (Preferred Supplier, Genre, Style, Section) are dropdown-constrained. Hard-adjusting On Hand directly is **Admin-only** and requires a **reason code** — Shrinkage, Damaged, Found, Miscount/Correction, Written Off, or Other with a free-form note. The adjustment records the reason, the before and after quantities, the timestamp, and which admin made it. No approval step and no cap on the adjustment: an admin can always set the number to whatever reality says it is; the reason code just makes sure the change isn't silent.
- **Sort by** — release date, qty on hand, album, artist.
- **Order** — place an order for this title: prompts for quantity, confirms which supplier we're ordering from (defaulting to the titlecard's Preferred Supplier), an ordering separator (single letter, default blank), and selling price. Asks if it's for a specific customer. Includes a follow-up flag: a number of days from now after which staff are reminded this order is still outstanding — the same flag surfaced in **What's on Order** below.
- **Reserve** — choose in-stock reservation or order reservation.
  - *In-stock reservation*: prompts for a quantity, then creates a held sale for that many units of On Hand.
  - *Order reservation*: lists existing orders for this title grouped by PO. If a PO's quantity is a mix of customer-attached and unattached units, the attached ones break out onto their own line (showing the customer's name) while the remaining unattached units stay grouped as a single line. Staff attach a customer to one of the unattached lines, or place a brand-new order. If attaching to an existing unattached-order line, prompts to also order a replacement copy for the shelf.
- **Copy** — create a new titlecard pre-filled with most of this one's information, then standing entirely on its own. Used when taking in another copy of the same album in different shape or at a different price. A store label code is generated automatically (overridable).
- **Delete** — remove this titlecard from the local database. **Admin-only.** Past sales referencing it are unaffected.

**Discogs fields shown on the titlecard:** id, type, title, year, country, format/formats, label, catno, barcode, genre, style, thumb/cover_image, resource_url, uri, master_id/master_url, community (want/have), format_quantity, user_data.

**WaxWorks-specific fields:** ItemID (internal ascending ID), store label code, Preferred Supplier, Price, List Price, Last Received Cost, Genre, Section, Track Inventory (default on), Available On Hand, Available On Order, Total On Order, Pending Orders, Items Held, Qty in Backroom, Minimum On Hand, Condition, Condition Note, Item Message (visible to all staff).

---

## Suppliers

On entry: show the most recently searched supplier card.

**Functions:** New, Edit, Copy, Delete (Admin-only), Merge (Admin-only — combines two supplier records; historical orders/inventory pointing to the old record are reassigned to the surviving one).

**Fields**
- ShortName (4-letter code)
- Full Name
- Account #
- OrderVia — dropdown: Phone, Email, FTP, Their Website, Fax, Rep
- Minimum Order Qty / Retail-Net / Amount — an order becomes "ready to place" once it hits the minimum **quantity**; if that minimum is 0, readiness instead falls back to a minimum dollar **amount**, calculated at either Retail or Net (dropdown selects which).
- Discount — % off retail offered by this supplier
- Cancel-by Date — default number of days from order-placed before the order auto-cancels if unfulfilled; some suppliers don't support this. Overridable per individual order.
- Currency
- Type — Used, Bargain, New (default New)
- Notes — free-form, visible to all staff
- Email — where orders/claims are sent
- Backorders allowed — Y/N
- Rep Name, Rep Phone, Main Phone

A titlecard's Preferred Supplier is only a default; the supplier actually used is recorded on each order line, so the same title can be bought from different suppliers over time without rewriting history.

---

## Customers

On entry: show the most recently searched/added customer card.

**Functions:** Search (name, email, phone), New, Delete.

**Fields**
- Primary ID — incremental, permanent internal key
- Account # — our internal account number, staff-editable so long as it stays unique
- Account Type — dropdown: Staff, Regular, etc.
- Name, Phone #, Contact Preference, Email Address
- Mailing Address (Line 1, Line 2, City, Province/State [2-letter], Country)
- Global Discount (%) — shown by default in the POS line-item discount field, but a line-item discount always overrides it if changed
- **Default Tax Line** — optional override pointing at a line in the tax table, including a zero/exempt line. Covers wholesale buyers, other stores, and out-of-province shipping; when set, it overrides the item's default tax line at POS.
- Note
- **A/R balance** — store credit held by this customer (from used-stock purchases, refunds returned to account, or gift value assigned to their name)
- History — table of past activity sorted by recency: title, invoice #, date sold

---

## Order Processing

**Admin-only.**

On entry: one line per unique supplier + separator letter, showing: current total of pending orders on that line, age of the oldest order in it, that supplier's OrderVia method, how many of those items are customer-attached, sell total, and suspected cost (via the supplier's discount). Below that, a descending list of already-placed orders (most recent first), each showing its PO.

**About the separator letter:** a single optional letter that splits one supplier's pending orders into parallel streams, so they can be placed as separate POs. It exists so special-consideration orders can be broken out — a front-list-only PO, a rush order, or anything else you want on its own paperwork — without disturbing the supplier's regular pending pile.

**Functions**
- **Process** — confirms the order will be sent via the supplier's OrderVia method. If Email: generates the order and emails it to the supplier's listed address with items, quantities, cancel-by date, and backorder policy. For non-email methods (Phone/Fax/Website/Rep): generates a printable order document for staff to act on manually, then marks it placed. Always offers a PO field — leave blank to auto-generate the next unused ascending PO number, or enter one manually.
- **View** — inspect a pending order for a supplier, line by line, with each item's age; highlighting a line opens its titlecard for a quick supplier-match sanity check.
- **Delete pending order** — remove an unplaced order line with minimal friction; a simple confirmation, with a clearer warning if a customer is attached to it.
- **Void PO** — reverses a placed PO, returning all of its unreceived items to Pending. Warns that voiding here does **not** cancel the order with the supplier — someone still has to contact them.
- **Update order status** — set the status of all unreceived items on a PO at once, e.g. to **Cancelled** or **Backordered**.

---

## What's on Order

On entry: descending list (oldest first) of individual items on order but not yet received. Items past their follow-up flag date are shown in red at the top.

**Functions**
- **Search** — barcode scan or keyword
- **Sort** — age, title, etc.
- **Filter** — by PO or by supplier
- **Flag** — re-flag a selected item for another X days (used both to remind staff to check in with the supplier and, if relevant, to give the customer a heads-up that their order is running late)
- **Set status** — mark an individual item **Cancelled** or **Backordered**. Deleting or cancelling an item here warns that it does not cancel anything already placed with the supplier, and flags any attached customer who will need to be told.

**On receipt of a customer-attached order:** the arriving copy automatically becomes a **Held** transaction for that customer, so it can't be sold off the floor, and enters the hold timeline described under POS → Log.

---

## Supplier Claims

*(Distinct from customer-facing returns/refunds in POS — this module is about claiming credit from a supplier for shorted, damaged, or unfulfilled stock.)*

**Flow:** From a titlecard, select **Claim** and choose a reason — dropdown/freeform, e.g. Billed/Not Shipped, Received Damaged. From the Supplier Claims main screen, search/filter by supplier (respecting the ordering separator letter) to batch items together, then send a claim for credit to the supplier's listed email. The claim includes: invoice # the item(s) arrived on, reason code, album title, artist, cost, qty, and a combined total. Claim numbers auto-generate ascending from 0 (unique-checked), with manual override available.

Once sent, a claim carries a simple status — **Pending** or **Credited** — so it can be reconciled in Accounts Payable below. Deeper reconciliation tooling (auto-matching a supplier's credit note to the original claim, partial credits, disputes) is a later phase; for now, marking a claim Credited is a manual staff action.

*Note: this module consumes invoice #, cost, and receipt data that the Receiving module (scoped separately) will need to produce — flagged as an integration point to coordinate on, not a blocker.*

---

## Accounts Payable

**Admin-only.**

On entry: list of suppliers with an outstanding balance (received invoices not yet fully paid, plus any Pending Supplier Claims), sorted by supplier.

Selecting a supplier shows their outstanding items in one combined list:
- **Invoices** — from Receiving: invoice #, date received, linked PO, original amount, amount paid to date, balance owing.
- **Supplier Claims** — Pending claims for that supplier: claim #, date sent, amount, reason.

**Functions**
- **Mark for Payment** — select one or more outstanding invoices (full or partial amount) and record the payment: method (Cheque, Credit Card, EFT, Cash, etc.), a reference (e.g. "Cheque 101", "Credit Card 1278"), amount, date, and which staff member recorded it. Reduces the balance owing accordingly; a fully-paid invoice drops off the outstanding list into payment history.
- **Apply Claim Credit** — when a supplier confirms credit for a claim, mark that claim **Credited** and apply its amount against an outstanding invoice balance for that same supplier.
- **View History** — paid invoices and credited claims for that supplier, sorted by date, each showing how it was settled.

*Note: like Supplier Claims, this module's invoice data (amount, date, PO linkage) comes from Receiving — another integration point to coordinate on.*

Worth deciding later, not blocking: whether an aging view (balances grouped 30/60/90+ days overdue) belongs here or in a future Reporting area.

---

## Gift Cards

**Registry view is Admin-only**; loading and redeeming happen at POS by any staff member.

Gift card codes are prefixed `GC`. Scanning or typing one into the POS barcode field looks it up:
- **Not yet loaded** → prompts to load it, adding a line item to the sale for the amount being purchased.
- **Has a balance** → prompts to redeem it against the current sale, applied as a **tender** (see POS → Tendering), so a card can cover part of a sale with the remainder split across cash or card.

The registry lists outstanding cards with their balance, issue date, last-used date, and remaining value — the store's outstanding gift-card liability at a glance. A card may optionally be associated with a customer, but doesn't have to be (walk-in purchases).

---

## Point of Sale

On entry: show the most recent sale, or the most recent Held transaction if there are no sales yet today.

**Transaction statuses:** **Current** (rung up since the last end-of-day totalling), **Held** (a reservation, either made by staff in Inventory or created automatically when a customer-attached order arrives), **Closed** (totalled off at end-of-day; no longer editable), **Void** (reversed by a staff member).

**Functions**
- **New** — start a new sale.
- **Edit** — for Current: voids the original and duplicates it for editing, preserving an audit trail. For Held: opens it to prep for tendering.
- **Search** — scan a barcode to see that item's sale history; Held transactions involving it surface at the top so they can be selected and tendered.
- **Total Today's Sales** — end-of-day breakdown by section and tendering method; moves all Current transactions to Closed.
- **View Subtotal** — same breakdown, without closing anything.
- **Undo End of Day Sales** — moves a totalled batch back to Current. **Admin-only.** Each batch carries its own identifier, timestamp, and the staff member who ran it.
- **Copy** — new transaction with the same line items as the selected one.
- **Void** — **Current transactions only.** Returns inventory to On Hand, drops the sale from the end-of-day total, and retains its invoice number as a voided record. A Closed transaction cannot be voided — it must either be reopened via Undo End of Day (Admin) or handled as a refund. This is deliberate: voiding settled history would amount to cooking the books.
- **Cancel Hold** — **Held transactions only.** Releases the held stock back to On Hand and closes out the hold, recording who cancelled it and when in the hold's log.
- **Log** — timestamped free-form staff notes on a transaction. For Held transactions the log also shows the hold's timeline automatically: when it was created, when the customer was contacted and by what method, and how long it has been sitting on the hold shelf.
- **Receipt** — after tendering, prompts to print a receipt. Any invoice can be reopened from history by invoice number to reprint or email it.

**Fields**
- Invoice # — auto-assigned; Held transactions carry an H-prefixed placeholder until tendered
- Account — name lookup against Customers; multiple matches list for selection, no match prompts to create a new customer
- PO — customer's purchase order reference, if they have one
- Note — free-form
- Barcode — scan or type to add a line: a manufacturer UPC, a store label code, a `GC` gift card code, or a non-inventory SKU like `FREIGHT`
- Qty — units being sold; if it would take On Hand below 0, warn staff but allow it. Items with Track Inventory off never warn.
- Price — pulled from the titlecard, editable. If the titlecard's price is 0.00, staff are prompted for a price as the line is added.
- Discount — 2-digit integer (%); defaults to the customer's Global Discount if one is set, staff can override per line
- Tax — references a line in the Settings tax table, so a line item can be taxed at whichever rate applies or reference a zero/exempt line. A customer's Default Tax Line overrides the item default.
- Timestamp, Status

**Tendering.** Once ready to close a sale, totals are calculated and tendering options (from Settings) are offered. A sale can be **split across multiple tender types** — e.g. redeem $20 of a gift card, $20 cash, remainder on credit card. Cash tenders calculate change owed. Tender types include:
- **Cash**, **Credit Card**, **Store Credit** (drawn against the customer's A/R balance), **Gift Card** (redeemed against a `GC` balance)
- **Pay-out** — cash taken out of the till for an expense (office supplies, etc.), with a required note describing what it was for. Appears as a negative cash line in the end-of-day breakdown.
- **Used Credit** — used to buy stock over the counter (see below).

**Buying used stock over the counter.** Ring the agreed amount as a **Used Credit** tender on the transaction (typically a $0-item sale, but it can be mixed into a normal sale — e.g. someone trades in a stack and buys something the same visit). This creates a balance owing *to the customer*, settled either by:
- putting the amount on their **A/R** as store credit (requires a customer on the sale), or
- tendering it back as **negative cash**, paying them out of the till.

The physical stock enters inventory separately through Receiving. A single optional cross-reference field on each side links the transaction to the intake, so a given payout can be traced to the records it bought without building a full workflow around it.

**Refunds.** Handled via a negative qty line. If the item can be matched to a prior sale for that customer, link it to that original transaction; if not, staff can proceed without extra friction — hassle-free returns are the intent. Returned stock goes back to the titlecard its barcode resolves to; if it comes back in worse shape than it left, staff should re-grade it into its own titlecard via Copy. Refund amounts can be paid back out or applied to the customer's A/R balance, and negative amounts flow through the end-of-day tender breakdown accordingly.

---

## Settings (placeholder — to flesh out later)

- Tax table — multiple named tax lines (by province/jurisdiction, or stacked levies), including zero/exempt lines
- Tendering method names — including Pay-out, Used Credit, Gift Card, Store Credit
- Store name and receipt details
- Currency shorthand codes + conversion rates
- Staff accounts/roles (Admin/Staff), initials-based per-terminal login
- Genre → Section map, and the Discogs genre mapping used on import

---

## Future considerations (not in v1, but design shouldn't block them)

- **Multi-location.** WaxWorks is single-store for now, but the data model should leave room for multiple stores running the system to eventually see each other's on-hand inventory — e.g. pointing a customer to a sister store that has a title in stock.
- **Reporting.** Sales by genre, titles below Minimum On Hand, A/P aging (30/60/90), gift-card liability over time, and margin analysis all want a proper reporting area rather than being bolted onto individual screens.
- **Deeper A/P reconciliation.** V1 A/P is manual; auto-matching supplier credit notes, partial credits, and disputes are later refinements.
- **Staff authentication.** Per-terminal initials login is the v1 mechanic; real passwords are a later addition.
- **Batch stocktake.** Reason-coded single adjustments are in v1 (see Inventory → Edit), but counting a whole section against the shelf and reconciling the differences in one pass is a later addition.
