---
name: qa
description: Write, maintain, and run tests against the WaxWorks specs, and check that implemented code matches what was decided. Use when the user asks about testing, test coverage, whether the code matches the spec, error handling, edge cases, or mobile/counter usability of a flow.
---

# QA

QA here is **conformance to a written decision**, not general code quality. The
decision tables in `docs/flows/` are the specification; a test exists to hold the
code to a numbered decision.

> **Read the spec before writing a test.** `docs/architecture.md` §2 (the A-n
> decisions), §5.1 (the invariants the schema must enforce), and §9 (what those
> decisions amended elsewhere) are authoritative, and they have already changed
> several flow decisions. A test that encodes a superseded rule is worse than no
> test — it fails correct code and sends someone to restore a retired behaviour.

## 1. Traceability is the real coverage metric

Every numbered decision in a `Specified` flow should have a test that asserts it,
named so the link is visible:

```
E-02 d9 / A-24 — .50 / .99 rounding is pre-filled as a default, not enforced
A-15         — money is integer minor units; no float in the money path
```

Check both the flow decision and any A-n that amended it — the pair above is a live
example of exactly that, where a rule became a default.

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
| **Unit** | A rule with a worked example in the spec | A pricing or rounding rule with numbers attached |
| **Integration** | A phase of a flow across components | Scan → resolve barcode → catalog provider → price |
| **End-to-end** | A whole flow as the actor performs it | Open invoice → scan five items → reconcile → finalise |

Take the worked examples straight from the spec — its numeric examples are test
cases already written. Using the spec's own numbers means a disagreement between
test and spec is visible rather than arguable. Confirm the example has not been
amended before you encode it.

## 3. Error states and abuse paths

For every step that can fail, there is a test for what happens when it does.
Interrogate the flow adversarially, from the position of staff under time pressure:
abandoned drafts, unresolvable barcodes, the catalog provider down or rate-limited,
printing unavailable, two terminals acting on one record at once, a number
allocation racing, an action reserved to a Manager reached without one, a bounded
adjustment applied twice to exceed its bound, a value walked past a guardrail in
passing steps, an identifier changed to reach another store's data.

Where the design lets an action proceed and records it for review rather than
blocking it, test that the record is actually written, with an attributable actor,
on **every** path that reaches the action. That record is the only thing making the
permissive design safe.

Where the spec does not say what should happen, **that is an open question for
`/flow-clarify`, not a behaviour for you to choose and then enshrine in a test.**
Writing a test is recording a decision; do not record one the user has not made.

## 4. Interaction break points

Key counter tasks must work on the hardware actually at the till and the receiving
desk. Prioritise the repeat-heavy paths — scanning and pricing item after item is
where a merely-workable layout costs an hour a day. Check touch target size, that
nothing depends on hover or a keyboard that is not present, and that the
scan-to-next-scan loop needs no precise pointing.

Check `docs/architecture.md` for the decided platform, hardware, and output paths
rather than assuming them — and `docs/prototype.md` for what the clickable prototype
already covers.

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
| A cited decision turns out superseded | Re-read `architecture.md` §9; the finding is void |

## Reporting

Report test results as they actually are. If tests fail, show the output and say
which decision is now unmet. If you could not run the suite, say that — never infer
a pass from reading the code. A red suite reported accurately is worth more than a
green one asserted.
