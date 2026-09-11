# Wax Works — Architecture

**Status:** Specified
**Last updated:** 2026-09-09
**Owners:** sr-talbot, WaxyWaxman

This document is the technical spine. [PRD.md](PRD.md) says what Wax Works is and who it serves; the [flows](flows/) say how each job works; this says how it is built. Decisions here are numbered `A-n` and cited the same way flow decisions are — **don't renumber an existing decision, append instead.**

Several decisions here amend flow documents. Every one is listed in §9 and has been appended to the flow it affects.

**Target:** Vercel + Supabase. First release covers receive → sell → close.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Application | Next.js (App Router), delivered as a PWA |
| Hosting | Vercel |
| Database | Supabase Postgres |
| Authentication | Supabase Auth, one session per terminal |
| UI | Tailwind + shadcn/ui |
| Catalog metadata | MusicBrainz + Cover Art Archive, behind a provider adapter |
| Outbound email | Resend |
| Error tracking | Sentry |
| Background work | A `jobs` table drained by Vercel Cron |

---

## 2. Decisions

### 2.1 Platform

| # | Decision |
|---|---|
| A-1 | **Online-only in v1.** No offline queue. The PWA caches the app shell; writes fail visibly rather than queuing. Resolves [PRD](PRD.md) §5 *Offline behavior*. |
| A-2 | **Next.js App Router on Vercel.** Till screens are client components; back-office screens are server-rendered. |
| A-3 | **A terminal enrolls; initials attribute.** Each terminal holds a Supabase Auth session whose JWT carries `store_id` and `terminal_id`. The Employee is identified by initials and stamped on every write. Honors [E-01](flows/E-01-authenticate.md)'s no-password trade while giving row-level security a real identity to scope on. |
| A-4 | **Every write is a Postgres `SECURITY DEFINER` function.** The client never writes a table directly. Invariants hold regardless of caller. |
| A-5 | **Every entity is scoped to a Store. Nothing is shared.** Catalog, Suppliers, margins, Sections, the genre map, and sticky retail prices are all per Store. Resolves all five questions under [PRD](PRD.md) §6 *Multi-store consequences*. |
| A-15 | **Money is stored as integer minor units** (`_minor` suffix). Rates are basis points (`_bp`). No floating point anywhere in the money path. |

### 2.2 Catalog

| # | Decision |
|---|---|
| A-6 | **A shared `release_cache` sits underneath the per-Store catalog.** Stores own their own Record rows (A-5); they are populated from a cache shared across Stores, so two Stores never spend two lookups on the same pressing. |
| A-12 | **MusicBrainz is the catalog provider**, behind an adapter. Discogs remains a second implementation of the same interface, off by default. MusicBrainz core data is CC0 and Cover Art Archive is openly licensed, which retires [PRD](PRD.md) §5's Discogs terms-of-use question. |
| A-12a | **The metadata prefetch batches barcodes into Lucene `OR` queries.** MusicBrainz accepts several barcodes per request; Discogs had no bulk endpoint, which is what made a 300-line PurchaseOrder a five-minute job ([M-02](flows/M-02-reorder-inventory.md)). Rate limits are comparable at roughly 1 request/second, and a self-hosted mirror removes the ceiling if it ever bites. |
| A-14 | **Cover art is a stored URL, not a stored file.** `records.cover_art_url`, with a nullable `cover_art_path` reserved so a later snapshot job needs no migration. |

### 2.3 Governance — flags, not gates

| # | Decision |
|---|---|
| A-28 | **The manager override is replaced by a review queue.** Actions previously gated behind an override — below-cost shelf pricing, Invoice adjustment beyond ±2%, subtotal discrepancy, selling into negative inventory, breaking a sale lock — now proceed, and write a `review_flags` row that a Manager reviews afterward. Amends [PRD](PRD.md) §2.2 and [M-04](flows/M-04-manage-users.md), and closes M-04's *Audit surface* open question. |
| A-28a | **Manager-only is unchanged.** Adjusting on hand, voiding a finalized Invoice, Undo End of Day, accounts payable, settings, deletions, merging Suppliers, and setting a supplier margin remain gated. A Manager authorizes in place by entering their own initials; both names are recorded. The [lexicon](lexicon.md) distinguishes *manager override* from *manager-only* — only the first is replaced. |

### 2.4 Selling

| # | Decision |
|---|---|
| A-11 | **Sale numbers are unique per Store**, allocated from a locked counter row. [E-05](flows/E-05-sell-a-record.md) d2's "globally unique" was contrasting Sale numbers against supplier Invoice numbers, which are keyed per Supplier; it predates the multi-store decision. |
| A-16 | **A Sale has a fifth state, `open`** — pre-tender, carrying no Sale number and absent from [M-03](flows/M-03-daily-summary.md) reporting. E-05 assigns *Current* only on completion of tender, which left the Sale being rung up unnamed. |
| A-17 | **Gapless numbering uses a locked counter row, not a Postgres sequence.** `store_counters`, read `FOR UPDATE` inside the allocating function. A sequence gaps on every rolled-back transaction, and E-05 d4 treats a gap as missing paperwork. Counters: `sale_number`, `hold_ref`, `internal_barcode`, `invoice_number`. |
| A-19 | **An `open` Sale is locked to the Employee who opened it.** Handing it over requires putting it on Hold; any Employee may re-open a Held Sale, which transfers the lock. **Tender is attributed to the current lock holder.** Closes E-05's *Employee attribution vs. Sale ownership* open question. |
| A-19a | **An `open` Sale suppresses E-01's 15-minute session lapse** on its terminal, so a lapse can never strand a locked Sale mid-ring. Answers E-01's open question on whether the lapse applies during an open Sale. |
| A-23 | **Held Sales are absent from the close.** `close_run` touches only Current Sales — a Hold is not revenue until tendered. Held copies still reduce *available* stock, so the summary's stock position reflects them. Closes M-03's open question. |
| A-25 | **A deposit uses the customer ledger, not a new Sale state.** A Sale with no lines, tendered to the Customer's account, creates the credit; the Held Sale displays that balance. Closes E-05's *Layaway / deposits* open question using machinery that already exists — `sale_tender` accepts zero lines, as the `$0.00` Used Credit counter buy already required. |

### 2.5 Receiving

| # | Decision |
|---|---|
| A-13 | **No Invoice photography.** Tax, freight, and miscellaneous totals are entered manually. Removes the `InvoiceScan` entity, document extraction, and [E-02](flows/E-02-receive-inventory.md)'s *Supplier-specific extraction* open question. |
| A-18 | **One condition grade per copy**, plus a free-text `condition_note`. Resolves [PRD](PRD.md) §4.2 — no separate sleeve and vinyl grades; specifics go in the note. |
| A-20 | **One Invoice may span several PurchaseOrders.** The link lives on `invoice_lines.purchase_order_line_id`, not on the Invoice, because Suppliers ship several POs in one box. |
| A-20a | **Backorders are derived, not stored.** A PurchaseOrder line's outstanding quantity is what was ordered minus what has been received against it across *every* Invoice. Closes E-02's *Backorder mechanics* open question and mirrors the derived-on-hand rule. |
| A-21 | **Receiving opens on a worklist** of outstanding PurchaseOrder lines across all open POs, searchable by title or barcode and filterable by PO. Opening a cold Invoice with no PO remains fully supported. |
| A-22 | **The Invoice number field is optional, and is a lookup rather than a collision check.** Left blank, it is auto-minted from a Store counter. Matching a **draft** resumes it. Matching a **finalized** Invoice opens it read-only, showing everything received under that number and its totals. Amends E-02 step 4. Second-hand intake runs under a dedicated Supplier so `(supplier, invoice_number)` uniqueness holds with no special case, closing E-02's *Second-hand invoice numbering* open question. |
| A-27 | **Receiving history is a first-class screen.** Past Invoices are browsable and searchable by Supplier, number, date, title, or barcode, and open as they were finalized. E-02 d23's immutability is what makes "as-was" trivially true — there is no version to reconstruct. |
| A-24 | **`.50` / `.99` rounding is a suggestion, never a constraint**, at receiving and at the till alike. The system pre-fills a rounded price; any amount is accepted. Amends E-02 d9 from a rule to a default, and closes E-05's *Rounding at the till* open question. |
| A-26 | **`suppliers.consignment` is a flag now; the program comes later.** It is copied onto each InventoryItem at finalize rather than read through a join, because [M-06](flows/M-06-settings.md) d8 says settings changes are never retroactive. Gives [PRD](PRD.md) §6's consignment question a base to build on. |
| A-29 | **Inbound tax is excluded from cost of goods.** `invoice_cogs = subtotal + freight + misc`. Tax stays on the Invoice for what is owed the Supplier and reports separately as recoverable input tax. Amends E-02 d17, which the flow already flagged as probably wrong — GST and QST are Input Tax Credits, a receivable rather than a cost. |

### 2.6 Reporting and output

| # | Decision |
|---|---|
| A-8 | **No local print agent in v1.** Receipts are **emailed**. Barcode labels and the letter-size finalize summary use browser printing (`window.print()` with `@page` rules) to a driver-installed printer. See §4. |
| A-30 | **The close stores its summary and prints it.** `close_batches.summary` holds the computed breakdown as JSON at close time, and a print route renders it. Closes M-03's *Delivery* open question with both. Storing the snapshot rather than recomputing means an Undo End of Day cycle can never quietly restate a past day. |

### 2.7 Development

| # | Decision |
|---|---|
| A-7 | **A `jobs` table drained by Vercel Cron** carries outbound email and catalog prefetch. Durable and resumable; a rate ceiling falls out of the batch size. |
| A-9 | **Tailwind + shadcn/ui.** The [prototype](prototype.md)'s design tokens map onto Tailwind theme variables. |
| A-10 | **Supabase runs locally in Docker; migrations are committed.** `supabase db reset` gives a reproducible database, which matters when business logic lives in database functions. |
| A-31 | **The agent configuration is version-controlled.** `.claude/skills/`, `.claude/agents/`, `settings.json` and `launch.json` are tracked; per-machine session state — `settings.local.json`, `worktrees/`, `todos/` and the rest — stays ignored. The skills encode this project's conventions (append-only decision numbering, status in three places, [lexicon](lexicon.md) compliance, propose-don't-ratify), so they are project facts belonging under review alongside `scripts/check_docs.py`, not personal configuration. Same reasoning as A-10: version control is what makes a working environment reproducible. The motivating failure is concrete — skills kept locally drift silently, and an agent enforcing a superseded decision reports correct work as broken. Accepted consequences: two people editing one skill can conflict, and the repository carries opinions about a specific tool that would be cruft if we changed tools. |
| A-32 | **A second-hand Invoice with no supplier paperwork mints `SH-YYMMDD-n`, not a Store counter value.** Amends A-22. The reference carries the received date, the one fact a walk-in trade-in reliably has, and `-n` sequences a second intake the same day. `invoice_number` stays a plain text column and `(supplier_id, invoice_number)` uniqueness is unchanged, so this is a minting rule rather than a schema change; second-hand still runs under its dedicated Supplier. Amends [E-02](flows/E-02-receive-inventory.md) d1 and d31 (E-02 d39). |
| A-33 | **Immutability attaches when an Invoice is marked paid, not when it is finalized.** Amends A-22, which had a finalized Invoice opening read-only. Finalize is what makes lines sellable; **paid** in [M-05](flows/M-05-accounts-payable.md) is what freezes the document. Between the two, costs and totals stay editable and lines may be added — a line whose copy has already sold cannot be removed. This resolves a standing contradiction inside [E-02](flows/E-02-receive-inventory.md) between d4 and d31/step 23 (E-02 d40), and it is the reading M-05 already depends on, since an amount that cannot change before settlement makes an amendment against an unpaid Invoice meaningless. Accepted consequence: "finalized" no longer means "finished" — the [lexicon](lexicon.md) entry for *immutable* moves with it, and anything reading an Invoice between finalize and paid must expect its totals to move. |
| A-34 | **The receiving worklist is scoped to the open Invoice's Supplier and lives in the Invoice track, not on the entry screen.** Amends A-21. Receiving opens on Invoices; the outstanding PurchaseOrder lines appear once a Supplier is known, spanning all of that Supplier's open POs — which is the set A-21's "across all open POs" was for, since the reason given was that Suppliers ship several POs in one box (A-20). It stays **browsable**: `invoice_lines.purchase_order_line_id` is the link A-20a derives backorders from, and an unbarcoded copy has no code to match on, so a list to pick from is the only way that link gets made for it. A scan attaches automatically ([M-02](flows/M-02-reorder-inventory.md) d20). Amends [E-02](flows/E-02-receive-inventory.md) d29 and d38 (E-02 d42). |

---

## 3. Shape

```
Browser (PWA)                Vercel                     Supabase
─────────────                ──────                     ────────
Till / back-office     ──▶   Next.js App Router   ──▶   Postgres
  client components            Route Handlers             ├─ RLS on JWT store_id
  reads: supabase-js           Server Actions             ├─ SECURITY DEFINER functions
  writes: functions only       Cron (/api/cron/*)         └─ review_flags
  print: window.print()        Catalog adapter
                                 ├▶ MusicBrainz + Cover Art Archive → release_cache
                                 └▶ Discogs (implemented, off by default)
                               Resend ──▶ receipts, PurchaseOrders, claims
```

**Reads** go from the client straight to row-level-security-protected views — no server hop, so the till stays fast.
**Writes** go through a typed wrapper to a database function. Never a direct table write.
**Identity** rides in the JWT as `store_id` and `terminal_id`. Every function takes `p_actor_initials`; manager-only functions also take `p_manager_initials` and record both names.

---

## 4. Printing

| Document | v1 mechanism |
|---|---|
| Customer receipt | **Emailed** (Resend). Browser printing is the fallback for a walk-in with no email address. |
| Internal barcode label | **Browser printing**, `@page` sized to the label stock. Not optional — E-02 step 8 mints a label for every unbarcoded item, and second-hand intake mints one per copy, so without it a copy cannot be shelved or scanned. |
| Invoice finalize summary | **Browser printing**, `@page size: letter` (E-02 step 22). |
| Daily close summary | Stored on the CloseBatch and browser-printed (A-30). |

**Later, opt-in per Store:** a local agent subscribing to a `print_jobs` table over Supabase Realtime, driving thermal receipt and label printers directly. The connection is outbound-only — no open ports and no firewall rules. It is not built in v1, and it gives a Store local *printing*, not offline trading: A-1 holds regardless.

**Receipt content.** Logo, then a header block, then itemized lines, subtotal, tax per tax line, total, and the tender breakdown. Header text comes from store settings, seeded by migration until the M-06 settings screen lands.

---

## 5. Data model

Every table carries `store_id` and one policy shape:

```sql
create policy tenant_isolation on <table>
  using (store_id = auth.store_id())
  with check (store_id = auth.store_id());
```

`auth.store_id()` reads the JWT claim. The single exception is `release_cache` (A-6), readable by any authenticated terminal and writable only by a database function.

| Group | Tables |
|---|---|
| Tenancy | `stores`, `users`, `terminals`, `store_counters`, `store_settings` |
| Catalog | `records`, `barcodes`, `release_cache`, `sections`, `genre_map` |
| Stock | `inventory_items`, `inventory_adjustments` |
| Receiving | `suppliers`, `invoices`, `invoice_lines`, `purchase_orders`, `purchase_order_lines` |
| Selling | `sales`, `sale_lines`, `tenders`, `sale_log`, `close_batches` |
| Customers | `customers`, `customer_ledger`, `gift_cards`, `gift_card_movements` |
| Payables | `ap_payments`, `supplier_claims` |
| Governance | `review_flags` |
| Configuration | `tax_lines`, `tax_components`, `tender_types`, `currencies` |
| Infrastructure | `jobs` |

`print_jobs` and `pending_order_lines` are deliberately absent from v1 — they arrive with the print agent and M-02 respectively.

### 5.1 Rules the schema has to enforce

**On hand is derived, and can go negative.** A view, never a column:

```
on_hand   = count(items where status in ('sellable','held'))
          - count(items where origin = 'oversold' and reconciled_at is null)
available = count(items where status = 'sellable')
```

When a Sale outruns stock (E-02 d21), `sale_tender` mints an InventoryItem with `status='sold', origin='oversold'` and raises a flag. This keeps [PRD](PRD.md) §4.1's rule literally true, produces a genuinely negative figure, and leaves [E-04](flows/E-04-manage-inventory.md) reconciliation a concrete row to clear when the real copy arrives.

**Balances are derived from movements and never edited.** A Customer's account balance is a view over `customer_ledger`; an Invoice's balance owing is a view over `ap_payments` plus credited SupplierClaims. One signed figure, as [E-07](flows/E-07-manage-customers.md) requires.

**Backorders are derived** (A-20a) — ordered minus received across every Invoice. No `backorders` table.

**Cost of goods excludes inbound tax** (A-29). Per-item cost stays `Ext. Price` alone (E-02 d16), so M-03's unallocated-cost caveat still applies.

**Sale line values are snapshot columns, not joins.** Title, artist, grade, price, discount, and tax line are copied onto the SaleLine at time of sale (E-05 d13), so a later catalog edit cannot rewrite history.

**The close stores its own summary** (A-30) as JSON on the CloseBatch.

**Consignment is copied onto the InventoryItem at receipt** (A-26), never joined.

**Rounding is a pre-fill, not a check constraint** (A-24). No column, trigger, or function rejects an unrounded amount.

**Tax lines stack.** A TaxLine has many components, each with its own rate, so GST + QST is one line. A zero-rate line expresses exemption ([M-06](flows/M-06-settings.md)); there is no boolean.

**Tender behavior is code; tender names are data.** The behavior is an enum — `cash`, `card`, `store_credit`, `gift_card`, `payout`, `used_credit` — and the name is editable, exactly as M-06 requires.

**Returns are negative-quantity SaleLines** ([E-06](flows/E-06-process-a-return.md) d1), not a separate document.

**Immutability is enforced by trigger.** Finalized Invoices, SaleLines on Closed Sales, and voided Sale numbers raise on update or delete. Users, tax lines, and tender types are deactivated, never deleted.

### 5.2 `review_flags` (A-28)

```
review_flags (
  id, store_id,
  kind,                    -- below_cost_shelf | invoice_adjustment | subtotal_discrepancy
                           -- | negative_stock_sale | sale_lock_broken
  subject_type, subject_id,
  actor_user_id,
  context jsonb,           -- the figures that made it dicey: cost, price, delta, variance
  created_at,
  reviewed_at, reviewed_by, review_note
)
```

A flag is written **inside the same transaction as the action it describes**, so the two commit or roll back together. The function returns the flags it raised, letting the screen say the action was recorded for review without blocking it. The Manager's queue is every row where `reviewed_at is null`. Flags are acknowledged, never deleted.

### 5.3 Sale locking (A-19)

`sales.locked_by_user_id`, `sales.locked_at`.

| Event | Effect |
|---|---|
| `sale_open` | Sets the lock to the actor. |
| `sale_add_line`, `sale_update_line`, `sale_tender` | Raise unless the actor holds the lock. |
| `sale_hold` | Releases the lock; state becomes Held. |
| `sale_reopen` | Held only. Transfers the lock; state becomes `open`. |
| `sale_tender` | Attributes the Sale to the lock holder. |
| `sale_force_unlock` | Proceeds and raises a flag (A-28). Breaks a lock stranded by a closed browser. |

---

## 6. Database functions

Every function takes `p_actor_initials`. Functions marked **M** are manager-only and also take `p_manager_initials`, recording both names (A-28a). Nothing else blocks — actions worth a second look raise flags instead.

**Pure helpers**, which encode the pricing rules and are the highest-value tests in the system:

- `round_up_shelf(minor) → minor` — `.00`–`.50` rounds to `.50`, `.51`–`.99` to `.99`, always up. Advisory (A-24).
- `suggested_retail(list_minor, margin_bp) → minor` — priced off the pre-discount list price (E-02 d8).
- `upc_a_check_digit(text) → text`.

**Scan resolution** is read-only: `resolve_scan(p_code)` branches on a `GC` prefix, a non-tracked item code, an internal barcode (resolving to exactly one InventoryItem), or a manufacturer UPC (resolving to a Record, returning a picker payload when sellable copies differ).

| Domain | Functions |
|---|---|
| Identity | `terminal_enroll`, `actor_resolve`, `manager_authorize` |
| Catalog | `record_upsert_from_provider`, `mint_internal_barcode` |
| Receiving | `receiving_worklist`, `receiving_history`, `invoice_lookup`, `invoice_open`, `invoice_add_line`, `invoice_finalize`, `invoice_void` **M** |
| Selling | `sale_open`, `sale_add_line`, `sale_update_line`, `sale_hold`, `sale_reopen`, `sale_force_unlock`, `sale_tender`, `sale_void`, `sale_edit`, `hold_create`, `hold_cancel`, `return_add_line` |
| Stock | `inventory_adjust` **M** |
| Close | `close_preview`, `close_run`, `close_undo` **M** |
| Governance | `review_flag_acknowledge` **M** |
| Payables | `ap_payment_record` **M**, `claim_create`, `claim_mark_credited` **M** |

`sale_tender` is the heaviest and the most important. In one transaction it verifies the lock, allocates the Sale number from the locked counter, marks items sold, mints oversold items, raises any flags, debits gift cards, writes the customer ledger, moves the Sale to Current, and queues the receipt email. It either all happens or none of it does. It accepts zero lines — that is how a deposit (A-25) and a `$0.00` Used Credit counter buy are both rung.

---

## 7. Repository layout

```
apps/
  web/                    Next.js App Router (PWA)
    app/(till)/           sell, return
    app/(back)/           receive, history, search, titlecard, close, review, settings
    app/print/            print-only routes with @page stylesheets
    app/api/cron/         job drain
    app/api/enroll/       terminal enrollment
packages/
  contracts/              schemas and typed function wrappers — the interface
  db-types/               generated from the database
supabase/
  migrations/             numbered SQL
  seed.sql                one Store, tax lines, Sections, tender types, Users
  tests/                  pgTAP
docs/                     this document, the PRD, flows, lexicon
prototype/                harvested for UI copy and layout, then archived
```

`packages/contracts` is the interface between the two workstreams. For each database function it holds an input schema, an output schema, and a typed wrapper. It is written first, jointly. The screen developer builds against it with an in-memory fake while the database developer implements the function to satisfy it, so neither waits on the other. **A change to a contract is a pull request both review** — that is the only coordination ritual this architecture imposes.

---

## 8. Build order

Two tracks in parallel after the foundation. **D** is the database developer, **U** the screens developer.

| # | Milestone | D | U |
|---|---|---|---|
| M0 | Foundation *(joint)* | Monorepo, local Supabase, migration harness, pgTAP, CI | Next.js, Tailwind + shadcn, PWA manifest, Sentry, Vercel |
| | *Joint deliverable:* the `contracts` skeleton — every function signature agreed before either track starts | | |
| M1 | Tenancy and governance | Stores, Users, terminals, `auth.store_id()`, RLS everywhere, `review_flags`, enrollment and authorization functions | Enrollment, initials picker, session lapse, manager-authorize dialog, flag toast, app shell |
| M2 | Catalog and scan | Records, barcodes, `release_cache`, MusicBrainz adapter with batched lookup, coverage check against real shelf stock, `resolve_scan`, barcode minting, stock views | [E-03](flows/E-03-search-inventory.md) search with visible degradation, [E-04](flows/E-04-manage-inventory.md) titlecard |
| M3 | Receiving | PurchaseOrder tables, worklist, `invoice_lookup`, pricing helpers, Invoice functions, flag raising, immutability triggers | Worklist landing, receiving history, three-phase wizard, scan-and-price loop, reconcile screen, label print stylesheet |
| M4 | Till | Sale functions, locking, counters, oversold items, gift cards, customer ledger | Sell screen, copy picker, split tender, hold and re-open handoff, Customer balance on a Held Sale, returns with routing, [E-07](flows/E-07-manage-customers.md) |
| M5 | Close, receipts, review | Close functions with stored summary, `jobs` table, cron drain | Close screen and print route, receipt template, Resend, Manager review queue |
| M6 | Hardening *(joint)* | End-to-end coverage of all six flows, a seeded trading day, staff pilot, backup restore verification | |

After v1, in order: [M-02](flows/M-02-reorder-inventory.md) reorder, [M-05](flows/M-05-accounts-payable.md) payables, [M-06](flows/M-06-settings.md) settings, [M-04](flows/M-04-manage-users.md) user administration, then the print agent.

**Dependencies to watch.** M3 and M4 both need M2's `resolve_scan`, so land it early behind its contract. Both also need M1's `review_flags`, which is why governance sits in M1 rather than arriving with the review screen.

---

## 9. Amendments to other documents

Each of these has been appended to the document it affects.

| Document | Amendment |
|---|---|
| [PRD](PRD.md) §2.2 | Manager override replaced by a review queue (A-28); manager-only unchanged (A-28a) |
| [PRD](PRD.md) §4.2 | One condition grade per copy plus a note (A-18) |
| [PRD](PRD.md) §5 | Offline resolved (A-1); printing and hardware (A-8); catalog provider (A-12); backups |
| [PRD](PRD.md) §6 | Multi-store consequences resolved (A-5); catalog provider (A-12); consignment flag (A-26) |
| [E-01](flows/E-01-authenticate.md) | d9 terminal enrollment (A-3); d10 an open Sale suppresses the lapse (A-19a) |
| [E-02](flows/E-02-receive-inventory.md) | d27–d36 — photography, multi-PO Invoices, worklist, derived backorders, optional Invoice number, advisory rounding, consignment, tax out of COGS, flags over gates, receiving history |
| [E-02](flows/E-02-receive-inventory.md) | d39 second-hand reference `SH-YYMMDD-n` (A-32); d40 immutability attaches at paid, not finalize (A-33) |
| [E-02](flows/E-02-receive-inventory.md) | d42 the worklist is supplier-scoped and lives in the Invoice track (A-34) |
| [E-03](flows/E-03-search-inventory.md) | d10 catalog provider is MusicBrainz (A-12) |
| [E-05](flows/E-05-sell-a-record.md) | d21–d26 — the `open` state, per-Store Sale numbers, locking and attribution, emailed receipts, deposits, advisory rounding |
| [M-02](flows/M-02-reorder-inventory.md) | d14 batched prefetch (A-12a); d20 a scan attaches to its PO line automatically (A-34) |
| [M-03](flows/M-03-daily-summary.md) | d12 Held Sales absent from the close (A-23); d13 stored and printed summary (A-30) |
| [M-04](flows/M-04-manage-users.md) | d8 override replaced by review flags (A-28); d9 manager-only retains in-place authorization (A-28a) |
| [lexicon](lexicon.md) | New terms; *manager override* revised; *Discogs* demoted to one implementation of the catalog provider; *immutable* attaches at paid (A-33) |

---

## 10. Risks

| Risk | Response |
|---|---|
| **MusicBrainz coverage of vinyl** | The licence risk is gone (A-12); coverage replaces it. Discogs is deeper on vinyl because collectors built it, and pressing variants are where it wins. M2 measures this against roughly 200 real barcodes off the shelf. Below about 85%, switch the adapter's default and re-open the licence question. Manual entry (E-02 step 9) catches misses either way, at the cost of receiving time. |
| **Flags accumulating unread** | A review queue nobody opens is worse than a gate, because it looks like oversight. Surface the unreviewed count in the app shell from M1 and check it during the pilot. |
| **Emailed receipts** | A walk-in paying cash with no email address gets nothing without the browser-print fallback, so build it in M5 rather than deferring it. Watch deliverability — a receipt in a spam folder is a customer-service problem. |
| **Cover art as a URL** | Still in tension with E-02 d6's one-time snapshot, though Cover Art Archive URLs are stable and openly licensed. `cover_art_path` is reserved so a snapshot job is an addition, not a migration. |
| **Per-Store catalogs multiplying lookups** | The shared cache (A-6) absorbs it. Worth monitoring the hit rate once a second Store exists. |
| **Online-only stops trading in an outage** | Accepted (A-1). The card terminal is independent of this system, so a genuine outage already halts card sales. Revisit only with evidence from the pilot. |
| **Backups** | Mostly a plan-tier setting rather than build work — Supabase Pro includes daily backups with a 7-day retention window, and point-in-time recovery is an add-on. Enable it at launch and verify a restore in M6, because an unverified backup is a guess. |

---

## 11. Open questions

None blocking. Every open question in the PRD and the 13 flow documents is now either decided above or scheduled to a post-v1 milestone.

Two things are decided but measured rather than assumed, and live in §10 as risks:

- **MusicBrainz coverage of vinyl** — M2 reports a hit rate against real shelf stock, with a defined trigger for switching.
- **Backup restore** — verified in M6.

Deferred with their milestones: arbitrary date-range reporting and cross-store consolidation ([M-03](flows/M-03-daily-summary.md)), the consignment program itself (A-26), print agent packaging (§4), and accounts receivable with aging ([PRD](PRD.md) §6).
