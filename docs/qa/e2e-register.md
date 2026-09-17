# Wax Works — end-to-end test register

**Status:** Seeded 2026-09-11; re-baselined 2026-09-17 against `main` — ten rows superseded by the decisions landed that week, four flows registered. Every live row is `Planned`; nothing runs yet
**Owners:** sr-talbot, WaxyWaxman
**Maintained by:** `/qa` writes rows · `qa-reviewer` reports drift · `scripts/check_docs.py` checks the mechanics

The running list of end-to-end scenarios — a whole flow as the actor performs it —
that the current designs will be tested against. One row is one commitment to
test. It is derived from the numbered steps of a `Specified` flow and it asserts
numbered decisions, so "which flows are covered end to end" is a read of this
table, not a search of the test tree.

The unit and integration levels are **not** listed here; they trace through test
names (`E-02 d9 / A-24 — …`), as the [`/qa`](../../.claude/skills/qa/SKILL.md)
skill describes. This register exists because an end-to-end scenario spans steps
and decisions from several flows, and a test name cannot carry that.

---

## Conventions

- **Row IDs are stable.** `<FLOW>-T<n>`, numbered from 1 within the flow, **append
  only** — never renumbered, never deleted. A scenario that stops being right is
  struck through with a pointer at what replaced it, exactly as a decision is.
- **Cite decisions in long form** — `E-02 decision 35`, not `d35` — so
  `check_docs.py` verifies every citation resolves. Cite A-n decisions bare.
- **Steps** cites the flow's own numbered steps, so a row can be walked from the
  flow document without reading the test.
- **Needs** names the seed state the scenario starts from. If that seed does not
  exist yet, say so — do not invent it; a missing fixture is an open question.
- **Two targets, two columns.** The [prototype](../prototype.md) (`prototype/`,
  port 5273) is what the designs are reviewed on today; the product is
  `apps/web` ([architecture](../architecture.md) §7), which does not exist yet.
  A row is tracked against each independently, because a walk of the prototype
  says nothing about the product.
- **Spec** is the `@playwright/test` file that holds the row once it is
  `Automated`, relative to the repository root. Blank until then.

### Status vocabulary

| Status | Meaning |
|---|---|
| `Planned` | Derived from the spec. Nothing runs it. |
| `Walked` | Driven by hand through `playwright-cli` against that target, its recording kept, and every divergence between what the target did and what the flow says filed as a finding. |
| `Automated` | A `@playwright/test` spec named for the row exists, asserts the decisions in the row, and passes in CI against that target. |
| `Stale` | A decision the row asserts was superseded, or a contract it calls changed. The test is re-read against the current record before it runs again — a stale test that passes is asserting a retired rule. |
| `Blocked` | An open question stops the scenario from being stated. The row names the question and the flow that owns it. |
| `—` | Not applicable to that target — the prototype does not model it, or the product milestone has not started. |

### When a row changes

The triggers are recorded once, in [`CLAUDE.md`](../../CLAUDE.md) §"When QA is
called", and the `/qa` skill carries the procedure for each. In short: a flow
reaching `Specified` adds rows; a supersession or a contract change marks rows
`Stale`; a prototype screen landing lets rows be `Walked`; both build-order
tracks landing for a milestone lets rows be `Automated`.

---

## Where the suite lives

_Status: recommended, not yet ratified. Route through `/architecture` as an
amendment to [architecture](../architecture.md) §7 before any spec file is
written._

```
e2e/
  playwright.config.ts    baseURL from PLAYWRIGHT_BASE_URL; webServer starts the target
  fixtures/               seed helpers — one per "Needs" entry below
  E-02/                   one directory per flow, one spec per register row
    E-02-T1.spec.ts
  ...
```

Proposed on these grounds: the suite is not part of either app, since it drives
whichever one `PLAYWRIGHT_BASE_URL` points at — the prototype today, `apps/web`
from M1; one directory per flow keeps parallel edits conflict-free, the same
reason the flows are one file each; and a spec named for its row makes
"which rows are automated" a `ls`. Accepted consequence if ratified: a third
top-level directory with its own `package.json` and browser install, which CI
must cache.

---

## Register

### E-02 — Receive inventory

Steps in [E-02](../flows/E-02-receive-inventory.md). Prototype screen:
Receiving (`/receiving`, `/receiving/:invoiceId`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| ~~E-02-T1~~ | ~~**Cold intake, New stock, finalize.**~~ — **superseded by E-02-T11** Open a new Invoice with no PO behind it, scan three barcoded copies, accept the suggested price on each, reconcile with matching stated figures, finalize. Every line becomes sellable; the letter summary is offered. | 0–8, 10–13, 15–17, 22 | E-02 decision 4 (draft persists and resumes), E-02 decision 9 (`.50`/`.99`), E-02 decision 27 (totals entered by hand), E-02 decision 33 (consignment flag copied at finalize) | A Supplier with a discount; three Records with barcodes in the local catalog | — | — | |
| E-02-T2 | **Second-hand intake mints its reference.** Choose Second-hand, leave the invoice number blank, receive one copy with a grade set. Reference is `SH-YYMMDD-n` off the received date; a second blank intake the same day gets `-2`. | 1–3, 8, 14–15, 22 | E-02 decision 39, A-32 | The dedicated second-hand Supplier (E-02 decision 31) | Planned | — | |
| E-02-T3 | **Invoice number is a lookup.** Enter a number matching an existing draft → it resumes. Enter one matching a finalized, unpaid Invoice → it opens as it stands, still editable. | 3–4 | E-02 decision 31, E-02 decision 40, A-33 | One draft and one finalized-unpaid Invoice for the same Supplier | Planned | — | |
| E-02-T4 | **Below-cost price proceeds and flags.** Enter a cost, then accept a sell price below it. The line is added, the row carries a review flag, and the flag is attributable to the Employee. | 10–12 | E-02 decision 35, M-04 decision 8, A-28 | Any barcoded Record | Planned | — | |
| ~~E-02-T5~~ | ~~**Derived vs. stated mismatch.**~~ — **superseded by E-02-T12** Stated subtotal disagrees with the sum of line costs. The discrepancy warning shows as a state on the reconcile track; accepting it finalizes and raises a review flag. | 6, 17–18, 22 | E-02 decision 27, E-02 decision 35 | As T1 | — | — | |
| ~~E-02-T6~~ | ~~**Adjustment past ±2% proceeds and flags.**~~ — **superseded by E-02-T13** Adjust the total 3% off the derived figure. Finalize succeeds; the delta is a standalone cost-of-goods line; a review flag is raised. | 17, 21–22 | E-02 decision 35 | As T1 | — | — | |
| E-02-T7 | **A scan attaches to the outstanding PO line.** Open an Invoice for a Supplier with a placed PO; scan a barcode matching an outstanding line. The line attaches with its expected cost and quantity; the PO number is snapshotted on the invoice line; What's on Order reads the remainder. | 0, 8–9 | E-02 decision 42, M-02 decision 20, A-34, A-20a | A placed PurchaseOrder with one unreceived line for the Supplier | Planned | — | |
| E-02-T8 | **Partial receipt.** Receive 1 of an ordered 2 and finalize. The line reads "1 of 2", stays on What's on Order as part received, and re-picking it prefills the remainder, not the ordered quantity. | 9–10, 15, 22 | M-02 decision 21, A-35, A-20a | As T7 with quantity 2 | Planned | — | |
| E-02-T9 | **Paid locks the Invoice.** Mark a finalized Invoice paid in M-05, return to Receiving. The scan slab is replaced by the locked band and every field is disabled; a line whose copy sold cannot be removed even before paid. | 19, 23 | E-02 decision 4, E-02 decision 40, A-33 | A finalized Invoice, one of whose copies has been sold | Planned | — | |
| E-02-T10 | **Receiving history search.** Search Invoices by supplier, number, date, title, barcode, and PO number. Each finds the Invoice that took the copy in; a search replaces the bands rather than filtering them. | 0 | E-02 decision 36, E-02 decision 43 | Three finalized Invoices across two Suppliers | Planned | — | |
| E-02-T11 | **Cold intake, New stock, finalize.** Open a new Invoice with no PO behind it, enter the paperwork's charges as a labelled list (tax per type, freight), scan three barcoded copies, take the pre-filled price on each — sticky price, else adoption price, else suggested retail, rounded to the nearest configured ending — reconcile with matching figures, finalize. Every line becomes sellable; the letter summary is offered. | 0–8, 10–13, 15–17, 22 | E-02 decision 4, E-02 decision 51, E-02 decision 53, E-02 decision 33, M-06 decision 44, A-49 | A Supplier with a discount; three Records with barcodes; a price-ending setting | Planned | — | |
| E-02-T12 | **Derived vs. stated mismatch.** The stated subtotal disagrees with the sum of line costs. The discrepancy shows as a state on the reconcile track; accepting it finalizes and raises a review flag with the variance and an attributable actor. | 6, 17–18, 22 | E-02 decision 35, E-02 decision 53, M-04 decision 8, A-28 | As T11 | Planned | — | |
| E-02-T13 | **±2% is a wall, not a flag.** Adjust the total 3% off the derived figure — refused, and the refusal says so. Adjust it 1.5% — proceeds, no review flag, the delta a standalone cost-of-goods line. | 17, 21 | E-02 decision 50, M-04 decision 10, A-48 | As T11 | Planned | — | |
| E-02-T14 | **Every intake raises a payable, with its terms and method.** Finalize a New-stock Invoice and a second-hand one: both appear in M-05 with a due date of invoice date + terms; terms and method defaulted from the Supplier and overridden at receiving stick to the Invoice. | 2, 22 | E-02 decision 45, E-02 decision 47, E-02 decision 54 | A Supplier with terms and a method set; the second-hand Supplier | Planned | — | |

### E-03 — Search the inventory

Steps in [E-03](../flows/E-03-search-inventory.md). Prototype screen: Search
(`/search`, `/search/:recordId`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-03-T1 | **Four stock states band one list.** Search a term that matches a Record on hand, one on a placed PO, one sold out, and one never stocked. Results band in that order, each row carrying its state and recency stamp; a raised-but-unplaced line does not count as on the way. | 1–5 | E-03 decision 11, E-03 decision 12, E-03 decision 13 | One Record in each state; one with a pending (unplaced) line | Planned | — | |
| E-03-T2 | **Scan short-circuits to resolution.** Scan a manufacturer UPC → the Record's titlecard opens; scan an internal barcode → exactly one InventoryItem. | 1, 6 | E-03 §"Search dimensions" (steps, not a decision) | A Record with a UPC and two copies, one with an internal barcode | Planned | — | |
| ~~E-03-T3~~ | ~~**Catalog-only row pulls into the local catalog.**~~ — **superseded by E-03-T5** Search a title not held; act on the catalog row (Order). The Record is created locally with provider fields filled and store-specific ones prompted. | 5, 7 | E-03 step 7; A-12 | Catalog provider up, with a known title absent locally | — | — | |
| E-03-T4 | **Catalog provider down degrades visibly.** With the provider unavailable, the same search returns local results and says the provider is down rather than failing. | 2 | A-1 (writes fail visibly; no offline queue) — *the read-side rule is not cited by a decision; see Open questions* | Provider-down toggle | Planned | — | |
| E-03-T5 | **Browse, then adopt.** Type a title not held — the local catalog searches as you type; Enter queries the provider. Open the provider match: nothing is adopted. Order it: adoption is asked for, confirms, insists on Genre only, offers an optional price that becomes sticky, and the Record now exists locally. | 5, 7 | E-03 decision 18, E-03 decision 19, E-03 decision 20, E-03 decision 21, E-03 decision 22, M-06 decision 53 | Provider up; a title absent locally; a genre map that does not resolve the title's tags | Planned | — | |
| E-03-T6 | **Typed barcode and UPC find things.** Type an internal barcode and a manufacturer UPC as keywords, not scans; each matches. | 1 | E-03 decision 15 | A copy with an internal barcode; a Record with a UPC | Planned | — | |
| E-03-T7 | **Never sold reads after the dead-stock threshold.** A held Record with no sales and its oldest copy on hand 180 days reads *never sold*; before that the stamp is silent. | 3 | E-03 decision 16, M-06 decision 40 | A Record received 181 days ago, never sold; one received yesterday | Planned | — | |

### E-04 — Manage the inventory

Steps in [E-04](../flows/E-04-manage-inventory.md). Prototype: embedded in
Search's titlecard; Supplier Claims at `/claims`.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-04-T1 | **Titlecard is a view of one Record and every copy.** Open a Record from Search; the titlecard shows its copies, derived on-hand, held, and order state, and updates in place when a different Record is selected. | §"The titlecard" | E-04 decision 1 | A Record with three copies at two prices | Planned | — | |
| E-04-T2 | **Reserve creates a Held Sale.** Reserve one copy for a quantity; a Held Sale exists, the copy counts against available but stays on hand. | §"Functions" Reserve | E-05 §"Holds" | A Record with stock on hand | Planned | — | |
| E-04-T3 | **Shelf price below cost flags, does not block.** Edit a copy's price below its cost on the titlecard. The change saves and a ReviewFlag is raised. | §"Pricing outside receiving" | E-04 decision 16, E-02 decision 35 | A copy with a known cost | Planned | — | |
| E-04-T4 | **Adjust on hand is manager-only and reason-coded.** As an Employee, Adjust on hand is gated: a Manager authorizes in place by initials and both names are recorded. The adjustment records reason, before/after, timestamp and actor; `Other` demands a note. | §"Adjusting on hand" | M-04 decision 3, M-04 decision 4, A-28a | A Record with stock; a Manager's initials | Planned | — | |
| ~~E-04-T5~~ | ~~**Supplier claim, batched and numbered.**~~ — **superseded by E-04-T6** Raise claims against two copies from the same Supplier + separator; they merge onto one Draft; sending it assigns the next ascending claim number and the claim appears Pending in M-05. | §"Supplier claims" 1–6 | E-04 §"Supplier claims" step 4 (auto-number), M-05 decision 3 | Two received copies from one Supplier | — | — | |
| E-04-T6 | **Supplier claim: unsent, sent, voided, abandoned.** Raise claims against two copies from one Supplier + separator; they merge onto one unsent batch (no sent date). Send: a number and a sent date are assigned; it appears Pending in M-05. Void it: it returns to unsent, number retired, lines intact. Abandon one: manager-only, reason-coded, terminal. | §"Supplier claims" 1–6 | E-04 decision 21, E-04 decision 24, E-04 decision 25, E-04 decision 29, A-44, A-46, M-05 decision 3 | Two received copies from one Supplier; a Manager's initials | Planned | — | |

### E-05 — Point of Sale

Steps in [E-05](../flows/E-05-sell-a-record.md). Prototype screen: Point of
Sale (`/sell`, `/sell/:saleId`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-05-T1 | **Anonymous cash sale, single copy.** New Sale, scan an internal barcode, tender cash over the total. Change is shown; the Sale moves Open → Current, takes a Sale number, is attributed to the lock holder; the receipt is offered as a browser print (no email). | 1, 4–6, 9, 11–13 | E-05 decision 20, E-05 decision 21, E-05 decision 23, E-05 decision 24 | One sellable copy with an internal barcode | Planned | — | |
| E-05-T2 | **UPC with differing copies opens the picker.** Scan a manufacturer UPC held at two grades/prices → picker with grade, price, count; pick one → the line is at that copy's price. Scan a UPC with one sellable copy → no picker. | 4–6 | E-05 step 5 | A Record with two copies at different prices, another with one | Planned | — | |
| E-05-T3 | **`0.00` asks at the till.** Scan a copy priced `0.00`; the till prompts for a price before the line lands. | 6 | E-05 step 6 | A copy priced `0.00` | Planned | — | |
| ~~E-05-T4~~ | ~~**Customer pre-fills discount and tax line.**~~ — **superseded by E-05-T12** Attach a Customer carrying a global discount and a default tax line; both pre-fill each subsequent line and stay editable per line. | 2–3, 7 | E-07 decision 6, E-07 decision 7 | A Customer with both fields set | — | — | |
| E-05-T5 | **Split tender.** Tender part on a gift card, part cash, remainder on card. Each tender is its own entry; the Sale completes when they net to the total. | 9–12 | E-05 step 10 | A gift card with a balance | Planned | — | |
| E-05-T6 | **Negative inventory warns and completes.** Set quantity above on-hand. The till warns, the Sale completes, and the oversold copy is minted tagged oversold. | 7 | E-02 decision 21, E-04 §"Adjusting on hand" | A Record with one copy on hand | Planned | — | |
| E-05-T7 | **Hold hands the lock over.** Employee A opens a Sale and adds a line; Employee B cannot add to it. A puts it on Hold; B re-opens and tenders; the Sale is attributed to B. | 1, 12; §"Sale locking and attribution" | E-05 decision 23, A-19 | Two Employees' initials | Planned | — | |
| E-05-T8 | **Void only at zero.** Tender a Sale, then Void — refused while tenders do not net to zero. Strike the tender; the money really goes back (gift card balance restored); Void then succeeds and the Sale keeps its number. | §"Sale states"; prototype notes | E-05 decision 31, E-05 decision 32 | A gift card tendered on a Current Sale | Planned | — | |
| E-05-T9 | **Deposit is a line-less Sale to account.** Ring a Sale with no lines, tender to the Customer's account; the Customer's balance shows the credit and the Held Sale displays it. | §"Deposits" | E-05 decision 25, E-07 decision 4, E-07 decision 5 | A Customer with a Held Sale | Planned | — | |
| E-05-T10 | **Snapshotted line values.** Tender a Sale, then edit the Record's title and price in E-04. The Sale's line still shows what was sold at what price. | 12; E-04 Edit catalog | E-05 decision 13 | As T1 | Planned | — | |
| E-05-T11 | **Three tracks own the window.** At a counter viewport, add twenty lines: the page never scrolls; Finish sale stays on the money rail's floor; the rail collapses to icons and opens as a drawer. | — (layout) | E-05 decision 28, E-05 decision 29, E-05 decision 30 | Twenty sellable copies | Planned | — | |
| E-05-T12 | **Tax resolves from the Customer's group and the Genre's code, at tender.** A `$29.99` record whose Genre carries product tax code 1, sold in the Quebec group: cell `ab` totals `34.48`, cell `ab+` totals `34.63` (M-06's worked example). A Customer with no group resolves through the store default; the figures are fixed at tender, not when the line was added. | 2–3, 7, 9–12 | M-06 decision 14, M-06 decision 16, A-57 | The Quebec group with `a` GST 5% and `b` QST 9.975%; a Customer in it; a Record at 29.99 | Planned | — | |
| E-05-T13 | **Cash rounds to five cents as its own tender.** Tender `34.48` in cash: a system-written rounding tender of `0.02` appears and the Sale's tenders sum to the total; the same Sale on card settles exact. Rounding is applied by the last tender on a split. | 9–11 | M-06 decision 21, M-06 decision 26 | As T12 | Planned | — | |
| E-05-T14 | **A pay-out prompts, funds itself, and reads as cash.** Record a pay-out: initials are asked every time, session or not; M-03's tender block reports it against cash with a `Cash, net` subtotal. | §"Functions" | E-05 decision 35, M-03 decision 16, E-01 decision 12 | A Current cash Sale to pay out of | Planned | — | |
| E-05-T15 | **The tender pad is the configured tender table.** Add a tender in M-06 named for a behaviour, toggle another off; the pad offers exactly the active set and the Sale records which one was used. | 9 | E-05 decision 36, M-06 decision 22, M-06 decision 23 | A Manager's initials for M-06 | Planned | — | |
| E-05-T16 | **A provider match on a sale line adopts it first.** Look up a title not held from the till; putting it on a line runs adoption (Genre insisted on) before the line lands. | 4 | E-05 decision 34, E-03 decision 18 | As E-03-T5 | Planned | — | |

### E-06 — Process a return

Steps in [E-06](../flows/E-06-process-a-return.md). Prototype screen: Return
(`/return/:saleId`, entered from the till rail).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-06-T1 | **Linked return, cash refund, back to sellable.** Attach the Customer, scan the copy's sticker; the line links to the prior Sale and defaults to its price; refund cash; route back to sellable at its grade; the Return shows in Recent, negative and badged. | 1–7 | E-06 decision 11, E-06 decision 12 | A tendered Sale for a Customer with one copy | Planned | — | |
| E-06-T2 | **Unlinked return proceeds.** No Customer, no receipt; the line defaults to the current price; the return completes with no link. | 2–5 | E-06 step 3 | A sellable copy | Planned | — | |
| E-06-T3 | **Store-credit refund lands on the balance.** Refund to the Customer's account; the A/R balance moves by the refund and M-03's tender column shows it in the paying-on direction. | 5 | E-07 decision 4, M-03 decision 14 | As T1 | Planned | — | |
| E-06-T4 | **Re-graded copy is a new InventoryItem.** Route as re-graded with its own grade and price; the titlecard shows a new copy at that grade. | 6 | E-06 step 6 | As T1 | Planned | — | |
| E-06-T5 | **Void refuses while a copy is routed.** Route the copy, then Void — refused; the refusal names routing. | 6; prototype notes | E-06 decision 10, E-05 decision 31 | As T1 | Planned | — | |

### E-07 — Manage customers

Steps in [E-07](../flows/E-07-manage-customers.md). Prototype screen: Customers
(`/customers`, `/customers/:customerId`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-07-T1 | **Search, open, edit in place.** Search by phone; open the card; change the account number directly on the card; reload — it persisted, and Customers reopens on this card. | 1–4 | E-07 decision 13, E-07 decision 14, E-07 decision 15 | Three Customers | Planned | — | |
| E-07-T2 | **New opens a blank card in the middle track.** New → blank card, not a modal; submit → it becomes the open card. Nothing prompts for a Manager. | 3 | E-07 decision 12, E-07 decision 18 | — | Planned | — | |
| E-07-T3 | **Delete leaves past Sales intact.** Delete a Customer with history; the Sales still exist, un-pointed. | 5 | E-07 step 5 | A Customer with one tendered Sale | Planned | — | |
| E-07-T4 | **Primary action ladder.** A Customer with a Held Sale → the card's primary action opens it; with a Sale in flight → attach; otherwise → start a Sale. | 6 | E-07 decision 20 | Customers in each of the three states | Planned | — | |
| E-07-T5 | **History is sold items only.** After a Sale and a Return for the same Customer, history lists the sold item and not the Return. | — | E-07 decision 16 | As E-06-T1 | Planned | — | |
| E-07-T6 | **Delete is refused while a live reference exists.** A Customer with a non-zero balance, a Held Sale, or an open customer-attached order line cannot be deleted, at any role, and the refusal names why; clear the balance and it proceeds. | 5 | A-54, E-07 decision 12 | Three Customers, one per live reference | Planned | — | |
| E-07-T7 | **Attribution is once per card.** With no session, edit two fields on a card: initials are asked once, not per field. | 4 | E-01 decision 20, E-07 decision 13 | No active session | Planned | — | |

### M-01 — Suppliers

Steps in [M-01](../flows/M-01-supplier-margin.md). Prototype screen: Suppliers
(`/suppliers`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| ~~M-01-T1~~ | ~~**New, Edit, Copy are plain Employee actions and logged.**~~ — **superseded by M-01-T5** Create a Supplier (discount defaults 0%), edit its discount, copy it; each is on the log with who and when; Copy clears the second-hand default and resets the log. | 1–3, 5 | M-01 decision 1, M-01 decision 4, M-01 decision 11 | — | — | — | |
| M-01-T2 | **Discount change reprices future receiving only.** Change a Supplier's discount; on-hand copies keep their price; a new receipt suggests the new figure. | 3 | M-01 decision 2 | A Supplier with received stock | Planned | — | |
| M-01-T3 | **One second-hand default.** Set the flag on a second Supplier; it clears from the first. | 3 | M-01 decision 5 | Two Suppliers | Planned | — | |
| M-01-T4 | **Merge repoints every dependent.** Merge B into A; B's Invoices, order lines, claims, copies and a Record's preferred Supplier now point at A. Manager-only. | 4 | M-01 decision 9, M-01 decision 11 | Supplier B with one of each dependent | Planned | — | |
| M-01-T5 | **The card is the edit surface, except Discount.** Create a Supplier (Discount defaults 0%) and Copy it as plain Employee actions, each on the log with who and when; edit a field on the card and it saves. Change Discount: a Manager's initials are asked, both names recorded. | 1–3, 5 | M-01 decision 1, M-01 decision 4, M-01 decision 11, M-01 decision 13, E-02 decision 44 | A Manager's initials | Planned | — | |
| M-01-T6 | **Primary action ladder.** A Supplier with a draft Invoice → the card opens it; else with a pending stream → process it; else → start an intake. | — | M-01 decision 15 | Suppliers in each of the three states | Planned | — | |

### M-02 — Re-order inventory

Steps in [M-02](../flows/M-02-reorder-inventory.md). Prototype screens: Order
Processing (`/orders`), What's on Order (`/on-order`), titlecard Order.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-02-T1 | **Raise, process, place.** Order from a titlecard (defaults: preferred Supplier, shelf price); the stream appears on Order Processing with its Ready state; View lists it live; Process confirms the send method and mints the next PO number; the line moves to What's on Order. | 1–8 | M-01 decision 10, M-02 step 7 | A Record with a preferred Supplier that has a minimum | Planned | — | |
| M-02-T2 | **Separator change onto a used letter prompts to merge.** Move a stream to a separator already in use for that Supplier; a merge prompt warns it cannot be undone. | §"The ordering separator" | M-02 decision 17 | Two streams for one Supplier | Planned | — | |
| M-02-T3 | **Delete pending warns when a Customer is attached.** Delete a customer-attached pending line; the confirmation says so. A placed line offers no Delete. | §"Cancelling and unwinding" | M-02 decision 9, M-02 decision 21 | One pending customer-attached line; one placed line | Planned | — | |
| M-02-T4 | **Set status is logged and Cancelled warns.** Mark a placed line Shipped with a date, then Cancelled. Each move is on the line's log with from/to and actor; Cancelled states the supplier has not been told. | 10 | M-02 decision 10, M-02 decision 12, M-02 decision 22, M-02 decision 23, A-35 | A placed line | Planned | — | |
| M-02-T5 | **Re-flag restarts the window.** Re-flag a line past its follow-up date by *n* days; it drops from the top and its date is *n* days from today, not extended. | 9–10 | M-02 step 10 | A line past its flag | Planned | — | |
| M-02-T6 | **Void a part-received PO.** Void a PO with one fully unreceived line, one part-received, one fully received. The dialog leads with "nothing is cancelled at the supplier"; afterwards the first is pending whole, the second keeps what arrived and its remainder is a fresh pending line, the third is untouched; the PO stays listed, badged voided. Manager-only. | §"Cancelling and unwinding" | M-02 decision 10, M-02 decision 24, A-28a | A PO in that state — needs E-02-T8 first | Planned | — | |
| M-02-T7 | **Receipt of a customer-attached line creates a Held Sale.** Receive a customer-attached line in E-02; a Held Sale exists for that Customer and the copy is not available on the floor. | 11 | M-02 step 11, E-05 §"Holds" | A placed customer-attached line | Planned | — | |
| M-02-T8 | **Record an order placed elsewhere.** Enter lines directly as placed, with the date it was actually placed; it is marked as recorded-after-the-fact, its prefetch is queued, and it lists on What's on Order like any PO. | §"Phase 2" | M-02 decision 25, M-02 decision 26, M-02 decision 27, M-02 decision 36 | A Supplier; two Records | Planned | — | |
| M-02-T9 | **The bulk sheet is a draft with two destinations.** Scan five Records into the sheet, reload — it persists; each row shows on hand / pending / on order and no warning; send it to the pending pile, then a second sheet straight to placed; discard a third only through the confirmed action. | §"Phase 1" | M-02 decision 28, M-02 decision 30, M-02 decision 33, M-02 decision 38 | Five adopted Records | Planned | — | |
| M-02-T10 | **A stream below minimum waits.** A pending stream under its Supplier's minimum reads not Ready and is neither expired, escalated nor sent short, however old. | 4 | M-02 decision 31 | A Supplier with a minimum; one pending line under it, aged | Planned | — | |

### M-03 — Daily summary

Steps in [M-03](../flows/M-03-daily-summary.md). Prototype: under Point of
Sale's **Other functions**.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-03-T1 | **View Subtotal changes nothing.** Run it twice mid-day; the breakdown is identical and every Sale is still Current. | 1 | M-03 step 1 | Three Current Sales | Planned | — | |
| M-03-T2 | **Close moves Current to Closed as a batch.** Total Today's Sales; every Current Sale is Closed and no longer editable; the batch carries its id, timestamp and User; a Sale rung afterwards belongs to the next batch. | 2–3 | M-03 §"The close" | As T1 | Planned | — | |
| M-03-T3 | **Undo End of Day is manager-only and restores numbers.** As an Employee, Undo is authorised in place by a Manager's initials with both names recorded; the batch's Sales return to Current with their numbers. | 4 | M-03 decision 4, M-04 decision 3, M-04 decision 4, A-28a | A closed batch | Planned | — | |
| M-03-T4 | **Tender column reconciles.** A day with a cash sale, a cash refund, a payment onto account and a spend of that credit: the tender column reports each movement, Account Balance split by direction, and reconciles against net sales. | — | M-03 decision 14 | Those four transactions | Planned | — | |
| M-03-T5 | **Tax breaks out by rate across a rate change.** Enter a pending rate for tax `a` effective tomorrow; sell today and tomorrow; close. The summary reports `a` at each rate within its type. | 2 | M-03 decision 15, M-06 decision 52 | As E-05-T12; two business days | Planned | — | |
| M-03-T6 | **The close writes its journal.** Close a day with a cash Sale, a card Sale and a pay-out: a journal batch sits on the CloseBatch, balanced, revenue per Section and tax per type; force an imbalance and Suspense takes it while the close still proceeds. | 2–3 | M-07 decision 7, M-07 decision 10, M-07 decision 14, M-07 decision 25 | As E-05-T12, E-05-T14 | Planned | — | |

### M-05 — Accounts payable

Steps in [M-05](../flows/M-05-accounts-payable.md). Prototype screen: Accounts
Payable (`/payable`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-05-T1 | **Manager-only, in its entirety.** Reaching `/payable` as an Employee is gated behind a Manager's initials, both names recorded; once authorized, suppliers carrying a balance list first and the lookup finds a zero-balance one. | 1 | M-05 decision 2 | Two Suppliers, one settled | Planned | — | |
| M-05-T2 | **One combined list.** A Supplier with an outstanding Invoice, a Pending claim and a manual entry shows all three in one list, and the balance is their net. | 2 | M-05 decision 3 | Those three items — needs E-04-T5 first | Planned | — | |
| M-05-T3 | **Record a partial payment, then settle.** Pay part of an Invoice; balance owing drops; pay the rest; the Invoice is marked paid and Receiving shows it locked. | 3; §"Recording a payment" | E-02 decision 40, A-33 | A finalized Invoice | Planned | — | |
| ~~M-05-T4~~ | ~~**Apply credit distributes oldest-first.**~~ — **superseded by M-05-T5** Mark a claim Credited and apply it; it lands across outstanding Invoices oldest-received-first, and its type relabels from Claim to Credit. | 3; §"Applying a claim credit" | M-05 decision 11 | Two outstanding Invoices, one Credited claim | — | — | |
| M-05-T5 | **A credit funds the settlement, whole.** Tick two outstanding Invoices and a Credited claim worth more than both: the settlement draws the credit down in the order ticked, says which is being partly applied, and the excess is emitted as a remainder Credit — the balance may go negative. A claim is never applied in part across settlements. | 3; §"Applying a claim credit" | M-05 decision 18, M-05 decision 23, M-05 decision 24, M-05 decision 25, M-05 decision 27, M-05 decision 42, M-05 decision 43 | Two outstanding Invoices; one Credited claim exceeding their sum | Planned | — | |
| M-05-T6 | **Voiding a PaymentBatch appends and never refuses.** Void a batch whose settlement emitted a remainder Credit: a reversing Adjustment of equal and opposite amount is appended; the batch stays in history; the Invoices it covered are outstanding again and Receiving shows them unlocked. | §"Recording a payment" | M-05 decision 22, M-05 decision 30, M-05 decision 32, E-02 decision 46, A-33a | A recorded batch — needs T5 first | Planned | — | |
| M-05-T7 | **An Invoice cannot be voided while a batch targets it.** Void the Invoice in E-04 — refused, naming the batch; void the batch first and the Invoice void proceeds. | — | M-05 decision 37, E-02 decision 40 | As T3 | Planned | — | |

### E-01 — Authenticate to the platform

Steps in [E-01](../flows/E-01-authenticate.md). Prototype: the app shell — no
screen of its own. **Every walk on the prototype now begins here**: a session is
opened by typing initials, so each row above assumes one unless it says otherwise.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-01-T1 | **Identification resolves as you type.** Type `J`: *keep typing*. Type `JD`: the session opens on the full match with no Enter, confirmed by name. Escape on **New sale** creates no Sale. A one-character initial resolves. | 1–2 | E-01 decision 19, E-01 decision 22, E-01 decision 14 | Users `J`, `JD` and `JDB` | Planned | — | |
| E-01-T2 | **The lapse is a setting, and an Open Sale suppresses it.** Set the lapse to one minute in M-06; idle past it — the session ends; open a Sale and idle past it — the session holds. | 3 | E-01 decision 10, E-01 decision 13, M-06 decision 45, A-50 | A Manager's initials for the setting | Planned | — | |
| E-01-T3 | **No session: attribution is asked inline.** With no session, change a Customer's field: initials are asked once for the card, the change is attributed, and no full session opens. | 5 | E-01 decision 5, E-01 decision 20 | No session; a Customer | Planned | — | |
| E-01-T4 | **Some actions prompt every time.** Inside an active session, new Sale, pay-out, adjust on hand and void each ask for initials; starting a Return asks as a new Sale does. | 5a | E-01 decision 12, E-01 decision 15 | An active session | Planned | — | |
| E-01-T5 | **Manager-locked areas always ask.** Cross into Accounts Payable as an Employee — a Manager's initials are asked and both names recorded; cross as a Manager inside their own session — still asked, with the ordinary prompt. | 6 | E-01 decision 23, E-01 decision 11, M-04 decision 9, A-28a | An Employee and a Manager | Planned | — | |
| E-01-T6 | **The optional password is a barrier at two moments.** A User with a password is asked for it when opening a session and when authorising a manager-only action, and nowhere else; a User without one is never asked. | 2, 6 | E-01 decision 21, M-04 decision 23 | One User with a password, one without | Planned | — | |
| E-01-T7 | **A terminal is scoped to its Store.** A terminal enrolled to Store A cannot reach a Store B row by any identifier; initials do not change that. | 0 | E-01 decision 9, A-3, A-5 | Two Stores; product only | — | Planned | |
| E-01-T8 | **Deactivation bites at the write path.** Deactivate a User mid-session on another terminal: their next write is refused; their Open Sale can still be tendered. | 4 | E-01 decision 17, M-04 decision 15, M-04 decision 18 | Two terminals | Planned | — | |

### M-04 — Add/remove employees or managers

Steps in [M-04](../flows/M-04-manage-users.md) §"Managing users". Prototype
screen: Users (`/users`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-04-T1 | **Add normalises and refuses a duplicate.** Add ` jd `: stored as `JD`. Add `jd` again: refused while `JD` is active. Authorisation is asked once for the screen, not per action. | §"Managing users" Add | M-04 decision 13, M-04 decision 20, M-04 decision 24, A-55 | A Manager | Planned | — | |
| M-04-T2 | **Deactivate releases initials and never deletes.** Deactivate `JD`; add a new hire as `JD` — accepted; the old User's history still shows their name. Deactivating the last active Manager is refused. | Deactivate | M-04 decision 5, M-04 decision 14, M-04 decision 16 | Two Managers, one Employee | Planned | — | |
| M-04-T3 | **Reactivate restores the row and re-asks initials if taken.** Reactivate the original `JD` while the new hire holds `JD`: prompted for new initials; one history, not two. | Reactivate | M-04 decision 19 | As T2 | Planned | — | |
| M-04-T4 | **Correct initials or name, logged and retroactive.** Correct a User's display name; the log shows before and after; a past Sale's attribution now shows the corrected name. | Correct | M-04 decision 22 | A User with one tendered Sale | Planned | — | |
| M-04-T5 | **Change role takes effect next session; last-Manager demotion refused.** Promote an Employee; their current session is unchanged, their next is a Manager's. A Manager demoting themselves as the only active Manager is refused. | Change role | M-04 decision 14 | As T2 | Planned | — | |
| M-04-T6 | **Password is logged as changed, never as a value.** Set, change and clear a password; the log carries three events and no value. | Password | M-04 decision 23, E-01 decision 21 | A User | Planned | — | |
| M-04-T7 | **The review queue.** Trigger each flagged action — below-cost shelf price, accepted subtotal discrepancy, a Sale driving stock negative, a broken sale lock: each writes a ReviewFlag with actor, subject and figures in the same transaction; acknowledging is manager-only; nothing deletes one. | §"The review queue" | M-04 decision 8, M-04 decision 17, A-28, A-68 | Fixtures for each action | Planned | — | |

### M-06 — Configure the store

Sections of [M-06](../flows/M-06-settings.md). Prototype screen: Settings
(`/settings`). The product lands the **tables and seed** in M1/M2 (A-53) and the
**screens** post-v1; rows that are observable through the till are mapped to M4
below, screen rows to the settings-screens milestone.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-06-T1 | **Two tables, one lookup, the worked example.** Configure tax types `a` GST 5% and `b` QST 9.975%, product code 1, the Quebec group with cell `ab`; a `29.99` sale totals `34.48`. Change the cell to `ab+`: `34.63`. | §"Tax" | M-06 decision 11, M-06 decision 12, M-06 decision 13, M-06 decision 14, M-06 decision 16 | A Manager; a Record at 29.99 with a Genre on code 1 | Planned | — | |
| M-06-T2 | **A blank cell and a zero-rate type differ.** Blank the cell: no tax line, nothing reported. Put a zero-rate type in it: a `0.00` tax line appears and is reported. | §"Tax groups" | M-06 decision 15, M-06 decision 2 | As T1 | Planned | — | |
| M-06-T3 | **A pending rate lands on its date.** Enter a new rate for `a` effective tomorrow; today's sale uses the old rate, tomorrow's the new; the type shows the pending change until then. | §"Tax types" | M-06 decision 52 | As T1; two business days | Planned | — | |
| M-06-T4 | **Removing a letter is deactivation.** Remove `b` from every cell; no sale charges it; there is no Active switch to find. | §"Tax groups" | M-06 decision 57, A-63 | As T1 | Planned | — | |
| M-06-T5 | **Tenders are a table.** Add tender *Interac* on the card behaviour; toggle *Cheque* off; the till's pad shows the active set; no tender carries a reference field. | §"Tender types" | M-06 decision 4, M-06 decision 22, M-06 decision 23, M-06 decision 24 | A Manager | Planned | — | |
| M-06-T6 | **The drawer setting has three positions.** Every Sale / cash only / never — each governs the open on finalize; a manual open is logged as an Employee action, not flagged. | §"The cash drawer" | M-06 decision 25, M-06 decision 27 | A Manager; a drawer signal the target exposes | Planned | — | |
| M-06-T7 | **Sections are editable, deactivated not deleted, and carry their flags.** Add a Section (its account is created and mapped in the same act — M-07); deactivate one with stock — it stays resolvable; the gift-card Section is neither discountable nor returnable at the till. | §"Sections and the genre map" | M-06 decision 28, M-06 decision 9, M-06 decision 30, M-07 decision 6 | A Manager; a Section with stock | Planned | — | |
| M-06-T8 | **Genre is mandatory and carries the Section.** Adopt a Record: Genre is insisted on; its Section derives from the Genre's parent; an Employee may change the genre without a Manager. | §"Sections and the genre map" | M-06 decision 17, M-06 decision 19, M-06 decision 32 | As E-03-T5 | Planned | — | |
| M-06-T9 | **Currency is a planning rate, and presentation only.** Set a home currency once; set a rate for USD with today's date; a USD Invoice shows its own currency and a converted figure that is not stored; the Supplier carries the currency, not the Invoice. | §"Currency" | M-06 decision 33, M-06 decision 34, M-06 decision 35, M-06 decision 37, M-06 decision 38 | A USD Supplier | Planned | — | |
| M-06-T10 | **Store details.** Legal and trading names separate; footer toggled off leaves the receipt without it; the logo is uploaded, not a URL; width defaults 80mm; Store ID and position are not editable. | §"Store details" | M-06 decision 46, M-06 decision 47, M-06 decision 50, M-06 decision 51, A-56 | A Manager; an image file | Planned | — | |
| M-06-T11 | **Settings are never retroactive.** Tender a Sale, then change the tax rate and the price ending; the Sale's snapshot is unchanged; the next Sale uses the new values. | §"Store details" | M-06 decision 8, A-57 | As T1 | Planned | — | |
| M-06-T12 | **Thresholds drive the other flows.** Dead-stock 180 days (E-03's *never sold*), stream aging 14 days, Supplier lead time filling the follow-up flag at placement. Change each and observe the dependent screen. | §"Store details" | M-06 decision 40, M-06 decision 41, M-06 decision 42 | Aged fixtures — needs E-03-T7 | Planned | — | |

### M-07 — Chart of accounts

Steps in [M-07](../flows/M-07-chart-of-accounts.md). Prototype screen: Chart of
accounts (`/chart`); no journal screen, on purpose. **Not placed in
[architecture](../architecture.md) §8** — see Open questions.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| ~~M-07-T1~~ | ~~**The chart arrives mapped; the Manager renames.** Open the chart: one account per reserved role, Section, tender, two per tax type, one per reason code, every seam mapped. Rename a number and name; the role beside it is not editable; add an account of your own — it carries no role.~~ — **`Stale`. Superseded by M-07 decision 28 and M-07 decision 29:** revenue resolves to one reserved *Sales* account with the Section riding on the line as a dimension, so there is no per-Section account to open the chart on, and the Section seam is **sparse** — only a Section marked *not* revenue keeps a mapping, which makes *every seam mapped* false by design. **Replaced by M-08-T1's chart precondition and a rewrite this row still needs.** | 1–3, 5 | M-07 decision 3, M-07 decision 11, M-07 decision 5, M-07 decision 22 | A Manager | Stale | — | |
| M-07-T2 | **Seams added later map themselves; deactivated ones stay postable.** Add a Section in M-06: its account exists and is mapped, and the screen says so. Deactivate it: the account is still mapped and a later posting to it lands. | 6–7 | M-07 decision 6, M-07 decision 18, M-06 decision 58 | A Manager | Planned | — | |
| M-07-T3 | **Every artifact writes its own journal, when it happens.** Finalize an Invoice: Inventory, Freight Inbound, tax paid per type against Accounts Payable, at finalize. Record a PaymentBatch: its journal at record. Adjust on hand: its journal to the reason code's account. None waits for a close. | 11–13 | M-07 decision 12, M-07 decision 13, M-07 decision 5 | As E-02-T11, M-05-T3, E-04-T4 | Planned | — | |
| M-07-T4 | **A correction posts forward.** Fix a cost on a finalized, unpaid Invoice: the original journal is untouched; a reversing entry dated today is appended. | 14 | M-07 decision 7, M-07 decision 8, E-02 decision 40 | As T3 | Planned | — | |
| M-07-T5 | **Export is neutral, repeatable, and warns on overlap.** Download a range: one CSV row per line — journal id, business date, account number and name, debit, credit, memo, source, currency code. Download it again: identical. Download an overlapping range: warned, proceeds. **Not `Stale`: every decision it asserts is live — the file is still M-07's. What moved is the *surface*, to M-08's reporting screen (M-08 decision 31), so this row is walked there and M-07's own Phase 4 export screen was never built and will not be.** | 15–17 | M-07 decision 15, M-07 decision 16, M-07 decision 17, M-08 decision 31 | As T3, M-03-T6, M-08-T14 | — | Planned | |
| M-07-T6 | **Business date is a calendar day; a dateless line is flagged, not dropped.** A Sale at 23:59 and one at 00:01 fall on different days; a line that cannot produce a date takes the write date and is flagged. | — | M-07 decision 19, M-07 decision 24, A-71 | Two Sales either side of midnight | Planned | — | |
| M-07-T7 | **Tenders map by behaviour; `used_credit` is Second-hand purchases.** A Sale settled with used credit posts to Second-hand purchases, not a customer credit account; each other tender to its behaviour's account. | 9 | M-07 decision 21, M-07 decision 26 | A Sale tendered with used credit | Planned | — | |

### M-08 — Keep the general ledger

Steps in [M-08](../flows/M-08-general-ledger.md). **No screen exists on either target** — the flow is `Specified` with no code at all, so every row is `Planned` for the product and `—` for the prototype, which does not model it ([prototype](../prototype.md)). **Not placed in [architecture](../architecture.md) §8** — see Open questions; M-08 arrived after the build order was written.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-08-T1 | **The opening position is typed from paper, balances by construction, and seals once.** Name the first day the books start. Inventory arrives **supplied by the system** — on hand × cost — not typed; type bank, loans and the paper-era payables lump into *Accounts payable — opening*, never into *Accounts payable*. **Equity is not typed**: it is shown as the figure that balances assets against liabilities, so the position cannot fail to balance. Type the accountant's own equity figure into the read-back: a difference is displayed and must be acknowledged before sealing. Seal it. | 1–8 | M-08 decision 6, M-08 decision 7, M-08 decision 9, M-08 decision 26, M-08 decision 28, A-78 | A chart (M-07-T1), stock on hand with costs, and an accountant's closing balance sheet. **No seed exists for the last of these** | — | Planned |  |
| M-08-T2 | **The opening position is retypeable until the first real seal, and never after.** Unseal and retype it while no period has been sealed. Seal a month. Try again: refused, and the refusal says why — the correction route is a dated posting like any other. | 8 | M-08 decision 6 | M-08-T1 | — | Planned |  |
| M-08-T3 | **The customer side opens empty, and a paper credit note is rung as a discount.** No customer balance is migrated. Present a pre-migration paper credit at the till: rung as a discount, no Customer created and no balance issued — and the month shows revenue low and discounts high, with the copy's cost still posted. | 6 | M-08 decision 8, E-07 decision 22 | M-08-T1, a sellable copy | — | Planned |  |
| M-08-T4 | **A typed posting is manager-only, must balance, and cannot reach the accounts the system keeps.** Reached without a Manager: refused. Save unbalanced: refused, naming the amount still needed and which side — it does **not** go to Suspense. *Retained earnings* and *Accounts payable*: not offered. *Inventory*: offered, because a dead-stock write-down is exactly where book value should leave the shelf. | 9–15 | M-08 decision 10, M-08 decision 13, M-08 decision 14, A-74 | A chart, an open period | — | Planned |  |
| M-08-T5 | **A typed posting carries its dimensions and its date is bounded at both ends.** Post rent: the line carries a **location** (required, the Store) and no **section** (blank means *not applicable*). Date it inside a sealed period: refused. Date it before the opening position: refused. Date it in the future: **permitted**. | 10–11 | M-08 decision 2, M-08 decision 11, M-08 decision 12, M-08 decision 27, A-72, A-73 | M-08-T1, one sealed period | — | Planned |  |
| M-08-T6 | **Sealing reports every failure without sealing, and a Suspense line does not block it.** Leave an unbalanced posting and an invalid code in the period: the seal reports both and seals nothing. Fix, re-run, seal: the closing transaction carries balance-forwards. **A period carrying Suspense seals anyway**, and the total it carries is **gross** — short three dollars on one date and over three on another reports six, not zero. | 16–20 | M-08 decision 15, M-08 decision 20, M-07 decision 10, M-07 decision 25, A-75, A-76 | A period with postings, and a journal forced to Suspense | — | Planned |  |
| M-08-T7 | **A second seal of the same period is unrepresentable.** Seal a month. Seal it again: refused — not by a check someone remembered but because a live seal is unique per period. The balance-forwards are not doubled. | 16–20 | M-08 decision 20, A-75 | M-08-T6 | — | Planned |  |
| M-08-T8 | **A year-end seal writes visible closing postings.** Seal the period that ends the fiscal year M-06 configured. Revenue and expense are zeroed into retained earnings by **real journal lines** dated the last day of the year and identifiable as the seal's — not by a rule about how balance-forwards are computed. | 21 | M-08 decision 5, M-08 decision 17, M-06 decision 64 | M-08-T6, a fiscal year end set | — | Planned |  |
| M-08-T9 | **Unsealing reaches the most recent period only, repeats to walk back, and stops at a filed year.** Unseal the latest sealed month: authorized, with a reason required and recorded. Reach an older month: unseal each in turn. Mark a year **filed**, then try to unseal into it: refused, and the refusal names what is holding it. | 22–23 | M-08 decision 18, M-08 decision 22, M-08 decision 29 | Three sealed months and one sealed year | — | Planned |  |
| M-08-T10 | **Nothing writes into a sealed period, by any route.** With a day inside a sealed period, run M-03's **Undo End of Day** — the one reversal in this system that does not post forward: refused while the period is sealed, released when it is unsealed, and never released for a day inside a **filed** year. | 22–23 | M-08 decision 11, M-08 decision 22, M-08 decision 29, M-03 decision 4, A-66 | M-08-T9, a closed CloseBatch inside a sealed month | — | Planned |  |
| M-08-T11 | **An account reads back as balance forward · activity · new balance forward, filtered by dimension.** Pick an account and a range: three figures and every line behind them. Narrow by **section**: the same query, fewer lines. The middle term is true with no opening position and no seal — the other two are not. | 24 | M-08 decision 2, M-08 decision 20, M-08 decision 24 | A sealed month and an open one | — | Planned |  |
| M-08-T12 | **The books state a profit, and the balance sheet balances.** Draw a P&L for a sealed period: it has a bottom line and it is called a profit. Draw a balance sheet as at its end: equity carries **current earnings derived at the moment it is drawn**, named as its own line. Customer balances are **classified by sign and never netted across Customers** — store credit into liabilities, unpaid customer invoices into assets. | 25 | M-08 decision 23, M-08 decision 24, M-08 decision 25, E-07 decision 21, M-07 decision 27 | M-08-T6, one customer in credit and one owing | — | Planned |  |
| M-08-T13 | **A statement excludes lines dated after its as-at date, and every statement answers the same way.** Post a future-dated entry. Draw a balance sheet as at today: absent. Draw the P&L for the period: absent. Draw both again once its date has arrived: present. | 24–25 | M-08 decision 30, A-73 | M-08-T5's future-dated posting | — | Planned |  |
| M-08-T14 | **Issuing stores the figures, and re-opening shows what was issued.** Issue a balance sheet. Re-open the stored issuance: **the figures as issued**, never a recomputation. Export a journal range, then an overlapping one: warned, proceeds. The record of what left the building is what makes that warning possible. | 26 | M-08 decision 25, M-08 decision 31, M-07 decision 16, A-77 | M-08-T12 | — | Planned |  |
| M-08-T15 | **Reconciling marks a set that nets to zero, moves no money, and gates nothing.** Mark entries in the bank account against a statement until the difference is zero; stamp the set. No balance moves. Seal the period with another account left unreconciled: it seals — the mark is evidence, never a gate. | 27 | M-08 decision 25 | A bank account with entries, and a statement to reconcile against | — | Planned |  |
| M-08-T16 | **A foreign payable nets Accounts payable to zero across finalize and payment.** Finalize a USD Invoice: it books in the **home** currency at the rate recorded on the Invoice. Settle it, confirming what actually left the bank. **A/P nets to zero across the two journals** and the movement lands in *Exchange gain or loss*. The defect this exists to catch balanced inside each journal separately, so only a scenario spanning both artifacts can see it. | 9–15 | M-06 decision 59, M-06 decision 60, M-07 decision 8 | A USD Supplier, a rate, and a finalized Invoice in that currency | — | Planned |  |

### Registered

Every flow at `Specified` has rows above — **fifteen of fifteen**, M-08 included.

---

## Milestone view

Which rows must be `Automated` against the product before a build-order milestone
([architecture](../architecture.md) §8, as amended by A-39 and A-53) closes. The
gate for automating a row is in the `/qa` skill; this is only the mapping. The
build-status table in [`docs/build/status.md`](../build/status.md) says which
milestones have both tracks landed.

| Milestone | Rows |
|---|---|
| M1 Tenancy and governance | E-01-T1–T8, M-04-T7 *(flags written)*; the settings **tables** land here and at M2 (A-53) — M-06-T1, T2, T4 and T11 are exercised through the till at M4 |
| M2 Catalog and scan | E-03-T1, T2, T4–T7, E-04-T1, M-06-T8 |
| M3 Receiving | E-02-T2–T4, T7–T14, E-04-T3, E-04-T6; M-01-T2–T3, T5 *(M-01 is not named in §8, but a Supplier is a precondition of every E-02 row — see Open questions)* |
| M4 Till | E-05-T1–T3, T5–T16, E-06-T1–T5, E-07-T1–T7, E-04-T2, E-04-T4, M-06-T1, T2, T4, T11 |
| M5 Close, receipts, review | M-03-T1–T5, M-04-T7 *(acknowledge)* |
| M6 Hardening | Every row above, run as one seeded trading day |
| M7 Payables (A-39) | M-05-T1–T7, E-02-T9, M-01-T4 |
| **M-08 — unplaced** | M-08-T1–T16. **M-08 is in no milestone**: it reached `Specified` after [architecture](../architecture.md) §8's build order was written, and §8 has no **D** or **U** row for it. Placing it is an `/architecture` decision, and it is the one thing standing between these sixteen rows and a work order. Note M-08-T16 spans M3 (receiving) and M7 (payables), so the ledger cannot be wholly earlier than either |
| Post-v1, in §8's order | M-02-T1–T10 → M-04-T1–T6 *(Add and Deactivate first, M-04 decision 21)* → M-06-T3, T5–T7, T9, T10, T12 *(the settings screens)* → M-07-T1–T7 and M-03-T6 *(the chart and the journal — unplaced, see Open questions)* |

---

## Open questions

- **Where the suite lives.** The layout above is a proposal; §7 of the architecture
  does not mention an `e2e/` directory. Owner: `/architecture`.
- **Does the prototype get an automated suite, or only walks?** A walk catches
  prototype-vs-spec divergence, which is what the prototype is for; an automated
  prototype suite is written twice. Recorded walks make the second writing cheap,
  but nobody has decided. Owner: the user.
- **Seed data.** The `Needs` column names fixtures that exist in the prototype's
  `seed.ts` in some cases and in `supabase/seed.sql` in none, since it does not
  exist. Whether the product's seed is one file for both tests and first run, or
  a fixture set per row, is undecided. Owner: `/architecture` (§7 `seed.sql`).
- **M-01's milestone.** §8 does not place Suppliers, yet receiving needs one. Owner:
  `/architecture`.
- **M-07's milestone.** §8 does not place the chart of accounts or the journal,
  yet M-03's close (M5) and every Invoice finalize (M3) write a journal under
  M-07 decision 12. Either the journal tables land with M3/M5 and the screen
  later, or M-07 is a milestone of its own after M7. Owner: `/architecture`.
- **E-03-T4's rule.** "Search with visible degradation" is in §8's M2 row and in
  the prototype, but no numbered decision says what search does when the provider
  is down. Owner: `/flow-clarify E-03`.
- **Counter viewport.** E-05-T11 needs a viewport that matches the till hardware,
  which no decision names. Owner: `/architecture` (§2.1).
- **A drawer signal for tests.** M-06-T6 needs something observable when the
  drawer would open; the prototype has no drawer and the product's output path is
  §4's. Owner: `/architecture`.
