# M-04 — Add/remove employees or managers

**Actor:** Manager
**Status:** Specified
**Related:** [E-01 Authenticate](E-01-authenticate.md) · [M-06 Configure the store](M-06-settings.md)

**Job:** As a manager, I need to control who has access to the system and at what level.

---

## Roles

Two roles. **Manager** is a strict superset of **Employee** — there is no capability an Employee has that a Manager lacks.

The design intent is that Employees have high agency. The manager-gated list below is short on purpose, and everything not on it is available to any Employee.

---

## Manager-only actions

Everything in this table is something an Employee **cannot do at all**. It is distinct from the review queue below, which lets an Employee proceed and tells a Manager afterward — the [lexicon](../lexicon.md) keeps *manager-only* and *manager override* as separate concepts, and decision 8 replaces only the second.

| Action | Flow | Why it's gated |
|---|---|---|
| **Void or amend** a finalized Invoice | [E-02](E-02-receive-inventory.md) step 23 and d40, [E-04](E-04-manage-inventory.md) | Restates what was received and owed |
| **Adjust on hand** | [E-04](E-04-manage-inventory.md) | Rewrites stock reality; always reason-coded |
| **Process** pending orders into PurchaseOrders | [M-02](M-02-reorder-inventory.md) | Commits money to a supplier |
| **Void a PurchaseOrder** | [M-02](M-02-reorder-inventory.md) | Unwinds committed paperwork |
| **Undo End of Day** | [M-03](M-03-daily-summary.md) | Reopens settled takings |
| **Accounts payable** — all of it | [M-05](M-05-accounts-payable.md) | Pays suppliers |
| **Delete** a Record that has no live references | [E-04](E-04-manage-inventory.md) | E-04's own rule, which survives [architecture](../architecture.md) A-54. Deletion *with* live references is refused at **every** role, and a Customer's Delete is not gated at all ([E-07](E-07-manage-customers.md) d12) — see decision 12 |
| **Abandon or void** a SupplierClaim | [E-04](E-04-manage-inventory.md) d24, d27, d29 | Gated in E-04 and missing here; added to A-28a by A-54 |
| **Merge** suppliers | [M-01](M-01-supplier-margin.md) | Reassigns history |
| **Set supplier margin** | [E-02](E-02-receive-inventory.md) d3, [M-01](M-01-supplier-margin.md) | Employees may create suppliers, never price them |
| **Settings** — all of it | [M-06](M-06-settings.md) | Tax, tenders, currency, Sections |
| **Acknowledge** a ReviewFlag | this flow, decision 17 | The queue is the Manager's oversight surface; an Employee clearing their own flag empties it of meaning |

### Deliberately *not* gated

- **Discounting a line below cost at the till** ([E-05](E-05-sell-a-record.md) d12). A till discount is a one-off on a single Sale; a shelf price persists. Employees are trusted with the former.
- **Processing a Return** ([E-06](E-06-process-a-return.md) d3). No receipt, no time limit, no approval.
- **Creating a supplier** ([E-02](E-02-receive-inventory.md) d3) — but not setting its margin.

---

## The review queue

**The manager override is replaced by a review queue** (decision 8). Actions that used to stop and wait for a Manager's initials now **proceed**, and record a flag the Manager reviews afterward.

| Flagged action | Flow |
|---|---|
| A **shelf price** below cost | [E-02](E-02-receive-inventory.md) d35, [E-04](E-04-manage-inventory.md) |
| A derived-vs-stated **subtotal discrepancy** accepted | [E-02](E-02-receive-inventory.md) d18 |
| A Sale driving stock **negative** | [E-05](E-05-sell-a-record.md) |
| A **sale lock** broken on a stranded terminal | [E-05](E-05-sell-a-record.md) d23 |

A flag records the acting Employee, the subject, and the figures that made it worth a look — cost against price, the size of the delta, the variance. It is written in the same transaction as the action it describes, so the two can never disagree. Flags are **acknowledged, never deleted**.

This extends the design intent stated above: Employees have high agency, and a Manager sees what happened rather than standing in the way of it. It also answers what the audit-surface open question asked for.

### Manager-only authorization

The in-place mechanism survives for the manager-only table (decision 9). A Manager authorizes at the terminal where the Employee is working by entering their own initials, without ending or replacing the Employee's session ([E-01](E-01-authenticate.md) d6). Both names are retained — the record shows who did the thing and who authorized it.

---

## Managing users

| Action | Behavior |
|---|---|
| **Add** | A Manager creates a User with a role and initials. **Initials must be unique within the Store** and Add refuses a duplicate ([E-01](E-01-authenticate.md) d14, decision 13) — the Manager resolves it there and then. In v1 there are no credentials to issue ([E-01](E-01-authenticate.md)), so there is no invite step. |
| **Change role** | A Manager may promote an Employee to Manager or demote a Manager, including themselves — except where the demotion would leave the Store with no active Manager, which is refused (decision 14). Takes effect on the next session, not retroactively. |
| **Deactivate** | Removes access **immediately**, ending the User's sessions on every terminal, though an Open Sale stays finishable (decision 15). Their initials are **released** for a new hire (decision 16). Refused where it would leave the Store with no active Manager (decision 14). **Users are never hard-deleted** — every Sale, adjustment, and authorization stays attributed to the person who performed it, so the record has to survive their leaving. |

---

## Requirements

- Attribution is permanent. A deactivated User's name still resolves on historical records.
- A manager-only authorization records the authorizing Manager separately from the acting Employee.
- A review flag records the acting Employee and the figures that raised it, and commits with the action it describes.
- The count of unreviewed flags is visible in the application shell. A review queue nobody opens is worse than a gate, because it looks like oversight.
- Role changes take effect on the next session, not retroactively on past attributions. **Deactivation does not** — it is immediate (decision 15).
- Users are scoped to a Store; in v1 a User belongs to exactly one ([E-01](E-01-authenticate.md) d8).
- A Store always has at least one active Manager (decision 14).
- Initials are unique among a Store's **active** Users (decisions 13 and 16).
- **Wherever initials are shown for audit, the display resolves to the User's name** — the review queue, adjustment history, a Sale's header, and both names on a manager-only authorization. Required, not cosmetic: initials are reusable, so they no longer identify a person on their own (decision 16).

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Below-cost pricing and Invoice adjustments beyond ±2% raise review flags (d35); voiding a finalized Invoice remains manager-only.
- Employees can create Suppliers but never set margins.

**From [E-01](E-01-authenticate.md):**

- A manager-only authorization is performed at a terminal with an active Employee session, without displacing it.
- **Initials are unique within a Store, enforced when the User is created** ([E-01](E-01-authenticate.md) d14). Add is where that rule is enforced, so it is M-04's to implement and E-01's to have decided.
- **Adjusting on hand and voiding prompt for the acting Employee's initials even inside an active session** ([E-01](E-01-authenticate.md) d12, d15). Both are manager-only, so both take two sets of initials — the Employee's and the authorizing Manager's.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Two roles only: Employee and Manager, the latter a strict superset |
| 2 | The manager-gated list is deliberately short; anything not listed is available to any Employee |
| 3 | An override is performed in place by the Manager entering their initials, without replacing the Employee's session |
| 4 | Both the acting Employee and the authorising Manager are recorded |
| 5 | Users are **deactivated, never deleted** — historical attribution must survive |
| 6 | Till discounts below cost, Returns, and supplier creation are explicitly **not** gated |
| 7 | In v1 there are no credentials to issue, so adding a User has no invite step |
| 8 | **The manager override is replaced by a review queue.** Previously gated actions proceed and raise a flag a Manager reviews afterward. **Amends decisions 3 and 4** for override-gated actions, and closes the audit-surface open question ([architecture](../architecture.md) A-28) |
| 9 | **Manager-only actions are unchanged** and keep the in-place authorization of decisions 3 and 4 — the Manager enters their own initials, both names are recorded. Only the *override* is replaced (A-28a) |
| 10 | **An Invoice total adjusted beyond ±2% leaves the review queue and becomes impossible instead.** [E-02](E-02-receive-inventory.md) d50 makes the tolerance a hard bound at receiving, so there is no longer an action to flag — the row is removed from the table above rather than left describing something that cannot happen. **This is not the manager override returning.** Decision 8 replaced gates that *waited for a Manager*; a bound waits for nobody and no authorization lifts it. The correction paths are to fix the lines or to raise an Adjustment in [M-05](M-05-accounts-payable.md), both of which already exist. Every other flagged action is unchanged, and decision 8 stands for all of them |
| 11 | **A Store's ID and position are assigned by the WaxWorks team when the Store is set up, and no tier above Manager is created to hold them.** Answers the role half of [M-06](M-06-settings.md) d47 and of [architecture](../architecture.md) §11's *who may write a Store's ID and position* — the answer is **nobody in the product**. Both fields are issued to a new Store during its initial setup, alongside its authentication and login provisioning, and there is no screen, function, or role that offers to change them afterwards. **This does not add an Owner tier**, and it is worth saying why: d47 read as a hole in the role model because settings are manager-only ([architecture](../architecture.md) A-28a) and these two fields are not, which looks like a missing role. It is not — it is a field whose write happens **before the shop exists as a tenant**, so the actor is outside the role model rather than above it. That makes [architecture](../architecture.md) A-52's exemption of these two fields **permanent rather than a placeholder**, and it is the same move A-54 made for deletion: not a stronger permission, but no runtime write path at all. **It answers only this half of decision-less territory** — *is there a tier above Manager* remains open for the case it was originally raised on, which is who may demote the last Manager, and that case needs no Store ID to bite. *Accepted consequence:* a Store ID or position that is **wrong** has no in-shop correction path, so a shop opening a second branch and needing its position re-sequenced raises it with us rather than fixing it. That is correct for an identifier nobody may edit and it means the assignment has to be right first time, because the cost of being wrong is a support conversation rather than a keystroke |
| 12 | **The manager-only table's deletion row is replaced: deletion is gated by state, not by role.** Records [architecture](../architecture.md) A-54 in the document that carried the wrong version. The table previously read *"Delete a Record, Supplier, or Customer — destructive to reference data"*, which contradicted [E-07](E-07-manage-customers.md) d12's deliberately ungated Customer and left [M-01](M-01-supplier-margin.md)'s Supplier question open. **The rule is now:** deletion is **refused while live references exist** — a Customer with a balance, a Held Sale or open order lines; a Record with copies on hand or outstanding PurchaseOrder lines; a Supplier with an outstanding payable, a draft Invoice, an in-flight claim or a pending stream — refused in the write path, at **every** role, with no authorization lifting it. Where nothing is in flight, each flow's own rule stands: ungated for a Customer, Manager for a Record, and **open** for a Supplier ([M-01](M-01-supplier-margin.md)). **This is consistent with decision 2 rather than an exception to it:** requiring permission for a destructive act is weaker than making the act impossible, so the gated list gets *shorter* and the guarantee gets stronger. **The table also gains abandoning and voiding a SupplierClaim** ([E-04](E-04-manage-inventory.md) d24, d27, d29), which A-54 found gated in E-04 and missing here. *Accepted consequence:* a refusal now sends the operator somewhere else to fix something — clear the balance, sell or write off the stock, settle the payable — so it has to name **which** reference blocked it, or it reads as the system simply saying no |
| 13 | **Initials are unique within a Store and Add enforces it.** Receives [E-01](E-01-authenticate.md) d14, whose *initials collisions* open question this closes; the rule is E-01's and the enforcement point is here, because Add is where a User first gets initials. A duplicate is **refused at creation** and the Manager resolves it on the spot — three letters or a digit, `JD` / `JDB` / `JD2` — rather than the till disambiguating at use. Uniqueness is **per Store**, following [E-01](E-01-authenticate.md) d8's one-Store User, and is one of the things the multi-store open question below will have to reopen. *Accepted consequence:* the Manager picks the tiebreak at hiring, before the person is there to be asked, so somebody works under initials that are not their initials |
| 14 | **A Store must always have at least one active Manager, and the write path refuses anything that would leave it without one. Answers the remaining half of the *tier above Manager* question with a rule rather than a role.** Demoting a Manager to Employee, or deactivating one, is **refused** where it would take the Store's count of active Managers to zero — refused in the function, at every role, with no authorization lifting it, and including a Manager doing it to themselves. **No Owner tier is created.** This is the third time this project has answered a permission question with a state rule instead: [architecture](../architecture.md) A-54 for deletion, decision 11 for the Store identifiers, and now this. The pattern holds for the same reason each time — a role that exists to be allowed to do one dangerous thing is weaker than that thing being impossible, and it does not need administering. **The Manager is told why**, and the refusal names the fix: promote someone first. *Accepted consequence, and it is a real one:* the sole Manager of a shop who **leaves** cannot be deactivated by anyone, including themselves, until somebody else is promoted — so a departed person keeps an active account for exactly as long as the shop takes to appoint their replacement. That is the correct forcing function and it is also a door left open, and the shop cannot close it alone. A Store that reaches zero active Managers by some route this rule does not cover has **no in-product recovery**, because the rule that prevents it is also the rule that would prevent fixing it |
| 15 | **Deactivating a User ends their sessions immediately on every terminal, but an Open Sale survives.** Deactivation is the one case where [M-06](M-06-settings.md) d45's lapse must not be what ends a session: the lapse takes **no maximum** ([E-01](E-01-authenticate.md) d13), so waiting for it could leave a deactivated User attributing work for an hour, and "removes access" would mean nothing in particular. So it is immediate, and it does **not** follow the next-session rule that governs a role change — the two are deliberately different, because a role change is an adjustment and a deactivation is a departure. **An Open Sale is the exception and stays Open.** A Sale is locked to the Employee who opened it ([E-05](E-05-sell-a-record.md) d23) and ending the lock would strand a customer at the counter behind a `sale_force_unlock` and the review flag it raises ([architecture](../architecture.md) A-28) — for a Sale whose only problem is that somebody in the back office pressed a button. The Sale is finishable; the session is gone, so nothing new can be started under those initials anywhere. *Accepted consequence:* a deactivated User's name lands on a Sale **completed after they were deactivated**, which is the honest record of what happened and will still look wrong to anyone reading it later without this decision in front of them |
| 16 | **A deactivated User's initials are released and may be given to a new hire. Amends decision 13**, whose uniqueness is therefore among **active** Users, not all of them. Safe in the data because nothing stores the string as the identity: every Sale, adjustment, flag and authorization points at the **User row** ([PRD](../PRD.md) §5, decision 5), so the right name always resolves on screen no matter who holds `JD` today. **Where it is not safe is paper.** A printed receipt, an exported report, or anything else that has left the system carrying the letters `JD` no longer identifies one person, and nothing on that artifact says so. **So anywhere initials are shown for audit — the review queue, adjustment history, a Sale's header, a manager-only authorization's two names — the display resolves to the User's name rather than stopping at the initials.** That is the mitigation, and it is a requirement rather than a preference. *Accepted consequence:* the store's own paper records are ambiguous about who did something, in a way that is invisible on the paper and recoverable only from the system, and the window it applies to is however long a shop keeps receipts. Chosen over reserving initials forever because the alternative slowly exhausts two letters and hands new staff initials that are not theirs |
| 17 | **Acknowledging a ReviewFlag is manager-only**, and joins the table above. **This ratifies what the architecture already assumed rather than changing it** — [architecture](../architecture.md) §6 has carried `review_flag_acknowledge` **M** since A-28, while [architecture](../architecture.md) A-28a's enumerated manager-only list has never named it and neither had this flow, so the gate existed in the function surface and nowhere in the specification. The queue exists so a Manager sees what happened (decision 8); an Employee clearing the flag their own action raised empties it of the only thing it was for, and the shell's unreviewed count stops meaning *a Manager has looked at this* — which is the one thing the Requirements below ask that count to mean. Consistent with decision 2 despite lengthening the list: the gated set stays short because it holds the things an Employee genuinely must not do, and this is one. **Not restricted further than that** — any Manager may acknowledge any flag, including one raised by their own action as an acting Employee. A single-Manager store would otherwise accumulate flags nobody can ever clear, and [architecture](../architecture.md) §11 already records the single-Manager self-review problem as a known limit of the model rather than something this flow can solve. *Accepted consequence:* in a one-Manager shop, review is self-review, and the count in the shell says a Manager has seen it without being able to say it was a different Manager |

---

## Open questions

- ~~**Is there a tier above Manager?**~~ — **Resolved: no.** Both cases that forced the question are answered without one. A Store's ID and position are assigned by the WaxWorks team at setup and have no runtime write path (decision 11), and the last active Manager is protected by a **floor rule** in the write path rather than by a role that outranks them (decision 14). The [lexicon](../lexicon.md)'s *Manager* entry has been updated to match: Manager is the highest role, and a Store's assigned identifiers are issued outside the role model rather than above it.
- **Credentials.** Blocked on [E-01](E-01-authenticate.md) — when passwords or PINs arrive, adding a User grows an issuance step, and Managers may warrant stronger credentials than Employees.
- **Multi-store membership.** Whether a User can belong to several Stores, whether a Manager can administer more than one, and how switching works.
- **Authorization at a distance.** A Manager must be physically at the terminal for a manager-only action. A remote or asynchronous approval is a plausible later need in a shop where the Manager isn't always on the floor. Decision 8 shrinks this problem considerably — most of what used to need a Manager present now proceeds and flags.
- ~~**Audit surface**~~ — **Resolved** by decision 8: the review queue is that log.
