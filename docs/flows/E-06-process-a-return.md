# E-06 — Process a return

**Actor:** Employee
**Status:** Specified
**Related:** [E-05 Point of Sale](E-05-sell-a-record.md) · [E-07 Manage customers](E-07-manage-customers.md) · [M-07 Chart of accounts](M-07-chart-of-accounts.md)

**Job:** As an employee, I need to take back a sold record and refund or exchange it.

**Scope note:** this is a *customer* Return. Returns and credit claims against a *supplier* Invoice belong to [E-04](E-04-manage-inventory.md).

---

## Flow

1. Employee starts a Sale in the normal way ([E-05](E-05-sell-a-record.md)) and, where the customer is known, attaches the Customer.
2. Employee adds the returned item as a line with a **negative quantity**. Scanning the item's barcode resolves it exactly as it would on a sale.
3. If the item can be matched to a prior Sale for that Customer, the line is **linked to that original Sale**, and the return shows in the Customer's history against it.
   - If it cannot be matched — no Customer, no receipt, a gift — the Employee proceeds anyway. A link is recorded when it is available, not required before the return can happen.
4. Employee sets the refund amount. It defaults to the linked Sale's line price where a link exists, and to the item's current price where it does not; either can be overridden.
5. Employee tenders the negative total, settling it either as:
   - **cash** paid out of the till, or
   - **store credit** onto the Customer's accounts-receivable balance ([E-07](E-07-manage-customers.md)).
6. Employee assesses the returned copy and routes the stock:
   - **Back to sellable** at its original grade, if it comes back as it left; or
   - **Re-graded** — a **new InventoryItem is minted** carrying its own Goldmine grade and its own price, since a returned copy is frequently not in the condition it was sold in. The copy that was sold **stays sold, at the grade it sold at** (decision 15). Deliberately *not* [E-04](E-04-manage-inventory.md)'s **Edit copy**, which edits a grade in place on the copy itself; or
   - **Written off** via a reason-coded adjustment ([E-04](E-04-manage-inventory.md)) if it is not sellable at all. ***Manager-only*** ([architecture](../architecture.md) A-81, A-28a): this route adjusts on hand, and decision 3's *no manager approval* is about the **refund**, which decision 7 already holds apart from the disposition. Ungated, it is a copy taken in over the counter, cash refunded, and the copy removed from stock with no Manager in the act. The other two routes stay ungated.
7. System prompts to print a receipt for the return.

---

## Return policy

Deliberately permissive: **no receipt is required, no time window is enforced, and no manager approval is needed.** The store's position is that returns friction costs more in goodwill than it saves in shrinkage, and that Employees are trusted to exercise judgement at the counter.

This is a policy choice, not a technical limitation — the system records who processed each return, so a pattern can be reviewed after the fact rather than blocked in advance.

---

## Requirements

- A Return must be possible with no Customer attached and no link to an original Sale.
- Negative-quantity lines flow through the tender breakdown in [M-03](M-03-daily-summary.md) as negative amounts against the tender used, rather than being netted silently against gross sales.
- Returned stock does not become sellable again until an Employee has explicitly routed it (step 6). A returned copy sitting unassessed is not on the shelf.
- Every Return is attributed to the Employee who processed it.
- Refund amount and stock disposition are recorded independently — refunding a customer in full and writing the copy off are compatible outcomes.

---

## Inherited from other flows

**From [E-05](E-05-sell-a-record.md):**

- Returns are lines on a Sale, not a separate document type. All E-05 tender behavior, including split tender, applies.
- Line values are snapshotted at time of sale, so a linked Return can show what the copy actually sold for even if the catalog has since changed.

**From [M-06](M-06-settings.md) and [architecture](../architecture.md) A-57:**

- **A Return's tax is resolved at today's rate**, not the linked Sale's (decision 13). The refund *amount* still defaults to the original line price (decision 5) — the two behave differently on purpose.

**From [M-06](M-06-settings.md):**

- **A line in a Section flagged `returnable = false` cannot be returned** ([M-06](M-06-settings.md) d30). This is **not** a gate and does not amend decision 3 — Returns stay ungated, with no receipt, no time limit and no approval, for everything else. It is a property of what is being sold: a gift card load returned under decision 3's terms is a cash-out dressed as a refund. Unwinding one is a **void of the original Sale** ([E-05](E-05-sell-a-record.md) d31) while that is still possible, and a Manager and an [M-05](M-05-accounts-payable.md) adjustment afterwards.

**From [M-07](M-07-chart-of-accounts.md):**

- **A Return produces journal lines like any Sale**, through the close it lands in ([M-07](M-07-chart-of-accounts.md) d7). Because inventory is **perpetual** ([M-07](M-07-chart-of-accounts.md) d2), a returned copy moves its own cost back out of cost of goods and into Inventory — the reverse of what selling it did, at the figure that copy carried, never a recomputed one.
- **A Section that has been deactivated still resolves** ([M-07](M-07-chart-of-accounts.md) d18), so a Return of a copy filed in a retired Section posts where it always did rather than failing.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | A Return is a **negative-quantity line** on a Sale, not a separate document type |
| 2 | Linking to the original Sale is done **when possible, never required** — no receipt, no lookup, no blocker |
| 3 | No time window, no receipt requirement, and no manager approval for a Return |
| 4 | Refunds settle as cash out of the till or as store credit on the Customer's accounts-receivable balance |
| 5 | Refund amount defaults to the linked Sale's line price, or the current price when unlinked; both overridable |
| 6 | A returned copy is explicitly routed — back to sellable, re-graded as its own InventoryItem, or written off — before it is sellable again |
| 7 | Refund and stock disposition are independent decisions |
| 8 | Returns appear as negative amounts against their tender in the M-03 close, not netted into gross sales |
| 9 | **A Return is laid out as the till is** ([E-05](E-05-sell-a-record.md) decision 29): the same three tracks — the rail, the Return, the money — each scrolling on its own, with **Finish return** pinned to the money's floor and the log strip reading its newest entry from the closed state. The till rail ([E-05](E-05-sell-a-record.md) decision 30) follows the Employee across, because a Return is a till transaction and the alternative strands them on a screen with no way back to a Sale in flight. The Return keeps a table rather than the till's art-led rows — its lines carry columns a Sale line has no use for, what it links back to and where the copy went — with the header sticky so those columns survive scrolling. **+ Add returned item** stands where the till's scan field stands, since it is the way a line gets onto the document |
| 10 | **Void refuses while any returned copy is routed.** A Return can be voided on [E-05](E-05-sell-a-record.md) decision 31's terms — the refund off it first — but only while its stock is still unrouted. A routed copy is already back on the shelf, re-graded, or written off, and putting it back is a different operation from voiding the paperwork. Consequence being fixed: Void reverted every line's copy to sellable regardless of sign, so voiding a Return would have put copies on the floor the store never took in — and released a held copy outright. Void now only gives back what the Sale consumed (lines with a positive quantity), which is the test the tender step already used |
| 11 | **A finished Return appears in the till rail's Recent alongside Sales.** It carries a transaction number like any other tendered document, and the commonest reason to go hunting for one is the refund that just went out. Badged as a Return and shown at its negative amount, because the number alone gives no clue which way the money went |
| 12 | **The returned copy is found by lookup, not chosen from a list of every copy in the building.** Scanning the copy's own sticker resolves it outright — the counter path. Otherwise the catalogue is searched and the matching copies shown with their grade, barcode, price and current state. Deliberately not the till's Lookup ([E-05](E-05-sell-a-record.md)), which filters to sellable copies: that is exactly backwards here, since a copy coming back is normally one the store already sold, so this searches every copy and shows its state rather than hiding it |
| 13 | **A Return charges today's tax rate and never reaches back to the rate the original Sale collected.** A Return is a Sale with negative lines (step 1), so its tax resolves the way any line's does, at the rate in force when the money moves ([architecture](../architecture.md) A-57). **Charging the original rate was considered and rejected** — it is the more orthodox answer, but it needs a linked Sale to read the rate from, and decision 3 deliberately allows a Return with no receipt, no Customer and no link at all (step 3). That would mean a today's-rate fallback anyway, and a shop with two tax rules for the same counter action will apply the wrong one. Note this differs from the **refund amount**, which *does* default to the linked Sale's line price (decision 5): price is what was agreed with this customer, tax is what is owed to an authority today. *Accepted consequence, and it is real money:* a Return crossing a rate change refunds tax at a rate the store never collected on that item, so the customer is out or up by the delta and the store absorbs it. The books stay consistent — the negative line carries today's rate into today's period and [M-03](M-03-daily-summary.md) sums snapshotted per-line figures — so this is a small bounded difference rather than an integrity problem, bounded by how rarely rates change multiplied by how rarely a return crosses one |
| 14 | **A sole matching prior Sale is selected, not merely offered.** Step 3's *the line is linked* is a **default the Employee can undo**, not a prompt they must answer: where exactly one prior Sale for the **attached Customer** sold this copy, the link is preselected and decision 5's refund default follows it to the linked line price. Several matches, or none, leave the line unlinked at the copy's current price — and a Return with no Customer has nothing to match against, so step 3's second bullet stands untouched. **The offered-only reading cost money and the walk priced it:** a copy sold at **$31.49** under a 10% discount defaulted to its **$34.99** current price, so an Employee accepting the default over-refunded by **$3.50** and lost the Customer-history link, with nothing on screen saying a match existed. Nothing is taken from the Employee, because changing the link still rewrites the refund |
| 15 | **Re-grading mints a new InventoryItem; the copy that sold stays sold at the grade it sold at.** The returned disc enters as its own copy rather than the old one changing grade underneath a completed Sale, so *what did this copy sell as* stays answerable. **Deliberately distinct from [E-04](E-04-manage-inventory.md)'s *Edit copy***, which edits grade, note and price in place and remains the right tool for correcting a mistake on a copy still on the shelf; this is the case where one physical disc has been two different things to two different people. Supersedes nothing — step 6 never said which, and [register](../qa/e2e-register.md) row E-06-T4 had assumed this reading ahead of the decision |
| 16 | **The new copy's cost is the refund that was paid for it**, not the cost the sold copy carried. The store is buying the disc back at the counter for an agreed figure, and that figure is what it paid. **Two consequences are accepted and both are real** — see *Cost of a re-graded copy* below |
| 17 | **The new copy's arrival is dated at the moment of re-grade**, not inherited from the original's. As a distinct copy at a distinct grade it did not exist before, so it arrives now, and [architecture](../architecture.md) A-81's movement chain reads cleanly: the sold copy departs, this one arrives, and as-at counts stay right across the pair. *Accepted consequence:* [E-03](E-03-search-inventory.md) decision 16's **dead-stock clock restarts**, so a copy that sat unsold for a year reads as new stock once it has been sold and taken back. The store accepts that a returned copy is, for reorder purposes, a fresh proposition |
| 18 | **The new copy's internal barcode is minted at routing; its label is printed after.** The barcode exists immediately, because [architecture](../architecture.md) A-81 writes the copy's arrival movement then and [architecture](../architecture.md) §6 resolves a scan to exactly one InventoryItem — a copy with no code is unscannable and therefore unsellable. The **sticker** is not assumed to be printable at the till: [E-02](E-02-receive-inventory.md) puts the label printer at the receiving desk, and committing one to every counter is a hardware decision this flow does not get to make. The copy is not on the shelf until routed anyway, so there is a natural moment to sticker it |

---

## Cost of a re-graded copy

Decision 16 puts the **refund** on the new copy rather than the cost the sold copy
carried. It reads correctly at the counter — the store handed over a figure and got a
disc — and it has two consequences worth writing down rather than rediscovering.

**The cost basis becomes a number an Employee types.** Decision 5 makes the refund
overridable, so the value of a copy in inventory is now set at the till. A refund
talked down to `0.00` mints a copy the books say cost nothing; a generous refund mints
one carrying more than the store would ever have paid for it. This is not what
[architecture](../architecture.md) A-43 is about — that governs *derived state*, not
cost — but it runs against its grain, and it is the first place in the system where an
inventory value is set by a counter keystroke rather than by an Invoice.

**Margin goes strange across the pair, and the arithmetic is worth seeing.** A copy
received at **$8.00**, sold at **$34.99**, refunded at **$31.49**, re-graded, and sold
again at **$15.00**:

| | Cost carried | Sold for | Margin shown |
|---|---|---|---|
| First sale | $8.00 | $34.99 | +$26.99 |
| Second sale, after re-grade | $31.49 | $15.00 | **−$16.49** |

The store's actual position across all four movements is
`+34.99 − 31.49 + 15.00 − 8.00 = **+$10.50**`, and neither line shows it. The second
sale reports a loss on a copy the store made money on. Per-copy margin is therefore
**not** a safe figure to read across a return under this rule, and anything that ranks
or reorders on margin will rank a re-graded copy wrongly.

_Both are accepted deliberately. The third consequence is not settled and is an open
question below: the ledger holds two figures for one disc._

---

## Open questions

- **The return's journal and the new copy disagree about what the disc cost.**
  [M-07](M-07-chart-of-accounts.md) decision 2 moves a returned copy's cost back out of
  cost of goods and into Inventory *"at the figure that copy carried, never a recomputed
  one"* — the **original** cost. Decision 16 then mints the replacement copy carrying the
  **refund**. For the worked example above that is **$8.00** posted into Inventory against
  a copy the stock records value at **$31.49**, and nothing reconciles the $23.49. Either
  the reversal posts the refund, or the difference posts somewhere named — it is a real
  account, not a rounding. *Owned by [M-07](M-07-chart-of-accounts.md); raise through
  `/architecture`, since it touches what A-67 writes in the artifact's transaction.*
- **Who clears a copy that is waiting for its label?** Decision 18 mints the barcode at
  routing and leaves the sticker for later. Nothing yet says how an Employee finds the
  copies waiting to be stickered, whether an unstickered copy may go on the shelf, or
  whether this is a state on the copy or a queue on a screen.
- **Does the dead-stock clock restarting need saying out loud on screen?** Decision 17
  accepts that a re-graded copy reads as new stock to [E-03](E-03-search-inventory.md)
  decision 16. Whether the titlecard should say *"re-graded on return, arrived today"* so
  a buyer is not misled by a fresh-looking date is unsettled.

- **Does a returned New-stock copy become second-hand once opened?** E-02 fixes intake mode per Invoice, and a Mint/Sealed copy that comes back opened is no longer Mint/Sealed. Step 6 gives the mechanism — a re-graded InventoryItem — but not the policy on whether an opened copy may ever return to New stock at its sticky price.
- **Exchanges.** Currently an exchange is a Return line plus a sale line on one Sale, netting to the difference. Whether that needs its own affordance at the till, or is left as two lines, is unsettled.
- **Return of a non-tracked item.** Freight and services have no stock to route back; presumably refund-only, but unstated.
- **Store credit issued without a Customer.** Step 5 requires a Customer for store credit. Whether a walk-in return with no Customer record should be able to issue a gift card instead of cash is undecided.
