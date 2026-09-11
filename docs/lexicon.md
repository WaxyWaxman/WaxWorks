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
| **till** | The physical register position where a sale is rung up. | `register`, except where the physical machine is meant (§13). |
| **payment processing** | The **excluded** capability: integrating a third-party payment processing system — Square, Stripe, or equivalent — to capture card data, authorize or settle a card transaction, or move money (NG-4, E-02 decision 26). Distinguish sharply from **recording** a payment, which is in scope everywhere. | using "payments are out of scope" as shorthand — payment *recording* and accounts payable are both in scope; only processor integration is not |

---

## 2. Roles and access

| Canonical | Meaning | Avoid |
|---|---|---|
| **Employee** | Front-line role. Capitalised when naming the role or an `Actor`. | "staff", "clerk", "cashier", "associate", generic "user" |
| **Manager** | Elevated role; assumed superset of Employee for now. Capitalised. | "admin", "supervisor", "owner" (an owner/admin tier above Manager is an open question in M-04, not a synonym) |
| **User** | An Employee or a Manager, scoped to a store. Use only when the statement is true for both roles. | "account", "login", "operator" |
| **terminal enrollment** / **enroll** | Binding a terminal to a Store once, using a one-time code. It is what scopes everything the terminal can reach; it is **not** a staff sign-in ([E-01](flows/E-01-authenticate.md) d9). | "registration", "pairing", "activation", "login" |
| **session** | A staff session on an enrolled terminal, opened with initials and lapsing after 15 minutes idle. Distinct from the terminal's enrollment, which does not lapse. | conflating it with enrollment |
| ~~**manager override**~~ | **Retired** by [M-04](flows/M-04-manage-users.md) d8. The actions it used to gate now proceed and raise a **ReviewFlag**. Do not use the term for new work; it remains readable in superseded decisions. | using it for current behavior — say **ReviewFlag** or **manager-only** as appropriate |
| **ReviewFlag** / **review flag** | A record that an Employee took an action worth a Manager's later attention — below-cost **shelf** pricing, an Invoice adjustment beyond ±2%, an accepted subtotal discrepancy, a Sale driving stock negative, a broken sale lock. Written in the same transaction as the action, so the two can never disagree. **Acknowledged, never deleted.** Entity is PascalCase; "review flag" in running prose. | "warning", "alert", "exception", "override" |
| **review queue** | The Manager's list of unacknowledged ReviewFlags. | "audit log" (broader), "approvals", "inbox" |
| **manager-only** | An action an Employee cannot perform at all — a whole flow or function reserved to Managers (accounts payable, Undo End of Day, adjusting on hand, voiding a finalized Invoice). A Manager authorizes in place by entering their own initials; both names are recorded. Distinct from a **ReviewFlag**, which lets the Employee proceed and tells the Manager afterward. | using it interchangeably with "review flag"; "manager override" |

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
| **Invoice** | Unqualified, this means the **supplier Invoice** — the inbound receiving document. `draft`, `finalized`, then `paid`; **correctable** until paid, immutable after ([E-02](flows/E-02-receive-inventory.md) d40). Keyed by `(supplier, invoice_number)`. Holds invoice-level freight / tax / misc. | "bill", "PO"; "immutable once finalized" |
| **supplier Invoice** | The qualified form. Use it wherever an outbound document is also in play, so the direction is never ambiguous. | — |
| **customer invoice** | An **outbound** business document: a Sale rendered for a business account, carrying their account number and terms, settled against their account balance rather than tendered at the till (E-07). Lowercase `invoice` — it is not the same entity as a supplier Invoice. | "receipt" (a receipt is the till document), "bill" |
| **InvoiceLine** | One received item on an Invoice — links a Record, its cost (`Ext. Price`), accepted retail price, condition. | "line item", "order line" (OK as loose prose, but the entity is InvoiceLine) |
| ~~**InvoiceScan**~~ | **Retired** by [E-02](flows/E-02-receive-inventory.md) d27 — there is no invoice photography and no document extraction. Invoice-level totals are entered manually. | using it at all in new work |
| **CostAdjustment** | The ±2% reconciliation delta. A standalone line flowing into cost of goods; does not redistribute across item costs. Beyond ±2% it proceeds and raises a **ReviewFlag**. | "rounding line", "correction", "write-off" |
| **Backorder** | Units ordered but not shipped — the supplier's `Balance`. **Derived**, not stored: ordered minus received against that PurchaseOrder line across every Invoice ([E-02](flows/E-02-receive-inventory.md) d30). | "backlog", "negative inventory" (a *different* concept — see §6) |
| **PurchaseOrder** | Manager-created reorder (M-02). Triggers catalog metadata prefetch. **An Invoice may span several POs**, so the link lives on the InvoiceLine ([E-02](flows/E-02-receive-inventory.md) d28). Abbreviate as `PO` / "purchase order" in prose. | "order", "restock request" |
| **Sale** / **Transaction** | A checkout (E-05), in one of five states — **Open**, Current, Held, Closed, Void. | "order", "ticket" |
| **sale lock** | An **Open** Sale is locked to the Employee who opened it. Handoff is via Hold; re-opening transfers the lock; tender attributes to the lock holder ([E-05](flows/E-05-sell-a-record.md) d23). | "checked out", "claimed", "assigned" |
| **SaleLine** | One line on a Sale. Snapshots price, discount, tax line, condition, and title at time of sale. | "line item" (OK as loose prose), "cart item" |
| **Tender** | One payment against a Sale. A Sale may carry several. | "payment method" (OK in prose), "tender type" when a single payment is meant |
| **Hold** | A Sale in the **Held** state — stock committed to a customer. | "reservation", "layaway" (layaway implies part-payment, which holds do not have) |
| **Customer** | A person or business the store deals with. Optional on any Sale. Carries a signed account balance, global discount, and default tax line (E-07). | "client", "member", "account" (the account balance is a field *on* a Customer) |
| **GiftCard** | A `GC`-prefixed code carrying a balance. Loaded as a SaleLine, redeemed as a Tender. | "voucher", "store card" |
| **SupplierClaim** | A claim for credit against a supplier Invoice for short, damaged, or unshipped stock (E-04). `Pending` or `Credited`. | "supplier return", "chargeback", "RMA" |
| **APPayment** | A payment recorded against a supplier Invoice — method, reference, amount, date (M-05). Recorded, never executed: this system moves no money. | "remittance", "settlement" |
| **InventoryAdjustment** | A manager-only correction to stock, carrying a reason code, before/after counts, and attribution (E-04). | "stock edit", "write-off" (a write-off is one *reason code*, not the entity) |
| **Section** | Top-level reporting category — `VINYL`, `MERCH`. Genres roll up into Sections (M-06). Uppercase when naming one. | "department", "category", "genre" (a genre is finer-grained and rolls up into a Section) |
| **TaxLine** | A named, rated tax entry. Sellable things reference one rather than carrying a boolean. A zero-rate line is how exemption is expressed. | "tax rate" (OK in prose), "tax flag", "taxable Y/N" |
| **CloseBatch** | One end-of-day close — identifier, timestamp, closing User, and the Sales it moved to Closed (M-03). | "day", "shift", "session" (a batch is not necessarily a calendar day) |
| **Return** | Reversal of a Sale (E-06). A *customer* return, expressed as a negative-quantity SaleLine. A supplier-side return is a "return or credit claim" — see §5. | "refund" (the refund is one outcome of a Return), "RMA" |

### Catalog vs. copy

Say **"a Record is the pressing; an InventoryItem is a physical copy."** Two used copies
of one pressing **share a Record** but are **distinct InventoryItems**.

---

## 4. Receiving (E-02)

| Canonical | Meaning | Avoid |
|---|---|---|
| **receive** / **receiving** / **inbound receiving** | The E-02 workflow: intake a shipment, identify each record, price it, reconcile against the supplier's invoice. | "intake" as the flow name (OK as a verb), "goods-in", "check-in" |
| **receiving worklist** | The outstanding PurchaseOrder lines for the open Invoice's Supplier, listed **in the Invoice track** and spanning all of that Supplier's open POs — suppliers ship several in one box ([E-02](flows/E-02-receive-inventory.md) d29, d42). Browsable as well as scanned against, because an unbarcoded copy has no code to match on. Receiving itself opens on **Invoices**, not on this. | "expected deliveries", "inbox", "to-receive list"; calling it the screen receiving opens on |
| **order line status** | The statuses a *person* sets on a PurchaseOrder line: **Shipped** (with the supplier's expected date), **Backordered**, **Cancelled** ([M-02](flows/M-02-reorder-inventory.md) d12, d22). **Pending** and **Ordered** are derived from whether the line has a PO number, and receipt is counted off the Invoices (E-02 d30) — none of those three is a settable status. | setting "Received" or "Ordered" as a status; "state"; "stage" |
| **Part received** | A PurchaseOrder line with some but not all of its quantity taken in. Reads "1 of 2". Possible because a placed line is never deleted ([M-02](flows/M-02-reorder-inventory.md) d21). | "partial", "short shipped" (that is the supplier's word, not the line's state) |
| **void a PurchaseOrder** | Manager-only reversal of **our** paperwork, never the supplier's ([M-02](flows/M-02-reorder-inventory.md) d10, d11). Unreceived lines return to pending; a **Part received** line keeps what arrived and its remainder returns as a new pending line (d24). | "cancel the PO" (a *line* is Cancelled; a *PO* is voided), "delete the order" |
| **receiving history** | Past Invoices, browsable and searchable, opening **as they were finalized**. Immutability is what makes "as-was" trivially true (d36). | "audit trail", "receiving log", "archive" |
| **intake mode** | The New-stock / Second-hand choice, made once per Invoice. No mixed invoices. | "receiving type", "stock type" |
| **New stock** / **New mode** / **New** | Intake mode for newly distributed records. Capital `N`. Condition defaults to Mint/Sealed; accepted price becomes the Record's sticky price. | "new inventory", lowercase "new" when the mode is meant |
| **Second-hand** / **Second-hand mode** | Intake mode for pre-owned copies. Hyphenated; capital `S` at sentence start, `second-hand` mid-sentence. Condition graded per copy; never sets a sticky price. | "used" as the canonical term (`used copy` is tolerated in loose prose), "pre-owned", "secondhand" (no hyphen), "trade-in" |
| **shipment** | The physical delivery from a supplier. | "consignment" (that word means something specific — see below), "delivery", "parcel" |
| **consignment** | Stock the store sells on the supplier's behalf rather than having bought. A Supplier carries a **consignment flag**, copied onto each InventoryItem at finalize ([E-02](flows/E-02-receive-inventory.md) d33). The flag exists in v1; the program built on it does not. | using it loosely for a shipment or delivery |
| **reconcile** / **reconciliation** | Checking the received batch against the supplier's invoice totals. | "balance", "audit", "match up" |
| **draft** | Invoice state before finalize. Persists immediately; abandonable and resumable. Lowercase. | "pending", "in progress", "unsaved" |
| **finalize** / **finalized** | Committing the Invoice: all lines become sellable inventory, the Invoice is written to the invoices database, a letter-size summary prints. American spelling. | "finalise", "close", "submit", "post", "commit" |
| **correctable** | The state an Invoice is in between **finalize** and **paid**: lines are sellable, and costs, totals and added lines may still change. A line whose copy has already sold cannot be removed ([E-02](flows/E-02-receive-inventory.md) d4, d40). | "editable" (too broad — a *draft* is editable), "open", "pending" |
| **immutable** | A **paid** Invoice cannot be edited. Attaches at paid, not at finalize ([E-02](flows/E-02-receive-inventory.md) d40, [architecture](architecture.md) A-33) — between finalize and paid an Invoice is **correctable**. Voids and amendments are manager-only and appended as a separate artifact against the original record. | "locked", "read-only", "frozen"; calling a *finalized* Invoice immutable |
| **void** | Manager-only cancellation of a finalized Invoice (handled in E-04). | "delete" (a *draft* is deleted; a *finalized* Invoice is voided), "cancel", "reverse" |
| **amend** / **amendment** | Manager-only change to a finalized Invoice, appended as a separate artifact — never an in-place edit. | "edit", "correct", "revise" |
| **discrepancy warning** | Raised when the derived subtotal ≠ the supplier's stated subtotal. The Employee may accept it, which raises a **ReviewFlag**. | "mismatch error", "validation error", "alert" |
| **return or credit claim** | Flag an Employee can set on an Invoice during receiving; the handling lives in E-04. Distinct from a customer **Return** (§3). | "supplier return", "RMA", "chargeback" |
| **sellable** / **sellable inventory** | The state a line reaches only on Invoice finalization. | "available", "live", "active", "in stock" (an item can be in stock and not yet sellable) |
| **receiving desk** | Physical station where scanning happens; has a label printer. | "goods-in bench", "intake station" |
| **label printer** | Prints internal barcodes at the receiving desk. | "barcode printer" (OK), "sticker printer" |
| **letter-size summary** | The printout produced on finalize, printed from the browser in v1 ([architecture](architecture.md) §4). | "receipt", "report", "A4 summary" (it is letter, not A4) |
| **negative inventory** | Selling a physical copy before its Invoice is finalized drives the count below zero; E-05 must allow it, E-04 reconciles it. Raises a **ReviewFlag**. | "oversell", "backorder" (§3), "stock-out" |
| **oversold item** | The InventoryItem minted when a Sale outruns stock — the concrete row that makes negative inventory a real count rather than a special case, and the thing E-04 clears when the physical copy arrives ([architecture](architecture.md) §5.1). | "phantom", "virtual item", "placeholder" |

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
| **shelf price** | Any customer-facing price. **Suggested** as ending in `.50` or `.99`, rounded up — a default, not a rule ([E-02](flows/E-02-receive-inventory.md) d32). | "retail price" when the rounding rule is the point, "display price" |
| **round up** / `round_up` | The suggestion is always upward, to the next `.50` or `.99`. Advisory — any amount is accepted. | "round", "round to nearest"; describing it as enforced |
| **below-cost pricing** | Setting a shelf price under cost. **Permitted**; raises a ReviewFlag ([E-02](flows/E-02-receive-inventory.md) d35). | "loss pricing", "negative margin"; describing it as blocked |
| **guardrail** | A threshold at which an action raises a ReviewFlag rather than being refused — below cost, or beyond ±2%. | "validation", "limit"; implying it blocks |
| **cost of goods** / **COGS** | Where cost, freight, misc, and the CostAdjustment land. **Inbound tax is excluded** ([E-02](flows/E-02-receive-inventory.md) d34) — it is a recoverable Input Tax Credit, not a cost. | "cost of sales", "landed cost" (§ below); including inbound tax |
| **landed cost** | The allocation of freight/tax/misc down to items — **explicitly not done**. Say "there is no landed-cost calculation". | using "landed cost" to mean plain cost |
| **freight** | Invoice-level shipping charge. Often unlabeled on the paperwork; derivable as `Total − Sub-Total − Tax`. Lowercase. | "shipping", "postage", "carriage" |
| **tax** | Invoice-level. On the reference invoice this is Canadian **GST** + **QST**. | "VAT", "sales tax" when GST/QST is meant |
| **miscellaneous** / **misc** | Invoice-level manual cost bucket. | "other", "adjustments" |
| **subtotal** | Sum of line costs. Distinguish **derived subtotal** (our sum of entered costs) from the supplier's **stated subtotal** (`Sub-Total` on their paperwork). | "net total", "goods total" without the derived/stated qualifier |
| **±2%** | The tolerance on the Invoice total adjustment. Beyond it the adjustment proceeds and raises a **ReviewFlag** — a threshold at which a Manager is told, not a wall. Write it as `±2%`. | "2 percent", "small adjustment", "rounding tolerance"; describing it as a hard limit |

---

## 6. Condition and grading

| Canonical | Meaning | Avoid |
|---|---|---|
| **Goldmine scale** | The grading standard. Grades, highest to lowest: **M, NM, VG+, VG, G+, G, F, P**. Use these exact abbreviations. | "Discogs grading", spelled-out "Very Good Plus", other scales |
| **condition grade** / **grade** | The per-copy Goldmine value. **One grade per copy**, not separate sleeve and vinyl grades (PRD §4.2). Required for every Second-hand item. | "quality", "rating", "state"; sleeve/vinyl split grading |
| **condition note** | Free text alongside the grade for specifics — "sleeve has ring wear", "seam split". | putting specifics in the grade itself |
| **Mint/Sealed** | The condition a New-stock item defaults to. Written with the slash. | "Mint", "Sealed", "New" used as a grade |
| **sleeve** / **vinyl** | The two parts a grade may (open question) apply to separately. | "jacket" for sleeve, "disc"/"record" for vinyl |

---

## 7. Selling and returns (E-05, E-06)

| Canonical | Meaning | Avoid |
|---|---|---|
| **Sale** / **Transaction** | A completed checkout. | "order", "purchase" (the customer purchases; the store records a Sale) |
| **checkout** | The act of ringing up and taking payment. | "cash out", "sale process" |
| **Return** | A *customer* bringing back a sold record for refund or exchange. Supplier-side is a "return or credit claim" (§5). | "refund" as the whole flow, "exchange" as the whole flow |
| **receipt** | The customer-facing proof of Sale printed at the till (E-05). Never used for an inbound document — that is a supplier Invoice. For a business account settled on terms, the outbound document is a **customer invoice** (§3). | "invoice" for the till document |
| **Sale number** | The identifier on a Sale. **Globally unique** and ascending — unlike a supplier Invoice number, which is unique only per `(supplier, invoice_number)`. Retained when a Sale is voided. | "invoice number" for a Sale, "transaction ID", "receipt number" |
| **hold reference** | The `H`-prefixed identifier a Held Sale carries until it is tendered (`H1`, `H2`…), so it is never mistaken for a completed Sale. | "hold number", "temporary invoice number" |
| **Current** / **Held** / **Closed** / **Void** | The four Sale states. Capitalised when naming a state. `Closed` is the state after an end-of-day close — the word *finalized* belongs to Invoices, not Sales. | "open"/"complete"/"finalized"/"cancelled" as Sale states |
| **close** / **end-of-day close** | Moving every Current Sale to Closed and producing the day's breakdown (M-03). | "cash up", "z-report", "settlement", "finalize" (that word is E-02's) |
| **split tender** | Paying one Sale across more than one Tender. | "part payment", "mixed payment" |
| **pay-out** | A Tender type: cash removed from the till for an expense, with a required note. | "petty cash", "cash drop" (a drop moves cash to a safe — different thing) |
| **Used Credit** | The Tender type for buying second-hand stock over the counter. **A deliberate exception** to the second-hand-over-used rule in §4 — it is the phrase spoken at the counter. Capitalised as a tender name. | renaming it to "second-hand credit"; using it for anything other than the tender |
| **store credit** | Value the store owes a Customer, held as a positive account balance and drawn down by the **Store Credit** tender. | "credit note" (that is supplier-side), "account credit", "AR"/"accounts receivable" (store credit is a *liability* — the store owes it) |
| **account balance** | A Customer's single signed balance: positive means the store owes them (store credit), negative means they owe the store (an unpaid customer invoice). | "AR balance", "credit balance" (it runs both directions) |
| **non-tracked item** | A sellable catalog entry with no stock count — freight, services, bulk goods. Never warns on negative inventory. | "misc SKU", "service item", "non-inventory" (OK loosely) |
| **titlecard** | The screen showing one Record with all its copies, quantities, and order state. **A view, not an entity** — the data underneath is a Record and its InventoryItems. | using it as an entity name, "item card", "product page" |

---

## 8. Catalog metadata and the catalog provider

| Canonical | Meaning | Avoid |
|---|---|---|
| **catalog provider** | The external catalog metadata source, reached through an adapter so it can be swapped. **MusicBrainz** in v1, with **Cover Art Archive** for artwork ([E-03](flows/E-03-search-inventory.md) d10). Use this term in specifications; name the implementation only when the specific service is the point. | "the catalog service", "the metadata API" |
| **MusicBrainz** | The v1 catalog provider implementation. Capitalised as one word with a capital `B`. | "Musicbrainz", "MB" |
| **Discogs** | A second, implemented provider, **off by default**. Capital `D`. Historic references in superseded decisions read as "the catalog provider". | treating it as *the* source; "discogs" |
| **catalog** | Record metadata as a whole. American spelling throughout. | "catalogue" |
| **catalog number** | Metadata field captured in manual entry (label's release number, e.g. `JAG485`). | "cat no." inconsistently, "catalogue number" |
| **local-first** | Barcode resolution checks the local database before calling the provider. Outcomes are a **local hit** or a **local miss**. | "cache-first", "offline-first" |
| **release cache** | The provider responses shared **across stores**, sitting underneath the per-store catalogs. Sharing the cache is not sharing the catalog — Stores still own and edit their own Records ([architecture](architecture.md) A-6). | "shared catalog", "global records" |
| **resolve** / **resolver** | Turning a scanned Barcode into a catalog Record. | "look up" as the noun, "match" |
| **prefetch** | Bulk fetch of catalog metadata at PO time so receiving hits locally. Batched several barcodes per request. One word, no hyphen. | "pre-fetch", "pre-load", "sync", "bulk import" |
| **manual entry fallback** / **manual catalog entry** | Operator types metadata when there is no match: **artist, album title, genre, catalog number, label**. | "manual override", "free-text entry" |
| **picker** | The chooser shown when the provider returns multiple matches. | "disambiguation dialog", "selector" |
| **cover art** | Captured once at receiving as a snapshot; **not re-synced**. Stored as a URL in v1 ([architecture](architecture.md) A-14). | "artwork sync", "album image" |

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
| **manufacturer UPC** / **UPC/EAN** | A barcode issued by the manufacturer and printed on the sleeve. Resolves to a **Record**, so it is a lookup key rather than a unique identifier. | "retail barcode", "factory barcode" |
| **picker** | The chooser shown when a manufacturer UPC resolves to more than one sellable copy, listing condition, price, and count. Same word as the provider multiple-match picker (§8). | "disambiguation dialog", "variant selector" |
| **label text** | The human-readable condition grade and price printed on a store label alongside the symbol. The barcode itself stays opaque, so re-grading reprints a label rather than invalidating a code. | encoding condition *into* the barcode, "sticker text" |

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
2. ~~**"till" vs "register".**~~ **Resolved: *till*.** It is now used consistently in the
   PRD, [E-01](flows/E-01-authenticate.md), [E-05](flows/E-05-sell-a-record.md), and
   everything downstream. *Register* survives only where the physical machine is meant
   rather than the selling position.
3. **"second-hand" vs "used".** The PRD and E-02 standardise on *second-hand*;
   [E-04](flows/E-04-manage-inventory.md) and [E-06](flows/E-06-process-a-return.md) say
   *used records*. Prefer *second-hand*.
4. ~~**"behaviour"** appears once in [M-01](flows/M-01-supplier-margin.md).~~ **Resolved** —
   corrected to *behavior*.

5. **"Administrators"** appears in PRD goal G-2, where §2 of this lexicon says to avoid
   *admin* for the **Manager** role. Left as-is for now since it reads as a generic
   persona statement rather than the role, but worth a decision.
