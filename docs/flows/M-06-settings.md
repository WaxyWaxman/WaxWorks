# M-06 — Configure the store

**Actor:** Manager
**Status:** In clarification
**Related:** [E-05 Sell a record](E-05-sell-a-record.md) · [M-03 Daily summary](M-03-daily-summary.md) · [M-04 Manage users](M-04-manage-users.md)

**Job:** As a manager, I need to configure the things every other flow reads — tax, tenders, sections, and currency — so the till and the reports behave the way this shop actually works.

**Scope note:** this flow is the home of configuration that other flows depend on. It is deliberately thin on process and thick on definitions. User administration is [M-04](M-04-manage-users.md).

---

## Tax table

A list of named **tax lines**, each with a rate. Every sellable thing references a tax line rather than carrying a boolean.

| Field | Notes |
|---|---|
| Name | e.g. `GST + QST`, `GST only`, `Exempt` |
| Rate(s) | One or more components, so stacked jurisdictional taxes are one line |
| Default | The line applied to new catalog entries unless overridden |

A **zero-rate line** is how exemption is expressed — there is no separate "no tax" flag. A Customer's default tax line ([E-07](E-07-manage-customers.md)) overrides the item's at the till.

This settles PRD §6 open question 4 for the *outbound* side: **multi-jurisdiction sales tax is in scope**, expressed as selectable tax lines. Tax on the *inbound* side stays as E-02 decision 17 has it.

## Tender types

The list of tenders offered at the till ([E-05](E-05-sell-a-record.md)), each with a display name and behavior:

| Tender | Behavior |
|---|---|
| Cash | Calculates change |
| Credit Card | Recorded only — no processor integration |
| Store Credit | Draws against a Customer's account balance |
| Gift Card | Redeems a `GC` balance |
| Pay-out | Cash out for an expense; requires a note |
| Used Credit | Second-hand counter buy; creates a balance owing to the customer |

Names are configurable; behaviors are not — a tender's behavior is code, and the setting only controls what the till calls it.

## Sections and the genre map

**Sections** are the top-level categories the daily summary breaks down by — `VINYL`, `MERCH`, and whatever else the shop sells. Every sellable thing has one, including non-tracked items like freight.

**Genre** is finer-grained and determines where a Record lives in the shop. Genres roll up into Sections: every music genre sits under `VINYL`, apparel under `MERCH`.

The **genre map** translates Discogs' genre taxonomy into the shop's own. On import a Record is assigned a genre and Section by the map's best guess. When the guess is wrong, a Manager either corrects the map — fixing every future import — or an Employee overrides that one Record ([E-04](E-04-manage-inventory.md)).

## Currency

Currency shorthand codes with conversion rates, so supplier costs in a foreign currency convert to store currency for margin and payables ([M-05](M-05-accounts-payable.md)). The reference Invoice currency is CAD.

## Store details

Store name and the details that appear on receipts and outbound documents.

---

## Requirements

- Every setting here is **manager-only**.
- Changing a setting must not retroactively rewrite completed records. A tax line's rate changing does not restate yesterday's Sales, whose tax was snapshotted ([E-05](E-05-sell-a-record.md) d13).
- A tax line or tender in use cannot be deleted, only deactivated.
- The genre map must be editable without touching Records already imported under it.
- Settings scope to a Store.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Tax is a **table of named tax lines**, referenced by sellable things — never a boolean |
| 2 | Exemption is a zero-rate line, not a separate flag |
| 3 | **Multi-jurisdiction sales tax is in scope**, settling PRD §6 open question 4 for outbound tax |
| 4 | Tender display names are configurable; tender behaviors are not |
| 5 | **Sections** are the top-level reporting category; **genres** roll up into them |
| 6 | A **genre map** translates Discogs genres to shop genres and Sections, correctable at the map or per Record |
| 7 | Currency codes carry conversion rates for cost and payables conversion |
| 8 | Settings changes are never retroactive; completed records keep their snapshotted values |
| 9 | Referenced settings are deactivated, never deleted |
| 10 | Settings scope to a Store |

---

## Open questions

- **Per-store versus shared settings.** The system is multi-store. Tax lines are plainly per-store; the genre map and Section list would more usefully be shared. PRD §6 asks the same of suppliers, margins, and the catalog — this flow needs the same answer.
- **Currency rates.** Manually maintained, or fetched? A stale rate quietly misstates every foreign payable.
- **Receipt template.** Store details feed receipts, but the layout, what appears on it, and paper size are unspecified ([E-05](E-05-sell-a-record.md)).
- **Tax line changes over time.** Rates change by legislation. Whether a tax line is versioned with effective dates, or a new line is created and the old deactivated, is undecided.
- **Section list.** Fixed at setup or freely editable, and what happens to Records in a Section that is removed.
