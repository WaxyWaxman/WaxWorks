# Wax Works — Product Requirements Document

**Status:** Draft
**Last updated:** 2026-09-08
**Owners:** sr-talbot, WaxyWaxman

This document is the spine: product context, users, domain model, and cross-cutting concerns. Individual user flows live in [`flows/`](flows/) — see §3.

---

## 1. Overview

### 1.1 Summary

Wax Works is a point-of-sale (POS) and inventory management system for independent vinyl record stores. It handles the front-of-counter selling workflow and the back-of-house stock workflow in one system, and serves **multiple stores**.

### 1.2 Problem statement

_TBD — what breaks today? (e.g. generic POS systems don't model record condition/pressing, inventory drifts from reality, reordering is guesswork.)_

### 1.3 Goals

_TBD — what does success look like? Suggest 3–5 measurable goals._

- G-1:
- G-2:
- G-3:

### 1.4 Non-goals

_TBD — explicitly out of scope for v1. Candidates: e-commerce storefront, accounting/GL integration, customer loyalty program._

- NG-1:
- NG-2:

---

## 2. Users

### 2.1 Employee

_TBD — describe the persona. Who are they, what's their day like, what's their technical comfort level?_

### 2.2 Manager

_TBD — describe the persona._

**Open question:** Does a Manager inherit all Employee capabilities (superset), or is it a distinct role with its own separate permissions? Assumed superset for now.

**Manager override** is a recurring mechanism — several employee actions are gated behind it (below-cost pricing, invoice adjustments beyond ±2%, voiding a finalized invoice). Its mechanics are defined in [M-04](flows/M-04-manage-users.md).

---

## 3. Jobs to be Done

Each flow is its own document. Status is tracked per flow so parallel work doesn't collide.

### Employee

| ID | Flow | Status |
|---|---|---|
| E-01 | [Authenticate to the platform](flows/E-01-authenticate.md) | Stub |
| E-02 | [Receive inventory](flows/E-02-receive-inventory.md) | **Specified** |
| E-03 | [Search the inventory](flows/E-03-search-inventory.md) | Stub |
| E-04 | [Manage the inventory](flows/E-04-manage-inventory.md) | Stub |
| E-05 | [Sell a record](flows/E-05-sell-a-record.md) | Stub |
| E-06 | [Process a return](flows/E-06-process-a-return.md) | Stub |

### Manager

| ID | Flow | Status |
|---|---|---|
| M-01 | [Set a supplier margin](flows/M-01-supplier-margin.md) | Stub |
| M-02 | [Re-order inventory](flows/M-02-reorder-inventory.md) | Stub |
| M-03 | [Daily summary of sales and inventory](flows/M-03-daily-summary.md) | Stub |
| M-04 | [Add/remove employees or managers](flows/M-04-manage-users.md) | Stub |

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
| **Sale / Transaction** | A completed checkout (E-05). |
| **Return** | Reversal of a sale (E-06). |
| **User** | Employee or Manager, scoped to a store. |

### 4.1 Catalog vs. copy

A **Record** is the pressing; an **InventoryItem** is a physical copy. Two used copies of the same pressing share a Record but are distinct InventoryItems with independent condition and price.

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

_Status: recommended, not yet ratified._

---

## 5. Non-functional requirements

_TBD. Prompts:_

- **Offline behavior** — must the register keep selling if the internet drops?
- **Platform** — web, desktop, tablet? What hardware is at the counter (barcode scanner, receipt printer, cash drawer, card reader)? Receiving needs a label printer.
- **Scale** — how many stores? Inventory size? Transactions/day?
- **Auditability** — what actions need an immutable trail?
- **Data retention & backup**
- **External dependencies** — Discogs API rate limits (~60 req/min authenticated) and terms of use for commercial data.

---

## 6. Cross-cutting concerns

### Resolved

- The system is **multi-store**.
- **Discogs** is the external catalog metadata source.

### Multi-store consequences

Worth settling as flows land:

- Is the catalog (Record metadata) shared across stores, or per-store? Sharing means one store's Discogs lookup benefits all — a meaningful cost and latency saving.
- Are sticky retail prices global or per-store? Two stores in different markets will want different prices.
- Are suppliers and their margins per-store or shared?
- Can a user belong to more than one store? Can a manager see across stores?
- Does inventory search (E-03) cover other stores' stock — "we don't have it, but our other branch does"?

### Still open

1. Is there a customer record at all (for returns without a receipt, store credit, want-lists)?
2. Consignment — common in record stores. In scope?
3. What's the migration story — is there existing inventory data to import?
4. Currency and tax regime — the reference invoice is CAD with GST/QST. Is multi-jurisdiction tax in scope?

---

## 7. Out of scope / future

- Payment processing and accounts-payable (E-02 decision 25).

---

## Reference material

- [Anatomy of a supplier invoice](reference/supplier-invoice-fab.md) — F.A.B. Distribution, worked example
