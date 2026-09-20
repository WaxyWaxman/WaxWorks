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
- G-2: Managers and Owners know what stock is selling so they can analyze market trends and ensure top sellers are stocked at a good price.
- G-3: Employees can easily process new vinyl to get them on the floor quickly and resolve any issues with order - like poor condition, a missing vinyl, or other supplier mistakes.
- G-4: Managers and Owners can enforce vinyl pricing across time to ensure a predictable margin and review individual customer behavior to provide incentives and credit. 
- G-5: Employees can look-up a customer to help them return an item without a receipt, place holds for them, or provide in-store credit.

### 1.4 Non-goals

- NG-1: This is not an online store right now, but will be in the future. 
- NG-2: There is no customer loyalty program.
- NG-3: This system will not directly integrate with supplier systems.
- NG-4: This system does not integrate a **third-party payment processing system** — Square, Stripe, or equivalent. It never captures card data, never authorizes or settles a card transaction, and never moves money. Cards are settled on a separate terminal. **Recording** payment is in scope and always was: tender types, including card, are captured at the till for reconciliation and reporting ([E-05](flows/E-05-sell-a-record.md)), and what the store owes suppliers is tracked and settled in [M-05](flows/M-05-accounts-payable.md).

---

## 2. Users

### 2.1 Employee

Employees are members of staff that work at the record store. They have high agency, there are only a few Manager only tasks. Their Jobs to Be Done include, but are not limited to:
- Searching the store inventory to determine if a vinyl is in stock, on back-order, or out of stock. 
- Processing a vinyl sale in person
- Helping a customer retrieve a vinyl that they have placed a "hold" on via phone or email
- Inventory receiving, including but not limited to: scanning in new vinyl, pricing vinyl, checking that the inventory is correct for a given invoice, restocking, initiating re-ordering, and initiating a refund request from a supplier for an issue.

### 2.2 Manager

The Manager aims to empower their employees to help make good decisions ~~and sometimes needs to provide an override~~ (overrides became review flags — [architecture](architecture.md) A-28). They also need to look at inventory and customer trends so they can make business decisions. Their Jobs to Be Done include, but are not limited to: 
- Setting a default suggested supplier margin for a given vinyl
- Administering the system
- Reviewing all of the pending re-orders that are initiated by employees to confirm the final order to the supplier.
- Reviewing trends in inventory sales to determine top selling vinyl, genres, or artists.
- Reviewing trends in customer behavior to determine who their top customers are by quantity or life-time value. 

The Manager inherits all Employee capabilities (superset).

**Two mechanisms, not one.** A small set of actions is **manager-only** — an Employee cannot perform them at all, and a Manager or Owner authorizes in place with their **PIN** on a store session, both names recorded; on a personal session the session itself is the authorization ([E-01](flows/E-01-authenticate.md) d26, d27). Everything else that used to be gated behind a *manager override* now **proceeds and raises a review flag** the Manager reviews afterward: below-cost shelf pricing, an accepted subtotal discrepancy, selling into negative stock. (*Invoice adjustments beyond ±2%* were on that list until [architecture](architecture.md) A-48 made them impossible instead.) Both mechanics are defined in [M-04](flows/M-04-manage-users.md) — see decisions 8 and 9, and [architecture](architecture.md) A-28.

This extends the design intent that Employees have high agency: a Manager sees what happened rather than standing in the way of it.

### 2.3 Owner

The Owner runs the **Organization** — the company behind one or more Stores. Everything a Manager can do, plus: creating Stores and holding their store accounts, adding and re-roling Managers and Owners, assigning anyone to any Store, and rotating a Store's store account to sign every terminal out ([M-04](flows/M-04-manage-users.md) d25, d30; [M-06](flows/M-06-settings.md) d70; [O-01](flows/O-01-administer-the-organization.md)). An Organization always has at least one active Owner (M-04 d26). An Owner works one Store at a time on a personal session and administers all of them from the Organization screen; there is no consolidated reporting across Stores (O-01 d4).

### 2.4 System Administrator

WaxWorks staff, not a role in any Organization. Creates an Organization and invites its first Owner, restores access when an Organization has no active Owner left, and triggers an Owner's password reset — reaching identity data only and never anything a Store sells, holds or owes; there is no *view as* ([S-01](flows/S-01-onboard-and-recover-organizations.md) d1–d4; [architecture](architecture.md) A-90). Signs in with a passkey.

---

## 3. Jobs to be Done

Each flow is its own document. Status is tracked per flow so parallel work doesn't collide.

### Employee

| ID | Flow | Status |
|---|---|---|
| E-01 | [Authenticate to the platform](flows/E-01-authenticate.md) | **Specified** |
| E-02 | [Receive inventory](flows/E-02-receive-inventory.md) | **Specified** |
| E-03 | [Search the inventory](flows/E-03-search-inventory.md) | **Specified** |
| E-04 | [Manage the inventory](flows/E-04-manage-inventory.md) | **Specified** |
| E-05 | [Point of Sale](flows/E-05-sell-a-record.md) | **Specified** |
| E-06 | [Process a return](flows/E-06-process-a-return.md) | **Specified** |
| E-07 | [Manage customers](flows/E-07-manage-customers.md) | **Specified** |

### Manager

| ID | Flow | Status |
|---|---|---|
| M-01 | [Suppliers](flows/M-01-supplier-margin.md) | **Specified** |
| M-02 | [Re-order inventory](flows/M-02-reorder-inventory.md) | **Specified** |
| M-03 | [Daily summary of sales and inventory](flows/M-03-daily-summary.md) | **Specified** |
| M-04 | [Add/remove employees or managers](flows/M-04-manage-users.md) | **Specified** |
| M-05 | [Accounts payable](flows/M-05-accounts-payable.md) | **Specified** |
| M-06 | [Configure the store](flows/M-06-settings.md) | **Specified** |
| M-07 | [Chart of accounts](flows/M-07-chart-of-accounts.md) | **Specified** |
| M-08 | [Keep the general ledger](flows/M-08-general-ledger.md) | **Specified** |

### Owner

| ID | Flow | Status |
|---|---|---|
| O-01 | [Administer the organization](flows/O-01-administer-the-organization.md) | In clarification |

### System Administrator

| ID | Flow | Status |
|---|---|---|
| S-01 | [Onboard and recover organizations](flows/S-01-onboard-and-recover-organizations.md) | In clarification |

---

## 4. Domain model

_Partially derived from E-02. Refine as further flows land._

| Entity | Notes |
|---|---|
| **Organization** | **Tenant boundary.** The company that runs one or more Stores. Customers, Suppliers and their balances, gift cards, the chart of accounts and the ledger belong to it; people belong to it and are **assigned to** its Stores ([M-04](flows/M-04-manage-users.md) d25–d27; [architecture](architecture.md) A-86). Created by a System Administrator ([S-01](flows/S-01-onboard-and-recover-organizations.md) d2). |
| **Store** | One physical location of an Organization — a **dimension**, not the tenant. Inventory, receiving, Sales, Returns, closes, terminals, review flags and every setting scope to a Store; a Store has a seven-digit ID and a position the system assigns ([M-06](flows/M-06-settings.md) d47, d70) and a **StoreAccount**. |
| **StoreAccount** | A Store's own email and password, with which a terminal opens a **store session** ([E-01](flows/E-01-authenticate.md) d24). Set and reset by an Owner and nobody else; a reset signs out every terminal of the Store ([O-01](flows/O-01-administer-the-organization.md) d3). |
| **Terminal** | A browser on a device holding a store session, with a till name of its own for its drawer and receipts ([E-01](flows/E-01-authenticate.md) d2, d24). Not a person and not a credential. |
| **Record** (catalog) | The pressing — artist, title, label, catalog no., format, year, genre, cover art. Sourced locally or from the catalog provider. Carries the sticky retail price (New stock only). Per Store ([architecture](architecture.md) A-6, A-86); moving the catalog to the Organization is recommended and not ratified (architecture §11). |
| **InventoryItem** | A physical copy of a Record — condition, cost, price, status. Created by receiving, consumed by sale. |
| **Barcode** | Manufacturer UPC/EAN or a store-generated internal code. Maps to a Record (new) or an individual InventoryItem (second-hand). |
| **Supplier** | Source of stock. Carries margin config (manager-set). Creatable by employees. Belongs to the Organization, not to one Store ([architecture](architecture.md) A-86). |
| **Invoice** | Inbound receiving document. Draft, finalized, then paid; correctable until paid, immutable after ([E-02](flows/E-02-receive-inventory.md) d40). Keyed by `(supplier, invoice_number)`. Carries invoice-level freight / tax / misc. |
| **InvoiceLine** | One received item on an invoice — links Record, cost (`Ext. Price`), accepted retail price, condition. |
| ~~**InvoiceScan**~~ | **Removed** — there is no invoice photography and no document extraction ([E-02](flows/E-02-receive-inventory.md) d27). Invoice-level totals are entered manually. |
| **CostAdjustment** | The reconciliation delta between the derived Invoice Total and the Total recorded; flows into COGS. **Bounded to ±2%** — beyond it the write path refuses the Total rather than flagging it ([architecture](architecture.md) A-48, E-02 d50, superseding d35's flag). |
| **Backorder** | Units ordered but not shipped (the supplier's `Balance`). **Derived, not stored** — ordered minus received against that PurchaseOrder line across every Invoice (E-02 d30). |
| **PurchaseOrder** | Manager-created reorder (M-02). Triggers catalog metadata prefetch. One Invoice may span several POs, so the link lives on the InvoiceLine ([E-02](flows/E-02-receive-inventory.md) d28). |
| **Sale / Transaction** | A checkout (E-05). Carries a Sale number unique **per store** (E-05 d22) and one of five states: **Open**, Current, Held, Closed, Void. An Open Sale is pre-tender, unnumbered, and locked to the Employee ringing it (E-05 d21, d23). |
| **SaleLine** | One line on a Sale. Snapshots price, discount, tax line, condition, and title at time of sale. A negative quantity is a Return. |
| **Tender** | One payment against a Sale. A Sale may carry several (split tender). Types in M-06. |
| **Return** | Reversal of a sale (E-06). A negative-quantity SaleLine, not a separate document. |
| **Hold** | A Sale in the **Held** state — stock committed to a customer, by reservation (E-04) or on receipt of a customer-attached order (M-02). |
| **Customer** | A person or business the Organization deals with. Optional on any Sale. Carries a signed account balance, a global discount, and a default tax line (E-07). Belongs to the Organization, not to one Store — the balance and history span its Stores ([architecture](architecture.md) A-86). |
| **GiftCard** | A `GC`-prefixed code and a movement history; the balance is the **sum of its movements**, stored nowhere ([architecture](architecture.md) A-51). Loaded as a SaleLine, redeemed as a Tender (E-05), reversed by a void or edit. An over-redemption is refused, never clamped. Belongs to the Organization and is honoured at any of its Stores ([architecture](architecture.md) A-86). |
| **SupplierClaim** | A claim for credit against a supplier Invoice for short, damaged, or unshipped stock (E-04). Pending or Credited. |
| **PaymentBatch** | One settlement act, recorded once however many things it settled — method, reference, date, recorded-by, and **targets** naming what was settled and whether each was money or claim credit ([M-05](flows/M-05-accounts-payable.md) d16, d19). Voided whole, never edited (d22). Supersedes **APPayment**, which named one payment against one Invoice. Belongs to the Organization, not to one Store ([architecture](architecture.md) A-86). |
| **InventoryAdjustment** | A manager-only correction to stock, carrying a reason code, before/after counts, and attribution (E-04). |
| **ReviewFlag** | A record of something worth a Manager's later attention — **usually an Employee action, and since [architecture](architecture.md) A-68 not always**, since `actor_user_id` is nullable and a null actor means the **system** raised it — below-cost pricing, an accepted derived-versus-stated subtotal discrepancy, a Sale driving stock negative, a broken sale lock. (*An adjustment beyond ±2%* was on this list until [architecture](architecture.md) A-48 made it impossible rather than flagged.) Acknowledged by a Manager (M-04 d17). Carries the actor, the subject, and the figures that raised it. Acknowledged, never deleted ([M-04](flows/M-04-manage-users.md) d8). |
| **Section** | Top-level reporting category (`VINYL`, `MERCH`). Genres roll up into Sections (M-06). |
| ~~**TaxLine**~~ | **Superseded by [M-06](flows/M-06-settings.md) d11**, which replaced decision 1's single table — and with it the `tax_lines` / `tax_components` shape ([architecture](architecture.md) §5). Tax is resolved from **two axes that never compete**, not from a line a sellable thing points at. Replaced by the three entities below. |
| **TaxType** · **TaxGroup** · **ProductTaxCode** | One lookup, three parts ([M-06](flows/M-06-settings.md) d11, d12, d14). A **TaxType** is one tax that exists — code, name, `rate_ppm` ([architecture](architecture.md) A-47), a registration number (d48) and **no active flag** (d57, A-63). A **TaxGroup** is a jurisdiction or customer class carrying a ShortName. A **ProductTaxCode** is carried by a Genre and therefore by everything sellable. A **cell** on `(group, code)` names the taxes to apply. A Sale line snapshots the rates it resolved, at tender ([architecture](architecture.md) A-57). |
| **CloseBatch** | One end-of-day close — its identifier, timestamp, closing User, and the Sales it moved to Closed (M-03). Carries the day's **stored summary** ([architecture](architecture.md) A-30) and its **JournalBatch** ([M-07](flows/M-07-chart-of-accounts.md) d7). Once a BankDeposit stands against it, Undo End of Day is refused ([architecture](architecture.md) A-66).. The summary carries a **schema version** `close_run` writes, and every reader keys on it ([architecture](architecture.md) A-83) — which is what lets a date-range report say *this figure did not exist that day* rather than printing a zero for it. **A batch is live or retired** ([architecture](architecture.md) A-84): an Undo End of Day retires it, re-closing writes a new one, and **no stored summary is ever rewritten** |
| **GLAccount** | One row of the Organization's chart of accounts — journal lines carry the Store as `location` ([M-08](flows/M-08-general-ledger.md) d2, d27; [architecture](architecture.md) A-86) ([M-07](flows/M-07-chart-of-accounts.md)). Carries a **role** the software resolves it by, and a **number and name the store owns and edits** (d3) — nothing is ever resolved by number. A **bank account is a GLAccount with a bank role**, not an entity of its own, and ~~no balance is held for it~~ — **a bank balance now derives like any other account's** ([M-08](flows/M-08-general-ledger.md) d20; A-65 as amended keeps the account a posting target and not an entity). Every seam maps to one — tender, tax type **twice**, adjustment reason (d5, d11). **A Section does not**: one that counts as revenue resolves by rule to the reserved *Sales* account and carries its Section as a **dimension** on the line (d28, d29, [M-08](flows/M-08-general-ledger.md) d2); only a Section marked *not* revenue keeps a mapping (d33). |
| **JournalBatch** | A balanced set of debits and credits, **immutable once written** ([M-07](flows/M-07-chart-of-accounts.md) d7, d8). Written by the artifact that causes it, inside that artifact's transaction ([architecture](architecture.md) A-67); Sales are the exception and batch at the close for volume (d12). Lines carry their own **business date** (d14) and **currency code** (d17). A correction never rewrites one — it posts forward (d8). |
| **BankDeposit** | What actually reached the bank, recorded against the undeposited funds a close produced ([M-07](flows/M-07-chart-of-accounts.md)). The difference **is** the card processing fee, derived and never configured. Appended and voided by a counter-row, never edited; while one stands, Undo End of Day is refused ([architecture](architecture.md) A-66). **Not** a customer deposit, which is a line-less Sale tendered to their account ([E-05](flows/E-05-sell-a-record.md) d25, [lexicon](lexicon.md) §14). |
| **LedgerPosting** | A balanced set of debits and credits a **Manager types by hand** — rent, utilities, a loan, depreciation, an owner's draw, tax ([M-08](flows/M-08-general-ledger.md) Phase 2). Manager-only ([architecture](architecture.md) A-74), refused if it does not balance (d10) and refused into a sealed period (d11). **Not** a *manual ledger entry*, which is an accounts-payable row ([lexicon](lexicon.md) §4) **Narrower than the [lexicon](lexicon.md) §14's *posting*,** which also covers the journals artifacts write for themselves; see §15 and [M-08](flows/M-08-general-ledger.md) d47. |
| **OpeningPosition** | The balances the store carried in from **paper**, held as a sealed batch dated before the first period ([M-08](flows/M-08-general-ledger.md) d6, d26, [architecture](architecture.md) A-78). Equity is not typed — it is the figure that balances assets against liabilities, derived while drafting and written as a line at the seal |
| **SealedPeriod** | A month or year that has been **sealed**, never *closed* — *close* is the end of the day ([lexicon](lexicon.md) §15). Derived from seal and unseal rows, never a stored flag, with a live seal unique per period ([architecture](architecture.md) A-75). Only the most recently sealed period unseals (d29); a year marked **filed** never does (d22) |
| **LedgerIssuance** | A record that something covering a scope **left the building** — a journal export, a P&L, a balance sheet, a reconciliation report — with its figures stored as issued ([M-08](flows/M-08-general-ledger.md) d25, d31, [architecture](architecture.md) A-77). It is what [M-07](flows/M-07-chart-of-accounts.md) d16's overlap warning has needed since M-07 was written |
| **Reconciliation** | Entries within **one account** marked together because they net to zero, against an outside document — a bank statement, or the two halves of an undeposited-funds movement ([M-08](flows/M-08-general-ledger.md) d25). Balance-neutral, like a [M-05](flows/M-05-accounts-payable.md) d15 clearing and deliberately not that word **Two kinds, and they are not synonyms** — `matched` nets by construction, `cleared` is what appears on an outside document and need not net ([M-08](flows/M-08-general-ledger.md) d37). See [lexicon](lexicon.md) §15 and [M-08](flows/M-08-general-ledger.md) d47. |
| **User** | An Employee, Manager or Owner of one Organization, assigned to one or more of its Stores ([M-04](flows/M-04-manage-users.md) d27). Initials are unique per Store among the active assigned ([E-01](flows/E-01-authenticate.md) d25). A Manager or Owner holds a four-digit **PIN** for the manager-only line on a store session and may hold a **personal session** (E-01 d26–d28). Deactivated, never deleted. |

### 4.1 Catalog vs. copy

A **Record** is the pressing; an **InventoryItem** is a physical copy. Two used copies of the same pressing share a Record but are distinct InventoryItems with independent condition and price.

**On hand is derived**, not stored: it is the count of sellable InventoryItems for a Record, so a stock figure can never drift from the copies it claims to describe. Adjusting stock means adjusting copies, always with a reason code (E-04).

The **titlecard** is the screen showing one Record with all of its copies, quantities, and order state. It is a view over Record + InventoryItems, not an entity of its own.

### 4.2 Condition grading

Goldmine scale (M, NM, VG+, VG, G+, G, F, P). Required per item in second-hand intake; defaults to Mint/Sealed for new stock.

~~**Open:** does grading apply separately to sleeve and vinyl?~~ **Resolved** — **one grade per copy**, plus a free-text condition note where specifics belong ("sleeve has ring wear"). See [architecture](architecture.md) A-18.

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

**Hardware.** Barcode scanners at the till and receiving desk (standard laser units reading UPC-A — see §4.3, which is why the internal scheme stays in that symbology). A label printer at the receiving desk. No card reader is driven by this system (NG-4); cards settle on a separate terminal. No cash drawer integration — the daily close does not reconcile the drawer (M-03 decision 8).

**Printing.** In v1, receipts are **emailed** ([E-05](flows/E-05-sell-a-record.md) d24), and barcode labels and the letter-size finalize summary print from the browser to a driver-installed printer. **No local software is installed on shop machines in v1.** A thermal receipt printer needs a small local print agent, which is deferred and opt-in per Store — see [architecture](architecture.md) §4. That agent gives a Store local *printing*, not offline trading.

**Technical architecture** — stack, data model, database functions, and build order — lives in [architecture.md](architecture.md).

**Auditability.** Attribution is required on every Sale, Return, void, hold cancellation, pay-out, inventory adjustment, Invoice finalization, and payment — and on the setting or change of a PIN, an invite or reset sent, a store account created or rotated, a role or assignment changed, and every System Administrator act, each logged with its actor and never with a credential's value ([M-04](flows/M-04-manage-users.md) d28, d29; [O-01](flows/O-01-administer-the-organization.md) d5; [S-01](flows/S-01-onboard-and-recover-organizations.md) d3). Beyond attribution, four things are immutable or effectively so:

- a **paid** Invoice, and only for as long as it is paid ([E-02](flows/E-02-receive-inventory.md) d40, [architecture](architecture.md) A-33, A-33a). Immutability attaches at **paid**, not at finalize, and **releases** if the PaymentBatch that settled it is voided ([M-05](flows/M-05-accounts-payable.md) d22) — so this is the one entry in this list that is conditional rather than permanent. Between finalize and paid an Invoice is **correctable**;
- SaleLine values, which are snapshotted at time of sale (E-05 decision 13);
- a voided Sale's number, which is retained rather than reused (E-05 decision 4);
- a User record, which is deactivated rather than deleted so historical attribution survives (M-04 decision 5).

**External dependencies.** The **catalog provider** — MusicBrainz, with Cover Art Archive for artwork, behind an adapter (E-03 decision 10). Roughly 1 request/second, mitigated by batched prefetch at PurchaseOrder time (M-02 decision 14) and local-first resolution everywhere (E-02 decision 5). When the provider is unavailable, local search and every till function continue to work and the degradation is visible rather than silent (E-03 decision 8).

**Scale.** The schema is multi-store from the outset: Organizations, each holding Stores. v1 deploys one Organization with one Store and no cross-Store UI ([architecture](architecture.md) A-86).

**Offline behavior — resolved.** v1 is **online-only**. The PWA caches the app shell so the application loads instantly and survives a refresh, but writes fail visibly rather than queuing. For a shop whose card terminal is already independent of this system, a genuine outage already halts card sales. See [architecture](architecture.md) A-1.

**Backups.** Daily, via the hosting platform's own backup facility, enabled at launch and with a restore verified before the shop depends on it.

### Still open

- ~~**Offline behavior**~~ — **Resolved** above: online-only in v1.
- ~~**Discogs terms of use**~~ — **Moot.** The catalog provider is MusicBrainz, whose core data is CC0 and whose artwork archive is openly licensed ([architecture](architecture.md) A-12).
- **Data retention** — how long Sales, Invoices, and customer records are kept is still unaddressed. Backups are settled; retention is not.

---

## 6. Cross-cutting concerns

### Resolved

- The system is **multi-store**. The Organization is the tenant and a Store a dimension inside it; the schema scopes every entity to an Organization and the physical ones to a Store as well ([architecture](architecture.md) A-86). v1 deploys one Organization with one Store and no cross-Store UI.
- **MusicBrainz** is the external catalog metadata source, behind a provider adapter. Discogs remains implemented as a second adapter, off by default ([architecture](architecture.md) A-12).
- **There is a Customer record** ([E-07](flows/E-07-manage-customers.md)) — holds, special orders, store credit, discounts, and receipt-less returns all need somewhere to hang.
- **Multi-jurisdiction sales tax is in scope** on the outbound side, resolved from two axes that never compete — the Customer's tax group, else the store's default; the Genre's product tax code; then the `(group, code)` cell naming the tax types to apply ([M-06](flows/M-06-settings.md) d11, d12, d14; §4 above). ~~As a table of named tax lines referenced per item~~ — that was M-06 d1's shape, superseded by d11. Inbound tax is **excluded from cost of goods** ([E-02](flows/E-02-receive-inventory.md) d34, amending its decision 17) — see item 4 below.
- **Payment recording and accounts payable are in scope** — tenders captured at the till ([E-05](flows/E-05-sell-a-record.md)), supplier balances settled in [M-05](flows/M-05-accounts-payable.md). Formalized as E-02 decision 26, superseding decision 25. The only exclusion is integration with a third-party payment processing system such as Square or Stripe (NG-4).
- **The internal barcode scheme is ratified** — UPC-A under GS1 number system `2` (§4.3).

### Multi-store consequences — resolved

~~**Every entity is scoped to a Store. Nothing is shared** ([architecture](architecture.md) A-5).~~ **Every entity is scoped to an Organization; a Store is a dimension** ([architecture](architecture.md) A-86, superseding A-5 on 2026-09-20). The catalog, Sections, the genre map and sticky retail prices are per Store; Suppliers and their margins, Customers, gift cards and the books are the Organization's. The schema has two access-control shapes rather than one (architecture §5).

- ~~Is the catalog shared across stores, or per-store?~~ **Per store** *(moving it to the Organization is recommended, not ratified — architecture §11)*. The cost this would have carried — two stores each spending a lookup on the same pressing — is absorbed by a shared metadata *cache* sitting underneath the per-store catalogs (A-6). The cache is shared; the catalog is not.
- ~~Are sticky retail prices global or per-store?~~ **Per store.**
- ~~Are suppliers and their margins per-store or shared?~~ ~~**Per store.**~~ **Per Organization** ([architecture](architecture.md) A-86).
- ~~Can a user belong to more than one store?~~ ~~**Not in v1** (E-01 decision 8).~~ **Yes** — a User belongs to the Organization and is assigned to one or more Stores ([E-01](flows/E-01-authenticate.md) d25, [M-04](flows/M-04-manage-users.md) d27).
- ~~Does inventory search cover other stores' stock?~~ **Not in v1** — the schema carries the Store scope, but no cross-store UI is exposed ([E-03](flows/E-03-search-inventory.md)).

### Still open

1. ~~Is there a customer record at all?~~ **Resolved** — see above, and [E-07](flows/E-07-manage-customers.md).
2. **Consignment** — **partially resolved.** A Supplier carries a consignment flag, copied onto each InventoryItem at receipt ([E-02](flows/E-02-receive-inventory.md) d33), so consigned stock is identifiable from day one. The program itself — how a consignor is paid, and when — is future work.
3. ~~What's the migration story — is there existing inventory data to import?~~ **Resolved** (#112, 2026-09-19): **there is no existing inventory data to import.** The shop opens on Wax Works with stock entered through [E-02](flows/E-02-receive-inventory.md) receiving like any other, which is why no import route is needed for v1 and why [M-08](flows/M-08-general-ledger.md) d8 could open the books empty. **It becomes a requirement in a later version** — a flow of its own, to be drafted for V2 — and it is listed in §7. *Consequence accepted:* a shop adopting Wax Works with stock already on its shelves has no route in until that flow exists.
4. ~~Currency and tax regime — is multi-jurisdiction tax in scope?~~ **Resolved for outbound tax** — see above. **Inbound tax is excluded from cost of goods** ([E-02](flows/E-02-receive-inventory.md) d34, amending its decision 17) — GST and QST are Input Tax Credits, a receivable rather than a cost. Currency conversion for supplier costs and payables is handled in [M-06](flows/M-06-settings.md); ~~exchange gain/loss on payment is still unaddressed~~ — **resolved by [M-06](flows/M-06-settings.md) d59–d62**, which own it. The ledger is kept in the **home currency**, a foreign artifact records the rate it used on itself, and at payment the Manager confirms what actually left the bank — the difference posting to a reserved exchange gain or loss account. [M-05](flows/M-05-accounts-payable.md) records two figures where it recorded one: what a payment cleared, and what it cost.
5. ~~**Accounts receivable.**~~ **Resolved** by [E-07](flows/E-07-manage-customers.md) d23: **v1 has no receivables side**, deliberately — see §7. *Original:* [E-07](flows/E-07-manage-customers.md) lets a business customer owe the store money on an outbound customer invoice, but nothing chases it — no terms, no due dates, no aging.
6. ~~**Sleeve vs. vinyl grading**~~ — **Resolved.** One grade per copy plus a condition note (§4.2). A returned copy re-graded in E-06 sets one grade and a note, same as intake.

---

## 7. Out of scope / future

- **Integration with a third-party payment processing system** — Square, Stripe, or equivalent (NG-4). Recording tenders and running accounts payable are both **in scope**; what is excluded is capturing card data, authorizing or settling a card transaction, and moving money.
- Online store (NG-1) and customer loyalty (NG-2).
- **Batch stock-take** — reason-coded single adjustments are in scope ([E-04](flows/E-04-manage-inventory.md)); counting a Section against the shelf in one reconciling pass is not.
- **Reorder suggestion** — v1 ordering is manual ([M-02](flows/M-02-reorder-inventory.md) decision 7); minimum on hand is informational only.
- **Trend and margin reporting** beyond the daily close — PRD goal G-2 wants it, and it is a reporting surface of its own rather than part of [M-03](flows/M-03-daily-summary.md). **Two things once deferred with it have since landed in M-03 and are no longer out of scope:** the **per-Employee breakdown** ([M-03](flows/M-03-daily-summary.md) d24, which took the reporting choice the open question had deferred) and **arbitrary date ranges** over the close's own sections (d27). Neither makes M-03 a trend surface — what stays out is top sellers, movement over time, and anything reading beyond what a close stored.
- **The general ledger ships after the first release** — [M-08](flows/M-08-general-ledger.md) d46. The flow is `Specified` and built in the prototype, and [architecture](architecture.md) §8 places milestone **M8** among the post-v1 milestones, after M7 payables. **In v1:** [M-07](flows/M-07-chart-of-accounts.md)'s chart of accounts and the journals each artifact writes for itself. **After it:** the opening position, typed postings, sealing a period, the statements and reconciliation. So the first release records what happened without yet saying what it means, and nothing has to be re-keyed when M8 lands.
- **Importing existing inventory** — §6 item 3 (#112). There is nothing to import today, so v1 has no import route; a shop arriving with stock already on its shelves is a **V2 flow still to be drafted**, and it will need to settle what a migrated copy costs, what it does for a barcode, and what its arrival date means for [E-03](flows/E-03-search-inventory.md)'s dead-stock clock.
- **Chasing a receivable** — [E-07](flows/E-07-manage-customers.md) d23. A business customer may owe the store money on an outbound invoice (E-07 d10) and the balance records it (d4), but terms, due dates, aging and any overdue list are out of v1: the case is two or three accounts. The day the volume grows this is a flow of its own, mirroring [M-05](flows/M-05-accounts-payable.md).

---

## Reference material

- [Lexicon](lexicon.md) — controlled vocabulary; the canonical term for each concept
- [Anatomy of a supplier invoice](reference/supplier-invoice-fab.md) — F.A.B. Distribution, worked example
