---
name: develop
description: Implement an approved work order — one flow, one track (D database or U screens), one milestone — test-first against the WaxWorks specs, and fill in its Evidence section. Use when the user says to build, implement, or code a flow, names a work order, or wants to continue development on one. Never use it to write specs, tests that judge the work, or the order's own checklist.
---

# Develop

You are building to a **work order** — a file under `docs/build/orders/` whose
Checklist a human approved. The order is the brief; the flow documents and
`docs/architecture.md` are the specification; the Checklist is the definition of
done. You write the code and its tests, and you fill in the Evidence. You do not
decide what is in scope, and you do not judge whether you are finished — the
[workflow](../../../docs/build/workflow.md) gives both of those to other roles.

The same protocol binds the `developer` subagent, which runs an order to
completion in its own worktree. This skill is for a human pairing on one.

## Before writing anything

1. Read the order. `Status: Approved` with a named approver, or stop — an
   unapproved order has no fixed scope, and building to it drops requirements
   silently.
2. Read the flow the order names, in full, and `architecture.md` §2, §5.1, §6 and
   §9. **Read the file, don't recall it** — decisions here are superseded often,
   and the Checklist cites numbers, not text.
3. Read the `packages/contracts` entries the order names. **D** implements them
   as `SECURITY DEFINER` functions (A-4); **U** consumes them through the typed
   wrappers against the in-memory fake until D lands. A contract that does not fit
   the decision is a **contract pull request both humans review** — never a local
   edit.
4. Read the tests that already exist for this area, and `docs/lexicon.md` for
   the terms the code must use.

## The loop, per Checklist row

1. **Write the failing test first**, named for the decision, exactly as the
   existing suites do — `describe("M-05 d27 — whatever cannot attach stays as it
   was")`. Take the spec's worked example as the case where it has one. Run it;
   see it fail; that failure is the first line of your evidence.
2. Implement until it passes, and nothing else does not.
3. Fill the row's Evidence cell: `Done`, the test name, `file:line`, and the run
   output **quoted** — not "passes". Do it now, per row, not at the end; an order
   stopped halfway must show exactly what is held.
4. A row you cannot do is one of three things, and you say which:
   - **`Deferred`** — you could, but not in this order. Name who owns it and where
     it is recorded; the coordinator turns it into a `Blocked` register row.
   - **`Blocked`** — the spec does not say what should happen. Write the open
     question against the flow that owns it. **Do not choose a behaviour and
     encode it** — writing a test is recording a decision, and it is not yours.
   - **`N/A`** — the decision does not bind this track. Say why in one line.

   A blank cell is not a fourth option; `check_coverage.py` fails on it.

## Rules

- **Track boundaries are real.** D writes `supabase/` and `packages/db-types/`;
  U writes `apps/web/`. Neither writes `docs/flows/`, `docs/architecture.md`,
  `docs/PRD.md`, `docs/lexicon.md`, `docs/qa/`, `docs/prototype.md`, `.claude/`,
  or `packages/contracts/`. A spec problem you find is an open question or a
  supersession proposal, filed through the order — not an edit to the spec so the
  code can match it.
- **Invariants live in the database** (A-4, §5.1). A screen may check first for
  the user's sake; it never checks *instead*.
- **Money is integer minor units** (A-15); rates are `_ppm`, applied once,
  rounded half away from zero (A-47). No float in the money path — a test that
  passes with one is asserting the wrong thing.
- **Permissive by design means the record is the safety.** Where a decision says
  "proceeds and raises a review flag", the flag row with an attributable actor is
  the deliverable, written in the same transaction as the action (A-28). Test the
  flag, not just the action.
- **Manager-only stays gated** (A-28a): a Manager's initials, both names
  recorded, enforced in the definer function.
- **Never claim more than the output shows.** If the suite is red, say red and
  show it. If you could not run it, say so. A green suite asserted from reading
  the code is the failure this whole workflow exists to prevent.
- **Do not touch the Checklist.** Not to add, remove, or reword a row.
- **Do not open the pull request as finished.** Set the order to `In review`,
  report by row, and hand it back to `/work-order check`. The reviewers will run
  what you ran.

## Reporting

By Checklist row, in order, with the terminal state of each and the run output
for every `Done`. Then anything you found that the spec does not cover, as open
questions against their owning flows. Then **Needs a human**: contract changes
you needed, decisions you believe are wrong, anything you deferred.
