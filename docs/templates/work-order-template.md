# Work order — <ID> <track> M<n>

**Flow:** [<ID> <title>](<file>.md)
**Milestone / track:** M<n> / D | U
**Status:** Drafted | Approved | In development | In review | Accepted | Returned
**Approved by:** _human, date_
**Pull request:** _once opened_
**Register rows:** <ID>-T1, <ID>-T2 — from `docs/qa/e2e-register.md`

## Scope

_One paragraph: what this order builds, and the `packages/contracts` entries it
implements or consumes. Written by the coordinator._

## Checklist

_Derived by the coordinator from the flow's live decisions, its "Inherited from
other flows" section, and every A-n that constrains this track. One row per
decision. Approved by a human before development starts; a decision missing here
is a coordinator error._

| # | Decision | Binds this track because | Evidence required |
|---|---|---|---|
| 1 | <ID> decision <n> — _one line of what it says_ | | unit \| integration \| manual — _reason_ |
| 2 | A-<n> — | | |

## Evidence

_Written by the developer. One row per Checklist row, in the same order. Every
cell is exactly one of `Done`, `Deferred`, `Blocked`, `N/A` — a blank cell fails
`check_coverage.py`._

| # | State | Test (name and `file:line`) | Run output | Note |
|---|---|---|---|---|
| 1 | Done \| Deferred \| Blocked \| N/A | `<ID> d<n> — …` at `path:line` | _quoted, not summarised_ | _Deferred: owner and where recorded. Blocked: the open question and the owning flow. N/A: why._ |

## Findings

_Written by reviewers (`qa-reviewer`, `architect`, `/code-review`). The developer
marks each `fixed` or `disputed`; nothing here is deleted._

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|
| | | | | | blocks \| should \| observation | fixed \| disputed — _why_ |

## Verdict

**Accepted** | **Returned** — _coordinator, date_

### Needs a human

- _The question. The options. The flow that owns it._
