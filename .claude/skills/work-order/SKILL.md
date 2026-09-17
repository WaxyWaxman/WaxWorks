---
name: work-order
description: Create, approve, or close a work order — the per-flow, per-track, per-milestone file that carries the requirement checklist into development and the evidence out. Use when the user wants to start building a flow for a milestone, asks "what does E-05 need for M4", wants to check a developer's completion claim, or wants to accept or return an order.
---

# Work order

The coordination artifact of the [build workflow](../../../docs/build/workflow.md).
A work order is the only way development starts, and its Evidence section is the
only way it is declared finished. **The developer never writes its own checklist
and never judges its own evidence** — that separation is what this skill exists
to enforce.

Files live at `docs/build/orders/<ID>-<track>-M<n>.md`, from
[`docs/templates/work-order-template.md`](../../../docs/templates/work-order-template.md).
Nothing in this skill writes code, tests, or a decision.

## `/work-order <ID> <D|U>` — draft

1. **Confirm the flow is buildable.** `Status: Specified` in all three places;
   `python scripts/check_docs.py` clean; the milestone that names this flow in
   `architecture.md` §8 identified. A flow §8 does not place is an open question
   for `/architecture`, not a work order.
2. **Derive the Checklist.** Read the flow in full — its decision table, its
   *Inherited from other flows* section, and `architecture.md` §9 for what amended
   it. Then list, one row each, every live decision that binds this track:
   - flow decisions whose behaviour this track implements (D: what the write path
     must enforce; U: what the screen must show, ask, or refuse);
   - inherited commitments from other flows;
   - every A-n that constrains the area — always A-4 and A-5 for D, A-15/A-47
     wherever money moves, A-28/A-28a wherever an action is flagged or gated, A-57
     wherever tax is computed.
   A struck-through decision is not listed. A decision you are unsure binds this
   track is listed with the doubt stated, for the human to strike at approval.
3. **Name the evidence each row requires.** `unit` for a rule with a worked
   example; `integration` for a contract exercised against the real function;
   `manual` only with the reason a test cannot hold it — and that reason is a
   candidate open question, not an excuse.
4. **List the register rows** from `docs/qa/e2e-register.md` this order must
   make automatable, and the contract entries from `packages/contracts` it
   implements or consumes.
5. Write the file, `Status: Drafted`, and hand it to the human with the sentence:
   *"Approving this fixes the scope — anything not on the Checklist is out."*

## Approve

Only a human approves. Record who and when in the header, set
`Status: Approved`, and only then dispatch — `/develop <order>` for interactive
work, or the `developer` subagent for an order run to completion in a worktree.
The dispatch prompt is the order's path and nothing else; the order is the brief.

## `/work-order check <order>` — read the evidence

Run after the developer reports done, **before** any reviewer is invoked:

1. `python scripts/check_coverage.py --order <file>` — every Checklist row must
   be accounted for: a named test found in the tree, or an explicit `Deferred`,
   `Blocked`, or `N/A`. A blank cell or a `Done` with no test found returns the
   order to the developer without review.
2. Read the Evidence rows against the Checklist rows, one to one. A `Done` must
   quote run output; a summary ("all tests pass") is not evidence. A `Deferred`
   must name an owner and where it is recorded — and that record must exist.
3. Set `Status: In review` and invoke, with the order's path and the diff:
   `qa-reviewer` (conformance; it runs the suites itself), then `architect`
   (security and structure), then `/code-review`. **Do not paste the developer's
   report into any reviewer's prompt.**
4. Findings land in the order's Findings table. Route each to the developer; a
   `disputed` finding is a **Needs a human** item, not an argument to settle here.

## `/work-order accept <order>` or `return <order>`

`Accepted` requires: every Checklist row accounted for, every blocking finding
`fixed`, the suites green in the reviewer's own run, and `check_docs.py` clean.
Anything less is `Returned`, with the rows and findings that caused it listed in
the Verdict.

On `Accepted`:

- Write the **Needs a human** list into the Verdict — open questions the order
  raised, supersessions it proposed, A-n drafts it produced.
- Every `Deferred` row becomes a `Blocked` register row or an open question in the
  owning flow, in the same change. **A deferral that lives only in the order is a
  dropped requirement**; this is the step that keeps it alive.
- When both tracks of the milestone are `Accepted` and merged, write the row in
  [`docs/build/status.md`](../../../docs/build/status.md) with the pull requests
  and the contract commit, then call `/qa ready <milestone>`.

## Do not

- Do not let the developer add to, remove from, or reword a Checklist row. A
  wrong row is struck by the human at approval or superseded via `/plan-check`.
- Do not fill an Evidence cell on the developer's behalf.
- Do not accept an order whose tests you have not seen run by a reviewer.
- Do not resolve an open question so the order can close. Record it; the row is
  `Blocked`.
