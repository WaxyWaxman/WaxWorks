# E-05 — Point of Sale

**Actor:** Employee (Undo End of Day labeled Admin-only by convention, not enforced)
**Status:** Specified
**Related:** [E-03 Search the inventory](E-03-search-inventory.md) · [E-06 Process a return](E-06-process-a-return.md) · [E-07 Manage customers](E-07-manage-customers.md) · [M-03 Daily summary](M-03-daily-summary.md) · [M-06 Settings](M-06-settings.md)

**Job:** As an employee, I need to ring up a sale and take payment.

**Scope note:** this is the front-of-counter selling flow, renamed from "Sell a record" to **Point of Sale** to reflect that it now also carries M-03's close (Total Today's Sales / View Subtotal / Undo End of Day) — see decision 30. Inbound receiving is [E-02](E-02-receive-inventory.md); customer returns are [E-06](E-06-process-a-return.md); the full breakdown-and-close design still lives in [M-03](M-03-daily-summary.md), this flow just surfaces it.

---

## Sale states

A Sale is in exactly one state:

| State | Meaning |
|---|---|
| **Current** | Rung up since the last end-of-day close. Editable. |
| **Held** | A reservation — either placed by an Employee against stock on hand, or created automatically when a customer-attached PurchaseOrder line is received. Not a completed Sale. |
| **Closed** | Included in a completed end-of-day close. No longer editable. |
| **Void** | Reversed by an Employee. Retains its Sale number. |

---

## Flow

### Phase 1 — Open the Sale

1. Employee starts a new Sale, or selects an existing **Current** or **Held** Sale to continue.
2. Employee may attach a **Customer** (see [E-07](E-07-manage-customers.md)). Lookup is by name, phone, or email; multiple matches present a picker; no match offers to create the Customer. A Sale without a Customer is normal and fully supported.
3. If a Customer is attached and carries a global discount or a default tax line, both pre-fill onto subsequent lines and remain editable per line.

### Phase 2 — Add lines *(repeats per line)*

4. Employee scans or types into the barcode field. The resolver accepts four things:
   - a **manufacturer UPC** — resolves to a Record;
   - an **internal barcode** — resolves to one InventoryItem exactly;
   - a **gift card code** (`GC` prefix) — see Gift cards below;
   - a **non-tracked item code** (e.g. `FREIGHT`) — see Non-tracked items below.
5. If a manufacturer UPC resolves to more than one sellable InventoryItem at differing condition or price, the system presents a **picker** showing condition grade, price, and count. One sellable copy resolves directly with no picker.
6. System adds the line at the InventoryItem's price.
   - A price of `0.00` means *ask at the till*: the Employee is prompted for a price as the line is added.
7. Employee may adjust **quantity**, **price**, **discount**, and **tax line** on the line.
   - Quantity may drive stock below zero. The till warns but completes the Sale — see **negative inventory** under Inherited.
   - Discount pre-fills from the Customer's global discount when one applies.
   - Tax line references the tax table in [M-06](M-06-settings.md); the Customer's default tax line overrides the item's when set.
8. Return to step 4, or proceed to tender.

### Phase 3 — Tender

9. System totals the Sale and offers the tender types configured in [M-06](M-06-settings.md).
10. A Sale may be **split across multiple tenders** — e.g. `$20.00` gift card, `$20.00` cash, remainder on card. Each tender is recorded as its own entry against the Sale.
11. **Cash** tenders calculate change owed.
12. On completion the Sale moves to **Current** and is assigned a **Sale number**.
13. System prompts to print a **receipt**. Any Sale can be reopened later by Sale number to reprint or email its receipt.

---

## Sale numbering

Sale numbers auto-generate ascending, are checked for uniqueness against history, and may be entered manually. They are **globally unique**, unlike supplier Invoice numbers, which are unique per `(supplier, invoice_number)` (E-02 decision 1).

A **Held** Sale carries an `H`-prefixed hold reference (`H1`, `H2`…) rather than a Sale number, so it is never mistaken for a completed Sale. On tender it receives a proper Sale number; the hold reference is retained on the record for traceability.

A **voided** Sale keeps its Sale number. Gaps in the sequence would read as missing paperwork, so a voided-but-numbered Sale is the honest record.

---

## Tender types

| Tender | Notes |
|---|---|
| **Cash** | Calculates change owed. |
| **Credit Card** | **Recorded only.** The card is settled on a separate terminal; the tender records that it happened, for reconciliation and the M-03 tender breakdown. Wax Works integrates no third-party payment processing system — Square, Stripe, or equivalent — and never captures card data. |
| **Store Credit** | Drawn against the Customer's accounts-receivable balance. Requires a Customer on the Sale. |
| **Gift Card** | Redeemed against a `GC` balance. |
| **Pay-out** | Cash removed from the till for an expense. Requires a note describing the purpose. Appears as a negative cash line in the M-03 close. |
| **Used Credit** | Buying second-hand stock over the counter. See below. |

> **Naming note.** The lexicon standardises on *second-hand* over *used*, but this tender is named **Used Credit** deliberately — it is the term spoken at the counter. Registered as a known exception rather than drift.

### Gift cards

Gift card codes carry a `GC` prefix. Scanning one at the till branches on its state:

- **Not yet loaded** → prompts to load it. Loading adds a **line item** to the Sale for the value purchased (money in).
- **Carries a balance** → prompts to redeem against the current Sale. Redemption is a **tender**, not a line-item price adjustment, so it composes with split tender.

A gift card may optionally be associated with a Customer but does not have to be — walk-in purchases are the common case. The outstanding-balance registry lives in [M-05](M-05-accounts-payable.md#gift-card-liability).

### Buying second-hand stock over the counter

The money side of a counter buy runs through the till:

14. Employee rings the agreed amount as a **Used Credit** tender. This may be on a `$0.00` Sale, or mixed into a normal Sale when someone trades in and buys the same visit.
15. The tender creates a balance owing **to the Customer**, settled either by:
    - crediting their accounts-receivable balance as store credit (requires a Customer on the Sale), or
    - tendering it back as **negative cash**, paying them out of the till.

The stock side is separate: the copies enter inventory through [E-02](E-02-receive-inventory.md) second-hand intake. An optional cross-reference field on each side links the Sale to the intake Invoice, so a payout can be traced to the copies it bought without building a workflow around it.

### Non-tracked items

Some things sold at the till are not InventoryItems — freight, services, and bulk goods where the count doesn't matter (buttons, stickers). These are catalog entries flagged **non-tracked**: they have a code, a price (often `0.00`, prompting at the till), and a Section, but no stock count, no on-hand math, and no low-stock reporting. They never warn about negative inventory.

---

## Functions

| Function | Notes |
|---|---|
| **New** | Start a Sale. |
| **Edit** | **Current:** voids the original and duplicates it for editing, preserving the audit trail. **Held:** opens it to prepare for tender. |
| **Search** | Scan a barcode to see that item's sale history; Held Sales involving it surface first so they can be selected and tendered. |
| **Copy** | New Sale with the same lines as the selected one. |
| **Void** | **Current Sales only.** Returns stock to sellable inventory, drops the Sale from the pending end-of-day totals, and retains its Sale number. A **Closed** Sale cannot be voided — it is either reopened via Undo End of Day ([M-03](M-03-daily-summary.md), manager-only) or handled as a Return ([E-06](E-06-process-a-return.md)). Voiding settled history would misstate the day's takings. |
| **Cancel Hold** | **Held Sales only.** Releases the held copies back to sellable stock and closes the hold, recording who cancelled it and when. |
| **Log** | Timestamped free-form notes against a Sale. For a **Held** Sale the log additionally shows the hold timeline automatically: when the hold was created, when the customer was contacted and by what method, and how long it has been sitting. |
| **Receipt** | Print, reprint, or email the receipt for any Sale by Sale number. |

### Holds

A Held Sale is created two ways:

- an Employee reserves stock on hand from [E-04](E-04-manage-inventory.md), prompting for a quantity; or
- a customer-attached PurchaseOrder line is received, which creates the hold automatically ([M-02](M-02-reorder-inventory.md)).

Holds do not expire. They persist until someone tenders or cancels them, which is why the hold timeline in the log records contact attempts and age — a hold nobody has chased is otherwise invisible.

Held copies count against **available** stock but remain on hand.

---

## Requirements

- The till must complete a Sale even when stock would go negative (see Inherited).
- Every tender on a Sale is individually recorded; the Sale's tender mix is what M-03 reports.
- Line values — price, discount, tax line, condition grade, and title — are **snapshotted onto the Sale line** at the time of sale. Editing or deleting a catalog Record or InventoryItem afterwards never rewrites what a past Sale says it sold for.
- Every Sale, void, hold cancellation, and pay-out is attributed to the Employee who performed it.
- An Employee may take a line below cost at the till without a manager override (see decision 12).

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- **Negative inventory must be supported.** Stock only becomes sellable when its Invoice is finalized, so a physical copy can be on the counter before it exists in the system. The till completes that Sale and mints the copy immediately as an **oversold** InventoryItem — sold from birth, unbacked by any Invoice line yet — rather than blocking it. Reconciliation happens in [E-04](E-04-manage-inventory.md).

**From [E-04](E-04-manage-inventory.md):**

- Reserving stock on hand creates a **Held** Sale here, with a quantity chosen at reservation time.

**From [M-02](M-02-reorder-inventory.md):**

- Receiving a **customer-attached** PurchaseOrder line automatically creates a **Held** Sale for that customer, so the copy cannot be sold off the floor before they collect it.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | A Sale is in exactly one of four states: Current, Held, Closed, Void |
| 2 | Sale numbers are **globally unique** and ascending; supplier Invoice numbers remain unique per `(supplier, invoice_number)` |
| 3 | Held Sales carry an `H`-prefixed hold reference, replaced by a Sale number on tender; the hold reference is retained |
| 4 | A voided Sale retains its Sale number — the sequence is never made gapless by reuse |
| 5 | **Void applies to Open and Current Sales.** Held Sales use Cancel Hold instead; Closed Sales are reopened via Undo End of Day (Admin) or handled as a Return |
| 6 | Cancelling a hold is a distinct action from voiding a Sale, and is logged rather than erased |
| 7 | Holds do not expire; the hold log records creation, customer contact, and age |
| 8 | A Sale may be split across multiple tenders; each tender is recorded individually |
| 9 | Card payments are **recorded only** — no integration with a third-party payment processing system (Square, Stripe, or equivalent), no card data captured, no money moved (E-02 decision 26) |
| 10 | Gift cards: **loading** one is a line item; **redeeming** one is a tender |
| 11 | A price of `0.00` prompts the Employee for a price as the line is added |
| 12 | An Employee may price a line below cost at the till **without** a manager override — it proceeds, same as the review-flag behavior receiving uses for the same thing (M-04 decision 8) |
| 13 | Line values are snapshotted onto the Sale line; later catalog edits never rewrite sale history |
| 14 | Second-hand counter buys run through a **Used Credit** tender, settled to store credit or a negative-cash payout |
| 15 | The stock side of a counter buy is a separate E-02 second-hand intake, linked by an optional cross-reference |
| 16 | **Pay-out** is a tender type, requiring a note, appearing as negative cash in the M-03 close |
| 17 | Non-tracked catalog items (freight, services, bulk goods) sell without stock counts and never warn on negative inventory |
| 18 | A manufacturer UPC resolving to multiple sellable copies presents a picker on condition, price, and count |
| 19 | Receipts print on demand after tender and can be reprinted or emailed later by Sale number |
| 20 | A Sale need not have a Customer attached |
| 21 | **Edit** on a Current Sale voids the original and duplicates its lines (same InventoryItems, now sellable again) into a new Open Sale — a `replacesSaleId` cross-reference preserves the audit trail. **Edit** on a Held Sale just opens it; there's nothing to duplicate |
| 22 | **Copy** seeds a new Open Sale from the same line template (record, price, qty, discount, tax, grade) but never carries over the specific InventoryItem — the source Sale's copy may still be sold, so the Employee re-scans the physical copy being sold now |
| 23 | **Search** resolves a scanned barcode to every Sale line that ever referenced it, Held Sales surfaced first (so they can be selected and tendered), then by recency |
| 24 | **PO** is a plain field on the Sale header (the Customer's purchase-order reference), editable whenever the Sale's lines are |
| 25 | **Discount is a 2-digit integer** (0–99%), clamped on entry rather than accepting arbitrary decimals |
| 26 | **On entry, Point of Sale opens the most recent Sale** (Current or Open), or the most recent Held Sale if there isn't one yet |
| 27 | Attaching a Customer with **no search match** offers to create one inline (name only, rest fillable later from [E-07](E-07-manage-customers.md)) and attach it immediately |
| 28 | A Held Sale's log carries a **Log contact** action (method only — Phone or Email) alongside free-form notes, and the card shows a computed **age** since the hold was created |
| 29 | The tender named **Account Balance** (not "Store Credit") is bidirectional — add to or draw from the Customer's A/R balance — per the E-07 rework; this flow's earlier "Store Credit, drawn against A/R" framing is superseded by that decision, not the other way around |
| 30 | **Total Today's Sales / View Subtotal / Undo End of Day** ([M-03](M-03-daily-summary.md)) live under one **Other Functions** control on Point of Sale rather than as everyday buttons, since they're end-of-day operations, not per-Sale ones. Undo End of Day is labeled **Admin** by convention — no enforced check, consistent with every other not-yet-real-auth label this build uses (M-01, E-07) |

---

## Open questions

- **Rounding at the till.** E-02 decision 9 requires shelf prices to end in `.50` or `.99`. Ad-hoc till discounts and `0.00` prompts are currently exempt — should they be, or should every customer-facing amount round the same way?
- **Layaway / deposits.** Taking partial payment against a Held Sale isn't specified. A deposit is money in against goods not yet delivered, which the current tender model has no state for.
- **Receipt content and format.** Line detail, tax breakdown, store branding, and paper size are unspecified. E-02's finalize summary is letter-size; a till receipt is presumably roll paper.
- **Employee attribution vs. Sale ownership.** If one Employee starts a Sale and another tenders it, which one is the Sale attributed to for M-03's per-employee reporting?
- **Gift card expiry and escheatment.** Balances currently persist indefinitely; several jurisdictions regulate this.
