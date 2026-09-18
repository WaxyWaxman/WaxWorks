# Wax Works — end-to-end test register

**Status:** Seeded 2026-09-11; re-baselined 2026-09-17 against `main` — ten rows superseded by the decisions landed that week, four flows registered. **2026-09-18:** M-08's `Walked` rows re-walked against the prototype's seeded month of trading — M-08-T1 goes `Stale` (decision 44 amends step 3) and M-08-T12 is struck and split into T23 and T24. The d37 problem the walk also found was already fixed by #118's rewrite of M-08-T15, which landed first. **T18-T22 walked the same day** against #118's own rows — four conform, T22 conforms in substance while its wording overreaches, and **M-08-T17 stays `Planned`: d3's edit is built in `lib` and wired to no screen**. **A-81 registered the same day**: E-06-T6 for the write-off route's manager-only gate, E-06-T7 for the fourth status `written_off`, and E-04-T7 for an adjustment naming its copies — three rows, nothing `Stale`, and the prototype conforming to none of them. **E-06 was then walked whole** — T1-T7 `Walked` against the prototype, five conforming, one link-default finding, one row found asserting more than its flow says, and T3 half-covered. Nothing is `Automated`, so nothing runs in CI yet
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
| E-04-T7 | **An adjustment names the copies it moved.** Adjust on hand as in T4. Each copy that moved carries its own appended movement row — the kind, the status before and after, the adjustment that caused it, its actor, and a **system-written** timestamp, never a typed one — so *before and after counts* stop being the only record of what moved, and A-28a's attribution reaches the copies rather than stopping at the adjustment. | §"Adjusting on hand" | A-81, A-43, A-28a | As E-04-T4 | Planned | — | |

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
| E-06-T1 | **Linked return, cash refund, back to sellable.** Attach the Customer, scan the copy's sticker; the line links to the prior Sale and defaults to its price; refund cash; route back to sellable at its grade; the Return shows in Recent, negative and badged. | 1–7 | E-06 decision 11, E-06 decision 12 | A tendered Sale for a Customer with one copy | Walked | — | |
| E-06-T2 | **Unlinked return proceeds.** No Customer, no receipt; the line defaults to the current price; the return completes with no link. | 2–5 | E-06 step 3 | A sellable copy | Walked | — | |
| E-06-T3 | **Store-credit refund lands on the balance.** Refund to the Customer's account; the A/R balance moves by the refund and M-03's tender column shows it in the paying-on direction. | 5 | E-07 decision 4, M-03 decision 14 | As T1 | Walked | — | |
| E-06-T4 | **Re-graded copy is a new InventoryItem.** Route as re-graded with its own grade and price; the titlecard shows a new copy at that grade. | 6 | E-06 step 6 | As T1 | Stale | — | |
| E-06-T5 | **Void refuses while a copy is routed.** Route the copy, then Void — refused; the refusal names routing. | 6; prototype notes | E-06 decision 10, E-05 decision 31 | As T1 | Walked | — | |
| E-06-T6 | **The write-off route is manager-only.** As an Employee, route a returned copy to *written off* with a reason code. The route is gated: the Employee's own initials are refused **by name** — *"… is an Employee — this needs a Manager"* — a Manager authorizes in place, and **both names are recorded**, the Employee's session undisplaced. Routing the same copy back to sellable or re-grading it is **not** gated on the same screen, which is the contrast the row exists to hold. | 6 | A-81, A-28a, E-06 decision 3, E-06 decision 7 | As T1, plus a Manager's initials and an Employee's | Walked | — | |
| E-06-T7 | **A written-off copy is not a sold one.** After the write-off authorized in T6, the copy's status is `written_off` and never `sold`. It leaves on hand as a sold copy does, but it is **not a sale**: it is absent from the Customer's history, which lists sold items only, and nothing that enumerates statuses counts it as still present. Refund and disposition stay independent, so refunding in full and writing the copy off is a valid outcome. | 6 | A-81, E-06 decision 7, E-07 decision 16 | As E-06-T6 | Walked | — | |

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
| M-05-T8 | **A Prepaid balance is outstanding, and never overdue.** A `Prepaid` Supplier carrying one finalized, unsettled Invoice: the supplier row says *prepaid — confirm it* rather than a days figure, the `Overdue` chip and the owed panel's past-due count both exclude it, the ledger row is not tinted late, the aged report puts it in **Not aged** with the total still reconciling, and the track's standing shows no worst-past-due. Settling it is a confirmation pre-filled from the Invoice, not an automatic act. | 3; §"Aging" | M-05 decision 35, M-05 decision 52, E-02 decision 45 | A `Prepaid` Supplier with one outstanding finalized Invoice — the month-of-trading seed's Crate Digger `CD-7719` | Walked | — | |
| M-05-T9 | **A bill that does have a due date is still chased.** The other half of T8, so the no-due-date gate cannot be satisfied by calling nothing overdue: a `Net 30` Invoice past its due date counts in the `Overdue` chip, tints late, lands in the `1–30 days` bucket and sets worst-past-due; one not yet due sits in **Not yet due** and is not chased. | 3; §"Aging" | M-05 decision 52, E-02 decision 45 | A `Net 30` Invoice past due and one not yet due — the same seed's F.A.B. `55198` and `55310` | Walked | — | |

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

Steps in [M-08](../flows/M-08-general-ledger.md). **Walked against the prototype on 2026-09-17**, which now
has `/ledger` — five phases on six `src/lib/ledger*.ts` modules ([prototype](../prototype.md)). The product has
no code, so every row stays `Planned` there. **Placed by A-80 on 2026-09-18 as milestone M8**, immediately after M7 — the
last milestone with the v1 two-track shape. M-08 arrived after the build order was written and had been in
no milestone since; A-79 had already moved [M-07](../flows/M-07-chart-of-accounts.md)'s *tables* forward,
and A-80 places this flow.

**Ten rows walked, two blocked, nine planned, one not modelled** — the counts moved twice after this walk: T8, T10, T12, T14 and T15 came off `Blocked` as their gaps were built or their decisions settled, T6 came off `Stale` when d42 replaced the decision it cited, and **six rows were added on 2026-09-18** (T17–T22) for decisions that had none. The two still blocked are T7 and T9, and neither is code: T7's act has no screen path by design, and T9 needs a sealed December. A row is `Walked` only where **every** assertion in it was
exercised; one clause that could not be reached makes the row `Blocked`, because a column that reads `Walked` on a
partial run stops meaning anything. What blocks each is recorded below the table — three are unbuilt behaviour, two
are unreachable from the seed's clock, one is a setup the spec makes impossible to create, and one is the open
question [M-08](../flows/M-08-general-ledger.md) records against decision 25.

*The walk was driven with a real browser against the running prototype rather than with `playwright-cli`, which is
not installed — so there is **no recording artifact**, which the `/qa walk` procedure otherwise expects.*

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-08-T1 | **The opening position is typed from paper, balances by construction, and seals once.** Name the first day the books start — **any day** (decision 35), and the position dates itself the day before. Inventory arrives **supplied by the system** — on hand × cost — not typed; type bank, loans and the paper-era payables lump into *Accounts payable — opening*, never into *Accounts payable*. **Equity is not typed**: it is shown as the figure that balances assets against liabilities, so the position cannot fail to balance. Type the accountant's own equity figure into the read-back: a difference is displayed and must be acknowledged before the seal, and the typed figure is discarded. **Nothing else is offered either** — the customer side (decision 8), the **gift card liability** (decision 33), revenue and expense (decision 9) and **Suspense**, which has no paper figure **`Stale` 2026-09-18 — [M-08](../flows/M-08-general-ledger.md) decision 44 amends step 3:** the supplied figure is on-hand **as at the opening position's own date**, not as at the moment it is drawn, and it reports how many copies it could not date. The row asserts the earlier reading and would keep passing against behaviour d44 retired. Note it cites no superseded *decision* — d44 amended the **step**, which is why this needed reading rather than a citation check. | 1–8 | M-08 decision 6, M-08 decision 7, M-08 decision 8, M-08 decision 9, M-08 decision 26, M-08 decision 28, M-08 decision 33, M-08 decision 35, M-08 decision 44, A-78 | A chart (M-07-T1), stock on hand with costs, and an accountant's closing balance sheet. **No seed exists for the last of these** | Stale | Planned |  |
| M-08-T2 | **The opening position is retypeable until the first real seal, and never after.** Unseal and retype it while no period has been sealed. Seal a month. Try again: refused, and the refusal says why — the correction route is a dated posting like any other. | 8 | M-08 decision 6 | M-08-T1 | Walked | Planned |  |
| M-08-T3 | **The customer side opens empty, and a paper credit note is rung as a discount.** No customer balance is migrated. Present a pre-migration paper credit at the till: rung as a discount, no Customer created and no balance issued — and the month shows revenue low and discounts high, with the copy's cost still posted. | 6 | M-08 decision 8, E-07 decision 22 | M-08-T1, a sellable copy | Planned | Planned |  |
| M-08-T4 | **A typed posting is manager-only, must balance, and cannot reach the accounts the system keeps.** Reached without a Manager: refused. Save unbalanced: refused, naming the amount still needed and which side — it does **not** go to Suspense. **Not offered:** *retained earnings* and *Accounts payable* (decision 13), the **gift card liability** (decision 33), **`customer-credit` and `undeposited`** (decision 38), and **Suspense** (decision 14). **Offered:** *Inventory*, because a dead-stock write-down is exactly where book value should leave the shelf, and **tax collected and tax paid**, because nothing in this system remits tax (decision 34). The list is decision 32's test, not an enumeration — assert the test by trying an account on each side of it | 9–15 | M-08 decision 10, M-08 decision 13, M-08 decision 14, M-08 decision 32, M-08 decision 33, M-08 decision 34, M-08 decision 38, A-74 | A chart, an open period | Walked | Planned |  |
| M-08-T5 | **A typed posting carries its dimensions and its date is bounded at both ends.** Post rent: the line carries a **location** (required, the Store) and no **section** (blank means *not applicable*). Date it inside a sealed period: refused. Date it before the opening position: refused. Date it in the future: **permitted**. | 10–11 | M-08 decision 2, M-08 decision 11, M-08 decision 12, M-08 decision 27, A-72, A-73 | M-08-T1, one sealed period | Walked | Planned |  |
| M-08-T6 | **Sealing reports every failure without sealing, and a Suspense balance is carried rather than blocking.** Leave an invalid account, section or location code in the period: the seal reports it and seals nothing. Fix, re-run, seal: the closing transaction carries balance-forwards. **A period carrying Suspense seals anyway** (decision 42) — the seal **reports the total gross**, short three dollars on one date and over three on another reporting six rather than zero, and names the **override** that would clear it first (decisions 14, 39). *This row has asserted three answers:* decision 15 carried it, decision 40 refused it once decision 14 gave a route, and decision 42 restored the carry after the reference model turned out to permit exactly that | 16–20 | M-08 decision 20, M-08 decision 39, M-08 decision 42, M-07 decision 10, M-07 decision 25, A-75, A-76 | A period with postings, and a journal forced to Suspense | Planned | Planned |  |
| M-08-T7 | **A second seal of the same period is unrepresentable.** Seal a month. Seal it again: refused — not by a check someone remembered but because a live seal is unique per period. The balance-forwards are not doubled. | 16–20 | M-08 decision 20, A-75 | M-08-T6 | Blocked | Planned |  |
| M-08-T8 | **A year-end seal writes visible closing postings.** Seal the period that ends the fiscal year M-06 configured. Revenue and expense are zeroed into retained earnings by **real journal lines** dated the last day of the year and identifiable as the seal's — not by a rule about how balance-forwards are computed. | 21 | M-08 decision 5, M-08 decision 17, M-06 decision 64 | M-08-T6, a fiscal year end set | Walked | Planned |  |
| M-08-T9 | **Unsealing reaches the most recent period only, repeats to walk back, and stops at a filed year.** Unseal the latest sealed month: authorized, with a reason required and recorded. Reach an older month: unseal each in turn. Mark a year **filed**, then try to unseal into it: refused, and the refusal names what is holding it. | 22–23 | M-08 decision 18, M-08 decision 22, M-08 decision 29 | Three sealed months and one sealed year | Blocked | Planned |  |
| M-08-T10 | **Nothing writes into a sealed period, by any route.** With a day inside a sealed period, run M-03's **Undo End of Day** — the one reversal in this system that does not post forward: refused while the period is sealed, released when it is unsealed, and never released for a day inside a **filed** year. | 22–23 | M-08 decision 11, M-08 decision 22, M-08 decision 29, M-03 decision 4, A-66 | M-08-T9, a closed CloseBatch inside a sealed month | Walked | Planned |  |
| M-08-T11 | **An account reads back as balance forward · activity · new balance forward, filtered by dimension.** Pick an account and a range: three figures and every line behind them. Narrow by **section**: the same query, fewer lines. The middle term is true with no opening position and no seal — the other two are not. | 24 | M-08 decision 2, M-08 decision 20, M-08 decision 24 | A sealed month and an open one | Walked | Planned |  |
| M-08-T12 | ~~**The books state a profit, and the balance sheet balances.**~~ **Struck 2026-09-18.** One row carried three claims of different standing, and holding it at `Walked` hid that the middle one does not hold: re-walked against a seeded month of trading, the sheet is **out of balance by 95.50**, which the screen names rather than conceals. Replaced by **M-08-T23** — the profit and the derived earnings line, which do hold — and **M-08-T24**, the sheet balancing and the customer classification, which cannot be stated while [M-08](../flows/M-08-general-ledger.md)'s *two sources* question stands. | 25 | M-08 decision 23, M-08 decision 24, M-08 decision 25, M-08 decision 36, E-07 decision 21, M-07 decision 27 | M-08-T6, one customer in credit and one owing | — | — |  |
| M-08-T13 | **A statement excludes lines dated after its as-at date, and every statement answers the same way.** Post a future-dated entry. Draw a balance sheet as at today: absent. Draw the P&L for the period: absent. Draw both again once its date has arrived: present. | 24–25 | M-08 decision 30, A-73 | M-08-T5's future-dated posting | Walked | Planned |  |
| M-08-T14 | **Issuing stores the figures, and re-opening shows what was issued.** Issue a balance sheet. Re-open the stored issuance: **the figures as issued**, never a recomputation. **Then seal the period and re-open it again: it still reads *provisional*** (decision 36), where the live statement no longer does — which is the whole of why the mark is stored rather than rendered. Export a journal range, then an overlapping one: warned, proceeds. An **adjacent** range is not warned, because the bounds are half-open | 26 | M-08 decision 25, M-08 decision 31, M-08 decision 36, M-07 decision 16, A-77 | M-08-T12 | Walked | Planned |  |
| M-08-T15 | **Reconciling comes in two kinds, both reach zero, and neither moves money or gates anything.** A **matched** set pairs entries within one account that cancel — the two halves of an undeposited-funds movement — and is balance-neutral by construction (decisions 25, 37). A **cleared** set takes the bank statement's **opening and closing balance** and marks entries until the difference between them reaches zero (decision 43); what stays unmarked is the **outstanding list**, which is the output. Try the bank account as a *matched* set: refused, and the refusal names the other kind. No balance moves either way. Seal the period with another account left unreconciled: it seals — the mark is evidence, never a gate | 27 | M-08 decision 25, M-08 decision 37, M-08 decision 43 | A bank account with entries, and a statement to reconcile against | Planned | Planned |  |
| M-08-T16 | **A foreign payable nets Accounts payable to zero across finalize and payment.** Finalize a USD Invoice: it books in the **home** currency at the rate recorded on the Invoice. Settle it, confirming what actually left the bank. **A/P nets to zero across the two journals** and the movement lands in *Exchange gain or loss*. The defect this exists to catch balanced inside each journal separately, so only a scenario spanning both artifacts can see it. | 9–15 | M-06 decision 59, M-06 decision 60, M-07 decision 8 | A USD Supplier, a rate, and a finalized Invoice in that currency | — | Planned |  |
| M-08-T17 | **A typed posting is editable until its period is sealed; a system-written line never is.** Type a posting, change an amount on it: the edit lands and **appends the values before and after** with both names, rather than overwriting. Seal the period and try again: refused, and the refusal names the forward route. Then find a line an **artifact** wrote — a close, an Invoice — and look for an edit: there is none at any point in its life, because A-67 puts it in the same transaction as its artifact and editing it is the divergence A-67 exists to prevent. **Not walkable 2026-09-18, and it stays `Planned` rather than `Walked`.** d3's rule is built and held — `editRefusal` and `applyEdit` in `prototype/src/lib/ledgerPostings.ts:550,569`, with 57 passing unit tests in `ledgerPostings.test.ts` — but **neither `Ledger.tsx` nor `AppStore.tsx` references either function**, and the *typed so far* list renders plain rows with no edit affordance. There is nothing to drive: the append of before-and-after with both names, the sealed-period refusal and the never-editable artifact line are all unreachable through the screen. Same shape as M-08-T24 — the model does it, the surface does not show it. | 9–15 | M-08 decision 3, M-07 decision 8, A-52, A-67, A-74 | M-08-T5, one sealed period and one open | Planned | Planned |  |
| M-08-T18 | **The override opens one named account for one posting, and refuses the accounts that mirror a ledger.** Post to **Suspense** with no override: refused. Add an override with a blank reason: refused. Give it a reason: it saves, and the posting appears on the **exception report** carrying that reason and the authorising Manager. Now touch **two** locked accounts with one override: the second is still refused — **no blanket unlock**, because *why* differs per account. Then try an override of ***Accounts payable***, `customer-credit` or the gift card liability: refused, because a control account mirrors a subledger and a difference there is **an error to find, not one to post over** (decision 41). **Walked 2026-09-18.** Suspense with no override refused, naming d14; the override section is *one account, one reason*, and a **second** locked account on the same posting raises its **own** WHY field rather than riding the first — d39's *no blanket unlock*, seen. With a reason it saves and the exception report reads `2026-09-10 · Suspense · <the reason> · Y. Nakamura (Manager)`. | 9–15 | M-08 decision 14, M-08 decision 39, M-08 decision 41, M-07 decision 10, A-74 | A chart, an open period, a Suspense balance | Walked | Planned |  |
| M-08-T19 | **Remitting sales tax is two ordinary postings, and the system neither helps nor refuses.** Read the quarter's tax collected off [M-03](../flows/M-03-daily-summary.md)'s report, then post it: debit *tax collected*, credit the bank. It is accepted — the tax accounts are **offered**, because nothing in this system models a remittance and locking them would leave the liability growing every quarter forever (decision 34). **Nothing checks the figure against M-03 and nothing notices a quarter nobody remitted**, which is the exposure decision 34 accepts by name. **Walked 2026-09-18.** Debit *GST collected* 412.50, credit Chequing: accepted, **no override demanded and no WHY field raised**, which is d34's point — nothing here models a remittance, so locking the account would leave the liability growing forever. | 9–15 | M-08 decision 19, M-08 decision 32, M-08 decision 34, M-07 decision 5 | A period with tax collected through the till | Walked | Planned |  |
| M-08-T20 | **A statement's provisional mark is stored, so it survives the seal that would have removed it.** Draw a P&L over an unsealed period: **provisional**. Issue it. Seal the period. Draw the statement again: **not** provisional. Re-open the stored issuance: **still provisional**, because it records what was true when it left the building rather than what is true now. A rendered label would have vanished here, and the record of what the accountant holds would have quietly changed — which is the whole argument for storing it. An **export** whose range touches an unsealed period is marked the same way. **Walked 2026-09-18, and it is the sharpest of the six.** P&L over unsealed 2026-09 drew **provisional**; issued; sealed 07, 08 and 09; the live statement redrew **without** the mark while the stored issuance kept it, and re-opening says so in its own words — *"a mark it keeps even once its period seals, because it says what was true when it left (d36)"*. **One divergence, filed below: the issuance stores an empty range.** | 25–26 | M-08 decision 31, M-08 decision 36, A-77 | M-08-T12, one period sealable during the row | Walked | Planned |  |
| M-08-T21 | **An accrual is two ordinary postings, and nothing prevents one.** Post an estimate dated the last day of the month; post its reversal dated the first of the next. Both are accepted and the pair nets to nothing. **No posting can be marked to auto-reverse**, and there is no second kind of posting to explain — decision 19 declined the *machinery* and not the act, so what this row asserts is the **absence** of a feature alongside the presence of the outcome. **Walked 2026-09-18.** Estimate dated 2026-09-30 and its reversal dated 2026-10-01 both accepted as ordinary postings, and **no auto-reverse, recurring or scheduling affordance exists anywhere on the surface** — d19 declined the machinery and not the act, which is exactly what the screen shows. | 9–15 | M-08 decision 19 | An open period spanning a month boundary | Walked | Planned |  |
| M-08-T22 | **A period is *sealed*; nothing a Manager reads calls it *closed*.** Walk every ledger surface that names the act — the seal, its refusals, the unseal, the *filed* mark — and assert the word **close** appears nowhere, while [M-03](../flows/M-03-daily-summary.md)'s day close still calls itself that on the till. Decision 4's accepted consequence is that *"the word a bookkeeper would reach for first is the one word this flow may not use, so every screen has to teach it"*, and this is the row that holds it — the two acts differ in scope, frequency, actor and reversibility, and decision 42 turns on the distinction. **Walked 2026-09-18 — substance holds, the row's own wording does not.** No ledger surface names the act a close, and M-03's till still says *day close*. But *assert the word close appears nowhere* is too strong and fails on three benign counts: the standing sentence that draws the distinction (*"A period is sealed, never closed — close is the end of the day"*), the heading *Phase 3 — never close*, and **the re-opened issuance's dismiss control, which is labelled `close`** — the one a Manager actually reads as a control rather than as prose. Reconcile also says *closing date*, which is the bank statement's, a different sense. **Narrow the row to *no ledger surface names the act a close*** before automating it, or it will fail on its own explanation. | 16–23 | M-08 decision 4, M-08 decision 42, M-07 decision 10, M-03 decision 1 | One sealable period, and a day to close at the till | Walked | Planned |  |
| M-08-T23 | **The books state a profit, and current earnings is named rather than folded in.** Draw a P&L for a **sealed** period: it has a bottom line and it is called a profit. Draw a balance sheet as at its end: equity carries **current earnings derived at the moment it is drawn**, named as its own line rather than folded into a total. A statement over a sealed period carries **no provisional mark**; one drawn over an unsealed period does (decision 36). Replaces the half of M-08-T12 that holds. | 25 | M-08 decision 23, M-08 decision 24, M-08 decision 36, M-07 decision 27 | A sealed month with trading in it | Walked | Planned |  |
| M-08-T24 | **The balance sheet balances, and the customer side is classified by sign and never netted.** Store credit totals into liabilities, unpaid customer invoices into assets, the two are never added together, and the sheet balances. Replaces the other half of M-08-T12. **`Blocked`, on two counts.** First the open question [M-08](../flows/M-08-general-ledger.md) owns — *"A Customer's balance has two sources and nothing ties them"*: [E-07](../flows/E-07-manage-customers.md) decision 5 derives a balance from movements while the `customer-credit` account is written by the artifacts those movements cause, and where they disagree **the sheet cannot balance**. Against the seed it is out by 95.50. Second, and separately, the classification is **not observable end to end**: `Ledger.tsx` renders `totalAssets` and `totalLiabilities` and maps only the equity lines, so the two customer lines the model does produce are never drawn. Both halves are held below end-to-end meanwhile — `prototype/src/lib/ledgerStatements.test.ts:230` for the classification, `:542` for the divergence. | 25 | M-08 decision 25, E-07 decision 21 | One Customer in credit and one owing **with a journal behind each** — **no such seed exists**, and that is the point: the seeded balances of 25.00 and -120.50 are asserted with no artifact that produced them, which is what makes the divergence visible | Blocked | Planned |  |

#### Walking T17–T22 on 2026-09-18 — two findings

- **A P&L issuance stores an empty range.** `Ledger.tsx:1011` builds the issuance scope as
  `{ kind: "range", from, toExclusive: `${period}-01` }`, and `from` is `${period}-01` too
  (`Ledger.tsx:870`) — so a statement covering the whole of September is stored as
  **2026-09-01 → 2026-09-01**, which covers no days at all, and the issuance list renders it that way.
  The figures are right; only the stored scope is wrong, so the statement misstates **the period it
  covers** — which step 25 requires it to state, because decision 9 makes the first year a short one.
  A balance-sheet issuance is unaffected: its scope is `as-at`, a single date.
  **Fixed the same day** — `periodRange` in `prototype/src/lib/ledgerPeriods.ts`, with tests, and
  `Ledger.tsx` now calls it. ~~*Route:* a prototype fix citing d31 and M-07 d16.~~
  **One half of this finding was wrong when first filed, and is corrected here.** It claimed the empty
  range also defeated the overlap warning **M-08-T14** asserts. It did not: `exportOverlaps`
  (`ledgerStatements.ts:560`) filters `kind === "journal-export"`, so a P&L issuance was never one of
  the things it compares. **The reader that *was* defeated is `issuancesTouching`**
  (`ledgerStatements.ts:578`) — A-77's other reader, which warns an unseal about **any** issuance
  touching the period, whatever its kind, *"because an unseal changes figures the accountant may
  already hold (d29, d18)"*. Its range test is `i.scope.from <= to && from < i.scope.toExclusive`, and
  an empty range fails the second half, so an issued P&L did not count as touching its own month. The
  fix restores that. **It is not visible yet either way:** `issuancesTouching` is referenced by nothing
  but its own tests — not by `Ledger.tsx`, not by `AppStore.tsx` — so the unseal warns about nothing at
  all. That is the third instance of one pattern, beside M-08-T17's edit and M-08-T24's classification:
  **the rule is built in `lib` and no surface reads it.**
- **The Postings panel's helper text describes the pre-d39 shape.** It still reads *"Not offered:
  retained earnings and Accounts payable (d13), the gift card liability (d33) and Suspense (d14, not
  ratified)"* while **Suspense is offered**, carries its own WHY field, and saves with a reason. d39
  moved the lock from the picker to the write path and the explanation beside it did not follow. The
  behaviour is right and its description is stale, which is the more misleading way round.

#### The six rows added on 2026-09-18

T17–T22 cover decision 3's editability, decision 39 and 41's override, decision 34's typed remittance,
decision 36's stored provisional mark, decision 19's hand-made accrual, and decision 4's reserved word.

**Every one is `Planned`, and several were exercised while the code was built.** The override was driven
end to end on 2026-09-17 and the provisional mark was watched surviving a seal — but a row is `Walked`
when *the row's* steps are driven against *the row's* preconditions, and these rows did not exist then.
Recorded as `Planned` rather than claimed.

#### Decisions with no row, deliberately

**One, and it is d1** — the split from [M-07](../flows/M-07-chart-of-accounts.md). A statement about which
document owns what; there is no behaviour to drive. **The other 38 live decisions all have one**, which is
what `M-08 decision <n>` grepped against the flow's table now shows.

**decision 32** is cited rather than owned: it is the **test** behind d13 rather than a rule of its own, so
it is asserted wherever the test is applied — M-08-T4 tries an account on each side of it, M-08-T18 its
override half, M-08-T19 the case that turned it around. **decisions 12, 27 and 35** are likewise carried
inside M-08-T5 and M-08-T1 rather than given rows, because none is a scenario on its own.

Struck decisions keep no row: **15**, **16**, **21** and **40**. M-08-T6 cited d15 and was `Stale`; it now
asserts **d42**, which restored d15's outcome on different grounds.

#### What the walk of 2026-09-17 found

**Blocked, and why.** Each is a fact about the prototype or the spec, not a judgement of either.

- **M-08-T6 — the setup the row asks for cannot be created.** *"Leave an unbalanced posting… in the
  period"*: [M-08](../flows/M-08-general-ledger.md) d10 refuses an unbalanced posting at write time, so one
  can never be left anywhere, and no ledger surface can create a Suspense line because
  [M-07](../flows/M-07-chart-of-accounts.md) d10 says no Manager action can. **The row describes a state its
  own decisions make unreachable.** The seal's reporting is real and is untested by this route. *Route:*
  `/flow-clarify` — how a Suspense line is ever staged for a test.
- **M-08-T7 — no screen path.** *Seal a period* offers only the **oldest unsealed** month (step 16), so a
  sealed period is never offered and the second seal has no button to press. The refusal exists in
  `sealRefusal` and is unit-tested; the prototype cannot show it, and cannot show A-75's *unrepresentable* at
  all, which needs the partial unique index. *Route:* nothing — the prototype is not the target for A-75.
- ~~**M-08-T8 — not built.**~~ — **Built and walked on 2026-09-17.** d17's visible closing postings are
  written by `yearEndClosingBatch`, and the seal writes them **before** it recomputes balance-forwards, because
  the zeroing is dated the last day of the year and therefore falls inside the period being sealed. Walked with
  books opening 1 November 2025: rent of 1,500 posted in November reads *activity 1,500, new balance forward
  1,500*; December reads *balance forward 1,500, activity −1,500, new balance forward 0.00*, carrying one line
  dated 2025-12-31 reading *"Year-end seal 2025-12 — closing Rent into retained earnings"*, with retained
  earnings taking the other side as *"the year's result"*. **The earlier finding that this was unreachable from
  the seed's clock was wrong** — a year end is reachable whenever the books open before the last December.
- **M-08-T9 — two thirds walked.** The unseal with a required reason, and walking back, both hold and are
  recorded. The **filed year** third needs a sealed December, which the seed's clock cannot reach. *Route:*
  the same clock problem as T8.
- ~~**M-08-T10 — built, not walked.**~~ — **Walked on 2026-09-17**, once the fixture was built: opened a
  session as E. Okafor, rang and tendered a sale, ran *Total Today's Sales* to produce `batch-103` dated
  2026-09-17, then sealed August and September from the ledger. Back at the till the Undo button was
  **disabled**, carrying *"2026-09 is sealed, so 2026-09-17 cannot be restated. An Undo End of Day reaches back
  and rewrites the day rather than posting forward, which is the one thing a seal refuses (M-08 d11). Unseal
  2026-09 first."* Unsealing 2026-09 with d18's required reason **released it**: the caveat disappeared and the
  button went live. The third clause — never released inside a **filed** year — is not walked and needs no
  separate mechanism: d22 keeps a filed year sealed, so the same check refuses, and a unit test covers it.
- ~~**M-08-T12 — one clause unexercised.**~~ — ~~**Walked on 2026-09-17.** The screen now passes each
  Customer's signed balance, so [E-07](../flows/E-07-manage-customers.md) d21's *classified by sign, never
  netted* is exercised: the seed's customers read **120.50 into assets and 25.00 into liabilities**, never a
  net.~~ **Overstated, corrected 2026-09-18.** The *model* classifies and is unit-tested; the **screen** does
  not draw it. `Ledger.tsx` renders `totalAssets` and `totalLiabilities` and maps only the equity lines, so
  those two figures are computed and never shown — they could not have been read off a walk. The row has since
  been struck and split into **M-08-T17** and **M-08-T18**. *What it surfaced is below, and still stands.*
- ~~**M-08-T14 — two thirds not built.**~~ — **Walked on 2026-09-17.** Re-opening a stored issuance shows the
  figures as issued and recomputes nothing (d31), and the journal export is on the screen with
  [M-07](../flows/M-07-chart-of-accounts.md) d16's overlap warning. Walked: exported 1–30 September, then a
  range overlapping it — *"1 earlier export already covered part of this range"*, and **the Export button
  stayed enabled**, because A-28a warns rather than refusing. Then an adjacent range, 1 October to 1 November:
  **no warning**, because the bounds are half-open and two neighbours cannot both claim the boundary day.
- ~~**M-08-T15 — the row asks for what the rule refuses.**~~ — **Resolved by decision 37 and walked on
  2026-09-17.** A bank statement is a **second kind** of reconciliation. Walked both: three entries in the
  bank account that do not net were **refused as a matched set** — *"out by 6,950.00. A matched set nets to
  zero — mark it as cleared against a statement instead (d37)"* — and **permitted as a cleared set**, stamping
  as `CLEARED · 3 entries`. *The row itself now needs rewriting:* it says *"until the difference is zero"*,
  which is the matched rule, and a bank statement is the case that does not.

**Two divergences on rows that did walk.**

- **M-08-T2 — there is no *unseal* act for the opening position.** d6 says it *"can be unsealed and
  retyped"*; the prototype instead leaves the form **editable** while the window is open and locks it when the
  window shuts. The observable behaviour matches d6's intent and the refusal wording is right. What is missing
  is the deliberate act, which everywhere else in this flow is an artifact with an actor — d18's unseal,
  d22's filing. **d6 says *unsealed* without saying an unseal is recorded**, so this is a question for
  `/flow-clarify`, not a defect.
- **M-08-T5 — the lower bound fires before the sealed-period bound.** Dating a posting 2026-09-10 against
  books that start 2026-09-17 reports *"the books start after 2026-09-16"* rather than *"2026-09 is sealed"*.
  Both are [architecture](../architecture.md) A-73 bounds and both are correct; the row reads as though the
  sealed case is the one a Manager meets first. Cosmetic, and worth knowing when the row is automated.

**A new open question, surfaced by fixing M-08-T12.** A Customer's balance has **two sources**:
[E-07](../flows/E-07-manage-customers.md) d5 derives it from movements, and the `customer-credit` account is
written by the artifacts those movements cause. **Nothing ties them**, and in the prototype they disagree by
95.50 on the seed alone. That is A-76's *two paths to one figure* in a second place, and A-76's answer —
*stored is by definition the last recomputed* — does not transfer, because neither of these is a
materialisation of the other. The balance sheet now **names the difference** rather than showing a sheet that
is merely out of balance, which is an inference and not a recorded decision. Owner: `/flow-clarify`, or
`/architecture` if the answer is structural.

#### Stale — decision 15 superseded

**M-08-T6: Blocked/Planned → `Stale` on both targets.** It is the only row citing [M-08](../flows/M-08-general-ledger.md) d15, and d40 supersedes it: a non-zero Suspense balance now **refuses** the seal rather than riding along on the closing transaction. The row asserted the old rule in its own title. Rewriting it is `/qa register M-08` work, and the rewrite has more to assert than the original did — the refusal, the gross total, the override that clears it, and that **M-03's day close is untouched**.

#### Rows that need rewriting against decisions 32 to 36

Seven decisions landed after these rows were written. Most add coverage the rows do not yet claim.
**One is not like the others:** d37 **amends d25**, and M-08-T15 asserts the premise it retired, so that
row went `Stale` on 2026-09-18 rather than merely wanting more citations. The blanket *none is superseded*
this heading used to carry was written about d32-d36 and never revisited when d37 landed.

- **M-08-T1** — add that the **gift card liability** (d33) and **Suspense** are not offered either, beside the
  four accounts it names; and that the first day is **any day** (d35), which retires the guess the row was
  written under.
- **M-08-T4** — add **d33**, and **d32**, the test behind the whole list. The row's *"cannot reach the
  accounts the system keeps"* is now a principle rather than an enumeration, so the row should assert the
  principle's other half too: **the tax accounts are offered** (d34).
- ~~**M-08-T12** — add **d36**: a statement over an unsealed period is marked **provisional**.~~ — **Done 2026-09-18**, in **M-08-T17**, which replaced the half of T12 that holds.
- **M-08-T15** — rewritten for **d37**: it asks for entries *"until the difference is zero"*, which is the
  **matched** rule, against a **bank account**, which is the case that does not net. The row should assert
  both kinds and which one a bank statement is.
- **M-08-T4** — also **d38**: `customer-credit` and `undeposited` are no longer offered.
- **E-06 walked end to end on 2026-09-18** — T1–T7, prototype, port 5288, as E. Okafor (Employee) with Y. Nakamura and R. Delacroix as the Managers. Driven with the in-app browser rather than `playwright-cli`, which is not installed here, so **there is no recording to hand to `/qa automate`** — the first automate pass re-drives it. **Five rows conform outright: T2, T5, T6, T7**, and **T1 conforms but for its link default** (below). **Two findings and one gap:**
  - **T1 — a matchable prior Sale is offered but not selected.** [E-06](../flows/E-06-process-a-return.md) step 3 reads *"the line **is** linked to that original Sale"*; the prototype offers `#100389 · Ramona Vasquez` in the dropdown and leaves **"No link"** selected. The mechanism is right — choosing the link flips the refund default to the linked line price ([E-06](../flows/E-06-process-a-return.md) decision 5) and the field's own label with it. **The cost is money:** the copy sold for **$31.49** after a 10% discount and the unlinked default refunds its current price, **$34.99**. An Employee who accepts the default over-refunds by $3.50 and loses the Customer-history link, with nothing on screen saying a match existed. *Route:* the user — either the prototype selects a sole unambiguous match, or step 3 is reworded to *offered*.
  - **T4 — the row asserts more than the flow says.** The row is titled *"Re-graded copy is a **new** InventoryItem"*, and the prototype **re-grades the copy in place**: barcode `200000001236` stayed itself and became VG at $15.00. Step 6 says only that the copy *"is taken in as an InventoryItem carrying its own Goldmine grade and its own price"*, which the in-place reading satisfies. **So this is not a divergence of the target — it is a row that encoded an interpretation the flow never made**, and [A-81](../architecture.md) raises the stakes: whether the returned copy keeps its identity decides its movement chain and whether its [A-45](../architecture.md) provenance carries across. *Route:* `/flow-clarify E-06` to settle identity, then correct or keep the row. **T4 is `Walked` on what step 6 actually says.**
  - **T3 is half-walked.** [E-07](../flows/E-07-manage-customers.md) decision 4 confirmed — the refund moved Ramona Vasquez's balance **$25.00 → $52.59**, `CREDIT`, the direction d4 signs as the store owing more. **[M-03](../flows/M-03-daily-summary.md) decision 14's tender column was not reached**: the walk ran the day close before reading the breakdown and the pre-close state was gone. Recorded rather than inferred; it wants a pass with [M-03](../flows/M-03-daily-summary.md).
  - **Not walked: the password branch of the manager-only gate.** Y. Nakamura (no password) authorized the write-off and both names landed in the log. R. Delacroix resolved and was correctly asked for a password, but the driver could not get keystrokes into that field, so **neither the wrong-password refusal nor the right-password pass was observed**. The copy stayed unrouted throughout, which is the gate holding, but the branch itself is unasserted. It is [E-01](../flows/E-01-authenticate.md) decision 21's ground more than E-06's.
  - *Noted, not a finding:* T6 and T7 were written and fixed by the same session that walked them (#120). They want a second pair of eyes before they are trusted as independent evidence.
- **Both walk findings were settled by `/flow-clarify E-06` the same day, and both went **against** the prototype.**
  - **The link default is now a rule.** [E-06](../flows/E-06-process-a-return.md) **decision 14** — a sole matching prior
    Sale for the attached Customer is **preselected**, not merely offered. The prototype offers and leaves *No link*
    selected, so it now **fails a live decision** rather than reading an ambiguous step. **E-06-T1 is not `Stale`** — it
    cites decisions 11 and 12, both untouched — but the defect it surfaced is real and wants a prototype fix.
  - **Re-grade mints, and the row was right all along.** **Decision 15** settles that re-grading mints a **new**
    InventoryItem and leaves the sold copy sold at the grade it sold at, which is exactly what **E-06-T4** asserted
    ahead of the decision. The prototype re-grades **in place**, so the target is what diverges. **E-06-T4 goes `Stale`**:
    step 6 was amended under it, so the walk's *conforms* verdict predates the rule it is now judged against.
  - **Decisions 14-18 have no rows.** 14 (link preselected), 15 (mint), 16 (cost is the refund), 17 (arrival dated at
    re-grade, dead-stock clock restarts), 18 (barcode now, label later). *Route:* `/qa register E-06`.
  - **The hole decision 16 left is closed.** It put the **refund** on the new copy while [M-07](../flows/M-07-chart-of-accounts.md)
    decision 2 posts the **original** cost back to Inventory — $8.00 against a copy valued at $31.49. **[architecture](../architecture.md)
    A-82 supersedes d16** with **E-06 decision 19**: the minted copy is assessed against its new grade and **capped at the sold copy's
    cost**, with any shortfall posting to its [E-04](../flows/E-04-manage-inventory.md) reason code. Rows may now assert a figure.
    **No row went `Stale` for d16** — it was appended and superseded the same day and nothing had cited it yet.

- ~~**Two rows are wanted for A-81.**~~ — **Done 2026-09-18.** (1) became **E-06-T6**, the write-off route's manager-only gate, and (2) became **E-04-T7**, an adjustment naming the copies it moved. **E-04-T4 did not go `Stale`** and neither did E-06-T1 or T4: A-81 extends A-28a rather than retiring it — *"Manager-only is unchanged"* ([architecture](../architecture.md) §2 A-28a) — and it leaves step 6's other two dispositions ungated in terms. **A third row was added beyond the note: E-06-T7**, for A-81's fourth status. `written_off` is a separate commitment from the gate and fails separately — a copy can be correctly gated and still stored as `sold` — and [architecture](../architecture.md) §5.1 warns that a query enumerating statuses from memory counts a written-off copy as present. **The prototype conforms to none of the three today**, which is a finding against the target and not a status on the rows.
- **A new row is wanted for d45** — the mirror of **d30**: a statement excludes lines dated **before the books open** and names how many it excluded and which was first, exactly as M-08-T13 asserts for lines dated after an as-at date. Nothing covers the backward edge today. *Route:* `/qa register M-08`.
- **M-08-T14** — add **d36**'s sharper half, that a **stored issuance keeps its provisional mark after its
  period seals** where the live statement drops it. That is the assertion distinguishing storing the mark from
  rendering it, and it has no row anywhere.

**Two decisions have no row at all.** **d34** — tax collected and tax paid stay typeable because nothing in
this system remits tax — is live, carries a stated operational exposure, and no scenario asserts it. **d36** is
covered only as a clause above. Both want rows appended by `/qa register M-08`.

---

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
| M4 Till | E-05-T1–T3, T5–T16, E-06-T1–T7, E-07-T1–T7, E-04-T2, E-04-T4, E-04-T7, M-06-T1, T2, T4, T11 |
| M5 Close, receipts, review | M-03-T1–T5, M-04-T7 *(acknowledge)* |
| M6 Hardening | Every row above, run as one seeded trading day |
| M7 Payables (A-39) | M-05-T1–T9, E-02-T9, M-01-T4, **M-08-T16** *(A-80 — it asserts no M-08 decision and runs here)* |
| M8 The general ledger (A-80) | M-08-T1–T15, T17–T22. **Placed on 2026-09-18** by A-80, immediately after M7 and the last milestone with the v1 two-track shape — d7's payoff, *the Accounts payable balance **is** M-05's balance*, is not checkable until payables exists. **M-08-T16 belongs to M7 and not here**: it asserts M-06 d59, d60 and M-07 d8 and **no M-08 decision at all**, so it bounds when the row runs rather than what M8 builds |
| Post-v1, in §8's order | M-02-T1–T10 → M-04-T1–T6 *(Add and Deactivate first, M-04 decision 21)* → M-06-T3, T5–T7, T9, T10, T12 *(the settings screens)* → M-07-T1–T7 and M-03-T6 *(the chart **screen** and the journal export — still unplaced. A-79 moved M-07's **tables** into M2 and M3 where A-67 required them, and deliberately left its functions and screens here)* |

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
