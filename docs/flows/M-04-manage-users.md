# M-04 — Add/remove employees or managers

**Actor:** Manager
**Status:** In clarification
**Related:** [E-01 Authenticate](E-01-authenticate.md)

**Job:** As a manager, I need to control who has access to the system and at what level.

---

## Roles

Two roles. **Manager** is a strict superset of **Employee** — there is no capability an Employee has that a Manager lacks.

The design intent is that Employees have high agency. The manager-gated list below is short on purpose, and everything not on it is available to any Employee.

---

## Manager-only actions

| Action | Flow | Why it's gated |
|---|---|---|
| Price a **shelf price** below cost | [E-02](E-02-receive-inventory.md) d10, [E-04](E-04-manage-inventory.md) | Persists; sets margin for every future copy |
| Adjust an Invoice total beyond **±2%** | [E-02](E-02-receive-inventory.md) d19 | Beyond rounding, it's a cost restatement |
| **Void or amend** a finalized Invoice | [E-02](E-02-receive-inventory.md) d23, [E-04](E-04-manage-inventory.md) | Restates what was received and owed |
| **Adjust on hand** | [E-04](E-04-manage-inventory.md) | Rewrites stock reality; always reason-coded |
| **Process** pending orders into PurchaseOrders | [M-02](M-02-reorder-inventory.md) | Commits money to a supplier |
| **Void a PurchaseOrder** | [M-02](M-02-reorder-inventory.md) | Unwinds committed paperwork |
| **Undo End of Day** | [M-03](M-03-daily-summary.md) | Reopens settled takings |
| **Accounts payable** — all of it | [M-05](M-05-accounts-payable.md) | Pays suppliers |
| **Delete** a Record, Supplier, or Customer | [E-04](E-04-manage-inventory.md), [E-07](E-07-manage-customers.md) | Destructive to reference data |
| **Merge** suppliers | [M-01](M-01-supplier-margin.md) | Reassigns history |
| **Set supplier margin** | [E-02](E-02-receive-inventory.md) d3, [M-01](M-01-supplier-margin.md) | Employees may create suppliers, never price them |
| **Settings** — all of it | [M-06](M-06-settings.md) | Tax, tenders, currency, Sections |

### Deliberately *not* gated

- **Discounting a line below cost at the till** ([E-05](E-05-sell-a-record.md) d12). A till discount is a one-off on a single Sale; a shelf price persists. Employees are trusted with the former.
- **Processing a Return** ([E-06](E-06-process-a-return.md) d3). No receipt, no time limit, no approval.
- **Creating a supplier** ([E-02](E-02-receive-inventory.md) d3) — but not setting its margin.

---

## The manager override

A Manager approves a gated action **in place**, at the terminal where the Employee is working, by entering their own initials. This does not end or replace the Employee's session ([E-01](E-01-authenticate.md) d6): the Employee remains the actor, and the override is recorded alongside as a separate attribution.

Both names are retained — the record shows who did the thing and who authorised it.

---

## Managing users

| Action | Behavior |
|---|---|
| **Add** | A Manager creates a User with a role and initials. In v1 there are no credentials to issue ([E-01](E-01-authenticate.md)), so there is no invite step. |
| **Change role** | A Manager may promote an Employee to Manager or demote a Manager. |
| **Deactivate** | Removes access. **Users are never hard-deleted** — every Sale, adjustment, and override stays attributed to the person who performed it, so the record has to survive their leaving. |

---

## Requirements

- Attribution is permanent. A deactivated User's name still resolves on historical records.
- An override records the authorising Manager separately from the acting Employee.
- Role changes take effect on the next session, not retroactively on past attributions.
- Users are scoped to a Store; in v1 a User belongs to exactly one ([E-01](E-01-authenticate.md) d8).

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Manager override gates below-cost pricing, Invoice adjustments beyond ±2%, and voiding a finalized Invoice.
- Employees can create Suppliers but never set margins.

**From [E-01](E-01-authenticate.md):**

- An override is performed at a terminal with an active Employee session, without displacing it.

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

---

## Open questions

- **Is there a tier above Manager?** Someone has to be able to demote the last Manager, and an owner tier is the usual answer. Currently any Manager can promote or demote any other.
- **Credentials.** Blocked on [E-01](E-01-authenticate.md) — when passwords or PINs arrive, adding a User grows an issuance step, and Managers may warrant stronger credentials than Employees.
- **Multi-store membership.** Whether a User can belong to several Stores, whether a Manager can administer more than one, and how switching works.
- **Override at a distance.** Currently a Manager must be physically at the terminal. A remote or asynchronous approval (phone code, push notification) is a plausible later need in a shop where the Manager isn't always on the floor.
- **Audit surface.** Overrides, adjustments, and voids are all recorded, but nothing yet presents them as a reviewable log.
