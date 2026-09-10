---
name: qa
description: Write, maintain, and run tests against the WaxWorks specs, and check that implemented code matches what was decided. Use when the user asks about testing, test coverage, whether the code matches the spec, error handling, edge cases, or mobile/counter usability of a flow.
---

# QA

QA here is **conformance to a written decision**, not general code quality. The
decision tables in `docs/flows/` are the specification; a test exists to hold the
code to a numbered decision.

> **Current state:** there is no application code in this repository yet. Until
> there is, the useful half of this skill is the traceability work in §1 — turning
> `Specified` decisions into a test list — and reviewing prototype behaviour against
> the flows. Say so rather than manufacturing tests for code that does not exist.

## 1. Traceability is the real coverage metric

Every numbered decision in a `Specified` flow should have a test that asserts it,
named so the link is visible:

```
E-02 decision 9 — shelf prices round up to .50 or .99
E-02 decision 10 — employee cannot price below cost without manager override
```

Name the decision in the test name or a comment on it. Then "which decisions are
untested" is a `grep`, and it survives refactoring.

**On the 90–100% target.** Line coverage measures that code ran, not that it does
what was agreed — 100% coverage is reachable with no assertion about rounding
behaviour at all. Hold the percentage as a floor if you like it, but treat
**decision coverage as the gate that actually blocks a merge**: no decision in a
`Specified` flow ships untested. That target is meaningful, cheap to check, and
uses the numbering system you already maintain.

Where a decision is genuinely untestable in isolation, say so next to it rather than
weakening the rule for everything.

## 2. Levels

| Level | Holds | Example |
|---|---|---|
| **Unit** | A rule with a worked example in the spec | Rounding table in E-02; `list x (1 + margin)` |
| **Integration** | A phase of a flow across components | Scan → resolve barcode → Discogs fallback → price |
| **End-to-end** | A whole flow as the actor performs it | Open invoice → scan five items → reconcile → finalise |

Take the worked examples straight from the spec — E-02's rounding table and its
`$27.99` list / 10% discount / 60% margin example are test cases already written.
Using the spec's own numbers means a disagreement between test and spec is visible
rather than arguable.

## 3. Error states and abuse paths

For every step that can fail, there is a test for what happens when it does.
Interrogate the flow adversarially, from the position of staff under time pressure:
abandoned drafts, unresolvable barcodes, Discogs down or rate-limited, printer
offline, duplicate `(supplier, invoice_number)`, two tills selling the last copy,
gated actions reached without the override, the ±2% adjustment applied twice, a
price walked below cost in passing steps, an identifier changed to reach another
store's data.

Where the spec does not say what should happen, **that is an open question for
`/flow-clarify`, not a behaviour for you to choose and then enshrine in a test.**
Writing a test is recording a decision; do not record one the user has not made.

## 4. Interaction break points

Key counter tasks must work on the hardware actually at the till and the receiving
desk. Prioritise the repeat-heavy paths — scanning and pricing item after item is
where a merely-workable layout costs an hour a day. Check touch target size, that
nothing depends on hover or a keyboard that is not present, and that the
scan-to-next-scan loop needs no precise pointing.

Platform and hardware are open in PRD §5. Until they are decided, report these
checks as **blocked on PRD §5** rather than assuming a platform and testing against
the assumption.

## 5. Reviewing an implementation

Delegate the read-heavy sweep to the `qa-reviewer` subagent, which is read-only and
must cite a decision number for every conformance finding. Then act on what it
returns:

| It found | Route |
|---|---|
| Code contradicts a decision | Fix the code, or supersede the decision via `/plan-check` |
| Decision has no test | Write the test |
| Spec never made the choice | `/flow-clarify <ID>` — do not invent the requirement |
| Structural or security concern | `/architecture` |

## Reporting

Report test results as they actually are. If tests fail, show the output and say
which decision is now unmet. If you could not run the suite, say that — never infer
a pass from reading the code. A red suite reported accurately is worth more than a
green one asserted.
