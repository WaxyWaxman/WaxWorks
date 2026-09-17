# Wax Works — end-to-end test register

**Status:** Seeded 2026-09-11 — every row is `Planned`; nothing runs yet
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
| E-02-T1 | **Cold intake, New stock, finalize.** Open a new Invoice with no PO behind it, scan three barcoded copies, accept the suggested price on each, reconcile with matching stated figures, finalize. Every line becomes sellable; the letter summary is offered. | 0–8, 10–13, 15–17, 22 | E-02 decision 4 (draft persists and resumes), E-02 decision 9 (`.50`/`.99`), E-02 decision 27 (totals entered by hand), E-02 decision 33 (consignment flag copied at finalize) | A Supplier with a discount; three Records with barcodes in the local catalog | Planned | — | |
| E-02-T2 | **Second-hand intake mints its reference.** Choose Second-hand, leave the invoice number blank, receive one copy with a grade set. Reference is `SH-YYMMDD-n` off the received date; a second blank intake the same day gets `-2`. | 1–3, 8, 14–15, 22 | E-02 decision 39, A-32 | The dedicated second-hand Supplier (E-02 decision 31) | Planned | — | |
| E-02-T3 | **Invoice number is a lookup.** Enter a number matching an existing draft → it resumes. Enter one matching a finalized, unpaid Invoice → it opens as it stands, still editable. | 3–4 | E-02 decision 31, E-02 decision 40, A-33 | One draft and one finalized-unpaid Invoice for the same Supplier | Planned | — | |
| E-02-T4 | **Below-cost price proceeds and flags.** Enter a cost, then accept a sell price below it. The line is added, the row carries a review flag, and the flag is attributable to the Employee. | 10–12 | E-02 decision 35, M-04 decision 8, A-28 | Any barcoded Record | Planned | — | |
| E-02-T5 | **Derived vs. stated mismatch.** Stated subtotal disagrees with the sum of line costs. The discrepancy warning shows as a state on the reconcile track; accepting it finalizes and raises a review flag. | 6, 17–18, 22 | E-02 decision 27, E-02 decision 35 | As T1 | Planned | — | |
| E-02-T6 | **Adjustment past ±2% proceeds and flags.** Adjust the total 3% off the derived figure. Finalize succeeds; the delta is a standalone cost-of-goods line; a review flag is raised. | 17, 21–22 | E-02 decision 35 | As T1 | Planned | — | |
| E-02-T7 | **A scan attaches to the outstanding PO line.** Open an Invoice for a Supplier with a placed PO; scan a barcode matching an outstanding line. The line attaches with its expected cost and quantity; the PO number is snapshotted on the invoice line; What's on Order reads the remainder. | 0, 8–9 | E-02 decision 42, M-02 decision 20, A-34, A-20a | A placed PurchaseOrder with one unreceived line for the Supplier | Planned | — | |
| E-02-T8 | **Partial receipt.** Receive 1 of an ordered 2 and finalize. The line reads "1 of 2", stays on What's on Order as part received, and re-picking it prefills the remainder, not the ordered quantity. | 9–10, 15, 22 | M-02 decision 21, A-35, A-20a | As T7 with quantity 2 | Planned | — | |
| E-02-T9 | **Paid locks the Invoice.** Mark a finalized Invoice paid in M-05, return to Receiving. The scan slab is replaced by the locked band and every field is disabled; a line whose copy sold cannot be removed even before paid. | 19, 23 | E-02 decision 4, E-02 decision 40, A-33 | A finalized Invoice, one of whose copies has been sold | Planned | — | |
| E-02-T10 | **Receiving history search.** Search Invoices by supplier, number, date, title, barcode, and PO number. Each finds the Invoice that took the copy in; a search replaces the bands rather than filtering them. | 0 | E-02 decision 36, E-02 decision 43 | Three finalized Invoices across two Suppliers | Planned | — | |

### E-03 — Search the inventory

Steps in [E-03](../flows/E-03-search-inventory.md). Prototype screen: Search
(`/search`, `/search/:recordId`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-03-T1 | **Four stock states band one list.** Search a term that matches a Record on hand, one on a placed PO, one sold out, and one never stocked. Results band in that order, each row carrying its state and recency stamp; a raised-but-unplaced line does not count as on the way. | 1–5 | E-03 decision 11, E-03 decision 12, E-03 decision 13 | One Record in each state; one with a pending (unplaced) line | Planned | — | |
| E-03-T2 | **Scan short-circuits to resolution.** Scan a manufacturer UPC → the Record's titlecard opens; scan an internal barcode → exactly one InventoryItem. | 1, 6 | E-03 §"Search dimensions" (steps, not a decision) | A Record with a UPC and two copies, one with an internal barcode | Planned | — | |
| E-03-T3 | **Catalog-only row pulls into the local catalog.** Search a title not held; act on the catalog row (Order). The Record is created locally with provider fields filled and store-specific ones prompted. | 5, 7 | E-03 step 7; A-12 | Catalog provider up, with a known title absent locally | Planned | — | |
| E-03-T4 | **Catalog provider down degrades visibly.** With the provider unavailable, the same search returns local results and says the provider is down rather than failing. | 2 | A-1 (writes fail visibly; no offline queue) — *the read-side rule is not cited by a decision; see Open questions* | Provider-down toggle | Planned | — | |

### E-04 — Manage the inventory

Steps in [E-04](../flows/E-04-manage-inventory.md). Prototype: embedded in
Search's titlecard; Supplier Claims at `/claims`.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-04-T1 | **Titlecard is a view of one Record and every copy.** Open a Record from Search; the titlecard shows its copies, derived on-hand, held, and order state, and updates in place when a different Record is selected. | §"The titlecard" | E-04 decision 1 | A Record with three copies at two prices | Planned | — | |
| E-04-T2 | **Reserve creates a Held Sale.** Reserve one copy for a quantity; a Held Sale exists, the copy counts against available but stays on hand. | §"Functions" Reserve | E-05 §"Holds" | A Record with stock on hand | Planned | — | |
| E-04-T3 | **Shelf price below cost flags, does not block.** Edit a copy's price below its cost on the titlecard. The change saves and a ReviewFlag is raised. | §"Pricing outside receiving" | E-04 decision 16, E-02 decision 35 | A copy with a known cost | Planned | — | |
| E-04-T4 | **Adjust on hand is manager-only and reason-coded.** As an Employee, Adjust on hand is gated: a Manager authorizes in place by initials and both names are recorded. The adjustment records reason, before/after, timestamp and actor; `Other` demands a note. | §"Adjusting on hand" | M-04 decision 3, M-04 decision 4, A-28a | A Record with stock; a Manager's initials | Planned | — | |
| E-04-T5 | **Supplier claim, batched and numbered.** Raise claims against two copies from the same Supplier + separator; they merge onto one Draft; sending it assigns the next ascending claim number and the claim appears Pending in M-05. | §"Supplier claims" 1–6 | E-04 §"Supplier claims" step 4 (auto-number), M-05 decision 3 | Two received copies from one Supplier | Planned | — | |

### E-05 — Point of Sale

Steps in [E-05](../flows/E-05-sell-a-record.md). Prototype screen: Point of
Sale (`/sell`, `/sell/:saleId`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| E-05-T1 | **Anonymous cash sale, single copy.** New Sale, scan an internal barcode, tender cash over the total. Change is shown; the Sale moves Open → Current, takes a Sale number, is attributed to the lock holder; the receipt is offered as a browser print (no email). | 1, 4–6, 9, 11–13 | E-05 decision 20, E-05 decision 21, E-05 decision 23, E-05 decision 24 | One sellable copy with an internal barcode | Planned | — | |
| E-05-T2 | **UPC with differing copies opens the picker.** Scan a manufacturer UPC held at two grades/prices → picker with grade, price, count; pick one → the line is at that copy's price. Scan a UPC with one sellable copy → no picker. | 4–6 | E-05 step 5 | A Record with two copies at different prices, another with one | Planned | — | |
| E-05-T3 | **`0.00` asks at the till.** Scan a copy priced `0.00`; the till prompts for a price before the line lands. | 6 | E-05 step 6 | A copy priced `0.00` | Planned | — | |
| E-05-T4 | **Customer pre-fills discount and tax line.** Attach a Customer carrying a global discount and a default tax line; both pre-fill each subsequent line and stay editable per line. | 2–3, 7 | E-07 decision 6, E-07 decision 7 | A Customer with both fields set | Planned | — | |
| E-05-T5 | **Split tender.** Tender part on a gift card, part cash, remainder on card. Each tender is its own entry; the Sale completes when they net to the total. | 9–12 | E-05 step 10 | A gift card with a balance | Planned | — | |
| E-05-T6 | **Negative inventory warns and completes.** Set quantity above on-hand. The till warns, the Sale completes, and the oversold copy is minted tagged oversold. | 7 | E-02 decision 21, E-04 §"Adjusting on hand" | A Record with one copy on hand | Planned | — | |
| E-05-T7 | **Hold hands the lock over.** Employee A opens a Sale and adds a line; Employee B cannot add to it. A puts it on Hold; B re-opens and tenders; the Sale is attributed to B. | 1, 12; §"Sale locking and attribution" | E-05 decision 23, A-19 | Two Employees' initials | Planned | — | |
| E-05-T8 | **Void only at zero.** Tender a Sale, then Void — refused while tenders do not net to zero. Strike the tender; the money really goes back (gift card balance restored); Void then succeeds and the Sale keeps its number. | §"Sale states"; prototype notes | E-05 decision 31, E-05 decision 32 | A gift card tendered on a Current Sale | Planned | — | |
| E-05-T9 | **Deposit is a line-less Sale to account.** Ring a Sale with no lines, tender to the Customer's account; the Customer's balance shows the credit and the Held Sale displays it. | §"Deposits" | E-05 decision 25, E-07 decision 4, E-07 decision 5 | A Customer with a Held Sale | Planned | — | |
| E-05-T10 | **Snapshotted line values.** Tender a Sale, then edit the Record's title and price in E-04. The Sale's line still shows what was sold at what price. | 12; E-04 Edit catalog | E-05 decision 13 | As T1 | Planned | — | |
| E-05-T11 | **Three tracks own the window.** At a counter viewport, add twenty lines: the page never scrolls; Finish sale stays on the money rail's floor; the rail collapses to icons and opens as a drawer. | — (layout) | E-05 decision 28, E-05 decision 29, E-05 decision 30 | Twenty sellable copies | Planned | — | |

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

### M-01 — Suppliers

Steps in [M-01](../flows/M-01-supplier-margin.md). Prototype screen: Suppliers
(`/suppliers`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-01-T1 | **New, Edit, Copy are plain Employee actions and logged.** Create a Supplier (discount defaults 0%), edit its discount, copy it; each is on the log with who and when; Copy clears the second-hand default and resets the log. | 1–3, 5 | M-01 decision 1, M-01 decision 4, M-01 decision 11 | — | Planned | — | |
| M-01-T2 | **Discount change reprices future receiving only.** Change a Supplier's discount; on-hand copies keep their price; a new receipt suggests the new figure. | 3 | M-01 decision 2 | A Supplier with received stock | Planned | — | |
| M-01-T3 | **One second-hand default.** Set the flag on a second Supplier; it clears from the first. | 3 | M-01 decision 5 | Two Suppliers | Planned | — | |
| M-01-T4 | **Merge repoints every dependent.** Merge B into A; B's Invoices, order lines, claims, copies and a Record's preferred Supplier now point at A. Manager-only. | 4 | M-01 decision 9, M-01 decision 11 | Supplier B with one of each dependent | Planned | — | |

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

### M-03 — Daily summary

Steps in [M-03](../flows/M-03-daily-summary.md). Prototype: under Point of
Sale's **Other functions**.

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-03-T1 | **View Subtotal changes nothing.** Run it twice mid-day; the breakdown is identical and every Sale is still Current. | 1 | M-03 step 1 | Three Current Sales | Planned | — | |
| M-03-T2 | **Close moves Current to Closed as a batch.** Total Today's Sales; every Current Sale is Closed and no longer editable; the batch carries its id, timestamp and User; a Sale rung afterwards belongs to the next batch. | 2–3 | M-03 §"The close" | As T1 | Planned | — | |
| M-03-T3 | **Undo End of Day is manager-only and restores numbers.** As an Employee, Undo is authorised in place by a Manager's initials with both names recorded; the batch's Sales return to Current with their numbers. | 4 | M-03 decision 4, M-04 decision 3, M-04 decision 4, A-28a | A closed batch | Planned | — | |
| M-03-T4 | **Tender column reconciles.** A day with a cash sale, a cash refund, a payment onto account and a spend of that credit: the tender column reports each movement, Account Balance split by direction, and reconciles against net sales. | — | M-03 decision 14 | Those four transactions | Planned | — | |

### M-05 — Accounts payable

Steps in [M-05](../flows/M-05-accounts-payable.md). Prototype screen: Accounts
Payable (`/payable`).

| # | Scenario | Steps | Asserts | Needs | Prototype | Product | Spec |
|---|---|---|---|---|---|---|---|
| M-05-T1 | **Manager-only, in its entirety.** Reaching `/payable` as an Employee is gated behind a Manager's initials, both names recorded; once authorized, suppliers carrying a balance list first and the lookup finds a zero-balance one. | 1 | M-05 decision 2 | Two Suppliers, one settled | Planned | — | |
| M-05-T2 | **One combined list.** A Supplier with an outstanding Invoice, a Pending claim and a manual entry shows all three in one list, and the balance is their net. | 2 | M-05 decision 3 | Those three items — needs E-04-T5 first | Planned | — | |
| M-05-T3 | **Record a partial payment, then settle.** Pay part of an Invoice; balance owing drops; pay the rest; the Invoice is marked paid and Receiving shows it locked. | 3; §"Recording a payment" | E-02 decision 40, A-33 | A finalized Invoice | Planned | — | |
| M-05-T4 | **Apply credit distributes oldest-first.** Mark a claim Credited and apply it; it lands across outstanding Invoices oldest-received-first, and its type relabels from Claim to Credit. | 3; §"Applying a claim credit" | M-05 decision 11 | Two outstanding Invoices, one Credited claim | Planned | — | |

### Not yet registered

| Flow | Why |
|---|---|
| [E-01](../flows/E-01-authenticate.md) | `In clarification` — rows are added when it reaches `Specified` |
| [M-04](../flows/M-04-manage-users.md) | `In clarification` |
| [M-06](../flows/M-06-settings.md) | `In clarification` |

---

## Milestone view

Which rows must be `Automated` against the product before a build-order milestone
([architecture](../architecture.md) §8) closes. The gate for automating a row is in
the `/qa` skill; this is only the mapping.

| Milestone | Rows |
|---|---|
| M2 Catalog and scan | E-03-T1–T4, E-04-T1 |
| M3 Receiving | E-02-T1–T10, E-04-T3, E-04-T5; M-01-T1–T3 *(M-01 is not named in §8, but a Supplier is a precondition of every E-02 row — see Open questions)* |
| M4 Till | E-05-T1–T11, E-06-T1–T5, E-07-T1–T5, E-04-T2, E-04-T4 |
| M5 Close, receipts, review | M-03-T1–T4 |
| M6 Hardening | Every row above, run as one seeded trading day |
| Post-v1 | M-02-T1–T7, M-05-T1–T4, M-01-T4 |

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
- **E-03-T4's rule.** "Search with visible degradation" is in §8's M2 row and in
  the prototype, but no numbered decision says what search does when the provider
  is down. Owner: `/flow-clarify E-03`.
- **Counter viewport.** E-05-T11 needs a viewport that matches the till hardware,
  which no decision names. Owner: `/architecture` (§2.1).
