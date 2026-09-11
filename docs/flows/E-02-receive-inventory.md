# E-02 — Receive inventory

**Actor:** Employee
**Status:** Specified
**Related:** [M-01 Supplier margin](M-01-supplier-margin.md) · [M-02 Re-order](M-02-reorder-inventory.md) · [E-04 Manage inventory](E-04-manage-inventory.md) · [Supplier invoice reference](../reference/supplier-invoice-fab.md)

**Job:** As an employee, I need to intake a physical shipment from a supplier, identify each record, price it, and reconcile the batch against the supplier's invoice.

**Scope note:** this is *inbound receiving*. Customer-facing receipts belong to [E-05](E-05-sell-a-record.md).

---

## Flow

### Phase 1 — Open the invoice

0. Receiving opens on the **Invoices** — drafts in flight and those received lately — searchable by supplier, number, date, title, barcode, or PO number (decisions 36, 43). The **worklist** of outstanding PurchaseOrder lines sits in the Invoice track once one is open, scoped to that Invoice's Supplier and spanning all of its open POs, since suppliers ship several POs in one box (decisions 29, 42). It is browsable as well as scanned against. Opening a cold invoice with no PO behind it is fully supported.
1. Employee selects the intake mode: **New stock** or **Second-hand**. This is chosen up front and governs condition handling for the whole invoice.
2. Employee selects the **supplier**. If the supplier doesn't exist, the employee may create one — but may **not** set its margin (manager-only, see M-01). Second-hand intake runs under a **dedicated supplier**, which is what makes `(supplier, invoice_number)` uniqueness hold with no special case (decision 31).
3. Employee enters the **supplier's invoice number** (printed on their paperwork), or leaves it blank. Blank auto-mints a reference: `SH-YYMMDD-n` for a second-hand intake, from the received date (decision 39).
4. The invoice number is a **lookup, not a collision check** (decision 31). A number matching an existing **draft** resumes it. A number matching a **finalized** Invoice opens that Invoice as it stands — still correctable until it is marked paid (decision 40) — showing everything already received under it and its totals, so the employee can see what happened rather than being warned off.
5. Employee enters both the **invoice date** (from the paperwork) and the **received date**.
6. Employee enters the **invoice-level totals** from the supplier's paperwork — their **stated subtotal**, tax, freight, and miscellaneous. There is no invoice photography and no document extraction (decision 27). Per-line costs are entered separately during scanning (step 10), and their sum is the **derived subtotal** that step 18 checks the stated one against.
7. System creates the Invoice record. It persists immediately as a **draft** and can be abandoned and resumed later.

### Phase 2 — Scan and price items *(repeats per item)*

8. Employee scans a barcode.
   - Unbarcoded item → system generates and prints an internal barcode (label printer at the receiving desk).
9. A scanned barcode matching an outstanding PurchaseOrder line for this Invoice's Supplier **attaches to that line automatically**, carrying its expected cost and quantity into the pricing step; the employee can detach it. A copy with no barcode, or one that matches nothing, is picked from the worklist or taken in as a cold line ([M-02](M-02-reorder-inventory.md) d20). The system then resolves the barcode to a catalog Record:
   - **Local hit** → use the stored record.
   - **Local miss** → call the **catalog provider** — MusicBrainz, behind an adapter ([architecture](../architecture.md) A-12). Metadata is normally pre-fetched at purchase-order time (M-02), so receiving should mostly hit locally.
   - **Multiple provider matches** → present a picker to the employee.
   - **No match** → manual entry fallback (artist, album title, genre, catalog number, label).
10. Employee reads the supplier's paperwork and **manually enters the cost** for this line. The system does not attempt to match a scanned barcode to an invoice SKU — barcodes and supplier SKUs cannot be reliably linked, so the employee performs the recognition. Cost is entered or confirmed on **every** receipt; a previously stored cost is never reused silently, because supplier prices move between shipments.
11. System displays cost and a **suggested retail price** (see Pricing rules). If the catalog record carries a sticky retail price from a prior receipt, that pre-fills instead — always visible and editable, never applied silently.
12. Employee accepts or overrides the price. Below-cost pricing **proceeds and raises a review flag** for the manager rather than blocking (decision 35). In **New mode** the accepted price becomes the catalog record's sticky price. **Second-hand** copies are priced individually and never set a sticky price.
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
| Tax | Yes | Manual (decision 27) |
| Freight | Yes | Manual (decision 27) |
| Miscellaneous | Yes | Manual |
| **Total** | Yes | Derived; an adjustment beyond ±2% raises a review flag (decision 35) |

18. System compares the **derived subtotal** against the supplier's stated subtotal (entered at step 6). A mismatch raises a **discrepancy warning**. The employee may accept it and proceed, which raises a review flag (decision 35).
19. Employee may review lines and **remove** an individual record before finalizing, or defer the problem to E-04.
20. Employee may flag the invoice as **needing a return or credit claim** (handled in E-04).
21. The ±2% total adjustment absorbs rounding differences against the supplier's paperwork. The delta is recorded as a **standalone line flowing into cost of goods** — it does not redistribute across item costs. Adjustments **beyond ±2% proceed and raise a review flag** (decision 35): ±2% is now the threshold at which a manager is told, not a wall.
22. On finalize: all line items become **sellable inventory**, each carrying the supplier's consignment flag as it stood at this moment (decision 33); the invoice is written to the invoices database; and a **letter-size** summary prints from the browser.
23. A finalized Invoice stays correctable — a misread cost, a carton that turns up late — until a manager marks it **paid** in [M-05](M-05-accounts-payable.md); a line whose copy has already sold cannot be removed (decision 4). A **paid** Invoice is **immutable**: voids and amendments are manager-only and handled in E-04, appended as a separate artifact against the original record (decision 40).

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

**Rounding.** The system **suggests** a price ending in `.50` or `.99`, always rounded up. This is a default, not a rule — any amount the employee enters is accepted (decision 32).

| Cents | Suggested |
|---|---|
| `.00` – `.50` | round up to `.50` |
| `.51` – `.99` | round up to `.99` |

`$23.00 -> $23.50` · `$23.47 -> $23.50` · `$23.50 -> $23.50` · `$23.51 -> $23.99` · `$23.99 -> $23.99`

**Guardrail.** An employee may set a price below cost; doing so raises a **review flag** for the manager rather than blocking the action (decision 35).

---

## Cost treatment

Freight, tax, and miscellaneous costs are held at the **invoice level** and are **not allocated down to individual items**. There is no landed-cost calculation: an item's cost is its supplier `Ext. Price` and nothing more.

**Inbound tax is excluded from cost of goods** (decision 34, amending decision 17): `invoice_cogs = subtotal + freight + misc`. Tax stays on the Invoice for what is owed the supplier and reports separately as recoverable input tax. GST and QST are Input Tax Credits — a receivable from the government, not a cost of the goods.

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
| 27 | **There is no invoice photography and no document extraction** — invoice-level totals are entered manually. **Supersedes decision 15** and removes the InvoiceScan entity ([architecture](../architecture.md) A-13) |
| 28 | **One Invoice may span several PurchaseOrders.** The link lives on the invoice *line*, not the Invoice, because suppliers ship several POs in one box (A-20) |
| 29 | **Receiving opens on a worklist** of outstanding PurchaseOrder lines across all open POs, searchable by title or barcode and filterable by PO (A-21) |
| 30 | **Backorders are derived, not stored** — ordered minus received against that PO line across *every* Invoice. Closes the backorder-mechanics open question (A-20a) |
| 31 | **The invoice number is optional and is a lookup, not a collision check.** Blank auto-mints from a store counter; a match on a draft resumes it; a match on a finalized Invoice opens it read-only. Second-hand intake runs under a dedicated supplier, closing the second-hand numbering open question (A-22) |
| 32 | **`.50` / `.99` rounding is a suggestion, never a constraint.** **Amends decision 9** from a rule to a default; any amount is accepted (A-24) |
| 33 | **`Supplier` carries a consignment flag**, copied onto each InventoryItem at finalize rather than read through a join, since settings changes are never retroactive ([M-06](M-06-settings.md) d8). The consignment program itself is future work (A-26) |
| 34 | **Inbound tax is excluded from cost of goods.** **Amends decision 17** — GST and QST are Input Tax Credits, a receivable rather than a cost. Closes the tax-in-COGS open question (A-29) |
| 35 | **Below-cost pricing and adjustments beyond ±2% proceed and raise a review flag** rather than blocking. **Amends decisions 10 and 19**: the manager override is replaced by a review queue across the system ([M-04](M-04-manage-users.md) d8, A-28) |
| 36 | **Receiving history is browsable** — past Invoices are searchable by supplier, number, date, title, or barcode and open as they were finalized. Decision 23's immutability is what makes "as-was" trivially true (A-27) |
| 37 | **The reconcile figures stay on screen for the whole invoice, and lines carry cover art.** Receiving is laid out as an outstanding-orders rail, an art-led line table, and a reconcile strip pinned to the bottom of the viewport. The strip is what makes the footer placement safe: derived vs. stated is the check step 18 turns on, and on a 50–100 line invoice a footer that scrolled away would hide it exactly when it matters. Cover art leads each line because staff recognise a sleeve faster than a catalogue number; art is a stored URL ([architecture](../architecture.md) A-14) and the provider misses often, so the **missing state is designed** — a marked placeholder, never a broken image |
| 38 | **Receiving is laid out as the till's three tracks, and the reconcile figures move to a sticky right-hand track.** **Amends decision 37**, which placed them in a strip pinned to the bottom of the viewport. The frame becomes [E-05](E-05-sell-a-record.md) d29's: a retractable worklist slab, the Invoice, and reconcile — each scrolling on its own, the frame never scrolling. d37's reason is unchanged and better served: derived vs. stated never scrolls away at any line count, where a footer competed for vertical room with the line table above it. Below 1180px the reconcile track falls back to d37's own bottom strip, so the narrow-screen arrangement is the one d37 described. Accepted consequence: the line table loses roughly 390px of width, which is what pushes cost-vs-price detail onto two lines per row on a small counter display |
| 39 | **A second-hand intake with no supplier paperwork mints `SH-YYMMDD-n`.** **Amends decisions 1 and 31**, which drew `REF####` from a store counter. The reference states the day the stock arrived, which is the only fact a walk-in trade-in reliably has; `-n` sequences a second intake on the same day. `(supplier, invoice_number)` uniqueness is unaffected — second-hand still runs under its dedicated Supplier (d31). Accepted consequence: the reference is no longer globally ordered by mint time, so two intakes on one day sort by sequence rather than by clock ([architecture](../architecture.md) A-32) |
| 40 | **A finalized Invoice stays editable until it is marked paid; immutability attaches at paid, not at finalize.** Resolves a contradiction between **decision 4** (lines and totals stay editable after finalize, until a manager marks the Invoice paid in [M-05](M-05-accounts-payable.md)) and **decision 31** plus Phase 3 step 23 (a finalized Invoice is read-only and immutable). Decision 4 governs, because the case it exists for is real — a cost is misread, a carton turns up a day late — and [M-05](M-05-accounts-payable.md) already assumes an amount that can change before settlement. Steps 4 and 23 are corrected above. On screen this is what keeps the scan slab present on a **Finalized** Invoice and removes it only at **Paid** ([architecture](../architecture.md) A-33) |
| 41 | **The reconcile track is 320px, and every figure on a line keeps its own column.** **Amends decision 38's accepted consequence**, which put the track at the till's 386px and folded cost-vs-price onto two lines per cell to pay for it. The till's money rail is 386 because the amount due has to be readable from the customer's side of the counter; nobody reads an invoice total from across the shop, so that width was inherited rather than earned. Returning 66px to the line table is enough for List, Disc%, Sell and Margin to stand as separate columns — a stacked cell saved width but had to be read twice. The Record column takes what the figures leave and clips to one line: the count of lines visible at once is what makes a 60-line shipment readable, so vertical space is the scarcer resource, and a sleeve plus the first few words is how staff recognise a title anyway |
| 42 | **The outstanding-orders worklist lives in the Invoice track, scoped to the open Invoice's Supplier, and stays browsable.** **Amends decisions 29 and 38**, which put it in the left slab and had Receiving open on it. The slab mixed two kinds of thing — Invoices you resume and PurchaseOrder lines you receive against — behind one search box, so neither could be searched properly. Supplier scoping is not a narrowing: d29's "across all open POs" exists because suppliers ship several POs in one box (d28), and one Supplier's open POs is exactly that set; [M-02](M-02-reorder-inventory.md) already reads d29 this way. **Browsable, not only scan-triggered**, because two cases have no barcode to match on: seeing what has *not* turned up out of a part-shipped box, which a scan cannot answer because it is a negative; and an unbarcoded copy (step 8), whose only route to its PO line is being picked from a list — without which its line carries no `fromOrderId` and d30's derived backorder never closes. A Second-hand intake shows the panel empty rather than hiding it, so the screen has one shape |
| 43 | **Invoice search gains PO number.** **Extends decision 36**, whose fields — supplier, number, date, title, barcode — all stand and keep their meaning: a title or barcode lists the Invoices that took that copy in. PO number joins them because d28 lets one Invoice span several POs, and "which invoice did PO-1142 arrive on" is a question only the Invoice side can answer |

---

## Open questions

- ~~**Backorder mechanics**~~ — **Resolved** by decision 30: outstanding quantity is derived from the PO line across every Invoice.
- ~~**Tax in COGS**~~ — **Resolved** by decision 34: inbound tax is excluded.
- ~~**Supplier-specific extraction**~~ — **Moot.** Decision 27 removes extraction entirely.
- ~~**Second-hand invoice numbering**~~ — **Resolved** by decision 31: a dedicated supplier plus auto-minted numbers.
