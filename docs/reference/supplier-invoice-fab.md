# Reference — Anatomy of a supplier invoice

Derived from **F.A.B. Distribution** invoice `293441` (Melodiya, 2026-03-09, 60 lines).

> **Layouts vary by supplier.** This is one worked example, not a template to parse against. Treat the findings below as a guide to what these documents contain, not as a schema.

Used by [E-02 Receive inventory](../flows/E-02-receive-inventory.md).

---

## Document structure

**Header** — invoice number (labeled *Invoice Number*, or *Web Reference* on this supplier), date, ship via, payment method, P/O number, bill-to / ship-to, supplier account number.

**Line columns**

| Column | Meaning |
|---|---|
| `Item` | Artist name |
| `Comments` | Supplier SKU / catalog number |
| `Format / Packaging` | `EA` throughout on this invoice |
| `QTY Ordered` | Units requested |
| `QTY Shipped` | Units actually sent — **this is what gets billed** |
| `Balance` | Units still owed (backorder) |
| `Price` | Supplier list price per unit |
| `-%` | Discount off list |
| `Ext. Price` | Net unit cost after discount — **this is our cost** |
| `Total` | Line total |

**Totals** — Sub-Total, GST, QST, Total.

---

## Verified properties

| Property | Finding |
|---|---|
| Billing basis | **QTY Shipped**, not QTY Ordered. Backordered units are not billed. |
| `Balance` column | Units still owed — the supplier's own backorder record. |
| Freight | `$52.00`, **not printed in any labeled field**. Derivable as `Total − Sub-Total − GST − QST`. |
| Tax base | GST is exactly 5% of `Sub-Total + Freight` — freight sits inside the taxable base. |
| Item identifiers | Supplier SKUs, mixed: mostly label catalog numbers (`JAG485`, `MODVL161`), occasionally real UPC/EANs (`5099969330018`). **No barcode column.** |
| Artist ambiguity | Three separate Tame Impala lines at `$32.59`, `$41.49`, `$32.59`; five `soundtrack` lines. Artist name alone cannot identify a line. |
| Multi-quantity lines | Common — quantities of 2, 3, and 4 appear throughout. |
| Date format | `MM/DD/YY` on this supplier. Normalize all dates to `DD/MM/YYYY` internally. |
| Currency / tax regime | CAD, Canadian GST + QST. |

---

## Derived rules

**Freight fallback.** When freight is not explicitly stated:

```
freight = Total − Sub-Total − Tax
```

Exact on this invoice. Being a residual, it will absorb any other unlabeled charge.

**Tax base ordering.** Lines → subtotal → add freight → tax the sum. Verified: `(2014.34 + 52.00) x 0.05 = 103.32` to the penny.

---

## Why barcode-to-line matching was rejected

The invoice carries no barcodes, and the SKU column mixes label catalog numbers with occasional UPC/EANs — so a scanned sleeve barcode has no reliable key back to an invoice line. Artist name doesn't disambiguate either, given three Tame Impala lines at three different prices on this one document.

Hence E-02 decision 14: the employee reads the paperwork and enters cost per line manually.

---

## Extraction reliability note

Automated text extraction of this **clean digital PDF** misread one line by `$55.98` — reporting the Funkadelic `ORGM2329` line at `$83.97` (3 × `$27.99`, the ordered quantity) when the reconciled subtotal proves it was billed at `1 × $27.99`.

If extraction is unreliable on a digital PDF, it will be less reliable on a photograph. This is the evidence behind E-02 decision 15: extraction is assistive, every field stays editable, and the derived-vs-stated subtotal check (step 18) is the safety net.
