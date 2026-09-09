# Wax Works — Documentation

Point-of-sale and inventory management for independent vinyl record stores.

## Start here

| Document | What it covers |
|---|---|
| [PRD.md](PRD.md) | Product context, users, domain model, cross-cutting concerns |
| [lexicon.md](lexicon.md) | Controlled vocabulary — the canonical term for each concept, and what not to call it |
| [flows/](flows/) | One document per user flow — the detailed specs |
| [reference/](reference/) | Worked examples and external-system notes |
| [prototype.md](prototype.md) | The clickable prototype — what it's for, how to run it, flow ↔ screen map |

## Flows

| ID | Flow | Actor | Status |
|---|---|---|---|
| E-01 | [Authenticate to the platform](flows/E-01-authenticate.md) | Employee | In clarification |
| E-02 | [Receive inventory](flows/E-02-receive-inventory.md) | Employee | **Specified** |
| E-03 | [Search the inventory](flows/E-03-search-inventory.md) | Employee | **Specified** |
| E-04 | [Manage the inventory](flows/E-04-manage-inventory.md) | Employee | **Specified** |
| E-05 | [Sell a record](flows/E-05-sell-a-record.md) | Employee | **Specified** |
| E-06 | [Process a return](flows/E-06-process-a-return.md) | Employee | **Specified** |
| E-07 | [Manage customers](flows/E-07-manage-customers.md) | Employee | **Specified** |
| M-01 | [Set a supplier margin](flows/M-01-supplier-margin.md) | Manager | Stub |
| M-02 | [Re-order inventory](flows/M-02-reorder-inventory.md) | Manager | **Specified** |
| M-03 | [Daily summary](flows/M-03-daily-summary.md) | Manager | **Specified** |
| M-04 | [Add/remove employees or managers](flows/M-04-manage-users.md) | Manager | In clarification |
| M-05 | [Accounts payable](flows/M-05-accounts-payable.md) | Manager | **Specified** |
| M-06 | [Configure the store](flows/M-06-settings.md) | Manager | In clarification |

## Conventions

**Flow IDs are stable.** `E-` for employee jobs, `M-` for manager jobs. Once assigned, an ID doesn't change — decisions and cross-references point at them (e.g. "E-02 decision 14").

**One file per flow.** Keeps parallel editing conflict-free and keeps the PRD readable as a spine rather than a monolith.

**Status values:**

| Status | Meaning |
|---|---|
| `Stub` | Job statement and open questions only |
| `In clarification` | Flow drafted, being interrogated |
| `Specified` | Flow, requirements, and resolved decisions written down |

**Each flow document carries:**

- **Flow** — the numbered steps
- **Requirements** — what has to be true
- **Inherited from other flows** — commitments pushed here by another flow. These are decided, not open.
- **Resolved decisions** — a numbered table, so decisions can be cited precisely
- **Open questions** — what's still undecided

**Decisions are numbered and cited.** Referring to "E-02 decision 8" should be unambiguous, so don't renumber an existing decision — append instead.

**Use the [lexicon](lexicon.md)'s canonical terms.** In flow documents, the PRD, reference material, commit messages, and any prompt written to drive an LLM against this project, use the exact term the lexicon prescribes rather than a synonym.

**Cross-flow dependencies go in "Inherited from other flows"** in the receiving document, not only in the flow that raised them. If E-02 needs something from E-05, it gets written into E-05.

## Working process

Flows are developed by walking through the steps, interrogating them for gaps, and recording the resolved decisions. A flow moves to `Specified` once its decision table is filled and only genuine unknowns remain open.
