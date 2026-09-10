# E-02 — Receive inventory

**Actor:** Employee
**Status:** Specified
**Related:** [M-01 Supplier margin](M-01-supplier-margin.md) · [M-02 Re-order](M-02-reorder-inventory.md) · [E-04 Manage inventory](E-04-manage-inventory.md) · [Supplier invoice reference](../reference/supplier-invoice-fab.md)

**Job:** As an employee, I need to intake a physical shipment from a supplier, identify each record, price it, and reconcile the batch against the supplier's invoice.

**Scope note:** this is *inbound receiving*. Customer-facing receipts belong to [E-05](E-05-sell-a-record.md).

---

## Flow

### Phase 1 — Open the invoice

1. Employee selects the intake mode: **New stock** or **Second-hand**. This is chosen up front and governs condition handling for the whole invoice.
2. Employee selects the **supplier**. If the supplier doesn't exist, the employee may create one — full details (margin, discount, ordering terms, etc.) are filled in from [M-01](M-01-supplier-margin.md), not gated to a manager.
3. Employee enters the **supplier's invoice number** (printed on their paperwork). For second-hand intake with no supplier paperwork, the employee may enter a custom invoice number, or leave it blank and the system generates a reference.
4. System checks `(supplier, invoice_number)` for an existing record. On collision, prompt the employee to check inventory rather than silently creating a duplicate.
5. Employee enters both the **invoice date** (from the paperwork) and the **received date**.
6. Employee photographs the invoice. The system extracts **invoice-level totals only** — subtotal, tax, freight — to pre-populate the reconciliation screen. Per-line costs are not extracted; they are entered during scanning (step 10). Extraction is **best-effort assistance, not a source of truth**: every extracted field remains editable, and the employee can enter all of it manually if the photo is unreadable or wrong.
7. System creates the Invoice record. It persists immediately as a **draft** and can be abandoned and resumed later.

### Phase 2 — Scan and price items *(repeats per item)*

8. Employee scans a barcode.
   - Unbarcoded item → system generates and prints an internal barcode (label printer at the receiving desk).
9. System resolves the barcode to a catalog Record:
   - **Local hit** → use the stored record.
   - **Local miss** → call the Discogs API. Metadata is normally pre-fetched at purchase-order time (M-02), so receiving should mostly hit locally.
   - **Multiple Discogs matches** → present a picker to the employee.
   - **No match** → manual entry fallback (artist, album title, genre, catalog number, label).
10. Employee reads the supplier's paperwork and **manually enters the cost** for this line. The system does not attempt to match a scanned barcode to an invoice SKU — barcodes and supplier SKUs cannot be reliably linked, so the employee performs the recognition. Cost is entered or confirmed on **every** receipt; a previously stored cost is never reused silently, because supplier prices move between shipments.
11. System displays cost and a **suggested retail price** (see Pricing rules). If the catalog record carries a sticky retail price from a prior receipt, that pre-fills instead — always visible and editable, never applied silently.
12. Employee accepts or overrides the price. Below-cost pricing **proceeds and raises a review flag** for a manager rather than blocking (M-04 decision 8). In **New mode** the accepted price becomes the catalog record's sticky price. **Second-hand** copies are priced individually and never set a sticky price.
13. A tick box on the pricing screen — available at any point — auto-accepts suggested prices for the remainder of the invoice.
14. **Second-hand mode:** employee must set a condition grade for every item. **New mode:** condition defaults to Mint/Sealed.
15. Item is added to the invoice as a line. It is **not yet sellable**.
16. Return to step 8, or close scanning.

### Phase 3 — Reconcile and finalize

17. System presents an invoice summary:

| Field | Editable | Source |
|---|---|---|
| Quantity received | No | Derived from lines |
| Supplier cost subtotal | No | Derived — sum of per-line costs entered at step 10 |
| Tax | Yes | Pre-filled from invoice photo |
| Freight | Yes | Pre-filled from invoice photo |
| Miscellaneous | Yes | Manual |
| **Total** | Yes, **±2% only** | Derived, with bounded adjustment |

18. System compares the **derived subtotal** against the supplier's stated subtotal. A mismatch raises a **discrepancy warning**, which the employee may override manually.
19. Employee may review lines and **remove** an individual record before finalizing, or defer the problem to E-04.
20. Employee may flag the invoice as **needing a return or credit claim** (handled in E-04).
21. The ±2% total adjustment absorbs rounding differences against the supplier's paperwork. The delta is recorded as a **standalone line flowing into cost of goods** — it does not redistribute across item costs. Adjustments **beyond ±2% proceed and raise a review flag** for a manager rather than blocking (M-04 decision 8).
22. On finalize: all line items become **sellable inventory**, the invoice is written to the invoices database, and a **letter-size** summary is printed.
23. Finalize does **not** lock the invoice — it's about stock becoming sellable, not the paperwork being settled. The employee may keep correcting it: fixing a line's cost (propagates to any InventoryItems already minted from it) or adding a line for a carton that turns up late (mints its own copies immediately). A line can't be removed once any of its copies has sold. The invoice becomes immutable only when a manager marks it **paid** in Accounts Payable ([M-05](M-05-accounts-payable.md)); voiding a paid invoice is manager-only and handled in E-04, appended as a separate artifact against the original record.

---

## Pricing rules

**Cost** is the supplier's **post-discount unit price** — the `Ext. Price` column, not the list `Price`.

**Suggested retail** is computed from the **pre-discount list price**, marked up by the Supplier's own **Discount** field ([M-01](M-01-supplier-margin.md) — not the per-line Disc% below, the Supplier record's own figure):

```
suggested_retail = round_up(list_price x (1 + supplier.discountPct / 100))
```

Two different "discounts" are in play on one line and it's worth keeping them straight: the **line's own Disc%** (step 10, read off this invoice's paperwork) drives cost — `extPrice = list_price x (1 - line_discount)`. The **Supplier's Discount field** (M-01, one figure per Supplier, not per invoice) drives suggested retail instead. Pricing the retail side off list rather than net means a supplier discount on THIS invoice's paperwork is captured as margin rather than passed through as a lower shelf price — the two figures don't need to match, and usually won't.

> Worked example — list `$27.99`, this invoice's line discount 10% (→ cost `$25.19`), Supplier's own Discount field 60%:
> suggested retail = `27.99 x 1.60` = `$44.78` → **`$44.99`**
> (Pricing off net cost would have given `$40.50` and surrendered the invoice's own discount.)

**Rounding.** Every shelf price ends in `.50` or `.99`, always rounded up:

| Cents | Result |
|---|---|
| `.00` – `.50` | round up to `.50` |
| `.51` – `.99` | round up to `.99` |

`$23.00 -> $23.50` · `$23.47 -> $23.50` · `$23.50 -> $23.50` · `$23.51 -> $23.99` · `$23.99 -> $23.99`

**Guardrail.** An employee may set a price below cost — it proceeds and raises a review flag for a manager rather than blocking (M-04 decision 8).

---

## Cost treatment

Freight, tax, and miscellaneous costs are held at the **invoice level** and are **not allocated down to individual items**. There is no landed-cost calculation: an item's cost is its supplier `Ext. Price` and nothing more.

Consequence to accept knowingly: per-item margin reporting reflects only supplier cost, so true blended margin across a shipment will be slightly overstated. On the reference invoice, `$52.00` freight against `$2014.34` of goods is roughly 2.6%.

---

## Inherited from other flows

**From [M-02](M-02-reorder-inventory.md):**

- Receiving a **customer-attached** PurchaseOrder line automatically creates a **Held** Sale for that customer ([E-05](E-05-sell-a-record.md)), so the copy cannot be sold off the floor before they collect it. The hold's timeline starts at receipt.

**From [E-05](E-05-sell-a-record.md):**

- **Second-hand stock bought over the counter enters here.** The money side is a `Used Credit` tender at the till; the stock side is an ordinary second-hand intake. An optional cross-reference field links the Invoice to the Sale that paid for it, so a payout can be traced to the copies it bought.

**From [M-05](M-05-accounts-payable.md):**

- Accounts payable **consumes** the Invoice records finalized here — number, date, linked PurchaseOrder, and amount — and never creates one. An amendment against a finalized Invoice ([E-04](E-04-manage-inventory.md)) changes what is owed.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Invoice numbers are supplier-provided and unique per `(supplier, invoice_number)` — not globally. Left blank (e.g. second-hand with no paperwork), the system auto-generates a reference (`REF####`) |
| 2 | Both invoice date and received date are captured; all dates normalize to `DD/MM/YYYY` |
| 3 | ~~Employees can create suppliers but never set margins~~ — **superseded by 30**: nothing about a Supplier is gated |
| 4 | Invoices are draft-persisted and resumable; deletable before finalize. After finalize, lines and totals stay editable (a line can't be removed once it's sold) until a manager marks the invoice paid in M-05 — that's what locks it; voiding a paid invoice is manager-only, handled in E-04 |
| 5 | Catalog lookup is local-first with Discogs as fallback; metadata is bulk-prefetched at PO time, with live lookup at the receiving desk as an accepted fallback |
| 6 | Cover art is a one-time snapshot, not re-synced |
| 7 | Cost is the supplier's post-discount `Ext. Price` |
| 8 | ~~Suggested retail is priced off the pre-discount list price: `list x (1 + supplier margin)`~~ — **superseded by 31**: there is no separate Margin field, the Supplier's own Discount field (M-01) drives this formula instead |
| 9 | Every shelf price ends in `.50` or `.99`, rounded up |
| 10 | ~~Employees cannot price below cost without a manager override~~ — **superseded by M-04 decision 8**: it proceeds and raises a review flag instead |
| 11 | Sticky retail pricing applies to **New stock only**; second-hand copies are priced per copy |
| 12 | Sticky prices pre-fill but are always confirmable and editable |
| 13 | Cost is entered or confirmed on every receipt — never reused silently from a prior shipment |
| 14 | Barcode-to-invoice-SKU matching is **manual**; the employee reads the paperwork and enters cost per line |
| 15 | Photo extraction yields invoice-level totals only, and is assistive — all fields stay editable |
| 16 | Freight, tax, and misc stay at invoice level; no per-item landed cost |
| 17 | Tax **is** included in cost of goods |
| 18 | Derived-vs-stated subtotal mismatch raises a discrepancy warning, overridable by the employee |
| 19 | ~~Total adjustments beyond ±2% require a manager override~~ — **superseded by M-04 decision 8**: it proceeds and raises a review flag instead |
| 20 | Inventory becomes sellable only on invoice finalization |
| 21 | E-05 must support **negative inventory** so a physical copy can be sold before it is received into the system |
| 22 | Intake mode (New / Second-hand) is selected once per invoice — no mixed invoices |
| 23 | Backorders are tracked by the system |
| 24 | Manual catalog entry captures artist, album title, genre, **catalog number**, and **label** |
| 25 | Payment and accounts-payable are out of scope — **superseded by 26** |
| 26 | **Payment recording and accounts payable are in scope.** Tenders are recorded at the till ([E-05](E-05-sell-a-record.md)) and supplier balances are settled in [M-05](M-05-accounts-payable.md). What stays out of scope is **integration with a third-party payment processing system such as Square or Stripe**: Wax Works never captures card data, never authorizes or settles a card transaction, and never moves money. Decision 25 stands unrewritten as the record of what was decided at the time |
| 27 | **There is no dedicated single second-hand Supplier.** Any Supplier can carry a second-hand invoice — decision 1's per-supplier numbering already makes that safe with no special case. A Supplier record carries an optional "default for second-hand" flag ([M-01](M-01-supplier-margin.md)) that pre-selects when Second-hand intake mode is chosen, purely as a convenience; the employee can still pick any Supplier from the full list |
| 28 | **Receiving does not open on a cross-supplier worklist.** The employee picks the supplier first (Phase 1), and everything from there — the Orders lookup, the line-entry row — is scoped to that one supplier's outstanding PurchaseOrder lines, never spanning several suppliers at once. A cross-supplier worklist entry point was considered and rejected |
| 29 | **No separate tax-excluded `invoice_cogs` figure was adopted.** The reconcile panel's **Total** stays what decision 16 already says — subtotal + tax + freight + misc — and per-item cost stays the `Ext. Price` alone (see Cost treatment). What the panel adds instead is purely informational: **Expected sell value** (sum of accepted price × qty across lines) and **Expected margin** (`(sell value − Total) / sell value`, as a %) — a shipment-level "did this pay off" estimate that reads nothing back into per-item cost or margin reporting |
| 30 | **Nothing about a Supplier is manager-gated.** New/Edit/Copy are open to any Employee — its Discount field included, closing decision 3's old carve-out. Delete and Merge are labeled Admin-only by convention but carry no enforced check in this pass, same as every other not-yet-real-auth label. See [M-01](M-01-supplier-margin.md) for the full field set |
| 31 | **There is no separate supplier Margin field.** A Supplier carries one figure — **Discount** ("% off retail this supplier offers") — and it does double duty: it's both the descriptive figure and the multiplier in the suggested-retail formula (see Pricing rules), replacing the old, separate `marginPct` |

---

## Open questions

- **Backorder mechanics:** the system tracks backorders (decision 23), but the lifecycle is unspecified. Does a `Balance` quantity become an expected receipt that auto-matches when it arrives on a later invoice? Does it feed reorder suggestions in M-02? Can it be cancelled?
- **Tax in COGS:** decision 17 includes tax in cost of goods. In Canada GST is an input tax credit and is normally recoverable, so including it will overstate COGS by ~5%. Worth confirming with an accountant before build.
- **Supplier-specific extraction:** since layouts vary, does the system need per-supplier extraction profiles, or a general-purpose model? Affects whether onboarding a new supplier requires configuration work.
- ~~**Second-hand invoice numbering**~~ — **Resolved** by decisions 1 and 27: numbering is scoped per-supplier as usual (no dedicated bucket to collide within), and a blank number auto-generates a reference.
