# E-05 — Point of Sale

**Actor:** Employee (Undo End of Day is **manager-only** — [M-03](M-03-daily-summary.md) d4, [architecture](../architecture.md) A-28a)
**Status:** Specified
**Related:** [E-03 Search the inventory](E-03-search-inventory.md) · [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-06 Process a return](E-06-process-a-return.md) · [E-07 Manage customers](E-07-manage-customers.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md) · [M-03 Daily summary](M-03-daily-summary.md) · [M-05 Accounts payable](M-05-accounts-payable.md) · [M-06 Settings](M-06-settings.md) · [M-07 Chart of accounts](M-07-chart-of-accounts.md)

**Job:** As an employee, I need to ring up a sale and take payment.

**Scope note:** this is the front-of-counter selling flow, renamed from "Sell a record" to **Point of Sale** to reflect that it now also carries M-03's close (Total Today's Sales / View Subtotal / Undo End of Day) — see decision 30. Inbound receiving is [E-02](E-02-receive-inventory.md); customer returns are [E-06](E-06-process-a-return.md); the full breakdown-and-close design still lives in [M-03](M-03-daily-summary.md), this flow just surfaces it.

---

## Sale states

A Sale is in exactly one state:

| State | Meaning |
|---|---|
| **Open** | Being rung up right now. No Sale number yet, and absent from every M-03 total. **Locked to the Employee who opened it** (decision 23). |
| **Current** | Tendered since the last end-of-day close. Editable. |
| **Held** | A reservation — either placed by an Employee against stock on hand, or created automatically when a customer-attached PurchaseOrder line is received. Not a completed Sale. |
| **Closed** | Included in a completed end-of-day close. No longer editable. |
| **Void** | Reversed by an Employee. Retains its Sale number. |

**Open** was added by decision 21: step 12 assigns *Current* only on completion of tender, which left the Sale being rung up with no state to be in.

---

## Flow

### Phase 1 — Open the Sale

1. Employee starts a new Sale, or selects an existing **Current** or **Held** Sale to continue.
2. Employee may attach a **Customer** (see [E-07](E-07-manage-customers.md)). Lookup is by name, phone, or email; multiple matches present a picker; no match offers to create the Customer. A Sale without a Customer is normal and fully supported.
3. If a Customer is attached and carries a global discount or a default tax line, both pre-fill onto subsequent lines and remain editable per line.

### Phase 2 — Add lines *(repeats per line)*

4. Employee scans or types into the barcode field. The resolver accepts four things:
   - a **manufacturer UPC** — resolves to a Record;
   - an **internal barcode** — resolves to one InventoryItem exactly;
   - a **gift card code** (`GC` prefix) — see Gift cards below;
   - a **non-tracked item code** (e.g. `FREIGHT`) — see Non-tracked items below.
5. If a manufacturer UPC resolves to more than one sellable InventoryItem at differing condition or price, the system presents a **picker** showing condition grade, price, and count. One sellable copy resolves directly with no picker.
6. System adds the line at the InventoryItem's price.
   - A price of `0.00` means *ask at the till*: the Employee is prompted for a price as the line is added.
7. Employee may adjust **quantity**, **price**, **discount**, and **tax line** on the line.
   - Quantity may drive stock below zero. The till warns but completes the Sale — see **negative inventory** under Inherited.
   - Discount pre-fills from the Customer's global discount when one applies.
   - Tax line references the tax table in [M-06](M-06-settings.md); the Customer's default tax line overrides the item's when set.
8. Return to step 4, or proceed to tender.

### Phase 3 — Tender

9. System totals the Sale and offers the tender types configured in [M-06](M-06-settings.md).
10. A Sale may be **split across multiple tenders** — e.g. `$20.00` gift card, `$20.00` cash, remainder on card. Each tender is recorded as its own entry against the Sale.
11. **Cash** tenders calculate change owed.
12. On completion the Sale moves from **Open** to **Current** and is assigned a **Sale number**, attributed to whoever holds the lock (decision 23).
13. System offers the **receipt**. In v1 receipts are **emailed** (decision 24); a customer with no email address gets a browser-printed copy. Any Sale can be reopened later by Sale number to re-send or reprint.

---

## Sale numbering

Sale numbers auto-generate ascending, are checked for uniqueness against history, and may be entered manually. They are **unique per Store** (decision 22), unlike supplier Invoice numbers, which are unique per `(supplier, invoice_number)` (E-02 decision 1). Allocation uses a locked counter row rather than a database sequence, because a sequence gaps on every rolled-back transaction and a gap reads as missing paperwork ([architecture](../architecture.md) A-17).

A **Held** Sale carries an `H`-prefixed hold reference (`H1`, `H2`…) rather than a Sale number, so it is never mistaken for a completed Sale. On tender it receives a proper Sale number; the hold reference is retained on the record for traceability.

A **voided** Sale keeps its Sale number. Gaps in the sequence would read as missing paperwork, so a voided-but-numbered Sale is the honest record.

---

## Tender types

| Tender | Notes |
|---|---|
| **Cash** | Calculates change owed. |
| **Credit Card** | **Recorded only.** The card is settled on a separate terminal; the tender records that it happened, for reconciliation and the M-03 tender breakdown. Wax Works integrates no third-party payment processing system — Square, Stripe, or equivalent — and never captures card data. |
| **Store Credit** | Drawn against the Customer's accounts-receivable balance. Requires a Customer on the Sale. |
| **Gift Card** | Redeemed against a `GC` balance. |
| **Pay-out** | Cash removed from the till for an expense. Requires a note describing the purpose. Appears as a negative cash line in the M-03 close — which [M-03](M-03-daily-summary.md) d16 now actually does, against `Cash` rather than under a row of its own. **Settles on its own** (decision 35) — it is the cash movement, not half of one, so it needs no offsetting tender and a Sale carrying only a pay-out is fully tendered. |
| **Used Credit** | Buying second-hand stock over the counter. See below. |

> **Naming note.** The lexicon standardises on *second-hand* over *used*, but this tender is named **Used Credit** deliberately — it is the term spoken at the counter. Registered as a known exception rather than drift.

### Gift cards

Gift card codes carry a `GC` prefix. Scanning one at the till branches on its state:

- **Not yet loaded** → prompts to load it. Loading adds a **line item** to the Sale for the value purchased (money in).
- **Carries a balance** → prompts to redeem against the current Sale. Redemption is a **tender**, not a line-item price adjustment, so it composes with split tender.

A gift card may optionally be associated with a Customer but does not have to be — walk-in purchases are the common case. The outstanding-balance registry lives in [M-05](M-05-accounts-payable.md#gift-card-liability).

### Buying second-hand stock over the counter

The money side of a counter buy runs through the till:

14. Employee rings the agreed amount as a **Used Credit** tender. This may be on a `$0.00` Sale, or mixed into a normal Sale when someone trades in and buys the same visit.
15. The tender creates a balance owing **to the Customer**, settled either by:
    - crediting their accounts-receivable balance as store credit (requires a Customer on the Sale), or
    - tendering it back as **negative cash**, paying them out of the till.

The stock side is separate: the copies enter inventory through [E-02](E-02-receive-inventory.md) second-hand intake. An optional cross-reference field on each side links the Sale to the intake Invoice, so a payout can be traced to the copies it bought without building a workflow around it.

### Non-tracked items

Some things sold at the till are not InventoryItems — freight, services, and bulk goods where the count doesn't matter (buttons, stickers). These are catalog entries flagged **non-tracked**: they have a code, a price (often `0.00`, prompting at the till), and a Section, but no stock count, no on-hand math, and no low-stock reporting. They never warn about negative inventory.

---

## Functions

| Function | Notes |
|---|---|
| **New** | Start a Sale. |
| **Edit** | **Current:** voids the original and duplicates it for editing, preserving the audit trail. **Held:** opens it to prepare for tender. |
| **Search** | Defaults to Current Sales, most recent first, for catching entry errors before end-of-day close. Transaction #, Customer name, and Date each filter it, alongside the original barcode scan; any filter widens scope from Current-only to every non-Open Sale (decision 27). |
| **Copy** | New Sale with the same lines as the selected one. |
| **Void** | **Current Sales only.** Returns stock to sellable inventory, drops the Sale from the pending end-of-day totals, and retains its Sale number. A **Closed** Sale cannot be voided — it is either reopened via Undo End of Day ([M-03](M-03-daily-summary.md), manager-only) or handled as a Return ([E-06](E-06-process-a-return.md)). Voiding settled history would misstate the day's takings. |
| **Cancel Hold** | **Held Sales only.** Releases the held copies back to sellable stock and closes the hold, recording who cancelled it and when. |
| **Log** | Timestamped free-form notes against a Sale. For a **Held** Sale the log additionally shows the hold timeline automatically: when the hold was created, when the customer was contacted and by what method, and how long it has been sitting. |
| **Receipt** | Print, reprint, or email the receipt for any Sale by Sale number. |

### Sale locking and attribution

An **Open** Sale is locked to the Employee who opened it (decision 23). Another Employee cannot add to it or tender it while it is open.

Handing a Sale over is deliberate: the holder puts it on **Hold**, which releases the lock, and any Employee may then re-open it, taking the lock. **The Sale is attributed to whoever holds the lock at tender** — so a Sale one Employee starts and another finishes belongs to the one who finished it.

A lock stranded by a closed browser is broken by `sale_force_unlock`, which proceeds and raises a review flag ([M-04](M-04-manage-users.md) d8).

An Open Sale **suppresses the session lapse** on its terminal ([E-01](E-01-authenticate.md) d10) — otherwise a lapse would strand a locked Sale mid-ring. The lapse is a store setting defaulting to **5 minutes** ([M-06](M-06-settings.md) d45, [architecture](../architecture.md) A-50) with no maximum ([E-01](E-01-authenticate.md) d13); suppression holds whatever it is set to.

### Deposits

Taking money against a Held Sale needs no new state (decision 25). Ring a Sale with **no lines**, tender it to the Customer's account, and the deposit becomes store credit on their balance ([E-07](E-07-manage-customers.md)). The Held Sale displays that balance, so the counter can see the deposit exists. On collection, the credit is drawn down as a **Store Credit** tender.

### Holds

A Held Sale is created two ways:

- an Employee reserves stock on hand from [E-04](E-04-manage-inventory.md), prompting for a quantity; or
- a customer-attached PurchaseOrder line is received, which creates the hold automatically ([M-02](M-02-reorder-inventory.md)).

Holds do not expire. They persist until someone tenders or cancels them, which is why the hold timeline in the log records contact attempts and age — a hold nobody has chased is otherwise invisible.

Held copies count against **available** stock but remain on hand.

---

## Requirements

- The till must complete a Sale even when stock would go negative (see Inherited).
- Every tender on a Sale is individually recorded; the Sale's tender mix is what M-03 reports.
- Line values — price, discount, tax line, condition grade, and title — are **snapshotted onto the Sale line** at the time of sale. Editing or deleting a catalog Record or InventoryItem afterwards never rewrites what a past Sale says it sold for.
- Every Sale, void, hold cancellation, and pay-out is attributed to the Employee who performed it.
- An Employee may take a line below cost at the till freely — no gate and no ReviewFlag (see decision 12). A below-cost *shelf* price does raise one ([E-02](E-02-receive-inventory.md) d35); the difference is that a shelf price persists.

---

## Inherited from other flows

**From [M-04](M-04-manage-users.md):**

- **A Sale's header displays the Employee's name, not their initials** ([M-04](M-04-manage-users.md) d16). Initials are released when a User is deactivated and may be reissued, so they no longer identify one person on their own. Attribution itself is unchanged — the Sale points at the User row.
- **Deactivating the Employee who holds a Sale's lock does not break it** ([M-04](M-04-manage-users.md) d15). Their session ends at once on every terminal, but an **Open** Sale stays Open and finishable, so deactivation never forces a `sale_force_unlock` and never raises the flag that would come with it (decision 23, [architecture](../architecture.md) A-28). Nothing new can be started under those initials anywhere.

**From [E-03](E-03-search-inventory.md):**

- **A provider match is browsable, and putting one on a sale line adopts it** ([E-03](E-03-search-inventory.md) d18, decision 34). Looking one up writes nothing; the act of adding it to a Sale is what pulls it into the local catalog, prompting for a genre where the map cannot resolve one ([M-06](M-06-settings.md) d53). Such a line is **always at zero on hand**, so it takes the negative-inventory path and its ReviewFlag.
- **Local search is as-you-type; the provider answers only on Enter** ([E-03](E-03-search-inventory.md) d21). Finding where a copy sits on the shelf never waits on the provider and never spends a request against its rate limit.

**From [E-02](E-02-receive-inventory.md):**

- **Negative inventory must be supported.** Stock only becomes sellable when its Invoice is finalized, so a physical copy can be on the counter before it exists in the system. The till completes that Sale and mints the copy immediately as an **oversold** InventoryItem — sold from birth, unbacked by any Invoice line yet — rather than blocking it. Reconciliation happens in [E-04](E-04-manage-inventory.md).

**From [E-04](E-04-manage-inventory.md):**

- Reserving stock on hand creates a **Held** Sale here, with a quantity chosen at reservation time.

**From [M-02](M-02-reorder-inventory.md):**

- Receiving a **customer-attached** PurchaseOrder line automatically creates a **Held** Sale for that customer, so the copy cannot be sold off the floor before they collect it.

**From [E-07](E-07-manage-customers.md):**

- **A Held Sale is reachable from the Customer's card**, which shows its hold reference and age and offers to open it *ahead of* attaching the Customer to a Sale in flight ([E-07](E-07-manage-customers.md) d19, d20). The hold reference and the timeline's age are read there, so changing either changes what that screen can say.

**From [M-06](M-06-settings.md):**

- **Tax is resolved from two axes, not by an override.** The Customer's tax group (or, with no Customer, the store's default tax group), the Genre's product tax code, and then the (group, code) cell. **Supersedes step 8's "the Customer's default tax line overrides the item's"** ([M-06](M-06-settings.md) d14).
- **What a Sale line snapshots changes shape.** Not a reference to a tax line, but the tax types resolved and the rates applied, so M-06 d8's never-retroactive rule survives a later rate change. **The tax snapshot is taken at tender** ([architecture](../architecture.md) A-57, decision 33), not when the line is added.
- **A gift card load is a system-owned non-tracked catalog entry** ([M-06](M-06-settings.md) d18), not the bare line kind it is today. Decision 10 is unchanged — loading is a line item, redeeming is a tender — but the line item now has a catalog entry behind it, which is what gives it a genre and therefore a tax code.
- **Non-tracked items carry a genre** like every other sellable thing ([M-06](M-06-settings.md) d17).
- **A cash tender rounds to the nearest five cents, applied by the last tender on the Sale** ([M-06](M-06-settings.md) d21); every other tender settles exact. The Sale total, its lines and its tax are unchanged — the rounding is a property of how the money was taken. A `$34.48` Sale takes `$34.50` in cash, or `$12.13` on debit plus `$22.35` cash with nothing rounded. **The difference is carried by a system-written `rounding` tender** ([M-06](M-06-settings.md) d26) — `−$0.02` here — so the Sale's tenders still sum to its total. It is never a button and no Employee selects it, which means this flow's tender list and its tender *buttons* are no longer the same list.
- **A line in a Section flagged `discountable = false` refuses a till discount** ([M-06](M-06-settings.md) d30). This is **not** a gate and does not amend decision 12 — Employees keep below-cost discounting everywhere else. It is a property of what is being sold: discounting a gift card load is a straight loss with nothing to flag.
- **Sections are an editable table** ([M-06](M-06-settings.md) d28), so `VINYL` and `MERCH` are data rather than the whole list.
- **The till's tender list is configured, and several tenders may share one behavior** ([M-06](M-06-settings.md) d22, d23) — `Visa` and `Amex` are two `card` tenders. A tender may be switched off, and carries no reference field (d24).

**From [M-07](M-07-chart-of-accounts.md):**

- **Inventory is perpetual, so tendering a Sale moves cost** ([M-07](M-07-chart-of-accounts.md) d2). Each copy sold moves **its own recorded cost** from Inventory into cost of goods at that moment — never an average and never a recomputed figure. Nothing changes at the till: this is a consequence of what `sale_tender` already does, not a new step in it.
- **A Sale's business date is the date it was tendered** ([M-07](M-07-chart-of-accounts.md) d19), a **calendar** date ending at midnight, with no separate business-day boundary and no setting for one. That is the same moment [architecture](../architecture.md) A-57 resolves tax at, so the two never disagree — and it means a Sale rung at 00:30 after a late night files on the new day.
- **The day's Sales become journal lines at the close** ([M-07](M-07-chart-of-accounts.md) d7, d14), grouped by `(business date, account)` so a close covering two days files each on its own. A mis-rung tender is therefore worth catching before close — decision 27's Current-Sales search is where, and decisions 31 and 32 are how.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | A Sale is in exactly one of four states: Current, Held, Closed, Void |
| 2 | Sale numbers are **globally unique** and ascending; supplier Invoice numbers remain unique per `(supplier, invoice_number)` |
| 3 | Held Sales carry an `H`-prefixed hold reference, replaced by a Sale number on tender; the hold reference is retained |
| 4 | A voided Sale retains its Sale number — the sequence is never made gapless by reuse |
| 5 | **Void applies to Open and Current Sales.** Held Sales use Cancel Hold instead; Closed Sales are reopened via Undo End of Day (Admin) or handled as a Return |
| 6 | Cancelling a hold is a distinct action from voiding a Sale, and is logged rather than erased |
| 7 | Holds do not expire; the hold log records creation, customer contact, and age |
| 8 | A Sale may be split across multiple tenders; each tender is recorded individually |
| 9 | Card payments are **recorded only** — no integration with a third-party payment processing system (Square, Stripe, or equivalent), no card data captured, no money moved (E-02 decision 26) |
| 10 | Gift cards: **loading** one is a line item; **redeeming** one is a tender |
| 11 | A price of `0.00` prompts the Employee for a price as the line is added |
| 12 | An Employee may price a line below cost at the till **without** a manager override — it proceeds, same as the review-flag behavior receiving uses for the same thing (M-04 decision 8) |
| 13 | Line values are snapshotted onto the Sale line; later catalog edits never rewrite sale history |
| 14 | Second-hand counter buys run through a **Used Credit** tender, settled to store credit or a negative-cash payout |
| 15 | The stock side of a counter buy is a separate E-02 second-hand intake, linked by an optional cross-reference |
| 16 | **Pay-out** is a tender type, requiring a note, appearing as negative cash in the M-03 close |
| 17 | Non-tracked catalog items (freight, services, bulk goods) sell without stock counts and never warn on negative inventory |
| 18 | A manufacturer UPC resolving to multiple sellable copies presents a picker on condition, price, and count |
| 19 | Receipts print on demand after tender and can be reprinted or emailed later by Sale number |
| 20 | A Sale need not have a Customer attached |
| 21 | **A Sale has a fifth state, `Open`** — pre-tender, no Sale number, absent from M-03 totals ([architecture](../architecture.md) A-16) |
| 22 | **Sale numbers are unique per Store**, not chain-wide. Decision 2's "globally unique" was contrasting them against supplier Invoice numbers and predates the multi-store decision (A-11) |
| 23 | **An Open Sale is locked to the Employee who opened it.** Handoff is via Hold; re-opening transfers the lock; **tender attributes to the lock holder.** Closes the employee-attribution open question (A-19) |
| 24 | **Receipts are emailed in v1**, with browser printing as the fallback for a customer with no email address. A thermal receipt printer is post-v1 and opt-in ([architecture](../architecture.md) §4) |
| 25 | **A deposit is a line-less Sale tendered to the Customer's account**, shown as a balance on the Held Sale. Closes the layaway open question using existing machinery (A-25) |
| 26 | **Till rounding is advisory**, consistent with E-02 decision 32. Closes the till-rounding open question (A-24) |
| 27 | **Search is a past-Sales browser, not an item-only lookup.** Default (nothing typed) is Current Sales, most recent first, so an Employee can scan for entry errors before close. Transaction # (Sale number or hold reference), Customer name, and Date join the barcode scan as filters; any one of them widens scope from Current-only to every non-Open Sale, since by then the Employee is after one specific Sale rather than skimming recent activity. Results are Sales, not lines — opening one goes straight to its editor. |
| 28 | **Till actions are placed by who is waiting, not by how often they are used.** Anything reached for with a customer at the counter is on the screen with no click — the scan field, the customer, per-line quantity/price/discount/tax, the PO field, the six tender types, Finish sale, Hold, Void, Return. Anything touched only when nobody is waiting sits behind **Till functions**: searching past Sales, viewing holds, Edit (void-and-duplicate), Copy, and the end-of-day close ([M-03](M-03-daily-summary.md)). Frequency is explicitly not the test — the day close runs daily and is still behind the menu |
| 29 | **The till owns the window rather than scrolling as a document.** Three tracks under the band — the rail, the Sale, the money — each scrolling on its own; the page itself never scrolls. The money rail's head (amount due) and floor (**Finish sale**, then **Hold**) are fixed, so only the tenders scroll between them: Finish sale lands in the same place on a one-line cash Sale and a six-tender split, instead of being pushed below the fold by the tenders above it. The screen carries no page heading or description — the flow ID stays citable from the band. The subtotal line omits the discount clause entirely when the discount is zero, rather than printing "−$0.00" beside the one number the customer reads over the Employee's shoulder. Consequence accepted: below ~1100px the money cannot sit beside the Sale and stay legible from the customer's side, so it drops to a band underneath it |
| 30 | **Till functions live in a rail that collapses to icons.** Closed it is a 52px strip of the things an Employee *starts* — new Sale, new Return, holds, past Sales. Open it is a drawer of the things they *come back to*: Sales in flight, what was tendered today, and the functions from decision 28. The drawer lays **over** the Sale rather than pushing it, because a push would reflow the line list mid-transaction. Counts ride the closed icons (Sales in flight on the arrow, holds on the record) so a collapsed rail still says there is something parked in it. Open/closed is remembered per till and survives a reload, rather than resetting per Sale — a shop that works with it open should not have to fight it. **Recent** and **Open now** print the Customer's name under the transaction number, since a Sale number is only findable by someone who already knows it; a Sale with no Customer says "Walk-in" rather than leaving the line blank |
| 31 | **A Sale can only be voided at zero.** Void (and Edit, which is a Void plus a re-ring) refuses while the tenders do not net to zero; the money must first be refunded, moved onto the Customer's account, or struck as never having happened. Amends decision 28, which had Void sitting with the money: it moves to the Sale's own header, away from the button pressed on every Sale, and **Return** leaves the money entirely for the rail. Consequence being fixed: voiding used to revert the stock and walk away from the money — a gift-card Sale voided left the card drawn down to nothing, and because M-03 totals only Current Sales, the voided tenders left the day's figures while the cash stayed in the drawer |
| 32 | **Changing the tenders on a Current Sale moves real money.** Tender effects used to land only at tender (a gift card drawn down, a Customer's A/R charged), on the assumption that tenders never change afterwards. Decision 31 breaks that assumption deliberately, so adding a reversing tender to a Current Sale credits the account then and there, and striking a settled gift-card tender puts the balance back on the card. Without this, decision 31 would only make the screen read zero while the store kept the money |
| 33 | **A held line re-resolves its tax at tender, and the till says so when the figure moves. Refines decision 13.** A Sale can sit on hold for days, so a rate change ([M-06](M-06-settings.md) d11) can land between ringing a line and taking the money. The rate charged is **the rate in force when the money moves** ([architecture](../architecture.md) A-57) — tax describes what was collected, and nothing is collected until tender. **Decision 13 is unchanged for everything else:** title, artist, grade, price and discount still snapshot when the line is added, because those describe *what was sold*. Only tax waits, and it is still snapshotted rather than referenced, so a completed Sale remains immutable. **The till shows the change** rather than quietly restating the total — a figure that moves between being quoted and being paid is the one a customer will argue about, and an Employee who cannot see that it moved cannot explain it. *Accepted consequence:* a held total is a quote and not a promise, and the shop learns that the first time it happens |
| 34 | **The till may look up anything; putting a provider match on a sale line adopts it first.** Search at the till reaches catalog-provider matches like any other search ([E-03](E-03-search-inventory.md) d18, d21), because the customer asking *do you have this* is standing at the counter and that is exactly where decision 5's *answerable in place* earns its keep. **Selecting one onto a line is a modifying act**, so it triggers the same adoption prompt as ordering or stocking it — one act, one prompt, wherever it happens ([M-06](M-06-settings.md) d53). *Accepted consequence, and it must be said out loud or it reads like a fault:* a title adopted at the till has **zero on hand**, so ringing it goes down this flow's **negative-inventory** path and raises a **ReviewFlag** ([architecture](../architecture.md) A-28). That is correct rather than unfortunate — selling a title the shop has never stocked is precisely a Manager's business — but it means adopt-at-the-till-to-sell will **almost always flag**, and somebody reading the queue should know why |
| 35 | **A pay-out funds itself. It settles a Sale on its own and needs no offsetting tender. Completes decision 16.** d16 has always said what one is — *cash removed from the till for an expense* — and step 15 already settles a counter buy by *"tendering it back as **negative cash**"*. The built till read it the other way: a pay-out was a negative tender that left the Sale **owing**, so the Employee cleared it with a cash tender that no customer ever handed over. A $20 pay-out on an otherwise empty Sale was recorded as `Pay-out -20` **and `Cash +20`**. **That is not a display problem, it is a false record**: the Sale states that $20 entered a drawer it left, and nothing on it says which of the two tenders was the phantom. Every reader of a Sale's tenders was reading an inflated cash figure, not only the ledger. So a pay-out is now **outside what a Sale owes**: money leaving the drawer is the whole of the movement, not half of one, and the drawer is its other half. **`Account Balance (add)` deliberately keeps the old behaviour and is the distinction worth holding on to** — a customer handing over cash to top up their account really is two halves, both real, and excluding it would leave a $50 top-up reading as $50 still owing. *Accepted consequence:* the Sale's arithmetic gains **one special case**, and it has to be stated as a rule about the pay-out rather than about the sign, because the sign is shared with a tender that behaves oppositely. *And it is only half of what d16 promised:* the other half is that the close **reports** it as cash, which the built summary did not — a day whose only cash movement was a pay-out carried no cash line at all. Closed by [M-03](M-03-daily-summary.md) d16. *What this one buys, beyond the record being true:* [M-07](M-07-chart-of-accounts.md) d21's pay-out expense becomes postable. The journal is now a plain two-sided entry — debit the expense, credit the cash — where before it balanced perfectly with both accounts on the wrong side by twice the pay-out, which is the failure M-07 itself describes as the one nothing can detect |
| 36 | **The tender pad offers the store's configured tenders, and a Sale records which one it was.** The pad was a hardcoded list of the seven **behaviours**, so a Sale said `Credit Card` and nothing more. [M-06](M-06-settings.md) d22 gives `Visa` and `Mastercard` separate accounts for a stated reason — *"they settle as separate deposits, and a breakdown that merges them cannot be tied back to a bank statement"* — and [M-07](M-07-chart-of-accounts.md) d21 keeps one account per tender on the same reasoning, so **every card in the day posted to whichever row was listed first** and the reconciliation d22 exists to protect was unreachable from a Sale. Of the two shapes this flow's open question named, only one can work: recording the row *alongside* the behaviour needs something to have chosen a row, and a pad of behaviours never does. So the pad is built from the configuration. It is also what [M-06](M-06-settings.md) d4 always implied — *the display name is configurable, the behaviour is not* — which a pad of hardcoded behaviour names ignored entirely, so a shop that renamed a tender saw its old name at the till. **What is offered and what resolves stay different questions**: a deactivated row is not offered (d9, [architecture](../architecture.md) A-59) and d26's system-owned rounding tender never is, while a Sale already tendered on either still posts where it always did ([M-07](M-07-chart-of-accounts.md) d18). **The behaviour is still what the pad acts on** — what needs a note, a Customer, a gift card code — read back off the row rather than stored twice, because d4 fixes a row's behaviour permanently and the two cannot drift. *Accepted consequence, and it is at the counter:* the pad grows from six buttons to however many tenders the shop configured — nine seeded, eight offered — and a shop that configures twenty gets twenty. **A tender raised for the customer rather than chosen by them** — a gift card redemption, a refund, the reversing tender a void appends — takes the default row for its behaviour, which is the old behaviour exactly |

---

## Open questions

- ~~**What happens when a customer presents a paper credit note?**~~ — **Resolved by
  [E-07](E-07-manage-customers.md) d22**: it is rung as a **discount**. No Customer is
  created and no balance is issued, so the **Store Credit** tender is not involved at all
  and this pad needs nothing new. *The cost lands on this flow's figures:* revenue reads
  low and discounts read high for as long as the paper lasts, and the copy's cost still
  posts, so the sale's gross margin reads as a loss.

- ~~**Rounding at the till**~~ — **Resolved** by decision 26: rounding is a suggestion everywhere, receiving included.
- ~~**Layaway / deposits**~~ — **Resolved** by decision 25: a line-less Sale tendered to the Customer's account.
- **Receipt content and format.** Settled for v1 as an emailed template — logo, header, itemized lines, subtotal, tax per tax line, total, tender breakdown ([architecture](../architecture.md) §4). Paper size stays open until the thermal print agent lands.
- ~~**Employee attribution vs. Sale ownership**~~ — **Resolved** by decision 23: the Sale belongs to whoever holds the lock at tender.
- ~~**Correcting a mis-rung tender after the close.**~~ — **Closed as not a defect.** The two routes that exist are judged sufficient: decisions 31 and 32 correct it on the day with a reversing tender, and after the close [M-03](M-03-daily-summary.md) d4's Undo End of Day reopens the batch for a Manager who judges it worth doing. **No new mechanism is added and none is wanted** — a per-Sale correction after close would be a third way to move money that has already been counted, and the shop handles the residual operationally. Recorded rather than dropped, because [M-07](M-07-chart-of-accounts.md) d10 raised it and the answer should be findable from there. *The original question follows.*
  *Original:* Decisions 31 and 32 give the mechanism — a reversing tender added to a **Current** Sale, netting it to zero — and decision 27 defaults Search to Current Sales so entry errors are caught before end of day. **Both stop at the close.** A **Closed** Sale is not editable ([architecture](../architecture.md) §5.1 enforces it by trigger), so a card tender rung as `Mastercard` when the customer paid cash has two routes the next morning: Undo End of Day, which is manager-only and reverses the **entire batch** to fix one Sale, or nothing. A Return is not the answer — no goods came back. **Raised by [M-07](M-07-chart-of-accounts.md) d10**, which changes what the mistake costs: today it is a wrong line in [M-03](M-03-daily-summary.md)'s tender breakdown; once a journal posts, it is a permanent discrepancy in an asset account that will never reconcile against a bank statement, and nothing detects it because the journal balances perfectly either way.
- ~~**A Sale's tender records the behaviour, not which configured tender it was.**~~ — **Resolved** by decision 36: the pad offers the configured tenders and a Sale records which one. Only one of the two shapes this question named could work — recording the row alongside the behaviour needs something to have *chosen* a row, and a pad of behaviours never does.
- ~~**A pay-out cannot be journalled correctly from what a Sale records.**~~ — **Resolved** by decision 35: it can now, because the Sale records something true. The pay-out stopped being a negative tender that needed funding and became the cash movement it always was in d16's words, so there is no phantom cash tender, nothing to identify as the funder, and the journal is a plain two-sided entry — debit the pay-out expense ([M-07](M-07-chart-of-accounts.md) d21), credit the cash. **The cause was removed rather than the symptom detected**: M-07's close used to report every pay-out as posted on the wrong side, and has nothing left to report.
- **Gift card expiry and escheatment.** Balances currently persist indefinitely; several jurisdictions regulate this.
- **Merging a Sale in flight into a Held Sale.** Raised by [E-07](E-07-manage-customers.md) d20, and deliberately left open there. Folding an Open Sale's lines into an existing hold is a new operation, and it has to answer three things the current rows do not: which lock survives (decision 23 locks an Open Sale to whoever opened it), which identifier survives (decision 3 gives a Held Sale an `H`-reference replaced by a Sale number on tender), and what becomes of the absorbed Sale's log. Nothing is blocked meanwhile — opening the hold and ringing the extra copies onto it reaches the same end state.
