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

### 2.8 Payables

| # | Decision |
|---|---|
| A-36 | **The Payables data model.** The group becomes `supplier_claims`, `ap_ledger_entries`, `ap_credits`, `ap_payment_batches`, `ap_payment_batch_voids`, `ap_payment_targets`, `ap_clearings`, `ap_clearing_members`. **`ap_payments` is retired** — it named APPayment's shape, which the [lexicon](lexicon.md) already retires and which [M-05](flows/M-05-accounts-payable.md) d16 replaced with a PaymentBatch carrying typed targets (d19). **A void is a row, never a column:** A-33a forbids updating the batch, so `voided_at` on the batch would break the rule the void exists to honour, and `unique(batch_id)` on the void table makes a double void structurally impossible rather than a check someone remembers. **An Invoice's balance owing** is its reconciled Total — tax **included**, because A-29 takes tax out of *cost of goods*, not out of what is owed — less every target against it in a non-voided batch, of either kind. **A Supplier's balance** is four terms: debits, less money targets, less claim-credit targets, less credits that are **agreed** (d26) and **not consumed**. The fourth term is what makes d26's *"applying a credit never moves the balance"* arithmetically true; drop any term and one of M-05's worked examples breaks. **Both balances may be negative**, on the same footing as on hand in §5.1 — a negative Supplier balance means the supplier owes the store, and nothing clamps it. Every money column is integer minor units (A-15) and **carries its own currency code**, because A-33a requires a void to reverse amounts *as recorded* and that is undefined without one; no rate is stored, so exchange gain or loss stays M-05's open question. Every foreign key is **composite on `(store_id, …)`**, making a cross-tenant reference unrepresentable rather than merely policy-prevented — which matters because A-4 puts these writes in definer functions where row-level security does not apply. The same trick on `(supplier_id, …)` turns d7's same-supplier rule into a declarative constraint. **One remainder per source credit** (d25, d28), so provenance is a single reference and a void reverses each independently. *Accepted consequence:* the ledger grows a row wherever it used to mutate one, and a credit's history is a chain rather than a field. |
| A-37 | **A credit's terminal states are derived from artifact rows, never stored on the credit.** Completes [M-05](flows/M-05-accounts-payable.md) d24 and d28, which removed a credit's running remainder without saying what the binary fact they left behind is made of. A credit is **consumed** when a claim-credit target in a non-voided batch names it, and **cleared** when it is a member of a non-voided clearing. There is no `applied`, no `remaining`, no `consumed_at`, no `cleared_at` and no state enum. Two reasons, the second decisive. **They are not one fact:** consumption moves money, clearing is explicitly balance-neutral (d15, d27), so an enum would force two axes into one column and make illegal combinations representable. **And a stored flag has a release path someone must remember:** d22's void returns a credit to un-consumed exactly as A-33a returns an Invoice out of Paid, and A-33b refused a stored `paid` for that precise reason — there is nothing to flip. Follows A-20a and A-35: the schema already answers both questions from rows, and a second copy drifts. **Corrects d24's reasoning.** Whole consumption retires the *arithmetic* — there is no sum to bound — but **not the row lock**. Two settlements can each read a credit as un-consumed and each attach it at full value, which is worse than over-spending a remainder. The invariant that replaced `sum(applications) ≤ amount` is an **equality** — a credit's targets plus the remainders emitted from it equal its amount — which no table constraint can express, so `ap_settle` is its only enforcement point. *Accepted consequence:* "is this credit spent" is a query across two tables rather than a column read, and mutual exclusion lives in one function's lock discipline rather than in the schema. |
| A-38 | **The payables function surface and its locks.** `ap_payment_record` is replaced by **`ap_settle`**, which takes [M-05](flows/M-05-accounts-payable.md) d27's selection whole: it writes the batch, one target per debit and kind, any placeholder disposals, and — in the same transaction — emits the remainder Credits d28 requires, asserts A-37's equality, re-evaluates A-33b for every Invoice it touched, and returns any flags raised. All or none, in the shape §6 gives `sale_tender`. **`ap_batch_void`** appends the void artifact, never updating the batch (A-33a), restores every credit by the *absence* of a live target rather than by a write, reverses the remainders this batch emitted, and **refuses** where one has already been absorbed or cleared (d22, d24). Manager-only under A-28a, with both names recorded, as are `ap_entry_create`, `ap_clearing_create` and `claim_mark_credited` — the last now a **money write**, since d26 makes a Credited claim count. `claim_create` stays an Employee action: the claim is raised in [E-04](flows/E-04-manage-inventory.md), not here. Balances are **views**, not functions, so reads go straight to row-level security as §3 requires. **Locks:** every credit and every debit in the selection, `FOR UPDATE`, **in primary-key order** so two Managers ticking the same rows in opposite screen order cannot deadlock; nothing locks the Supplier row, because the balance is derived and stored nowhere. *Accepted consequence:* a settlement holds locks across several tables for one transaction — acceptable at a few payment runs a week, and not a pattern to copy at till volume. |
| A-39 | **Payables moves ahead of M-02, and the Invoice immutability trigger moves out of M3.** Amends §8. The trigger fires only on a **paid** Invoice (A-33), and no Invoice can become paid before payables exists — so in M3 it can neither evaluate A-33b's predicate nor guard anything. §8's M3 entry is a leftover from the pre-A-33 reading where the trigger fired at finalize. It moves to the payables milestone alongside the tables its predicate reads, which **closes §11's one blocking open question** rather than restating it. M3 keeps no immutability work: §5.1's other two immutable things belong to M4 and M5. Payables also needs two things §8 scheduled nowhere — **E-04's SupplierClaim tables**, which d26 makes a balance input, and **M-01's payment terms and billing address** with E-02 d45's derived due date, without which nothing can be called overdue. *Accepted consequence:* M-02 reorder slips behind payables, and the claims screen arrives earlier than the flow that raises most claims would suggest. |
| A-40 | **`SECURITY DEFINER` functions re-assert the tenant.** Answers §11. A-4 makes every write a definer function, which therefore does **not** get row-level security applied to its own statements, so §5's policy protects tables the function bypasses. Every definer function resolves `auth.store_id()` itself and carries it in every predicate and every insert, and `search_path` is pinned on every one. **General, not payables-specific** — but payables is where it bites, because `ap_settle` takes client-supplied ids for Invoices, entries and credits at once and writes five tables. A-36's composite `(store_id, id)` foreign keys are the belt to this braces: they make a cross-tenant reference unrepresentable at insert time, independent of what any function remembers to check. *Accepted consequence:* every existing function has to be revisited against this rule rather than only the new ones. |
| A-41 | **An Invoice's immutability is a check in the write path, not a trigger.** **Supersedes the second half of A-39** — there is no Invoice immutability trigger to move, because there is no trigger. `§5.1` had made immutability *a thing to build*, which is why it needed a milestone and why it collided with payables not existing yet; making it a property of the write path dissolves the collision instead of rescheduling around it. **`invoice_is_paid(invoice_id) → boolean` is the single seam.** Every E-02 write path against a finalized Invoice calls it and refuses while it is true; `ap_settle` and `ap_batch_void` call the same function when they re-evaluate (A-38); the screens call it to decide whether to draw the scan slab. A-33b's predicate therefore has exactly **one** definition, which is also what gives the corrections-racing-settlements lock in A-33b something single to lock around. **M3 ships it returning `false`** — correct rather than stubbed, since no Invoice can be paid before payables exists — and the payables milestone replaces the body with the real derivation. No migration moves, no deliverable is rescheduled. **This covers the Invoice only.** §5.1's other two immutable things — SaleLines on Closed Sales, and voided Sale numbers — keep their triggers: neither spans tables, neither has a timing problem, and a local trigger on a local fact is the cheapest enforcement there is. *Accepted consequence, and it is the reason §5.1 said "trigger" in the first place:* a write-path check protects the write paths that exist. A migration, a manual fix, or a function added in two years by someone who does not know the rule can edit a paid Invoice with nothing to stop it. A-4 narrows that gap — every write is a function, so there is no client path to forget — but it does not close it, and this decision accepts the remainder knowingly rather than by omission. |
| A-42 | **`ap_batch_void` appends a reversing Adjustment and never refuses.** **Supersedes A-38's refusal clause** and records [M-05](flows/M-05-accounts-payable.md) d30 at the function surface. A-38 had the void refuse where a remainder it emitted had since been absorbed or cleared, which made void legality **order-dependent along a chain of batches** — voiding batch 1 refused while batch 2 held its remainder, and became legal once batch 2 was voided. It also had the void **delete** the remainder, the one place in the whole design where undoing something destroyed a row. Both go. The void now appends a system-sourced reversing Adjustment for every remainder the batch emitted, which restores the Supplier's balance whether or not the remainder still exists, so the function has no refusal path and no chain to walk. The reversal carries provenance to the void that created it and is **not** an `ap_ledger_entries` row of manual origin — same carve-out A-36 gives the remainder. *Accepted consequence:* a voided settlement that emitted a remainder leaves two rows that net to zero and sit in the ledger until a Manager clears them under d15, so `ap_clearings` is load-bearing rather than optional |

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
| A-33a | **Immutability releases when an Invoice stops being paid.** **Completes A-33**, which said immutability attaches at **paid** but not what happens when paid is undone; every sentence of A-33 stays true. Voiding the PaymentBatch that settled an Invoice ([M-05](flows/M-05-accounts-payable.md) d22) returns that Invoice to **Finalized** and to **correctable**, so *immutable* means **immutable while paid**, never immutable forever, and nothing may treat **Paid** as a terminal state. The void is a **new artifact appended against the original batch** — the batch row is never updated and never deleted — following E-02 **step 23** and [E-04](flows/E-04-manage-inventory.md)'s void-and-amend pattern. (*Not* E-02 **d23**, which is "Backorders are tracked by the system"; the existing citations of "E-02 d23" for this pattern at A-27, [M-04](flows/M-04-manage-users.md):25 and [PRD](PRD.md) §5 all mean **step** 23, and are corrected here rather than in place.) A void is one transaction, all-or-nothing in the shape §6 gives `sale_tender`, and reverses target amounts **as recorded** — integer minor units per A-15, never recomputed at a current exchange rate, since a rate change between payment and void would otherwise leak an unrecorded gain or loss into a balance. **Amends §5.1's immutability bullet**, which read "Finalized Invoices … raise on update or delete" and has been wrong since A-33 itself; **amends [PRD](PRD.md) §5 *Auditability***, whose first immutable thing was "a finalized Invoice"; **qualifies A-27**, whose "there is no version to reconstruct" no longer holds. Accepted consequence: receiving history's "as it was finalized" is now a statement about the current state of a document that can still change after it is read, not about a frozen one, and **no version of the difference is kept** — the same exposure A-33 opened between finalize and paid, now extended past paid. |
| A-33b | **An Invoice's `paid` state is derived, never stored.** **Completes A-33 and A-33a**, which said when immutability attaches and releases without saying what the system consults to know. There is no `status = 'paid'` column: an Invoice is paid when it is **finalized**, its **balance owing is at or below zero**, and **at least one settlement has landed on it**. The third clause is load-bearing - a zero-total Invoice (a promo shipment, free goods) would otherwise be born immutable and never correctable, which is the exact failure A-33 exists to prevent. It is *at or below* rather than *equal to* because a balance may now go negative ([M-05](flows/M-05-accounts-payable.md) d25), on the same footing as on hand below. Follows **A-35**'s rule directly: a stored status holds the values a person **sets**, and nobody sets this one - [M-05](flows/M-05-accounts-payable.md) has no *mark as paid* action and never had. Its action list is record a payment, apply a claim credit, create a manual entry, clear entries, void a payment; the Invoice becomes paid because the money reached zero. **Amends the wording of [E-02](flows/E-02-receive-inventory.md) step 4, step 23 and d4, A-33 itself, and [M-05](flows/M-05-accounts-payable.md)'s inherited bullet**, all of which say a Manager *marks it paid in M-05* - describing an act that does not exist. *Accepted consequence:* the immutability trigger can no longer read one local column. It evaluates the derived state per write, so a correction racing a settlement must take a row lock on the Invoice and re-evaluate rather than trusting a value it read earlier. That cost is small at this write volume - corrections are rare and the trigger never fires on reads - and it buys the thing a stored flag cannot: **the release in A-33a is not a step anyone can forget, because there is nothing to flip.** |
| A-34 | **The receiving worklist is scoped to the open Invoice's Supplier and lives in the Invoice track, not on the entry screen.** Amends A-21. Receiving opens on Invoices; the outstanding PurchaseOrder lines appear once a Supplier is known, spanning all of that Supplier's open POs — which is the set A-21's "across all open POs" was for, since the reason given was that Suppliers ship several POs in one box (A-20). It stays **browsable**: `invoice_lines.purchase_order_line_id` is the link A-20a derives backorders from, and an unbarcoded copy has no code to match on, so a list to pick from is the only way that link gets made for it. A scan attaches automatically ([M-02](flows/M-02-reorder-inventory.md) d20). Amends [E-02](flows/E-02-receive-inventory.md) d29 and d38 (E-02 d42). |
| A-35 | **`purchase_order_lines` carries a status, an expected date, and a log; a placed line is never deleted.** `status` is an enum of the values a person SETS — `shipped`, `backordered`, `cancelled` — and nothing else: pending versus ordered is derived from whether `purchase_order_id` is null, and received versus outstanding is derived per A-20a from `invoice_lines.purchase_order_line_id`. Storing either of those would be a second copy of a fact the schema can already answer, and two copies drift. `expected_date` accompanies `shipped`. A `log` column mirrors the one on Invoices and Suppliers. Deleting a placed row is what broke A-20a in the prototype — the derived quantity has nothing to subtract from once the row is gone — so deletion is restricted to rows with no `purchase_order_id` ([M-02](flows/M-02-reorder-inventory.md) d21, d22, d23). |

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
| Payables | `supplier_claims`, `ap_ledger_entries`, `ap_credits`, `ap_payment_batches`, `ap_payment_batch_voids`, `ap_payment_targets`, `ap_clearings`, `ap_clearing_members` (A-36) |
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

**Balances are derived from movements and never edited.** A Customer's account balance is a view over `customer_ledger`. One signed figure, as [E-07](flows/E-07-manage-customers.md) requires.

**An Invoice's balance owing** (A-36) is its reconciled **Total** — tax **included**, because A-29 removes tax from *cost of goods*, not from what is owed — less every `ap_payment_targets` row against it in a batch with no void, of **either** `settle_kind`:

```
settled(inv)       = Σ targets on inv, in non-voided batches, money AND claim_credit
balance_owing(inv) = invoice_total(inv) - settled(inv)
paid(inv)          = finalized and balance_owing(inv) <= 0 and settled_count(inv) > 0   -- A-33b
```

**A Supplier's balance** is four terms, and every one of them earns its place:

```
supplier_balance = Σ debits                                  -- finalized Invoices at Total, plus
                                                             -- ap_ledger_entries by type (d14):
                                                             -- Invoice/Consignment +, Adjustment ±, Credit and Claim 0
                 - Σ targets where settle_kind = 'money'
                 - Σ targets where settle_kind = 'claim_credit'
                 - Σ credits that are AGREED (d26) and NOT CONSUMED (A-37)
```

At the **Supplier** level a credit reduces the balance whether it is attached or not, and attaching is a re-labelling; at the **Invoice** level only an attached credit reduces that Invoice. That one sentence is the whole of [M-05](flows/M-05-accounts-payable.md) d26, and it is why d26's *"applying a credit never moves the balance"* comes out true: attaching moves an amount from the fourth term into the third. Drop any term and one of M-05's worked examples breaks.

**Both balances may be negative** (d25, A-33b). A negative Supplier balance means **the supplier owes the store** — from a Credited claim larger than what is outstanding, a remainder Credit, a manual Credit, or a decreasing Adjustment. A negative Invoice balance means it was overpaid, and what artifact *that* emits is M-05's open question. Nothing clamps either at zero, and every surface reporting a balance renders a negative one.

**An Invoice's `paid` state is derived** (A-33b) — finalized, balance owing at or below zero, and at least one settlement landed on it. No `status = 'paid'` column: nobody sets it, so storing it would be a second copy of a fact the schema can answer (A-35). The third clause keeps a zero-total Invoice correctable rather than born immutable.

**Backorders are derived** (A-20a) — ordered minus received across every Invoice. No `backorders` table.

**A credit's terminal states are derived** (A-37). **Consumed** is the existence of a claim-credit target in a non-voided batch; **cleared** is membership of a non-voided clearing. No `applied`, `remaining`, `consumed_at`, `cleared_at`, or state enum on a credit. The two are different kinds of fact — one moves money, the other is balance-neutral by [M-05](flows/M-05-accounts-payable.md) d15 — so they are never one column.

**No running totals, anywhere on the payables path.** Four back doors, all tempting and all closed: `invoices.paid_to_date` (M-05 step 2 and d4 both say an Invoice "carries paid to date" — that is a column in the **view**, never in the table); `suppliers.balance` (M-01's own requirement already says the figure is derived); `voided_at` on a batch or a clearing (an update to a row A-33a forbids updating); and `cleared_*` columns on a ledger entry.

**A credit attaches in at most one non-voided batch**, and the equality `Σ targets(c) + Σ remainders emitted from c = amount(c)` holds per credit (A-37). Neither is expressible as a table constraint, so **`ap_settle` is the only enforcement point** — which is A-4 doing real work rather than ceremonial work. Both it and `ap_batch_void` take the credit row `FOR UPDATE` and re-evaluate under the lock: whole consumption removed the arithmetic, not the lock, and a status check without one is how two settlements spend the same credit twice at full value.

**A claim credit may only target an Invoice of the same Supplier** ([M-05](flows/M-05-accounts-payable.md) d7) — declarative, via A-36's composite `(supplier_id, …)` foreign key rather than a check inside a function.

**Every payables artifact carries an actor and a timestamp**, and the manager-only ones carry both names (A-28a, [PRD](PRD.md) §5). Three had nowhere to record one before A-36: the **void**, the **clearing**, and the **remainder Credit** — the last emitted by the system inside a settlement, so it inherits that settlement's actor and Manager. That is written down because the one artifact on the money path nobody consciously creates is the one most likely to end up anonymous.

**Cost of goods excludes inbound tax** (A-29). Per-item cost stays `Ext. Price` alone (E-02 d16), so M-03's unallocated-cost caveat still applies.

**Sale line values are snapshot columns, not joins.** Title, artist, grade, price, discount, and tax line are copied onto the SaleLine at time of sale (E-05 d13), so a later catalog edit cannot rewrite history.

**The close stores its own summary** (A-30) as JSON on the CloseBatch.

**Consignment is copied onto the InventoryItem at receipt** (A-26), never joined.

**Rounding is a pre-fill, not a check constraint** (A-24). No column, trigger, or function rejects an unrounded amount.

**Tax lines stack.** A TaxLine has many components, each with its own rate, so GST + QST is one line. A zero-rate line expresses exemption ([M-06](flows/M-06-settings.md)); there is no boolean.

**Tender behavior is code; tender names are data.** The behavior is an enum — `cash`, `card`, `store_credit`, `gift_card`, `payout`, `used_credit` — and the name is editable, exactly as M-06 requires.

**Returns are negative-quantity SaleLines** ([E-06](flows/E-06-process-a-return.md) d1), not a separate document.

**Immutability is enforced two ways, deliberately.** SaleLines on Closed Sales and voided Sale numbers raise on update or delete **by trigger** — both are local facts on the row being written, so a trigger is the cheapest thing that can hold them.

**An Invoice is different: it is a check in the write path, not a trigger** (A-41). Every write path against a finalized Invoice calls **`invoice_is_paid(invoice_id)`** and refuses while it is true. The predicate is A-33b's — finalized, balance owing at or below zero, at least one settlement landed — and it is **derived, never a stored flag**, so voiding the PaymentBatch that settled it ([M-05](flows/M-05-accounts-payable.md) d22, A-33a) releases the Invoice with nothing to flip. A check written to fire at finalize, or written so that it can never release, is wrong in both directions. Because the predicate spans tables, a path correcting an Invoice locks its row and re-evaluates rather than trusting a value read earlier in the transaction — and `ap_settle` takes the same lock from the other side (A-38). Users, tax lines, and tender types are deactivated, never deleted.

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

**`invoice_is_paid(invoice_id) → boolean`** is the single definition of A-33b's predicate and the seam A-41 puts immutability on. It is read-only and derived: finalized, balance owing at or below zero, and at least one settlement landed on it. **M3 ships it returning `false`** — true of every Invoice until payables exists — and the payables milestone replaces the body. Every write path against a finalized Invoice calls it and refuses while it is true; `ap_settle` and `ap_batch_void` call it when they re-evaluate; the screens call it to decide whether to draw the scan slab.

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
| Payables | `ap_settle` **M**, `ap_batch_void` **M**, `ap_entry_create` **M**, `ap_clearing_create` **M**, `claim_create`, `claim_mark_credited` **M** (A-38) |

`ap_settle` is the heaviest of the payables functions and has the same shape (A-38). In one transaction it validates that every ticked row belongs to one Supplier in one Store, writes the PaymentBatch, writes one target per debit and kind, records any Claim placeholder disposals, emits the remainder Credits [M-05](flows/M-05-accounts-payable.md) d28 requires, asserts A-37's per-credit equality, re-evaluates A-33b for every Invoice it touched, and returns any flags. All or none. It locks **every credit and every debit in the selection `FOR UPDATE`, in primary-key order** — the order matters, because two Managers ticking the same rows in opposite screen order would otherwise deadlock, and `sale_tender` avoids that by always taking the counter first while payables has no counter to anchor on. It locks **nothing on the Supplier row**: the balance is derived and stored nowhere, so there is nothing to serialise. A credit-only settlement carries no payment reference (d19).

`ap_batch_void` appends the void artifact and never updates the batch (A-33a). It restores every credit by the **absence** of a live target rather than by a write (A-37), and for every remainder the batch emitted it **appends a reversing Adjustment** rather than deleting it (A-42) — so the void never refuses, whatever became of that remainder afterwards, and there is no chain to walk. Double-void is prevented declaratively by `unique(batch_id)` rather than by a status check.

`sale_tender` is the heaviest function overall and the most important. In one transaction it verifies the lock, allocates the Sale number from the locked counter, marks items sold, mints oversold items, raises any flags, debits gift cards, writes the customer ledger, moves the Sale to Current, and queues the receipt email. It either all happens or none of it does. It accepts zero lines — that is how a deposit (A-25) and a `$0.00` Used Credit counter buy are both rung.

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
| M3 | Receiving | PurchaseOrder tables, worklist, `invoice_lookup`, pricing helpers, Invoice functions, flag raising, `invoice_is_paid()` **returning false** with every edit path already calling it (A-41). No immutability trigger — there is none to build | Worklist landing, receiving history, three-phase wizard, scan-and-price loop, reconcile screen, label print stylesheet |
| M4 | Till | Sale functions, locking, counters, oversold items, gift cards, customer ledger | Sell screen, copy picker, split tender, hold and re-open handoff, Customer balance on a Held Sale, returns with routing, [E-07](flows/E-07-manage-customers.md) |
| M5 | Close, receipts, review | Close functions with stored summary, `jobs` table, cron drain | Close screen and print route, receipt template, Resend, Manager review queue |
| M6 | Hardening *(joint)* | End-to-end coverage of all six flows, a seeded trading day, staff pilot, backup restore verification | |

**M7 — Payables** (A-39), which was scheduled after v1 and now comes first among the post-v1 milestones. **D:** A-36's tables; `ap_settle`, `ap_batch_void`, `ap_entry_create`, `ap_clearing_create` with A-38's lock discipline; the balance views; **the real body of `invoice_is_paid()`**, replacing M3's `false` — every caller is already wired to it, so immutability starts holding the moment an Invoice can be paid (A-41). **U:** the three-track Accounts Payable screen. Two prerequisites §8 scheduled nowhere and which must land with or before it: **E-04's SupplierClaim tables**, since d26 makes a Credited claim a balance input, and **M-01's payment terms and billing address** plus E-02 d45's derived due date, without which nothing can be called overdue.

Then, in order: [M-02](flows/M-02-reorder-inventory.md) reorder, [M-06](flows/M-06-settings.md) settings, [M-04](flows/M-04-manage-users.md) user administration, then the print agent.

**Dependencies to watch.** M3 and M4 both need M2's `resolve_scan`, so land it early behind its contract. Both also need M1's `review_flags`, which is why governance sits in M1 rather than arriving with the review screen.

---

## 9. Amendments to other documents

Each of these has been appended to the document it affects.

| Document | Amendment |
|---|---|
| [PRD](PRD.md) §2.2 | Manager override replaced by a review queue (A-28); manager-only unchanged (A-28a) |
| [PRD](PRD.md) §4.2 | One condition grade per copy plus a note (A-18) |
| [PRD](PRD.md) §5 | Offline resolved (A-1); printing and hardware (A-8); catalog provider (A-12); backups |
| [PRD](PRD.md) §5 *Auditability* | The first immutable thing is a **paid** Invoice, not a finalized one, and it is immutable only while paid (A-33a) |
| [architecture](architecture.md) §5.1 | The immutability trigger fires on **paid** Invoices and releases when an Invoice leaves Paid (A-33a); it evaluates a **derived** paid state rather than a stored flag (A-33b) |
| [E-02](flows/E-02-receive-inventory.md) | Steps 4 and 23 and d4 said a Manager *marks it paid in M-05*; nothing marks it — the state is derived (A-33b) |
| [M-05](flows/M-05-accounts-payable.md) | The inherited immutability bullet said a Manager *marks it paid here*; M-05 has no such action (A-33b) |
| [lexicon](lexicon.md) | *Invoice* and *immutable* — `paid` is a derived state, not a stored one (A-33b) |
| [lexicon](lexicon.md) | New: *settlement*, *clearing*, *Claim placeholder*, *remainder Credit*, *manual ledger entry*, *consumed*/*cleared* (A-36, A-37) |
| [architecture](architecture.md) §5 | Payables table group and both balance derivations replaced (A-36) |
| [architecture](architecture.md) §5.1 | Derived credit states, the no-running-totals rule, the per-credit equality and its lock (A-37) |
| [architecture](architecture.md) §6 | `ap_payment_record` retired for `ap_settle` and `ap_batch_void` (A-38) |
| [architecture](architecture.md) §8 | Payables becomes M7 ahead of M-02 (A-39); M3 ships `invoice_is_paid()` returning false instead of a trigger (A-41) |
| [architecture](architecture.md) §5.1, §6 | Invoice immutability is a write-path check on `invoice_is_paid()`, not a trigger; A-39's second half superseded (A-41) |
| [M-05](flows/M-05-accounts-payable.md) | d24's reasoning corrected — whole consumption retires the arithmetic, not the lock (A-37) |
| [M-05](flows/M-05-accounts-payable.md) | d30 — a void appends a reversing Adjustment and never refuses (A-42) |
| [M-05](flows/M-05-accounts-payable.md) | d22 a voided PaymentBatch releases the Invoice's immutability (A-33a) |
| [PRD](PRD.md) §6 | Multi-store consequences resolved (A-5); catalog provider (A-12); consignment flag (A-26) |
| [E-01](flows/E-01-authenticate.md) | d9 terminal enrollment (A-3); d10 an open Sale suppresses the lapse (A-19a) |
| [E-02](flows/E-02-receive-inventory.md) | d27–d36 — photography, multi-PO Invoices, worklist, derived backorders, optional Invoice number, advisory rounding, consignment, tax out of COGS, flags over gates, receiving history |
| [E-02](flows/E-02-receive-inventory.md) | d39 second-hand reference `SH-YYMMDD-n` (A-32); d40 immutability attaches at paid, not finalize (A-33) |
| [E-02](flows/E-02-receive-inventory.md) | d42 the worklist is supplier-scoped and lives in the Invoice track (A-34) |
| [E-02](flows/E-02-receive-inventory.md) | d46 immutability releases when an Invoice leaves Paid (A-33a) |
| [E-03](flows/E-03-search-inventory.md) | d10 catalog provider is MusicBrainz (A-12) |
| [E-05](flows/E-05-sell-a-record.md) | d21–d26 — the `open` state, per-Store Sale numbers, locking and attribution, emailed receipts, deposits, advisory rounding |
| [M-02](flows/M-02-reorder-inventory.md) | d14 batched prefetch (A-12a); d20 a scan attaches to its PO line automatically (A-34); d21–d23 line status, expected date and log; placed lines are never deleted (A-35) |
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

~~**One is blocking.** §5.1's immutability trigger ships in M3 while payables ships post-v1.~~ **Closed by A-39:** the trigger moves to the payables milestone, where its predicate is evaluable and where it first has an Invoice to guard. It was never a question of faking the predicate in M3 — no Invoice can reach *paid* that early, so the trigger protected nothing there either.

**Nothing is blocking now.**

The rest below are **not blocking** but are unanswered, and all were surfaced by [M-05](flows/M-05-accounts-payable.md) d18–d22:

- ~~**Is an Invoice's `paid` state stored or derived?**~~ **Answered: derived** (A-33b). The release in A-33a is therefore automatic rather than a step, and the M3 trigger evaluates the predicate rather than reading a flag.
- ~~**Where is the sum of a claim's applications bounded?**~~ **Answered, by removing the case rather than enforcing it.** [M-05](flows/M-05-accounts-payable.md) d24 supersedes d20: a SupplierClaim is applied **whole or not at all**, so there is no running remainder and no sum to bound. The concurrency question collapses from a money invariant needing a row lock in two paths to a **status check** — is this claim already applied. Where a credit exceeds what is owed, the excess is emitted as a separate **remainder Credit** artifact (d25), which is an append rather than a mutation and races with nothing.
- ~~**The Payables schema no longer matches what M-05 requires.**~~ **Answered by A-36**, which replaces §5's table group and both balance derivations, retires `ap_payments`, and gives manual ledger entries and the remainder Credit the tables they never had. §5's *principle* — balances derived from movements, never edited — was never the stale part; the inputs were.
- **Does a payables action deserve a `review_flags` kind?** §5.2's `kind` enum has no payables value, and a ReviewFlag is defined as a record that an *Employee* did something worth a Manager's attention. So in a single-Manager store the Manager who records a payment is the one who can void it, and nobody is told. This follows from A-28a as written rather than contradicting it — flagged as the place where "audit matters most where the money is" lands, not as a defect.
- ~~**Do `SECURITY DEFINER` functions re-assert `store_id`?**~~ **Answered by A-40**, with A-36's composite `(store_id, id)` foreign keys as the structural backstop.

Every other open question in the PRD and the 13 flow documents is either decided above or scheduled to a post-v1 milestone.

Two things are decided but measured rather than assumed, and live in §10 as risks:

- **MusicBrainz coverage of vinyl** — M2 reports a hit rate against real shelf stock, with a defined trigger for switching.
- **Backup restore** — verified in M6.

Deferred with their milestones: arbitrary date-range reporting and cross-store consolidation ([M-03](flows/M-03-daily-summary.md)), the consignment program itself (A-26), print agent packaging (§4), and accounts receivable with aging ([PRD](PRD.md) §6).
