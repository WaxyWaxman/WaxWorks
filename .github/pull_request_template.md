<!--
Title format: "<FLOW-ID>: <what changed>"  e.g.  "E-05: resolve payment method decisions"
-->

## What changed

<!-- One or two sentences. Which flow(s), and what got settled. -->

## Decisions added

<!-- New decision rows, by number. "E-05 decisions 1-6." Say "none" if none. -->

## Cross-flow commitments propagated

<!--
The check that gets skipped most often. If a decision here constrains another
flow, it must already be written into that flow's "Inherited from other flows"
section in THIS pull request. List them, or say "none".
-->

## Status changes

<!-- e.g. "E-05: Stub -> In clarification". All three places updated? -->

## End-to-end register

<!--
docs/qa/e2e-register.md rows added or moved, by row ID and transition —
"E-05-T7: Planned -> Walked (prototype)". A superseded decision must list the
rows it makes Stale. A flow promoted to Specified gets rows. Say "none" if none.
-->

---

- [ ] `git merge origin/main` done, and the checks below run on the merged result
- [ ] `python scripts/check_docs.py` passes locally
- [ ] `/spec-audit` run, and its judgement findings addressed or noted below
- [ ] No existing decision row was renumbered or deleted
- [ ] Status matches in the flow file, `docs/README.md`, and `docs/PRD.md` §3
- [ ] If a decision was superseded, it is called out above — a textual merge cannot see it
- [ ] Register rows asserting any superseded or amended decision are marked `Stale`; a flow promoted to `Specified` has rows
