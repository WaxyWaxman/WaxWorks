# E-04 — Manage the inventory

**Actor:** Employee (some actions manager-only)
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-03 Search the inventory](E-03-search-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-05 Accounts payable](M-05-accounts-payable.md) · [M-07 Chart of accounts](M-07-chart-of-accounts.md)

**Job:** As an employee, I need to look after stock once it exists — correct it, price it, reserve it, hold it back, and raise a claim when a supplier got it wrong.

---

## The titlecard

The **titlecard** is the screen for one Record: its catalog metadata, every copy we hold, and its order state. It is a view, not an entity — the underlying data is a Record and its InventoryItems.

It shows:

| Group | Contents |
|---|---|
| Catalog | Artist, album title, label, catalog number, format, year, country, genre, Section, cover art, manufacturer UPC, catalog provider identifiers |
| Copies | Each InventoryItem or identically-priced group: condition grade, price, cost, internal barcode |
| Stock | On hand, available on hand, in backroom, held, minimum on hand |
| Orders | Pending order, on order, available on order, backordered |
| Notes | Condition note (per copy), item message (visible to every Employee) |

**On hand is derived** — it is the count of sellable InventoryItems, not a stored number that can drift from them. "Available on hand" is that count less copies held for customers.

---

## Functions

| Function | Access | Notes |
|---|---|---|
| **Edit catalog** | Employee | Corrects Record-level metadata. Section, genre, and supplier are constrained to configured values ([M-06](M-06-settings.md)). |
| **Edit copy** | Employee | Condition grade, condition note, price, backroom flag on a single InventoryItem. |
| **Adjust on hand** | **Manager** | A hard correction to stock. Requires a reason code — see below. |
| **Reserve** | Employee | Creates a **Held** Sale ([E-05](E-05-sell-a-record.md)), prompting for a quantity, or attaches a customer to an existing order line ([M-02](M-02-reorder-inventory.md)). |
| **Order** | Employee | Raises a pending order line ([M-02](M-02-reorder-inventory.md)). |
| **Claim** | Employee | Raises a return or credit claim against the supplier Invoice the copy arrived on — see below. |
| **Void or amend Invoice** | **Manager** | Inherited from E-02. A **paid** Invoice is immutable ([E-02](E-02-receive-inventory.md) d40) — before that it is corrected in E-02 itself, and **after** it, if the payment that settled it is voided ([M-05](M-05-accounts-payable.md) d22, [architecture](../architecture.md) A-33a): immutability holds only while the Invoice is paid, so reach for an amendment here only while it still is. The amendment is appended as a separate artifact against the original record, never an in-place edit. |
| **Delete Record** | **Manager** | Removes a catalog Record. Past Sales referencing it are unaffected — line values are snapshotted (E-05 decision 13). |

### Pricing outside receiving

An Employee may change a copy's price on the titlecard. The **below-cost guardrail still applies**, wherever a *shelf* price is set — but it now **raises a ReviewFlag rather than blocking** ([E-02](E-02-receive-inventory.md) d35, decision 16 below). This remains distinct from a discount taken at the till, which raises nothing (E-05 decision 12) — the difference is that a shelf price persists and a till discount is a one-off on a single Sale.

The `.50`/`.99` rounding rule (E-02 decision 9) applies to shelf prices set here, as it does at receiving.

### Adjusting on hand

Hard adjustments are **manager-only** and always carry a **reason code**:

`Shrinkage` · `Damaged` · `Found` · `Miscount / correction` · `Written off` · `Other` (free-text note required)

The adjustment records the reason, the before and after counts, the timestamp, and the Manager who made it. There is no approval step and no cap — a Manager can set the count to whatever reality says it is. The reason code exists so the change is never silent, not to gate it.

This is also how **negative inventory is reconciled**. On hand never actually goes below zero as a stored count — a copy sold before its Invoice was finalized (E-02 decision 21) mints its InventoryItem immediately, **sold from birth**, tagged **oversold**: a promise the physical copy exists, unbacked by any Invoice line yet. Receiving normally resolves it on its own — a later Invoice line for the same Record reconciles the oldest outstanding oversold copy first, before minting any brand-new sellable stock, backfilling the real cost and supplier it never had at the till. Where no shipment is coming to explain it, a Manager forces it to zero as a `Miscount / correction` adjustment instead, with the same audit trail (who, when).

---

## Supplier claims

When a supplier ships short, ships damaged, or bills for something that never arrived, the store claims credit. This is the "return or credit claim" E-02 defers here. It is **not** a customer Return — that is [E-06](E-06-process-a-return.md).

### Flow

1. From a titlecard, or from an Invoice flagged during receiving, Employee raises a **claim** against the copy and selects a reason: `Billed / not shipped`, `Received damaged`, `Short shipped`, `Wrong item`, or free text. The line names **which of that Supplier's received Invoices** it concerns — defaulting to the one the copy arrived on, changeable to any other they have shipped the store stock on, or explicitly **none** (decision 28).
2. Claims accumulate into a **standing batch** — one per supplier, plus one per supplier and separator, the separator chosen as the claim is raised and blank by default (decision 22). The claims screen lists the batches grouped by supplier, respecting the ordering separator ([M-02](M-02-reorder-inventory.md)) so claims can be argued the way orders are sent. A batch has no number until it is sent, and that absence is what "unsent" means (decision 21).
3. Employee sends a batched claim to the supplier's email address. The claim states, per line: the supplier Invoice number the copy arrived on, the reason code, artist, album title, cost, and quantity — plus a combined total.
4. **Claim numbers** auto-generate ascending and are checked for uniqueness; an Employee may enter one manually if the supplier requires their own reference.
5. The claim carries a status of **Pending** or **Credited**. Marking it Credited is a manual action taken when the supplier confirms, and it captures **their credit memo reference and the amount that memo grants** — which need not be what was claimed (decision 20). A claim the supplier declines, or never answers, is **Abandoned** by a Manager with a reason code (decision 24) — closed and kept, stock untouched, and still open to a memo that turns up later. A claim that was **wrong** rather than unpaid is **voided** instead (decision 27), which **returns it to its unsent batch** with its lines and separator intact so it can be corrected and sent again under a new number — the one it used is retired and never reused (decisions 26, 29).
6. Pending claims surface in [M-05](M-05-accounts-payable.md) alongside that supplier's outstanding Invoices, where the credit can be set against a balance owing.

---

## Deferred line problems

E-02 allows an Employee to skip a problem item during receiving rather than stall the whole intake. Those deferrals land here as a work list: the copy exists, its Invoice is finalized, and something about it — no catalog match, an unreadable cost, a grading question — still needs resolving before it is sellable.

---

## Second-hand intake from the public

Buying records over the counter splits across two flows:

- The **money** is a `Used Credit` tender on a Sale ([E-05](E-05-sell-a-record.md)), settled to store credit or a cash payout.
- The **stock** enters through [E-02](E-02-receive-inventory.md) second-hand intake, which is where grading, costing, and internal barcode minting already live.

An optional cross-reference links the two, so a payout can be traced to the copies it bought. Nothing about counter buying needs a third intake path.

---

## Requirements

- On hand is derived from sellable InventoryItems and is never edited directly — only adjusted, with a reason.
- Every adjustment, claim, void, and amendment is attributed to the User who performed it.
- A held copy remains on hand and is excluded from available on hand.
- Minimum on hand is **informational in v1**: it is stored per Record and surfaced in reporting ([M-03](M-03-daily-summary.md)), and does not automatically raise orders.
- Claims are addressed to the supplier Invoice a copy arrived on, so the Invoice must be reachable from the copy.

---

## Inherited from other flows

**From [M-06](M-06-settings.md):**

- **Editing a Record's genre may offer to re-pull its tags from the catalog provider** ([M-06](M-06-settings.md) d54). The tags a Record was adopted under are a snapshot ([architecture](../architecture.md) A-61), so a correction made months later is otherwise read against what the provider said then. The re-pull is **offered, never automatic**, touches only this Record in this Store, and **does not re-run the map** — d53's resolve-once rule is unchanged, and the matched tag is never re-resolved. If the provider is unreachable the edit still saves and only the refresh fails, following [E-03](E-03-search-inventory.md) d8's rule for search.
- **Genre is resolved at adoption and never re-resolved** ([M-06](M-06-settings.md) d53). Editing a Record that is already in the local catalog changes its genre because a person chose to, never because the map moved underneath it.
- **The genre picker shows each genre's product tax code description, and every genre edit is logged** ([M-06](M-06-settings.md) d56, [architecture](../architecture.md) A-62). The field stays ungated (M-06 d19); what changes is that `records` now carries a `log` recording who changed a genre and what it was before.

**From [M-04](M-04-manage-users.md):**

- **Adjustment history displays the acting User's name, not their initials** ([M-04](M-04-manage-users.md) d16). A deactivated User's initials are released to a new hire, so the letters alone no longer identify a person. The stored attribution is unaffected — it points at the User row — but anything this flow *displays* or exports for audit has to resolve through to the name.
- **Adjusting on hand prompts for the acting Employee's initials even inside an active session** ([E-01](E-01-authenticate.md) d12, d15), in addition to the authorizing Manager's ([architecture](../architecture.md) A-28a). Two sets of initials, deliberately.

**From [E-02](E-02-receive-inventory.md):**

- **Void or amend a finalized Invoice** — manager-only, appended as a separate artifact against the original record.
- **Return or credit claim against an Invoice** — an Employee may flag an Invoice during receiving; the handling lives here.
- **Deferred line problems** — an Employee may skip a problem item during receiving and resolve it here.
- **Below-cost pricing raises a ReviewFlag** ([E-02](E-02-receive-inventory.md) d35, amending its decision 10), which applies to shelf prices set here as well as at receiving.

**From [M-05](M-05-accounts-payable.md):**

- **Voiding a *payment* is not voiding an *Invoice*, and does not belong here.** A PaymentBatch recorded in error is voided in accounts payable ([M-05](M-05-accounts-payable.md) d22); this flow still owns voiding and amending the Invoice itself. The two are different artifacts with different reasons: a wrong cheque number is M-05's, a wrong shipment is this flow's.
- **A voided payment can un-freeze an Invoice.** An Invoice taken back out of **Paid** returns to Finalized and is corrected back in [E-02](E-02-receive-inventory.md) directly, *not* by an amendment appended here — the amendment route exists because a paid Invoice is immutable, and it no longer is. Reach for an amendment only while the Invoice is still paid.
- **Void and amend are refused while any live PaymentBatch targets the Invoice** ([M-05](M-05-accounts-payable.md) d37). This flow's void-and-amend route already excluded a **fully** paid Invoice ([architecture](../architecture.md) A-41); d37 extends the refusal to a **partly** paid one, so the order is forced — void the payment in [M-05](M-05-accounts-payable.md) first. The refusal names what is holding the Invoice, so it is discoverable rather than a dead end.

**From [E-05](E-05-sell-a-record.md):**

- **Negative inventory is reconciled here.** The till lets stock go below zero rather than blocking a Sale.
- **Reserve creates a Held Sale**, with a quantity chosen at reservation time.

**From [M-06](M-06-settings.md):**

- **Genre is mandatory on every catalog entry**, non-tracked ones included ([M-06](M-06-settings.md) d17), and it carries the **product tax code** that decides what tax the line attracts (d12).
- **A catalog entry's *tracks stock* setting defaults from its Section but belongs to the entry** ([M-06](M-06-settings.md) d29). Changing a Section's default never reaches entries already created under it.
- **A Record stores its genre; its Section is derived from that genre's required parent, not stored beside it** ([M-06](M-06-settings.md) d31, d32). Overriding a Record's genre therefore moves its Section too — the two cannot be set independently. Tax code, *counts as revenue*, *discountable* and *returnable* are resolved when they apply rather than copied onto the Record, so correcting a genre or a Section corrects everything beneath it. Completed Sale lines are unaffected — they keep what they resolved ([E-05](E-05-sell-a-record.md), M-06 d8).
- **Editing a Record's genre stays an Employee action and is not gated** ([M-06](M-06-settings.md) d19). The shop-internal genres — `Shipping`, `Services`, `Gift cards` — are omitted from the genre picker rather than gated, so they cannot be selected for a music Record.

**From [M-07](M-07-chart-of-accounts.md):**

- **An on-hand adjustment writes its own journal entry when it is made** ([M-07](M-07-chart-of-accounts.md) d12), and **each reason code maps to its own account** ([M-07](M-07-chart-of-accounts.md) d6) — `Shrinkage`, `Damaged`, `Found`, `Miscount / correction`, `Written off` and `Other` are six accounts, not one, because the six exist precisely so a Manager has to choose between them. It does not wait for a close and there is no month-end routine.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | The **titlecard** is the screen for one Record and all its copies — a view, not an entity |
| 2 | **On hand is derived** from sellable InventoryItems, never stored as an independently editable number |
| 3 | Hard on-hand adjustments are **manager-only** and require a reason code |
| 4 | Reason codes: Shrinkage, Damaged, Found, Miscount / correction, Written off, Other (note required) |
| 5 | Adjustments have no approval step and no cap — the reason code makes them visible, not gated |
| 6 | Negative inventory is reconciled by finalizing the Invoice, or by a reason-coded adjustment |
| 7 | ~~Employees may change a copy's price; shelf prices below cost still require a manager override (E-02 decision 10)~~ — **superseded**: below-cost still proceeds, it just raises a review flag instead (M-04 decision 8) |
| 8 | `.50`/`.99` rounding applies to shelf prices set here (E-02 decision 9) |
| 9 | Supplier claims are raised per copy against the Invoice it arrived on, batched by supplier and separator, and emailed |
| 10 | Claim numbers auto-generate ascending and are unique; manual entry is permitted |
| 11 | A claim's status is **Pending** or **Credited**; marking it Credited is manual |
| 12 | Pending claims surface in M-05 against that supplier's outstanding balance |
| 13 | **Minimum on hand is informational in v1** — reported, never auto-ordering |
| 14 | Counter buying needs no third intake path: money via E-05 `Used Credit`, stock via E-02 second-hand intake, linked by an optional cross-reference |
| 15 | Deleting a Record does not alter past Sales, whose line values are snapshotted |
| 16 | **Below-cost shelf pricing raises a ReviewFlag rather than blocking.** **Amends decision 7**, following [E-02](E-02-receive-inventory.md) d35 and [M-04](M-04-manage-users.md) d8 |
| 17 | **`.50`/`.99` rounding is a suggestion, not a rule.** **Amends decision 8**, following [E-02](E-02-receive-inventory.md) d32 |
| 18 | **Reconciling negative inventory clears the oversold InventoryItem** the Sale minted — either by finalizing the Invoice that brings the real copy in, or by a reason-coded adjustment. Makes decision 6 concrete ([architecture](../architecture.md) §5.1) |
| 19 | **A negative-inventory Sale mints its InventoryItem immediately** — sold from birth, tagged **oversold** — rather than the on-hand count itself going below zero. It reconciles automatically (oldest outstanding oversold copy first, ahead of minting new stock, backfilling cost/supplier) when a matching Invoice line is later received, or via a `Miscount / correction` adjustment when there's no shipment to explain it |
| 20 | **The supplier's credit memo is the point of truth, not the claim.** Marking a claim **Credited** captures the memo's reference *and* **the amount it grants**, which is recorded alongside the claim total rather than replacing it. The two commonly differ: a supplier grants £28 against a £34 claim, having deducted the cost of the return. **The credited amount is the figure that counts** — it is what [M-05](M-05-accounts-payable.md) d26 puts into the Supplier's balance, what d27 lets a Manager attach to debits, and what d28 consumes whole. The claim total stays on the record as *what was asked for*, so the shortfall is visible rather than lost: “claimed £34, credited £28” is a fact about this supplier worth being able to read. **Nothing is written off.** A Pending claim counts for nothing (d12, [M-05](M-05-accounts-payable.md) d26), so a claim never enters the balance at its own total and there is no moment at which £34 was counted and has to be corrected down — the balance only ever sees the £28. A memo granting **more** than was claimed is equally valid and handled by the same rule. *Accepted consequence:* the shortfall is **derivable but not posted**, so it appears nowhere as a cost. Anything that wants to report what claims actually recover has to compare the two figures itself |
| 21 | **"Unsent" is derived from the absent claim number, not a third status. The enum stays `Pending` \| `Credited`.** **Confirms decision 11 rather than extending it**, and corrects the prototype, which carries a `Draft` value decision 11 never admitted. Decision 10 assigns the claim number **on send**, so *has no number yet* is exactly the set of claims not yet sent — the state is already in the data and a second copy of it would only drift. Follows [architecture](../architecture.md) A-35's rule directly: a stored status holds the values a person **sets**, and nobody sets *unsent* — it is the absence of an act, the same way A-33b refuses a stored `paid`. ~~*Accepted consequence:* the claim number stops being merely an identifier and becomes **load-bearing state**.~~ — **the derivation is superseded by decision 25**, which keys sent-ness on decision 23's sent date instead; the number is an ordinary unique reference again and the consequence named here no longer applies. Everything else in this row stands |
| 22 | **Claims accumulate into a standing batch — one per Supplier, plus one per Supplier and separator — and sending a batch is what turns it into a numbered claim.** Makes step 2's *"claims accumulate"* concrete and extends decision 9. A raised claim line drops into the batch matching the **separator chosen as it is raised**, blank by default and therefore the base batch. **The separator is not inherited from the PurchaseOrder the copy arrived on.** That letter ([M-02](M-02-reorder-inventory.md) d3) splits *outgoing* streams, and by the time a copy is in hand the stream that carried it has been sent and closed; reusing it would batch claims by an accident of ordering history rather than by how the store wants to argue them. Most claims belong in the base batch and breaking one out is a deliberate act, which is what a blank default says. Sending assigns the number (decision 10), stamps the sent date (decision 23), and is the moment a batch becomes a claim. *Accepted consequence:* **the batch goes whole — nobody picks lines at send time.** A line that should not travel with the rest has to be given a different separator before the batch goes, or be raised again after it has gone. That is a narrower control than a tick-what-you-send screen would offer, and it is the point: the separator has already answered the question, so asking it twice would let the two answers disagree |
| 23 | **A claim records when it was sent, written in the same act that assigns its number.** Extends decision 10. The figure it buys is **days waiting**, which is the only basis on which this flow can sort, filter or press — and, more importantly, the thing that **prompts** the disposal decision 24 adds. Without it a claim nobody answers is not a decision anyone ever takes; it is a row that sits. It is a **stored timestamp, not a reading of the log**: the log already narrates the send, but prose is not a sort key, and a screen that bands by age needs a column. This is the one place in this flow where storing beats deriving, and it is cheap — the same write already assigns the number. **Not aging bands.** A per-row figure, one sort and one chip is the whole affordance; 30/60/90 buckets are a report, and a per-row fact and a report are different things (the line [M-05](M-05-accounts-payable.md) draws for the same reason). *Accepted consequence:* a claim now carries **two dates that answer different questions** — when it was raised and when it was sent — and a screen showing the first where it means the second is wrong in a way nothing would catch |
| 24 | **`Abandoned` is a second terminal disposition beside Credited: manager-only, reason-coded, and appended rather than deleted.** **Partly answers the "claim resolution beyond Credited" open question** — the half about a supplier who **denies** a claim, which previously had no status and no act. It covers three cases with one disposal: they declined it, they never answered, or it is not worth chasing. Reasons are `Declined by supplier` \| `No response` \| `Not worth chasing` \| `Other` (note required), the shape decision 4 uses for adjustments. **Manager-only, following decision 3**: abandoning writes off money the store is owed, which is the same kind of act as a hard on-hand adjustment; the reason code makes it visible and, per decision 5, there is no approval step and no cap. **Stock is unaffected, and this needs saying** because *write it off* reads like an inventory act: the copies left on hand when they were adjusted out under decisions 3 and 4, and abandoning only stops the store expecting money. **The claim is closed and kept, never deleted** — it keeps its lines and carries its reason, the append-rather-than-erase shape [E-02](E-02-receive-inventory.md) step 23 sets for finished artifacts. **A memo arriving later may still mark it Credited from there**: abandoning is giving up, not forbidding, and a claim that was written off and then honoured is an ordinary Credited claim at the memo's figure (decision 20). Because an abandoned claim is neither Pending nor Credited, it **does not surface in [M-05](M-05-accounts-payable.md)** (step 6, decision 12) and never counted toward a balance in the first place ([M-05](M-05-accounts-payable.md) d26). *Accepted consequence, and it is the one to watch:* **raising a claim is an Employee act and disposing of a dead one is not**, so an Employee can create work that only a Manager can clear. A queue one role fills and another drains will back up unless somebody looks at it — which is what decision 23's days-waiting figure exists to make visible |
| 25 | **Sent-ness derives from the sent date, not from the claim number. Supersedes the *derivation* in decision 21; its principle stands untouched.** Decision 21 keyed "unsent" on the absent claim number and named the cost itself — the number became load-bearing state. The column was the wrong one: **decision 10 designs the number to be typed by a person**, and hanging a derived state on a hand-entered reference is a hazard by construction. Decision 23 had already produced the right column in the same act — a **sent date the system stamps**, which nobody has a reason to edit. Deriving from it keeps every word of decision 21 true (still derived, still no third status, still [architecture](../architecture.md) A-35's rule) and **removes the hazard rather than guarding it**, which is the move A-41 makes when it dissolves a collision instead of rescheduling around it. *Accepted consequence:* two facts are now written in one act, and **nothing in the row's shape stops them drifting** — a claim carrying a number with no sent date, or the reverse, is incoherent and only the write path prevents it |
| 26 | **The claim number is ours, not theirs: unique, assigned on send, never changed and never reused.** Extends decision 10 and answers what decision 25 left over. **The supplier does not key on our number** — they answer with their own credit memo reference, which decision 11 captures and decision 20 makes the point of truth — so a number that is wrong costs nothing and is not worth an edit path. Uniqueness is the only property it has to hold. It is therefore **frozen once assigned**: a claim whose number is wrong is **voided and raised again** (decision 27), never corrected in place. Decision 10's manual entry is untouched — it happens *at* send, before the number is frozen, for the occasional supplier who insists on their own reference. *Accepted consequence:* **the sequence has gaps.** A voided or abandoned claim keeps its number forever, so the highest number is not a count of anything and must never be read as one |
| 27 | **A sent claim is voided, never edited — and voiding is not abandoning.** Completes decision 26 and sits beside decision 24 without overlapping it. The two disposals answer different questions and both keep the row:
| 28 | **A claim line names an Invoice the store actually received stock on from that Supplier — chosen from that set, never typed — or is explicitly against no Invoice at all.** **Resolves the rest of the "claim resolution beyond Credited" open question**, the half about a supplier crediting against a *different* Invoice than the one claimed. They may: the reference is not pinned to the shipment the copy arrived on. What it may **not** be is a number nobody in the store has ever seen. The eligible set is the Invoices that Supplier **has actually shipped this Record to the store on** — finalized, and carrying a line for it. Not merely every Invoice of theirs: a claim about a copy of *Rumours* may point at any *Rumours* shipment from them and at nothing else, which is what makes the reference **checkable** rather than merely bounded. It is a Record-level set on purpose — a *copy* arrives on exactly one Invoice, so a copy-level list would always hold one entry and there would be nothing to choose. Where they have never shipped the Record, the only honest answer is the no-Invoice one below. **The reference is evidence, not routing, and this is the sentence to remember.** A claim credit settles the **supplier balance** ([M-05](M-05-accounts-payable.md) d6, d26) and what it attaches to is decided by ticking at settlement (d27, d33) — so the Invoice on a claim line says *what the store is arguing about*, and never where the money nets off. Reading it as routing would put two mechanisms in charge of one outcome. **A line may also be marked as against no Invoice**, deliberately and per line. That is a different fact from an Invoice that merely lacks a supplier's number — [E-02](E-02-receive-inventory.md) d1 already gives every Invoice a reference, auto-generating `REF####` where the paperwork had none — so "no Invoice" here means *not about a particular shipment*, not *the shipment has no number*. Being an explicit choice rather than a blank is the whole point: a field someone forgot and a field someone meant look identical otherwise. *Accepted consequence:* the store can no longer record a claim against a shipment it has not received, which is occasionally what a supplier's own paperwork will assert. Those become no-Invoice lines, and the argument that they concern a particular delivery lives in the note rather than in a field anything can check |
| 29 | **A void returns a claim to unsent — it is a reversal, not a disposition.** **Amends decision 27**, which called voiding a *second terminal disposition beside Credited* and put the claim in the closed list. That loses the work: the lines were right to raise even where the claim was wrong to send, and re-raising each one from its titlecard is a heavy price for a mistake in the sending. What a void does is **retire the number** (decision 26 unchanged — never reused) and return the claim to **unsent**, keeping its lines, its notes and its **separator**, so it reappears in the standing batch it came from (decision 22), ready to be corrected and sent again under a new number. This is the shape [M-05](M-05-accounts-payable.md) d22 already uses and the reason it gives: voiding a payment **returns money to the balance** rather than deleting what was owed. A void restores the prior state; it disposes of nothing. Decision 27's distinction still holds and is the point of the act — *abandon* says the claim was right and no money is coming, *void* says the claim was wrong — but only abandoning ends it. **The terminal dispositions are therefore `Credited` and `Abandoned`, and both are statuses**, recorded as [architecture](../architecture.md) **A-46**. *Accepted consequence:* a claim may now be sent, voided and sent again without limit, so **one claim can retire several numbers**. The sequence's gaps are no longer one per claim, and a claim's send history lives in the void rows rather than on the claim |
| 30 | **A claim's quantity is not bounded by the copy or the Invoice line it names, and the same copy may be claimed twice.** Nothing checks a claim line's quantity against what the Invoice says arrived, and nothing stops one `itemId` appearing on two lines of a batch. That is deliberate, not an omission. **A claim is an assertion to the supplier, not a statement of system fact.** The reason claims exist at all is that what the paperwork says arrived and what actually arrived differ — so bounding a claim by the Invoice line would make the document being disputed the authority on the dispute. From the supplier's side the *same* copy can legitimately be claimed more than once: a replacement that arrives damaged too, a credit agreed and never issued, a carton short a second time. **The brakes are downstream and human, and they already exist**: decision 20 makes the supplier's credit memo the point of truth about the amount, marking a claim Credited is manager-only, and decisions 24 and 27 dispose of claims that were wrong — abandoning one that will not be paid, voiding one that should never have been sent. *Accepted consequence:* the store can ask for more than it is owed and nothing in the system will say so. That is a mistake a person makes and a supplier corrects, and it is cheaper than a guard that blocks the legitimate case to prevent a recoverable one |
**Void** says *this claim was wrong* — wrong lines, wrong number, raised against the wrong copy, raised in error. It should never have been sent, and re-raising means a **new claim with a new number**. **Abandon** (decision 24) says *this claim was right and no money is coming*. Reading one for the other loses the distinction between a mistake and a loss, which is the only thing the list is worth consulting for later. Manager-only, **following decision 24** for its reason — disposing of a sent artifact is the same standing as writing one off. The void is **appended as its own artifact, never a column on the claim**, following [M-05](M-05-accounts-payable.md) d22 and [architecture](../architecture.md) A-36's *"a void is a row, never a column"*: a `voided_at` on the claim would be an update to the very row the void exists to leave alone. A voided claim is neither Pending nor Credited, so like an abandoned one it **does not surface in [M-05](M-05-accounts-payable.md)** (step 6, decision 12). *Accepted consequence:* two terminal dispositions now end a claim and keep it readable, distinguished only by meaning. Anyone reading the closed list has to know which question they are asking — *did we get paid* or *was this claim real* — and the screen has to answer both without blurring them |

---

## Open questions

- **Batch stock-take.** Reason-coded single adjustments are specified; counting a whole Section against the shelf and reconciling in one pass is not. It needs a session concept — count in progress, variances, then commit.
- **Claim resolution beyond Credited.** ~~A supplier may **partially credit**~~ — **resolved by decision 20**: the memo's amount is captured and governs, so a part credit is an ordinary Credited claim at the memo's figure. ~~Still open: a supplier who **denies** a claim outright~~ — **resolved by decision 24**: a denial is one of three reasons a claim is **Abandoned**, which is the terminal disposition v1 previously lacked. ~~Still open: a supplier who issues a credit note **against a different Invoice** than the one claimed~~ — **resolved by decision 28**: they may, so long as it is an Invoice the store actually received stock on from them. The reference is evidence of what is being argued, never where the credit lands — that stays [M-05](M-05-accounts-payable.md) d27's selection. **This open question is now closed in full.**
- **Re-grading a copy after it is sellable.** Editing a copy's grade is permitted, but a copy that was sold at a grade it no longer carries is a data question the snapshot rule sidesteps rather than answers.
- ~~**Who may delete a Record with stock on hand?**~~ — **Resolved by [architecture](../architecture.md) A-54**: nobody, at any role. Deletion is refused while a live reference exists — sellable or held copies on hand, or outstanding PurchaseOrder lines — and the Manager gate on Delete Record applies only once none does. Past Sales are never touched; line values are snapshotted (E-05 d13) and the reference is nulled.
- **Bin location** — see [E-03](E-03-search-inventory.md).
