# M-03 — Daily summary of sales and inventory

**Actor:** Manager (Undo End of Day is **manager-only**, not a retired *manager override* — [architecture](../architecture.md) A-28a)
**Status:** Specified — surfaced on **Point of Sale** under **Other Functions** ([E-05](E-05-sell-a-record.md) decision 30), not a screen of its own
**Related:** [E-05 Point of Sale](E-05-sell-a-record.md) · [E-06 Process a return](E-06-process-a-return.md) · [M-06 Settings](M-06-settings.md) · [M-07 Chart of accounts](M-07-chart-of-accounts.md) · [M-08 Keep the general ledger](M-08-general-ledger.md)

**Job:** As a manager, I need an end-of-day picture of what sold and what the stock position looks like.

---

## The close

Closing the day is a real state transition, not just a report: it moves every **Current** Sale to **Closed**, after which those Sales are no longer editable ([E-05](E-05-sell-a-record.md)).

1. Manager runs **View Subtotal** as often as they like during the day. It produces the same breakdown as the close and changes nothing.
2. Manager runs **Total Today's Sales** to close. The system produces the breakdown and moves all Current Sales to Closed.
3. The closed group is a **batch**, carrying its own identifier, the timestamp it was run, and the User who ran it.
4. **Undo End of Day** reverses a batch, returning its Sales to Current. It is **manager-only** ([architecture](../architecture.md) A-28a, and decision 4 below): a Manager authorizes in place by entering their own initials, and both names are recorded ([M-04](M-04-manage-users.md) d3, d4). It is not a *manager override* — that term is retired ([M-04](M-04-manage-users.md) d8), and it never covered this action.

A batch is not the same thing as a calendar day. Sales rung after a close belong to the next batch even if the date hasn't changed, and a shop that closes twice in a day produces two batches.

---

## What the summary contains

| Section | Contents |
|---|---|
| **Sales** | Gross sales, returns, net sales, and transaction count |
| **By Section** | Net sales broken down by Section — VINYL, MERCH, and the rest ([M-06](M-06-settings.md)) |
| **By tender** | Amount taken per tender type: cash, card, store credit, gift card, `Used Credit`, and pay-outs — the last **against cash**, with a `Cash, net` subtotal (decision 16) |
| **Tax** | Collected per tax line |
| **Movements** | Voids, holds created, holds cancelled, and pay-outs with their notes |
| **Stock position** | Records below their minimum on hand |

Returns and pay-outs appear as **negative amounts against the tender they moved through**, not netted silently into gross sales — a $200 day with a $50 refund reads as $200 gross, −$50 returns, $150 net, not as $150 of sales.

For both of them the tender they moved through is **cash**, so both reduce the cash figure (decision 16). They keep their own labelled rows — `Cash — pay-outs` beside `Cash` — because decision 14 reports every movement rather than a net one, and a **`Cash, net`** subtotal sits beneath them. That subtotal is what moved, **not what is in the drawer**: there is no opening float here, for the reason given below.

---

## What it deliberately does not contain

**No cash-drawer reconciliation.** There is no opening float, no counted-versus-expected comparison, and no over/short figure. The summary reports what the system was told happened; comparing that against the physical drawer is done outside the system by choice.

Pay-outs are the one cash movement that is captured, because money leaving the till for an expense is otherwise invisible to every other report.

---

## Requirements

- Every Sale in a batch must be attributable to the batch, and every batch to the User who closed it.
- Undoing a close must restore Sales to exactly the state they held before it, including their Sale numbers.
- The breakdown by Section depends on every sellable thing carrying a Section, including non-tracked items like freight ([E-05](E-05-sell-a-record.md)).
- Margin figures must carry the E-02 caveat below wherever they appear.

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- **Margin figures reflect supplier cost only.** Freight, tax, and miscellaneous costs stay at the Invoice level and are not allocated to items, so per-item margin is slightly overstated — roughly 2.6% on the reference Invoice. Any margin reporting here states the caveat.

**From [E-05](E-05-sell-a-record.md):**

- Closing moves Current Sales to Closed; a Closed Sale can only be reopened by undoing its batch.
- Pay-outs and `Used Credit` are tender types and appear in the tender breakdown.

**From [E-04](E-04-manage-inventory.md):**

- Minimum on hand is informational and surfaces here rather than raising orders.

**From [M-06](M-06-settings.md):**

- **Tax is reported per tax *type*** — GST, QST — rather than per tax line ([M-06](M-06-settings.md) d11). Where a line carried two taxes, each is reported against its own type: the split is what gets remitted, and two composition orders that agree on the customer's total can disagree on it (M-06 d16).
- **The *By tender* breakdown reports configured tenders, not behaviors** ([M-06](M-06-settings.md) d22). `Visa`, `Mastercard` and `Amex` are three rows, not one `card` row, because they usually settle as three separate bank deposits and a merged figure cannot be tied back to a statement.
- **Cash rounding is its own tender** ([M-06](M-06-settings.md) d26, amending d21), behavior `rounding`, written by the system and never selectable. It carries `−$0.02` when a cash tender rounds up and `+$0.02` when it rounds down, so a Sale's tenders sum to its total and the rounding tallies through the *By tender* breakdown with no line invented for it — decision 14's reasoning reaching its natural end. It is also what makes decision 8's refusal to reconcile the drawer a choice rather than an oversight.
- **Sections carry a sort order** ([M-06](M-06-settings.md) d28) which the *By Section* breakdown follows, and are an editable table rather than a fixed pair of values.
- **Whether a Section enters the *By Section* breakdown is a flag on the Section** ([M-06](M-06-settings.md) d20), not a hard-coded exclusion. Freight and services are revenue and appear; the gift-card Section is a liability and does not — which is decision 14 restated as configuration rather than as a special case in this flow.
- **Merging a Genre moves every Record under it in the *By Section* breakdown at once** ([architecture](../architecture.md) A-60, [M-06](M-06-settings.md) d31, d32). A Record's Section is derived from its genre's required parent rather than stored, so a merge into a genre with a different parent re-buckets everything beneath it in one act. **Completed Sale lines are unaffected** — they keep what they snapshotted (M-06 d8), so a past day's summary does not restate.
- **Gift card loads resolve through a system-owned catalog entry** ([M-06](M-06-settings.md) d18) which, like every sellable thing, carries a genre and therefore a Section. **That Section is excluded from the *By Section* breakdown** — decision 14 is unchanged and governs: a load is money in but not a sale, so it stays out of gross and out of Section, and is reported as an *of which* line against the tender that took the money.

**From [M-07](M-07-chart-of-accounts.md):**

- **The close writes a journal batch onto the CloseBatch, beside the summary decision 13 already stores there** ([M-07](M-07-chart-of-accounts.md) d7). Its lines group by **`(business date, account)`**, not by account alone ([M-07](M-07-chart-of-accounts.md) d14) — because step 2 closes **all** Current Sales rather than today's, so a close nobody ran on Monday would otherwise report Monday's revenue on Tuesday, which is harmless most weeks and wrong across a month boundary. If debits and credits disagree the difference posts to **Suspense** and a ReviewFlag is raised; **the close proceeds either way** ([M-07](M-07-chart-of-accounts.md) d10).
- **Undo End of Day refuses while the batch has been banked. Amends decision 4** ([architecture](../architecture.md) A-66). A non-voided BankDeposit referencing the CloseBatch blocks `close_undo`; voiding that deposit releases it. A-33a's shape with a different trigger — **immutable while banked**, never immutable forever. Decision 4's restore-exactly guarantee is unchanged for every batch that has not been banked.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | The close is a state transition — Current Sales become Closed and stop being editable |
| 2 | A closed group is a **batch** with its own identifier, timestamp, and closing User |
| 3 | A batch is not a calendar day; two closes in one day produce two batches |
| 4 | **Undo End of Day** is manager-only and restores Sales to their prior state, Sale numbers included |
| 5 | **View Subtotal** produces the same breakdown without closing anything |
| 6 | The summary breaks down by **Section** and by **tender type** |
| 7 | Returns and pay-outs show as negative amounts against their tender, never netted into gross |
| 8 | **No cash-drawer reconciliation** — no float, no counted-versus-expected, no over/short |
| 9 | Pay-outs are captured with their notes, being otherwise invisible cash movements |
| 10 | Records below minimum on hand are reported here |
| 11 | Margin figures carry the E-02 unallocated-cost caveat |
| 12 | **Held Sales are absent from the close.** The close touches only Current Sales — a Hold is not revenue until tendered. Held copies still reduce *available* stock, so the stock position reflects them. Closes the Held-Sale open question ([architecture](../architecture.md) A-23) |
| 13 | **The summary is stored on the batch and printable.** `close_batches.summary` holds the computed breakdown at close time; a print route renders it. Storing rather than recomputing means an Undo End of Day cycle can never quietly restate a past day. Closes the delivery open question (A-30) |
| 14 | **The tender column reports every movement of money, not a net figure.** Refines decision 6. **Account Balance** is split by direction — a customer paying onto their account and a customer spending that credit are opposite movements that happen to share a tender type, and netting them reports `$0` for a day that did $100 of each. **Gift-card loads** are reported as an *of which* line against the tender that took the money: loading a card is money in but not a sale ([M-05](M-05-accounts-payable.md) decision 10), so it stays out of gross and out of Section, and naming it is what lets the tender column be reconciled against net sales instead of silently exceeding it |
| 15 | **Where a reporting period spans a rate change, tax is broken out by rate within its type.** A period covering 1 April shows GST at 5% and GST at 6% as two figures rather than one, because a remittance return generally wants the base and the tax **per rate** — a single GST line is the one report a shop hands to an accountant, and it is the one that would hide the change. Extends the per-type reporting this flow already does (d13, [M-06](M-06-settings.md) d11) rather than replacing it: **one figure per type is still what a normal period shows**, and the split appears only when more than one rate actually contributed. **It costs nothing to store.** The rate is already on the Sale line — [architecture](../architecture.md) A-57 and §5 snapshot *the rates applied* — so this is a grouping over data the close already reads, not a lookup against `tax_types` and not a reason to keep a rate history. *Accepted consequence:* the close's tax block changes shape on exactly the days it matters, which is the point and will still surprise whoever sees it first |
| 16 | **A pay-out is reported against cash, and the tender block carries a `Cash, net` subtotal. Completes decision 7 and the section above; the built prototype did neither.** The body of this flow has always said it — *"returns and pay-outs appear as negative amounts against the tender they moved through"* — and a pay-out moves through **cash**; [E-05](E-05-sell-a-record.md) d16 says it in as many words, *"appears as a negative cash line in the M-03 close"*. What was built gave the pay-out a tender row of its own, so **a day whose only cash movement was a $20 pay-out carried no cash line at all**, and the money that left the drawer read as a category nobody reconciles rather than as cash going out. A **cash refund was already right** and is untouched: [E-06](E-06-process-a-return.md) tenders it as a negative `Cash` tender, so it has always netted here — the pay-out was the one out of step. The row is labelled **`Cash — pay-outs`** rather than folded silently into `Cash`, because decision 14 holds that the tender column reports **every movement of money, not a net figure**, and that rule is what makes a day of $100 in and $20 out legible. The **subtotal sits beside the movements rather than replacing them**, and is a subtotal rather than a row, so nothing that sums the column double-counts it. *Accepted consequence, and the wording has to keep carrying it:* this flow holds **no opening float** and runs no counted-versus-expected comparison, so `Cash, net` is **what moved, never what is in the till** — it is the figure a person counts the drawer against, and the counting stays outside the system exactly as *"What it deliberately does not contain"* says |

---

## Open questions

- ~~**Delivery**~~ — **Resolved** by decision 13: stored on the batch and printable, both.
- **Arbitrary date ranges.** The close is per batch. Whether the same breakdown can be run over a week or a month — and whether that means summing batches or querying Sales directly — is undecided. Decision 13's stored summaries make summing batches the cheaper of the two.
- ~~**Per-employee breakdown**~~ — **Unblocked** by [E-05](E-05-sell-a-record.md) d23: a Sale belongs to whoever held the lock at tender. Whether the summary presents that breakdown is a reporting choice, deferred with the rest of trend reporting.
- **Top sellers and trend reporting.** PRD goal G-2 wants market-trend analysis, which is a reporting surface well beyond a daily close. Probably its own flow.
- **Multi-store.** Whether a Manager closes per store, and whether anyone sees a consolidated position across stores. Deferred — v1 deploys one store with no cross-store UI.
- ~~**What happens to a Held Sale at close?**~~ — **Resolved** by decision 12: nothing. A Hold is untouched by the close and absent from the summary.
