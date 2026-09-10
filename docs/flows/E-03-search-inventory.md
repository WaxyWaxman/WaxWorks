# E-03 — Search the inventory

**Actor:** Employee
**Status:** Specified
**Related:** [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md)

**Job:** As an employee, I need to find a record quickly — usually while a customer is standing at the counter asking "do you have this?"

---

## Flow

1. Employee enters a search term, or scans a barcode.
2. System queries **local inventory and the catalog provider simultaneously**, local-first: anything already in the local catalog is presented as *our* Record, never re-fetched or duplicated from the catalog provider.
3. Results are grouped **one row per Record**, with our copies nested beneath it. Each nested row is an InventoryItem or group of identically-priced copies showing condition grade, price, and count.
4. Records we hold are sorted first — on hand, then on order, then everything else — with catalog-only matches below them.
5. A provider match we do not hold is shown as a **catalog row**, visibly marked as not in stock, so the answer "no, but we can order it" is one glance rather than a second search.
6. Employee selects a row to open the **titlecard** — the view of one Record with all its copies, quantities, and order state ([E-04](E-04-manage-inventory.md)).
7. Acting on a catalog-only row — ordering it, stocking it, editing it — **pulls it into the local catalog**, auto-filling every field the catalog provider provides and prompting for the ones it cannot supply (supplier, Section, and anything else store-specific).

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
| Catalog Records with no stock | Titles we've held before, or provider matches |
| Sold history | Reachable from the titlecard, not mixed into search results |

---

## Requirements

- Search must return usefully when **the catalog provider is unreachable or rate-limited**. Local inventory search and every till function continue to work; only catalog-only rows are unavailable, and the degradation is visible rather than silent.
- A Record we hold must never appear twice — once from local and once from the catalog provider — in the same result set.
- Grouping is by Record, so four differently-graded copies of one pressing occupy one row with four copies nested, not four top-level results.
- Pulling a catalog row into local inventory must not silently invent store-specific values; it prompts.

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Catalog lookup is **local-first with the provider as fallback** (E-02 decision 5). Metadata is bulk-prefetched at PurchaseOrder time ([M-02](M-02-reorder-inventory.md)), so most lookups hit locally.
- Where the catalog provider returns multiple matches, the Employee is presented a **picker** rather than an automatic choice.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Search queries local inventory and the catalog provider simultaneously and presents both in one result set |
| 2 | Local always wins — a Record we already hold is shown as ours, never re-fetched or duplicated |
| 3 | Results group **one row per Record**, with our copies nested beneath showing grade, price, and count |
| 4 | Stock we hold sorts above catalog-only matches |
| 5 | Catalog-only matches are shown and visibly marked not-in-stock, so "we can order it" is answerable in place |
| 6 | Acting on a catalog-only row pulls it into the local catalog, auto-filling from the catalog provider and prompting for store-specific fields |
| 7 | Search covers on-hand, held, backroom, on-order, and pending-order state |
| 8 | Search degrades gracefully and visibly when the catalog provider is unavailable; local search and the till are unaffected |
| 9 | A scanned barcode resolves directly rather than running a keyword search |
| 10 | **The catalog provider is MusicBrainz**, behind an adapter — not Discogs. Every "Discogs" in this flow now reads as "the catalog provider"; decision 8's graceful degradation is unchanged and provider-agnostic ([architecture](../architecture.md) A-12) |
| 11 | **A result carries one of four stock states** — *here now*, *on the way*, *had before*, *never stocked* — and results are banded and sorted in that order. Extends decision 4 from a two-way split (ours / catalog-only) to the four cases decision 7 already put in scope. The state is **derived**, never stored: on hand and held come from copies, *on the way* from outstanding order lines, *had before* from a Record with no copies that has completed Sales behind it, *never stocked* from a catalog-only match. Each state carries a colour **and** words — colour is never the only carrier |
| 12 | **Each result shows a recency stamp** alongside its state — how long since a copy last sold. Answers the reorder question decision 7 left open: a title stocked three times and sold out of reads differently from one that sat. Derived from completed Sales (Current or Closed, excluding Returns), so no new field is stored |
| 13 | **Amends decision 11: *on the way* means PLACED, not raised.** [M-02](M-02-reorder-inventory.md) splits a pending order line's life in two — raised into a supplier stream (no PO number), which is still Order Processing's job and which the supplier has never been told about, and placed (PO number set), which is a real order. Only placed units count toward *on the way*; raised units are reported separately and never change a Record's state. Counting raised units would have an Employee promise a customer a record nobody has ordered — the exact false answer this flow exists to prevent |

---

## Open questions

- **Bin location.** Section tells you which part of the shop a Record lives in, but not where in the racks. Whether a finer-grained location is needed depends on shop size and is currently unanswered.
- **Ranking within relevance.** **Partly answered** by decision 11: results band by stock state, and within a band sort by quantity on hand, then artist. What is still unspecified is ranking *inside* a band on a broad search — release year, provider-supplied popularity, and local sales velocity are all candidates. Note that popularity signals are provider-specific and may not survive the move off Discogs (decision 10).
- **Recency thresholds.** Decision 12 says a stamp is shown, not what counts as stale. The prototype buckets coarsely (days, then weeks, then months, then a month-and-year), which is a display choice standing in for a real one. Whether "cold" deserves its own visual treatment — and at what age — is unanswered.
- **Multi-store search.** The system is multi-store and the schema carries a Store scope, but v1 does not expose cross-store results. When it does, PRD §6's question stands: does an Employee see a sister store's stock, and at what granularity?
- **Result volume.** A broad artist search against the catalog provider can return hundreds of catalog rows. Paging, capping, or collapsing them is undecided.
