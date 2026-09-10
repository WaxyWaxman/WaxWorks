# Wax Works — clickable prototype

A throwaway, in-browser prototype for **reviewing screens and flows** and turning
those reviews into numbered decisions in [`../docs/flows/`](../docs/flows/). It is
**not** production code and not the real schema — it is a deliberately thin slice
that makes the counter-core flows clickable.

## What's built (first pass)

The connected front-of-counter core, wired to one shared in-memory store:

| Flow | Screen | Exercises |
|---|---|---|
| **E-03** | Search | grouped results (one row per Record, copies nested), catalog-only rows, scan-to-resolve, Discogs-down degradation |
| **E-04** | Titlecard | catalog + copies + derived stock, Reserve → Held Sale, Edit price with the below-cost guardrail + manager override |
| **E-05** | Sell | barcode resolver (UPC / internal / `GC` / non-tracked), multi-copy picker, customer discount + tax-line pre-fill, `0.00` price prompt, negative inventory, split tender, hold, void, receipt prompt |
| **E-06** | Return | negative-quantity line, link-to-prior-Sale (when possible), refund default + override, refund to cash / store credit, stock routing (sellable / re-grade / write-off) |
| **E-07** | Customers | lookup, signed account balance, discount + default tax line, attach-to-Sale |

State is shared and mutable within a session: a hold placed on the titlecard shows
up at the till, tendering a Sale consumes the copy, a return can route it back.
**Reloading the page resets everything** to the seed in [`src/data/seed.ts`](src/data/seed.ts).

Not in this pass: E-01, E-02, M-01..M-06 (stubbed on the flow map).

## Run it

```bash
npm --prefix prototype install
npm --prefix prototype run dev
```

Opens on <http://localhost:5273>. Start on the **Flow map** — it has a suggested
review path. Every screen has a "Quick scan" row so you can exercise the barcode
resolver without a scanner.

```bash
npm --prefix prototype run build   # type-check + production build into prototype/dist/
```

## Using it for review

Each screen cites the flow decisions it implements (e.g. *E-05 decision 18*). When
a review turns up a change:

- **Style** — tokens live in [`src/styles/tokens.css`](src/styles/tokens.css); change a value, everything follows.
- **Content** — copy is inline in the screen components under [`src/screens/`](src/screens/).
- **Flow / behaviour** — the decision goes into the relevant `../docs/flows/*.md`
  as a new numbered row (append, never renumber), then the prototype is updated to match.

## Stack

Vite + React + TypeScript, React Router (hash routing so a static build works from
any path), no component library, no backend. ~1k lines. Chosen because the real
product is a web app / PWA, so the component kit and copy are a starting point for
the build rather than a separate artefact to keep in sync.
