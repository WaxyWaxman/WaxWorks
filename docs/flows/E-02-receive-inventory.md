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
2. Employee selects the **supplier**. If the supplier doesn't exist, the employee may create one — but may **not** set its margin (manager-only, see M-01).
3. Employee enters the **supplier's invoice number** (printed on their paperwork). For second-hand intake with no supplier paperwork, the employee may enter a custom invoice number.
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
12. Employee accepts or overrides the price. Below-cost pricing requires a manager override. In **New mode** the accepted price becomes the catalog record's sticky price. **Second-hand** copies are priced individually and never set a sticky price.
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
21. The ±2% total adjustment absorbs rounding differences against the supplier's paperwork. The delta is recorded as a **standalone line flowing into cost of goods** — it does not redistribute across item costs. Adjustments **beyond ±2% require a manager override**.
22. On finalize: all line items become **sellable inventory**, the invoice is written to the invoices database, and a **letter-size** summary is printed.
23. A finalized invoice is **immutable**. Voids and amendments are manager-only and handled in E-04, appended as a separate artifact against the original record.

---

## Pricing rules

**Cost** is the supplier's **post-discount unit price** — the `Ext. Price` column, not the list `Price`.

**Suggested retail** is computed from the **pre-discount list price**:

```
suggested_retail = round_up(list_price x (1 + supplier_margin))
```

Pricing off list rather than net means a supplier discount is captured as additional margin rather than passed through as a lower shelf price. When there is no discount the two prices are identical, so this is a single rule with no branch.

> Worked example — list `$27.99`, 10% supplier discount, 60% margin:
> cost = `$25.19` · suggested retail = `27.99 x 1.60` = `$44.78` → **`$44.99`**
> (Pricing off net cost would have given `$40.50` and surrendered the discount.)

**Rounding.** Every shelf price ends in `.50` or `.99`, always rounded up:

| Cents | Result |
|---|---|
| `.00` – `.50` | round up to `.50` |
| `.51` – `.99` | round up to `.99` |

`$23.00 -> $23.50` · `$23.47 -> $23.50` · `$23.50 -> $23.50` · `$23.51 -> $23.99` · `$23.99 -> $23.99`

**Guardrail.** An employee cannot set a price below cost; a manager override is required.

---

## Cost treatment

Freight, tax, and miscellaneous costs are held at the **invoice level** and are **not allocated down to individual items**. There is no landed-cost calculation: an item's cost is its supplier `Ext. Price` and nothing more.

Consequence to accept knowingly: per-item margin reporting reflects only supplier cost, so true blended margin across a shipment will be slightly overstated. On the reference invoice, `$52.00` freight against `$2014.34` of goods is roughly 2.6%.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Invoice numbers are supplier-provided and unique per `(supplier, invoice_number)` — not globally |
| 2 | Both invoice date and received date are captured; all dates normalize to `DD/MM/YYYY` |
| 3 | Employees can create suppliers but never set margins |
| 4 | Invoices are draft-persisted and resumable; deletable before finalize, void-only-by-manager after |
| 5 | Catalog lookup is local-first with Discogs as fallback; metadata is bulk-prefetched at PO time, with live lookup at the receiving desk as an accepted fallback |
| 6 | Cover art is a one-time snapshot, not re-synced |
| 7 | Cost is the supplier's post-discount `Ext. Price` |
| 8 | Suggested retail is priced off the **pre-discount list price**: `list x (1 + supplier margin)` — supplier discounts are captured as margin |
| 9 | Every shelf price ends in `.50` or `.99`, rounded up |
| 10 | Employees cannot price below cost without a manager override |
| 11 | Sticky retail pricing applies to **New stock only**; second-hand copies are priced per copy |
| 12 | Sticky prices pre-fill but are always confirmable and editable |
| 13 | Cost is entered or confirmed on every receipt — never reused silently from a prior shipment |
| 14 | Barcode-to-invoice-SKU matching is **manual**; the employee reads the paperwork and enters cost per line |
| 15 | Photo extraction yields invoice-level totals only, and is assistive — all fields stay editable |
| 16 | Freight, tax, and misc stay at invoice level; no per-item landed cost |
| 17 | Tax **is** included in cost of goods |
| 18 | Derived-vs-stated subtotal mismatch raises a discrepancy warning, overridable by the employee |
| 19 | Total adjustments beyond ±2% require a manager override |
| 20 | Inventory becomes sellable only on invoice finalization |
| 21 | E-05 must support **negative inventory** so a physical copy can be sold before it is received into the system |
| 22 | Intake mode (New / Second-hand) is selected once per invoice — no mixed invoices |
| 23 | Backorders are tracked by the system |
| 24 | Manual catalog entry captures artist, album title, genre, **catalog number**, and **label** |
| 25 | Payment and accounts-payable are out of scope |

---

## Open questions

- **Backorder mechanics:** the system tracks backorders (decision 23), but the lifecycle is unspecified. Does a `Balance` quantity become an expected receipt that auto-matches when it arrives on a later invoice? Does it feed reorder suggestions in M-02? Can it be cancelled?
- **Tax in COGS:** decision 17 includes tax in cost of goods. In Canada GST is an input tax credit and is normally recoverable, so including it will overstate COGS by ~5%. Worth confirming with an accountant before build.
- **Supplier-specific extraction:** since layouts vary, does the system need per-supplier extraction profiles, or a general-purpose model? Affects whether onboarding a new supplier requires configuration work.
- **Second-hand invoice numbering:** custom invoice numbers for second-hand intake need a collision-safe convention.
