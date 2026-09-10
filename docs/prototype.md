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
| [E-03](flows/E-03-search-inventory.md) | Specified | Search | Grouping, catalog-only rows, scan-to-resolve, catalog-provider-down toggle. Selecting a Record (click a row, Reserve, or a resolved scan) opens its titlecard inline above the results — see E-04. |
| [E-04](flows/E-04-manage-inventory.md) | Specified | *(embedded in Search)* | Copies, derived on-hand math, Reserve → Held Sale, below-cost pricing proceeds and raises a review flag (M-04 decision 8) rather than blocking on a manager override. Not a separate route — the titlecard is a view, not a screen of its own (E-04 decision 1), so it lives in Search's `TitlecardPanel` and updates as the selected Record changes. `/search/:recordId` deep-links to a specific one. |
| [E-05](flows/E-05-sell-a-record.md) | Specified | Point of Sale | Barcode resolver, multi-copy picker, customer pre-fill (with inline create-on-no-match), `0.00` prompt, negative inventory, split tender, hold/void, receipt, PO field, 2-digit discount. Also carries Edit (void-and-duplicate for Current, open for Held), Copy, Search (barcode → item sale history), and M-03's close under **Other Functions** (View Subtotal / Total Today's Sales / Undo End of Day, Admin-labeled). |
| [E-06](flows/E-06-process-a-return.md) | Specified | Return | Negative-qty line, prior-Sale link, refund default, cash/store-credit, stock routing. Entered only from Point of Sale's **+ New Return** (`/return/:saleId`) — mirrors `/sell/:saleId` in never being its own nav item, since a Return is a Sale with `isReturn` set. |
| [E-07](flows/E-07-manage-customers.md) | Specified | Customers | Search (name/email/phone), New, Delete, opens on the most recently searched/added card. No separate Edit — every field, account number included, is a live input on the open card. A/R balance, discount + default tax line, purchase history, attach to Sale. Nothing gated. |
| E-04 §"Supplier claims" | Specified (part of E-04) | Supplier Claims (`/claims`) | Not a numbered flow of its own. Claiming credit from a supplier for short/damaged/unshipped stock — distinct from a customer Return. Raised from a titlecard's **Claim vs. supplier** button; claims to the same supplier + separator merge onto one Draft, sent together with an auto-generated claim number. |
| [E-02](flows/E-02-receive-inventory.md) | Specified | Receiving (`/receiving`) | The three phases in one screen: open an invoice (supplier, intake mode, invoice #, collision check, simulated photo extraction), then an always-present fillable row at the bottom of Lines — scanning or typing a barcode there resolves it against this supplier's pending orders first, then the local catalog (a catalog-only match pulls in, same as E-03 decision 6), or opens Lookup on a miss — followed by pricing, then reconcile (derived-vs-stated subtotal warning, ±2%-bounded total override) and finalize — lines aren't sellable InventoryItems until then. A committed line's pencil re-opens it inline for correction. A finalized copy is immediately claimable from its titlecard. |
| [M-01](flows/M-01-supplier-margin.md) | Specified | Suppliers (`/suppliers`) | Search, New/Edit/Copy/Delete/Merge, opens on the most recently searched card. Nothing is gated — Delete/Merge are labeled Admin-only by convention only. Full field set (order terms, discount vs. margin, rep contacts, etc.), all logged. |
| [M-03](flows/M-03-daily-summary.md) | Specified | *(embedded in Point of Sale)* | Not a screen of its own — surfaced under Point of Sale's **Other Functions**. The close is a real state transition (Current → Closed, batched), with Undo End of Day (Admin-labeled) reverting a batch. Breakdown covers gross/returns/net, by Section, by tender, tax, movements (voids/holds/pay-outs), and stock below minimum. |
| [M-02](flows/M-02-reorder-inventory.md) | Specified | Order Processing (`/orders`), What's on Order (`/on-order`), + a titlecard's **Order** button | **Phases 1, 2, and part of 3.** Order (titlecard, E-04) raises a pending line — quantity, Supplier (defaults to the Record's preferred Supplier), separator, selling price (defaults to shelf price), an optional Customer (customer-attached), and an optional follow-up-flag day count — and joins that Supplier's pending pile; the titlecard's Orders card shows the Record's own Pending/On order unit counts, derived live. Order Processing lists one line per Supplier + separator: pending total, oldest age, order via, customer-attached count, sell total, estimated cost, Ready (against the Supplier's minimum) — every row, in both tables, opens **View** on a click anywhere in it (no separate button). The pending table's own Sep column is a dropdown ("+ New…" for an unused letter) that mass-shifts every line in that stream at once — a merge prompt when the target separator is already in use for that Supplier (decision 17), otherwise a plain move. View opens a stream's lines — live, not a snapshot — with the selected line's titlecard below, so a wrong Supplier is caught before sending; it leads with a "meeting the minimum" panel (qty / retail value / estimated cost against the Supplier's configured minimum) and, for a still-pending stream, lets each line's qty, sell price, and separator be edited in place (same dropdown, one line at a time), and the line deleted (plain confirmation, explicit warning when a Customer is attached — decision 9). Process confirms the send method — an Email Supplier gets a composed preview (items/qty, cancel-by, backorder policy); anything else states a printable document is produced — then assigns a PO number (blank auto-mints the next unused ascending number, same pattern as Supplier Claims' claim number) and appends a summary to the Supplier's log. Previously placed POs list below, most recent first, read-only. **What's on Order** is every placed line not yet received, oldest first — lines past their follow-up flag surface at the top in red (step 9); Search (keyword or a UPC scan), Sort (age/title/artist), Filter (Supplier/PO), and **Re-flag** (pushes the follow-up window out *n* days from today, restarting rather than extending it) are built. **Set status** (Backordered/Cancelled) and **voiding a PO** — the rest of Phase 3 — still aren't built. |
| [M-05](flows/M-05-accounts-payable.md) | Specified | Accounts Payable (`/payable`) | Manager-only, in its entirety (decision 2). A lookup box finds any Supplier regardless of balance; below it, suppliers carrying a balance (sorted by name) plus a Settled section so a zero-balance Supplier's history stays reachable. Selecting one shows outstanding Invoices, Pending/Credited-unapplied Supplier Claims, and manual ledger entries in one combined list (decision 3), since what's owed is the net of all of it. **Create new** logs a manual Invoice/Claim/Credit/Adjustment/Consignment entry — a lump subtotal/tax/freight/misc, not sourced from Receiving or Supplier Claims and not tied to any InventoryItem; defaults to Consignment when the Supplier carries that flag. A Claim entry is a placeholder that doesn't affect the balance at all until **Clear selected** matches it against a Credit whose amount nets to zero (manual reconciliation only, never automatic — both stay in the ledger as history). **Record payment** selects any mix of Invoices and payable-type entries and records one PaymentBatch, partial amounts supported per target. **Apply credit** is a single click, not an invoice picker — a Credited Supplier Claim's full amount nets against the supplier's whole balance, auto-distributed across their outstanding Invoices oldest-received-first (decision 11), and its Type column relabels from Claim to Credit once Credited. A target whose balance reaches zero — by payment, credit, or both — is marked Paid/settled, the same transition that locks a real Invoice (E-02 §Inherited). **Payment history** is one row per PaymentBatch, newest first, opened to see exactly which Invoices/entries it covered and how much each got. The gift-card liability registry lists every card, its balance, and its attached Customer. |
| E-01, M-04, M-06 | — | *stubbed* | Added once the counter core is signed off. |

## Turning a review into a decision

1. Note the screen and the flow decision it cites (each screen shows citations like *E-05 decision 18*).
2. Record the change as a **new numbered row** in the relevant `flows/*.md` decision
   table — append, never renumber (see [README](README.md) conventions).
3. Update the prototype to match, so the prototype and the spec never diverge.

Style changes are cheap: design tokens are centralised in
[`../prototype/src/styles/tokens.css`](../prototype/src/styles/tokens.css).

## Known simplifications

- Mock data only; no persistence, no live catalog provider, no printing.
- Tax is a flat rate per named line; real multi-jurisdiction handling (M-06) is not modelled.
- Manager override is initials-only with no real auth.
- Open questions in the flow docs are surfaced in the UI but not resolved.
- Suppliers (M-01) are built with the full field set and are not gated (Delete/Merge are labeled
  Admin-only, not enforced). There is no separate Margin field — Discount does double duty,
  describing what the Supplier charges **and** driving suggested retail at receiving (E-02
  decision 31). A Discount change reprices future receiving only (never existing stock); minimum
  order qty/amount and cancel-by are captured but not yet consumed by anything (M-02 isn't built);
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
  Backorder mechanics are unmodelled, per E-02's own open question.
- Receiving's Orders panel and Order Processing (M-02) now share one `PendingOrderLine` array —
  `poNumber` unset means still pending, set means already placed, which is what Receiving looks up
  against. There is no reorder suggestion and no backorder lifecycle once a line isn't fully
  received.
- **Order Processing (M-02) is Phases 1 and 2, plus part of Phase 3.** A stream moves from
  Pending to Previously placed once Processed, then to What's on Order until it's received —
  tracking, search/sort/filter, and re-flag are built there. **Set status** (Backordered/Cancelled)
  and **voiding a PO** aren't. Sending an Email order is simulated as a composed preview plus a
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
  omits those two columns from the spec's field list rather than fabricating them. A claim's
  credit is applied once, in full, against the supplier's balance as a whole (decision 11) — it
  can land across several Invoices in one apply, but a claim itself is never partially applied
  over separate actions; per-claim partial credit is explicitly out of scope for v1 (open
  question, "Deeper reconciliation").
