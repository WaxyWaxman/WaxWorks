# M-05 — Accounts payable

**Actor:** Manager
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-01 Suppliers](M-01-supplier-margin.md)

**Job:** As a manager, I need to see what the store owes, settle supplier invoices, and get credit for stock that arrived short or damaged.

**Scope note:** accounts payable is **in scope**, formalized as [E-02](E-02-receive-inventory.md) decision 26. See the note at the foot of this document for what remains excluded.

---

## Flow

1. Manager opens accounts payable and sees suppliers carrying an outstanding balance, sorted by supplier. A lookup finds any Supplier regardless of balance, so a zero-balance one stays reachable — to review history, or to log a new entry against them.
2. Selecting a supplier shows everything outstanding with them, in one list:

| Type | Shows |
|---|---|
| **Invoices** | Invoice number, date received, linked PurchaseOrder, original amount, paid to date, balance owing |
| **Claims** | Claim number, date sent, amount, reason, status |
| **Manual entries** | Whatever the Manager typed on Create new — see below |

3. From there the Manager can **record a payment**, **apply a claim credit**, **create a manual entry**, **clear entries against each other**, or review **history**.

---

## Recording a payment

4. Manager selects one or more outstanding Invoices and records a payment against them:

| Field | Notes |
|---|---|
| **Method** | Cheque, credit card, EFT, cash |
| **Reference** | Free text — `Cheque 101`, `Credit card 1278`. This is what reconciles against the bank statement. |
| **Amount** | Full or partial |
| **Date** | |
| **Recorded by** | The Manager, captured automatically |

5. The Invoice's balance owing reduces accordingly. A fully-paid Invoice leaves the outstanding list for payment history.

**Partial payment is supported.** An Invoice carries its original amount, what has been paid, and what remains, rather than being simply open or closed.

## Applying a claim credit

6. When a supplier confirms credit for a claim ([E-04](E-04-manage-inventory.md)), the Manager marks it **Credited**. Applying it doesn't ask the Manager to pick an Invoice — its amount nets directly against what's owed to that same supplier, distributed automatically across their outstanding Invoices, oldest received first, until it's used up (decision 11).

A claim credit settles a balance the same way a payment does — the difference is that no money leaves the store, and it's netted at the supplier level rather than earmarked to one Invoice picked by hand. This is why claims and Invoices are shown in one list rather than two: what the store owes a supplier is the net of both.

---

## Manual ledger entries

7. **Create new** lets the Manager log an entry by hand — Invoice, Claim, Credit, Adjustment, or Consignment — without going through Receiving ([E-02](E-02-receive-inventory.md)) or raising a Supplier Claim ([E-04](E-04-manage-inventory.md)). It's a lump subtotal/tax/freight/misc, not itemized against any InventoryItem; the stock (or claim, or credit) behind the number is treated as inventory unlinked to items — the itemized version of this is E-02/E-04's job, and using Create new instead is a deliberate shortcut, not a replacement for either.
8. An **Invoice** entered for a Supplier carrying the **consignment** flag ([M-01](M-01-supplier-margin.md)) defaults to type **Consignment** instead — the same default a real Receiving Invoice gets.
9. A **Claim** entry is a placeholder — logged before the supplier's credit memo is in hand — and doesn't affect the balance at all until it's cleared (below). An **Adjustment** moves the balance either way, Manager's choice; a **Credit** always reduces it, the moment it's entered.

## Clearing entries

10. When a set of entries the Manager selects sums to zero — a placeholder Claim matched against the Credit that eventually replaced it, most commonly — the Manager can mark them **Cleared** against each other. This is manual reconciliation only, never automatic: nothing infers that two entries are related. Clearing changes nothing about the balance (a Claim was never counted; a Credit already was, and stays counted) — it only retires both from what still needs attention. Neither is deleted or edited beyond the clearing fields; both remain in the ledger as history.

---

## Gift card liability

The store's outstanding gift cards are money owed to customers, so they are reported here rather than buried in settings.

The registry lists every card with a balance: its code, current balance, issue date, last-used date, and the Customer it is associated with where there is one. The total is the store's outstanding gift-card liability.

Loading and redeeming happen at the till ([E-05](E-05-sell-a-record.md)); this is the register, not the mechanism.

---

## Requirements

- Everything in this flow is **manager-only**.
- An Invoice's balance is derived from its amount less payments and credits applied, never edited directly.
- A payment reference must be free text — the bank statement is the reconciliation surface and its formats are not the store's to control.
- A claim may only be applied against an Invoice from the same supplier.
- Supplier currency carries through: an Invoice in a foreign currency shows its own currency and the store-currency equivalent at the configured rate ([M-06](M-06-settings.md)).
- A manual ledger entry is never itemized against an InventoryItem — that's what Receiving/Supplier Claims are for.
- Clearing entries against each other requires their signed amounts to sum to zero; it's a Manager's manual call, never inferred automatically.

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Invoice records — number, date, linked PurchaseOrder, and amount — originate at receiving. Accounts payable consumes them and never creates one.
- Invoices are keyed by `(supplier, invoice_number)`, not globally (decision 1).
- A finalized Invoice is **not yet locked**: costs can still be corrected and lines added directly back in E-02 until a Manager marks it **paid** here, which is what makes it immutable. Voiding a paid Invoice is a manager-only amendment handled in [E-04](E-04-manage-inventory.md), appended as a separate artifact against the original record.

**From [M-01](M-01-supplier-margin.md):**

- **An Employee may *view* a Supplier's outstanding balance and trade totals on the Supplier card** ([M-01](M-01-supplier-margin.md) d16). This does not open any part of this flow to them: recording a payment, applying a claim credit, creating a manual entry and clearing entries against each other all remain manager-only, and decision 2 below is unchanged. The distinction is the [lexicon](../lexicon.md)'s — **manager-only** gates an action an Employee cannot *perform*, which was never a statement about what they may see.
- The Supplier card links through to this screen for the rows behind the figure, rather than restating them ([M-01](M-01-supplier-margin.md) d18). Decision 3's combined list stays the single place those rows are read and worked.
- A Supplier carries a **billing address** — where payment is remitted — captured on its card ([M-01](M-01-supplier-margin.md) d13). Nothing here consumes it yet.

**From [E-04](E-04-manage-inventory.md):**

- Claims arrive here already raised, batched, sent, and carrying a **Pending** or **Credited** status.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Accounts payable is **in scope** (E-02 decision 26). The only exclusion is integration with a third-party payment processing system such as Square or Stripe |
| 2 | The flow is manager-only in its entirety |
| 3 | Outstanding Invoices and Pending claims are shown in **one combined list** per supplier, because what is owed is the net of both |
| 4 | **Partial payment is supported**; an Invoice tracks original amount, paid to date, and balance owing |
| 5 | A payment records method, free-text reference, amount, date, and the Manager who recorded it |
| 6 | A claim credit settles a balance the same way a payment does, without money moving |
| 7 | A claim may only be applied against an Invoice from the same supplier |
| 8 | Invoice balances are derived from payments and credits, never edited directly |
| 9 | Accounts payable **consumes** Invoice records from E-02 and never creates them |
| 10 | Outstanding **gift-card liability** is registered here, being money owed to customers |
| 11 | Clarifies decisions 6–7: a Credited claim's amount isn't earmarked to one Invoice the Manager picks. Applying it distributes automatically across the supplier's outstanding Invoices, oldest received first, absorbing any remainder on the last one if the credit exceeds what's currently owed |
| 12 | **Manual ledger entries** (Create new) are supported for type Invoice, Claim, Credit, Adjustment, or Consignment — a lump subtotal/tax/freight/misc, not sourced from Receiving or Supplier Claims and not itemized against any InventoryItem |
| 13 | An Invoice entry (manual or real, via Receiving) for a Supplier carrying the **consignment** flag ([M-01](M-01-supplier-margin.md) decision) defaults to type Consignment instead |
| 14 | A Claim entry is a placeholder that does not affect the balance until **Cleared** against a matching Credit; an Adjustment moves the balance either way (the Manager's choice at entry); a Credit always reduces it immediately |
| 15 | **Clearing** is manual reconciliation only, never automatic: a Manager selects a set of same-Supplier entries whose signed amounts sum to zero and marks them Cleared against each other. Nothing is deleted or edited beyond the clearing fields — both stay in the ledger as history — and clearing changes nothing about the balance itself |
| 16 | Resolves the "Payment batches" open question: a Record Payment action produces **one PaymentBatch** covering whatever mix of Invoices and manual entries it paid, browsable as one row per batch and opened to see its targets — not one record per target that merely shares a reference |

---

## What "in scope" means here

Payment recording and accounts payable are in scope, per [E-02](E-02-receive-inventory.md) decision 26. Decision 25, which had put them out, stands unrewritten in E-02's table as the record of what was decided at the time — the repository convention is to append rather than renumber.

The exclusion that remains is **integration with a third-party payment processing system** such as Square or Stripe. Wax Works never captures card data, never authorizes or settles a card transaction, and never moves money.

The distinction is between recording and executing. A payment recorded here is a Manager writing down what they paid and how — a cheque number, a card reference — so the store's obligations reconcile against a bank statement. Nothing in this flow instructs a bank, a processor, or anyone else to move funds. The same distinction governs the till: card tenders are recorded and settled on a separate terminal ([E-05](E-05-sell-a-record.md) d9).

---

## Open questions

- **Aging.** Balances grouped 30/60/90+ days overdue is the obvious next report, but whether it lives here or in a general reporting surface is open.
- **Deeper reconciliation.** v1 is manual throughout. Auto-matching a supplier's credit note to the original claim, handling partial credits, and recording disputes are all later.
- **Receivables.** [E-07](E-07-manage-customers.md) allows a business customer to owe the store money on an outbound invoice, but nothing chases it. The receivables side of this flow doesn't exist yet.
- **Currency movement.** An Invoice raised at one rate and paid at another produces an exchange gain or loss that nothing currently records.
- **Payment batches** — resolved, decision 16.
- **Partial claim credit.** A Claim entry is cleared in one shot, for its full logged amount — splitting one claim's resolution across several Credits, or crediting less than the original Claim, isn't modeled.
