# Wax Works — Lexicon

**Status:** Draft
**Last updated:** 2026-09-16

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
| **Manager** | Elevated role; a strict superset of Employee. The **highest** role — [M-04](flows/M-04-manage-users.md) d11 and d14 resolved the owner-tier question as *no*, answering both its forcing cases with rules rather than a role. Capitalised. | "admin", "supervisor", "owner" (there is no tier above Manager; a Store's assigned identifiers are issued by the WaxWorks team outside the role model, M-04 d11) |
| **User** | An Employee or a Manager, scoped to a store. Use only when the statement is true for both roles. | "account", "login", "operator" |
| **terminal enrollment** / **enroll** | Binding a terminal to a Store once, using a one-time code. It is what scopes everything the terminal can reach; it is **not** a staff sign-in ([E-01](flows/E-01-authenticate.md) d9). | "registration", "pairing", "activation", "login" |
| **session** | A staff session on an enrolled terminal, opened with initials and lapsing after a configured period of **inactivity, defaulting to 5 minutes** ([M-06](flows/M-06-settings.md) d45, [architecture](architecture.md) A-50) and taking **no maximum** ([E-01](flows/E-01-authenticate.md) d13). An **Open** Sale suppresses the lapse whatever the setting says (E-01 d10). Distinct from the terminal's enrollment, which does not lapse. **There is no server-side session**: it is an actor and a timer in the browser ([architecture](architecture.md) A-3, A-50), so a deactivation ends it by the write path refusing the User, with the shell catching up at its next actor re-resolution ([M-04](flows/M-04-manage-users.md) d18, [architecture](architecture.md) A-55). | conflating it with enrollment; "15 minutes", which was E-01 d4's flat figure and is now neither flat nor the default |
| ~~**manager override**~~ | **Retired** by [M-04](flows/M-04-manage-users.md) d8. The actions it used to gate now proceed and raise a **ReviewFlag**. Do not use the term for new work; it remains readable in superseded decisions. | using it for current behavior — say **ReviewFlag** or **manager-only** as appropriate |
| **ReviewFlag** / **review flag** | A record of something worth a Manager's later attention. **Usually an Employee action, and since [architecture](architecture.md) A-68 not always:** `actor_user_id` is nullable, and a null actor means the **system** raised it — so far only a `journal_imbalance` ([M-07](flows/M-07-chart-of-accounts.md) d10), which has no actor because it is this system's own arithmetic failing. The Employee-action sense, which is what the five original kinds are — below-cost **shelf** pricing, an Invoice adjustment beyond ±2%, an accepted subtotal discrepancy, a Sale driving stock negative, a broken sale lock. Written in the same transaction as the action, so the two can never disagree. **Acknowledged by a Manager, never deleted** ([M-04](flows/M-04-manage-users.md) d17, [architecture](architecture.md) A-28a). Entity is PascalCase; "review flag" in running prose. | "warning", "alert", "exception", "override"; saying an Employee may clear their own |
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
| **Invoice** | Unqualified, this means the **supplier Invoice** — the inbound receiving document. `draft`, `finalized`, then `paid`; **correctable** until paid, immutable after ([E-02](flows/E-02-receive-inventory.md) d40). **`paid` is derived, not stored and not set by anyone** — finalized, balance owing at or below zero, and at least one settlement landed on it ([architecture](architecture.md) A-33b). Keyed by `(supplier, invoice_number)`. Holds invoice-level freight / tax / misc. | "bill", "PO"; "immutable once finalized" |
| **supplier Invoice** | The qualified form. Use it wherever an outbound document is also in play, so the direction is never ambiguous. | — |
| **customer invoice** | An **outbound** business document: a Sale rendered for a business account, carrying their account number and terms, settled against their account balance rather than tendered at the till (E-07). Lowercase `invoice` — it is not the same entity as a supplier Invoice. | "receipt" (a receipt is the till document), "bill" |
| **InvoiceLine** | One received item on an Invoice — links a Record, its cost (`Ext. Price`), accepted retail price, condition. | "line item", "order line" (OK as loose prose, but the entity is InvoiceLine) |
| ~~**InvoiceScan**~~ | **Retired** by [E-02](flows/E-02-receive-inventory.md) d27 — there is no invoice photography and no document extraction. Invoice-level totals are entered manually. | using it at all in new work |
| **CostAdjustment** | The reconciliation delta between the derived Invoice Total and the Total recorded, **bounded to ±2%** ([architecture](architecture.md) A-48, [E-02](flows/E-02-receive-inventory.md) d50). A standalone line flowing into cost of goods; does not redistribute across item costs. **Beyond ±2% there is no CostAdjustment**, because the write path refuses the Total — the paths are to correct the lines or raise an Adjustment in [M-05](flows/M-05-accounts-payable.md) (d12). | "rounding line", "correction", "write-off"; saying it proceeds and raises a ReviewFlag beyond ±2% — that was true until A-48 and is now impossible |
| **Backorder** | Units ordered but not shipped — the supplier's `Balance`. **Derived**, not stored: ordered minus received against that PurchaseOrder line across every Invoice ([E-02](flows/E-02-receive-inventory.md) d30). | "backlog", "negative inventory" (a *different* concept — see §6) |
| **PurchaseOrder** | Manager-created reorder (M-02). Triggers catalog metadata prefetch. **An Invoice may span several POs**, so the link lives on the InvoiceLine ([E-02](flows/E-02-receive-inventory.md) d28). Abbreviate as `PO` / "purchase order" in prose. | "order", "restock request" |
| **Sale** / **Transaction** | A checkout (E-05), in one of five states — **Open**, Current, Held, Closed, Void. | "order", "ticket" |
| **sale lock** | An **Open** Sale is locked to the Employee who opened it. Handoff is via Hold; re-opening transfers the lock; tender attributes to the lock holder ([E-05](flows/E-05-sell-a-record.md) d23). | "checked out", "claimed", "assigned" |
| **SaleLine** | One line on a Sale. Snapshots price, discount, tax line, condition, and title at time of sale. | "line item" (OK as loose prose), "cart item" |
| **Tender** | One payment against a Sale. A Sale may carry several. | "payment method" (OK in prose), "tender type" when a single payment is meant |
| **Hold** | A Sale in the **Held** state — stock committed to a customer. | "reservation", "layaway" (layaway implies part-payment, which holds do not have) |
| **Customer** | A person or business the store deals with. Optional on any Sale. Carries a signed account balance, global discount, and default tax line (E-07). | "client", "member", "account" (the account balance is a field *on* a Customer) |
| **GiftCard** | A `GC`-prefixed code and a **movement history**; its balance is the **sum of its movements** and is stored nowhere ([architecture](architecture.md) A-51). Three movement kinds and no others: `load` (+) from the SaleLine that sold it, `redeem` (−) from the Tender, `reversal` (±) from the Sale void or edit that struck either. There is no `adjust` kind and no manager write path in v1. A redemption that would take the sum below zero is **refused, never clamped**, enforced in `sale_tender` under `FOR UPDATE`. | "voucher", "store card"; "carrying a balance" as though the balance were a column; setting a balance by hand |
| **SupplierClaim** | A claim for credit against a supplier Invoice for short, damaged, or unshipped stock (E-04). `Pending` or `Credited`. Carries **two amounts once Credited**: what was **claimed**, and what the supplier's **credit memo grants** — the memo is the point of truth and the two commonly differ ([E-04](flows/E-04-manage-inventory.md) d20). Only the credited amount counts ([M-05](flows/M-05-accounts-payable.md) d26). | "supplier return", "chargeback", "RMA" |
| **PaymentBatch** | **One settlement act**, recorded once however many things it settled ([M-05](flows/M-05-accounts-payable.md) d16) — method, reference, date, the Manager who recorded it, and its **targets**. Each target names what was settled and **which kind** it was: money, or claim credit ([M-05](flows/M-05-accounts-payable.md) d19). Recorded, never executed: this system moves no money. Voided whole, never edited ([M-05](flows/M-05-accounts-payable.md) d22 — see *void a PaymentBatch*). | "remittance", "APPayment" (retired — see below); one record per Invoice paid. **"Settlement" is fine for the *act*** that produces a PaymentBatch — [M-05](flows/M-05-accounts-payable.md) d27 and [architecture](architecture.md) A-38 both use it that way — but never for the *record*, which is a PaymentBatch |
| ~~**APPayment**~~ | **Retired.** Named one payment against one supplier Invoice, which is not the shape: [M-05](flows/M-05-accounts-payable.md) d16 made the recorded unit a **PaymentBatch** covering whatever mix it settled, not one record per target sharing a reference. Use **PaymentBatch**. | using it for the entity; it is only the older name |
| **InventoryAdjustment** | A manager-only correction to stock, carrying a reason code, before/after counts, and attribution (E-04). | "stock edit", "write-off" (a write-off is one *reason code*, not the entity) |
| **Section** | Top-level reporting category — `VINYL`, `MERCH`. Genres roll up into Sections (M-06). Uppercase when naming one. | "department", "category", "genre" (a genre is finer-grained and rolls up into a Section) |
| **TaxLine** | A named, rated tax entry. Sellable things reference one rather than carrying a boolean. A zero-rate line is how exemption is expressed. | "tax rate" (OK in prose), "tax flag", "taxable Y/N" |
| **CloseBatch** | One end-of-day close — identifier, timestamp, closing User, and the Sales it moved to Closed (M-03). Carries the day's **stored summary**, which holds a **schema version** written by `close_run` ([architecture](architecture.md) A-30, A-83). **A batch is *live* or *retired*, and only a live one is ever summed** ([architecture](architecture.md) A-84): an Undo End of Day **retires** its batch — which keeps its id, timestamp, closing User and the summary it computed, and gains the undo's actor — and re-closing writes a **new** one, so a calendar day may carry several. | "day", "shift", "session" (a batch is not necessarily a calendar day); saying a batch is *deleted* or *reopened* by an undo — it is retired, and a new batch replaces it; treating a stored summary as rewritable |
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
| **settlement** | The **act**: a Manager ticks whatever they are settling and settles it ([M-05](flows/M-05-accounts-payable.md) d27). Credits in the selection attach to the debits in it, money covers the shortfall, and the record it produces is a **PaymentBatch**. A selection holding no debit is a **clearing**, not a settlement. | using it for the record (that is a PaymentBatch); "payment run" |
| **clearing** | Retiring a set of same-Supplier rows from attention **without moving the balance** ([M-05](flows/M-05-accounts-payable.md) d15, d27). A Manager's manual call, never inferred. A credit in a clearing **stays counted** — it is not consumed, because there is no debit to consume it against, which is what distinguishes a clearing from a settlement. Nothing is deleted; both rows stay as history. | "write-off", "reconciliation" (that is the checking, not this), "netting off" |
| **Claim placeholder** | A manual ledger entry of type **Claim** — logged before the supplier's credit memo is in hand. It carries **two figures**: a **face amount**, which is what a clearing's sum-to-zero test reads, and a **balance contribution of zero**, because the supplier has not agreed to it ([M-05](flows/M-05-accounts-payable.md) d14, d29). Distinct from a **SupplierClaim**, which is raised in E-04 against actual copies. | conflating it with a SupplierClaim; treating its face amount as money owed to the store |
| **remainder Credit** | The part of a credit that could not attach to any debit in the settlement that consumed it, emitted as **its own artifact** ([M-05](flows/M-05-accounts-payable.md) d25, d28). **One per source credit**, carrying provenance back to it ([architecture](architecture.md) A-36). Not a **manual ledger entry** — d12's defining characteristic is that a manual entry is *not* sourced from Receiving or Supplier Claims, and a remainder is sourced from a credit by construction. | "leftover credit", "partial credit" (nothing is partially applied — d24, d28), filing it as a Create-new Credit |
| **manual ledger entry** | An accounts-payable row a Manager types by hand — Invoice, Claim, Credit, Adjustment or Consignment ([M-05](flows/M-05-accounts-payable.md) d12) — a lump subtotal/tax/freight/misc, **not** sourced from Receiving or Supplier Claims and not itemized against any InventoryItem. Table is `ap_ledger_entries` ([architecture](architecture.md) A-36). | "adjustment" for the whole category (that is one of its five types); "journal entry" |
| **consumed** / **cleared** | Two end states of a credit, and they are different facts. **Consumed** means its value has been attached to debits — derived from the existence of a target row in a non-voided batch. **Cleared** means a Manager retired it from attention — derived from membership of a clearing, and **balance-neutral**. Neither is a stored column ([architecture](architecture.md) A-37). ~~*The two **terminal** states*~~ — **cleared is not terminal** ([M-05](flows/M-05-accounts-payable.md) d39): a clearing is a reversible mark and a Manager may un-clear, returning both rows to the outstanding list. Safe because a clearing moves no money and writes no journal lines. There is also **no such thing as a voided clearing** — A-36 gives `ap_payment_batch_voids` and `supplier_claim_voids` and no equivalent for clearings, which is the schema having been right about this all along. | "spent" / "used" / "closed"; storing either as a flag; treating them as one state; calling **cleared** terminal, or speaking of a *voided* clearing |
| **consignment** | Stock the store sells on the supplier's behalf rather than having bought. A Supplier carries a **consignment flag**, copied onto each InventoryItem at finalize ([E-02](flows/E-02-receive-inventory.md) d33). The flag exists in v1; the program built on it does not. | using it loosely for a shipment or delivery |
| **reconcile** / **reconciliation** | Checking this system's record against an outside document. **Two contexts, one meaning** ([M-08](flows/M-08-general-ledger.md) d25): the received batch against the supplier's invoice totals (E-02), and a GL account against a bank statement or another external record (M-08). Widened rather than split — unlike *close*, which §15 had to replace because a day and a month are genuinely different acts, this is one act performed against two documents. In M-08 the result is a **reconciled set**, and [M-08](flows/M-08-general-ledger.md) d37 gives it **two kinds** under the one word: a **matched** set — offsetting entries within one account that net to zero, balance-neutral *by construction*, which is the undeposited-funds case — and a **cleared** set — the entries that appear on an outside document, whose **remainder is the point** rather than a failure, which is the bank-statement case. ~~entries within one account, marked together, that net to zero~~ was one rule for two acts and served only the first. Both kinds move no money and gate nothing. | "balance", "audit", "match up"; **"clearing"** and **"settlement"**, which are M-05's (§4, §14); **"cleared"** unqualified, which is M-05's credit state (§14) and not this |
| **draft** | Invoice state before finalize. Persists immediately; abandonable and resumable. Lowercase. | "pending", "in progress", "unsaved" |
| **finalize** / **finalized** | Committing the Invoice: all lines become sellable inventory, the Invoice is written to the invoices database, a letter-size summary prints. American spelling. | "finalise", "close", "submit", "post", "commit" |
| **correctable** | The state an Invoice is in between **finalize** and **paid**: lines are sellable, and costs, totals and added lines may still change. A line whose copy has already sold cannot be removed ([E-02](flows/E-02-receive-inventory.md) d4, d40). | "editable" (too broad — a *draft* is editable), "open", "pending" |
| **immutable** | A **paid** Invoice cannot be edited. Attaches at paid, not at finalize ([E-02](flows/E-02-receive-inventory.md) d40, [architecture](architecture.md) A-33) — between finalize and paid an Invoice is **correctable**. It means **immutable while paid**, not forever: voiding the PaymentBatch that paid it ([M-05](flows/M-05-accounts-payable.md) d22) returns the Invoice to **Finalized** and to **correctable** — with nothing to flip, since paid is derived ([architecture](architecture.md) A-33b). Voids and amendments are manager-only and appended as a separate artifact against the original record. | "locked", "read-only", "frozen"; calling a *finalized* Invoice immutable; treating **Paid** as a terminal state |
| **void** | Manager-only cancellation of a finalized artifact, appended against the original rather than deleting it. Three things are voided and each has its own entry: a finalized **Invoice** (handled in E-04), a **PurchaseOrder** (above), and a **PaymentBatch** (below). | "delete" (a *draft* is deleted; a *finalized* artifact is voided), "cancel", "reverse" |
| **void a PaymentBatch** | Manager-only reversal of a recorded payment ([M-05](flows/M-05-accounts-payable.md) d22) — the store's own record of settling, not anything the supplier did. **Whole or not at all**: money returns to each target's balance owing, and a credit returns to **un-consumed, whole** — a claim carries no *remaining*, because decisions 24 and 28 make every credit consumed entire ([M-05](flows/M-05-accounts-payable.md) d24, d28). An Invoice that stops being paid returns to **Finalized** and becomes **correctable** again. Distinct from voiding the Invoice itself, which is E-04's. | "void the invoice" (a different artifact), "refund" (nothing is refunded — the store was the payer), "unpay", "delete the payment" |
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
| **suggested retail** / **suggested retail price** | `round_to_ending(list_price × (1 + supplier_margin), ending)` ([architecture](architecture.md) A-49; `_bp` → `_ppm` per A-47). Priced off the **pre-discount list price**, so supplier discounts are captured as margin ([E-02](flows/E-02-receive-inventory.md) d49). Advisory — a pre-fill, never a constraint. | "recommended price", "auto price", "calculated price"; `round_up(...)`, which is the retired helper |
| **sticky retail price** / **sticky price** | The retail price stored on a Record and pre-filled on the next receipt. **New stock only.** Always visible and editable; never applied silently. | "saved price", "default price", "last price" |
| **shelf price** | Any customer-facing price. **Suggested** by rounding to the **nearest** instance of the store's **single configured price ending** — `99`, `95` or `0` minor units, held in `store_settings` ([architecture](architecture.md) A-49, [M-06](flows/M-06-settings.md) d44). A default, not a rule: no column, trigger or function rejects an unrounded amount ([E-02](flows/E-02-receive-inventory.md) d32, [E-04](flows/E-04-manage-inventory.md) d17, [E-05](flows/E-05-sell-a-record.md) d26). | "retail price" when the rounding rule is the point, "display price"; "`.50` or `.99`", which was two endings and is now one; "rounded up" |
| ~~**round up** / `round_up`~~ → **round to ending** / `round_to_ending` | **Renamed and reversed** by [architecture](architecture.md) A-49, because the old name now says the opposite of what it does. `round_to_ending(minor, ending_minor)` rounds to the **nearest** instance of one configured ending, **ties away from zero** (A-47), so a negative-quantity Return line rounds symmetrically to the Sale that produced it. Still advisory — any amount is accepted. | "round up", which is retired; describing it as enforced; assuming it reads the setting — the ending is an argument, because a pure helper that reads a table is not a pure helper |
| **below-cost pricing** | Setting a shelf price under cost. **Permitted**; raises a ReviewFlag ([E-02](flows/E-02-receive-inventory.md) d35). | "loss pricing", "negative margin"; describing it as blocked |
| **guardrail** | A threshold at which an action raises a ReviewFlag rather than being refused — below cost, or beyond ±2%. | "validation", "limit"; implying it blocks |
| **cost of goods** / **COGS** | Where cost, freight, misc, and the CostAdjustment land. **Inbound tax is excluded** ([E-02](flows/E-02-receive-inventory.md) d34) — it is a recoverable Input Tax Credit, not a cost. | "cost of sales", "landed cost" (§ below); including inbound tax |
| **landed cost** | The allocation of freight/tax/misc down to items — **explicitly not done**. Say "there is no landed-cost calculation". | using "landed cost" to mean plain cost |
| **freight** | Invoice-level shipping charge. Often unlabeled on the paperwork; derivable as `Total − Sub-Total − Tax`. Lowercase. | "shipping", "postage", "carriage" |
| **tax** | Invoice-level. On the reference invoice this is Canadian **GST** + **QST**. | "VAT", "sales tax" when GST/QST is meant |
| **miscellaneous** / **misc** | Invoice-level manual cost bucket. | "other", "adjustments" |
| **subtotal** | Sum of line costs. Distinguish **derived subtotal** (our sum of entered costs) from the supplier's **stated subtotal** (`Sub-Total` on their paperwork). | "net total", "goods total" without the derived/stated qualifier |
| **±2%** | The bound on the Invoice **Total** and on nothing else — **a wall, not a threshold** ([architecture](architecture.md) A-48, [E-02](flows/E-02-receive-inventory.md) d50). Asserted in the definer function that writes the Total, never in the screen; `20000` ppm is the figure (A-47). No authorization lifts it and it raises no ReviewFlag, because there is no longer an action to flag. The **stated subtotal**, tax, freight and miscellaneous stay freely enterable, and d18's derived-versus-stated comparison stays a warning that *does* raise a flag when accepted. Not configurable ([M-06](flows/M-06-settings.md) d43). Write it as `±2%`. | "2 percent", "small adjustment", "rounding tolerance"; "a threshold at which a Manager is told", which was true until A-48 |

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
| **Walk-in** | A Sale carrying **no Customer**. The word is the same everywhere it appears — under the transaction number on the till rail ([E-05](flows/E-05-sell-a-record.md) d30), as the fourth bucket of [M-03](flows/M-03-daily-summary.md)'s *Sales by customer type* beside the three Account types (d22), and in the customer column of its *Tendering details* (d25). Capitalised when naming the bucket. | "unlinked", "anonymous", "none", "no customer", a blank cell — all four were in use before the word was settled, and a blank reads as missing data rather than as a walk-in |
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

---

## 14. Accounting and the ledger (M-07)

**Ratified vocabulary.** Written before [M-07](flows/M-07-chart-of-accounts.md) existed, as
reserved wording; ratified as decisions with it ([architecture](architecture.md) A-64 to A-67,
M-07 d1–d14, and §9's amendment row for this section). The section exists because four of the
words this flow wanted were **already taken** by other parts of the system, and the cheap
moment to settle that was before anything cited them. ~~M-07 does not exist and nothing below
is a decision~~ — it does, and they are.

Appended rather than inserted, so the existing section numbers stay stable.

### The collisions this section exists to prevent

| The obvious word | Already means | Use instead |
|---|---|---|
| **deposit** | A line-less Sale tendered to a Customer's account — layaway ([E-05](flows/E-05-sell-a-record.md) d25, [architecture](architecture.md) A-25) | **BankDeposit** |
| **clearing** | Retiring a set of same-Supplier rows from attention without moving the balance (§4, [M-05](flows/M-05-accounts-payable.md) d15, d27) | **undeposited funds** |
| **settlement** | The act that produces a PaymentBatch (§4, [M-05](flows/M-05-accounts-payable.md) d27). *Settle* is also NG-4's own word for the **excluded** capability ([PRD](PRD.md) §7) | **BankDeposit** for the artifact; say *banked*, never *settled* |
| **manual ledger entry** | An accounts-payable row a Manager types by hand (§4, [M-05](flows/M-05-accounts-payable.md) d12). It moves a supplier balance, **not** a GL account | **journal entry** for the posting |

### Terms

**Entity forms follow §3's rule.** The modelled thing is PascalCase — `GLAccount`, `JournalBatch`, `BankDeposit` — and the everyday word is lowercase: *a GL account*, *a journal entry*, *a bank deposit*.

| Canonical | Meaning | Avoid |
|---|---|---|
| **chart of accounts** | The store's list of GL accounts — [M-07](flows/M-07-chart-of-accounts.md), pre-loaded at setup with a reserved account per **role** and every seam mapped (M-07 d3, d11). ~~It does not exist; three columns are reserved against it~~ — the three reserved columns (`tax_types.gl_account`, a tender's **Code**, a Section's **GL code**) were retired by [M-06](flows/M-06-settings.md) d58 and [architecture](architecture.md) A-64; every mapping lives in M-07 d4's `gl_account_mappings` instead. Per Store, like everything else ([architecture](architecture.md) A-5). | "COA"; "the ledger" (that is the postings, not the list); a *code typed onto a settings row* as the way to map one |
| **GL account** | The canonical name for one row of the chart, and for any field pointing at one. It carries a **role** the software resolves it by and a **number and name the store owns** — nothing is ever resolved by number ([M-07](flows/M-07-chart-of-accounts.md) d3). ~~The three reserved columns spell it three ways~~ — those columns are gone (A-64), and the one name stands. | "GL code", "account code", "nominal code"; **Code** unqualified — a tender, a Section and a tax type each already carry a different `Code` |
| **journal entry** / **posting** | A balanced set of debits and credits written against GL accounts. **Not** a **manual ledger entry** (§4), which is an accounts-payable row — §4 already lists *journal entry* as the wrong word for that one, and this is the artifact it was being kept clear of. [M-06](flows/M-06-settings.md) d39 uses **posting** for the act. | "manual ledger entry" for a posting, or the reverse; "transaction" (ambiguous — a Sale is one too); "GL entry" |
| **BankDeposit** | The artifact recording **what actually reached the bank**, against the **undeposited funds** a close produced. Money side only: nothing instructs a bank, on the recording-not-executing line [M-05](flows/M-05-accounts-payable.md) draws for payments. PascalCase for the artifact; "bank deposit" in running prose. | "deposit" unqualified — taken by [E-05](flows/E-05-sell-a-record.md) d25; "settlement", "banking run"; "payout" (that is a till behavior, [M-06](flows/M-06-settings.md)) |
| **undeposited funds** | What a tender has taken in that the bank has not yet paid out, carried at face value. **Per tender, not per behavior**, following [M-06](flows/M-06-settings.md) d22 — `Visa` and `Amex` settle as separate deposits and a merged figure cannot be tied back to a statement. The name is QuickBooks' own for this account, chosen so an export maps one-to-one instead of needing a translation. | "clearing account" — **clearing** is taken (§4); "float", which [M-03](flows/M-03-daily-summary.md) d8 rules out having at all; "cash in transit" as a second name for the same thing |
| **card processing fee** | The difference between a card tender's **undeposited funds** and what the bank paid against them. **Derived from a BankDeposit, never configured** — no rate is stored anywhere, following [M-06](flows/M-06-settings.md) d37's shown-but-never-written boundary. Distinct from **payment processing** (§1), which is the excluded capability. | storing a rate per tender; "merchant discount rate" as something this system holds; conflating it with **payment processing** (NG-4) |
| **Second-hand purchases** | Where the money side of a counter buy lands: the `Used Credit` tender ([E-05](flows/E-05-sell-a-record.md) d14) debits it, and the second-hand intake credits it at booked inventory cost. **Its balance is a period cost, not an error** — a lump paid for a crate and copies booked at a nominal figure differ on purpose. Same shape [E-02](flows/E-02-receive-inventory.md) d16 gives freight: a real cost of stock that is not allocated per copy. | calling it a clearing account; treating a non-zero balance as something to reconcile or age; "used purchases" (§4 prefers *second-hand*) |

## 15. The ledger's periods (M-08)

**Ratified vocabulary.** [M-08](flows/M-08-general-ledger.md) d4. Appended rather than
inserted, so the existing section numbers stay stable.

### The collision this section exists to prevent

| The obvious word | Already means | Use instead |
|---|---|---|
| **close** / **closed** | The end-of-day close — moving every Current Sale to Closed and producing the day's breakdown (§11, [M-03](flows/M-03-daily-summary.md)). **CloseBatch** is its artifact | **seal** for the act, **sealed period** for the result |

### Terms

| Canonical | Meaning | Avoid |
|---|---|---|
| **seal** | The act of finalising an accounting period: every transaction in it is checked, the period is made no longer writable, and a closing transaction carrying balance-forwards is written ([M-08](flows/M-08-general-ledger.md)). *Seal the month*, *seal the year* | **close** (that is the day, §11), "post", "finalize" (E-02's), "lock" (names the mechanism, not the act) |
| **sealed period** | A month or year that has been sealed. Its contents are not writable and its closing balances are what later periods count forward from | "closed month", "closed period" |
| **unseal** | Returning a sealed period to writable. **The most recently sealed period only**, repeated to walk backwards ([M-08](flows/M-08-general-ledger.md) d29); a year **marked filed** never reopens (d22). Authorized, and carrying a required reason (d18). *This entry said the question was open until d29 answered it in the same branch.* | "reopen" (harmless, but *seal*/*unseal* is the pair) |
| **opening position** | The balances the store carried in from its previous records, held as a sealed transaction dated before the first period ([M-08](flows/M-08-general-ledger.md)). Wax Works' shop is migrating from **paper**, so these are typed from an accountant's statements rather than imported | "opening balance" for the whole set (that is one account's figure), "migration" |

