---
name: spec-audit
description: Audit the WaxWorks documentation set for contradictions, status drift, broken cross-references, and unpropagated cross-flow commitments. Use before merging a branch, after a batch of flow edits, or when the user asks whether the docs are consistent or what to work on next.
---

# Audit the spec

Two people editing ten flow documents in parallel drift. This finds the drift.

Run the checks, then report. **Report findings, do not silently fix them** — a
contradiction between two flows usually means a real decision is unmade, and
choosing one side without asking destroys information. Fix only mechanical
breakage (a dead link, a status row that disagrees with the file it points at) and
say what you fixed.

**Start with the deterministic pass.** Run:

```bash
python scripts/check_docs.py
```

It covers checks 1, 3, 5 and part of 4 below with no judgement required, and it is
the same gate CI runs on the pull request. Do not re-derive by hand what it already
reports -- start from its output and spend your effort on the judgement checks
(2, 4-propagation, 6, 7), which it cannot do.

For a large sweep, delegate the read-heavy pass to the `spec-auditor` subagent and
report its findings.

## Checks

### 1. Status coherence
Every flow's `Status:` line must match its row in `docs/README.md` and in
`docs/PRD.md` §3. Three places, one answer.

### 2. Status honesty
A flow marked `Specified` must actually have: numbered steps, a populated decision
table, a requirements section, and no open question that blocks building it. A flow
marked `Stub` that has a full decision table is also drift — in the other direction.

### 3. Decision integrity
- Decision numbers within a flow are contiguous and start at 1.
- No number is reused; no row was deleted (compare against `git log -p` on the file
  if a gap appears).
- Every citation of the form "E-02 decision 8" resolves to a row that exists and
  says what the citing text claims it says.

### 4. Propagation
For every decision that constrains another flow, that flow has a matching entry
under **Inherited from other flows**. Walk it both ways:
- Each "Inherited from X" entry traces back to a real decision in X.
- Each decision in X that names another flow appears in that flow's inherited list.

This is the check that finds the most real problems.

### 5. Cross-references
- Every relative markdown link resolves to a file that exists.
- Every flow named in a `Related:` line names the citing flow back.
- Every flow file has a row in both index tables, and every index row has a file.

### 6. Contradictions
Compare rules stated in more than one place — pricing and rounding, permission and
override boundaries, immutability, store scoping, tax treatment. Quote both sides
verbatim and let the user adjudicate.

### 7. Domain model drift
Every entity in `docs/PRD.md` §4 is used by at least one flow; every entity a flow
depends on appears in §4. Flows invent entities faster than the PRD absorbs them.

### 8. Stale placeholders
List remaining `_TBD_` markers and unanswered open questions, grouped by flow.
These are the backlog, not defects.

## Report

Order findings by consequence, not by file:

1. **Contradictions** — two documents assert incompatible things. Quote both.
2. **Unpropagated commitments** — a decision that binds a flow which does not know it.
3. **Status drift** — including flows that have outgrown or under-run their status.
4. **Broken references** — dead links, missing index rows.
5. **Open backlog** — TBDs and open questions, with a suggested next flow to work
   and one sentence on why that one unblocks the most.

If everything passes, say so plainly and go straight to the backlog — the useful
half of a clean audit is what to do next.
