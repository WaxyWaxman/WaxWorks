# M-08 — Keep the general ledger

**Actor:** Manager
**Status:** Specified
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

1. Manager names the **first day the books start** — **any day** (decision 35). The guess
   drafted here, that it had to be a past date and the first of a month, is retired in both
   halves.
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
7. **Equity is not typed** — it is the figure that balances assets against liabilities, and
   is shown rather than entered (decision 26). The opening position therefore cannot fail
   to balance. Manager reviews as often as they like; it persists as a draft.
   **This review is the single highest-value check in the flow**, because decision 26's
   cost is that a typo in an asset becomes equity silently.
8. Manager **seals** the opening position. It may still be unsealed and retyped until the
   first real period is sealed, and never after (decision 6).

### Phase 2 — Postings a Manager types

Rent, utilities, bank loans, loan interest, depreciation, an owner's draw, corporate
tax. **This is the phase that makes the rest of the flow honest** — a balance computed
from a ledger that has never seen rent is not a partial answer, it is a wrong one.

_Drafted, not interrogated. Every step below is a guess until it is a decision._

9. Manager starts a new **posting**. **Manager-only** ([architecture](../architecture.md) A-74, which puts it on A-28a's list) — the guess recorded here is settled, and it needed settling: A-28a named no ledger act, and [M-04](M-04-manage-users.md) d2 makes anything unlisted an Employee action.
10. Manager enters the **transaction date** — the date the thing happened, not the date the paper arrived. A date inside a **sealed** period is **refused**, and the Manager dates it in the open period instead (decision 11).
11. Manager adds lines. Each carries an **account**, a **location** — required, defaulted from the Store — an optional **section**, an **amount** and a **note** (decisions 2, 12). *Guess: the note is per line, not per posting.*
12. System shows continuously the amount still needed to balance, and on which side — or *Balanced*.
13. System **refuses to save an unbalanced posting** (decision 10). It does not go to Suspense: nothing is waiting to commit and the person who can fix it is standing there.
14. **Retained earnings and *Accounts payable* are not offered** (decision 13, corrected by [M-07](M-07-chart-of-accounts.md) d31 — *current profits* is derived and is not an account), and **neither is the gift card liability** (decision 33). **Suspense is not offered either**, and is cleared by its own act (decision 14, not ratified). **Inventory is offered** — a dead-stock write-down is exactly the case where book value should diverge from the shelf — and so are **tax collected and tax paid**, because nothing in this system remits tax and a Manager who cannot post the remittance watches the liability grow forever (decision 34). The test behind all five calls is decision 32.
15. Posting is saved, and joins the journal beside everything the artifacts wrote.

### Phase 3 — Sealing a period

A month or a year is **sealed**, never *closed* — *close* is the end of the day
([lexicon](../lexicon.md) §15, decision 4).

_Drafted, not interrogated._

16. Manager opens **Seal a period**. System offers the oldest unsealed month.
17. System runs its checks and **reports every failure without sealing**: a posting that does not balance, and an invalid account, section or location.
18. A **Suspense line does not block the seal** (decision 15). It is reported, and its gross total is carried onto the closing transaction, because no Manager action can clear one and a seal that refused would stop the books permanently.
19. Manager fixes what is fixable and re-runs.
20. Manager confirms. System writes the **closing transaction** carrying balance-forwards — and the period's Suspense total, where there is one — and the period is **sealed**.
21. Where the period ends a fiscal year ([M-06](M-06-settings.md), decision 5), the seal additionally writes **visible closing postings** zeroing revenue and expense into retained earnings, dated the last day of the year and identifiable as the seal's (decision 17). The system knows which period this is and says so before it happens, rather than asking.
22. A Manager may **unseal the most recently sealed period**, with authorization and a required reason, and may repeat it to walk backwards (decisions 18, 29). **Nothing after it needs recomputing** — by definition there is no sealed period later than the most recent one. A sealed **year** is reached the same way, so an accountant's year-end adjustments can land in the year they belong to.
23. Once the return is filed, the Manager **marks the year filed**. A filed year refuses the unseal, and so does every month inside it (decision 22) — the only permanently irreversible state in this system, and the only one that depends on a Manager arming it.

### Phase 4 — Reading the books

Balances per account over a date range, financial statements, reconciliation.

_Drafted, not interrogated._

24. Manager picks an account and a date range, optionally narrowed by section or location (decision 2), and reads **balance forward · activity in the period · new balance forward**, with every line behind it. *The middle term is true without an opening position and without a seal; the other two are not.*
25. Manager runs a **Profit & Loss** for a period and a **Balance Sheet** as at its end. The P&L has a bottom line and it is called a profit (decision 23). Equity on the balance sheet carries **current earnings, derived at the moment it is drawn** and named as its own line rather than folded into a total (decision 24). Every statement states the period it covers, because decision 9 makes the first year a short one. Both are marked **provisional** while any period they cover is unsealed, and the mark is stored on the issuance rather than rendered (decision 36).
26. **Issuing** a statement stores it (decision 25), so what the accountant is holding is a fact this system has — which is what d16's unseal, d22's *filed* mark and [M-07](M-07-chart-of-accounts.md) d16's unmodelled export log all separately want.
27. Manager **reconciles** an account against an outside document — a bank statement, or the two halves of an undeposited-funds movement — marking entries until the difference is zero, then stamping the marked set as **reconciled together** (decision 25). It moves no money, and nothing downstream requires it.
28. Statements and reconciliation reports are printable. *Guess: letter-size, following [E-02](E-02-receive-inventory.md) step 22.*

## Requirements

_The first group are inherited commitments restated as requirements of this flow. The
second follow from its own decisions._

**Inherited, restated:**

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
- **A posting's period is its transaction date and nothing else.** There is no separate
  field saying which month an entry is filed in, and the date it was typed
  ([M-07](M-07-chart-of-accounts.md) d15's `writtenAt`) never affects where it lands. So
  *"post it in October with a September date"* is not a thing this system can do, and
  neither can any other double-entry ledger: **the September date *is* what puts it in
  September.** The choice is always between dating it September — which needs September
  open — and dating it October, which is a real and often correct answer for an ordinary bill (decisions 11, 16).
- **All of it scopes to a Store** ([architecture](../architecture.md) A-5).
**From this flow's own decisions:**

- **A posting must balance before it is saved** (decision 10), and a typed posting never
  reaches Suspense. Suspense is exclusively the system-defect account
  ([M-07](M-07-chart-of-accounts.md) d10) and nothing a person types may put a figure
  there (decisions 13, 14) — which is what keeps *"always a defect in this system, never
  a data-entry error"* true now that there is data entry.
- **Nothing may write into a sealed period** (decision 11), by any route. A posting dated
  into one is refused; so is any act that would restate a day inside one, including
  [M-03](M-03-daily-summary.md)'s Undo End of Day, which is the one reversal in this
  system that does not post forward.
- **A sealed period is reopened only by an unseal, and an unseal is an artifact** —
  authorized, reasoned and recorded (decisions 16, 18). **A year marked *filed* cannot be
  unsealed at all** (decision 22): the only permanently irreversible state here, and the
  only one that depends on a Manager arming it.
- **Every figure this flow states must be reproducible from the journal.** Balance-forwards
  are stored *and* recomputable (decision 20), so a stored figure a rebuild would not
  reproduce is a defect — and something must be able to say so, because nothing else in
  this system has two paths to one number.
- **Nothing is posted that no artifact caused.** Current earnings is derived when a
  statement is drawn (decision 24); the only equity postings ever written are the
  year-end seal's, and those are visible (decision 17). This is
  [M-07](M-07-chart-of-accounts.md) d12's rule holding in the one flow that could most
  easily break it.
- **A statement states the period it covers**, because decision 9 makes the first year a
  short one and a short year must not read as a bad one. An **issued** statement is stored
  (decision 25), so what the accountant holds is a fact this system has rather than an
  assumption.
- **A reconciled set moves no money** (decision 25). It is balance-neutral by
  construction, like [M-05](M-05-accounts-payable.md) d15's clearing and deliberately not
  that word, and **nothing downstream requires it** — it is evidence, never a gate.
- **The opening position is typed, and nothing validates it against the world.** Its
  figures come from paper (decisions 6, 7, 8, 9), they may be corrected only until the
  first seal, and **an error in them is carried forward by every period afterwards without
  ever disagreeing with anything.** It is the least defended surface in this system and the
  most consequential.
- **A figure this flow states may be wrong, and that is new** (decision 23). The
  prohibition [M-07](M-07-chart-of-accounts.md) d1 imposed was a guarantee bought by
  silence; what replaces it is a set of conditions — the opening position right, every
  seam mapped, the expenses actually entered, the period sealed — **none of which is
  detectable from the figure itself.**

## Inherited from other flows

_Commitments pushed here by another flow. These are decided, not open — each cites
the decision it comes from._

- **A balance sheet classifies each Customer's balance by sign and never nets across Customers** ([E-07](E-07-manage-customers.md) d21). Store credit — a positive balance — totals into **liabilities**; an unpaid customer invoice — a negative one — totals into **assets**; the two groups are never added together. [E-07](E-07-manage-customers.md) d4's single signed figure and d5's derived-from-movements both survive, because the defect was in the summing rather than in the storage.

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
  ([architecture](../architecture.md) A-65). **A-65's structure survives whole** — this flow
  creates no bank-account entity and no running column, and a bank balance is the same
  closing-transaction-plus-activity derivation as any other account's (d20), which is the
  condition A-65 set for its own survival: *"so long as a bank account is only ever a
  posting target."* What this flow reverses is **one sentence of its accepted
  consequence** — *"Wax Works will never tell you your bank balance"* — and nothing else.
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
| 11 | *Extended by [architecture](../architecture.md) A-73 — a typed date is also refused **before the opening position**, and **future dates are permitted**.* **A posting dated inside a sealed period is refused. The Manager dates it in the open period instead.** The hydro bill for January arriving in February after January is sealed lands in February. This is [M-07](M-07-chart-of-accounts.md) d8's post-forward rule reaching the one case d8 did not have to imagine — *"nothing may restate a day that has already been exported"* — and a sealed period is the stronger form of that: a statement may already be printed and with the accountant, and a posting that slipped into it would leave the books and that statement disagreeing with nothing anywhere saying so. *Rejected:* unsealing January to take the posting, which is more accurate on paper and makes unsealing routine — and a seal that is routinely undone has stopped meaning anything. *Accepted consequence, and the reference model warns about it in these terms:* **an expense can land in the month the paper arrived rather than the month it was incurred**, so a Manager who seals early buys drift. The mitigation is operational, not mechanical — seal a month once the bills for it have come in, not on the first of the next |
| 12 | *Sharpened by decision 27 — a location identifies **which store**, and the books consolidate across stores. The "division of the business" reading drafted here was wrong.* **A location is required on every line; a section is optional.** A **location** is derivable everywhere without asking — [architecture](../architecture.md) A-5 already scopes every row to a Store, and a single-store shop has exactly one — so requiring it costs almost nothing now and means the axis is **populated from day one** rather than back-filled the day a second location exists, which is the migration decision 2 was chosen to avoid. A **section** is a reporting refinement and genuinely does not apply to every line: a bank transfer, a loan repayment and an owner's draw have no section, and inventing one for them would put noise in the axis rather than detail. Where a section *is* meaningful the posting already knows it — a revenue line resolves its Section through the Sale line ([E-05](E-05-sell-a-record.md)) — so a blank section marks *not applicable* rather than *not bothered*. *Accepted consequence:* the two dimensions behave differently, which a reader has to be told rather than infer, and **a blank section is indistinguishable from a forgotten one** on a line typed by hand. *Open below:* whether a location and a Store are the same thing, which decision 2 did not settle and which this decision assumes |
| 13 | *Corrected by [M-07](M-07-chart-of-accounts.md) d31 — **current profits is not an account at all.** Decision 24 has it derived when a statement is drawn and never posted, so listing it among the untypeable accounts was vacuous: there is nothing to type into. Retained earnings and Accounts payable stand.* **Retained earnings, ~~current profits~~ and *Accounts payable* are not typeable. Inventory and Suspense are treated differently and separately.** The first three are kept by the system for itself: retained earnings and current profits are **derived from the P&L by the year-end seal**, and a typed figure makes the books disagree with themselves; *Accounts payable* is [M-05](M-05-accounts-payable.md)'s balance exactly and permanently under decision 7, and one typed line breaks that invariant on its first use. **Inventory is typeable, and this reverses the drafting instinct.** [M-07](M-07-chart-of-accounts.md) d2's perpetual inventory makes the account's balance the sum of on-hand costs — but **a dead-stock write-down is precisely the case where book value *should* diverge from the shelf**, and it is a real and recurring act in this trade rather than an edge case. Forbidding it would leave a shop unable to write down stock it cannot sell, which overstates assets year after year and is the failure the reference model spends a section warning about. *Accepted consequence:* **the Inventory account stops being reconcilable to on-hand × cost by construction**, so something has to be able to show the difference and say which part of it was deliberate. *Suspense: see decision 14* |
| 14 | _Status: recommended, not yet ratified._ **Suspense is not available in an ordinary posting. Clearing a Suspense balance is a separate, manager-only act that records a reason.** [M-07](M-07-chart-of-accounts.md) d10 states that *"no Manager action can create one and none can clear one"* — written when nothing but an artifact could write a journal, which made it a description; manual postings turn it into a **choice**. Making Suspense ordinarily typeable would decide it the wrong way: the danger is not a Manager clearing a genuine Suspense balance once its cause is fixed, it is Suspense quietly becoming **what it means in every other accounting package** — the bucket a difference is dumped into so a posting will balance. That is the exact thing d10 exists to prevent, and decision 10 above refuses the same move by a different door. **But a balance that nothing can ever clear is also wrong:** a defect gets fixed and its three dollars sit on the balance sheet forever. So the route exists and is deliberately not ordinary — its own act, manager-only, carrying a reason, and visible as an exception rather than as a line in a posting nobody reads twice. *Not ratified — the mechanism is proposed here rather than chosen, and [M-07](M-07-chart-of-accounts.md) d10 may need a row of its own to say that its "none can clear one" now has an exception* |
| 15 | **A period containing a Suspense line seals anyway. The closing transaction records the Suspense total, gross, so any statement drawn from that period can say so.** Refusing would **deadlock the books**, and not rarely — it is the guaranteed outcome the first time Suspense does the job it exists for. [M-07](M-07-chart-of-accounts.md) d10 records that *"no Manager action can create one and none can clear one"*, so a seal that refuses on Suspense is a seal no Manager can ever satisfy: the books stop in the month the defect landed and never move again. **Proceeding is also the house preference** ([architecture](../architecture.md) A-28a, [E-02](E-02-receive-inventory.md) d35) and, more to the point, it is [M-07](M-07-chart-of-accounts.md) d10's own logic followed to its end — Suspense exists *so that* a defect on our side can never stop the shop, and stopping the books is stopping the shop by a slower route. **Gross, not net** (d25): a period short three dollars on one date and over three on another must report six, or two defects report as none. *Accepted consequence:* **a sealed period can contain a known bug, permanently**, and the seal is what makes it permanent — so the record of it has to survive on the closing transaction where a statement can reach it, rather than living only on the journal line that caused it |
| 16 | ~~**Any sealed period may be unsealed, with manager authorization. Not only the most recent.**~~ — **superseded by 29**, which adopts most-recent-only after all. *Its rejection of that rule is kept as the record of the argument, and one sentence of it misled a later reader: "unsealing is that, a month at a time" meant Undo End of Day's shape applied to months, and reads as though only one month may be unsealed at a time. Decision 29 makes that reading the true one.* Decision 22's **filed** mark stands and is unaffected. The conventional rule is most-recent-only, and it was rejected because it answers the wrong question: an error found in March that belongs to December is a real and ordinary event, and forcing it forward produces books that are *tidy* and *wrong about when things happened*. **The house already has this shape** — [M-03](M-03-daily-summary.md) d4's **Undo End of Day** reverses a whole close, is manager-only, and is nobody's routine; unsealing is that, a month at a time. **A seal therefore means *immutable by default, changed only by a deliberate authorized act*, not *immutable forever*** — which is A-33a's and A-66's rule a fourth time rather than a weakening of it. *Accepted consequences, and there are two real ones.* **Every balance-forward after the unsealed period must be recomputed**, so unsealing is not a local act however local it looks. And **unsealing back through a year-end must reverse that year's closing postings** (d17) — the one operation here that can corrupt equity quietly, which is why it is named rather than left to be discovered. *Open below:* whether anything should **refuse** an unseal, on A-66's pattern of refusing while a deposit stands |
| 17 | **A year-end seal writes its zeroing as real, visible closing postings — dated the last day of the year, sourced to the seal.** Revenue and expense are not merely *treated as* starting from zero; journal lines move them into retained earnings and an accountant can read them. **This is the system's existing rule rather than a new one:** [M-07](M-07-chart-of-accounts.md) d12 has a journal written by the artifact that causes it, and a year-end seal is an artifact that causes one. The alternative — zeroing as a property of how balance-forwards are computed — is fewer rows and makes *why is retained earnings this number* unanswerable from the ledger itself, which is the question the whole flow exists to make answerable. *Accepted consequence:* the last day of a fiscal year carries a block of postings nobody typed and nothing in the shop did, so they must be **plainly identifiable as the seal's** — otherwise a reader looking at 31 December sees a day of enormous and inexplicable activity |
| 18 | **An unseal is an artifact: who, when, **a required reason**, and which period it reopened.** Decision 16 makes unsealing available for any period, which is what makes this necessary rather than tidy — once every period can be reopened, *sealed* means **immutable by default and changed only by a deliberate, authorized, recorded act**, and the record is the half that carries the weight. An unseal changes figures the accountant may already hold, so it is the same class of act [M-04](M-04-manage-users.md) d17 and [architecture](../architecture.md) A-52 already log, and [M-03](M-03-daily-summary.md) d4's Undo End of Day is its nearest sibling. **The required reason is doing a second job:** it is friction, deliberately, because an act that is trivially easy stops reading as exceptional, and *"why did December change"* is a question a Manager will be asked by someone holding an older copy of December. *Accepted consequence:* a Manager in a hurry writes *"fix"* in the reason box and the log records nothing useful — the field cannot make anyone thoughtful, only make the absence of thought visible |
| 19 | **Accruals are out of scope. A Manager who wants one posts an estimate and reverses it by hand, as two ordinary postings.** An accrual is the conventional answer to a bill that arrives after its period — post an estimate on the last day, reverse it when the real invoice lands — and **nothing here prevents one**: it is two postings this flow already supports, and no new concept is needed to do it correctly. What is declined is the **machinery** — a posting marked to auto-reverse on a future date, which would be the first scheduled write in this system and a second kind of posting to explain. The judgement is that the case is **narrow and annual**: an ordinary month's drift is self-correcting, because every month carries the previous month's bill and consistent lateness is what an accountant expects. It bites once a year, at the fiscal boundary, where a Manager doing it deliberately is better served than a Manager relying on a feature they use once. *Accepted consequence:* **the reversal depends on someone remembering it**, and a forgotten reversal leaves an estimate standing as a real expense in the new year — which is worse than never having accrued, because it is invisible and doubled. If this is ever revisited, that asymmetry is the reason to revisit it |
| 20 | *Amended by [architecture](../architecture.md) A-76 — *stored* is **by definition** the last *recomputed*, so which is authoritative stops being a question; and this decision's citation of A-30 as precedent is **wrong**, because A-30 stores in order to have no second path.* **A seal writes a stored closing transaction carrying balance-forwards, and reporting reads it rather than re-summing history. The reference model's shape, adopted deliberately. What we add is that it can also be *recomputed*, and that is what makes decision 16 safe.** The stored figure is not an optimisation borrowed from a slower era — **it is this system's existing house rule**, twice over: [M-03](M-03-daily-summary.md) d13 and [architecture](../architecture.md) A-30 store the close's summary rather than recomputing it, and [M-07](M-07-chart-of-accounts.md) d7 stores every journal rather than deriving it, both for the same stated reason — *"storing rather than recomputing means a past day can never quietly restate itself."* A balance read from stored balance-forwards is the figure that was true when the period was sealed, and two readings of the same sealed period can never disagree. **The reference model is stored-*only*, and that is the one place we differ:** its reopen rule is most-recent-only partly because a stale closing transaction three months back has no cheap way to be rebuilt. We can rebuild, so decision 16 can let any period be unsealed and the balance-forwards after it re-derived — **stored *and* recomputable is strictly better than stored alone**, and it is the difference that buys d16 rather than a reason to reverse it. *Accepted consequence:* there are now **two paths to the same figure**, so they can disagree — a stored balance-forward that a rebuild would not reproduce is a defect, and something has to be able to say so. *Shape is [architecture](../architecture.md)'s:* whether the closing transaction is a balanced set of journal lines like the reference model's, or a stored summary beside the journal, is a data-model question this flow does not settle — but a year-end's zeroing reaches the journal either way (decision 17) |
| 22 | **A year is marked *filed* when the return has gone in, and a filed year refuses the unseal. Supersedes 21; restores decision 16 for everything not yet filed.** [architecture](../architecture.md) A-66's shape exactly — *immutable while something outside the system depends on it*, where the outside thing is a tax return rather than a bank deposit. **The timing is the whole decision.** An accountant's cycle runs: the shop seals December and the year; the accountant reviews over the following months and issues adjustments — depreciation, reclassifications, a stock write-down; *then* the return is filed. Those adjustments arrive **after the seal and before the filing**, which is precisely the window 21 closed. Sealing at step one and filing at step three are different moments and only the second is a point of no return. **The mark is the Manager's**, set when the accountant confirms the return has gone in, and it is a claim about the outside world that this system cannot verify — which is why it is a recorded act with a date rather than a checkbox. *Accepted consequence, and it is the reason 21 was attractive:* **the guard now depends on someone arming it.** A Manager who never marks a year filed keeps every year reopenable forever, and the system cannot tell the difference between a year not yet filed and one nobody got round to marking. The mitigation is a prompt, not a mechanism — this is a fact only a human has |
| 23 | **This system may state a profit. [M-07](M-07-chart-of-accounts.md) d27 retires the prohibition; this flow is what earned it.** M-07's Requirements forbade any screen, report, column or summary being labelled *profit*, *net profit*, *net income* or *earnings*, on the grounds that a figure computed from what the system held would be *"wrong by more than the day's gross margin"* on an ordinary day. **That was true and is no longer.** Decision 1's typed postings bring in rent, utilities, loans, depreciation, draws and tax — the groups whose absence made the figure wrong — so the P&L has a bottom line and it may be called what it is. *Accepted consequence, and it is the trade the whole flow makes:* **a system that may state a profit may state a wrong one**, and d1's prohibition was a guarantee of never being wrong bought by never speaking. What replaces it is not a better guarantee but a set of conditions — an opening position typed correctly (d6), every seam still mapped ([M-07](M-07-chart-of-accounts.md) d11), the expenses actually entered, and the period sealed (d15). **Each is a way for the figure to be wrong, and none of them is detectable from the figure itself** |
| 24 | **Current earnings is derived when a statement is drawn, never posted. Only the year-end seal posts (d17).** Mid-year a balance sheet balances only if equity carries the result so far — assets less liabilities exceeds opening equity by exactly the profit to date — and that figure is obtained by summing the revenue and expense accounts at the moment the statement is drawn, as the reference model does. **No monthly posting, no running equity account, nothing accumulating.** This keeps [M-07](M-07-chart-of-accounts.md) d12's rule intact — a journal is written by the artifact that causes it, and no artifact causes a month's profit — and it means the only equity postings this system ever writes are the year-end seal's, which d17 already makes visible. *Accepted consequence:* **retained earnings on the chart is only correct immediately after a year-end seal.** Between seals, equity as *posted* and equity as *shown on a balance sheet* differ by the year to date, which is correct accounting and reads as a discrepancy to anyone comparing the chart against the statement — so the statement has to name the derived line rather than fold it silently into a total |
| 25 | *Amended by [architecture](../architecture.md) A-77 — right about three wants, wrong about the fourth. The `filed` mark is a separate artifact, because it **refuses** an operation rather than warning about one.* **A statement is stored when it is issued, and a reconciled set is a mark that moves no money.** Two parts of one decision about what reading the books leaves behind. **Storing an issued statement** is this system's rule for the fourth time — [M-03](M-03-daily-summary.md) d13 and [architecture](../architecture.md) A-30 store the close's summary, [M-07](M-07-chart-of-accounts.md) d7 stores every journal, d20 stores balance-forwards, each *"so that a past day can never quietly restate itself"* — and here it buys something further: **what has left the building becomes a fact this system holds.** That is wanted in three places at once — d22's *filed* mark is a cruder version of it, d16's unseal has no way to know whether the accountant is holding an older copy, and [M-07](M-07-chart-of-accounts.md) d16's export log *"records what it has exported and warns when a range overlaps"* and **has never been modelled**. One artifact answers all three. **A reconciled set** is entries within one account, marked together, that net to zero, against an outside document — a bank statement, or the two halves of an undeposited-funds movement. It is **balance-neutral by construction**, the same shape [M-05](M-05-accounts-payable.md) d15's clearing has and deliberately not the same word ([lexicon](../lexicon.md), widened rather than split). *Accepted consequence:* reconciling records that someone checked, and **nothing downstream requires it** — an unreconciled account seals exactly as a reconciled one does, so the mark is evidence and never a gate. *Open below:* whether a seal should say so |
| 26 | *Amended by decision 28 (a read-back check against the accountant's figure) and by [architecture](../architecture.md) A-78 (equity is derived while drafting and **materialised as a line at seal** — as written this was unrepresentable).* **Equity is not typed into the opening position. The Manager types assets and liabilities, and equity is the figure that balances them.** An opening position that can fail to balance is one a Manager can be stuck against with no way forward and no way back — and **equity *is* the balancing figure**, definitionally, not a fourth number to be reconciled against the other three. Typing it and then checking the three agree is asking a Manager to reproduce an identity. It also removes the only place an opening position could have needed Suspense, which both [M-07](M-07-chart-of-accounts.md) d10 and decision 10 refuse it. *Accepted consequence, and it is a real loss:* **a typo in an asset silently becomes equity.** Type inventory as $612,000 instead of $61,200 and the books balance perfectly with half a million dollars of invented worth, and nothing anywhere disagrees. Decision 6's window is the only defence — retypeable until the first seal, and never after — which makes reviewing the opening position before that first seal the single highest-value check in this flow |
| 27 | *Amended by [architecture](../architecture.md) A-72 — the ledger is **not** an A-5 exception in v1, so `location` is the line's own Store and is deliberately redundant until consolidation is decided.* **A location identifies which *store* a line happened at, and the books consolidate across stores. Sharpens decision 12, which had it defaulting from the Store without saying why.** Location `0` is home base and further stores take `1`, `2`, `3`; a single-store shop carries `0` on every line and never thinks about it. **This is not the reference model's *division of the business*** — that reading was drafted here in error, and it was wrong about this shop: income from something other than records is income, recorded through the till and distinguished by its **section**, which is what sections are for (decision 12). *Nothing is being built for multi-store now* — the axis exists so the table is ready, on the same grounds decision 2 was taken. **What this implies is bigger than the field, and it is not this flow's to settle:** [architecture](../architecture.md) A-5 says *"Every entity is scoped to a Store. Nothing is shared"*, and a ledger that many stores report into is **shared by construction**. Either the Ledger domain is an exception to A-5, or consolidation happens some other way — the reference model, for what it is worth, runs separate systems per store and **transfers** entries to a main site rather than sharing one ledger. *Raised for `/architecture` as a candidate A-n; recorded here as what this flow needs, not as an architecture decision this flow may take* |
| 28 | **The Manager types the accountant's equity figure, the system compares it against the balancing figure, and a difference must be acknowledged before the seal. The typed figure is never stored. Amends decision 26.** d26 declined to store a typed equity so that the opening position **cannot fail to balance**, and that reasoning is untouched here — nothing typed becomes a line, and equity is still the derived figure (d26, [architecture](../architecture.md) A-78). What is added is a **read-back**, and it exists because d26's accepted consequence was the worst-defended thing in this flow: *a typo in an asset silently becomes equity*, and **nothing anywhere could ever detect it**. Type inventory as $612,000 instead of $61,200 and the books balance perfectly around half a million dollars of invented worth. A comparison against a number the accountant independently supplied is **the only mechanical detector available** — it does not need to be right, it needs to disagree. **Acknowledged rather than refused**, on the house preference ([architecture](../architecture.md) A-28a): the paper sometimes genuinely does not balance, and a Manager who can explain the difference must be able to proceed. *Accepted consequence:* a Manager who acknowledges without reading has bought nothing, and the figure they typed is **discarded**, so the acknowledgement is the only record that the check ever ran — which argues for it being recorded with the seal rather than being a dialog that closes |
| 29 | **Only the most recently sealed period may be unsealed, and the act repeats to walk backwards. Supersedes decision 16.** To reach December from March a Manager unseals March, then February, then January, then December — four deliberate acts, each authorized and each carrying its own reason (d18). **The friction is the guard**, which is how the reference model gets away with having no other, and d16 had removed it in favour of a single click and then needed d22's *filed* mark to compensate. d16's own objection still stands on its merits — *"an error found in March that belongs to December is a real and ordinary event"* — and is answered rather than dismissed: **the error can still be fixed in December**, it simply costs four acts instead of one, and an act that is cheap is an act nobody weighs. **This is strictly simpler than d16, and the simplification is the surprise:** because the unsealed period is by definition the latest sealed one, **there is never a later closing transaction to recompute**. d16's *"every balance-forward after the unsealed period must be recomputed"* describes work that cannot arise; [architecture](../architecture.md) A-76's rebuild becomes a rebuild of one period, and A-75's concurrency case narrows from *two Managers unsealing different months* to *two Managers unsealing the same one*, which a single lock settles. *Accepted consequence:* **fixing an old error is laborious on purpose**, and a Manager facing four unseals to correct one line will often post forward instead — which the reference model recommends anyway, and which is the right answer more often than it feels like |
| 30 | **A statement includes only lines dated on or before its as-at date, and a period statement only lines inside its period. A future-dated line is invisible until its date arrives.** [architecture](../architecture.md) A-73 permits a posting dated ahead — a cheque written today against next month — and left this. A balance sheet **as at 30 September** states the position on 30 September, so a line dated 15 October is not in it; that is what *as at* means, and any other answer makes the date on the document a suggestion. **Every statement answers the same way**, which is the half that matters: two reports of one moment must not disagree, and they only cannot if the rule is one rule. *Accepted consequence:* **the ledger can hold money no statement shows.** The sum of every journal line and the balance sheet stop being the same number whenever a future-dated posting exists, which reads as a discrepancy to anyone who checks one against the other — so a statement has to be able to say that lines after its date exist, without including them. *And it settles a related question:* a **seal** covers a period, so a posting dated beyond it is simply not in that period and waits for the seal that is |
| 31 | **A statement is drawn on screen. *Issuing* it stores the figures — not a rendered file — and a stored issuance can be listed, reopened and re-rendered to screen or to a file. Completes decision 25 and [architecture](../architecture.md) A-77.** Storing the **figures** rather than a PDF is what makes one issuance serve every format: the screen, a CSV, whatever an accountant asks for next, all rendered from the same stored numbers, and the numbers are what decision 25 needed to keep anyway. Re-opening a stored issuance shows **what was issued**, never a recomputation — otherwise the record of what the accountant holds could quietly change, which is the whole reason it is stored. **This resolves where [M-07](M-07-chart-of-accounts.md)'s export lives.** A journal export is one **kind** of issuance (A-77), so [M-07](M-07-chart-of-accounts.md) keeps what the file *is* — d15's columns, d16's overlap warning, d17's per-line currency — and **this flow owns the surface it is obtained from**. M-07's Phase 4 stops being a screen of its own. *Accepted consequence:* the chart screen and the reporting surface are now in **two flows**, so a Manager setting up goes to one and a Manager reporting goes to the other — which is what [M-07](M-07-chart-of-accounts.md) d9 described as *configured once and exported from*, with the exporting half having moved |
| 21 | ~~**A sealed year can never be unsealed. Bounds decision 16, which governs months.**~~ — **superseded by 22.** The reasoning was sound and the **fact it rested on was wrong**: this decision was taken on the understanding that the reference model forbids reopening a closed year, and it does not. It permits reopening one month at a time, indefinitely backwards, and names *"the previous fiscal year end that has been adjusted by your accountant"* as a case where doing so is warranted. **What survives into 22** is everything except the absoluteness — a sealed year *is* different from a sealed month, it *is* the thing worth guarding, and the harm *is* books that no longer match a filed return. What 22 changes is **when the door shuts**: at the filing, not at the seal |
| 32 | **The test behind decision 13, stated: an account is not typeable where the system already owns *every* movement into and out of it — unless a deliberate divergence from what the system computes is a real and recurring act. Explains d13 rather than amending it; no call d13 made changes.** d13 read as a list of three names, and a list cannot decide the fourth account anybody asks about. **Every one of its calls falls out of this test, including the one that looked like an exception.** *Accounts payable* — [M-05](M-05-accounts-payable.md) writes every debit and every credit, so a typed line makes the books disagree with the payables ledger, which is exactly what d7 bought the opening account to prevent. *Retained earnings* — the year-end seal (d17) is the only thing that ever writes it. **Inventory is typeable and is not an exception to the test but an application of its second half:** receiving and selling do own both directions, and a **dead-stock write-down is precisely the deliberate divergence the clause exists for** — d13 says so in those terms, *"a real and recurring act in this trade rather than an edge case."* **The second half is what makes the test safe**, and it is not decorative: an account the system fills but never empties is one a Manager must be able to empty, or the balance grows forever. Decision 34 is that case, found by applying this test rather than by noticing it. *Accepted consequence, and it is the reason this is a decision and not a note:* **the test names accounts nobody has examined.** `customer-credit` ([E-07](E-07-manage-customers.md)), `undeposited` and the tender accounts all pass its first half today, and **this decision deliberately does not decide them** — a principle strong enough to settle the next case is strong enough to settle it wrongly, and each is recorded as an open question below rather than swept in. What is settled is the test; what is refused is still only what d13, decision 33 and decision 34 name |
| 33 | **The gift card liability is not typeable — not in an ordinary posting and not in the opening position. Joins decision 13's list by decision 32's test.** [E-05](E-05-sell-a-record.md) writes every movement in both directions: a card is **loaded as a line item** when it is sold and **drawn down as a tender** when it is redeemed, [E-06](E-06-process-a-return.md) can return value onto one, and [M-05](M-05-accounts-payable.md) d10 keeps the registry whose total *is* the liability. So **the balance is the sum of what is outstanding on live cards**, computed from artifacts, and one typed line makes the books disagree with the cards themselves — which is worse here than in most places, because a card is a thing a customer physically presents at the counter and the shop will have to honour whatever it says. This is d13's *Accounts payable* argument with [E-05](E-05-sell-a-record.md) in [M-05](M-05-accounts-payable.md)'s place, and it needed asking separately only because d13 did not name the role. **It passes decision 32's second half as well as its first**, and that is the half worth checking: the balance drains through redemption and through nothing else, because **this shop's cards do not expire**, so there is no write-off, no breakage, and no legitimate act left without a route. *Accepted consequence, and it is a dependency on a flow this one does not own:* **nothing in [E-05](E-05-sell-a-record.md) actually says cards never expire** — it is true of this shop and is recorded here because this is where it was relied on. If an expiry is ever added, this decision becomes exactly the trap decision 34 describes, and it must be revisited **in that change** rather than afterwards. *Open below* |
| 34 | **Tax collected and tax paid stay typeable, because nothing in this system remits tax. Found by applying decision 32's second half; the one place that test has already paid for itself.** [M-07](M-07-chart-of-accounts.md) d5 has GST charged on a Sale sit as **a liability owed to the government**, registrations kept separate because they are *"remitted to separate authorities"* — and **no flow, and no part of the architecture, models the remittance.** The till fills these accounts and the receiving desk fills their counterparts; nothing empties either. So they pass decision 32's first half and fail its second, and locking them on the first half alone would leave a shop **unable to record paying its own sales tax**, with the liability growing every quarter forever. **The answer is decision 19's, in its own words:** an act nobody has modelled is not thereby forbidden — it is *"two postings this flow already supports, and no new concept is needed to do it correctly."* A Manager reads the figure off [M-03](M-03-daily-summary.md)'s tax report, debits tax collected, credits the bank. What decision 19 declined was the **machinery**, and the same is declined here. *Accepted consequence:* **the one figure a government will audit is the one this system leaves entirely to hand**, with no check that what was posted matches what M-03 reported and nothing that notices a quarter nobody remitted. That is a real exposure and it is accepted knowingly, because the alternative in v1 is an account that can only grow. *Open below:* whether remittance earns an act of its own |
| 35 | **The books start on any day. Retires step 1's guess in both halves — neither the first of a month nor a past date.** Step 1 carried *"Guess: it must be a past date and the first day of a month; unconfirmed"*, and nothing is superseded by this row because **a guess was never a decision**; it simply stops being implemented. The month half went because a shop switching over mid-month has no reason to wait, and because the opening position is dated the day before whatever day is named (step 2), which works on any date. **The future half went because it would have bought nothing:** [architecture](../architecture.md) A-73 already refuses a posting dated on or before the opening position, so books that start next month are books nothing can be posted to until then — **visible and self-correcting rather than silent**, which is the distinction this flow draws everywhere else. It would also have been *the only figure in this artifact that was validated at all*, in a flow whose Requirements say in terms that **the opening position is typed, and nothing validates it against the world** — a lone date check reads as coverage and is the thing A-71 warns about. *Accepted consequence:* a Manager can name a first day in the future or one years past, and the system will accept it. The first is inert; the second is the decision 26 typo problem wearing a different field, and decision 28's read-back is the only thing that will catch either |
| 36 | **A statement drawn over any unsealed period is marked *provisional*, and the mark is stored on the issuance rather than rendered from the period's state. Nothing is printed where the period was sealed. Completes decision 31 and answers this flow's open question.** **The substantive half is where the word lives, and decision 31 already decides it:** *"re-opening a stored issuance shows what was issued, never a recomputation"* — and a label computed at render **is** a recomputation. Issue a P&L for an open September, seal September, re-open the issuance, and a rendered label silently vanishes, so the record of what the accountant is holding has quietly changed. That is the exact harm decision 31 stores figures to prevent, so **the mark freezes with them, because it is one of them.** The period dates cannot do this job — they say *which* period, not whether it can still move — and the person who most needs the answer is an accountant holding a printout who cannot see the screen. **Nothing is printed on the sealed side, and the asymmetry is the decision rather than an omission:** decision 29 permits an unseal, and the whole unseal apparatus exists because that happens, so ***final* is a promise this system cannot keep.** Absence of the word is not a claim, it is the absence of a warning — the shape decision 15 already uses, where a seal reports defects and stays quiet about housekeeping. **Never a gate** ([architecture](../architecture.md) A-28a): a Manager handing their accountant a mid-month P&L is ordinary and must proceed. *What it buys beyond the label:* [architecture](../architecture.md) A-77's unseal warning gets sharper, because an issuance that recorded *provisional* and one that recorded nothing are **different situations** and the second is worse — which is the discrimination A-77's log exists to support. *The word:* *provisional* is unclaimed, where *draft* is taken twice ([lexicon](../lexicon.md) §7's Invoice state and A-78's `journal_batches`) and would collide the way *close* did in decision 4. *Accepted consequence:* **a statement issued provisionally and never re-issued stays marked provisional forever**, even once its period seals and the figures turn out identical. It states what was true when it left the building rather than what is true now — which is the trade decision 31 already made for the figures, applied to one more field |

## Open questions

**None of these blocks scaffolding, and all of them block building.** The first two are
owned elsewhere and are the real dependencies; the rest are this flow's own.

### Blocking, owned elsewhere

- ~~**Does the Ledger domain consolidate across stores, and is that an exception to
  [architecture](../architecture.md) A-5?**~~ — **Closed by A-72, which declines to amend
  A-5 rather than answering the question.** The ledger is not an exception in v1;
  `location` is the line's own Store and is **deliberately redundant** — provably equal to
  `store_id` on every row the schema can write. The axis is populated from day one, which
  is decision 2's purpose, and how consolidation actually works stays deferred at
  [architecture](../architecture.md) §11 where it already was. A-72 keeps all three shapes
  open: an A-5 exception on `release_cache`'s footing, the reference model's transfer to a
  main site, or a read principal that does not yet exist — **E-01 d8's multi-store
  membership is the precondition for any of them.**

- ~~**Exchange gain or loss.**~~ — **Resolved by [M-06](M-06-settings.md) d59, d60, d61 and
  d62, which own it.** The ledger is kept in the **home currency**; a foreign artifact
  records the rate it used, on itself, which is d39's own stated mechanism and makes d33's
  unrecoverable past rate irrelevant. At payment the Manager **confirms what actually left
  the bank**, and the difference against what was booked posts to one reserved
  exchange-gain-or-loss account — recorded rather than derived. A bank fee is its own
  document (d62), never a line on the supplier's Invoice. *What it cost:* d17's *nothing is
  ever converted* falls for the journal line, [M-06](M-06-settings.md) d37's *never a stored
  amount* holds for display only, and [architecture](../architecture.md) A-47's exclusion of
  currency conversion from the rate rule is reopened. **A-36 and A-33a survive untouched.**
- ~~**Accounts receivable is one signed figure that nets an asset against a liability.**~~
  — **Resolved by [E-07](E-07-manage-customers.md) d21, which owns it**, and cheaply: its
  d4 and d5 both stand. **The problem was summing, not the signed figure.** A statement
  **classifies each Customer's balance by its sign and never nets across Customers** —
  positives total into liabilities, negatives into assets. What it forecloses is a Customer
  holding credit and an unpaid invoice at once, which the single figure already nets, and
  which stops being wanted only when this flow grows terms and aging — deferred at
  [PRD](../PRD.md) §6 and [architecture](../architecture.md) §11.

### This flow's own

- **Decision 25's *nets to zero* rule serves one of the two cases decision 25
  names.** d25 and [lexicon](../lexicon.md) §11 both give one rule — *"entries
  within one account, marked together, that net to zero"* — and both name two
  cases: *"a bank statement, or the two halves of an undeposited-funds
  movement."* **The second works exactly; the first does not.** A bank
  reconciliation ticks the entries that **appear on the statement**, and what is
  left over is outstanding cheques and deposits in transit — the ticked set has
  no reason to net to zero, because a month that took in more than it paid out
  nets to whatever the balance moved by, which is the point of doing it. The
  only sets a bank account can produce under the rule are offsetting pairs,
  which there means a payment that happens to equal a deposit: a coincidence,
  not a reconciliation. *This is not a drafting slip — the sum-to-zero shape is
  deliberate and is what makes a set balance-neutral by construction* — so the
  question is whether **a bank statement is a second kind of reconciliation**
  (mark what cleared; the remainder is the outstanding list) or whether the bank
  case was mis-described and belongs only to *undeposited funds*. Either answer
  touches [lexicon](../lexicon.md) §11, which carries the canonical definition.
  **Demonstrated rather than argued** in `prototype/src/lib/ledgerReconciliation.test.ts`,
  where a complete and correct September bank reconciliation is refused by the
  rule.

- **Does remitting tax earn an act of its own?** Decision 34 leaves it as two typed postings on
  decision 19's precedent, and names the exposure it accepts: **the one figure a government will
  audit is the one this system leaves entirely to hand.** Nothing checks that what was posted
  matches what [M-03](M-03-daily-summary.md) reported, and nothing notices a quarter nobody
  remitted. An act would need a period, a figure per tax type, a payment and a record of what was
  filed — which is [M-07](M-07-chart-of-accounts.md) d5's two accounts per type reaching their
  other end. Unsettled whether that is v1, and it is the largest thing decision 32 uncovered.

- **Does decision 32's test reach `customer-credit`, `undeposited` and the tender accounts?**
  Decision 32 states the test and **deliberately declines to apply it** to accounts nobody has
  examined. All three pass its first half — [E-07](E-07-manage-customers.md) owns every movement of
  a Customer's balance, and a deposit ([architecture](../architecture.md) A-65) empties undeposited
  funds — so on the test alone each would be locked. **What has not been asked is whether any of
  them has a legitimate act with no route**, which is the question that turned decision 34 around:
  unclaimed store credit written off after some years is the obvious candidate and nothing models
  it. One account at a time, each on its own merits.

- ~~**Must the books start on a past date, and on the first of a month?**~~ — **Resolved** by
  decision 35: **any day**. Neither half was ever a decision, and the future half turned out to buy
  nothing because [architecture](../architecture.md) A-73 already refuses a posting dated on or
  before the opening position.

- **Nothing states that a gift card never expires, and decision 33 rests on it.** The lock on the
  gift card liability is safe only while redemption is the sole way the balance drains, which is
  true of this shop and is written down **here**, in the flow that relies on it, rather than in
  [E-05](E-05-sell-a-record.md), which owns the cards and does not mention expiry either way.
  Whoever adds an expiry will not be reading this file. **Owner: [E-05](E-05-sell-a-record.md).**

- ~~**What does a statement do with lines dated after its as-at date?**~~ — **Resolved**
  by decision 30: it **excludes them**, and every statement answers the same way. The
  residual is recorded there rather than closed — the ledger can hold money no statement
  shows, so the sum of every line and the balance sheet stop being the same number
  whenever a future-dated posting exists.

- **Should a seal say anything about an unreconciled account?** Decision 25 makes a
  reconciled set evidence and never a gate — an unreconciled account seals exactly as a
  reconciled one does. The reference model disagrees in its guidance though not in its
  software: *"A month should not be closed until the activity for the period is reviewed…
  Bank balances are compared (reconciled) against bank statements."* Unsettled whether the
  seal reports *"the bank account has 14 entries not reconciled against any statement"* —
  which is true, cheap and possibly noise — or stays silent on the grounds that d15
  already establishes a seal reports defects rather than housekeeping.
- ~~**Is a statement *provisional* until its period is sealed, and does that word appear on
  it?**~~ — **Resolved** by decision 36: it is, and the word is **stored on the issuance**
  rather than rendered from the period's state, because decision 31 forbids a re-opened
  issuance from recomputing anything and a rendered label is a recomputation. Nothing is
  printed on the sealed side, because decision 29's unseal makes *final* a promise this
  system cannot keep.

- ~~**Does anything refuse an unseal?**~~ — **Resolved** by decision 22: a year **marked
  filed** refuses it, on [architecture](../architecture.md) A-66's pattern. *What the
  question also surfaced stays open and is now wanted twice:*
  [M-07](M-07-chart-of-accounts.md) d16 requires a record of which ranges have been
  exported and **nothing models one** — the [architecture](../architecture.md) §5 Ledger
  group has `gl_accounts`, `gl_account_mappings`, `journal_batches` and `journal_lines`
  and no export log. M-07 needs it for d16's overlap warning; this flow wants it because
  *a statement that has left the building* is the other thing that should give a Manager
  pause before unsealing. **Almost certainly an A-n rather than a flow decision.**

- ~~**What does the till do when a paper credit note is presented?**~~ — **Resolved by
  [E-07](E-07-manage-customers.md) d22**: rung as a **discount**, with no Customer created
  and no balance issued, so decision 8's *run the paper out* needs no mechanism at all.
  *The cost is visible in this flow's statements:* while the paper lasts, revenue reads low
  and discounts read high, and the copy's cost still posts.

- ~~**What is a closed period called?**~~ — **Resolved** by decision 4: a period is
  **sealed**. Reserved in [lexicon](../lexicon.md) §15, along with *unseal* and
  *opening position*, before anything cited it.
- ~~**Are a Section and a Location required on every line, or may they be blank?**~~ —
  **Resolved** by decision 12: a location is required and defaulted from the Store, a
  section is optional and its blank means *not applicable* rather than *not bothered*.
- ~~**Is a location the same thing as a Store?**~~ — **Resolved** by decision 27: it names
  **which store**, `0` for home base, and the *division of the business* reading drafted
  here was wrong. *What it opened stays open and is not this flow's to close:* a ledger
  that many stores report into is **shared**, and [architecture](../architecture.md) A-5
  says *"Every entity is scoped to a Store. Nothing is shared."* Either the Ledger domain
  is an exception to A-5, or consolidation works some other way — the reference model runs
  a system per store and **transfers** entries to a main site. **A candidate A-n for
  `/architecture`**, and the last structural thing between this flow and a build.
- ~~**Can a period be reopened, and how far back?**~~ — **Resolved** by decisions 29, 18
  and 22: **the most recently sealed period only**, with authorization and a recorded
  reason, repeated to walk backwards — except a year **marked filed**, which never
  reopens. *Both of the answers this question first had were superseded, which is why it
  reads oddly:* decision 21's absolute bar on sealed years fell once the reference model
  turned out to permit exactly what it forbade, and decision 16's *any sealed period*
  fell to decision 29, whose friction is the guard d16 had removed.
- ~~**What refuses a seal?**~~ — **Resolved** by decision 15 and step 17: an unbalanced
  posting and an invalid account, section or location. **A Suspense line does not** — it is
  reported and carried gross onto the closing transaction, because no Manager can clear one
  and a seal that refused would stop the books permanently.
- ~~**Does the opening position need to balance before it is sealed?**~~ — **Resolved** by
  decision 26: it **cannot** fail to balance, because equity is not typed — it is the figure
  that balances assets against liabilities. The cost moved rather than vanished: a typo in
  an asset now becomes equity in silence, and decision 6's window before the first seal is
  the only thing that will ever catch it.
- ~~**What is a financial statement here — a screen, a file, or both?**~~ — **Resolved**
  by decision 31: drawn on screen, and **issuing** stores the *figures* rather than a
  rendered file, so one issuance serves the screen, a CSV and whatever is asked for next.
  It also settles where [M-07](M-07-chart-of-accounts.md)'s export lives: M-07 keeps what
  the file **is**, this flow owns the surface it comes from, and M-07's Phase 4 stops being
  a screen of its own.
- **Does this flow raise a ReviewFlag, or does it have its own surface?**
  [architecture](../architecture.md) A-68 already allows a system-raised flag, and A-71
  declined to add a second kind, recording that *"a flag that cannot fire is worse than no
  flag, because it reads like coverage."* Unsettled whether an unbalanced period, a failed
  close or a stale reconciliation belongs in the review queue or somewhere else.
