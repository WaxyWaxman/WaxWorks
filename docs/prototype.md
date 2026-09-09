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
| [E-03](flows/E-03-search-inventory.md) | Specified | Search | Grouping, catalog-only rows, scan-to-resolve, Discogs-down toggle |
| [E-04](flows/E-04-manage-inventory.md) | Specified | Titlecard | Copies, derived on-hand math, Reserve → Held Sale, below-cost guardrail + manager override |
| [E-05](flows/E-05-sell-a-record.md) | Specified | Sell | Barcode resolver, multi-copy picker, customer pre-fill, `0.00` prompt, negative inventory, split tender, hold/void, receipt |
| [E-06](flows/E-06-process-a-return.md) | Specified | Return | Negative-qty line, prior-Sale link, refund default, cash/store-credit, stock routing |
| [E-07](flows/E-07-manage-customers.md) | Specified | Customers | Lookup, signed balance, discount + default tax line, attach to Sale |
| E-01, E-02, M-01–M-06 | — | *stubbed* | Added once the counter core is signed off |

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
