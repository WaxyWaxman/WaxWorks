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
| [E-03](flows/E-03-search-inventory.md) | Specified | Search | Grouping, catalog-only rows, scan-to-resolve, Discogs-down toggle. Selecting a Record (click a row, Reserve, or a resolved scan) opens its titlecard inline above the results — see E-04. |
| [E-04](flows/E-04-manage-inventory.md) | Specified | *(embedded in Search)* | Copies, derived on-hand math, Reserve → Held Sale, below-cost guardrail + manager override. Not a separate route — the titlecard is a view, not a screen of its own (E-04 decision 1), so it lives in Search's `TitlecardPanel` and updates as the selected Record changes. `/search/:recordId` deep-links to a specific one. |
| [E-05](flows/E-05-sell-a-record.md) | Specified | Sell | Barcode resolver, multi-copy picker, customer pre-fill, `0.00` prompt, negative inventory, split tender, hold/void, receipt |
| [E-06](flows/E-06-process-a-return.md) | Specified | Return | Negative-qty line, prior-Sale link, refund default, cash/store-credit, stock routing. Entered only from Sell's **+ New Return** (`/return/:saleId`) — mirrors `/sell/:saleId` in never being its own nav item, since a Return is a Sale with `isReturn` set. |
| [E-07](flows/E-07-manage-customers.md) | Specified | Customers | Lookup, signed balance, discount + default tax line, attach to Sale |
| E-04 §"Supplier claims" | Specified (part of E-04) | Supplier Claims (`/claims`) | Not a numbered flow of its own. Claiming credit from a supplier for short/damaged/unshipped stock — distinct from a customer Return. Raised from a titlecard's **Claim vs. supplier** button; claims to the same supplier + separator merge onto one Draft, sent together with an auto-generated claim number. Suppliers are modeled only as far as this needs — full supplier management is M-01, still not in this pass. |
| [E-02](flows/E-02-receive-inventory.md) | Specified | Receiving (`/receiving`) | The three phases in one screen: open an invoice (supplier, intake mode, invoice #, collision check, simulated photo extraction), then an always-present fillable row at the bottom of Lines — scanning or typing a barcode there resolves it against this supplier's pending orders first, then the local catalog (a catalog-only Discogs match pulls in, same as E-03 decision 6), or opens Lookup on a miss — followed by pricing, then reconcile (derived-vs-stated subtotal warning, ±2%-bounded total override) and finalize — lines aren't sellable InventoryItems until then. A committed line's pencil re-opens it inline for correction. A finalized copy is immediately claimable from its titlecard. |
| E-01, M-01–M-06 | — | *stubbed* | Added once the counter core is signed off |

## Turning a review into a decision

1. Note the screen and the flow decision it cites (each screen shows citations like *E-05 decision 18*).
2. Record the change as a **new numbered row** in the relevant `flows/*.md` decision
   table — append, never renumber (see [README](README.md) conventions).
3. Update the prototype to match, so the prototype and the spec never diverge.

Style changes are cheap: design tokens are centralised in
[`../prototype/src/styles/tokens.css`](../prototype/src/styles/tokens.css).

## Known simplifications

- Mock data only; no persistence, no Discogs, no printing.
- Tax is a flat rate per named line; real multi-jurisdiction handling (M-06) is not modelled.
- Manager override is initials-only with no real auth.
- Open questions in the flow docs are surfaced in the UI but not resolved.
- Suppliers are two seeded rows with a name, email, and a fixed margin — enough to demo Supplier
  Claims batching and E-02's suggested-retail formula; setting/changing a margin is M-01, not
  built.
- Receiving's "photograph the invoice" step has no camera or OCR behind it — a button fills in a
  canned example, standing in for extraction. Barcode-to-record matching is local-only (no live
  Discogs call, no multi-match picker); a code with no local match goes straight to the
  search-or-create fallback. Backorder mechanics are unmodelled, per E-02's own open question.
- Receiving's Orders panel is backed by a thin `PendingOrderLine` scaffold (supplier, PO #,
  record, expected cost/discount, qty) — enough to look one up and receive against it, seeded with
  a handful of rows. It is not M-02: there is no way to place an order from here, no reorder
  suggestions, and no backorder lifecycle once a line isn't fully received.
- On the line-entry row, "Cost" is the pre-discount figure off the paperwork and "Sell price"
  replaces "Accepted price" — Disc% and Margin% are new. This is a deliberate departure from how
  [E-02](flows/E-02-receive-inventory.md) decision 7 currently defines "cost" (there, cost *is*
  the post-discount Ext. Price); the derived Ext. Price still drives the below-cost guardrail and
  everything downstream (InventoryItem.cost, Supplier Claims), it's just no longer the field
  labeled "Cost" in this screen. Worth a decision either amending E-02 decision 7 or documenting
  the UI/spec vocabulary as deliberately different.
