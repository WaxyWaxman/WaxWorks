# M-03 — Daily summary of sales and inventory

**Actor:** Manager (Undo End of Day labeled Admin-only by convention, not enforced)
**Status:** Specified — surfaced on **Point of Sale** under **Other Functions** ([E-05](E-05-sell-a-record.md) decision 30), not a screen of its own
**Related:** [E-05 Point of Sale](E-05-sell-a-record.md) · [E-06 Process a return](E-06-process-a-return.md) · [M-06 Settings](M-06-settings.md)

**Job:** As a manager, I need an end-of-day picture of what sold and what the stock position looks like.

---

## The close

Closing the day is a real state transition, not just a report: it moves every **Current** Sale to **Closed**, after which those Sales are no longer editable ([E-05](E-05-sell-a-record.md)).

1. Manager runs **View Subtotal** as often as they like during the day. It produces the same breakdown as the close and changes nothing.
2. Manager runs **Total Today's Sales** to close. The system produces the breakdown and moves all Current Sales to Closed.
3. The closed group is a **batch**, carrying its own identifier, the timestamp it was run, and the User who ran it.
4. **Undo End of Day** reverses a batch, returning its Sales to Current. **Admin** by convention — labeled, not an enforced check (see [E-05](E-05-sell-a-record.md) decision 30).

A batch is not the same thing as a calendar day. Sales rung after a close belong to the next batch even if the date hasn't changed, and a shop that closes twice in a day produces two batches.

---

## What the summary contains

| Section | Contents |
|---|---|
| **Sales** | Gross sales, returns, net sales, and transaction count |
| **By Section** | Net sales broken down by Section — VINYL, MERCH, and the rest ([M-06](M-06-settings.md)) |
| **By tender** | Amount taken per tender type: cash, card, store credit, gift card, `Used Credit`, and pay-outs |
| **Tax** | Collected per tax line |
| **Movements** | Voids, holds created, holds cancelled, and pay-outs with their notes |
| **Stock position** | Records below their minimum on hand |

Returns and pay-outs appear as **negative amounts against the tender they moved through**, not netted silently into gross sales — a $200 day with a $50 refund reads as $200 gross, −$50 returns, $150 net, not as $150 of sales.

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

---

## Open questions

- **Delivery.** In-app only, emailed at close, printed at the till, or all three. E-02 prints a letter-size summary on finalize; whether the close does the same is unsettled.
- **Arbitrary date ranges.** The close is per batch. Whether the same breakdown can be run over a week or a month — and whether that means summing batches or querying Sales directly — is undecided.
- **Per-employee breakdown.** Depends on E-05's open question about which Employee a Sale belongs to when one rings it and another tenders it.
- **Top sellers and trend reporting.** PRD goal G-2 wants market-trend analysis, which is a reporting surface well beyond a daily close. Probably its own flow.
- **Multi-store.** Whether a Manager closes per store, and whether anyone sees a consolidated position across stores.
- **What happens to a Held Sale at close?** Holds persist across closes by design, but they represent committed stock and arguably belong in the summary as a liability figure.
