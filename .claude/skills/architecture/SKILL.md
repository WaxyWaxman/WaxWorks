---
name: architecture
description: Derive or update the WaxWorks architecture and its numbered A-n decisions, including security and reliability review. Use when the user asks about system design, data model, stack, deployment, integrations, database functions, authorisation, tenant isolation, audit trails, or wants to record an architecture decision.
---

# Architecture

Architecture here is **derived**, not invented. Every structural claim traces to an
A-n decision, a flow decision, or an explicit statement from the user. Where it
cannot, it is a proposal and must be labelled one.

Everything lives in one document: [`docs/architecture.md`](../../../docs/architecture.md).

| Section | Holds |
|---|---|
| §1 Stack | Chosen technologies |
| §2 Decisions | The numbered **A-n** decisions, grouped by area |
| §3–§4 Shape, Printing | Component layout and output paths |
| §5 Data model | Entities, keys, scoping; §5.1 the invariants the schema must enforce |
| §6 Database functions | The write surface |
| §7–§8 Repository layout, Build order | How it gets assembled |
| §9 Amendments | Every change an A-n made to a flow or the PRD |
| §10–§11 Risks, Open questions | What is unsettled |

## Order of work

1. Read `docs/architecture.md` in full — §2 for what is decided, §9 for what those
   decisions changed elsewhere, §11 for what is still open.
2. Read `docs/lexicon.md`. Use its canonical terms; a term it marks retired signals
   that the behaviour behind it changed.
3. Read the flows the work touches, in full, including decision tables.
4. Read `docs/PRD.md` **after** §9, not before — much of the PRD has been amended by
   later A-n decisions, so the PRD text is not always the current answer.
5. Only then write.

**Do not rely on domain facts remembered from an earlier session or carried in from
a prompt.** This project's decisions move fast and supersede each other; a snapshot
enforced as current is worse than no knowledge at all.

## Recording a decision

A-n numbers are permanent, like flow IDs. Take the next unused number, append to the
right subsection of §2, and write the decision as a claim in the active voice — what
the system does, not what it should probably do.

An A-n is for a decision that **binds flows beyond the one in front of you**.
A decision local to a single flow belongs in that flow's decision table instead.

Three things make a recorded decision complete:

- **The consequence it accepts.** A decision with only upsides has not been thought
  through. Name the downside next to it.
- **What it amends.** If it changes a flow decision or a PRD section, append the
  amendment to that document *and* add the row to §9. Both, in the same change —
  §9 is what makes the amendment findable later.
- **The alternatives.** The value is in the roads not taken and why.

**Supersession never deletes.** A decision that turns out wrong is struck through in
place with a pointer to what replaced it, because citations of it are permanent
addresses. Same for flow decisions you amend.

## The ratification gate

**You propose; the user ratifies.** Say plainly that a newly drafted decision is not
yet binding, and do not cite it elsewhere as though it were settled until the user
confirms it.

This is the main defence against a confident wrong turn: an architecture decision
binds flows that have not been written, so a wrong one propagates silently. Checking
before it lands is cheap; unwinding it later is not.

## Security and reliability

Architecture and security are one job here, because they are the same decisions:
where an invariant is enforced, where the tenant boundary sits, what is immutable,
and who is recorded as having done what.

Treat these as part of every design pass, not a later review. The specific rules —
the enforcement point for writes, the scoping rule, the governance model for
permissive actions, the money representation — are all recorded in §2 and §5.1.
**Read them there.** Check a design against the recorded rule rather than against a
general notion of how such systems usually work; this one has made deliberate,
specific choices that differ from the obvious defaults.

Constant regardless of what is decided:

- An invariant enforced only in the client is not enforced.
- Every consequential action needs an attributable actor and a timestamp.
- A permissive design is only safe if its compensating mechanism is actually worked.
- Input crossing a trust boundary is untrusted, including from the catalog provider.
- Degradation is designed, not assumed. "It won't happen" is not a design.

For a read-heavy sweep, delegate to the `architect` subagent — read-only, cites
`path:line` or a decision number for every finding, and hands back draft decision
text without writing or ratifying anything.

## Diagrams

Mermaid in fenced ```mermaid blocks — renders on GitHub, needs no tooling. One
question per diagram: component boundaries, or an entity relationship, or one flow's
path. A diagram answering three questions answers none.
