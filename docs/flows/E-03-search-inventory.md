# E-03 — Search the inventory

**Actor:** Employee
**Status:** Specified
**Related:** [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Sell a record](E-05-sell-a-record.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md)

**Job:** As an employee, I need to find a record quickly — usually while a customer is standing at the counter asking "do you have this?"

---

## Flow

1. Employee enters a search term, or scans a barcode.
2. System queries **local inventory and Discogs simultaneously**, local-first: anything already in the local catalog is presented as *our* Record, never re-fetched or duplicated from Discogs.
3. Results are grouped **one row per Record**, with our copies nested beneath it. Each nested row is an InventoryItem or group of identically-priced copies showing condition grade, price, and count.
4. Records we hold are sorted first — on hand, then on order, then everything else — with catalog-only matches below them.
5. A Discogs match we do not hold is shown as a **catalog row**, visibly marked as not in stock, so the answer "no, but we can order it" is one glance rather than a second search.
6. Employee selects a row to open the **titlecard** — the view of one Record with all its copies, quantities, and order state ([E-04](E-04-manage-inventory.md)).
7. Acting on a catalog-only row — ordering it, stocking it, editing it — **pulls it into the local catalog**, auto-filling every field Discogs provides and prompting for the ones it cannot supply (supplier, Section, and anything else store-specific).

---

## Search dimensions

Artist · album title · track title · label · catalog number · manufacturer UPC · internal barcode · Section · genre.

A scanned barcode short-circuits to resolution rather than keyword search: a manufacturer UPC resolves to a Record, an internal barcode to a single InventoryItem.

---

## What search covers

| Included | Notes |
|---|---|
| Sellable stock on hand | Including copies held for a customer, shown as held rather than available |
| Stock in the backroom | Counted in on hand |
| On order and pending order | So "it's coming" is answerable without leaving the screen |
| Catalog Records with no stock | Titles we've held before, or Discogs matches |
| Sold history | Reachable from the titlecard, not mixed into search results |

---

## Requirements

- Search must return usefully when **Discogs is unreachable or rate-limited**. Local inventory search and every till function continue to work; only catalog-only rows are unavailable, and the degradation is visible rather than silent.
- A Record we hold must never appear twice — once from local and once from Discogs — in the same result set.
- Grouping is by Record, so four differently-graded copies of one pressing occupy one row with four copies nested, not four top-level results.
- Pulling a catalog row into local inventory must not silently invent store-specific values; it prompts.

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Catalog lookup is **local-first with Discogs as fallback** (E-02 decision 5). Metadata is bulk-prefetched at PurchaseOrder time ([M-02](M-02-reorder-inventory.md)), so most lookups hit locally.
- Where Discogs returns multiple matches, the Employee is presented a **picker** rather than an automatic choice.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Search queries local inventory and Discogs simultaneously and presents both in one result set |
| 2 | Local always wins — a Record we already hold is shown as ours, never re-fetched or duplicated |
| 3 | Results group **one row per Record**, with our copies nested beneath showing grade, price, and count |
| 4 | Stock we hold sorts above catalog-only matches |
| 5 | Catalog-only matches are shown and visibly marked not-in-stock, so "we can order it" is answerable in place |
| 6 | Acting on a catalog-only row pulls it into the local catalog, auto-filling from Discogs and prompting for store-specific fields |
| 7 | Search covers on-hand, held, backroom, on-order, and pending-order state |
| 8 | Search degrades gracefully and visibly when Discogs is unavailable; local search and the till are unaffected |
| 9 | A scanned barcode resolves directly rather than running a keyword search |

---

## Open questions

- **Bin location.** Section tells you which part of the shop a Record lives in, but not where in the racks. Whether a finer-grained location is needed depends on shop size and is currently unanswered.
- **Ranking within relevance.** Beyond "stock first," result ordering is unspecified — release year, Discogs `community` popularity, and local sales velocity are all candidates.
- **Multi-store search.** The system is multi-store and the schema carries a Store scope, but v1 does not expose cross-store results. When it does, PRD §6's question stands: does an Employee see a sister store's stock, and at what granularity?
- **Result volume.** A broad artist search against Discogs can return hundreds of catalog rows. Paging, capping, or collapsing them is undecided.
