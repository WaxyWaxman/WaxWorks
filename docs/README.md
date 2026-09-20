# Wax Works — Documentation

Point-of-sale and inventory management for independent vinyl record stores.

## Start here

| Document | What it covers |
|---|---|
| [PRD.md](PRD.md) | Product context, users, domain model, cross-cutting concerns |
| [architecture.md](architecture.md) | Stack, data model, database functions, build order — how it gets built |
| [lexicon.md](lexicon.md) | Controlled vocabulary — the canonical term for each concept, and what not to call it |
| [flows/](flows/) | One document per user flow — the detailed specs |
| [reference/](reference/) | Worked examples and external-system notes |
| [prototype.md](prototype.md) | The clickable prototype — what it's for, how to run it, flow ↔ screen map |
| [qa/e2e-register.md](qa/e2e-register.md) | The end-to-end test register — one row per whole-flow scenario, tracked against the prototype and the product |
| [build/](build/) | How code gets built past the prototype: the [workflow](build/workflow.md), the [build-status table](build/status.md), and the work orders |
| [templates/](templates/) | Starting point for a new flow document |

## Flows

| ID | Flow | Actor | Status |
|---|---|---|---|
| E-01 | [Authenticate to the platform](flows/E-01-authenticate.md) | Employee | **Specified** |
| E-02 | [Receive inventory](flows/E-02-receive-inventory.md) | Employee | **Specified** |
| E-03 | [Search the inventory](flows/E-03-search-inventory.md) | Employee | **Specified** |
| E-04 | [Manage the inventory](flows/E-04-manage-inventory.md) | Employee | **Specified** |
| E-05 | [Point of Sale](flows/E-05-sell-a-record.md) | Employee | **Specified** |
| E-06 | [Process a return](flows/E-06-process-a-return.md) | Employee | **Specified** |
| E-07 | [Manage customers](flows/E-07-manage-customers.md) | Employee | **Specified** |
| M-01 | [Suppliers](flows/M-01-supplier-margin.md) | Employee | **Specified** |
| M-02 | [Re-order inventory](flows/M-02-reorder-inventory.md) | Manager | **Specified** |
| M-03 | [Daily summary](flows/M-03-daily-summary.md) | Manager | **Specified** |
| M-04 | [Add/remove employees or managers](flows/M-04-manage-users.md) | Manager | **Specified** |
| M-05 | [Accounts payable](flows/M-05-accounts-payable.md) | Manager | **Specified** |
| M-06 | [Configure the store](flows/M-06-settings.md) | Manager | **Specified** |
| M-07 | [Chart of accounts](flows/M-07-chart-of-accounts.md) | Manager | **Specified** |
| M-08 | [Keep the general ledger](flows/M-08-general-ledger.md) | Manager | **Specified** |

## Conventions

**Flow IDs are stable.** `E-` for Employee jobs, `M-` for Manager jobs, `O-` for Owner jobs, `S-` for System Administrator jobs. Once assigned, an ID doesn't change — decisions and cross-references point at them (e.g. "E-02 decision 14").

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

**Decisions are numbered and cited.** Referring to "E-02 decision 8" should be unambiguous, so don't renumber an existing decision — append instead. A later decision that changes an earlier one says so explicitly ("amends decision 9", "supersedes decision 15"), and the earlier one stays put as the record of what was decided at the time.

**Architecture decisions are numbered `A-n`** in [architecture.md](architecture.md) and cited the same way. Where one amends a flow, the amendment is appended to that flow too — architecture.md §9 lists every one.

**Use the [lexicon](lexicon.md)'s canonical terms.** In flow documents, the PRD, reference material, commit messages, and any prompt written to drive an LLM against this project, use the exact term the lexicon prescribes rather than a synonym.

**Cross-flow dependencies go in "Inherited from other flows"** in the receiving document, not only in the flow that raised them. If E-02 needs something from E-05, it gets written into E-05.

## Working process

Flows are developed by walking through the steps, interrogating them for gaps, and recording the resolved decisions. A flow moves to `Specified` once its decision table is filled and only genuine unknowns remain open.

## Planning agent

The planning work is driven by skills in [`.claude/skills/`](../.claude/skills/),
shared through this repository so both of us get the same behaviour. See
[`CLAUDE.md`](../CLAUDE.md).

| Skill | Use it to |
|---|---|
| `/flow-clarify <ID>` | Walk a flow, interrogate it for gaps, drive it toward `Specified` |
| `/flow-new` | Scaffold a new flow and register it in every index |
| `/plan-check` | Check a proposal against recorded decisions before anything is written |
| `/architecture` | Derive architecture docs and ADRs from the specified flows |
| `/qa` | Write and run tests, keep the [end-to-end register](qa/e2e-register.md); `register`, `walk`, `automate`, `run`, `stale`, `ready` |
| `/work-order <ID> <D\|U>` | Draft, check, accept or return a [work order](build/workflow.md) — the checklist in, the evidence out |
| `/develop <order>` | Build an approved work order, test-first; the `developer` subagent runs one to completion in a worktree |
| `/spec-audit` | Check the doc set for contradictions, drift, and dangling links |
