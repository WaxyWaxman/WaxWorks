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

3. From there the Manager can **record a payment**, **apply a claim credit**, **create a manual entry**, **clear entries against each other**, **void a payment already recorded**, or review **history**.

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

5. The Invoice's balance owing reduces accordingly. A fully-paid Invoice leaves the outstanding list for payment history — it stays readable on this screen, in a section separate from what is outstanding, naming the PaymentBatch or batches that settled it (decision 21).

**Partial payment is supported.** An Invoice carries its original amount, what has been paid, and what remains, rather than being simply open or closed.

## Applying a claim credit

6. When a supplier confirms credit for a claim ([E-04](E-04-manage-inventory.md)), the Manager marks it **Credited**. Applying it is then a deliberate act: the Manager **selects the outstanding Invoices it should settle and enters how much of it lands on each** (decision 18). Nothing is distributed automatically. A credit need not be applied all at once — whatever is not applied stays in hand against that same supplier until it is exhausted (decision 20).

A claim credit settles a balance the same way a payment does — the difference is that no money leaves the store. Both are targets of the same act: **one settlement may be part claim credit and part money**, recorded as a single PaymentBatch whose targets carry which kind each was (decision 19). So "pay $68.65 with $12.40 of credit and a $56.25 cheque" is one thing the Manager does, and one artifact afterwards. This is also why claims and Invoices are shown in one list rather than two: what the store owes a supplier is the net of both.

**A manual Credit entry is not applied this way.** It reduces the balance the moment it is entered (decision 14), so it has already netted at the supplier level; allocating it to an Invoice as well would count it twice. Only a Credited claim is applied.

---

## Manual ledger entries

7. **Create new** lets the Manager log an entry by hand — Invoice, Claim, Credit, Adjustment, or Consignment — without going through Receiving ([E-02](E-02-receive-inventory.md)) or raising a Supplier Claim ([E-04](E-04-manage-inventory.md)). It's a lump subtotal/tax/freight/misc, not itemized against any InventoryItem; the stock (or claim, or credit) behind the number is treated as inventory unlinked to items — the itemized version of this is E-02/E-04's job, and using Create new instead is a deliberate shortcut, not a replacement for either.
8. An **Invoice** entered for a Supplier carrying the **consignment** flag ([M-01](M-01-supplier-margin.md)) defaults to type **Consignment** instead — the same default a real Receiving Invoice gets.
9. A **Claim** entry is a placeholder — logged before the supplier's credit memo is in hand — and doesn't affect the balance at all until it's cleared (below). An **Adjustment** moves the balance either way, Manager's choice; a **Credit** always reduces it, the moment it's entered.

## Clearing entries

10. When a set of entries the Manager selects sums to zero — a placeholder Claim matched against the Credit that eventually replaced it, most commonly — the Manager can mark them **Cleared** against each other. This is manual reconciliation only, never automatic: nothing infers that two entries are related. Clearing changes nothing about the balance (a Claim was never counted; a Credit already was, and stays counted) — it only retires both from what still needs attention. Neither is deleted or edited beyond the clearing fields; both remain in the ledger as history.

---

## Voiding a payment

11. A PaymentBatch recorded in error can be **voided** (decision 22). The batch is never deleted or edited — the void is appended against it, the house pattern for reversing a finalized artifact ([E-02](E-02-receive-inventory.md) d23, [E-04](E-04-manage-inventory.md)). Voiding reverses **every** target it carried: money targets return that amount to the Invoice or entry's balance owing, and credit targets return that amount to the claim's remaining, putting it back in hand to be applied again (decision 20).

**A batch is voided whole or not at all.** Decision 16 made the PaymentBatch the unit of the act — one cheque covering four Invoices is one thing that happened. Voiding one target out of it would leave a batch describing a settlement that never took place in that shape, which is the thing decision 16 exists to prevent. A payment that was partly right is voided and re-recorded correctly.

**An Invoice that stops being paid stops being immutable.** Immutability attaches at **paid**, not at finalize ([E-02](E-02-receive-inventory.md) d40, [architecture](../architecture.md) A-33) — so when a void takes an Invoice back out of Paid, it returns to **Finalized** and is correctable in E-02 again. This is the consequence being accepted knowingly: a document that was frozen can be unfrozen, and "immutable" therefore means *immutable while paid* rather than *immutable forever*. The alternative — an Invoice that stays locked while carrying a balance it owes — is worse, because nothing could then correct the error the void exists to correct.

## Gift card liability

The store's outstanding gift cards are money owed to customers, so they are reported here rather than buried in settings.

The registry lists every card with a balance: its code, current balance, issue date, last-used date, and the Customer it is associated with where there is one. The total is the store's outstanding gift-card liability.

Loading and redeeming happen at the till ([E-05](E-05-sell-a-record.md)); this is the register, not the mechanism.

---

## Requirements

- Everything in this flow is **manager-only**.
- An Invoice's balance is derived from its amount less payments and credits applied, never edited directly.
- A payment reference must be free text — the bank statement is the reconciliation surface and its formats are not the store's to control.
- A claim may only be applied against an Invoice from the same supplier. Which of that supplier's Invoices, and how much lands on each, is the Manager's choice (decision 18).
- A claim credit may be applied in part, across several settlements, until it is exhausted (decision 20). A claim leaves the outstanding list when its remaining amount reaches zero, not when it is first applied.
- A settlement may mix claim credit and money; it is one PaymentBatch either way (decision 19). A payment reference is required only where money actually moved — a credit-only settlement has none to give.
- A PaymentBatch is **voided, never edited and never deleted** (decision 22). The void is appended against the original, which stays in the ledger. Voiding is all of a batch's targets or none of them.
- An Invoice's **Paid** status is therefore not permanent. Immutability holds while it is paid and releases if that payment is voided ([E-02](E-02-receive-inventory.md) d40, [architecture](../architecture.md) A-33).
- An Invoice's **due date** is derived from its payment terms and its invoice date ([E-02](E-02-receive-inventory.md) d45), never entered here and never edited here.
- Supplier currency carries through: an Invoice in a foreign currency shows its own currency and the store-currency equivalent at the configured rate ([M-06](M-06-settings.md)). Where that rate does not exist, figures in different currencies are reported separately rather than summed.
- A manual ledger entry is never itemized against an InventoryItem — that's what Receiving/Supplier Claims are for.
- Clearing entries against each other requires their signed amounts to sum to zero; it's a Manager's manual call, never inferred automatically.

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Invoice records — number, date, linked PurchaseOrder, and amount — originate at receiving. Accounts payable consumes them and never creates one.
- Invoices are keyed by `(supplier, invoice_number)`, not globally (decision 1).
- A finalized Invoice is **not yet locked**: costs can still be corrected and lines added directly back in E-02 until a Manager marks it **paid** here, which is what makes it immutable. Voiding a paid Invoice is a manager-only amendment handled in [E-04](E-04-manage-inventory.md), appended as a separate artifact against the original record.
- An Invoice carries its own **payment terms** and a **due date derived as invoice date + terms** ([E-02](E-02-receive-inventory.md) d45). Accounts payable consumes both and edits neither: the due date is what makes a balance *overdue* rather than merely outstanding, and it is the only basis on which this flow may age anything.

**From [M-01](M-01-supplier-margin.md):**

- **An Employee may *view* a Supplier's outstanding balance and trade totals on the Supplier card** ([M-01](M-01-supplier-margin.md) d16). This does not open any part of this flow to them: recording a payment, applying a claim credit, creating a manual entry and clearing entries against each other all remain manager-only, and decision 2 below is unchanged. The distinction is the [lexicon](../lexicon.md)'s — **manager-only** gates an action an Employee cannot *perform*, which was never a statement about what they may see.
- The Supplier card links through to this screen for the rows behind the figure, rather than restating them ([M-01](M-01-supplier-margin.md) d18). Decision 3's combined list stays the single place those rows are read and worked.
- A Supplier carries a **billing address** — where payment is remitted — captured on its card ([M-01](M-01-supplier-margin.md) d13). This flow now consumes it: it is displayed as the remit-to address alongside the payment being recorded (decision 17). Display only — M-01 remains the only place it is edited.
- A Supplier carries **payment terms** ([M-01](M-01-supplier-margin.md) d19), which default onto each Invoice received from them. This flow reads the Invoice's terms, not the Supplier's — the two can differ, and the Invoice wins ([E-02](E-02-receive-inventory.md) d45).

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
| 11 | ~~Clarifies decisions 6–7: a Credited claim's amount isn't earmarked to one Invoice the Manager picks. Applying it distributes automatically across the supplier's outstanding Invoices, oldest received first, absorbing any remainder on the last one if the credit exceeds what's currently owed~~ — **superseded by 18**: the Manager picks the Invoices and the amounts; the automatic oldest-first distribution is retired entirely, and decision 7's plain reading is restored |
| 12 | **Manual ledger entries** (Create new) are supported for type Invoice, Claim, Credit, Adjustment, or Consignment — a lump subtotal/tax/freight/misc, not sourced from Receiving or Supplier Claims and not itemized against any InventoryItem |
| 13 | An Invoice entry (manual or real, via Receiving) for a Supplier carrying the **consignment** flag ([M-01](M-01-supplier-margin.md) decision) defaults to type Consignment instead |
| 14 | A Claim entry is a placeholder that does not affect the balance until **Cleared** against a matching Credit; an Adjustment moves the balance either way (the Manager's choice at entry); a Credit always reduces it immediately |
| 15 | **Clearing** is manual reconciliation only, never automatic: a Manager selects a set of same-Supplier entries whose signed amounts sum to zero and marks them Cleared against each other. Nothing is deleted or edited beyond the clearing fields — both stay in the ledger as history — and clearing changes nothing about the balance itself |
| 16 | Resolves the "Payment batches" open question: a Record Payment action produces **one PaymentBatch** covering whatever mix of Invoices and manual entries it paid, browsable as one row per batch and opened to see its targets — not one record per target that merely shares a reference |
| 17 | The Supplier's **billing address is displayed here as the remit-to address**, alongside the payment being recorded. **Extends the [M-01](M-01-supplier-margin.md) d13 line inherited above**, which captured the address and recorded that nothing here consumed it. Recording a payment is the moment the store asks where the cheque goes. Display only: nothing is printed, addressed or sent, and M-01 stays the only place it is edited. *Accepted consequence:* a stale address now looks authoritative at the moment it is most likely to be acted on, and nothing on this screen can tell that it is stale |
| 18 | **The Manager chooses which outstanding Invoices a Credited claim is applied to, and how much lands on each.** **Supersedes decision 11** in full — the automatic oldest-received-first distribution is retired, not kept as a default. Decision 11 was itself a clarification of 6–7, so reversing it restores decision 7's plain reading: a claim is applied *against Invoices* from the same supplier, with the Manager saying which. The change is one of policy, not structure — an Invoice's balance is already derived from payments plus credits applied to *that Invoice* ([architecture](../architecture.md) §5), so per-Invoice attribution was always recordable; decision 11 only governed who decided the split. *Accepted consequence:* every application is now a decision, including the trivial one where a single Invoice is outstanding and there is no judgement to exercise. No suggested split is pre-filled, because a pre-filled split is decision 11 under another name and one nobody would check |
| 19 | **A claim credit and a payment may settle the same Invoices in one action, producing one PaymentBatch whose targets record which kind each was.** **Extends decisions 6 and 16** and contradicts neither: 6 already made a credit settle a balance the same way a payment does, and 16 already made one batch cover whatever mix it paid. That a credit could be one of the things in that mix was never addressed either way — the two being separate acts was an omission, not a position. *Accepted consequence:* a batch may now have a zero money half, so the payment reference required by decision 5 becomes conditional — required where money moved, impossible where none did |
| 20 | **A Credited claim may be applied in part, across several settlements, until it is exhausted.** **Resolves the "Partial claim credit" open question**, and is **forced by decision 18** rather than chosen independently: once the Manager sets the amounts, "applied once, in full" cannot hold — a credit larger than the Invoices selected leaves a remainder, and decision 11's rule for absorbing it on the last Invoice was retired with decision 11. A claim therefore carries an amount applied and an amount remaining, and leaves the outstanding list when remaining reaches zero. *Accepted consequence:* a credit can now sit part-applied indefinitely, which is a new way for money in the store's favour to be quietly forgotten — so the remaining figure, not the original, is what this flow reports |
| 21 | **A settled Invoice stays readable here, in a section separate from the outstanding list, naming the PaymentBatch or batches that settled it.** **Extends step 5 and decision 16.** Step 5 says a fully-paid Invoice leaves the outstanding list *for payment history* — naming where it goes, not that it stops being visible. Decision 16 made history browsable in one direction only, a batch opened to see its targets; the reverse, an Invoice saying what paid it, was unaddressed and is the direction someone reconciling a statement actually reads. *Accepted consequence:* this section grows without bound, so it is collapsed by default and carries a count rather than rows |
| 22 | **A PaymentBatch can be voided, whole, by a Manager — never edited and never deleted.** The void is appended against the original batch, which stays in the ledger as the record of what was recorded at the time ([E-02](E-02-receive-inventory.md) d23's pattern; the [lexicon](../lexicon.md) reserves *delete* for drafts and *void* for finalized artifacts). It reverses every target the batch carried: money returns to the Invoice or entry's balance owing, and claim credit returns to that claim's **remaining**, in hand to be applied again — decision 20 is what makes this expressible, since without a partial model a credit could only be returned in full. **Whole or not at all**, because decision 16 made the batch the unit of the act: voiding one target would leave a batch describing a settlement that never happened in that shape. A partly-wrong payment is voided and re-recorded. *Accepted consequence, and the significant one:* an Invoice taken back out of **Paid** returns to **Finalized** and becomes correctable again, so immutability ([E-02](E-02-receive-inventory.md) d40, [architecture](../architecture.md) A-33) means *immutable while paid*, not *immutable forever*. Leaving it frozen while it still owed a balance would be worse — nothing could then correct the error the void exists to correct. **A-33 needs this amendment appended** |

---

## What "in scope" means here

Payment recording and accounts payable are in scope, per [E-02](E-02-receive-inventory.md) decision 26. Decision 25, which had put them out, stands unrewritten in E-02's table as the record of what was decided at the time — the repository convention is to append rather than renumber.

The exclusion that remains is **integration with a third-party payment processing system** such as Square or Stripe. Wax Works never captures card data, never authorizes or settles a card transaction, and never moves money.

The distinction is between recording and executing. A payment recorded here is a Manager writing down what they paid and how — a cheque number, a card reference — so the store's obligations reconcile against a bank statement. Nothing in this flow instructs a bank, a processor, or anyone else to move funds. The same distinction governs the till: card tenders are recorded and settled on a separate terminal ([E-05](E-05-sell-a-record.md) d9).

---

## Open questions

- **Aging — the report, not the figure.** Per-Invoice aging is now answerable and is answered: an Invoice carries a due date ([E-02](E-02-receive-inventory.md) d45), so a balance can be shown as overdue and by how much. What stays open is the **report** — balances grouped 30/60/90+ — and specifically whether it lives here or in a general reporting surface. *This question was previously worded as though only its home were undecided. It was not: until d45 there was no due date anywhere in the system, so nothing could be called overdue at all, and days-since-invoice is outstanding rather than overdue. The prerequisite was a field two other flows own, and it is now recorded as [M-01](M-01-supplier-margin.md) d19 and [E-02](E-02-receive-inventory.md) d45.*
- ~~**Reversing a settlement**~~ — **Resolved** by decision 22: a PaymentBatch is voided whole, appended rather than edited, returning money to the balance and credit to the claim's remaining.
- **Reversing a clearing.** Decision 22 answers the payment side but not this one. Decision 15 says nothing is deleted and both entries stay in the ledger as history, but not whether a Manager who cleared the wrong pair can un-clear them. The shape is presumably decision 22's — appended, never edited — but it has not been decided, and clearing has no artifact of its own to void the way a PaymentBatch does.
- **Voiding a payment against an Invoice since amended.** Decision 22 returns an Invoice to **Finalized** so it can be corrected. The reverse order is undecided: an Invoice paid, then voided or amended in [E-04](E-04-manage-inventory.md), then its payment voided. What the returned money attaches to when the document it settled no longer says what it said is an open question, and [E-04](E-04-manage-inventory.md) owns the amendment artifact.
- **Overpayment.** Nothing defines what happens when a payment exceeds an Invoice's balance. A supplier overpaid in error is a credit in the store's favour that nothing models, and decision 8 forbids editing the balance to absorb it.
- **Prepaid and COD.** [M-01](M-01-supplier-margin.md) d19 admits two kinds of thing into one field: Net-N terms, which age, and Prepaid/COD, which do not. Whether a Supplier on those terms may carry an outstanding balance at all — and if so what it means — is undecided. A Prepaid supplier showing a balance is either a data-entry error or a real exception, and this flow currently surfaces it as an anomaly rather than choosing.
- **Terms on a manual ledger entry.** Decision 12 makes a manual entry a lump not sourced from Receiving, so it inherits nothing from an Invoice. Whether a hand-entered Invoice or Consignment should nonetheless take the Supplier's payment terms — and therefore age — is unsettled.
- **Deeper reconciliation.** v1 is manual throughout. Auto-matching a supplier's credit note to the original claim and recording disputes are both later. *Partial credits are no longer part of this question — decision 20 models them.*
- **Receivables.** [E-07](E-07-manage-customers.md) allows a business customer to owe the store money on an outbound invoice, but nothing chases it. The receivables side of this flow doesn't exist yet.
- **Currency movement.** An Invoice raised at one rate and paid at another produces an exchange gain or loss that nothing currently records.
- ~~**Payment batches**~~ — **Resolved** by decision 16: one PaymentBatch per Record Payment action, opened to see its targets.
- ~~**Partial claim credit**~~ — **Resolved** by decision 20: a Credited claim carries an amount applied and an amount remaining, and may be applied in parts until exhausted.
