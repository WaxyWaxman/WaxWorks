# Questions for GimpyMatey — how the shop runs

**Maintained by:** the coordinator, as questions about shop practice come up. Reviewed by GimpyMatey at his own pace; sr-talbot asked for them here, 2026-10-31.

Every question below is about **how the system should operate on the ground** — what
staff do at the counter, what an Owner expects, what the shop's own conventions are.
None is a technical question; those stay in [`plan.md`](plan.md) §4 and the flows.
The *Record* column is where the question already lives; an answer written here is
carried back there as a numbered decision by whoever picks it up (`/flow-clarify`,
`/architecture`), so this sheet is a reading list, not a second record.

**How to answer:** fill in *Answer*, with the date. One line is enough. "Don't know
yet, ask again after the pilot" is a fine answer and is better than a guess. If a
question doesn't make sense as asked, say so — the question is probably wrong.

**Order:** by when the build needs the answer. The first group is needed now; the last
group can wait until the shop has run on the system for a while.

---

## 1. Needed for M1 — the onboarding slice, now

| # | Question | Why it matters | Record | Answer | Date |
|---|---|---|---|---|---|
| 1 | **Does anyone ever work for two shops (two Organizations) with one email address?** The system currently links one email to one person in one Organization; a second shop inviting the same email would be refused and would see *in use*. | Decides whether that rule stays, and what the second Owner sees | [E-01-D-M1](orders/E-01-D-M1.md) finding 44; A-132 | | |
| 2 | **Store IDs.** The system assigns each Store a seven-digit number, starting at `1000001`. Is there an existing numbering the shop uses (on invoices, labels, with suppliers) that this should match or continue? Does the number restart per Organization, or run across all shops? | `store_create` mints it at M1; it is permanent once minted | [M1-contracts](orders/M1-contracts.md) Needs a human; O-01 d2 | | |
| 3 | **A blank PIN at the pad.** If someone taps *authorize* with nothing typed, does that count as a wrong guess toward the five-in-fifteen-minutes lockout, or not? And while the pad is locked out, does a blank entry get recorded at all? | The code currently refuses it without counting it; nothing says that is right | E-01 d38 open question | | |
| 4 | **A Manager's own login on the counter machine.** The counter runs the Store's shared login. If a Manager also signs in as themselves on that same machine, should the system refuse, sign one of them out after a while, or leave it to practice? | Decides whether to build a guard or write a house rule | E-01 d27; O-01 open questions | | |
| 5 | **Covering a sister Store.** Can an Owner give a Manager a look at another Store (covering a colleague's day off) without assigning them to it? Today a Manager sees only Stores they are assigned to. | Decides what *assigned* means | E-01 and O-01 open questions | | |
| 6 | **Closing a Store.** Proposed: a Store is deactivated, never deleted — its login stops working, its people stay listed, its history is untouched. Does that match what you'd expect? Would its position in the list be reused by a new Store? What happens to a Sale left open on its terminals? | Shapes the Store table before M1 ships it | O-01 open questions (recommended, not yet ratified) | | |
| 7 | **What should an Owner see when they pick a closed Store** from their Store list? Refused with a message, or the Store simply not offered? | A refusal key is wrong today and needs a decision | [E-01-D-M1](orders/E-01-D-M1.md) finding 9 | | |
| 8 | **What may a System Administrator (us) do to a shop's people?** Proposed: only correct a name or email and re-send an invite — never set a PIN, change a role, assign, or deactivate, because those are the Owner's calls. Agree? | Fixes the recovery functions at M1 | S-01 open questions (recommended, not yet ratified) | | |
| 9 | **Should Owners be emailed when a System Administrator acts on their Organization** (a reset, a corrected email), so a reset nobody asked for is noticed the same day? | One more email template, or not | S-01 open questions (recommended, not yet ratified) | | |
| 10 | **Opening the drawer without a sale.** Does the shop open the till drawer for anything other than a sale (change, a float count, a refund in cash)? If so, does the Owner want each opening recorded, and attributed to whoever did it? | Decides whether the `drawer_opens` table is built at M1 or waits for the till | architecture §11; [plan.md](plan.md) §4 | | |

## 2. Needed before M2 — catalog and scan

| # | Question | Why it matters | Record | Answer | Date |
|---|---|---|---|---|---|
| 11 | **One catalog or one per shop?** If the Organization has two Stores, do they share one list of records and one genre scheme, or does each shop keep its own? (Stock is always per Store; this is about the record *descriptions* and genres.) | Decides the shape of the catalog tables; expensive to change after real stock is loaded | architecture §11 (user model) | | |
| 12 | **Should counter staff see cost** on the search screen? The prototype hides it behind a tap; no decision says whether an Employee may see what the shop paid. | A screen rule for E-03 | E-03 open questions | | |

## 3. Needed before M3 — receiving

| # | Question | Why it matters | Record | Answer | Date |
|---|---|---|---|---|---|
| 13 | **Invoice numbers across shops.** Two Stores buying from the same Supplier: could their invoice numbers overlap, or does the Supplier number each shop's invoices separately? | Decides whether the invoice key carries the Store | architecture §11 (user model); A-17, A-22, A-32 | | |
| 14 | **Deleting a Supplier** — Manager-only, or anyone? The rules gate some deletions and not others, and Suppliers were left undecided. | One line in M-01 | M-01 open questions | | |
| 15 | **Labels at receiving.** Does the pilot shop need printed shelf labels from day one of receiving, or can the label stylesheet follow after live testing? | Whether the label print lands in M3 or after | [plan.md](plan.md) §3 (recommended, not yet ratified) | | |

## 4. Needed before M4 — the till

| # | Question | Why it matters | Record | Answer | Date |
|---|---|---|---|---|---|
| 16 | **What can the pilot shop run without at first?** Proposed to hold until after live testing: gift cards, the customer account ledger (store credit and balances), customer records as a whole, selling an item the system thinks is out of stock, and the "which copy" picker when several copies match. Which of these does the shop need on day one of selling? | Decides M4's scope; each is a table group or a screen | [plan.md](plan.md) §3 (recommended, not yet ratified); architecture §8 | | |
| 17 | **Who owns a void?** When a line or a Sale is voided, is it attributed to the person who rang the sale, or to whoever is standing at the till when the void happens? And does the void belong to the day it was rung or the day it was voided? | Fixes the attribution before sales are recorded | architecture §11; M-03 d26 | | |
| 18 | **Gift cards across shops with different currencies** — only if a second Store would ever trade in another currency. Would it? | Decides whether gift card balances carry a currency | architecture §11; A-51, M-06 d34 | | |
| 19 | **Is editing a Customer's card an attributed action** (initials asked for), like other counter actions? Today nothing records who edited it. | Whether the Customer screen prompts for initials | M-04 and E-07 open questions | | |
| 20 | **A return waiting for its label** — when a returned copy comes back onto the shelf and needs a new barcode label, who clears it: the person who took the return, or whoever next prints labels? | A step in E-06 | E-06 open questions | | |
| 21 | **Remote approval.** Must a Manager be physically at the terminal to approve a manager-only action, or should the system let the counter *wait* for a Manager to approve from their own phone? | A later feature; the answer shapes whether to leave room for it | M-04 open questions | | |

## 5. Can wait until after live testing

| # | Question | Why it matters | Record | Answer | Date |
|---|---|---|---|---|---|
| 22 | **Unredeemed gift card balances.** With no expiry, a balance sits forever. Does Alberta require unclaimed balances to be remitted after some period? (An accountant's question; recorded so it isn't lost.) | Escheatment | E-05 open questions | | |
| 23 | **Customer data.** Retention, export, and delete-on-request for Customer records. What does the shop promise its customers today? | Data protection | E-07 open questions | | |
| 24 | **Copy settings from a sibling Store** when opening a new one (tenders, Sections, tax) — worth having, given the risk of copying the wrong province's tax? | A convenience for a fifth Store | O-01 open questions | | |
| 25 | **Consolidated views across Stores** — does an Owner want one screen showing all Stores' takings, or one Store at a time? | Deferred by A-72; live again now that people can be assigned to several Stores | O-01 open questions; architecture A-72 | | |
| 26 | **Multi-store search** — should counter staff be able to see whether a sister Store has a record in stock, and how much detail? | PRD §6's question | E-03 open questions | | |
| 27 | **Stock-take.** Counting a whole Section against the shelf and reconciling in one pass is not specified; single reason-coded adjustments are. Does the shop do periodic counts, and how? | A session concept the system doesn't have | E-04 open questions | | |
| 28 | **The Organization's legal entity.** Is the Organization one legal entity, or could two Stores be two legal entities? (The legal name currently sits on each Store for customer invoices.) | Where the legal name lives | O-01 open questions | | |
| 29 | **Receipt layout** — the content is settled and the paper width (80mm) is settled; the layout isn't, and partly waits on the thermal print agent. Any must-haves from the current receipts? | Receipt template | M-06 and E-05 open questions | | |

---

**Not on this sheet, deliberately:** the technical and security decisions in
[`plan.md`](plan.md) §4 (the PostgREST setting, the enrolment window, `org_id`,
bigint over the wire, the predicates' label); the second owner's identity and the
joint assents, which are sr-talbot's; and the invite email wording, which sr-talbot
owns in the runbook. The store-account second factor still appears in O-01's open
questions but was closed by E-01 d34 (no second factor); that entry is stale and is
a `/spec-audit` item, not a question.
