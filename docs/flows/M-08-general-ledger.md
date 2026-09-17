# M-08 — Keep the general ledger

**Actor:** Manager
**Status:** In clarification
**Related:** [M-03 Daily summary](M-03-daily-summary.md) · [M-05 Accounts payable](M-05-accounts-payable.md) · [M-06 Configure the store](M-06-settings.md) · [M-07 Chart of accounts](M-07-chart-of-accounts.md) · [E-07 Manage customers](E-07-manage-customers.md)

**Job:** As a manager, I need every movement of the shop's money — not only what the till and the receiving desk generate — recorded in one place that can tell me what the business is worth and what it earned, so that I am not finding out from my accountant months later.

**Scope note:** this flow **holds the books**. [M-07](M-07-chart-of-accounts.md) owns the **chart** — the list of accounts, their roles and their mappings — and owns the journals that the artifacts of this system write for themselves (M-07 d12, [architecture](../architecture.md) A-67). M-08 owns everything that turns those journals into a set of books: postings a Manager types, an opening position, a seal, balances, statements and reconciliation. The division is deliberate and load-bearing: **M-07 records what happened; M-08 says what it means.**

This flow is **split from [M-07](M-07-chart-of-accounts.md)** (decision 1 below). M-07 keeps its ID and every one of its 26 decisions; nothing is renumbered and nothing moves. What changes is that M-07 d1's *"Wax Works holds no account balances, runs no period close"* is a statement about the **system** rather than about M-07's own scope, and this flow is where that half is reversed. **That supersession is written in M-07, not here** — it is M-07's row to append.

---

## Flow

_Phase 1 is interrogated and its decisions recorded. Phases 2 to 4 are **drafted and not
yet interrogated** — a guess marked as a guess, not a specification._

### Phase 1 — The opening position *(once, at migration)*

The shop is **migrating off paper**. There is no prior system to export from, so the
opening figures come from the accountant's last statements. **An opening position is not
history** — it carries no transactions and no past periods, only the balances of one day,
and the years behind it stay with the accountant. Until it exists, every balance this flow
can compute is an activity total and not a position (decision 9).

1. Manager names the **first day the books start**. *Guess: it must be a past date and the
   first day of a month; unconfirmed.*
2. System creates the **opening position** — one transaction dated the day before, carrying
   a line for every account in [M-07](M-07-chart-of-accounts.md)'s chart.
3. **Inventory is supplied by the system, not typed** — on hand × cost, which this system
   knows because the shop had to enter its stock to use Wax Works at all. Where it disagrees
   with the accountant's figure, **the counted figure wins** and the difference falls into
   equity, which is where a stock difference belongs.
4. Manager types the remaining balance sheet figures from the accountant's statements —
   bank, loans, equity. **No revenue or expense** (decision 9).
5. Paper-era supplier debts are typed as one figure into *Accounts payable — opening*, never
   into *Accounts payable* (decision 7).
6. The customer side stays **empty** — outstanding store credit and customer invoices are
   honoured on paper and never migrated (decision 8).
7. Manager reviews as often as they like; the opening position persists as a draft. _TBD —
   what happens when the typed figures do not balance, which is open below._
8. Manager **seals** the opening position. It may still be unsealed and retyped until the
   first real period is sealed, and never after (decision 6).

### Phase 2 — Postings a Manager types

Rent, utilities, bank loans, loan interest, depreciation, an owner's draw, corporate
tax. **This is the phase that makes the rest of the flow honest** — a balance computed
from a ledger that has never seen rent is not a partial answer, it is a wrong one.

_Drafted, not interrogated. Every step below is a guess until it is a decision._

9. Manager starts a new **posting**. *Guess: manager-only, on [architecture](../architecture.md) A-28a's existing list rather than a new gate.*
10. Manager enters the **transaction date** — the date the thing happened, not the date the paper arrived. A date inside a **sealed** period is **refused**, and the Manager dates it in the open period instead (decision 11).
11. Manager adds lines. Each carries an **account**, a **location** — required, defaulted from the Store — an optional **section**, an **amount** and a **note** (decisions 2, 12). *Guess: the note is per line, not per posting.*
12. System shows continuously the amount still needed to balance, and on which side — or *Balanced*.
13. System **refuses to save an unbalanced posting** (decision 10). It does not go to Suspense: nothing is waiting to commit and the person who can fix it is standing there.
14. **Retained earnings, current profits and *Accounts payable* are not offered** (decision 13). **Suspense is not offered either**, and is cleared by its own act (decision 14, not ratified). **Inventory is offered** — a dead-stock write-down is exactly the case where book value should diverge from the shelf.
15. Posting is saved, and joins the journal beside everything the artifacts wrote.

### Phase 3 — Sealing a period

A month or a year is **sealed**, never *closed* — *close* is the end of the day
([lexicon](../lexicon.md) §15, decision 4).

_Drafted, not interrogated._

16. Manager opens **Seal a period**. System offers the oldest unsealed month.
17. System runs its checks and **reports every failure without sealing**: a posting that does not balance, an invalid account, section or location, and — *recommended, not ratified* — any Suspense line in the period.
18. Manager fixes what is fixable and re-runs.
19. Manager confirms. System writes the **closing transaction** carrying balance-forwards, and the period is sealed: nothing in it is writable.
20. Where the period ends a fiscal year ([M-06](M-06-settings.md), decision 5), the seal additionally **zeroes revenue and expense into retained earnings**. The system knows which one this is and says so before it happens, rather than asking.
21. *Recommended, not ratified:* the Manager may **unseal** the most recently sealed period, and only that one.

### Phase 4 — Reading the books

Balances per account over a date range, financial statements, reconciliation.

_Drafted, not interrogated._

22. Manager picks an account and a date range, optionally narrowed by section or location (decision 2), and reads **balance forward · activity in the period · new balance forward**, with every line behind it. *Note the middle term is true without an opening position and without a seal; the other two are not.*
23. Manager runs a **Profit & Loss** for a period and a **Balance Sheet** as at its end. *Guess: both marked **provisional** while the period is unsealed.* Every statement states the period it covers, because decision 9 makes the first year a short one.
24. Manager **reconciles** an account against an outside document — marking entries until the difference is zero, then stamping the marked set as reconciled together. _TBD — and see the vocabulary caution: *clearing* and *settlement* are both taken ([lexicon](../lexicon.md) §14)._
25. Statements and reconciliation reports are printable. *Guess: letter-size, following [E-02](E-02-receive-inventory.md) step 22.*

## Requirements

_Mostly `_TBD_`. The ones below are not new — they are inherited commitments restated
as requirements of this flow, and they constrain every screen it can grow._

- **Nothing here instructs a bank, a processor, or anyone else.** This flow records
  what a Manager tells it happened ([M-05](M-05-accounts-payable.md) d5,
  [PRD](../PRD.md) §7 NG-4). A reconciliation is a Manager reading a statement, not
  this system fetching one.
- **No account is ever resolved by its number** ([M-07](M-07-chart-of-accounts.md) d3).
  The number and name belong to the store; the software resolves by role. An account's
  *type* is derived from its role (d22), which is what lets a statement group correctly
  after a Manager has renumbered the whole chart to match their accountant's.
- **A non-zero Suspense balance is a defect in this system, never a data-entry error**
  ([M-07](M-07-chart-of-accounts.md) d10), and it is summed **gross** (d25). Whatever
  surfaces it must say so, and must not invite a Manager to correct something they
  cannot reach.
- **A journal line's business date is a calendar date** ([M-07](M-07-chart-of-accounts.md)
  d24, [architecture](../architecture.md) A-71) — because a line in the wrong period is
  visible and correctable, and a line in no period is neither.
- **All of it scopes to a Store** ([architecture](../architecture.md) A-5).
- _TBD_ — the requirements that follow from this flow's own decisions, once it has any.

## Inherited from other flows

_Commitments pushed here by another flow. These are decided, not open — each cites
the decision it comes from._

- **A journal is written inside the transaction that writes its artifact**
  ([architecture](../architecture.md) A-67). An artifact and its journal can never
  disagree. **This is the constraint that shapes decision 3 below**: whatever
  editability this flow grants, it cannot grant it over a line that A-67 guarantees.
- **Suspense keeps a journal balanced by construction, and the close always proceeds**
  ([M-07](M-07-chart-of-accounts.md) d10, d25). A bookkeeping defect must never stop
  the shop ending its day. **Two gates at two moments** is the shape this flow inherits:
  Suspense at write time so nothing blocks, and — proposed, not ratified — a refusal at
  the seal, where blocking costs nothing and silence costs everything.
- **A correction posts forward to the day it was made; the original entry always stands**
  ([M-07](M-07-chart-of-accounts.md) d8). A misread cost fixed a week later is a new
  entry dated this week.
- **The chart, its roles and its mappings belong to [M-07](M-07-chart-of-accounts.md)**
  (d3, d4, d11, d22, [architecture](../architecture.md) A-64). This flow reads the chart
  and never defines it. New account roles this flow needs — equity and non-operating —
  are **M-07's rows to add**, not this flow's.
- **A bank account is a `gl_accounts` row carrying a bank role, not an entity**
  ([architecture](../architecture.md) A-65). A-65 also records *"Wax Works will never
  tell you your bank balance"* — which **this flow reverses**, and which is therefore
  listed here as the commitment being changed rather than one being honoured.
- **A setting that has been referenced is deactivated, never deleted**
  ([M-06](M-06-settings.md) d9). An account that has been posted to is governed by this,
  and deactivation never stops it resolving ([M-07](M-07-chart-of-accounts.md) d18).
- **The close stores its summary rather than recomputing it**
  ([M-03](M-03-daily-summary.md) d13, [architecture](../architecture.md) A-30), and a
  CloseBatch is immutable while banked ([architecture](../architecture.md) A-66).
- **Immutability attaches to a state and releases when that state ends** — A-33a's
  *"immutable while paid, never immutable forever"* and A-66's *"immutable while
  banked"*. Decision 3 below is that pattern a third time, and is proposed rather than
  ratified.

## Resolved decisions

_Numbered so they can be cited precisely. Append only — never renumber or delete._

| # | Decision |
|---|---|
| 1 | **The ledger is its own flow. Split from [M-07](M-07-chart-of-accounts.md), which keeps its ID and all 26 of its decisions.** M-07 stays *a chart of accounts and a journal export* — that half of its d1 is still true of M-07 and is not superseded. What reverses is d1's claim about the **system**: *"Wax Works holds no account balances, runs no period close."* It now does both, here. **d1 was not badly reasoned; its premise was removed.** Its argument rests on store expenses being permanently unknowable — *"nothing in Wax Works knows they exist, and no decision in any flow will make them known"* (M-07, *Wax Works cannot state net profit*) — and Phase 2 is that decision. Split rather than absorbed because M-07 is already 26 decisions and four phases, and because the two halves have genuinely different shapes: M-07 is written by artifacts and touched at setup, M-08 is written by a person and read continuously. *Accepted consequence:* **two flows now describe one subject**, so every reader has to know which owns what — the scope note above is load-bearing, and M-07 needs the matching note pointing here |
| 2 | **A journal line carries `(account, section, location)` — three dimensions, not one. Supersedes [M-07](M-07-chart-of-accounts.md) d6's one-revenue-account-per-Section as the reporting grain.** A **Section** is a sub-account: it subdivides any account, not only revenue. A **Location** identifies a store or a division of the business, so activity that is not bookselling can sit in the same ledger and still be reported separately. d6 flattened Section *into* the account, which answers one question — revenue by Section — and forecloses every other, because a second axis has nowhere to go and a third does not exist. With dimensions, totalling an account across all Sections and totalling it within one are the same query with a different filter. **Chosen explicitly as future-proofing**, with the cost accepted in advance: this is cheap now and a data migration once a period has been closed, because re-dimensioning historical lines after the fact is the kind of global rewrite that has no safe undo. *Accepted consequence:* M-07 d6 and d11's per-Section revenue accounts are **the wrong grain** and M-07 must restate them; [architecture](../architecture.md) A-64's `(seam kind, seam id) → account` mapping keeps its job for seams that are genuinely separate accounts, but a Section stops being one of them. *Open below:* whether every line requires a Section and a Location, or whether blank is legal |
| 3 | _Status: recommended, not yet ratified._ **Editability is asymmetric: a posting a Manager typed is editable until its period is sealed; a line the system wrote is never editable and is corrected by posting forward.** Proposed because the two have different guarantees behind them. A system-written line is covered by [architecture](../architecture.md) A-67, which puts it in the same transaction as its artifact *"so that an artifact and its journal can never disagree"* — editing one is exactly the divergence A-67 exists to prevent, and [M-07](M-07-chart-of-accounts.md) d8's forward posting is already the mechanism for correcting it. A typed posting has no artifact to disagree with, so the same protection buys nothing and costs the Manager a reversing entry for every typo. **The shape is the house pattern, not a new one** — A-33a's *immutable while paid* and A-66's *immutable while banked*, here as *immutable once its period is closed*. *Accepted consequence, and the reason this is not obvious:* **two rules govern one table**, so *can I edit this line* stops being answerable from the line alone and needs its origin. *Not ratified — do not cite as settled* |
| 4 | **A period is *sealed*, never *closed*. Reserved in [lexicon](../lexicon.md) §15.** *Close* is the end-of-day close ([M-03](M-03-daily-summary.md)) and *CloseBatch* is its artifact, so a month close and a day close would be the same word for two acts that differ in scope, frequency, actor and reversibility — and this flow's every citation would have to disambiguate forever. **Seal** was chosen over *rule off* (accurate to the craft, but two words and awkward as an identifier) and over *lock* (which names the mechanism rather than the act, and which the architecture may still want for row-level locking). It also covers the **opening position**, which is a sealed transaction before it is anything else — one word for both, rather than a second term for the same state arrived at differently. *Accepted consequence:* the word a bookkeeper would reach for first is the one word this flow may not use, so **every screen has to teach it** — and a Manager who says "close the month" has to be understood anyway |
| 5 | **The fiscal year end is a store setting, configured in [M-06](M-06-settings.md). This flow reads it and never asks.** Closes [M-07](M-07-chart-of-accounts.md)'s *What is a fiscal year?*, which was recorded **moot rather than answered** — *"decision 1 runs no period close and holds no equity accounts, so nothing here needs to know where a year begins… It returns the day a ledger does."* This is that day. It goes to [M-06](M-06-settings.md) because that is where the things other flows read are configured, and because a year end is exactly that shape: set once, changed almost never, read by anything that reports. **What it buys is a check rather than a prompt** — the alternative was asking the Manager *"is this also your year end?"* at each seal, which is the reference model's shape and which nothing can validate: a Manager who answers no twelve times running never gets a year end, and one who answers yes in the wrong month gets one silently. With the setting, this flow knows which seal is a year end and can say so before it happens. *Accepted consequence:* a fiscal year end becomes a configuration a Manager can change **after** a year has been sealed under the old one, which [M-06](M-06-settings.md) has to refuse or handle |
| 6 | **The opening position can be unsealed and retyped, but only while no other period has been sealed. After that it is permanent, and its errors are corrected by a dated posting like any other.** The figures come from paper and are typed, so a typo is likelier here than anywhere else in the system and **far less visible** — a wrong opening balance is carried forward by every subsequent period and never disagrees with anything. So there is a window. **It closes at the first seal rather than after a fixed time**, because that is the moment the opening figures stop being a draft nobody has relied on and become what a sealed period counted forward from; moving them afterwards would restate a period already ruled off, which is the harm [M-07](M-07-chart-of-accounts.md) d8 exists to prevent. Same shape as [architecture](../architecture.md) A-33a and A-66 — **writable until something depends on it, then never again** — and the third instance of that pattern in this flow. *Accepted consequence:* a shop that seals its first month and then finds its opening bank figure wrong carries a **visible correcting posting** in month two rather than a clean opening position. That is the correct outcome and it will still feel like a mistake to whoever reads it |
| 7 | **Paper-era supplier debts go into an opening account of their own and are drawn down by hand. The *Accounts payable* account is never typed into, and reconciles to [M-05](M-05-accounts-payable.md) exactly and permanently.** The shop switching on owes its suppliers real money that [M-05](M-05-accounts-payable.md) knows nothing about, and nobody is going to retro-enter forty invoices with their terms and due dates. **A derived A/P figure would therefore be a confident zero** — this system stating as a fact that the shop owes nothing — which is the one outcome worse than asking the Manager to type a number. So the lump is typed, into *Accounts payable — opening*: no supplier, no due date, no aging, drawn down as the old bills are paid until it reaches zero and stays there. **What this buys is an invariant rather than a tidier chart:** *the Accounts payable balance **is** M-05's balance* is checkable on day one and every day after, where a single blended account is off by an unknown remainder forever and no one can tell whether that remainder is a leftover or a bug. *Accepted consequence:* the chart carries an account that only ever shrinks and is dead weight once it empties, and **the old debts have no aging and no supplier** — *who do we owe that $11,300 to* is a question this system cannot answer and the paper can |
| 8 | **The customer side opens empty. Outstanding store credit and unpaid customer invoices stay on paper, are honoured there, and nothing is migrated.** Unlike a supplier lump, a customer balance is **owed to a named person**, so a single opening figure cannot do the job that figure exists for — a customer arriving with a paper credit note needs the store to know *them*, not a total. Rather than retro-enter every customer, the store runs the paper out: existing credits are honoured from the paper record, and everything issued from the switchover is a real [E-07](E-07-manage-customers.md) balance. *Accepted consequence, and it is a genuine overstatement of the shop's worth:* **outstanding store credit is a real liability that will not appear on the balance sheet.** The books will say the shop owes its customers nothing while a drawer of paper credit notes says otherwise, and the gap closes only as they are spent. It is bounded and it shrinks, but on day one it is wrong in the shop's favour, which is the direction that flatters. *Open below:* what the till actually does when one of those notes is presented |
| 9 | **The books' first fiscal year is a stub. No year-to-date revenue or expense is typed into the opening position, so the first annual statement covers only the months since the switchover.** The opening position carries the balance sheet and nothing else. **The asymmetry this rests on is real and worth stating:** a P&L is honest from day one with no opening position at all, because revenue and expense genuinely do start at the switchover — it is only the **balance sheet** that is wrong without one. So the balance sheet figures are mandatory and the year-to-date figures are optional, and this decision declines the optional half. Ten fewer numbers typed from paper is ten fewer chances to type one wrong, and the year they would reconstruct is a year whose detail lives with the accountant anyway. *Accepted consequence:* **the first annual P&L is not comparable to the years either side of it**, so every statement has to state the period it covers plainly enough that a short first year does not read as a bad one |
| 10 | **A typed posting that does not balance is refused. It is not sent to Suspense, and this does not contradict [M-07](M-07-chart-of-accounts.md) d10 — it is what keeps d10 true.** d10's Suspense exists for a specific reason given at [architecture](../architecture.md) A-67: a journal is written inside its artifact's transaction, so a journal that could fail to balance is a journal that could **fail the commit**, and *"a bookkeeping defect must never be able to stop the shop ending its day."* **None of that reaches a typed posting.** There is no artifact waiting to commit, no till blocked, no close halted — only a Manager at a screen with the correction in front of them. And d10's accepted consequence is explicit that a Suspense balance is *"always a defect in this system, never a data-entry mistake — no Manager action can create one"*; a typo routed to Suspense would make that sentence false the first time it happened, and every surface that tells a Manager not to try to fix a Suspense line would become a lie. **Refusing is therefore the reading that preserves d10 rather than the exception to it.** *Accepted consequence:* this is the one place in the system that **blocks** rather than proceeding-and-recording ([architecture](../architecture.md) A-28a), so the refusal has to earn it by being useful — it must name the amount still needed and which side, not merely say no |
| 11 | **A posting dated inside a sealed period is refused. The Manager dates it in the open period instead.** The hydro bill for January arriving in February after January is sealed lands in February. This is [M-07](M-07-chart-of-accounts.md) d8's post-forward rule reaching the one case d8 did not have to imagine — *"nothing may restate a day that has already been exported"* — and a sealed period is the stronger form of that: a statement may already be printed and with the accountant, and a posting that slipped into it would leave the books and that statement disagreeing with nothing anywhere saying so. *Rejected:* unsealing January to take the posting, which is more accurate on paper and makes unsealing routine — and a seal that is routinely undone has stopped meaning anything. *Accepted consequence, and the reference model warns about it in these terms:* **an expense can land in the month the paper arrived rather than the month it was incurred**, so a Manager who seals early buys drift. The mitigation is operational, not mechanical — seal a month once the bills for it have come in, not on the first of the next |
| 12 | **A location is required on every line; a section is optional.** A **location** is derivable everywhere without asking — [architecture](../architecture.md) A-5 already scopes every row to a Store, and a single-store shop has exactly one — so requiring it costs almost nothing now and means the axis is **populated from day one** rather than back-filled the day a second location exists, which is the migration decision 2 was chosen to avoid. A **section** is a reporting refinement and genuinely does not apply to every line: a bank transfer, a loan repayment and an owner's draw have no section, and inventing one for them would put noise in the axis rather than detail. Where a section *is* meaningful the posting already knows it — a revenue line resolves its Section through the Sale line ([E-05](E-05-sell-a-record.md)) — so a blank section marks *not applicable* rather than *not bothered*. *Accepted consequence:* the two dimensions behave differently, which a reader has to be told rather than infer, and **a blank section is indistinguishable from a forgotten one** on a line typed by hand. *Open below:* whether a location and a Store are the same thing, which decision 2 did not settle and which this decision assumes |
| 13 | **Retained earnings, current profits and *Accounts payable* are not typeable. Inventory and Suspense are treated differently and separately.** The first three are kept by the system for itself: retained earnings and current profits are **derived from the P&L by the year-end seal**, and a typed figure makes the books disagree with themselves; *Accounts payable* is [M-05](M-05-accounts-payable.md)'s balance exactly and permanently under decision 7, and one typed line breaks that invariant on its first use. **Inventory is typeable, and this reverses the drafting instinct.** [M-07](M-07-chart-of-accounts.md) d2's perpetual inventory makes the account's balance the sum of on-hand costs — but **a dead-stock write-down is precisely the case where book value *should* diverge from the shelf**, and it is a real and recurring act in this trade rather than an edge case. Forbidding it would leave a shop unable to write down stock it cannot sell, which overstates assets year after year and is the failure the reference model spends a section warning about. *Accepted consequence:* **the Inventory account stops being reconcilable to on-hand × cost by construction**, so something has to be able to show the difference and say which part of it was deliberate. *Suspense: see decision 14* |
| 14 | _Status: recommended, not yet ratified._ **Suspense is not available in an ordinary posting. Clearing a Suspense balance is a separate, manager-only act that records a reason.** [M-07](M-07-chart-of-accounts.md) d10 states that *"no Manager action can create one and none can clear one"* — written when nothing but an artifact could write a journal, which made it a description; manual postings turn it into a **choice**. Making Suspense ordinarily typeable would decide it the wrong way: the danger is not a Manager clearing a genuine Suspense balance once its cause is fixed, it is Suspense quietly becoming **what it means in every other accounting package** — the bucket a difference is dumped into so a posting will balance. That is the exact thing d10 exists to prevent, and decision 10 above refuses the same move by a different door. **But a balance that nothing can ever clear is also wrong:** a defect gets fixed and its three dollars sit on the balance sheet forever. So the route exists and is deliberately not ordinary — its own act, manager-only, carrying a reason, and visible as an exception rather than as a line in a posting nobody reads twice. *Not ratified — the mechanism is proposed here rather than chosen, and [M-07](M-07-chart-of-accounts.md) d10 may need a row of its own to say that its "none can clear one" now has an exception* |

## Open questions

**None of these blocks scaffolding, and all of them block building.** The first two are
owned elsewhere and are the real dependencies; the rest are this flow's own.

### Blocking, owned by another flow

- **Exchange gain or loss.** [M-06](M-06-settings.md) d39 is explicit that this comes due
  on exactly this trigger: *"it is blocked on there being no general ledger — and it is
  deferred with one."* [M-07](M-07-chart-of-accounts.md) d17 discharged it by declining
  to compute one — *"the gain belongs to whoever holds the books, and decision 1 says
  that is not us"* — and **decision 1 above removes that defence.** d39 names the price:
  [architecture](../architecture.md) A-36, A-47 and [M-06](M-06-settings.md) d37 reopened
  together. [M-05](M-05-accounts-payable.md)'s *Currency movement* question, closed on
  d17, reopens with it. **Owned by [M-06](M-06-settings.md).**
- **Accounts receivable is one signed figure that nets an asset against a liability.**
  [E-07](E-07-manage-customers.md) d4 makes a Customer's balance a single signed number —
  positive is store credit the shop owes, negative is an unpaid customer invoice the shop
  is owed. E-07 records the problem in its own naming note. **A balance sheet needs both
  halves in different sections and cannot derive them from one column.**
  [PRD](../PRD.md) §6 already carries this open. **Owned by [E-07](E-07-manage-customers.md).**

### This flow's own

- **What does the till do when a paper credit note is presented?** Decision 8 runs the
  paper out rather than migrating it, which is settled — but a customer will walk in with
  one, and [E-05](E-05-sell-a-record.md)'s **Store Credit** tender draws on an
  [E-07](E-07-manage-customers.md) balance that, by decision 8, does not exist. Three
  shapes, none chosen: the Manager **creates the Customer and issues the credit then**,
  which is decision 8's migration happening one customer at a time and on demand — and
  the offsetting entry lands as a cost in the month it was honoured, which is honest;
  ringing it as a **discount**, which understates revenue and loses the fact that a
  liability was settled; or a **tender of its own** for exactly this, which is a mechanism
  built for a case that empties. **Owned jointly by [E-05](E-05-sell-a-record.md) and
  [E-07](E-07-manage-customers.md)** — this flow only cares that whatever happens produces
  a balanced posting. Raised by decision 8, and it is the practical half of that
  decision's accepted consequence.

- ~~**What is a closed period called?**~~ — **Resolved** by decision 4: a period is
  **sealed**. Reserved in [lexicon](../lexicon.md) §15, along with *unseal* and
  *opening position*, before anything cited it.
- ~~**Are a Section and a Location required on every line, or may they be blank?**~~ —
  **Resolved** by decision 12: a location is required and defaulted from the Store, a
  section is optional and its blank means *not applicable* rather than *not bothered*.
- **Is a location the same thing as a Store?** Decision 12 requires one on every line and
  defaults it from the Store, which [architecture](../architecture.md) A-5 already scopes
  every row to — **but the reference model's Location is a *division of the business***, a
  bookseller who also collects rent keeping the two reportable apart. Those are two
  different partitions, and this flow currently assumes they are one field. If they are
  not, a line needs both, and decision 2's triple is a quadruple. **Cheap to settle now and
  a migration later**, on exactly the grounds decision 2 was chosen. Related and also open:
  whether a balance sheet can be drawn per location at all, which is the only reason to
  carry one.
- **Can a period be reopened, and how far back?** Reopening the most recent period only is
  the conventional answer. Unsettled here, and it interacts with decision 3: reopening a
  period makes typed postings editable again, which is either the point or a hole.
- **What refuses a seal?** An unbalanced transaction and an invalid code are the
  obvious two. **A Suspense line is the interesting one** —
  [M-07](M-07-chart-of-accounts.md) d10 makes it a defect in this system by construction,
  so a period containing one is a period whose books record a known bug. Proposed above as
  a refusal; not ratified, and the counter-argument is real: a refusal a Manager cannot
  clear is a refusal that stops the books forever, since d10 also records that **no
  Manager action can clear one**.
- **Does the opening position need to balance before it is sealed?** Migrating off paper
  means there is nothing to reconcile against except the paper. Unsettled what this flow
  does when figures typed from an accountant's statements do not balance — which,
  being typed, they sometimes will not. *Decision 6 settles when the opening position may
  be **retyped**, not what happens when it does not **balance** — different questions, and
  only the first is closed.*
- **What is a financial statement here — a screen, a file, or both?** And does the
  existing CSV export ([M-07](M-07-chart-of-accounts.md) d15) stay M-07's, or does a
  reporting surface in this flow absorb it? **M-07 Phase 4 is not built and is on hold
  pending this.**
- **Does this flow raise a ReviewFlag, or does it have its own surface?**
  [architecture](../architecture.md) A-68 already allows a system-raised flag, and A-71
  declined to add a second kind, recording that *"a flag that cannot fire is worse than no
  flag, because it reads like coverage."* Unsettled whether an unbalanced period, a failed
  close or a stale reconciliation belongs in the review queue or somewhere else.
