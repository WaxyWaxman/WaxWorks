# E-08 — Take stock

**Actor:** Employee counts; a Manager commits (decision 2)
**Status:** Specified
**Related:** [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-03 Search the inventory](E-03-search-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-06 Settings](M-06-settings.md) · [M-07 Chart of accounts](M-07-chart-of-accounts.md)

**Job:** As an employee, I need to count what is on the shelf against what the system says is there, a piece at a time, so that the shop's stock stays true without closing the shop to count it.

**Scope note:** a single reason-coded correction to one Record's on-hand count is [E-04](E-04-manage-inventory.md)'s, decisions 3–5, and stays there. This flow is the **count session**: a count in progress, the variances it finds, then committing them in one pass. It was created from [E-04](E-04-manage-inventory.md)'s open question *Batch stock-take* and GimpyMatey's answer to [questions for GimpyMatey](../build/questions-for-gimpymatey.md) Q27 (2026-11-13). That answer says stock-take **is needed**, broken up in one of two ways:
- **by Section**, so a count can be done in stages;
- **as a rolling count**, *"10 minutes a day over a year — 1/365th of the store a day"*, which covers the whole inventory and then starts again.

**Not in v1** (decision 15). It stays on [PRD](../PRD.md) §7's out-of-scope list, and this flow is written ahead of need.

---

## Flow

Drafted 2026-11-13 and confirmed in outline by GimpyMatey; specified 2026-11-14.

### Start

1. An Employee opens **Take stock** and chooses what to count: a **Section**, or **today's slice** of the rolling count (decision 1). For a rolling count, **the system proposes the next uncounted slice**, a run of Records, oldest-counted first, and the Employee may pick another (decisions 9, 10, 13, 16). A Record added mid-cycle joins the end of the cycle (decision 17).
2. The system opens a **count** for that Store and that part of the shop, recording who started it and when, and lists the copies it expects to find there, **held, backroom and special-order copies included** (decision 7).

### Count

3. The Employee **scans each copy's internal barcode** on the shelf (decision 3). If a copy's barcode is missing or won't scan, the Employee finds it by Record and ticks it. Its label is reprinted later, from the titlecard (decisions 14, 18).
4. The system ticks the copy off its list. A copy of a Record this Store doesn't know is set aside and not counted (decision 23). So is a scan the system doesn't recognise, unless the Employee relabels the copy from the titlecard and scans it again (decision 24). A copy expected in another Section is marked **misplaced**. A copy it does not expect there at all is marked **unexpected**: one the system has as sold, or one it has no record of (decisions 11, 19).
5. **The list follows live trading** (decision 4). A copy sold, held, returned or received while the count is open joins or leaves the expected list as it happens, and the shop keeps trading throughout.
6. The count saves as it goes and **stays open until it is finished or abandoned**: across the end of the day, past a closed browser, and for **any Employee to resume** (decision 8).
7. The Employee marks the count **finished**. It now waits for a Manager.

### Reconcile

8. A Manager opens the finished count and sees its differences: expected but not found, found but not expected, and misplaced.
9. The system **proposes a reason for each difference**: *Shrinkage* for a copy expected but not found, *Found* for one found but not expected. The Manager changes any of them before committing (decision 5). **A misplaced copy gets no reason and no adjustment**: it is listed to be put back on its own shelf (decision 6).
10. **Commit.** The Manager commits the count (decision 2). For every difference except a misplaced copy, and except a copy another count has already adjusted (decision 12), the system writes one reason-coded adjustment per copy ([architecture](../architecture.md) A-81), each with its journal ([M-07](M-07-chart-of-accounts.md) d12), attributed to the committing Manager. **A copy brought on hand as *Found* while the system had it as sold also raises a review flag** (decision 11). A copy with no record here is brought in as a new copy at its Record's most recent cost, at the price and grade the counting Employee gave it (decisions 19, 21, 22).
11. The count is **closed** and is not edited again. A later correction is an ordinary [E-04](E-04-manage-inventory.md) adjustment.
12. *(Rolling count only)* The system records that slice as counted on that date and moves the cycle on (decision 9).

## Requirements

- **A count is one Store's** (decision 20). Its scope is a Section or a rolling slice (decision 1).
- **The rolling cycle:**
  - the system proposes each day's slice and tracks how far the cycle has got (decision 9);
  - a slice is a fixed number of Records, set when the cycle starts (decisions 10, 13);
  - the cycle walks oldest-counted first, ties broken by Section, genre, artist (decision 16);
  - a Record added mid-cycle joins the end of the current cycle (decision 17).
- **The expected list** is every copy on hand in the scope, held, backroom and special-order copies included (decision 7). It follows live trading for as long as the count is open (decision 4).
- **Counting is by scanning each copy's internal barcode** (decision 3).
  - A copy without a sticker is found by its Record and ticked (decisions 14, 18).
  - A scan the system doesn't recognise is not counted, and the count recommends setting the copy aside (decision 24).
  - A copy of a Record this Store doesn't know is set aside and is not part of the count (decision 23).
  - A count prints no labels (decision 18).
- **An open count persists** across days and browsers, and any Employee may resume it (decision 8).
- **Nothing on hand changes until a Manager commits** (decision 2).
- **Abandoning a count** is manager-only, is recorded with its actor and time, and changes nothing on hand (decision 8).
- **At commit, every difference except a misplaced copy carries a reason** from [E-04](E-04-manage-inventory.md) d4.
  - The defaults are *Shrinkage* for a copy not found and *Found* for one found but not expected (decision 5).
  - A misplaced copy is listed to be reshelved and is never adjusted (decision 6).
- **Commit writes one adjustment per copy.** Each carries its reason, an [architecture](../architecture.md) A-81 movement row and an [M-07](M-07-chart-of-accounts.md) d12 journal, all attributed to the committing Manager (decision 2, step 10).
  - A copy another count has already adjusted is skipped and shown as skipped (decision 12).
- **A copy committed as *Found* while it was `sold`** comes on hand here and raises the system-raised `found_sold_copy` review flag (decision 11, [architecture](../architecture.md) A-151).
- **A copy without a sticker whose Record this Store stocks**, and which matches none of that Record's copies, comes on hand as a new copy (decision 19).
  - Its cost is the Record's most recent cost (decision 21).
  - Its price and grade are set by the Employee counting (decision 22).
  - That price is a shelf price, so [E-04](E-04-manage-inventory.md) d16's below-cost flag and d31's suggested price ending apply.
- **A committed count is closed and never edited.** A later correction is an [E-04](E-04-manage-inventory.md) adjustment.

## Inherited from other flows

_Commitments pushed here by another flow. These are decided, not open — each cites
the decision it comes from._

**From [E-04](E-04-manage-inventory.md):**

- **On hand is derived** from sellable InventoryItems and is never a stored number (d2). A count therefore compares copies on the shelf with copies the system holds, not one number with another.
- **A hard on-hand adjustment is manager-only and carries a reason code** (d3), from E-04's list: Shrinkage, Damaged, Found, Miscount / correction, Written off, Other with a note (d4). There is no approval step and no cap (d5). Whatever a stock-take commits has to either go through these or supersede them by a recorded decision.
- **Negative inventory is reconciled** by finalizing the Invoice, or by a reason-coded adjustment (d6, d18, d19). An oversold copy is the case a count is most likely to meet.

**From [M-07](M-07-chart-of-accounts.md):**

- **An on-hand adjustment writes its own journal** (d12), dated the day it is made (d8).

## Resolved decisions

_Numbered so they can be cited precisely. Append only — never renumber or delete._

| # | Decision |
|---|---|
| 1 | **A count covers part of one Store's shop, chosen one of two ways: a Section, so the shop is counted in stages, or a slice of a rolling count that works through the whole inventory and then starts again — about 1/365th of the shop a day. Decided 2026-11-13 by GimpyMatey ([questions for GimpyMatey](../build/questions-for-gimpymatey.md) Q27).** What a slice is made of is still open. |
| 2 | **An Employee counts and a Manager commits. A finished count waits for a Manager, who reviews its differences, gives each a reason, and commits; nothing on hand changes before then. Keeps [E-04](E-04-manage-inventory.md) d3 — an on-hand adjustment is manager-only — unchanged for counts. Decided 2026-11-13 by GimpyMatey.** *Accepted consequence:* on a day with no Manager in, a finished count's differences wait, and the system's list stays wrong until one commits it. |
| 3 | **A count scans every copy's internal barcode; it does not tally per Record. Decided 2026-11-13 by GimpyMatey.** Each InventoryItem is its own copy with its own grade, price and cost ([lexicon](../lexicon.md)), so a scan says *which* copy is missing, and a copy shelved in the wrong Section is caught where it stands. *Accepted consequences:* a count is as slow as one scan per sleeve, and a copy whose sticker is missing or unreadable reads as *expected but not found* until it is dealt with. |
| 4 | **A count follows live trading: the shop keeps selling, and a copy sold, held, returned or received while a count is open joins or leaves its expected list as it happens. Nothing is frozen and no Section stops trading. Decided 2026-11-13 by GimpyMatey.** [Architecture](../architecture.md) A-81's movement rows are what the list follows. *Accepted consequence:* a copy rung up by mistake at the till — the wrong sleeve scanned — while it stands on the counted shelf shows as *unexpected*, and the count is where that mis-ring is found. |
| 5 | **At commit the system proposes each difference's reason, and the Manager may change any before committing: *Shrinkage* for a copy expected but not found, *Found* for a copy found but not expected. Any reason from [E-04](E-04-manage-inventory.md) d4 may replace the default, and *Other* still needs its note. Decided 2026-11-13 by GimpyMatey.** The E-02 step 13 pattern: fast at fifty differences, and every one still carries a reason, so none is silent (E-04 d5). *Accepted consequence:* a Manager who commits without reading accepts the defaults, so a copy that is in the backroom, or at the till on a Sale, is recorded as Shrinkage. The reason makes that visible afterwards; it does not prevent it. |
| 6 | **A misplaced copy — found in the shop, in a Section other than its own — is not adjusted and its Section is not changed. The count lists it to be put back on its shelf, and on hand does not move. Decided 2026-11-13 by GimpyMatey.** The copy's record is right and the shelf is wrong. *Accepted consequence:* nothing makes sure it is reshelved, so the same copy turns up misplaced again at the next count of either Section until someone moves it. |
| 7 | **Held, backroom and special-order copies are on a count's expected list, counted with their Section like any other copy. Decided 2026-11-13 by GimpyMatey.** A copy is still on hand when it is held ([E-04](E-04-manage-inventory.md) Requirements) or in the backroom (E-04's backroom flag). *Accepted consequence:* these copies are often not on the Section's shelf — held copies behind the counter, backroom copies in the back — so whoever counts has to go where they are, or decision 5's default records them as Shrinkage. |
| 8 | **An unfinished count stays open until it is finished or abandoned, and any Employee may resume it: it survives the end of the day and a closed browser. A Manager may abandon a count; the abandonment is recorded with who and when, and nothing on hand changes. Decided 2026-11-13 by GimpyMatey.** Abandoning appends; the count and its scans are kept (the [E-02](E-02-receive-inventory.md) d23 pattern). |
| 9 | **For a rolling count the system proposes today's slice — the next one not yet counted in this cycle — and tracks how much of the cycle is left. The Employee may count a different slice instead. When every slice has been counted, the cycle starts again. Decided 2026-11-13 by GimpyMatey.** How the slices are sized, and what a skipped day does to the cycle, are still open. |
| 10 | **A rolling count's slice is a run of Records, sized so the cycle covers the whole shop in about a year. Decided 2026-11-13 by GimpyMatey.** It is not a genre, and not a physical shelf: v1 has no bin location ([E-03](E-03-search-inventory.md) d23), so a slice is defined over the catalog, not the furniture. The order a cycle walks, and where a Record added mid-cycle falls, are still open. *Wording amended the same day, before this row was pushed or cited: the original said "in shelf order", which GimpyMatey's later answer on the walk reopened.* |
| 11 | *Amended by decision 19: the **another Store's** case is withdrawn, because a count has nothing to do with other Stores. The **sold** case and its review flag stand.* **A copy found on the shelf that the system has as sold, or as another Store's, is brought on hand at this Store when it is committed as *Found*. It also raises a review flag, so a Manager sees what was added and can look into it. Decided 2026-11-13 by GimpyMatey.** This is *Found* doing the same thing in every case, plus a record that something else was wrong. *Accepted consequence:* the record that caused the surprise is not corrected by the count. A Sale whose line names this copy still names it, and the other Store loses the copy only when its own count finds it missing. Untangling either is the Manager's job, prompted by the flag. *A store-to-store transfer that would make this case rare is a post-v1 idea ([PRD](../PRD.md) §7); it does not change this decision.* *Its kind is settled by [architecture](../architecture.md) A-151 (2026-11-14): `found_sold_copy`, raised by the system with no actor, its subject the copy's movement row.* ~~And whether a copy can change Store at all~~ — dissolved by decision 19. |
| 12 | **Two counts may be open at once over the same copies, whether the same Section twice or a Section and a rolling slice inside it. Each copy is adjusted only once: at commit, a copy another count has already adjusted is skipped and shown as skipped. Decided 2026-11-13 by GimpyMatey.** This mostly follows from decision 4: once the first count commits, the copy's movement moves it off the second count's expected list as live trading would. |
| 13 | **A rolling count's slices are a fixed size, set when the cycle starts, and a skipped day makes the cycle run longer. The next slice does not grow to catch up. Decided 2026-11-13 by GimpyMatey.** A day's count stays about ten minutes, however many days are missed. *Accepted consequence:* a shop closed one day a week finishes a "year" cycle in about fourteen months, and the cycle's length is whatever the shop's diligence makes it. |
| 14 | ~~**A copy whose barcode is missing or will not scan is found by searching for its Record, picked from that Record's copies, ticked as counted, and its label reprinted there and then. Decided 2026-11-13 by GimpyMatey.**~~ — **reprint superseded by decision 18**: the label is printed from the titlecard, not from the count. The finding and ticking stand. *Was:* The reprint carries the copy's **existing** internal barcode: it is the same copy, so nothing new is minted. *Accepted consequence:* picking the right copy from several of one Record relies on the Employee reading the grade and price, so two near-identical copies can be ticked the wrong way round. **New capability:** no flow yet reprints a copy's label outside receiving, so this is the first place it exists. Whether the titlecard gets it too is [E-04](E-04-manage-inventory.md)'s question. |
| 15 | **Stock-take is not in v1. It stays on [PRD](../PRD.md) §7's out-of-scope list, and this flow is specified ahead of being needed. Decided 2026-11-13 by GimpyMatey: "later, no rush".** No milestone in [architecture](../architecture.md) §8 changes, so there is no scope change to take through `/plan-check`. In the meantime a miscount is fixed one Record at a time with [E-04](E-04-manage-inventory.md)'s adjustment. |
| 16 | **A rolling count walks the shop oldest-counted first, and ties are broken by Section, genre, artist. Each day's slice is the Records that have gone longest without a count, and the day's list is sorted by Section, genre, artist, so the walk follows the shelves. Ratified 2026-11-13 by GimpyMatey, from the recommendation that answered the open question *The order a cycle walks the shop*.** In the first cycle nothing has been counted, so every Record ties and the walk is exactly Section, genre, artist. After that, a Record counted outside the cycle, in a Section count, drops to the back, so nothing is counted twice for no reason. One ordering covers both of GimpyMatey's preferences, so no Manager setting is added. *Accepted consequence:* after the first cycle a day's Records are the longest-uncounted ones, not one stretch of shelf, so a day's slice may be spread across several Sections. |
| 17 | **A Record added mid-cycle is counted in the current cycle: it joins the end of the cycle's list, after every Record not yet counted. It does not wait for the next cycle. Decided 2026-11-13 by GimpyMatey.** Under decision 16 a Record never counted would otherwise sort first; it goes last instead, so a busy week of receiving does not push the rest of the cycle back. *Accepted consequence:* decision 13 fixes the slice size at the cycle's start, so each Record added mid-cycle makes the cycle a little longer. |
| 18 | **Supersedes decision 14's reprint. A count prints no labels. A copy whose barcode is missing or will not scan is found by searching for its Record, picked from that Record's copies, and ticked as counted; its label is reprinted afterwards from the titlecard ([E-04](E-04-manage-inventory.md) d32), with its existing barcode. Decided 2026-11-13 by GimpyMatey.** Decision 14's finding and ticking stand. Its accepted consequence, a near-identical copy ticked the wrong way round, stands too. Printing moves to the one screen where it belongs, so a count needs no printer at the shelf. *Accepted consequence:* a copy ticked without a sticker goes back on the shelf still unlabelled until someone prints it from the titlecard, and nothing in the count reminds them. |
| 19 | **Amends decision 11: a count has nothing to do with other Stores. A copy on the shelf that this Store has no record of is not assumed to be another Store's. It is brought into stock here as a new copy and put on sale, with its cost taken to be what the shop generally pays for that Record. Decided 2026-11-13 by GimpyMatey: *"There's nothing to do with multi-store with regards to the count."*** Decision 11's *another Store's* case was raised by the drafting, not by the shop, and it is withdrawn. Its *sold* case, and the review flag that goes with it, stand. How *what we generally pay* is worked out is still open. *Accepted consequence:* an unknown copy's cost is an estimate, so its margin is too. If it really was another Store's copy, that Store's records keep it until its own count finds it missing. |
| 20 | **A count belongs to one Store. Its expected list, its scans, and the adjustments it commits are all that Store's. Confirmed 2026-11-13 by GimpyMatey.** This matches InventoryItems, which are kept per Store ([architecture](../architecture.md) §5). |
| 21 | **An unknown copy's cost is its Record's most recent cost: the cost of the copy of that Record this Store received most recently. Answers decision 19's *what the shop generally pays*. Decided 2026-11-13 by GimpyMatey.** *Accepted consequence:* one unusually cheap or dear last copy sets the cost, so the margin reported on the found copy is only as good as that one figure. **Still open:** a Record this Store has never stocked has no most recent cost. |
| 22 | **The Employee counting sets an unknown copy's price and grade, during the count, when they register it. The Manager does not set them at commit, and the copy does not go to [E-04](E-04-manage-inventory.md)'s deferred line problems. Decided 2026-11-13 by GimpyMatey: *"the counter sets price and grade"*, read as the person counting.** It is a shelf price, so [E-04](E-04-manage-inventory.md) d16's below-cost review flag and d31's suggested price ending apply here as they do on the titlecard. The copy is still brought on hand only when the Manager commits (decision 2). |
| 23 | **A copy whose Record this Store doesn't know — not in the catalog, or never stocked here, so with no most recent cost (decision 21) — is set aside by the Employee counting and left out of the count. The count records nothing for it and commits nothing. What happens next is outside this flow: the copy is received through [E-02](E-02-receive-inventory.md), as new stock or through second-hand intake as used, or it leaves the shop (donated, say), with no record kept, because the system never had one. Decided 2026-11-13 by GimpyMatey.** *Read as covering both cases:* GimpyMatey's words were *"if we don't know this record"*. A Record in the catalog but never stocked here also has no cost, so it falls under the same rule. *Accepted consequence:* a set-aside copy is tracked by nobody until someone deals with it, so it can sit in a box behind the counter indefinitely. |
| 24 | **A scan the system doesn't recognise is not counted. The count recommends setting the copy aside, to be dealt with as decision 23 says. A sticker that doesn't scan never brings up a Record, so it gives the count nothing to tick. If the Employee knows the copy, they print its label from the titlecard ([E-04](E-04-manage-inventory.md) d32) and scan the new sticker into the count. Decided 2026-11-13 by GimpyMatey.** No unrecognised barcode is ever kept or adopted, so a count never mints a barcode. *Accepted consequence:* a copy with a foreign sticker (a previous owner's or another shop's) is always set aside, even when its Record is known, and comes in through [E-02](E-02-receive-inventory.md) like any other unknown copy. |

## Open questions

- ~~**Who commits a count?**~~ — **resolved by decision 2**: a Manager.
- ~~**What is counted: copies or Records?**~~ — **resolved by decision 3**: every copy is scanned.
- ~~**The counter keeps selling during a count.**~~ — **resolved by decision 4**: the count follows live trading.
- ~~**What is a rolling count's unit of work?**~~ — **resolved by decisions 9 and 10**: the system proposes a run of Records and tracks the cycle.
- ~~**Sizing a slice, and a skipped day.**~~ — **resolved by decision 13**: a fixed size, set at the cycle's start; a skipped day makes the cycle run longer.
- ~~**The order a cycle walks the shop.**~~ — **resolved by decision 16**: the recommendation below, ratified 2026-11-13. *Was:* *GimpyMatey, 2026-11-13: likes **oldest-counted first**; **Section, genre, artist** if that is much easier to manage; or **a Manager chooses which at the start of each cycle**.* Not decided.
  - **Recommendation:** oldest-counted first, with ties broken by Section, genre, artist. Each day's slice is the Records that have gone longest without a count. In the first cycle nothing has been counted, so every Record ties and the walk is Section, genre, artist. After that, a Record counted outside the cycle (in a Section count) drops to the back, and nothing is counted twice for nothing. One ordering covers both preferences, so there is no Manager setting to add. _Ratified as decision 16._
  - **Alternatives considered:** a pure Section, genre, artist walk — simplest, but a Section counted by hand mid-cycle is counted again when the walk reaches it. A Manager's choice each cycle — both orders have to be built, and a setting added.
  - **Cost of the recommendation:** after the first cycle, a day's Records are the longest-uncounted ones rather than one stretch of shelf, so later slices may be spread out. Sorting the day's list by Section, genre, artist keeps the walk in shelf order within the day.
- ~~**A Record added mid-cycle.**~~ — **resolved by decision 17**: it is counted in the current cycle, at the end of the list.
- ~~**Can a copy change Store?**~~ — **dissolved by decision 19**: a count does not assume a copy came from another Store, so it never needs to move one. *Was:* (decision 11, for [architecture](../architecture.md).) Copies are keyed by Store (§5, A-36's `store_id`-composite keys). Bringing another Store's copy on hand here is either a move the schema may not allow, or a new copy minted here while the other Store's copy stays in its records. Which? *GimpyMatey, 2026-11-13: the proper route is a **store-to-store transfer**, beyond v1 ([PRD](../PRD.md) §7). Until it exists, decision 11's case still needs this answer.*
- ~~**The new review flag kind**~~ — **resolved by [architecture](../architecture.md) A-151** (2026-11-14): system-raised `found_sold_copy`. *Was:* (decision 11, now only its *sold* case, for [architecture](../architecture.md)): A-71 declined to add another system-raised kind, but this one has an actor, the committing Manager, so it is an Employee-action kind like the original five. It needs an A-n adding it to §5.2's enum.
- ~~**What does a difference become?**~~ — **resolved by decisions 5 and 6**: a default reason the Manager may change; a misplaced copy is listed to be reshelved, not adjusted.
- ~~**What does *Found* do to a copy the system says is sold, or another Store's?**~~ — **resolved by decision 11**: the copy is brought on hand here, and a review flag is raised. *Was:* Every scannable copy is already an InventoryItem (decision 3), so an *unexpected* copy has a status somewhere else. If it is recorded as **sold**, a Customer paid for a copy, perhaps the wrong one ([E-05](E-05-sell-a-record.md)), and bringing it back on hand would leave two copies' records wrong. If it is **another Store's**, *Found* adds it here while that Store's record still holds it, which is a transfer, not a find. If it is **written off**, *Found* reverses that. Does *Found* do the same in every case, or does each case route somewhere else?
- ~~**Two counts over the same copies.**~~ — **resolved by decision 12**: allowed; each copy is adjusted once.
- ~~**A half-finished count.**~~ — **resolved by decision 8**: it stays open, and any Employee may resume it; a Manager may abandon it, and the abandonment is recorded.
- ~~**Held, backroom and special-order copies.**~~ — **resolved by decision 7**: all three are on the list.
- ~~**A copy whose sticker is missing or unreadable.**~~ — **resolved by decisions 14 and 18**: found by Record and ticked; the label is reprinted from the titlecard.
- ~~**Where the label prints during a count.**~~ — **dissolved by decision 18**: a count prints nothing.
- ~~**Per Store.**~~ — **resolved by decision 20**: a count belongs to one Store.
- ~~**What does the shop generally pay?**~~ — **resolved by decision 21**: the Record's most recent cost.
- ~~**An unknown copy of a Record with no cost history.**~~ — **resolved by decision 23**: set aside, left out of the count, and then received through E-02 or disposed of.
- ~~**An unknown copy's barcode.**~~ — **resolved by decision 24**: an unrecognised scan is not counted, and the copy is recommended for setting aside. A known copy is relabelled from the titlecard and scanned again.
- ~~**Price and grade of an unknown copy.**~~ — **resolved by decision 22**: the counting Employee sets them during the count.
- ~~**Is it in v1?**~~ — **resolved by decision 15**: no, later.
