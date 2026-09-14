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
| [M-05](flows/M-05-accounts-payable.md) | Specified | Accounts Payable (`/payable`) | Manager-only, in its entirety (decision 2). A lookup box finds any Supplier regardless of balance; below it, suppliers carrying a balance (sorted by name) plus a Settled section so a zero-balance Supplier's history stays reachable. Selecting one shows outstanding Invoices, Pending/Credited-unapplied Supplier Claims, and manual ledger entries in one combined list (decision 3), since what's owed is the net of all of it. **Create new** logs a manual Invoice/Claim/Credit/Adjustment/Consignment entry — a lump subtotal/tax/freight/misc, not sourced from Receiving or Supplier Claims and not tied to any InventoryItem; defaults to Consignment when the Supplier carries that flag. A Claim entry is a placeholder that doesn't affect the balance at all until **Clear selected** matches it against a Credit whose amount nets to zero (manual reconciliation only, never automatic — both stay in the ledger as history). **Record payment** selects any mix of Invoices and payable-type entries and records one PaymentBatch, partial amounts supported per target. **Apply credit** is a single click, not an invoice picker — a Credited Supplier Claim's full amount nets against the supplier's whole balance, auto-distributed across their outstanding Invoices oldest-received-first (decision 11, **since superseded by decision 18** — the built screen is behind the spec here; see the note below), and its Type column relabels from Claim to Credit once Credited. A target whose balance reaches zero — by payment, credit, or both — is marked Paid/settled, the same transition that locks a real Invoice (E-02 §Inherited). **Payment history** is one row per PaymentBatch, newest first, opened to see exactly which Invoices/entries it covered and how much each got. The gift-card liability registry lists every card, its balance, and its attached Customer. |
| E-01, M-04, M-06 | — | *stubbed* | Added once the counter core is signed off. |

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
- Tax is a flat rate per named line; real multi-jurisdiction handling (M-06) is not modelled.
- Manager override is initials-only with no real auth.
- Open questions in the flow docs are surfaced in the UI but not resolved.
- **The Suppliers ledger's two figures do not visibly differ under seed data.** Received is cost
  of goods and the A/P figure is Invoice totals (A-29, E-02 d34), but every seeded Invoice carries
  zero tax, freight and misc, so the two coincide. Sold reads `$0.00` for every Supplier for the
  same reason: the only completed Sale line referencing a tracked copy points at a used copy with
  no Invoice behind it, which the track correctly excludes and counts. Both computations are
  correct — the seed simply does not exercise them.
- **The in-flight band's three-row cap is not reached by seed data** — no seeded Supplier carries
  more than three. The design mock (`design/suppliers-ui-mock.html`) exercises it at six.
- Suppliers (M-01) are built with the full field set. **Discount is gated** behind in-place
  Manager authorisation (decisions 11, 13) — initials only, like every other gate here, with no
  real auth behind it. Merge and Delete are labeled, not enforced. There is no separate Margin
  field — Discount does double duty, describing what the Supplier charges **and** driving
  suggested retail at receiving (E-02 decision 31). A Discount change reprices future receiving
  only (never existing stock); minimum order qty/amount and cancel-by are captured but not yet
  consumed by anything (M-02 isn't built);
  multi-store scope and floor/ceiling constraints are still open questions.
- Customers (E-07) are built with the full field set and are not gated. There is no separate Edit
  function — every field, account number included, is a live input on the open card; New and
  Delete are the only explicit actions. History lists sold items only, not Returns.
- Point of Sale (E-05, renamed from "Sell") folds in M-03's close for the first time in this
  build. The day-breakdown's "By Section" only resolves a Section for item lines with a matching
  Record — non-tracked and gift-card lines land in a generic bucket rather than their real Section,
  since a SaleLine doesn't carry one directly. Movements (voids/holds) are scoped to everything in
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
