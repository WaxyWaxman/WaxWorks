# Wax Works — Lexicon

**Status:** Draft
**Last updated:** 2026-09-09

The controlled vocabulary for Wax Works. When a term below has a **canonical** form, use
exactly that form in the PRD, flow documents, reference material, commit messages, issue
threads, UI copy, and **any prompt written to drive an LLM against this project**. The
"Avoid" column lists near-synonyms that have shown up or are tempting — they are not
wrong English, they are just not *our* word, and drift between them makes the spec harder
to read and search.

Sourced from [`PRD.md`](PRD.md), the [`flows/`](flows/) documents, and
[`reference/`](reference/).

---

## 1. Product and platform

| Canonical | Meaning | Avoid |
|---|---|---|
| **Wax Works** | The product. Two words, both capitalised, in all prose. | "Waxworks", "WaxWorks" in prose (the repo/package identifier `WaxWorks` is a separate thing — see §9) |
| **point-of-sale (POS)** | Front-of-counter selling. Hyphenated; abbreviate as `POS` after first use. | "point of sale", "PoS" |
| **inventory management** | Back-of-house stock workflow. | "stock control", "warehouse management" |
| **independent vinyl record store** | The customer. | "record shop", "music store" |
| **multi-store** / **multiple stores** | The system serves more than one store; every entity scopes to one. Adjective is `multi-store`; the fact is stated as "the system is **multi-store**" or "serves **multiple stores**". | "multi-tenant" in prose (it *is* the mechanism, but the docs say multi-store), "multi-branch", "chain" |
| **till** | The physical register position where a sale is rung up. | Pick one of `till` / `register` project-wide — currently both appear (see §10). |

---

## 2. Roles and access

| Canonical | Meaning | Avoid |
|---|---|---|
| **Employee** | Front-line role. Capitalised when naming the role or an `Actor`. | "staff", "clerk", "cashier", "associate", generic "user" |
| **Manager** | Elevated role; assumed superset of Employee for now. Capitalised. | "admin", "supervisor", "owner" (an owner/admin tier above Manager is an open question in M-04, not a synonym) |
| **User** | An Employee or a Manager, scoped to a store. Use only when the statement is true for both roles. | "account", "login", "operator" |
| **manager override** | The mechanism gating certain Employee actions (below-cost pricing, invoice adjustments beyond ±2%, voiding a finalized invoice). Lowercase in running text; its mechanics live in [M-04](flows/M-04-manage-users.md). | "manager approval", "supervisor sign-off", "elevated permission" |

---

## 3. Domain entities

Entity names are **PascalCase with no space** when referring to the modelled thing
(`InventoryItem`); the everyday word is lowercase (`a physical copy`). Defined in
[PRD §4](PRD.md).

| Canonical | Meaning | Avoid |
|---|---|---|
| **Store** | Tenant boundary. Inventory, invoices, suppliers, users, and reporting all scope to a Store. | "location", "site", "tenant" in prose |
| **Record** | The catalog entry / the pressing — artist, title, label, catalog no., format, year, genre, cover art. Not a physical object. | "album", "title", "release", "SKU" when the pressing is meant |
| **the pressing** | Plain-language synonym for Record, used when contrasting with a physical copy. | "edition", "issue" |
| **InventoryItem** | One physical copy of a Record — its own condition, cost, price, status. Created by receiving, consumed by sale. | "stock item", "unit" (OK loosely), "SKU", "product" |
| **copy** | Everyday word for an InventoryItem. | — |
| **Barcode** | A manufacturer UPC/EAN, or a store-generated internal barcode. Maps to a Record (new) or an individual InventoryItem (second-hand). | "SKU", "product code" |
| **internal barcode** | Store-minted barcode for unbarcoded stock — UPC-A under GS1 number system `2`. | "internal SKU", "custom code", "house barcode" |
| **Supplier** | Source of stock. Carries manager-set margin config. Employees may create one; only a Manager sets its margin. | "vendor", "distributor" (F.A.B. *is* a distributor, but the entity is Supplier), "wholesaler" |
| **Invoice** | Inbound receiving document. `draft` or `finalized`; immutable once finalized. Keyed by `(supplier, invoice_number)`. Holds invoice-level freight / tax / misc. | "bill", "receipt" (a receipt is customer-facing — see §7), "PO" |
| **InvoiceLine** | One received item on an Invoice — links a Record, its cost (`Ext. Price`), accepted retail price, condition. | "line item", "order line" (OK as loose prose, but the entity is InvoiceLine) |
| **InvoiceScan** | Photograph of the supplier's paperwork plus extracted invoice-level totals. Assistive only, never a source of truth. | "OCR result", "invoice import" |
| **CostAdjustment** | The bounded ±2% reconciliation delta. A standalone line flowing into cost of goods; does not redistribute across item costs. | "rounding line", "correction", "write-off" |
| **Backorder** | Units ordered but not shipped — the supplier's `Balance`. Tracked until fulfilled. | "backlog", "negative inventory" (a *different* concept — see §6) |
| **PurchaseOrder** | Manager-created reorder (M-02). Triggers Discogs metadata prefetch. Abbreviate as `PO` / "purchase order" in prose. | "order", "restock request" |
| **Sale** / **Transaction** | A completed checkout (E-05). | "order", "ticket" |
| **Return** | Reversal of a Sale (E-06). A *customer* return. A supplier-side return is a "return or credit claim" — see §5. | "refund" (the refund is one outcome of a Return), "RMA" |

### Catalog vs. copy

Say **"a Record is the pressing; an InventoryItem is a physical copy."** Two used copies
of one pressing **share a Record** but are **distinct InventoryItems**.

---

## 4. Receiving (E-02)

| Canonical | Meaning | Avoid |
|---|---|---|
| **receive** / **receiving** / **inbound receiving** | The E-02 workflow: intake a shipment, identify each record, price it, reconcile against the supplier's invoice. | "intake" as the flow name (OK as a verb), "goods-in", "check-in" |
| **intake mode** | The New-stock / Second-hand choice, made once per Invoice. No mixed invoices. | "receiving type", "stock type" |
| **New stock** / **New mode** / **New** | Intake mode for newly distributed records. Capital `N`. Condition defaults to Mint/Sealed; accepted price becomes the Record's sticky price. | "new inventory", lowercase "new" when the mode is meant |
| **Second-hand** / **Second-hand mode** | Intake mode for pre-owned copies. Hyphenated; capital `S` at sentence start, `second-hand` mid-sentence. Condition graded per copy; never sets a sticky price. | "used" as the canonical term (`used copy` is tolerated in loose prose), "pre-owned", "secondhand" (no hyphen), "trade-in" |
| **shipment** | The physical delivery from a supplier. | "consignment" (that word means something specific and out-of-scope), "delivery", "parcel" |
| **reconcile** / **reconciliation** | Checking the received batch against the supplier's invoice totals. | "balance", "audit", "match up" |
| **draft** | Invoice state before finalize. Persists immediately; abandonable and resumable. Lowercase. | "pending", "in progress", "unsaved" |
| **finalize** / **finalized** | Committing the Invoice: all lines become sellable inventory, the Invoice is written to the invoices database, a letter-size summary prints. American spelling. | "finalise", "close", "submit", "post", "commit" |
| **immutable** | A finalized Invoice cannot be edited. Voids and amendments are manager-only and appended as a separate artifact against the original record. | "locked", "read-only", "frozen" |
| **void** | Manager-only cancellation of a finalized Invoice (handled in E-04). | "delete" (a *draft* is deleted; a *finalized* Invoice is voided), "cancel", "reverse" |
| **amend** / **amendment** | Manager-only change to a finalized Invoice, appended as a separate artifact — never an in-place edit. | "edit", "correct", "revise" |
| **discrepancy warning** | Raised when the derived subtotal ≠ the supplier's stated subtotal. Employee may override. | "mismatch error", "validation error", "alert" |
| **return or credit claim** | Flag an Employee can set on an Invoice during receiving; the handling lives in E-04. Distinct from a customer **Return** (§3). | "supplier return", "RMA", "chargeback" |
| **sellable** / **sellable inventory** | The state a line reaches only on Invoice finalization. | "available", "live", "active", "in stock" (an item can be in stock and not yet sellable) |
| **receiving desk** | Physical station where scanning happens; has a label printer. | "goods-in bench", "intake station" |
| **label printer** | Prints internal barcodes at the receiving desk. | "barcode printer" (OK), "sticker printer" |
| **letter-size summary** | The printout produced on finalize. | "receipt", "report", "A4 summary" (it is letter, not A4) |
| **negative inventory** | Selling a physical copy before its Invoice is finalized drives the count below zero; E-05 must allow it, E-04 reconciles it. | "oversell", "backorder" (§3), "stock-out" |

---

## 5. Pricing and costs (E-02, M-01)

| Canonical | Meaning | Avoid |
|---|---|---|
| **cost** | The supplier's **post-discount unit price** — the `Ext. Price` column, *not* the list `Price`. Entered or confirmed on **every** receipt; never silently reused. | "unit price", "wholesale", "net price" (say `Ext. Price` or "post-discount unit price") |
| **`Ext. Price`** | The invoice column that *is* our cost. Quote it verbatim, including the period. | "extended price" spelled out, "ext price" |
| **list price** / **pre-discount list price** | The supplier's `Price` column, before `-%` discount. The basis for suggested retail. | "RRP", "MSRP", "sticker price" |
| **supplier margin** | Manager-set markup for a Supplier. In formulas: `supplier_margin`. | "markup rate", "margin percentage", "uplift" (uplift is a candidate *mechanism* in M-01, not a synonym) |
| **suggested retail** / **suggested retail price** | `round_up(list_price x (1 + supplier_margin))`. Priced off the **pre-discount list price**, so supplier discounts are captured as margin. | "recommended price", "auto price", "calculated price" |
| **sticky retail price** / **sticky price** | The retail price stored on a Record and pre-filled on the next receipt. **New stock only.** Always visible and editable; never applied silently. | "saved price", "default price", "last price" |
| **shelf price** | Any customer-facing price. Always ends in `.50` or `.99`, always rounded up. | "retail price" when the rounding rule is the point, "display price" |
| **round up** / `round_up` | Rounding is always upward, to the next `.50` or `.99`. | "round", "round to nearest" |
| **below-cost pricing** | Setting a shelf price under cost. Blocked for Employees; requires a manager override. | "loss pricing", "negative margin" |
| **guardrail** | The rule that an Employee cannot price below cost. | "validation", "limit" |
| **cost of goods** / **COGS** | Where cost, tax, and the CostAdjustment land. | "cost of sales", "landed cost" (§ below) |
| **landed cost** | The allocation of freight/tax/misc down to items — **explicitly not done**. Say "there is no landed-cost calculation". | using "landed cost" to mean plain cost |
| **freight** | Invoice-level shipping charge. Often unlabeled on the paperwork; derivable as `Total − Sub-Total − Tax`. Lowercase. | "shipping", "postage", "carriage" |
| **tax** | Invoice-level. On the reference invoice this is Canadian **GST** + **QST**. | "VAT", "sales tax" when GST/QST is meant |
| **miscellaneous** / **misc** | Invoice-level manual cost bucket. | "other", "adjustments" |
| **subtotal** | Sum of line costs. Distinguish **derived subtotal** (our sum of entered costs) from the supplier's **stated subtotal** (`Sub-Total` on their paperwork). | "net total", "goods total" without the derived/stated qualifier |
| **±2%** | The bounded tolerance on the Invoice total adjustment. Beyond it → manager override. Write it as `±2%`. | "2 percent", "small adjustment", "rounding tolerance" |

---

## 6. Condition and grading

| Canonical | Meaning | Avoid |
|---|---|---|
| **Goldmine scale** | The grading standard. Grades, highest to lowest: **M, NM, VG+, VG, G+, G, F, P**. Use these exact abbreviations. | "Discogs grading", spelled-out "Very Good Plus", other scales |
| **condition grade** / **grade** | The per-copy Goldmine value. Required for every Second-hand item. | "quality", "rating", "state" |
| **Mint/Sealed** | The condition a New-stock item defaults to. Written with the slash. | "Mint", "Sealed", "New" used as a grade |
| **sleeve** / **vinyl** | The two parts a grade may (open question) apply to separately. | "jacket" for sleeve, "disc"/"record" for vinyl |

---

## 7. Selling and returns (E-05, E-06)

| Canonical | Meaning | Avoid |
|---|---|---|
| **Sale** / **Transaction** | A completed checkout. | "order", "purchase" (the customer purchases; the store records a Sale) |
| **checkout** | The act of ringing up and taking payment. | "cash out", "sale process" |
| **Return** | A *customer* bringing back a sold record for refund or exchange. Supplier-side is a "return or credit claim" (§5). | "refund" as the whole flow, "exchange" as the whole flow |
| **receipt** | The customer-facing proof of Sale (E-05). Never used for inbound documents — those are Invoices. | "invoice" for the customer's copy |

---

## 8. Catalog metadata and Discogs

| Canonical | Meaning | Avoid |
|---|---|---|
| **Discogs** | The external catalog metadata source. Capital `D`. Referenced as "the Discogs API". | "discogs", "the catalog service" |
| **catalog** | Record metadata as a whole. American spelling throughout. | "catalogue" |
| **catalog number** | Metadata field captured in manual entry (label's release number, e.g. `JAG485`). | "cat no." inconsistently, "catalogue number" |
| **local-first** | Barcode resolution checks the local database before calling Discogs. Outcomes are a **local hit** or a **local miss**. | "cache-first", "offline-first" |
| **resolve** / **resolver** | Turning a scanned Barcode into a catalog Record. | "look up" as the noun, "match" |
| **prefetch** | Bulk fetch of Discogs metadata at PO time so receiving hits locally. One word, no hyphen. | "pre-fetch", "pre-load", "sync", "bulk import" |
| **manual entry fallback** / **manual catalog entry** | Operator types metadata when there is no match: **artist, album title, genre, catalog number, label**. | "manual override", "free-text entry" |
| **picker** | The chooser shown when Discogs returns multiple matches. | "disambiguation dialog", "selector" |
| **cover art** | Captured once at receiving as a snapshot; **not re-synced**. | "artwork sync", "album image" |

---

## 9. Barcodes (PRD §4.3)

| Canonical | Meaning | Avoid |
|---|---|---|
| **internal barcode** | Store-minted code for unbarcoded stock. | "internal SKU", "house code" |
| **UPC-A** | The symbology used for internal barcodes. | "UPC" unqualified when the 12-digit form matters, "EAN-13" |
| **GS1 number system `2`** | The reserved prefix for in-store codes — never issued to manufacturers, so collision is structurally impossible. | "prefix 2" without the GS1 framing, "private range" |
| **store code** | The 2-digit segment identifying the store within the internal barcode. | "store ID", "branch code" |
| **check digit** | The trailing UPC-A mod-10 digit. | "checksum digit", "control digit" |
| **symbology** | A barcode format (UPC-A, Code 128, DataMatrix, QR). | "barcode type" loosely, "encoding" |
| **manufacturer UPC** / **UPC/EAN** | A barcode issued by the manufacturer and printed on the sleeve. | "retail barcode", "factory barcode" |

---

## 10. Documentation structure

| Canonical | Meaning | Avoid |
|---|---|---|
| **Jobs to be Done** | The section of the PRD listing the flows. | "user stories", "use cases" |
| **flow** | One documented user journey, one file, stable ID. | "workflow", "journey", "feature" (a flow is not a feature) |
| **Flow ID** | `E-` for Employee jobs, `M-` for Manager jobs. Stable once assigned. | renumbering, re-lettering |
| **Actor** | The role a flow is written for: `Employee` or `Manager`. | "persona", "user type" |
| **Resolved decisions** | The numbered, citable decision table in each flow. Cite as "E-02 decision 14". Append, never renumber. | "decisions log", "ADR" |
| **Open questions** | Genuinely undecided points. | "TODOs", "issues" |
| **Inherited from other flows** | Commitments pushed into this document by another flow. **Decided, not open.** | "dependencies", "related decisions" |
| **Status** | One of `Stub`, `In clarification`, `Specified`. Exact casing. | "Draft", "Done", "WIP" as flow status values |

---

## 11. Reference-invoice column names

Quote these **verbatim** (casing, spacing, punctuation) when citing the F.A.B. worked
example in [`reference/supplier-invoice-fab.md`](reference/supplier-invoice-fab.md):

`Item` · `Comments` · `Format / Packaging` · `QTY Ordered` · `QTY Shipped` · `Balance` ·
`Price` · `-%` · `Ext. Price` · `Total` · `Sub-Total` · `GST` · `QST`

- **`QTY Shipped`** is what gets billed, not `QTY Ordered`.
- **`Balance`** is the supplier's own backorder figure — the source for our **Backorder**.
- **`Ext. Price`** is our **cost**.

---

## 12. Spelling and formatting conventions

- **American spelling:** `catalog`, `finalize`, `behavior`, `normalize`. Not `catalogue`,
  `finalise`, `behaviour`.
- **Dates** normalize to `DD/MM/YYYY` internally, regardless of the supplier's format.
- **Money** is written with a currency symbol and two decimals: `$27.99`. The reference
  invoice currency is **CAD**.
- **Multiplication** in formulas is written with `x` (matching the existing docs), e.g.
  `list_price x (1 + supplier_margin)`.
- **Entity names** in PascalCase (`InventoryItem`, `PurchaseOrder`); plain nouns
  lowercase (`a copy`, `the invoice`).

---

## 13. Notes to reconcile

Genuine inconsistencies in the current docs that a decision should settle — until then,
prefer the first form:

1. **"Wax Works" vs "WaxWorks".** The PRD and docs use *Wax Works* (two words); the root
   `README.md`, the repo, and the GitHub org use *WaxWorks*. Keep *Wax Works* for prose;
   treat *WaxWorks* as the code/repo identifier only.
2. **"till" vs "register".** [E-01](flows/E-01-authenticate.md) uses *register*; the PRD
   §4.3 and [E-05](flows/E-05-sell-a-record.md) use *till*. Pick one.
3. **"second-hand" vs "used".** The PRD and E-02 standardise on *second-hand*;
   [E-04](flows/E-04-manage-inventory.md) and [E-06](flows/E-06-process-a-return.md) say
   *used records*. Prefer *second-hand*.
4. **"behaviour"** appears once in [M-01](flows/M-01-supplier-margin.md); every other
   spelling in the docs is American. Should be *behavior*.
