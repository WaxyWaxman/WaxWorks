# M-02 — Re-order inventory

**Actor:** Manager (Employees raise pending orders)
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-03 Search the inventory](E-03-search-inventory.md) · [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [E-07 Manage customers](E-07-manage-customers.md) · [M-01 Supplier margin](M-01-supplier-margin.md)

**Job:** As a manager, I need to restock what's selling before it runs out.

---

## Shape of the flow

Ordering is two-stage, matching who does what in the shop:

- **Employees raise pending order lines** from a titlecard as they notice gaps or take customer requests. A pending line has no PurchaseOrder number and has not been sent anywhere.
- **Managers process pending lines into PurchaseOrders** and send them to suppliers.

A **bulk entry sheet** is a third door into both stages, for a list rather than a
title at a time: it scans items into one batch and either raises them as pending or
records them as already placed with a supplier's own reference, for an order that
went out on the supplier's website or over the phone (decisions 25, 28).

---

## Phase 1 — Raising a pending order line *(Employee, from [E-04](E-04-manage-inventory.md))*

1. Employee selects **Order** on a titlecard.
2. System prompts for:
   - **quantity**;
   - **supplier**, defaulting to the Record's preferred supplier but freely changeable — the supplier is recorded on the order line, not on the Record;
   - **ordering separator** — a single optional letter, blank by default (see below);
   - **selling price**, defaulting to the current shelf price;
   - **customer**, optionally, making this a customer-attached line;
   - **follow-up flag** — a number of days after which the line should be chased if it still hasn't arrived.
3. The line joins that supplier's pending pile.

### The ordering separator

A single optional letter that splits one supplier's pending lines into parallel streams so they can be sent as separate PurchaseOrders. It exists so special-consideration orders can be broken out onto their own paperwork — a front-list-only order, a rush, a customer special — without disturbing the supplier's regular pending pile. Claims are batched by the same separator ([E-04](E-04-manage-inventory.md)).

---

## Phase 2 — Processing into a PurchaseOrder *(Manager)*

4. The order processing screen lists **one line per supplier + separator**, showing:

| Column | Source |
|---|---|
| Pending total | Count of lines in that stream |
| Age of oldest line | When it was raised |
| Order via | The supplier's configured method |
| Customer-attached count | How many lines are spoken for |
| Sell total | Sum of selling prices |
| Estimated cost | Sell total less the supplier's discount |
| Ready | Whether the supplier's minimum order quantity or minimum amount is met ([M-01](M-01-supplier-margin.md)) |

Below the pending streams, previously placed PurchaseOrders are listed most-recent-first with their PO numbers.

5. Manager may **View** a stream line by line before sending. Highlighting a line opens its titlecard, so a wrong supplier is caught before the order goes out. View also shows the stream's progress toward the Supplier's minimum (qty, retail value, and estimated cost against whichever one the Supplier's minimum actually names) and, while the stream is still pending, is where a line's **quantity**, **selling price**, and **separator** are edited, and where a line is deleted (decision 9's mechanism).
6. Manager **Processes** the stream. The system confirms the send method and:
   - **Email** → composes and sends the order to the supplier's address, stating items, quantities, cancel-by date, and backorder policy.
   - **Phone, fax, website, or rep** → produces a printable order document for the Manager to act on manually, then marks the stream placed.
7. A **PO number** is offered — blank auto-generates the next unused ascending number; a Manager may enter one manually.
8. On placement, the lines become **on order** and the catalog metadata **prefetch** for those titles is queued (see Inherited).

---

## Phase 3 — Tracking what's on order

9. The on-order screen lists individual outstanding lines, oldest first. Lines past their **follow-up flag** date show at the top, marked.
10. Available actions:

| Action | Notes |
|---|---|
| **Search** | Barcode scan or keyword |
| **Sort** | Age, title, artist |
| **Filter** | By PurchaseOrder or supplier |
| **Re-flag** | Push the follow-up date out another *n* days — used both to chase the supplier and to warn a waiting customer |
| **Set status** | Mark a line **Shipped** (with the supplier's expected date), **Backordered**, or **Cancelled** (decisions 12, 22) |

11. **On receipt** ([E-02](E-02-receive-inventory.md)), a customer-attached line automatically creates a **Held** Sale for that customer, so the copy cannot be sold off the floor before they collect it. The hold's timeline begins there ([E-05](E-05-sell-a-record.md)).

---

## Cancelling and unwinding

| Situation | Behavior |
|---|---|
| **Delete a pending line** | Low friction — a plain confirmation. If a customer is attached, the warning says so explicitly, because someone will need to be told. A line that has been **placed** is never deleted: it is Cancelled, or it is received (decision 21). |
| **Cancel a placed line** | Sets status Cancelled and warns clearly: **this does not cancel anything with the supplier.** A person still has to contact them. |
| **Void a PurchaseOrder** | Manager-only. Returns all unreceived lines on that PO to pending, with the same warning — the paperwork is reversed here, not at the supplier. A part-received line keeps what arrived and returns the remainder as a new pending line (decision 24). |
| **Bulk status update** | Sets every unreceived line on a PO to Cancelled or Backordered at once, for when a supplier confirms a whole order is dead or delayed. |

---

## Requirements

- The supplier is recorded **on the order line**, not on the Record. The same title may be bought from different suppliers over time without rewriting history.
- Cancelling or deleting anything already sent must never imply the supplier has been told.
- A customer-attached line must remain traceable to its customer through placement, receipt, and hold creation.
- Reordering applies to titles a supplier can actually resupply. Second-hand and one-off stock can be ordered by hand where a supplier exists, but no automated resupply is implied.

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- **Catalog metadata prefetch happens here.** When a PurchaseOrder is placed, metadata for the ordered titles is fetched in bulk so receiving mostly hits the local database rather than calling the provider per scan.
  - The provider is **MusicBrainz** (decision 14), whose search accepts **several barcodes per request** as a Lucene `OR` query — so a PO resolves in a handful of calls rather than one per line. Still a background job rather than an instant operation, but minutes shorter than the Discogs figure this note originally carried (*N* calls at roughly 60/min, about five minutes for a 300-line PO).
  - Prefetch only covers stock ordered through the system. Second-hand buys, unsolicited items, and anything received before there is PO history will still miss, so live lookup at the receiving desk remains a supported fallback.
- **Backorders are tracked.** The supplier's `Balance` column is the source.
- **A scan at the receiving desk attaches to a matching PO line automatically** (decision 20), so a PO line's derived outstanding quantity closes without anyone confirming it. Unbarcoded copies are picked from Receiving's worklist instead ([E-02](E-02-receive-inventory.md) d42).

**From [E-04](E-04-manage-inventory.md):**

- Minimum on hand is informational in v1 and does **not** raise orders automatically.

**From [E-07](E-07-manage-customers.md):**

- **A customer-attached line's status is read on the Customer's card**, which lists their open lines with the status set here — Pending and Ordered derived from whether a PO number exists, Shipped with the supplier's expected date, Backordered, Cancelled (decisions 12, 22) — alongside anything already held for them ([E-07](E-07-manage-customers.md) d19). This is a second consumer of the traceability the requirements above already demand; it adds no new obligation, but it does mean a status renamed here is renamed on a counter screen.

**From [M-06](M-06-settings.md):**

- **The stream aging threshold is one store setting defaulting to 14 days** ([M-06](M-06-settings.md) d41), resolving this flow's *aging threshold* open question at the simplest of the three shapes it offered. Per-Supplier stays the open door.
- **A line's follow-up flag defaults from the Supplier's expected lead time** ([M-06](M-06-settings.md) d42, field on [M-01](M-01-supplier-margin.md)). Decision 8's day count is optional at the raise step, so a line nobody typed a number onto could never read overdue; the default closes that. The per-line value stays editable and re-flaggable as decision 18 has it.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Ordering is two-stage: Employees raise pending lines, Managers process them into PurchaseOrders |
| 2 | The **supplier is recorded on the order line**; a Record's supplier is only a default |
| 3 | The **ordering separator** is a single optional letter splitting a supplier's pending lines into independently sendable streams |
| 4 | Order processing groups by supplier + separator and shows age, counts, sell total, estimated cost, and readiness |
| 5 | PO numbers auto-generate ascending and are unique; manual entry is permitted |
| 6 | Email orders are composed and sent by the system; all other methods produce a printable document and are marked placed manually |
| 7 | Reorder suggestion is **manual in v1** — the system does not propose reorders from velocity or minimum on hand |
| 8 | Each order line carries a **follow-up flag** in days, re-flaggable, surfacing overdue lines at the top of the on-order screen |
| 9 | A pending line may be deleted with a plain confirmation, with an explicit warning when a customer is attached |
| 10 | Cancelling a placed line or voiding a PurchaseOrder **never** implies the supplier has been notified |
| 11 | Voiding a PurchaseOrder returns its unreceived lines to pending |
| 12 | Order lines carry a status including **Backordered** and **Cancelled**, settable individually or in bulk per PO |
| 13 | Receiving a customer-attached line automatically creates a **Held** Sale for that customer |
| 14 | **The catalog provider is MusicBrainz**, whose search batches several barcodes per request. **Amends the prefetch note** in Inherited, which was written against Discogs' per-barcode ceiling ([architecture](../architecture.md) A-12, A-12a) |
| 15 | **An Invoice may span several PurchaseOrders**, so a PO line's outstanding quantity is derived from what has been received against it across every Invoice ([E-02](E-02-receive-inventory.md) d28, d30) |
| 16 | **PO auto-numbering starts ascending from 0** and skips any number already in use, including a manually entered one — the same pattern as the Supplier Claim number (E-04 §"Supplier claims"). A manually entered PO number is free-text and need not be numeric. |
| 17 | **Changing a separator that lands on one already in use for that Supplier prompts to merge**, warning it can't be undone — separators exist to keep streams deliberately apart (decision 3), so recombining them is treated as a real, one-way action rather than a quiet field edit. Applies both to retargeting one still-pending line (from View) and to mass-shifting an entire pending stream at once (the pending table's own Sep dropdown). Landing on an unused separator (including a freshly typed letter) just moves it, no prompt. |
| 18 | **Re-flag sets a fresh due date — `today + n days`, replacing whatever was there — rather than adding to the old deadline.** "Push the follow-up date out another *n* days" (step 10) was ambiguous between the two; restarting the window is what makes sense for both stated purposes (chasing the supplier again, or telling a waiting customer "n more days") — an *additive* extension would let an already-overdue line's new due date still land in the past. |
| 19 | **An overdue line always sorts to the top of the on-order screen, but the on-order and overdue groups are each sorted by whatever the current Sort is** (Age/Title/Artist) — overdue-first is a fixed grouping, not a separate sort mode of its own. |
| 20 | **A scan attaches to a matching PurchaseOrder line automatically; everything else is picked by hand.** Resolves the *Backorder auto-matching* open question's first half. A barcode that matches an outstanding line for that Supplier attaches to it and carries its expected cost and quantity forward, detachable by the employee — asking every time would be a prompt that answers itself on the overwhelming majority of scans. What cannot be matched that way is picked from the worklist Receiving keeps in its Invoice track ([E-02](E-02-receive-inventory.md) d42): an unbarcoded copy has nothing to match on, and a line that attaches to nothing is what leaves a derived backorder open forever (E-02 d30). The question's second half — whether an outstanding backorder should suppress duplicate reorder suggestions — stays open, and waits on suggestions existing at all |
| 21 | **A placed order line is never deleted — it is Cancelled, or it is received.** Receiving a line does not remove it either. **Clarifies decision 9**, which stays true for a line that has never been placed: nothing has gone to a supplier, so a plain confirmation is right. Once a PO number exists, deletion is the wrong verb — decision 11 returns unreceived lines to pending, decision 12 sets a status on them, and [E-02](E-02-receive-inventory.md) d30 derives what is outstanding as ordered minus received across *every* Invoice. All three need the row to still be there. The motivating failure is concrete: the prototype deleted the line on receipt, which made d30 uncomputable and left a received copy with no recoverable link to the PO it arrived against |
| 22 | **`Shipped` joins the stored statuses, and carries the supplier's expected date.** **Extends decision 12.** Shipped is information only a supplier can give — unlike Pending and Ordered, which are derived from whether the line has a PO number, and unlike received, which is counted (E-02 d30). A shipped line is a different kind of waiting from a merely placed one, so What's on Order can say "shipped 08/09, due 12/09" rather than only "placed 21 days ago", and sort by the date rather than by age. Accepted consequence: the date is as reliable as the supplier who gave it, and nothing verifies it — an expected date that passes is a prompt to chase, never a state change |
| 23 | **Every status change is logged on the line** — when, what it moved from and to, and who did it. Same `log` shape the Invoice and the Supplier already carry, for the same reason: "when did this become backordered" is a question someone asks a week later, and a bare current status cannot answer it. Receiving writes to the same log, so a line's history reads as one sequence rather than two |
| 24 | **Voiding a PurchaseOrder splits a part-received line: the received quantity stays on the voided PO, and the remainder is raised as a fresh pending line.** **Extends decision 11**, which says voiding returns "unreceived lines" to pending — written before partial receipt was real (d21), so it never said what a line that is 2 of 5 received should do. Neither half of it can simply go: the received 2 are on the shelf and their link to the Invoice that took them in is what E-02 d30 counts, so the line keeps them and its quantity drops to what actually arrived; the outstanding 3 are still wanted, so they go back to the pile as a new pending line carrying the customer attachment, the separator and the expected pricing. A fully unreceived line returns to pending whole, as d11 always said, and a fully received one is untouched. Accepted consequence: one order line can become two rows with one history between them, so the void is written into both logs naming the other (d23) |
| 25 | **An order placed outside the system may be recorded directly as placed lines, without passing through Phase 1.** **Extends decision 1**, which describes how an order *leaves* through the system and was written before ordering on a supplier's own website was a case anyone had to enter afterwards — `Their Website` is one of [M-01](M-01-supplier-margin.md)'s *Order via* values. The lines carry the supplier's own reference as the PO number, which decision 16 already permits (free-text, need not be numeric, and auto-numbering skips it). The separator is not offered: decision 3's streams are a property of the pending pile, and these lines were never in one. Recording is **manager-only** — the [lexicon](../lexicon.md) defines a PurchaseOrder as a Manager-created reorder. The motivating case is receiving, not ordering: decision 20 attaches a receiving scan to a matching PurchaseOrder line automatically and carries its expected cost and quantity forward, so without these lines on file a box from a website order arrives as a cold invoice ([E-02](E-02-receive-inventory.md) d36) and every line is priced and picked by hand. **Accepted consequence:** nothing verifies that the order was ever really placed, so a mistyped reference is a PurchaseOrder that will never be received against and will age on the on-order screen until somebody Cancels it |
| 26 | **An order recorded after being placed elsewhere carries the date it was actually placed, not the date it was typed.** The follow-up window (decision 8) runs from that date, the age column and the age sort (step 9) read from it, and decision 19's overdue grouping therefore lands correctly on the first render. Stamping *now* would make a nine-day-old order look new, which is precisely the failure the on-order screen exists to prevent. **Accepted consequence:** a line can be **overdue the moment it is entered**, and the screen shows it that way rather than hiding it behind a grace period — an order that was already late when someone got round to recording it is late, and pretending otherwise would be the invention |
| 27 | **Recording an order placed elsewhere queues the catalog metadata prefetch, the same as processing a stream does.** Step 8 queues prefetch *on placement*; this is a placement. Without it the one case decision 25 exists to serve — receiving a box against a website order — is also the case that misses locally on every scan and falls back to live lookup (see Inherited, and [architecture](../architecture.md) A-12a). Not a new obligation: an explicit reading of step 8 for a placement route that predates it |
| 28 | **The bulk entry sheet has two destinations, chosen at its head: raise the lines as *pending*, or record them as already *placed* (decision 25).** The pending destination is plain Phase 1 by another door — decision 1 says Employees raise pending lines, and steps 1-3 describe the titlecard route without making it the only one — so it needs *less* justification than decision 25's, not more. Three things follow from the choice rather than being separately configurable: the **separator** is offered only for pending, because decision 3's streams are a property of the pending pile and a line born placed was never in one; the **PO reference and placed-on date** are offered only for placed; and the **gate differs** — raising pending lines is an Employee action (decision 1), recording a PurchaseOrder is manager-only ([lexicon](../lexicon.md), *PurchaseOrder*), so an Employee is offered one destination and a Manager both. The destination sits at the head rather than as a second button at the foot so that no field on screen is ever about to be silently discarded: a typed PO reference thrown away by a foot-level *add to pending* is how an order somebody believes is placed ends up sitting in the pending pile instead. Switching destination keeps whatever has already been scanned. **Accepted consequence:** the sheet has no stock context — unlike the titlecard route it cannot show on hand, minimum on hand, or an existing outstanding line — so bulk raising can create a second pending line for a title already on order |
| 29 | ~~**The bulk sheet marks a scanned line whose Record already has an open line with that Supplier, and never blocks it.** Resolves the *duplicate raising* open question decision 28 created. A mark rather than a block because **the sheet cannot know whether the duplicate is a mistake**: ordering more of something already on order is ordinary when the first order is late, short, or backordered (decision 12), and a block would make the sheet refuse a legitimate order with no way through. The mark names the existing line — its PO number, its state and its age — so the decision is made on the facts rather than on a warning triangle. It is shown for both destinations: a second *placed* record of the same title is as worth seeing as a second pending line. **Accepted consequence:** a mark is ignorable, so duplicates stay possible — which is correct, because some of them are deliberate. This restores only what the titlecard route gives away for free by showing stock; it is not a general duplicate-prevention mechanism and nothing downstream may assume one~~ — **superseded by 33**: the mark restored the *existence* of one line where the titlecard route shows *quantities*, and decision 32 made the duplicate it fired on the ordinary case rather than the suspect one |
| 30 | **An unfinished bulk batch is a draft: it persists immediately, it is resumable, and it is thrown away only by an explicit confirmed action.** The same shape [E-02](E-02-receive-inventory.md) d4 already gives a draft Invoice — "draft-persisted and resumable; deletable before finalize" — for the same reason: a stack half scanned at the counter is interrupted by whoever walks up next, and the work already done must survive leaving the screen. **Leaving and discarding are separate controls**, because one button doing both is exactly how a half-scanned stack is lost: leaving keeps the batch and the screen advertises that it is open, discarding asks first and names how many lines it is about to destroy. **Accepted consequence, and a cross-flow one:** a persisted draft goes stale silently, which is the failure [M-01](M-01-supplier-margin.md) d14's in-flight band exists to catch — so an open order draft joins that band as a fourth kind alongside draft Invoices, open PurchaseOrders and Pending claims, and M-01 carries the commitment |
| 31 | **A pending stream below its Supplier's minimum waits indefinitely — nothing expires it, escalates it, or sends it short.** Makes explicit what step 4 and decision 4 leave implied: they record *readiness* without recording what happens when readiness never arrives. Reaching a distributor's minimum can take a small shop months, and that is ordinary trading rather than a fault to be corrected — a screen that nagged, auto-sent, or aged lines out of a stream would be inventing a deadline the supplier relationship does not have, and sending short to clear a warning is how a shop pays freight twice. **Accepted consequence:** a customer-attached line can sit in a stream that never reaches the minimum, and nothing tells the customer. The age of the oldest line (step 4) is the only signal on this screen and nobody is obliged to read it; the one place the wait is visible per person is the Customer's card, which lists their open order lines with age ([E-07](E-07-manage-customers.md) d19) |
| 32 | **A Customer may be *detached* from a pending order line, leaving the line in place, unattached, at the same quantity.** Detaching is not deleting: the copy may still be wanted. **Clarifies decision 9**, which offered deletion as the only response to a line that is no longer spoken for — the wrong verb whenever the shop would have stocked the copy anyway. Without detach both available moves are wrong: deleting the line kills an order that may still be justified, and leaving the attachment in place means decision 13 creates a **Held** Sale on receipt for a customer who has cancelled, which then does not expire ([E-05](E-05-sell-a-record.md) d7) and sits on the hold shelf until somebody notices. The detach is written to the line's log (decision 23), naming who and when, because "why is this line not spoken for any more" is a question asked a week later. Nothing merges order lines — a raised line joins the pending pile as its own row (step 3) — so one title ordered twice, once speculatively and once for a person, is correctly two lines, and detaching one of them is precisely the case this exists for. **Accepted consequence:** a detached line keeps its quantity, so a line raised as 2 for one customer stays a line of 2 that nobody asked for. Whoever detaches has to decide separately whether that quantity still makes sense, and nothing prompts them to |
| 33 | **The bulk sheet shows each scanned Record's stock figures — on hand, pending, on order — and no warning. Supersedes decision 29.** The duplicate mark was the right problem with the wrong instrument. It was never duplicate prevention, as decision 29 said itself; it existed to mitigate decision 28's accepted consequence, that the sheet is the only ordering route with no stock context. But it did not restore that context: the titlecard route shows *quantities*, and the mark showed the *existence* of one line wearing the same clothes. Three things were wrong with it. It named a single line by first match when there could be several. It matched on Record + Supplier and ignored the separator, so a line in one stream marked a scan bound for another, though decision 3 keeps those streams deliberately apart. And **decision 32** has since established that two lines for one title is a correct, deliberate pattern — so the mark fired on the ordinary case, and a warning that fires on ordinary behaviour is one people learn to scroll past. The figures are the same three the titlecard gives away for free, and they are per **Record**, not per Record + Supplier: a copy already on its way is one fewer needed whoever it is coming from, which is the question the person holding the stack is actually asking, and it sidesteps the separator problem rather than answering it. **Accepted consequence:** the sheet now states facts and draws no conclusion, so nothing flags a duplicate at all. That is the point, but it does mean an employee who does not read the figures gets no second chance, where an amber row was at least hard to miss |
| 34 | **The order processing screen narrows the pending pile three ways — a search that matches titles as well as suppliers, a chip set, and a sort — none of which step 4 gives it.** Step 4 specifies the pending table's *columns* and says nothing about finding anything in it, which is workable at four streams and not at forty. **Search** keeps supplier name and short code and adds the artist, title and catalogue number of any line in the stream, plus a placed PO's own number: filtering to the streams that *contain* a title is how "is that one going on the next order?" gets answered without opening every stream to look. **Chips** are Ready, Waiting, Aging and Email — Ready and Waiting are step 4's own *Ready* and *customer-attached* columns turned into filters, and their counts are of what the search left rather than of the current chip, so a chip reading 3 never filters to nothing. **Sort** is readiness first by default, then age, supplier or estimated cost, because the pile is worked sendable-first and step 4 gives no order at all. **Accepted consequence:** *Aging* needs a number of days that nobody has set. The prototype uses 14 and excludes streams that are already ready; that figure is a placeholder and is recorded as an open question, not as a decision |
| 35 | **The stream's dossier shows the *distance* to the supplier's minimum, not only the verdict.** Step 4 records *Ready* as a yes or a no, which answers "can I send this?" but not "is it worth waiting?" — and waiting is the actual decision, especially under decision 31, where a stream can wait indefinitely. So the figure and a meter show progress in whichever unit the Supplier's minimum actually names: units where `minOrderQty` applies, money on its own basis where `minOrderAmount` does. Not new information — step 5 already requires View to show progress "against whichever one the Supplier's minimum actually names"; this is that requirement rendered as a distance rather than a table of four numbers. The badge stays the verdict, so nothing reading *Ready* reads differently |
| 36 | **A PurchaseOrder recorded after being placed elsewhere (decision 25) is marked as carrying *their* reference wherever it is listed, not only on What's on Order.** Extends decision 25's presentation rather than its substance. The number on such an order is the supplier's, not ours — decision 16 permits it precisely because it is free text — so a screen that lists it unmarked invites somebody to go looking for it in our own ascending numbering and conclude it is missing. Phase 3 already marks it; Phase 2's placed list is the other place the number is read, and there is no argument for the mark in one and not the other |
| 37 | **With no stream scoped, the third track summarises the pending pile rather than sitting empty.** Lines, units, sell total, estimated cost, the oldest line's age, the customer-attached count, and how many streams are over their minimum. Every one of those is the sum of a column step 4 already specifies, so the summary states nothing the screen was not already entitled to say; it exists because the track is a fixed third of the frame and an empty one teaches people to stop looking at it. **Accepted consequence:** these totals are derived on the screen and nothing downstream reads them, so a step 4 column that changes meaning changes this summary silently with it |
| 38 | **Every order line names an adopted Record. Ordering never adopts — adoption always happens first.** True by construction in all three doors and written down in none of them, which is the only reason this row exists. Phase 1 step 1 begins *on a titlecard*, and a titlecard is a Record's card — no Record, no titlecard, no **Order** button. The **bulk entry sheet** (decisions 25, 28) scans, and a scan matching nothing locally resolves through the catalog provider and adopts before it can join a batch. And [E-03](E-03-search-inventory.md) step 7 makes *ordering it* one of the three verbs that **pulls a catalog-only row into the local catalog** — so ordering from a search result adopts at the search result, and the pending line is raised afterwards from the titlecard that now exists. **The consequence that matters is for genre.** [M-06](M-06-settings.md) d53 resolves a Record's genre at adoption and prompts when the map cannot; because adoption always precedes ordering, **this flow needs no genre prompt of its own**, and a PurchaseOrder can never carry a line whose genre is unresolved. *Accepted consequence:* a Manager who wants to order a title the shop has never carried must adopt it first, which means answering the genre prompt before the line can be raised — one extra question at the least convenient moment, on the rarest path. It buys an invariant every downstream reader can rely on rather than a fourth place for a genre to go missing. *This is a statement of what the flow already does, not a change to it* — recorded because the next door into ordering is where it would otherwise quietly stop being true |

---

## Open questions

- **Backorder auto-matching.** ~~Whether scanning an item should automatically attach it to a matching PO line, or whether the employee picks~~ — **Resolved** by decision 20: a scan attaches automatically, anything unmatched is picked from the worklist ([E-02](E-02-receive-inventory.md) d42 moved that worklist into the Invoice track, still browsable for exactly this). [E-02](E-02-receive-inventory.md) d30 makes the outstanding quantity derived, and the worklist is where it surfaces — a backordered line from an earlier PO appears alongside everything else expected from that supplier, which is what makes a mixed box workable. **Still open:** whether an outstanding backorder should suppress duplicate reorder suggestions once suggestions exist.
- **Cancel-by dates.** Suppliers carry a default cancel-by window ([M-01](M-01-supplier-margin.md)) and some support it contractually. Whether the system acts on it — auto-cancelling lines past the date — or merely records it, is undecided.
- **Reorder suggestion.** v1 is manual. When suggestions arrive, the inputs (sales velocity, minimum on hand, season) and whether they auto-populate a pending stream need settling.
- **Expected cost on a recorded order.** Decision 20 says a receiving scan that attaches to an outstanding line "carries its **expected cost** and quantity forward" — but a line recorded by decision 25 has no expected cost, because the bulk sheet does not collect one. The quantity half of decision 20 still works and nothing breaks; the cost half simply does not apply, and the receiving desk gets a blank list price on exactly the lines decision 25 exists to serve. Whether the sheet should take a cost per line (you generally *do* know it from a website order), take one discount for the batch off the Supplier's, or keep deliberately not asking, is undecided. Found while auditing the branch that added decision 25, not from a failure.
- **Duplicate raising from the bulk sheet.** ~~Whether the sheet should warn when a scanned Record already has an open line with that Supplier, and whether such a warning blocks or merely marks~~ — **Resolved** by decision 29: it marks, naming the existing line, and never blocks. Then **superseded by decision 33**, which removes the mark and shows the same stock figures the titlecard shows instead. The half that was still open — whether the titlecard route ([E-04](E-04-manage-inventory.md)) should show the same mark — is therefore **moot**: there is no mark, and the consistency worry it named is answered the other way round, with the sheet now showing what the titlecard already showed. Adjacent to, but not the same as, the duplicate-suppression half of *Reorder suggestion* below, which is about generated suggestions rather than a person scanning a stack.
- **Multi-store ordering.** Whether stores order independently or a Manager can place one PurchaseOrder covering several stores' needs.
- **Order acknowledgements.** Nothing consumes a supplier's confirmation that they *received* the order. Decision 22 consumes the adjacent one — a confirmation that it **shipped**, recorded as a status plus the supplier's expected date — but that is despatch, not acknowledgement, and nothing yet closes the gap between placing an order and knowing it landed.
- **The aging threshold.** Decision 34's *Aging* chip needs a number of days after which a stream that is still short is worth a second look. The prototype uses 14 and excludes streams already over their minimum, but nothing sets that figure, and decision 31 says a stream waiting is ordinary — so the threshold is not a deadline, only a prompt to glance, which is why a wrong one is cheap rather than harmful. Whether it should be one fixed figure, set per-Supplier (a rep who visits monthly and a website that ships daily are not the same wait, and [M-01](M-01-supplier-margin.md) already carries *Order via* and a cancel-by window that both bear on it), or derived from the Supplier's own cadence, is undecided.
- **Detaching a Customer.** Decision 32 records detach for a **pending** line. Whether it also applies to a **placed** one is undecided: decision 21 says a placed line is never deleted, which is an argument that detach is exactly the right verb there, but a placed line has already gone to a supplier partly on that customer's behalf, and decision 13 will still create a **Held** Sale when it arrives. Separately, and adjacent: the prototype already lets a Customer be detached from a **Sale** at the till, and nothing in [E-05](E-05-sell-a-record.md) or [E-07](E-07-manage-customers.md) records that behaviour either — the same verb, unrecorded in a second place.
