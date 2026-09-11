# E-06 — Process a return

**Actor:** Employee
**Status:** Specified
**Related:** [E-05 Point of Sale](E-05-sell-a-record.md) · [E-07 Manage customers](E-07-manage-customers.md)

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
   - **Re-graded** — the copy is taken in as an InventoryItem carrying its own Goldmine grade and its own price, since a returned copy is frequently not in the condition it was sold in; or
   - **Written off** via a reason-coded adjustment ([E-04](E-04-manage-inventory.md)) if it is not sellable at all.
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

---

## Open questions

- **Does a returned New-stock copy become second-hand once opened?** E-02 fixes intake mode per Invoice, and a Mint/Sealed copy that comes back opened is no longer Mint/Sealed. Step 6 gives the mechanism — a re-graded InventoryItem — but not the policy on whether an opened copy may ever return to New stock at its sticky price.
- **Exchanges.** Currently an exchange is a Return line plus a sale line on one Sale, netting to the difference. Whether that needs its own affordance at the till, or is left as two lines, is unsettled.
- **Return of a non-tracked item.** Freight and services have no stock to route back; presumably refund-only, but unstated.
- **Store credit issued without a Customer.** Step 5 requires a Customer for store credit. Whether a walk-in return with no Customer record should be able to issue a gift card instead of cash is undecided.
