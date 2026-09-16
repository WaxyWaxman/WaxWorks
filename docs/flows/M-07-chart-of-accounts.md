# M-07 — Chart of accounts

**Actor:** Manager
**Status:** Stub — awaiting flow
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-03 Daily summary](M-03-daily-summary.md) · [M-05 Accounts payable](M-05-accounts-payable.md) · [M-06 Configure the store](M-06-settings.md)

**Job:** As a manager, I need every movement of money to land in a named account, so that I can see what the shop actually earned and hand an accountant a file rather than a shoebox.

**Scope note:** this flow owns the **chart** — the list of accounts — and whatever posts to it. It is not [M-06](M-06-settings.md), which configures the things other flows read and which has been holding three GL columns in reserve for this flow to draw. It is not [M-05](M-05-accounts-payable.md), which owns what is owed a supplier; a supplier balance is derived from payables artifacts and stays that way. The vocabulary is reserved in [lexicon](../lexicon.md) §14, including four words this flow must **not** reuse — *deposit*, *clearing*, *settlement* and *manual ledger entry* all already mean something else.

---

## Flow

_TBD_

## Requirements

_TBD_

## Inherited from other flows

_Commitments pushed here by another flow. These are decided, not open — each cites
the decision it comes from._

- **Three GL columns are reserved, unread, and drawn nowhere** — a tax type's `gl_account` ([M-06](M-06-settings.md) d11), a tender's **Code** (d23) and a Section's **GL code** (d28). Nothing reads one and no migration waits on one. [architecture](../architecture.md) §10 adds the instruction that comes with them: **re-check all three shapes when this flow is written**, because a column reserved against an unwritten specification is a guess with a comment on it.
- **Exchange gain or loss is deferred to this flow, not to settings** ([M-06](M-06-settings.md) d39). A gain or loss is a ledger posting and there was nowhere to post it. **It arrives here carrying a bill:** d33 keeps one current rate per currency, making a past rate unrecoverable, and d37 forbids storing a converted figure at all — so computing a realized gain means reopening [architecture](../architecture.md) A-36, A-47 and [M-06](M-06-settings.md) d37 together. d39 names the mechanism it wants: record the rate **on the artifact that used it**, never a table of historic rates.
- **Whether a Section counts as revenue is a property of the Section, and the same seam carries the GL account** ([M-06](M-06-settings.md) d20). Revenue against liability is the split a ledger would draw anyway — a gift card load is money received against a future obligation, not a revenue bucket (d18).
- **Inbound tax is excluded from cost of goods** ([E-02](E-02-receive-inventory.md) d34, [architecture](../architecture.md) A-29): `invoice_cogs = subtotal + freight + misc`. GST and QST on a supplier Invoice are **Input Tax Credits — a receivable, not a cost.**
- **There is no landed-cost calculation** ([E-02](E-02-receive-inventory.md) d16, [lexicon](../lexicon.md) §5). Freight, tax and misc stay at Invoice level and are never allocated down to copies.
- **Margin figures carry the unallocated-cost caveat** ([M-03](M-03-daily-summary.md) d11), quantified there as *roughly 2.6% on the reference Invoice*.
- **A setting that has been referenced is deactivated, never deleted** ([M-06](M-06-settings.md) d9). An account that has been posted to is governed by this.
- **A converted figure is presentation and is never a stored amount** ([M-06](M-06-settings.md) d37), and a Store has exactly one home currency (d34).
- **Tenders report per tender, not per behavior** ([M-06](M-06-settings.md) d22): `Visa` and `Amex` are separate rows *because they settle as separate deposits, and a breakdown that merges them cannot be tied back to a bank statement.*
- **The close stores its summary rather than recomputing it** ([M-03](M-03-daily-summary.md) d13, [architecture](../architecture.md) A-30), so an Undo End of Day cycle can never quietly restate a past day.
- **Recording is not executing** ([M-05](M-05-accounts-payable.md) d5, [PRD](../PRD.md) §7 NG-4). Nothing here instructs a bank or a processor, captures card data, or moves money. Anything this flow records about a bank is a Manager writing down what happened.

## Resolved decisions

_Numbered so they can be cited precisely. Append only — never renumber or delete._

| # | Decision |
|---|---|
| | |

## Open questions

**One is blocking, and most of the rest are downstream of it.**

- **Is this a coding table with an export, or an internal double-entry ledger?** A chart plus a journal export stays a translation layer over artifacts that already exist, and leaves the shop's real bookkeeping with their accountant. An internal ledger means postings, a trial balance, manual journal entry and a period close living inside a point-of-sale system. The reserved-account wish list this flow was proposed with — *Retained Earnings*, *Net Profit*, *Current Profits* — describes the second. The first is a strict subset of the second, so building it first forecloses nothing.

The rest are not blocking, and several are answerable only after the one above:

- **Does a tax type need two GL accounts rather than one?** [M-06](M-06-settings.md) d11 gives it a single `gl_account`, but tax lands on both sides of the books — collected on a Sale, a liability; and paid on a supplier Invoice, which [E-02](E-02-receive-inventory.md) d34 makes an Input Tax Credit and therefore a receivable. One field cannot carry both. If the answer is two, d11's shape needs amending rather than reinterpreting.
- **Is Sales one account or one per Section?** [M-06](M-06-settings.md) d28 already gives every Section a GL code and d20 makes *counts as revenue* a Section flag, so revenue is sliced by Section by construction. A single reserved `Sales` account would contradict the seam built for it.
- **Perpetual or periodic inventory?** Perpetual is available — a copy is an individual row carrying its own cost — and would make margin true every day rather than at count time. Periodic is simpler, and a reserved `Item Purchases` account implies it. Both are consistent with d16's refusal to allocate landed cost; what differs is when cost leaves the balance sheet.
- **What is a fiscal year?** Retained earnings and any closing entry need one, and nothing on record says whether a year here is calendar or fiscal — [M-01](M-01-supplier-margin.md) records the same gap for a Supplier year and declines to answer it. [M-03](M-03-daily-summary.md) defers arbitrary date-range reporting, so this flow cannot borrow a period from there either.
- **Are account numbers the store's, or ours?** A reserved account's **role** has to be fixed: the software must know where inbound freight goes. Whether its **number and name** are also fixed is a separate question, and forcing our numbering onto a shop whose accountant already keeps a chart is friction an export exists to remove.
- **Where do bank accounts live?** Nothing in this system models one. [M-05](M-05-accounts-payable.md) records a payment **Method** and a free-text **Reference**, and makes the bank statement the reconciliation surface *outside* the software — deliberately. A BankDeposit ([lexicon](../lexicon.md) §14) needs somewhere for the money to land, which is a new concept rather than a GL code on an existing row. Structural: belongs with `/architecture`.
- **Does a CloseBatch become immutable once it has been banked?** Undo End of Day ([M-03](M-03-daily-summary.md) d4) returns a batch's Sales to Current and must restore them exactly. A BankDeposit pinned to that batch could be orphaned by the undo, or the Sales behind an already-banked figure could change afterwards. [architecture](../architecture.md) A-33's shape — immutability attaches when the money is real and releases when it is undone — is the obvious candidate, but nothing on record governs it. Structural: belongs with `/architecture`.
- **Does the second-hand cost convention need a caveat of its own?** [M-03](M-03-daily-summary.md) d11's unallocated-cost caveat is calibrated on new stock at *roughly 2.6%*. Where a lump is paid for a crate and the copies are booked at a nominal figure, per-item margin on second-hand stock is overstated by far more than that, and the truth lives in the aggregate rather than on the copy. d11 is not wrong; it does not reach this case.
- **What does the export actually emit?** QuickBooks Online no longer accepts IIF, so the durable targets are a journal file or an API. Emitting a **journal batch** and treating QuickBooks as one consumer of it costs nothing extra and avoids making a QuickBooks-shaped decision.
