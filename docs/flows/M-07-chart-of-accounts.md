# M-07 — Chart of accounts

**Actor:** Manager
**Status:** Stub — awaiting flow
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-03 Daily summary](M-03-daily-summary.md) · [M-05 Accounts payable](M-05-accounts-payable.md) · [M-06 Configure the store](M-06-settings.md)

**Job:** As a manager, I need every movement of money to land in a named account and leave this system in a form my accountant can import, so that the shop's books are built from what actually happened at the till rather than from a shoebox of paper.

*Amended by decision 9.* The original read *"so that I can see what the shop actually earned"* — decision 1 makes that something this system cannot do and decision 9 declines to half-do it, so the job is stated as what it is: a pipe, not a mirror.

**Scope note:** this flow owns the **chart** — the list of accounts — and whatever posts to it. It is not [M-06](M-06-settings.md), which configures the things other flows read and which has been holding three GL columns in reserve for this flow to draw. It is not [M-05](M-05-accounts-payable.md), which owns what is owed a supplier; a supplier balance is derived from payables artifacts and stays that way. The vocabulary is reserved in [lexicon](../lexicon.md) §14, including four words this flow must **not** reuse — *deposit*, *clearing*, *settlement* and *manual ledger entry* all already mean something else.

---

## Flow

_TBD_

## Requirements

_TBD_

## Wax Works cannot state net profit

Decision 1's accepted consequence, written here rather than left in a table cell,
because it constrains every screen this flow could ever grow.

Of the nine account groups a record shop needs, this system generates five and a half.
**Store expenses** — rent, insurance, payroll, utilities, depreciation — and **fees and
subscriptions** are not merely unimplemented; nothing in Wax Works knows they exist, and
no decision in any flow will make them known. A figure computed from what is here is not
a small understatement of profit. On an ordinary day it is wrong by more than the day's
gross margin.

So: **no screen, report, export summary or column in this system may be labelled *profit*,
*net profit*, *net income*, or *earnings*.** Gross margin is available and true, and is
called gross margin. The distinction is not pedantry — the person reading it is the
least equipped in the building to notice the difference, which is exactly why the label
has to carry the weight instead of them.

This is the same instinct [M-01](M-01-supplier-margin.md) d14 follows in stating Received
and Sold on their own bases and saying so, and the reason [M-03](M-03-daily-summary.md)
d11 carries its caveat wherever a margin appears.

## Inherited from other flows

_Commitments pushed here by another flow. These are decided, not open — each cites
the decision it comes from._

- ~~**Three GL columns are reserved, unread, and drawn nowhere**~~ — **inherited, then retired by decision 4** ([M-06](M-06-settings.md) d58). Kept here as the record of what this flow was handed: — a tax type's `gl_account` ([M-06](M-06-settings.md) d11), a tender's **Code** (d23) and a Section's **GL code** (d28). Nothing reads one and no migration waits on one. [architecture](../architecture.md) §10 adds the instruction that comes with them: **re-check all three shapes when this flow is written**, because a column reserved against an unwritten specification is a guess with a comment on it.
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
| 1 | **This flow is a chart of accounts and a journal export. It is not an internal ledger.** Wax Works holds no account balances, runs no period close, and offers no manual journal entry. Every money movement it **already records** maps to a GL account and is emitted as a balanced journal batch; the store's books live with their accountant. Chosen because the export version is a **strict subset** of the ledger version — nothing built here is thrown away if a ledger is wanted later — and because the two account groups a ledger would need most (store expenses, fees and subscriptions) are precisely the two this system knows nothing about. *Accepted consequence, and it binds every screen:* **Wax Works cannot state net profit** — see below |
| 2 | **Inventory is perpetual: a copy's own cost moves from Inventory to cost of goods at the moment it sells.** Available because an InventoryItem is an individual row carrying its own cost, which is unusual for a shop this size and is the reason gross margin can be true every day rather than on count day. Applies to **both intake modes** — a second-hand copy booked at a nominal figure moves that nominal figure, and the difference between it and what was actually paid stays in **Second-hand purchases** ([lexicon](../lexicon.md) §14) rather than being pushed down onto copies. Consistent with [E-02](E-02-receive-inventory.md) d16 either way: freight, misc and the CostAdjustment are still never allocated per copy, so they reach the period rather than the item, which is [M-03](M-03-daily-summary.md) d11's existing caveat and not a new one |
| 3 | **A reserved account's *role* is fixed; its *number* and *name* belong to the store.** The software must know where inbound freight goes and that never changes — but a shop whose accountant already keeps a chart should map onto it rather than be renumbered by us, which is the friction decision 1's export exists to remove. So **nothing in this system resolves an account by its number.** *Accepted consequence:* a mapping layer exists from day one, and every citation in these documents names the **role**, never the digits — `501` is an example in a worked example and never an identifier |
| 4 | **Every account mapping lives in this flow, not on the configuration row it maps. Supersedes the *shape* of [M-06](M-06-settings.md) d11's `gl_account`, d23's tender **Code** and d28's Section **GL code** — and none of their intent.** All three reserved a place for a general ledger and all three were right to; what they drew was a **code typed onto a settings row**, which decision 3 has just made unresolvable — nothing may look an account up by its number. So the seam moves: this flow holds the mapping, and the Section, tender and tax-type editors in M-06 carry no GL field at all. This is the re-check [architecture](../architecture.md) §10 asked for, arriving at the answer §10 anticipated — *"a column reserved against an unwritten specification is a guess with a comment on it."* **The guess was wrong in shape and right in instinct.** *Accepted consequence:* three columns reserved specifically to avoid a migration have now bought one, and the settings screens lose a field they were specified to show |
| 5 | **A tax type maps to two accounts, not one: tax collected and tax paid.** Tax appears on both sides of the books and they are opposite in kind — GST charged on a Sale is a **liability** owed to the government, GST paid on a supplier Invoice is an **Input Tax Credit and therefore a receivable** ([E-02](E-02-receive-inventory.md) d34, [architecture](../architecture.md) A-29). Netting them into one signed account would merge an asset and a liability in a single row, which the export's destination will refuse and an accountant will ask about. **Explicitly not** a global input-tax account either: GST and QST are separate registrations with separate numbers ([M-06](M-06-settings.md) d48) remitted to separate authorities, so their credits cannot share a row |
| 6 | **The chart follows the seams the shop already maintains, rather than inventing a second taxonomy.** Revenue is **one account per Section**, because [M-06](M-06-settings.md) d28 already gives every Section a code and a sort order and d20 already records which ones are revenue at all — a single `Sales` account would discard a breakdown the shop curates and [M-03](M-03-daily-summary.md) already reports. Inventory adjustments are **one account per [E-04](E-04-manage-inventory.md) reason code** — `Shrinkage`, `Damaged`, `Found`, `Miscount / correction`, `Written off`, `Other` — for the same reason: the six exist because a Manager is made to choose between them, and collapsing them in the ledger throws away the only thing that choice was for. *Accepted consequence:* the starting chart is larger than a shop with four Sections strictly needs, and **grows when a Section is added** — a new Section is now also a new account, which decision 4's mapping has to prompt for rather than leave null |
| 7 | **A journal batch is written at the close, one per CloseBatch, and is immutable once written.** It rides alongside the summary [M-03](M-03-daily-summary.md) d13 already stores on the batch, for the same reason d13 gives: **storing rather than recomputing means a past day can never quietly restate itself.** A journal derived on demand at export time would let two exports of the same week disagree, with the accountant holding one of them and no way to tell which. *Accepted consequence:* the journal is now a **second thing the close produces**, so the close can fail for a reason that has nothing to do with selling — and artifacts that are not Sales have to find a batch to belong to, which is open below |
| 8 | **A correction posts forward to the day it was made. The original entry always stands.** A misread cost corrected a week later ([E-02](E-02-receive-inventory.md) d40), or a PaymentBatch voided in [M-05](M-05-accounts-payable.md) d22, produces a **reversing entry dated when someone actually did it** — never an edit to the day it concerns. This is [architecture](../architecture.md) A-33a's *reverse as recorded* applied to the ledger, and it is what keeps a period that has been exported, imported and filed from moving under the person who filed it. *Accepted consequence:* a single day's journal read in isolation can contain an entry that was reversed later, and only the range tells the truth — which is how every accounting system behaves and is worth saying anyway |
| 9 | **M-07 is configured once and then exported from. It has no dashboard, no balances and no journal view.** Ongoing use is a single screen: choose a date range, download the file. Setup is touched again only when a Section or tender is added, which decision 6 makes a prompt rather than a silent null. Follows from decision 1 — a flow that holds no balances has none to display, and a read-only journal view would be the first step back toward the ledger decision 1 declined. *Accepted consequence, and it is a real cost:* a Manager asking *"what is this $52 doing in Freight Inbound"* cannot answer it here. They answer it in the accounting package the export feeds, or this decision gets revisited with a read-only view — which is an addition, not a reversal |

## Open questions

~~**One is blocking, and most of the rest are downstream of it.**~~ **Nothing is blocking now.**

- ~~**Is this a coding table with an export, or an internal double-entry ledger?**~~ — **Resolved** by decision 1: a chart and a journal export, with no balances held here. The reserved-account wish list this flow was proposed with — *Retained Earnings*, *Net Profit*, *Current Profits* — described the ledger version and **does not survive**: all three are equity or derived figures that only mean something inside a period close this flow does not run, and the second and third are forbidden outright by decision 1's consequence. *Retained Earnings* becomes a target the export maps **to**, in the accountant's chart, not an account this system holds.
- ~~**Perpetual or periodic inventory?**~~ — **Resolved** by decision 2: perpetual, for both intake modes.
- ~~**Are account numbers the store's, or ours?**~~ — **Resolved** by decision 3: the role is ours, the number and name are theirs, and nothing resolves an account by its number.

The rest are open and none of them blocks a build:

- **Which journal batch do artifacts that are not Sales belong to?** Decision 7 hangs the journal on the CloseBatch, but a finalized Invoice ([E-02](E-02-receive-inventory.md)), a PaymentBatch ([M-05](M-05-accounts-payable.md) d16) and an on-hand adjustment ([E-04](E-04-manage-inventory.md)) are **none of them Sales**, and the close touches only Current Sales ([M-03](M-03-daily-summary.md) d1, [architecture](../architecture.md) A-23). Attaching them by their own date is the obvious answer and it has two holes: a day nobody closed, and an artifact created after the close ran. Neither is exotic — receiving often happens after the till is totalled.
- ~~**Does a tax type need two GL accounts rather than one?**~~ — **Resolved** by decision 5: two, collected and paid, and [M-06](M-06-settings.md) d58 retires the single field that could not carry both.
- ~~**Is Sales one account or one per Section?**~~ — **Resolved** by decision 6: one per Section, and one adjustment account per [E-04](E-04-manage-inventory.md) reason code alongside it.
- ~~**What is a fiscal year?**~~ — **Moot, not answered.** Decision 1 runs no period close and holds no equity accounts, so nothing here needs to know where a year begins. The question belongs to whoever receives the export. It returns the day a ledger does — noted so that a future reader does not mistake its absence for an answer.
- **Where do bank accounts live?** Nothing in this system models one. [M-05](M-05-accounts-payable.md) records a payment **Method** and a free-text **Reference**, and makes the bank statement the reconciliation surface *outside* the software — deliberately. A BankDeposit ([lexicon](../lexicon.md) §14) needs somewhere for the money to land, which is a new concept rather than a GL code on an existing row. Structural: belongs with `/architecture`.
- **Does a CloseBatch become immutable once it has been banked?** Undo End of Day ([M-03](M-03-daily-summary.md) d4) returns a batch's Sales to Current and must restore them exactly. A BankDeposit pinned to that batch could be orphaned by the undo, or the Sales behind an already-banked figure could change afterwards. [architecture](../architecture.md) A-33's shape — immutability attaches when the money is real and releases when it is undone — is the obvious candidate, but nothing on record governs it. Structural: belongs with `/architecture`.
- **Does the second-hand cost convention need a caveat of its own?** [M-03](M-03-daily-summary.md) d11's unallocated-cost caveat is calibrated on new stock at *roughly 2.6%*. Where a lump is paid for a crate and the copies are booked at a nominal figure, per-item margin on second-hand stock is overstated by far more than that, and the truth lives in the aggregate rather than on the copy. d11 is not wrong; it does not reach this case.
- **What does the export actually emit?** QuickBooks Online no longer accepts IIF, so the durable targets are a journal file or an API. Emitting a **journal batch** and treating QuickBooks as one consumer of it costs nothing extra and avoids making a QuickBooks-shaped decision.
