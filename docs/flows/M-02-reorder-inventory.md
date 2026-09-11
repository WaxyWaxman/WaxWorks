# M-02 — Re-order inventory

**Actor:** Manager (Employees raise pending orders)
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-01 Supplier margin](M-01-supplier-margin.md)

**Job:** As a manager, I need to restock what's selling before it runs out.

---

## Shape of the flow

Ordering is two-stage, matching who does what in the shop:

- **Employees raise pending order lines** from a titlecard as they notice gaps or take customer requests. A pending line has no PurchaseOrder number and has not been sent anywhere.
- **Managers process pending lines into PurchaseOrders** and send them to suppliers.

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
| **Void a PurchaseOrder** | Manager-only. Returns all unreceived lines on that PO to pending, with the same warning — the paperwork is reversed here, not at the supplier. |
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

---

## Open questions

- **Backorder auto-matching.** ~~Whether scanning an item should automatically attach it to a matching PO line, or whether the employee picks~~ — **Resolved** by decision 20: a scan attaches automatically, anything unmatched is picked from the worklist ([E-02](E-02-receive-inventory.md) d42 moved that worklist into the Invoice track, still browsable for exactly this). [E-02](E-02-receive-inventory.md) d30 makes the outstanding quantity derived, and the worklist is where it surfaces — a backordered line from an earlier PO appears alongside everything else expected from that supplier, which is what makes a mixed box workable. **Still open:** whether an outstanding backorder should suppress duplicate reorder suggestions once suggestions exist.
- **Cancel-by dates.** Suppliers carry a default cancel-by window ([M-01](M-01-supplier-margin.md)) and some support it contractually. Whether the system acts on it — auto-cancelling lines past the date — or merely records it, is undecided.
- **Reorder suggestion.** v1 is manual. When suggestions arrive, the inputs (sales velocity, minimum on hand, season) and whether they auto-populate a pending stream need settling.
- **Multi-store ordering.** Whether stores order independently or a Manager can place one PurchaseOrder covering several stores' needs.
- **Order acknowledgements.** Nothing consumes a supplier's confirmation that they received the order.
