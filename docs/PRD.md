# Wax Works — Product Requirements Document

**Status:** Draft
**Last updated:** 2026-09-08
**Owners:** sr-talbot, WaxyWaxman

This document is the spine: product context, users, domain model, and cross-cutting concerns. Individual user flows live in [`flows/`](flows/) — see §3. The controlled vocabulary lives in [`lexicon.md`](lexicon.md) — use its canonical terms here and in every flow.

---

## 1. Overview

### 1.1 Summary

Wax Works is a point-of-sale (POS) and inventory management system for small, independent vinyl record stores. It handles the front-of-counter selling workflow and the back-of-house stock workflow in one system, and serves **multiple stores**.

### 1.2 Problem statement

Small and medium record do not have a way to manage their inventory. They don't know what stock they have, if it is selling, or the shrinkage. This prohibits selling online, determining market trends, or finding a record in store for a customer. 

### 1.3 Goals

- G-1: Employees know what is in stock so they can help a customer buy a vinyl or order one to the store for the customer to pick up later.
- G-2: Administrators know what stock is selling so they can analyze market trends and ensure top sellers are stocked at a good price.
- G-3: Employees can easily process new vinyl to get them on the floor quickly and resolve any issues with order - like poor condition, a missing vinyl, or other supplier mistakes.
- G-4: Admins can enforce vinyl pricing across time to ensure a predictable margin and review individual customer behavior to provide incentives and credit. 
- G-5: Employees can look-up a customer to help them return an item without a receipt, place holds for them, or provide in-store credit.

### 1.4 Non-goals

- NG-1: This is not an online store right now, but will be in the future. 
- NG-2: There is no customer loyalty program.
- NG-3: This system will not directly integrate with supplier systems.
- NG-4: This system does not integrate a payment processor. It never holds card details and never moves money. Tender types — including card — are **recorded** at the till for reconciliation and reporting ([E-05](flows/E-05-sell-a-record.md)), and cards are settled on a separate terminal.

---

## 2. Users

### 2.1 Employee

Employees are members of staff that work at the record store. They have high agency, there are only a few Manager only tasks. Their Jobs to Be Done include, but are not limited to:
- Searching the store inventory to determine if a vinyl is in stock, on back-order, or out of stock. 
- Processing a vinyl sale in person
- Helping a customer retrieve a vinyl that they have placed a "hold" on via phone or email
- Inventory receiving, including but not limited to: scanning in new vinyl, pricing vinyl, checking that the inventory is correct for a given invoice, restocking, initiating re-ordering, and initiating a refund request from a supplier for an issue.

### 2.2 Manager

The Manager aims to empower their employees to help make good decisions and sometimes needs to provide an override. They also need to look at inventory and customer trends so they can make business decisions. Their Jobs to Be Done include, but are not limited to: 
- Setting a default suggested supplier margin for a given vinyl
- Administering the system
- Reviewing all of the pending re-orders that are initiated by employees to confirm the final order to the supplier.
- Reviewing trends in inventory sales to determine top selling vinyl, genres, or artists.
- Reviewing trends in customer behavior to determine who their top customers are by quantity or life-time value. 

The Manager inherits all Employee capabilities (superset).

**Manager override** is a recurring mechanism — several employee actions are gated behind it (below-cost pricing, invoice adjustments beyond ±2%, voiding a finalized invoice). Its mechanics are defined in [M-04](flows/M-04-manage-users.md).

---

## 3. Jobs to be Done

Each flow is its own document. Status is tracked per flow so parallel work doesn't collide.

### Employee

| ID | Flow | Status |
|---|---|---|
| E-01 | [Authenticate to the platform](flows/E-01-authenticate.md) | In clarification |
| E-02 | [Receive inventory](flows/E-02-receive-inventory.md) | **Specified** |
| E-03 | [Search the inventory](flows/E-03-search-inventory.md) | **Specified** |
| E-04 | [Manage the inventory](flows/E-04-manage-inventory.md) | **Specified** |
| E-05 | [Sell a record](flows/E-05-sell-a-record.md) | **Specified** |
| E-06 | [Process a return](flows/E-06-process-a-return.md) | **Specified** |
| E-07 | [Manage customers](flows/E-07-manage-customers.md) | **Specified** |

### Manager

| ID | Flow | Status |
|---|---|---|
| M-01 | [Set a supplier margin](flows/M-01-supplier-margin.md) | Stub |
| M-02 | [Re-order inventory](flows/M-02-reorder-inventory.md) | **Specified** |
| M-03 | [Daily summary of sales and inventory](flows/M-03-daily-summary.md) | **Specified** |
| M-04 | [Add/remove employees or managers](flows/M-04-manage-users.md) | In clarification |
| M-05 | [Accounts payable](flows/M-05-accounts-payable.md) | **Specified** |
| M-06 | [Configure the store](flows/M-06-settings.md) | In clarification |

---

## 4. Domain model

_Partially derived from E-02. Refine as further flows land._

| Entity | Notes |
|---|---|
| **Store** | Tenant boundary. The system serves **multiple stores** — inventory, invoices, suppliers, users, and reporting all scope to a store. |
| **Record** (catalog) | The pressing — artist, title, label, catalog no., format, year, genre, cover art. Sourced locally or from Discogs. Carries the sticky retail price (New stock only). |
| **InventoryItem** | A physical copy of a Record — condition, cost, price, status. Created by receiving, consumed by sale. |
| **Barcode** | Manufacturer UPC/EAN or a store-generated internal code. Maps to a Record (new) or an individual InventoryItem (second-hand). |
| **Supplier** | Source of stock. Carries margin config (manager-set). Creatable by employees. |
| **Invoice** | Inbound receiving document. Draft or finalized; immutable once finalized. Keyed by `(supplier, invoice_number)`. Carries invoice-level freight / tax / misc. |
| **InvoiceLine** | One received item on an invoice — links Record, cost (`Ext. Price`), accepted retail price, condition. |
| **InvoiceScan** | Photograph of the supplier's paperwork plus extracted invoice-level totals. Assistive only. |
| **CostAdjustment** | The bounded ±2% reconciliation delta; flows into COGS. |
| **Backorder** | Units ordered but not shipped (the supplier's `Balance`). Tracked until fulfilled. |
| **PurchaseOrder** | Manager-created reorder (M-02). Triggers Discogs metadata prefetch. |
| **Sale / Transaction** | A completed checkout (E-05). Carries a globally unique Sale number and one of four states: Current, Held, Closed, Void. |
| **SaleLine** | One line on a Sale. Snapshots price, discount, tax line, condition, and title at time of sale. A negative quantity is a Return. |
| **Tender** | One payment against a Sale. A Sale may carry several (split tender). Types in M-06. |
| **Return** | Reversal of a sale (E-06). A negative-quantity SaleLine, not a separate document. |
| **Hold** | A Sale in the **Held** state — stock committed to a customer, by reservation (E-04) or on receipt of a customer-attached order (M-02). |
| **Customer** | A person or business the store deals with. Optional on any Sale. Carries a signed account balance, a global discount, and a default tax line (E-07). |
| **GiftCard** | A `GC`-prefixed code carrying a balance. Loaded as a SaleLine, redeemed as a Tender (E-05). |
| **SupplierClaim** | A claim for credit against a supplier Invoice for short, damaged, or unshipped stock (E-04). Pending or Credited. |
| **APPayment** | A payment recorded against a supplier Invoice — method, reference, amount, date (M-05). |
| **InventoryAdjustment** | A manager-only correction to stock, carrying a reason code, before/after counts, and attribution (E-04). |
| **Section** | Top-level reporting category (`VINYL`, `MERCH`). Genres roll up into Sections (M-06). |
| **TaxLine** | A named, rated tax entry. Sellable things reference one rather than carrying a boolean (M-06). |
| **CloseBatch** | One end-of-day close — its identifier, timestamp, closing User, and the Sales it moved to Closed (M-03). |
| **User** | Employee or Manager, scoped to a store. |

### 4.1 Catalog vs. copy

A **Record** is the pressing; an **InventoryItem** is a physical copy. Two used copies of the same pressing share a Record but are distinct InventoryItems with independent condition and price.

**On hand is derived**, not stored: it is the count of sellable InventoryItems for a Record, so a stock figure can never drift from the copies it claims to describe. Adjusting stock means adjusting copies, always with a reason code (E-04).

The **titlecard** is the screen showing one Record with all of its copies, quantities, and order state. It is a view over Record + InventoryItems, not an entity of its own.

### 4.2 Condition grading

Goldmine scale (M, NM, VG+, VG, G+, G, F, P). Required per item in second-hand intake; defaults to Mint/Sealed for new stock.

**Open:** does grading apply separately to sleeve and vinyl, as is conventional?

### 4.3 Internal barcode scheme

For unbarcoded stock the system mints an internal barcode. **Recommended: UPC-A under GS1 number system `2`**, which is permanently reserved for in-store use and is therefore never issued to manufacturers — collision with a supplier barcode is structurally impossible rather than merely unlikely. It scans on standard laser hardware with no configuration, and keeps every barcode in one format space so the resolver never branches on symbology.

```
2 | 00 | 00000123 | 7
^   ^      ^        ^
|   |      |        check digit (standard UPC-A mod-10)
|   |      8-digit sequence — 100,000,000 items
|   2-digit store code — up to 100 stores
reserved prefix
```

The 2-digit store code is load-bearing given the multi-store decision. Note a 7-digit store code does not fit: UPC-A carries 11 data digits, so a 7-digit store code would leave only 3 for the item sequence — a ceiling of 1,000 records.

**Second-hand stock should be minted an internal barcode for every copy even when the sleeve carries a manufacturer UPC.** Two used copies of the same pressing in VG+ and NM are different prices; if both scan as the same manufacturer UPC the till cannot tell which is on the counter. New stock may safely share a barcode across copies.

Alternatives considered: Code 128 with a text prefix (flexible, human-readable, but not a retail product code so the scan handler must branch on format) and DataMatrix/QR (holds condition and cost in the symbol, but requires 2D imagers at every till).

**The label carries human-readable text alongside the symbol** — at minimum the condition grade and price. The barcode itself stays an opaque identifier, so re-grading or re-pricing a copy reprints a label rather than invalidating a code, and staff can still tell two copies apart on the shelf without a scanner.

**Two resolution paths, both live.** A **manufacturer UPC** is a lookup key at the Record level: scanning one resolves directly when a single sellable copy matches, and presents a picker on condition, price, and count when several do. An **internal barcode** resolves to exactly one InventoryItem with no picker. Employees scan whatever the item physically carries (E-05).

_Status: **ratified**._

---

## 5. Non-functional requirements

### Settled

**Platform.** A **web application**, delivered as a PWA so one codebase serves the counter, the receiving desk, the office, and a phone or tablet on the shop floor without separate native builds. It must be usable on both macOS and Windows, which is what rules out a desktop app.

**Hardware.** Barcode scanners at the till and receiving desk (standard laser units reading UPC-A — see §4.3, which is why the internal scheme stays in that symbology). A label printer at the receiving desk. A receipt printer at the till. No card reader is driven by this system (NG-4); cards settle on a separate terminal. No cash drawer integration — the daily close does not reconcile the drawer (M-03 decision 8).

**Auditability.** Attribution is required on every Sale, Return, void, hold cancellation, pay-out, inventory adjustment, override, Invoice finalization, and payment. Beyond attribution, four things are immutable or effectively so:

- a finalized Invoice (E-02 decision 23);
- SaleLine values, which are snapshotted at time of sale (E-05 decision 13);
- a voided Sale's number, which is retained rather than reused (E-05 decision 4);
- a User record, which is deactivated rather than deleted so historical attribution survives (M-04 decision 5).

**External dependencies.** Discogs, at roughly 60 requests/min authenticated. Mitigated by bulk prefetch at PurchaseOrder time (M-02) and local-first resolution everywhere (E-02 decision 5). When Discogs is unavailable, local search and every till function continue to work and the degradation is visible rather than silent (E-03 decision 8).

**Scale.** The schema is multi-store from the outset; v1 deploys a single store with no cross-store UI.

### Still open

- **Offline behavior** — must the till keep selling if the internet drops? A PWA makes a degraded offline mode *possible*, but nothing about it is specified: what stays available, how Sales queue, and how they reconcile on reconnection. For a shop whose card terminal is already independent of this system, the practical question is whether cash sales must continue during an outage.
- **Data retention & backup** — untouched.
- **Discogs terms of use** for commercial data — untouched, and worth checking before launch rather than after.

---

## 6. Cross-cutting concerns

### Resolved

- The system is **multi-store**. The schema scopes every entity to a Store from the outset; v1 deploys one store with no cross-store UI.
- **Discogs** is the external catalog metadata source.
- **There is a Customer record** ([E-07](flows/E-07-manage-customers.md)) — holds, special orders, store credit, discounts, and receipt-less returns all need somewhere to hang.
- **Multi-jurisdiction sales tax is in scope** on the outbound side, as a table of named tax lines referenced per item ([M-06](flows/M-06-settings.md)). Inbound tax treatment stays as E-02 decision 17 has it.
- **Accounts payable is in scope** ([M-05](flows/M-05-accounts-payable.md)), superseding E-02 decision 25. Payment *processing* remains out (NG-4).
- **The internal barcode scheme is ratified** — UPC-A under GS1 number system `2` (§4.3).

### Multi-store consequences

Worth settling as flows land:

- Is the catalog (Record metadata) shared across stores, or per-store? Sharing means one store's Discogs lookup benefits all — a meaningful cost and latency saving.
- Are sticky retail prices global or per-store? Two stores in different markets will want different prices.
- Are suppliers and their margins per-store or shared?
- Can a user belong to more than one store? Can a manager see across stores?
- Does inventory search (E-03) cover other stores' stock — "we don't have it, but our other branch does"?

### Still open

1. ~~Is there a customer record at all?~~ **Resolved** — see above, and [E-07](flows/E-07-manage-customers.md).
2. Consignment — common in record stores. In scope?
3. What's the migration story — is there existing inventory data to import?
4. ~~Currency and tax regime — is multi-jurisdiction tax in scope?~~ **Resolved for outbound tax** — see above. Currency conversion for supplier costs and payables is handled in [M-06](flows/M-06-settings.md); exchange gain/loss on payment is still unaddressed ([M-05](flows/M-05-accounts-payable.md)).
5. **Accounts receivable.** [E-07](flows/E-07-manage-customers.md) lets a business customer owe the store money on an outbound customer invoice, but nothing chases it — no terms, no due dates, no aging.
6. **Sleeve vs. vinyl grading** — §4.2's open question is unchanged, and now touches E-06, where a returned copy may need re-grading.

---

## 7. Out of scope / future

- **Payment processing** — no processor integration, no card details, no money moved (NG-4). Card tenders are recorded only.
- Online store (NG-1) and customer loyalty (NG-2).
- **Batch stock-take** — reason-coded single adjustments are in scope ([E-04](flows/E-04-manage-inventory.md)); counting a Section against the shelf in one reconciling pass is not.
- **Reorder suggestion** — v1 ordering is manual ([M-02](flows/M-02-reorder-inventory.md) decision 7); minimum on hand is informational only.
- **Trend and margin reporting** beyond the daily close — PRD goal G-2 wants it, and it is a reporting surface of its own rather than part of [M-03](flows/M-03-daily-summary.md).

---

## Reference material

- [Lexicon](lexicon.md) — controlled vocabulary; the canonical term for each concept
- [Anatomy of a supplier invoice](reference/supplier-invoice-fab.md) — F.A.B. Distribution, worked example
