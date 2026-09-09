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
- NG-4: This system does not process credit card payments, there is no money exchange on this platform.

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

- [Lexicon](lexicon.md) — controlled vocabulary; the canonical term for each concept
- [Anatomy of a supplier invoice](reference/supplier-invoice-fab.md) — F.A.B. Distribution, worked example
