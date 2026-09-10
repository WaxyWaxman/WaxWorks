# M-05 — Accounts payable

**Actor:** Manager
**Status:** Specified
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md)

**Job:** As a manager, I need to see what the store owes, settle supplier invoices, and get credit for stock that arrived short or damaged.

**Scope note:** accounts payable is **in scope**, formalized as [E-02](E-02-receive-inventory.md) decision 26. See the note at the foot of this document for what remains excluded.

---

## Flow

1. Manager opens accounts payable and sees suppliers carrying an outstanding balance, sorted by supplier.
2. Selecting a supplier shows everything outstanding with them, in one list:

| Type | Shows |
|---|---|
| **Invoices** | Invoice number, date received, linked PurchaseOrder, original amount, paid to date, balance owing |
| **Claims** | Claim number, date sent, amount, reason, status |

3. From there the Manager can **record a payment**, **apply a claim credit**, or review **history**.

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

6. When a supplier confirms credit for a claim ([E-04](E-04-manage-inventory.md)), the Manager marks it **Credited** and applies its amount against an outstanding Invoice balance for that same supplier.

A claim credit settles a balance the same way a payment does — the difference is that no money leaves the store. This is why claims and Invoices are shown in one list rather than two: what the store owes a supplier is the net of both.

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

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Invoice records — number, date, linked PurchaseOrder, and amount — originate at receiving. Accounts payable consumes them and never creates one.
- Invoices are keyed by `(supplier, invoice_number)`, not globally (decision 1).
- A finalized Invoice is **not yet locked**: costs can still be corrected and lines added directly back in E-02 until a Manager marks it **paid** here, which is what makes it immutable. Voiding a paid Invoice is a manager-only amendment handled in [E-04](E-04-manage-inventory.md), appended as a separate artifact against the original record.

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
- **Payment batches.** Paying eleven Invoices with one cheque is currently eleven payment records sharing a reference, rather than one payment applied across many.
