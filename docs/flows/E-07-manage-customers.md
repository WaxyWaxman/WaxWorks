# E-07 — Manage customers

**Actor:** Employee (nothing here is gated)
**Status:** Specified
**Related:** [E-05 Point of Sale](E-05-sell-a-record.md) · [E-06 Process a return](E-06-process-a-return.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md) · [M-03 Daily summary](M-03-daily-summary.md) · [M-08 Keep the general ledger](M-08-general-ledger.md)

**Job:** As an employee, I need to look someone up so I can attach them to a sale, hold something for them, give them their discount, or settle what's owed between us.

**Scope note:** this flow answers PRD §6's open question — **there is a Customer record.** It exists because holds, special orders, store credit, discounts, and receipt-less returns all need somewhere to hang.

---

## Flow

1. Employee opens **Customers** from the top menu. It opens on the card for whichever Customer was **most recently searched or added** — not a fixed default.
2. A search box filters the Customer list by **name, email, or phone** — not account number, since that's a separate, staff-editable field an Employee is more likely to type into the card itself once they've found the right person.
3. Selecting a result opens its card and becomes the new "most recently searched." **New** opens a blank form with every field below; on submit the new Customer becomes the open card.
4. Every field on an open card — including account number — is **edited in place**, directly on the card. There is no separate Edit function; the card itself is the edit surface.
5. **Delete** removes a Customer outright. Past Sales keep their own record of what happened; they simply no longer point at a Customer.
6. From the card, or from a Sale, the Employee can attach the Customer to the transaction in hand.

A Customer is never required. Most Sales are walk-in and anonymous ([E-05](E-05-sell-a-record.md) d20).

---

## Fields

| Field | Notes |
|---|---|
| **Primary ID** | Internal, permanent, incremental. Never reused, never edited, never even shown as editable — it's the one field on the card that isn't a live input. |
| **Account number** | Store-facing reference. Employee-editable in place, must stay unique. |
| **Account type** | e.g. Regular, Staff, Business. |
| **Name** | |
| **Phone**, **Email** | |
| **Contact preference** | Which channel to use when their order arrives — consumed by the hold timeline in [E-05](E-05-sell-a-record.md). |
| **Mailing address** | Line 1, line 2, city, province/state (2-letter), country. |
| **Global discount** | Percentage, pre-filling the line discount on their Sales; a changed line discount always overrides it ([E-05](E-05-sell-a-record.md)). |
| **Default tax line** | Optional override pointing at a line in the tax table, including an exempt line. Covers wholesale buyers, other stores, and out-of-province shipping. Overrides the item's tax line at the till. |
| **Note** | Free-form, visible to every Employee. |
| **A/R balance** | See below. Not directly editable — derived from movements. |
| **History** | Sold items only, most recent first: title, Sale number ("invoice #"), date. |

---

## A/R balance

A Customer's balance is a **single signed figure**, because money can run in either direction:

| Sign | Meaning | Arises from |
|---|---|---|
| **Positive** | The store owes the Customer — store credit | A `Used Credit` counter buy settled to credit, a Return refunded to credit, gift value assigned to their name |
| **Negative** | The Customer owes the store | An outbound customer invoice issued to a business account and not yet paid |

Store credit is drawn down (or added to) by the **Account Balance** tender at the till, which goes either direction ([E-05](E-05-sell-a-record.md)).

> **Naming.** Store credit is technically a *liability* the store owes, so "accounts receivable" only describes the negative-balance half of this field — but "A/R balance" is the name in use, and a single signed figure still beats two fields that can never both be non-zero.

---

## Business customers and outbound invoices

Some Sales go to other businesses rather than over the counter, and those need an **invoice**, not a till receipt. An outbound **customer invoice** is a Sale rendered as a business document — addressed to the Customer, carrying their account number and terms — and settled later against their account balance rather than tendered on the spot.

This is distinct from a supplier **Invoice** ([E-02](E-02-receive-inventory.md)), which is inbound. Both are invoices in the ordinary business sense; the lexicon qualifies which is meant.

---

## Requirements

- A Customer's identity must survive edits to their account number — history hangs off the permanent Primary ID.
- Nothing here is gated; New/Delete and every field edit are plain Employee actions. Deleting must not orphan a past Sale; it just stops pointing at a Customer.
- **Delete is refused while the Customer carries a live reference** — a non-zero account balance, a Held Sale, or open customer-attached order lines ([architecture](../architecture.md) A-54). Not a gate: it is refused at **every** role, because deleting a Customer who owes the store money erases the debt along with the debtor. Decision 12 is unchanged for a Customer with nothing outstanding.
- A Customer's A/R balance is derived from the movements against it, not typed in directly.
- Contact preference must be reachable from a hold, so the Employee chasing it knows how to make contact.

---

## Inherited from other flows

**From [M-03](M-03-daily-summary.md) decision 22:**

- **Account type becomes a reporting dimension.** [M-03](M-03-daily-summary.md)'s report splits sales by
  *Regular*, *Staff* and *Business* — this flow's own field, read rather than copied — with **Walk-in** as a
  fourth bucket for a Sale carrying no Customer. Two consequences land here rather than there. **Changing a
  Customer's Account type moves their whole history** in that report at once, the same shape as
  [M-06](M-06-settings.md) d31's genre remap moving Records between Sections, and the editor says nothing about
  it today. And **a fourth type added here appears in that report with no change to M-03**, which is why the
  split is on the field and not on a rule — so adding one is a reporting decision as well as a customer one.

**From [M-08](M-08-general-ledger.md):**

- **This flow opens empty at migration; nothing is carried in from paper** ([M-08](M-08-general-ledger.md) d8). A supplier debt can migrate as one lump because nobody needs to know which supplier; **a customer balance cannot**, because it is owed to a named person and a total cannot tell a Manager who is owed. So the store runs its paper out — existing credits are honoured from the paper record, and every balance in this flow is one Wax Works issued. *The consequence lands on the ledger rather than here:* outstanding store credit is a real liability that will not appear on a balance sheet until it is spent, so the books understate what the shop owes, in the shop's favour, by a shrinking amount. **What the till does when a paper credit note is presented is open** — see this flow's open questions.

**From [E-05](E-05-sell-a-record.md):**

- Attaching a Customer pre-fills their global discount and default tax line onto Sale lines.
- The **Account Balance** tender moves the A/R balance either direction (draw down or add to) and requires a Customer.
- A `Used Credit` counter buy may settle to store credit rather than cash.
- A **Held** Sale in the Customer's name is surfaced on their card with its hold reference and age, and is the first rung of the card's action ladder (d19, d20). The age comes from the hold timeline; no threshold is applied to it here.

**From [E-06](E-06-process-a-return.md):**

- A refund may be settled to store credit instead of cash.

**From [M-02](M-02-reorder-inventory.md):**

- A Customer may be attached to an order line; on receipt this becomes a **Held** Sale in their name.
- Open customer-attached lines are listed on the card carrying M-02's own status — Pending and Ordered derived from whether a PO number exists, Shipped (with the supplier's expected date), Backordered, and Cancelled as set ([M-02](M-02-reorder-inventory.md) d12, d22).

**From [M-06](M-06-settings.md):**

- **A Customer carries a default tax *group* — M-06's ShortName — not a default tax line, and it no longer overrides anything.** **Supersedes decision 7** ([M-06](M-06-settings.md) d14). The group and the product's tax code are orthogonal coordinates of one lookup; a Customer with no group set resolves through the store's default tax group, as a walk-in does.

---

**From [E-05](E-05-sell-a-record.md) decision 38:**

- **A Customer is detached from an Open Sale at the till; a Held Sale offers Cancel Hold instead.**
  The global discount decision 6 pre-filled **stays on the lines** — a pre-filled value is the line's own, by
  [E-05](E-05-sell-a-record.md) d13's snapshot — while decision 7's tax group **falls away**, tax being resolved
  live against the store default when no Customer is attached. A hold is never detached: decision 19's *Waiting*
  band is the only place a hold nobody has chased becomes visible, and an unattached hold would appear in none.

## Resolved decisions

| # | Decision |
|---|---|
| 1 | **There is a Customer record**, settling PRD §6 open question 1 |
| 2 | A Customer is optional on every Sale; anonymous walk-in is the default case |
| 3 | ~~Customer ID is permanent and internal~~ — **superseded by 11**: renamed Primary ID, still permanent and internal |
| 4 | The A/R balance is a **single signed figure** — positive is store credit owed to them, negative is owed to the store |
| 5 | The balance is derived from movements, never entered directly |
| 6 | A Customer carries a global discount that pre-fills line discounts and is overridable per line |
| 7 | A Customer may carry a **default tax line** that overrides the item's at the till |
| 8 | Contact preference is a field, consumed by the hold timeline when an order arrives |
| 9 | ~~Deletion is manager-only~~ — **superseded by 12**: nothing here is gated |
| 10 | **Outbound customer invoices** exist for business accounts and are settled against the A/R balance rather than tendered |
| 11 | The permanent internal key is called **Primary ID**, not Customer ID — an ascending integer, never shown as editable |
| 12 | **Nothing about a Customer is gated.** Search/New/Delete and every field edit are plain Employee actions |
| 13 | **There is no separate Edit function.** Every field on an open card — account number included — is a live input; changes save directly, no modal, no confirm step |
| 14 | **Search covers name, email, and phone — not account number.** Account number is found by opening the right card, not by searching for it |
| 15 | **Customers opens on the most recently searched or added card**, not a fixed default or an empty state |
| 16 | **History lists sold items only** (qty > 0 item lines from tendered Sales) — title, Sale number, date — not Returns or non-tracked/gift-card lines |
| 17 | **Customers is laid out as the till's three tracks.** The frame becomes [E-05](E-05-sell-a-record.md) d29's, by way of [E-02](E-02-receive-inventory.md) d38, which made the same move for Receiving — a retractable customer slab, the open card, and the account — each scrolling on its own, the frame never scrolling; the screen loses its page heading and description, as the other fixed-frame screens did. The slab **pushes** rather than overlays, for [E-03](E-03-search-inventory.md)'s reason rather than the till rail's: the list and the card are read against each other, so an overlay would cover the half being compared to. Shut it is a 52px strip carrying New, Search with a result count, and the cards actually opened. Customers with something waiting to collect **band above everyone else**, the way Find's slab bands by stock state — it is the only state a Customer can be in that anyone has to act on — and a **Waiting** chip filters to that band, sitting apart from the account-type chips because a live state and a stored field are two axes rather than five equivalent things. The sort applies inside the bands, not across them. Below 1180px the account track drops to a bottom strip. Accepted consequence: that strip carries more fixed chrome than the till's or Find's — a waiting band *and* a balance head — so it is allotted 58dvh against their 42–46dvh, and the card above it gives up that height |
| 18 | **New opens a blank card in the middle track, not a modal. Refines decision 13.** d13 made the card the edit surface; a modal rendering the same fields a second time is that rule stopping one step short. The blank card shows Primary ID as assigned-on-save and disables Delete; Name and a unique account number are its only required fields. A search matching nothing offers **New customer named "…"** with the typed text already in the Name field, because that is the counter sequence — you look someone up first and only then discover they need creating |
| 19 | **The account track carries, in order: what is waiting for them, the signed balance, standing, the two till-affecting fields, on-order lines, and recent sales.** Waiting — Held Sales and customer-attached order lines, each with its age and the Customer's contact preference — sits *above* the balance, because a hold does not expire and nothing else chases it ([E-05](E-05-sell-a-record.md) d7): this screen is where "a hold nobody has chased is otherwise invisible" stops being true. The balance keeps the second slot as the figure that can be wrong in a way that costs money, but renders small and grey at zero rather than spending the top of the track on it — most Customers never carry one. **Standing** is spend this year, spend last year, and lifetime with a sale count, answering PRD G-4 and the Manager's "top customers by quantity or life-time value". It is **reporting only**: the moment it becomes tiers, thresholds, or automatic discounts it has crossed **NG-2**, which says there is no loyalty program. Global discount and default tax line move off the card and under the balance, because those three together are what describe a Customer as a *counterparty* rather than as a person. Accepted consequence: the card becomes two surfaces, and someone hunting for the discount will look on the card first |
| 20 | **The card's primary action is a ladder: open a Held Sale, else attach to the Sale in flight, else start a new Sale.** A Customer with something on the hold shelf outranks an anonymous Sale at the till, because the hold is the one that goes stale silently; where both exist the attach is offered underneath as a secondary rather than dropped. **Merging an in-flight Sale into a Held Sale is explicitly not part of this** and is left open — it is a new operation that has to say which lock survives ([E-05](E-05-sell-a-record.md) d23), which reference survives (d3), and what becomes of the absorbed Sale's log. The recorded move, opening the hold and ringing the extra copies onto it, already puts everything in one transaction |
| 21 | **A balance sheet classifies each Customer's balance by its sign and never nets across Customers. Decisions 4 and 5 both stand untouched.** [M-08](M-08-general-ledger.md) d25's statements need store credit in **liabilities** and unpaid customer invoices in **assets**, and the problem was never the single signed figure — it was **summing**. A customer at **+$200** and another at **−$300** sum to −$100, which belongs on no statement; classified by sign they are **$200 of liability and $300 of asset**, which is the truth. So the rule is a rule about *reading* balances, not about storing them: group by sign, total each group, never add the groups together. *Accepted consequence, and it is the one thing this forecloses:* **a Customer cannot hold store credit and an unpaid invoice at the same time** — the single figure nets them the moment both exist. For a shop this size that is the wanted behaviour rather than a limitation: a customer with $200 of credit and a $200 invoice owes nothing, and saying so is not wrong. It would stop being wanted the day this flow grows terms and aging, which [PRD](../PRD.md) §6 and [architecture](../architecture.md) §11 both still defer |
| 22 | **A paper credit note presented after migration is rung as a discount. No Customer is created and no balance is issued.** [M-08](M-08-general-ledger.md) d8 opens this flow **empty** and honours pre-Wax-Works credits on paper, which leaves [E-05](E-05-sell-a-record.md)'s Store Credit tender with nothing to draw on. Ringing it as a discount needs no mechanism, no record and no migration, and the pile of paper notes **empties on its own**. *Rejected:* creating the Customer and issuing the credit at that moment, which is more faithful — the liability becomes real and the tender works normally — at the cost of a migration happening one customer at a time forever; and a tender of its own, which is a configured row with a GL account ([M-06](M-06-settings.md) d22) built for a case that empties. *Accepted consequence, and it is visible in the books:* **the month a note is honoured shows revenue understated and discounts overstated**, and the copy's cost still posts — so that sale's gross margin reads as a loss. It is bounded, it shrinks, and it is the price of not building a mechanism for a closing window. Managers reading [M-03](M-03-daily-summary.md)'s discount figures during the changeover should know why they are high |
| 23 | **v1 has no receivables side: a business account may owe the store money, and nothing chases it. Decided 2026-09-19 (#86).** Decision 10's outbound invoices and decision 4's signed balance stay exactly as they are — what is declined is everything that would sit on top of them: terms, a due date, aging buckets, and any surface that lists what is overdue. The case is **two or three accounts**, and a flow mirroring [M-05](M-05-accounts-payable.md) for that volume costs more to specify and build than reading the cards costs to do by hand. *Rejected:* a receivables flow of its own, which is the honest answer at a larger volume and is the thing to build the day it arrives; and stamping a due date on an invoice so decision 17's **Waiting** band could float an overdue account, which yields *overdue or not* and never *how overdue*, and reopens decision 21 for a saving two accounts do not justify. **Decision 21 is confirmed rather than touched:** its accepted consequence — a Customer cannot hold store credit and an unpaid invoice at once — stays wanted, because nothing here introduces the terms and aging d21 named as the day it would stop being wanted. *Accepted consequence:* **an unpaid business account is invisible until someone opens its card.** Nothing ages it, nothing lists it, and no figure anywhere says how long it has been outstanding; the Manager who wants to know asks the two or three accounts by name. [M-08](M-08-general-ledger.md) d25's balance sheet still classifies the debt as an asset by decision 21's sign rule, so the books are unaffected — what is missing is **chasing**, not recording |
| 24 | **A Customer may carry an optional credit limit, and it warns rather than refuses: the till warns the Employee at the act that would take the balance past it, the card marks the account as over its limit, and a ReviewFlag tells a Manager. Decided 2026-09-19 (#87).** Blank is the ordinary case and warns about nothing — the field sits with decision 6's global discount and decision 7's default tax line, present on every card and filled on almost none. **Nothing is refused, so nothing needs an override**, and decision 12's *nothing about a Customer is gated* stands untouched: a limit that refused would need a way past it, and under d12 an Employee could raise the limit as easily as breach it — a gate anyone can move is theatre. **The three announcements do different jobs.** The till's warning reaches the one person who can still pause, at the moment it matters. The card's mark survives the Sale that raised it, so a breach is not a toast that scrolls away. The ReviewFlag is the one that answers **decision 23**: d23 accepted that an unpaid business account is *invisible until someone opens its card*, and a limit breach is now the single condition that reaches a Manager without anyone opening anything. **The limit bites on both routes to a negative balance** — decision 10's outbound customer invoice, and an `Account Balance` draw-down at the till ([M-03](M-03-daily-summary.md) d21 splits that tender by direction) — because the balance does not record which door the debt came through. *Accepted consequence:* **a warning stops nothing.** An Employee who clicks past it raises the invoice anyway, the balance grows, and the limit has bought a **record** rather than a control. That is the trade taken knowingly: the alternative refuses a sale to a customer the shop knows by name, over a figure a Manager set months ago. *The kind itself is recorded nowhere:* `review_flags` ([architecture](../architecture.md) §5.2) carries no kind for this, and adding one is `/architecture`'s to settle — see the open question below |
| 25 | **Standing figures are derived per view, never stored, and they are ungated — any Employee sees them, on any terminal, always. Decided 2026-09-19 (#92).** *Derived* is the application of a rule already recorded rather than a fresh choice: [architecture](../architecture.md) §5.1 says *"Balances are derived from movements and never edited"* of the very figure sitting one slot above these on decision 19's account track, and A-35, [A-51](../architecture.md) — a gift card's balance *"is the sum of its movements and is stored nowhere"* — and A-59's *derived, never stored* give the same answer four times. §5.1 closes four named back doors under *no running totals*. The single precedent for storing a total is **A-30's** close summary, stored so that an Undo End of Day cannot quietly restate a past day; standing figures carry no such requirement. *The cost, named:* **lifetime spend is a sum over every Sale the Customer ever made, recomputed each time the card opens.** At this shop's volume that is free, and volume is the one thing that would reopen it. **Ungated is decision 12 holding rather than an exception to it.** [PRD](../PRD.md) G-4 frames customer value as a Manager job, and that framing is **not** taken as a gate: [M-04](M-04-manage-users.md) d2 makes anything off the manager-gated list an Employee action, standing is not on that list, and gating it would put an authorization step on a counter screen for a figure the Employee serving the customer is the natural reader of. Decision 19's *reporting only* boundary — the moment standing becomes tiers or automatic discounts it crosses **NG-2** — is what keeps this safe, and it is untouched. *Accepted consequence, and it is not the obvious one:* the exposure is **not** a customer reading their own figures over the counter, which is their own data. It is that decision 17's slab lists **the cards actually opened** and decision 15 opens this screen on the **most recently searched** card — so whoever is standing at the counter can see the previous customer's name and, now, what they spend. Nothing here mitigates that; the Employee closing the slab is the whole of the control. *Rejected:* a masking control defaulting to hidden, which is the honest shape for shoulder-surfing but would be the first decision of that shape in the set and is worth taking once, across cost as well, rather than here alone; and genuinely manager-only, which reads G-4 as a gate and costs decision 12 |
| 26 | **Want lists are not in v1. Decided 2026-09-19 (#94).** [PRD](../PRD.md) §6 names them as a reason a Customer record might exist, and decision 1 gave the record several better ones — holds, special orders, store credit, discounts, receipt-less returns — none of which needs a want list. A want list is its own surface with its own questions: what matches one, what happens when a match arrives, who is told and how. It is the only one of §6's reasons that is a **new capability** rather than a field on a record that already exists. *Accepted consequence:* **a customer asking to be told when something comes in is written on paper behind the counter**, as today, and decision 19's *Waiting* band does not cover them — it carries Held Sales and attached order lines, which are things the shop already has |
| 27 | **A hold never starts looking overdue: there is no threshold, and its age is the whole of what is shown. Decided 2026-09-19 (#91).** [E-05](E-05-sell-a-record.md) d7 tracks a hold's age and sets no threshold; decision 19 states the age on the account track and leaves the judgement to whoever reads it. This row **confirms that as the answer** rather than leaving it an absence: how long a hold may reasonably sit is a judgement about the customer and the title, and the Employee holding the conversation is better placed to make it than a number in settings. **No new action** — nothing chases, nothing colours, nothing expires. *Rejected:* a configured *n* days at which decision 19's band changes, which needs a figure nobody can defend and would make every hold past it look wrong, including the ones that are fine. *Accepted consequence:* **a hold can sit indefinitely and never look any different**, and decision 19's placing *Waiting* above the balance — so a hold nobody has chased stops being invisible — is the only thing working against that |
| 28 | **Two Customers may be merged, and the merge is ungated like every other act on a Customer. Decided 2026-09-19 (#89).** Two records for the same person is inevitable at a counter, and [M-01](M-01-supplier-margin.md) already merges Suppliers. **The shape follows [M-01](M-01-supplier-margin.md) d9, as [architecture](../architecture.md) A-60's Genre merge does:** every dependent pointer is reassigned to the surviving Customer — Sales, Held Sales, `customer_ledger` movements, attached order lines, gift cards issued to them — and **history is never rewritten**. The absorbed record is emptied rather than its past restated: a Sale that happened under the duplicate still happened, it now points at the survivor. Decision 4's single signed balance is the sum of both sides' movements once they sit under one Customer, which is decision 5's derivation doing its ordinary work rather than a special case. **Ungated, and that is decision 12 holding rather than an oversight.** A merge is the one irreversible act this flow has, which is the argument for a gate — and it is declined: d12 says nothing about a Customer is gated, an Employee at the counter is the person who *knows* these are the same person, and sending them to find a Manager to say so is the [M-06](M-06-settings.md) d19 problem, where the gate sits beside an open field and makes the slow path the permitted one. Nothing a merge reaches is manager-owned; contrast [M-01](M-01-supplier-margin.md) d11, where a Supplier merge moves a **Discount**, which is. *Accepted consequence, and it is the real cost:* **a merge cannot be undone.** Merging two people who merely share a name puts one person's purchase history, balance and holds onto another's, and unpicking it is manual. Nothing here refuses it and nothing asks a second time beyond the confirmation the act itself carries |
| 29 | **The balance's movements are shown on the card, and that is now recorded rather than inferred. A fuller history surface is deferred. Decided 2026-09-19 (#93).** The card already listed them on the reasoning that *a figure with no explanation is one staff distrust*, and this row **confirms it as a requirement** — the list is the explanation of decision 4's signed figure, so removing it would leave money on screen that nobody can account for. Decision 5 derives the balance from exactly these movements, so the list is the derivation made visible and needs no second source. **What is deferred is a *history* surface**: dates to filter by, a range, drill-through to the Sale or Return that caused each movement, an export. That is its own screen with its own questions and it is not in this version. *Accepted consequence:* **a Customer with a long history gets a long list**, with no filter and no paging, and the movement someone is hunting for may be a scroll away |

---

## Open questions

- ~~**What happens when a customer presents a paper credit note?**~~ — **Resolved** by
  decision 22: rung as a **discount**, with no Customer created and no balance issued.
  [E-05](E-05-sell-a-record.md) owns the pad and inherits it.

- ~~**Terms on outbound invoices.**~~ — **Resolved** by decision 23: **v1 has no receivables side.** A business account may owe the store money and nothing chases it. *Original:* Net 30, due dates, and whether anything chases an overdue business account is unspecified — this is the receivables side of the same problem [M-05](M-05-accounts-payable.md) solves for payables.
- ~~**Duplicate customers.**~~ — **Resolved** by decision 28: **yes, and ungated** — the same shape as the Supplier merge ([M-01](M-01-supplier-margin.md) d9), reassigning every dependent pointer to the survivor and never rewriting history. *Original:* Two records for the same person is inevitable at a counter. Merging them — as suppliers can be merged — isn't specified.
- **Data protection.** The record holds name, address, email, phone, and purchase history. Retention, export, and deletion-on-request obligations are unaddressed.
- ~~**Want lists.**~~ — **Resolved** by decision 26: **not in v1**. *Original:* PRD §6 mentions want-lists as a reason a customer record might exist; nothing here implements one.
- ~~**Credit limit.**~~ — **Resolved** by decision 24: an **optional** limit on the card that **warns and never refuses**, at the till, on the card, and to a Manager through the review queue. *Original:* A business account can currently run an unbounded negative balance.

- **Decision 24's ReviewFlag has no kind, and [A-71](../architecture.md) sets a bar for adding one.** `review_flags` ([architecture](../architecture.md) §5.2) lists no kind for a credit-limit breach. A-71 declined a kind for a substituted business date and records the test — *a flag that cannot fire reads like coverage* — while A-76's `ledger_balance_divergence` was admitted expressly because it **can** fire. A breach can fire, and decision 23 has just removed the surface that would otherwise carry it, so the case looks like it passes; but the kind's name, its `subject_type`, whether `actor_user_id` names the Employee who raised the invoice or is null as a system-raised flag ([A-68](../architecture.md)), and which milestone it lands in are all architecture's to decide. Decision 24's **behaviour** is settled; this mechanism is not. _Status: recommended, not yet ratified._
- **Sorting the list.** Decision 17 bands the list but does not order it. The record carries a single **Name** field, so sorting by surname means guessing the final token — which files *Left Bank Cafe (wholesale)* under W. Three ways out: sort the whole string; split the field into given and family name, which leaves every Business card with an empty one; or keep one name field and add an optional **file-under** name, the way a record shop already alphabetises *Beatles, The*. Undecided.
- ~~**When a hold looks overdue.**~~ — **Resolved** by decision 27: **no threshold**, and no new action; the age is shown and the judgement is the Employee's. *Original:* [E-05](E-05-sell-a-record.md) d7 records that a hold's age is tracked, not a threshold at which it should start looking wrong. Decision 19 states the age and leaves the judgement to whoever reads it; if the band should change colour at *n* days, *n* needs a row.
- ~~**Where the standing figures come from, and who should see them.**~~ — **Resolved** by decision 25: **derived per view, never stored**, and **ungated**. *One correction to the question as it was asked:* it said *"Same tension [E-03](E-03-search-inventory.md) settles for cost with a toggle"* — **E-03 settles nothing.** No decision in E-03, E-04, [M-06](M-06-settings.md) or the architecture governs cost visibility; the toggle is prototype behaviour only (`prototype/src/screens/Search.tsx:46`), and under [M-04](M-04-manage-users.md) d2 cost is Employee-visible unqualified. The precedent cited here did not exist. *Original:* Decision 19 records the figures without saying whether they are derived per view or maintained as running totals. PRD G-4 frames customer value as a Manager/Admin job, while decision 12 says nothing about a Customer is gated — so they are shown to Employees, on a counter screen a customer can read over the Employee's shoulder.
- ~~**Whether the balance's movements are meant to be visible.**~~ — **Resolved** by decision 29: **yes**, and the inference is now a recorded requirement. A fuller history surface — filters, a range, drill-through, export — is deferred. *Original:* Decision 5 derives the balance from movements; nothing says the movements themselves are shown. The card shows them, on the grounds that a figure with no explanation is one staff distrust — but that is an inference, not a recorded requirement.
