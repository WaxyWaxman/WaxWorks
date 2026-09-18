# Wax Works — clickable prototype

**Status:** First pass (counter core)
**Location:** [`../prototype/`](../prototype/)

## Why it exists

The flows are specified in prose. A clickable prototype lets us **see the screens
and walk the flows** so decisions about style, content, flow, and functionality
are made against something concrete rather than in the abstract. It feeds the
build: it is a React web app on the same platform the product targets (PRD §5), so
its component kit and UI copy are a starting point, not a separate artefact.

It is **not** the schema and **not** production code. It is a thin slice with a
mock in-memory store, and it resets on reload.

## How to run

```bash
npm --prefix prototype install
npm --prefix prototype run dev      # http://localhost:5273
```

Start on the **Flow map**; it carries a suggested review path.

```bash
npm --prefix prototype test       # vitest, pure functions only
```

The money path and the taxonomy are covered by tests rather than by clicking: the Section
derivation and its gap behaviour, genre identity surviving a rename, a deactivated genre still
**resolving** while no longer being **offered**, *By Section* for both line kinds, d20's revenue
flag, and a gift card load resolving to an out-of-scope tax code.

## Flow ↔ screen map

| Flow | Status in docs | Prototype screen | Notes |
|---|---|---|---|
| [E-03](flows/E-03-search-inventory.md) | Specified | Search | Four stock states (here now / on the way / had before / never stocked) banding one ranked list, with a recency stamp per row and filter chips — E-03 decisions 11, 12, 13 and 16. The screen is the till's three tracks (decision 14): the result slab retracts, the Record and its copies hold the middle, the stock answer is the sticky right track. The stamp reads *sold 6mo ago* where a copy has sold and *never sold* where a held Record has sat past the dead-stock threshold — two different clocks, which decision 16 accepts on condition the words say which. *On the way* counts only PLACED order lines; units merely raised into a supplier stream show as “being ordered” and never change a Record's state (decision 13). Grouping, catalog-only rows, scan-to-resolve, catalog-provider-down toggle. Selecting a Record (click a row, Reserve, or a resolved scan) opens its titlecard inline above the results — see E-04. |
| [E-04](flows/E-04-manage-inventory.md) | Specified | *(embedded in Search)* | Copies, derived on-hand math, Reserve → Held Sale, below-cost pricing proceeds and raises a review flag (M-04 decision 8) rather than blocking on a manager override. Not a separate route — the titlecard is a view, not a screen of its own (E-04 decision 1), so it lives inside Search — as `FindSelection` (the copies) and `FindAnswer` (the stock answer), not the older `TitlecardPanel`, which Receiving and Order Processing use instead — and updates as the rest of the screen does |
| [E-05](flows/E-05-sell-a-record.md) | Specified | Point of Sale | Barcode resolver, multi-copy picker, customer pre-fill (with inline create-on-no-match), `0.00` prompt, negative inventory, split tender, hold/void, receipt, PO field, 2-digit discount. Also carries Edit (void-and-duplicate for Current, open for Held), Copy, Search (barcode → item sale history), and M-03's close under **Other functions** (View Subtotal / Total Today's Sales / Undo End of Day, Admin-labeled). Laid out as three tracks that own the window (d29): a **till rail** that collapses to five icons and opens as a drawer over the sale (d30), the sale itself, and a money rail with **Finish sale** pinned to its floor. **Void** only at zero (d31) — the money must be refunded, moved to the Customer's account, or struck first, and striking a settled tender really does put it back (d32). |
| [E-06](flows/E-06-process-a-return.md) | Specified | Return | Negative-qty line, prior-Sale link, refund default, cash/store-credit, stock routing. Entered only from the till rail's **+ New return** (`/return/:saleId`) — mirrors `/sell/:saleId` in never being its own nav item, since a Return is a Sale with `isReturn` set. Laid out as the till is (d9): the same three tracks, the rail carried across, **Finish return** on the money's floor. **Void return** works on E-05 d31's terms and additionally refuses while any copy is routed (d10). A finished Return shows in the rail's Recent, badged and negative (d11), and the returned copy is found by scan-or-search across every copy rather than a dropdown of the whole building (d12). |
| [E-07](flows/E-07-manage-customers.md) | Specified | Customers | Search (name/email/phone), New, Delete, opens on the most recently searched/added card. No separate Edit — every field, account number included, is a live input on the open card. A/R balance, discount + default tax line, purchase history, attach to Sale. Nothing gated. |
| E-04 §"Supplier claims" | Specified (part of E-04) | Supplier Claims (`/claims`) | Not a numbered flow of its own. Claiming credit from a supplier for short/damaged/unshipped stock — distinct from a customer Return. Raised from a titlecard's **Claim vs. supplier** button; claims to the same supplier + separator merge onto one Draft, sent together with an auto-generated claim number. |
| [E-02](flows/E-02-receive-inventory.md) | Specified | Receiving (`/receiving`) | The three phases across the three tracks (decision 38). **Left**, a retractable slab of **Invoices** (decision 42): drafts in flight and the last three received, searched by supplier, number, date, title, barcode or PO number (decisions 36, 43) — a title or barcode lists the Invoices that took that copy in, and a search replaces the bands rather than filtering them, since it reaches past them into the whole history. Shut, a 52px bar — open, new intake, open existing, search — with the drafts riding the open-existing icon as a badge and the recent intakes as short-name-over-copy-count tiles. It pushes rather than overlays. **Middle**, the Invoice: the **outstanding-orders worklist** for this Invoice's Supplier (decision 42) — collapsed by default but carrying its line and copy count, expandable to search and pick from, which is how an unbarcoded copy reaches its PO line and how you see what never turned up; then a fixed scan slab, and under it a **staging card** where a resolved scan takes its list price, discount, sell price, grade and quantity with a live margin before becoming a line — replacing the fillable last row, which scrolled away from the scan that fed it on a long invoice. Resolution cascades the same way: this supplier's pending orders, then the local catalog, then Lookup — which is the slab's only button, since a scanner sends Return and a hand-typed code ends the same way. The line table is fixed-layout: the figures are pinned to narrow columns — List, Disc%, Sell, Margin, Qty, Net — and Record takes what is left, clipped to one line with the full title in its tooltip (decision 41). A scan matching an outstanding line attaches to it automatically ([M-02](flows/M-02-reorder-inventory.md) d20), and the PO number is snapshotted onto the invoice line at receipt — the PendingOrderLine is consumed when received, so that snapshot is the only surviving link. Confirmations are a self-clearing toast at the foot of the track rather than callouts that push the table down; the derived-vs-stated warning is a state, not an event, and lives in the reconcile verdict strip. A below-cost line carries its review flag on the row; a line's Record opens its **titlecard** ([E-04](flows/E-04-manage-inventory.md)) in a modal, which is where a clipped title is read in full and where what was scanned gets checked against what was meant. Each row carries edit, print label and remove — remove asks first, naming the copies it takes with it. Every figure field on the screen — the inline editor, the staging card, the paperwork column — selects its whole value on focus, since these are values you replace rather than append to; they are text inputs with a decimal keypad because `input[type="number"]` cannot be selected and its spinners ate a third of each narrow column. **Right**, reconcile: invoice total as the headline, a verdict strip carrying derived-vs-stated directly under it, their paperwork figures entered beside ours, the ±2%-bounded total, expected margin, review flags, and Finalize. The selected Invoice lives in the URL (`/receiving/:invoiceId`), so it is deep-linkable and survives a reload. **Draft** scans and finalizes; **Finalized** still scans, with a note saying why, and Finalize becomes Save updates; **Paid** replaces the scan slab with a same-height locked band and disables every field (decision 40). A blank second-hand reference mints `SH-YYMMDD-n` off the received date (decision 39). A finalized copy is immediately claimable from its titlecard. |
| [M-01](flows/M-01-supplier-margin.md) | Specified | Suppliers (`/suppliers`, `/suppliers/:supplierId`) | The till's three tracks (decision 12). **Left**, a retractable slab of Suppliers searched by name, short code *and* account number — all three, unlike Customers — with chips for Owing, In flight and Type, and a sort that owns the banding: A–Z is the default and carries no band, because a band across an alphabetical look-up splits it in two for no gain; only the **Outstanding A/P** sort bands Owing above Settled (decision 17). Shut, a 52px strip tiled by **4-letter short code** rather than initials, each tile dotted with its balance state (in-flight wins the dot when nothing is owed). Rows are Find's `.hit` on **two lines** — name and figure on the first, the meta line and the figure's caption on the second, so the grey text has the full width instead of ending an ellipsis beside the money. **Middle**, the card: the full field set grouped Identity / Ordering / Terms / Contact / Billing / Shipping / Notes with the Log on the floor of the same scroll. Every field is a live input **except Discount**, which is the margin and therefore manager-only (decisions 11, 13) — locked, with a Manager authorising in place and both names landing in the log. Edits commit on **blur, not keystroke**: `updateSupplier` appends a log row per call, and committing live would file one row per character. Billing and shipping sit behind a **Same as billing** tick that mirrors and locks the shipping fields; unticking keeps the copied values. **Right**, the ledger: what is in flight with them (grouped drafts → orders → claims, oldest first inside each, capped at three rows and scrolling with the per-kind counts in the label), the outstanding A/P figure, trade over 12 months, and recent intake. **Received is cost of goods and the A/P figure is Invoice totals** — different bases on purpose (A-29, E-02 d34), which the caveat under Trade states, along with the overstated-margin caveat and any copies excluded for having no Invoice behind them. No row-by-row ledger: that stays in [M-05](flows/M-05-accounts-payable.md) and the figure links through (decision 18). Every in-flight and intake row opens the thing it names — a draft or past Invoice at `/receiving/:invoiceId`, a PO in What's on Order, a claim in Claims. The foot is a ladder: open the draft Invoice, else process the pending stream, else start an intake, with Record a payment underneath for a Manager where there is a balance (decision 15). Selection lives in the URL, so a card is deep-linkable. Merge is labeled Manager; Delete is drawn ungated, which M-01 leaves open on purpose. |
| [M-03](flows/M-03-daily-summary.md) | Specified | *(embedded in Point of Sale)* | Not a screen of its own — surfaced under Point of Sale's **Other Functions**. The close is a real state transition (Current → Closed, batched), with Undo End of Day (Admin-labeled) reverting a batch. Breakdown covers gross/returns/net, by Section, by tender, tax, movements (voids/holds/pay-outs), and stock below minimum. Returns are counted — a standalone Return used to be excluded outright, so a cash refund never reached the tender column and the drawer disagreed with the report by the refund. **Account Balance** reports its two directions separately and gift-card loads show as an *of which* line, so the tender column reconciles against net sales (d14). |
| [M-02](flows/M-02-reorder-inventory.md) | Specified | Order Processing (`/orders`), What's on Order (`/on-order`), + a titlecard's **Order** button | **Phases 1, 2, and part of 3.** Order (titlecard, E-04) raises a pending line — quantity, Supplier (defaults to the Record's preferred Supplier), separator, selling price (defaults to shelf price), an optional Customer (customer-attached), and an optional follow-up-flag day count — and joins that Supplier's pending pile; the titlecard's Orders card shows the Record's own Pending/On order unit counts, derived live. Order Processing lists one line per Supplier + separator: pending total, oldest age, order via, customer-attached count, sell total, estimated cost, Ready (against the Supplier's minimum) — every row, in both tables, opens **View** on a click anywhere in it (no separate button). The pending table's own Sep column is a dropdown ("+ New…" for an unused letter) that mass-shifts every line in that stream at once — a merge prompt when the target separator is already in use for that Supplier (decision 17), otherwise a plain move. View opens a stream's lines — live, not a snapshot — with the selected line's titlecard below, so a wrong Supplier is caught before sending; it leads with a "meeting the minimum" panel (qty / retail value / estimated cost against the Supplier's configured minimum) and, for a still-pending stream, lets each line's qty, sell price, and separator be edited in place (same dropdown, one line at a time), and the line deleted (plain confirmation, explicit warning when a Customer is attached — decision 9). Process confirms the send method — an Email Supplier gets a composed preview (items/qty, cancel-by, backorder policy); anything else states a printable document is produced — then assigns a PO number (blank auto-mints the next unused ascending number, same pattern as Supplier Claims' claim number) and appends a summary to the Supplier's log. Previously placed POs list below, most recent first, read-only. **What's on Order** (`/on-order`) is the till's three tracks (decisions 25-30). **Left**, a retractable slab carrying two controls that do different jobs and are drawn differently: **chips filter lines** (their counts are lines — Overdue, Shipped, Backordered, Part rec'd, Waiting) and **a PO row scopes** the middle track (its figure is that order's open lines). *Everything on order* is a permanent first row, not a state to find your way back to, because step 9 lists lines oldest first *across* everything. Search and a scan box sit together at the top; shut, a 52px strip carries the new-order button, an overdue badge and the POs tiled by their number's tail. **Middle**, the lines: age first and largest, the overdue group **banded** rather than silently floated (decision 19 calls overdue-first a fixed grouping, so it looks like one), each row a button. **Right**, the line — who is waiting above the age, for the reason Waiting outranks the balance on the Customer card; then its standing, then **its log (decision 23) on the floor of the scroll**, which until now was reachable only by opening the modal that changes it. Both modals fold into this track: **Set status** (Shipped with their date / Backordered / Cancelled) and **Re-flag** are built, as a ladder — Re-flag leads on an overdue line, Set status otherwise. With no line selected the track carries the scope's totals instead. **Bulk entry** (decisions 25, 28-30) is a second *mode* of the middle track, not a panel in the right one: two destinations chosen at its head — raise as **pending** (plain Phase 1, separator offered, no PO or placed-on date) or record as already **placed** (their reference, a real placed-on date, no separator). A line already outstanding with that Supplier is **marked, never blocked**, naming the line it found (decision 29). Leaving and discarding are separate controls: leaving keeps the batch and the slab advertises it as resumable, discarding asks first and names how many lines it destroys (decision 30). **Not built:** bulk status update and voiding a PO from this screen (both still reachable from Order Processing), and decision 27's catalog metadata prefetch, which has nothing to queue — see the gaps below. |
| [M-05](flows/M-05-accounts-payable.md) | Specified | Accounts Payable (`/payable`) | Manager-only, in its entirety (decision 2) — and now **actually gated**: a Manager authorises in place on arrival ([M-04](flows/M-04-manage-users.md) d24) and their name lands on every payment, clearing and ledger entry. It was labelled manager-only and enforced nowhere, on the stated grounds that E-01 was not built. A lookup box finds any Supplier regardless of balance; below it, suppliers carrying a balance (sorted by name) plus a Settled section so a zero-balance Supplier's history stays reachable. Selecting one shows outstanding Invoices, Pending/Credited-unapplied Supplier Claims, and manual ledger entries in one combined list (decision 3), since what's owed is the net of all of it. **Create new** logs a manual Invoice/Claim/Credit/Adjustment/Consignment entry — a lump subtotal/tax/freight/misc, not sourced from Receiving or Supplier Claims and not tied to any InventoryItem; defaults to Consignment when the Supplier carries that flag. A Claim entry is a placeholder that doesn't affect the balance at all until **Clear selected** matches it against a Credit whose amount nets to zero (manual reconciliation only, never automatic — both stay in the ledger as history). **Record payment** selects any mix of Invoices and payable-type entries and records one PaymentBatch, partial amounts supported per target. **Apply credit** is a single click, not an invoice picker — a Credited Supplier Claim's full amount nets against the supplier's whole balance, auto-distributed across their outstanding Invoices oldest-received-first (decision 11, **since superseded by decision 18** — the built screen is behind the spec here; see the note below), and its Type column relabels from Claim to Credit once Credited. A target whose balance reaches zero — by payment, credit, or both — is marked Paid/settled, the same transition that locks a real Invoice (E-02 §Inherited). **Payment history** is one row per PaymentBatch, newest first, opened to see exactly which Invoices/entries it covered and how much each got. The gift-card liability registry lists every card, its balance, and its attached Customer. |
| [M-04](flows/M-04-manage-users.md) | Specified | Users (`/users`) | The three tracks: a slab of people, the person you opened, and **their log** rather than a figure — A-55 makes before-and-after the point. Add, change role, deactivate, **reactivate** (d19) and **correct** a name or initials (d22). **Neither invariant is enforced by disabling a button**: A-55 puts both in the write path, so Demote and Deactivate stay live on the last active Manager and pressing one says why it will not happen (d14). Same for initials — unique among **active** users, trimmed and upper-cased on write (d13, d20), and the refusal names who holds them. The rules are pure functions in `src/lib/users.ts`, not screen logic, so they can be exercised without clicking. The seed carries **T. Oyelaran (deactivated) and T. Okonkwo (active) both as `TO`**, because d16 releases a departed user's initials — which is exactly why every row shows a **name** and not just the letters. |
| [E-01](flows/E-01-authenticate.md) | Specified | *(the shell — no screen of its own)* | A session is an actor and a timer **in the browser**, which is all A-3 and A-50 permit, so it lives in the app shell rather than on a screen. **Identification resolves as you type on a full match** (d19): type your initials and you are in, no Enter and nothing to press; a prefix does **not** resolve. Escape cancels the action and not merely the dialog — press it on **New sale** and no Sale is created. A string that is still the start of somebody's initials reads *keep typing* rather than as an error. The prompt confirms with the **name**, because initials are reusable ([M-04](flows/M-04-manage-users.md) d16). **Opening a Sale and starting a Return prompt every time, session or not** (d12, d15) — and a Return is not a second case, it is a Sale. The lapse measures **inactivity**, defaults to 5 minutes (M-06 d45) with no maximum (d13), and an **Open Sale suppresses it** (d10) — the chip says so. Deactivating the User in session ends it at once (M-04 d15, d18). **Three tiers of prompt are wired:** *every time* — new Sale and new Return (d12, d15); *only with no session* — new intake, New customer, New supplier (d5); and *once per card rather than per field* when editing a Customer or Supplier, since those save on blur (d20). **An optional password** (d21) is seeded on R. Delacroix as the single letter `p`, so the barrier is reachable in review: type `RD` to open a session and it asks for it, then Enter. Asked at two moments only — opening a session and authorising a manager-only action — never on the counter prompts. A password holder’s session is capped at 5 minutes however long the shop set the lapse. The session chip's **name opens a menu** carrying Log out and what the lapse is set to. **Manager-locked areas and actions** use the same prompt as ordinary identification (d19) — it just refuses anyone who is not an active Manager, naming them — and **always ask, session or not** (d23). Seven surfaces use it: Users, Accounts Payable, Undo End of Day, the review queue, a Supplier’s margin, order processing and the titlecard. **Not built:** terminal enrollment (d9); the component is still named `ManagerOverride` after a retired term. |
| [M-06](flows/M-06-settings.md) | Specified | Settings (`/settings`) | **All eight configuration groups.** The three tracks: the group, the editor, and **the log** — which is the right track rather than an afterthought, because [architecture](architecture.md) A-52 is the decision this screen exists to honour: every write carries an actor, a timestamp, the key touched, and the values **before and after**. Manager-only in its entirety (A-28a), so the whole screen is gated on arrival and the authorising Manager's name is what every log row carries. **Genres** (d12, d19, d32): name, the **required** parent Section, the product tax code, and active — with an **in use** count derived from the catalog, because that is what makes the delete refusal legible. A genre any catalog entry carries **cannot be deleted** ([architecture](architecture.md) A-54); deactivate it instead, which stops it being offered without moving anything (d9). The **gift card genre is system-owned** (d18): the money path resolves a load through it directly rather than through a catalog entry, so nothing in the catalog holds a reference A-54 could see — it is undeletable and its product tax code is not editable, because changing either silently starts taxing money the shop has merely received. **Search is two-tier** ([E-03](flows/E-03-search-inventory.md) d21): the local catalog answers as you type, and the catalog provider answers only on **Enter** — so *where is this in the shop* never waits on a provider request, and an outage shows at the moment you asked rather than as rows quietly absent (d8). A provider match is **browsable**: opening one writes nothing, and it shows its tags, no genre and no stock, because there is nothing for those to sit on until adoption (d18). **Add to catalog** confirms the genre — pre-filled where the map resolved it — and offers an optional selling price that becomes the sticky price (d19, d20). **Pricing bows to the decided price** ([E-02](flows/E-02-receive-inventory.md) d51): the sticky price — however it got there, from the last New-mode receipt or from adoption — pre-fills over the computed suggestion, and where it earns less than the Supplier's own Discount implies, the margin figure **warns rather than the price being moved**. *Purple Rain at a $32.99 sticky against a $27.99 list reads 15.2% and says* under 33.3% for this supplier, *and the price stays at $32.99.* It warns rather than flags: d35 already covers below-cost, and a flag on every thin margin would fill the review queue ([architecture](architecture.md) A-48 in reverse). **What it cannot see** is margin erosion caused by a supplier shrinking their discount, because the suggestion is computed from list rather than from cost (d52) — recorded as an open question rather than papered over. **Adoption** (d53) also happens at the receiving desk's *Find or add this title*, which now lists **catalog-provider releases** below the local results — tags and no genre, because there is no Record for a genre to sit on until adoption. Adding one resolves the map first (A-61) and **asks only when the map cannot**; the prompt shows each genre's Section and product tax code description (d56), offers to map the unmapped tag as an **ungated Employee** write (A-59), and Escape abandons the whole adoption rather than just the dialog (d55, E-01 d19). The seed carries all four cases: every tag mapped, priority beating a heavier vote, one unmapped tag, and **no tags at all** — the last two prompt identically and differ only in whether a map row can be offered. **Merge** (A-60) is on each row: it repoints every catalog entry **and every map row** pointing at the genre, then leaves it unreferenced so Delete becomes available — the map rows are the half A-60 calls easily missed, because a merge that leaves them behind has the next adoption recreate the genre under the old tag. The system-owned gift card genre can be merged *into* but never merged away. **Genre map** is its own group: provider tag → genre and nothing else, with the Section shown but never assigned (d32), and a manager-only **priority** that beats the provider's vote count (A-61) because votes measure consensus rather than specificity. This screen is the Manager's door — the ungated Employee add lives at the adoption prompt (A-59, d53). Below it sits **A-59's compensating mechanism**, and it is what makes taking the gate off safe rather than merely convenient: *tags our Records carry that nothing maps*, with how many Records carry each and **where those Records landed** — an anti-join, derived and never stored, so writing a row makes the entry disappear on its own and there is nothing to acknowledge, clear, or let drift. A titlecard shows a Record's **provider tags with the matched one marked** (A-61), which is what makes *why did this land here* answerable. **Sections** as an editable table (d28) with revenue, tracks-stock default, discountable, returnable and a dead-stock override (d20, d29, d30, d40) — Freight and Gift cards pre-loaded and marked system. **Tenders** as a table (d22, d23): many names, one behaviour, so `Visa` and `Mastercard` both settle as a card; `Cash rounding` is system-written (d26) and **refuses** to be renamed or switched off, naming the reason. **Currencies** with one planning rate each and the date it was last set, stamped on change rather than typed (d33, d38). **Store settings** — lapse, price ending, dead stock, stream aging, drawer policy, receipt width. **Store details** with the Store ID and position shown and unwritable (d47, [M-04](flows/M-04-manage-users.md) d11). **Tax** (d11-d17, d48, d52): tax types with rate, registration number and one pending change — and **no Active switch** (d57, [architecture](architecture.md) A-63), the screen instead reporting how many cells name each type, because that is the whole of what *live* means for a tax; the product tax codes; and the **group × code grid** (d13) where a cell names one or two taxes with optional compounding (d16), a blank meaning out of scope rather than zero-rated (d15). Tax types and groups can both be **added**. M-06’s worked example recomputes live at the foot, so the screen and the till can be **seen** to agree rather than asserted to. **Seeded with all thirteen provinces and territories plus a Wholesale group** — GST-only (AB, NT, NU, YT), HST at three different rates (ON 13, NB/NL/PE 15, NS 14), and GST + a provincial tax (BC, SK, MB, QC). Thirteen jurisdictions sharing one GST row is what d11 replaced d1 to make possible. **The rates are illustrative and want checking against current legislation.** |
| [M-07](flows/M-07-chart-of-accounts.md) | Specified | Chart of accounts (`/chart`) — and **no screen for the journal, on purpose** (d9). Its Phase 4 export screen was never built and will not be: [M-08](flows/M-08-general-ledger.md) d31 makes a journal export one kind of issuance on M-08's reporting surface | **All three phases.** *Phase 1 and 2* — the chart arrives pre-loaded and every seam already mapped (d11), so the screen is a **review rather than data entry**: a reserved account per role, one per tender, **two** per tax type (d5), one per E-04 reason code, and the starter expense accounts d32 seeds so a first rent posting has somewhere to go. **A Section is no longer among them** (d28, d29): revenue resolves to one reserved **Sales** account and the Section rides on the line as a dimension ([M-08](flows/M-08-general-ledger.md) d2). Number and name are live inputs because they are the store's (d3); the **role** sits beside them, not editable, so what the software will put there is always visible. Accounts band by **type derived from the role** (d22) rather than by number, which is what stops a Manager renumbering to match their accountant from scrambling the grouping. The 3000s **carry equity** since d31 — d27 reversed d1's no-equity claim, and [M-08](flows/M-08-general-ledger.md) d17's year-end seal posts into them. What is still absent is *Net Profit* and *Current Profits*, which [M-08](flows/M-08-general-ledger.md) d24 derives when a statement is drawn and never posts. Adding an account is the one place a type is asked for, because it is the only account with no role to derive it from. *Phase 3 — the journal, which has no screen at all.* d9 gives this flow no dashboard, no balances and no journal view, so what was built is the **writing**, not a display: a batch per CloseBatch grouped by `(business date, account)` (d7, d14), and one per artifact for an Invoice at finalize (d13), a PaymentBatch at record, its **void posting forward** (d8), and an on-hand adjustment when it is made (d12). Each is written in the same commit as its artifact (A-67). Where it does not balance, the difference goes to **Suspense** and the Manager is told twice over (d10): the close screen says so in the close's own words, and the review queue carries the first **system-raised ReviewFlag** (A-68) — `journal-imbalance`, with no actor, saying plainly that nobody caused it and nobody can clear it. **Not built:** Phase 4's export (d15, d16). **What building it found** is six open questions and one unratified proposal, all recorded in M-07's own Open questions — five of them the same shape, a decision needing a fact the artifact it reads does not record. |
| [M-08](flows/M-08-general-ledger.md) | Specified | Ledger (`/ledger`) — five phases behind one manager gate: **Opening position**, **Postings**, **Seal a period**, **Read the books**, **Reconcile** | 36 decisions, all five phases wired to the shared store. **Every rule lives in `src/lib/ledger*.ts` and none of it in the screen** — A-74 moves M-08's invariants into the definer function on A-4 and A-48's terms, so the screen collects input, calls a `*Refusal()` and renders what comes back. The opening position derives equity rather than taking it (d26) and materialises it as a line only at the seal (A-78); a posting shows the amount still needed and on which side, and is refused unbalanced (d10); a period is **sealed**, never closed (d4), unsealed only at the most recent and only with a reason (d18, d29); a statement carries **provisional** and a stored issuance keeps that mark after its period seals (d36). Suspense, retained earnings, *Accounts payable* and the gift card liability are not offered; Inventory and the tax accounts are (d13, d33, d34) |

## Turning a review into a decision

1. Note the screen and the flow decision it cites (each screen shows citations like *E-05 decision 18*).
2. Record the change as a **new numbered row** in the relevant `flows/*.md` decision
   table — append, never renumber (see [README](README.md) conventions).
3. Update the prototype to match, so the prototype and the spec never diverge.

Style changes are cheap: design tokens are centralised in
[`../prototype/src/styles/tokens.css`](../prototype/src/styles/tokens.css).

## Design direction — Signal

Five directions were drawn low-fidelity and reviewed against Point of Sale,
Receiving, and Search; two composites were then drawn from the parts that were
picked. **Signal** was chosen on 2026-09-10 and is what the prototype now
implements.

| Element | Comes from |
|---|---|
| Top menu | One band of equal segments, the active one filled solid, ending in **More** |
| Point of Sale | Large scan field, large line rows, a total readable across the counter. Actions are placed by **who is waiting** (E-05 decision 28) — counter work on screen, everything else behind the rail. The screen owns the window and its three tracks scroll separately (decision 29), so Finish sale is always on the money rail's floor rather than below the fold; the rail collapses to icons so the sale keeps the width (decision 30) |
| Receiving | The till's three tracks (E-02 decision 38): a retractable worklist slab, the art-led line table, and reconcile as a sticky 320px right-hand track (decision 41) — so derived vs. stated never scrolls away at any line count. Below 1180px reconcile drops to a bottom strip, which is decision 37's original arrangement. The slab shut is a 52px bar — open, new intake, open existing, search — carrying the drafts in flight as a badge and the three most recent finished intakes as tiles |
| Search | Results rail, titlecard, actions rail |

### What the band carries

**Find · Sell · Receive · More.** The split is by **who is waiting**, not by how
often a screen is used: those three are the jobs done with a customer standing
there, so they never cost a click. Accounts payable is touched every week and
still sits under More, because nobody is waiting on it.

More is a segment of the band, not a control bolted to the end of it — same
size, same type, same fill when active. It lights up whenever the screen you are
on lives inside it, so the band never claims nothing is selected. Its contents
are grouped by the work rather than listed flat: **Ordering** (M-02),
**Money** (M-05, supplier claims), **Records** (E-07, M-01), and the flow map.

This also fixes what ten flat segments had started to cost. Four segments hold
their size down to 900px with nothing clipped, and a new back-office screen now
lands in a group instead of squeezing the band.

The rule that makes it work, and the one to hold the line on: **the chrome is
achromatic, and colour means exactly two things** — the primary action (one
orange, spent once per screen) and **state**. That is what lets the stock states
in Search read at a glance. An accent on a secondary button breaks the system,
because the accent's whole job is to be the only one. Every state colour is
paired with words; colour is never the sole carrier.

_The direction is settled for the prototype. It has **not** been recorded as a
numbered `A-n` architecture decision — [architecture](architecture.md) §1 names
Tailwind + shadcn/ui as the eventual UI stack, and how this token set maps onto
that is a separate question nobody has answered yet._

## Known simplifications

- Mock data only; no persistence, no live catalog provider, no printing.
- **The shop opens with a month of trading behind it**, generated at load by
  [`prototype/src/data/history.ts`](../prototype/src/data/history.ts) — around
  520 copies received across seven Invoices from five Suppliers, some 227 Sales
  over thirty days, a close for each of those days, two settlements, a
  hand-entered bill, ten more Customers and fourteen more titles. `seed.ts` is
  untouched and holds the master data as before; everything generated is
  **additive**, which is why the pure-function tests that import the seed see
  exactly what they always saw.
  **It is illustrative and it is not a fixture.** Volumes, titles, prices and
  the shop's trading pattern are invented to make the screens legible; no
  decision implies any of them, and no test asserts against the figures.
  Two properties are load-bearing rather than decorative, and
  [`history.test.ts`](../prototype/src/data/history.test.ts) holds both:
  **every artifact's journal is built by the same `buildInvoiceJournal`,
  `buildPaymentJournal` and `buildCloseJournal` the app calls** — so the books
  cannot disagree with the artifacts, and no generated journal reaches Suspense
  or leaves a seam unresolved ([M-07](flows/M-07-chart-of-accounts.md) d12,
  [architecture](architecture.md) A-67) — and **no copy is ever sold before the
  Invoice that minted it was finalized.**
- **The dates are relative to the real calendar**, generated at load so the
  window always ends yesterday and today is always an empty day waiting to be
  traded and closed. *Accepted consequence:* the same click gives different
  figures next week, which is affordable only because nothing asserts against
  them. The alternative was a fixed anchor, and the seed already showed what
  that costs — its newest hand-written Sale is dated 2026-09-08 and does not
  move, so the shop reads as more abandoned every week that passes.
- **The four hand-written Sales in `seed.ts` are deliberately left out of the
  generated month.** Three carry state `Closed` while belonging to no
  CloseBatch and having no journal, and the fourth is the Held sale
  [E-05](flows/E-05-sell-a-record.md) wants. They exist to give
  [E-06](flows/E-06-process-a-return.md)'s return-linking and Search's *had
  before* state something specific to match, and two of them point at titles
  the shop holds no copy of — so journalling them would have to invent a cost
  or push the difference to Suspense, which is a worse lie than the gap.
  A second consequence, smaller and also left alone: **their Sale numbers
  invert against the generated month.** Numbering starts at 100242, just past
  the highest number the seed had spent, while two of those Sales are dated
  inside the generated window — so `100241` dated 21 August sits behind
  `100242` dated 18 August. Renumbering them would mean editing `seed.ts`,
  which is the one thing this change does not do.
- **The artifacts `seed.ts` already held now carry journals too** — its three
  Finalized Invoices and its one settlement, which were written before this
  prototype wrote journals at all. Not tidiness:
  [M-05](flows/M-05-accounts-payable.md) commits that the ledger's *Accounts
  payable* account **is** that flow's balance *"exactly and permanently — a
  divergence is a defect, never a leftover"*, and journalling the generated
  month while leaving those four out would have put the shop's own seeded debt
  outside the books and made that invariant false on the first screen anyone
  opened.
- **Tax now follows M-06 d11** — two tables, resolved through a Genre’s product tax code. The Settings screen carries the types, the product codes and the group × code grid, and recomputes M-06’s own worked example live. ~~**Still simplified:** the GL account on a tax type is reserved and unread (d23, d11).~~ **No longer a simplification, and no longer a field:** [M-06](flows/M-06-settings.md) d58 retires the GL fields on tax types, tenders and Sections, and [M-07](flows/M-07-chart-of-accounts.md) d4 holds the mapping instead — so the prototype showing no GL account is now correct rather than simplified. What it does not yet model is M-07 itself. **Closed since:** the search screen's catalog rows are now `release_cache` entries rather than `Record`s carrying a flag — `catalogOnly` is gone, and with it the one type that was standing in for two things. **Closed since:** non-tracked entries carry a genre (d17); a gift card load resolves through its own system-owned entry (d18); and **d6's genre map is modelled** — seeded, editable, and resolving at adoption. **Closed since:** non-tracked entries now carry a genre and resolve tax through it like everything else (d17), and a gift card load resolves through its own system-owned entry (d18) — it carried a hardcoded standard code and was being taxed at 14.975% in Quebec on money the shop had merely received.
- **A Record no longer stores a Section** ([M-06](flows/M-06-settings.md) d31, d32). It is derived
  through the genre's required parent in `lib/taxonomy.ts`, so correcting a genre moves the
  Record's shelf, its tax code and its *By Section* bucket in one act. Search matches a Section's
  **code and its name** — `VI` and `VINYL` both find the nine vinyl Records. Manual catalog entry
  picks a genre from the configured list instead of taking free text ([E-04](flows/E-04-manage-inventory.md)),
  with the shop-internal genres omitted rather than gated (d19), and has no Section field at all.
  Genres carry a **stable id** and an **active** flag (d9): a Record points at the genre rather
  than at its label, so renaming one moves nothing beneath it, and architecture A-60's merge has a
  real pointer to repoint rather than a string to sweep. The pickers filter on `active`; the
  **resolvers deliberately do not** — deactivating a genre stops it being offered, and a Record
  already under a retired genre must keep resolving or its product tax code silently changes.
  **Still simplified:** non-tracked items carry a `section` rather than a genre (d17), which is why
  the *By Section* bucket noted under Point of Sale below still exists.
- **Manager-only authorisation resolves a real, active Manager** and asks for their password where they have one ([E-01](flows/E-01-authenticate.md) d21) — it is no longer *"initials-only with no real auth"*, which it was, and which meant the gate was satisfied by initials belonging to nobody. What it still is not, is authentication: a shop may set a one-letter password, and a Manager without one is through on their initials alone. The component is `ManagerAuthorize`, named after §6's `manager_authorize`; it was `ManagerOverride`, after a term the [lexicon](lexicon.md) retired.
- Open questions in the flow docs are surfaced in the UI but not resolved.
- ~~**The Suppliers ledger's two figures do not visibly differ under seed data.**~~
  **Closed by the generated month.** Received is cost of goods and the A/P figure is Invoice
  totals (A-29, E-02 d34); they coincided because every hand-written Invoice carried zero tax,
  freight and misc, and Sold read `$0.00` for every Supplier because the only completed Sale line
  referencing a tracked copy pointed at a used copy with no Invoice behind it. The generated
  Invoices carry freight and a **labelled GST and QST split** (E-02 d53), and the month's Sales
  consume copies those Invoices minted, so all three figures now differ and can be read against
  each other. *F.A.B. Distribution shows Received $2,208.64 against an outstanding A/P of
  $1,745.40, and Sold $5,626.83 — 263 in, 179 sold.* The computations were always correct; the
  seed simply did not exercise them.
- **The in-flight band's three-row cap is still not reached** — the generated month receives
  against its orders rather than leaving four or more outstanding with any one Supplier. The
  design mock (`design/suppliers-ui-mock.html`) exercises it at six.
- Suppliers (M-01) are built with the full field set. **Discount is gated** behind in-place
  Manager authorisation (decisions 11, 13) — initials only, like every other gate here, with no
  real auth behind it. Merge and Delete are labeled, not enforced. There is no separate Margin
  field — Discount does double duty, describing what the Supplier charges **and** driving
  suggested retail at receiving (E-02 decision 49 — the decision 31 this
  line used to cite is the invoice-number lookup). A Discount change reprices future receiving
  only (never existing stock); minimum order qty/amount and cancel-by are captured but not yet
  consumed by anything (M-02 isn't built);
  multi-store scope and floor/ceiling constraints are still open questions.
- Customers (E-07) are built with the full field set and are not gated. There is no separate Edit
  function — every field, account number included, is a live input on the open card; New and
  Delete are the only explicit actions. History lists sold items only, not Returns.
- Point of Sale (E-05, renamed from "Sell") folds in M-03's close for the first time in this
  build. The day-breakdown's "By Section" resolves **every** line through a genre now — item lines via
  their Record, non-tracked lines via the genre on the line — so the generic bucket is gone, and a
  Section flagged `countsAsRevenue: false` is kept out of the breakdown (d20) rather than gift cards
  being special-cased. Movements (voids/holds) are scoped to everything in
  memory, not "since the last close" — this prototype has no persistence across sessions to track
  that boundary. Copy never carries over the specific InventoryItem (the source's copy may still be
  sold); Edit on a Current Sale does, since voiding the original returns it to sellable first.
- Receiving's photograph/OCR step (decision 15) isn't modelled at all — stated subtotal, tax, and
  freight are plain manually-entered fields, full stop, with no camera or extraction simulation
  standing in for it. Barcode-to-record matching is local-only (no live catalog-provider call, no
  multi-match picker); a code with no local match goes straight to the search-or-create fallback.
- Receiving's Orders panel and Order Processing (M-02) share one `PendingOrderLine` array, and a
  **placed line is never deleted** (M-02 decision 21): receiving it writes to its log rather than
  removing it. So existence stopped being the same question as "still coming", and every screen
  derives instead — `poNumber` unset means pending, set means placed, and what is outstanding is
  ordered minus received across every Invoice (E-02 decision 30), all through `lib/orderLines.ts`.
  **Partial receipt is real**: a line reads "1 of 2", stays on What's on Order as *Part received*,
  and the staging card prefills the remainder rather than the ordered quantity, so picking it again
  cannot silently over-receive. There is still no reorder suggestion.
- **Catalog metadata prefetch is not modelled at all.** M-02 step 8 queues it on placement and
  decision 27 says recording an order placed elsewhere queues it the same way — but the prototype
  has no prefetch job, no queue and no provider adapter, so there is nothing for either route to
  trigger. The bulk sheet says so on screen rather than implying it happened.
- **An unfinished bulk batch lives in till memory, not in the store.** It persists and is
  resumable as decision 30 requires, but per-till and invisible to anyone else — so the
  in-flight-band commitment decision 30 makes to [M-01](flows/M-01-supplier-margin.md) d14 is
  **not honoured here**: the Supplier card cannot see a draft it has no access to. Making the
  batch a stored entity is what would close that, and it is not built.
- **Order Processing (M-02) is Phases 1 and 2, plus part of Phase 3.** A stream moves from
  Pending to Previously placed once Processed, then to What's on Order until it's received —
  tracking, search/sort/filter, re-flag and **Set status** are built there — Shipped (carrying the
  supplier's expected date), Backordered and Cancelled, the statuses a *person* sets (decisions 12,
  22), each written to the line's own log with what it moved from and to (decision 23). Pending and
  Ordered are not offered because they are derived from whether the line has a PO number, and
  Received is not offered because it is counted off the Invoices — a status contradicting the count
  would be a second, wrong answer. **Voiding a PO** is built too, on the Previously-placed table and
  manager-authorised in place (A-28a): the dialog leads with the fact that nothing is cancelled at
  the supplier (decision 10), then says line by line what will happen, because decision 24 makes the
  answer different for each — a fully unreceived line returns to pending whole, a part-received one
  keeps what arrived and its remainder is raised as a fresh pending line, and a fully received one
  is untouched. A voided PO keeps the lines already received, so it stays listed, badged **voided**
  and with its Void action spent. Phase 3 is now complete. Sending an Email order is simulated as a composed preview plus a
  Supplier log entry, not a real send.
- On the line-entry row, "List price" is the pre-discount figure off the paperwork and "Sell
  price" replaces "Accepted price" — Disc% and Margin% are new. **Resolved:** the row used to
  label the pre-discount figure "Cost", clashing with [E-02](flows/E-02-receive-inventory.md)
  decision 7's "cost" (the post-discount Ext. Price) — renamed to "List price" so "cost" means
  one thing everywhere: the net, post-discount figure that drives the below-cost guardrail and
  everything downstream (InventoryItem.cost, Supplier Claims).
- **Accounts Payable (M-05)** has no currency conversion — an Invoice in a Supplier's own
  currency shows that currency's code, not a store-currency equivalent, since the exchange rate
  it would need is a setting from M-06, which isn't built (open question, "Currency movement").
  The GiftCard record doesn't carry an issue date or a last-used date, so the liability registry
  omits those two columns from the spec's field list rather than fabricating them.

- **Accounts Payable is built to d17–d30.** One selection settles anything — Invoices,
  manual entries, Credits, Credited claims and Claim placeholders in any mix (d27); credits
  attach to the debits beside them and money covers the shortfall; a selection holding no debit
  is a **clearing** (d15), arrived at by the same rule rather than a separate button. A credit
  goes out **whole** (d24, d28) in a split the Manager places but whose total they do not choose
  (d23), and whatever cannot attach comes back as a **remainder Credit** (d25). A settlement is
  **voided**, never edited, and where it emitted a remainder the void appends a **reversing
  Adjustment** rather than deleting it, so it never refuses (d22, d30). Paid Invoices stay
  readable and name what settled them (d21); every Invoice row opens in Receiving, the verb
  changing at Paid (E-02 d40, A-41); and the **Due** column exists because Suppliers and
  Invoices now carry payment terms (M-01 d19, E-02 d45). A Supplier balance may read **negative**
  (d25) and the store-wide figure is one line per currency, never a sum.

- **`invoiceIsPaid()` is A-41's seam, and it is real here.** `InvoiceStatus` no longer carries
  `Paid`: it is derived (A-33b), and Receiving's lock, the reconcile track and the ledger's bands
  all ask the same function. Voiding a settlement releases the Invoice with nothing to flip.

- **The design mock is retired.** `design/accounts-payable-ui-mock.html` was the artifact this
  screen was reviewed against and is kept as the record of the review that produced d17–d30 —
  it carries the drafted wording of every one of those rows. It is **not** current: it draws a
  credit box per Invoice, which d33 retired, and predates d31–d33 and E-04 d20. The file says
  so at the top of itself rather than relying on anyone finding this line.

- **What is still divergent.** Money is floats throughout (`lib/money.ts`), against A-15's
  integer minor units — fine for an in-memory mock, and **not to be carried into the schema**.
  `supplierBalance()` in `lib/totals.ts` is A-36's four-term derivation and is the single copy
  the Supplier card and Accounts Payable both read; two copies would drift, and the figure they
  disagreed about would be money.

- **The prototype stores an Invoice status; the schema will not.** `InvoiceStatus` is a
  stored `Draft | Finalized | Paid` with `paidAt`/`paidBy` beside it. [A-33b](architecture.md)
  makes `paid` **derived** — finalized, balance at or below zero, and at least one settlement
  landed on it. The prototype's *behaviour* already matches (a target whose balance reaches
  zero is treated as settled); only its representation differs, which is fine for an
  in-memory mock and must not be carried into the schema.
