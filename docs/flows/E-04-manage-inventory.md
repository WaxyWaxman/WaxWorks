# E-04 — Manage the inventory

**Actor:** Employee (some actions manager-only)
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-03 Search the inventory](E-03-search-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-05 Accounts payable](M-05-accounts-payable.md)

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
| **Void or amend Invoice** | **Manager** | Inherited from E-02. A **paid** Invoice is immutable ([E-02](E-02-receive-inventory.md) d40) — before that it is corrected in E-02 itself. The amendment is appended as a separate artifact against the original record, never an in-place edit. |
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

1. From a titlecard, or from an Invoice flagged during receiving, Employee raises a **claim** against the copy and selects a reason: `Billed / not shipped`, `Received damaged`, `Short shipped`, `Wrong item`, or free text.
2. Claims accumulate against the supplier. The claims screen lists them grouped by supplier, respecting the ordering separator ([M-02](M-02-reorder-inventory.md)) so claims can be batched the way orders are.
3. Employee sends a batched claim to the supplier's email address. The claim states, per line: the supplier Invoice number the copy arrived on, the reason code, artist, album title, cost, and quantity — plus a combined total.
4. **Claim numbers** auto-generate ascending and are checked for uniqueness; an Employee may enter one manually if the supplier requires their own reference.
5. The claim carries a status of **Pending** or **Credited**. Marking it Credited is a manual action taken when the supplier confirms.
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

**From [E-02](E-02-receive-inventory.md):**

- **Void or amend a finalized Invoice** — manager-only, appended as a separate artifact against the original record.
- **Return or credit claim against an Invoice** — an Employee may flag an Invoice during receiving; the handling lives here.
- **Deferred line problems** — an Employee may skip a problem item during receiving and resolve it here.
- **Below-cost pricing raises a ReviewFlag** ([E-02](E-02-receive-inventory.md) d35, amending its decision 10), which applies to shelf prices set here as well as at receiving.

**From [E-05](E-05-sell-a-record.md):**

- **Negative inventory is reconciled here.** The till lets stock go below zero rather than blocking a Sale.
- **Reserve creates a Held Sale**, with a quantity chosen at reservation time.

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

---

## Open questions

- **Batch stock-take.** Reason-coded single adjustments are specified; counting a whole Section against the shelf and reconciling in one pass is not. It needs a session concept — count in progress, variances, then commit.
- **Claim resolution beyond Credited.** A supplier may partially credit, deny, or issue a credit note against a different Invoice. v1 records only Pending and Credited.
- **Re-grading a copy after it is sellable.** Editing a copy's grade is permitted, but a copy that was sold at a grade it no longer carries is a data question the snapshot rule sidesteps rather than answers.
- **Who may delete a Record with stock on hand?** Currently manager-only with no guard against deleting a Record that still has sellable copies.
- **Bin location** — see [E-03](E-03-search-inventory.md).
