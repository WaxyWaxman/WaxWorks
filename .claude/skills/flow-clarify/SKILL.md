---
name: flow-clarify
description: Interrogate a WaxWorks user flow to close its gaps and drive it from Stub toward Specified. Use when the user names a flow ID (E-nn or M-nn) and wants to work through it, flesh it out, clarify it, answer its open questions, or "spec it out". Also use when they describe a new capability that belongs to an existing flow.
---

# Clarify a flow

This is the project's core working loop: take a flow that is a stub or half-drafted,
walk its steps with the user, interrogate each one for gaps, and write down what
gets decided. Its output is a flow document that another person could build from.

**This is a conversation, not a document generation task.** You are interviewing the
user about a domain they know and you don't. Do not write a flow document and present
it as finished — draft, ask, revise.

## Before you start

1. Read `docs/README.md` (conventions) and `docs/PRD.md` (spine, domain model,
   cross-cutting concerns).
2. Read the target flow file in `docs/flows/`.
3. Read `docs/flows/E-02-receive-inventory.md`. It is the reference for depth,
   tone, and structure — aim there.
4. Read every flow listed in the target's **Related** line, plus any flow whose
   "Inherited from other flows" section mentions the target.

## The loop

### 1. Restate the job

Open by stating the job in one sentence and asking whether it is right. A flow whose
job statement is wrong wastes every question that follows.

### 2. Draft the happy path

Write the numbered steps end to end, at the granularity of E-02: each step is one
actor doing one thing, or the system responding. Where you are guessing, say so
inline. Present it and let the user correct it before you interrogate it.

Group steps into phases once there are more than about eight of them.

### 3. Interrogate

Go step by step. For each one, work the checklist below and raise only the questions
that actually bite for that step — a generic checklist dump is noise.

- **Actor and permission.** Who does this? Can an Employee, or is a Manager needed?
  Is it reserved to a Manager, or does it proceed and get recorded for review?
  Check the current governance model in `docs/architecture.md` §2 and the terms in
  `docs/lexicon.md` rather than assuming — this has already changed once.
- **Preconditions.** What must already be true? What if it isn't?
- **Identity and collision.** What identifies the thing being acted on? What happens
  when two of them collide, or when the same action runs twice?
- **The unhappy path.** No match found. Network down. Wrong scan. Half-finished and
  abandoned. Interrupted mid-flow. Does state persist as a draft?
- **Money.** Is a price, cost, tax, or margin touched? Then there is a rounding rule,
  a source-of-truth question, and a guardrail question. Work a numeric example.
- **Multi-store.** The system is multi-store. Is this data scoped to a store, shared
  across stores, or ambiguous? Ambiguous is an open question, not a default.
- **Immutability and audit.** Once done, can it be undone? By whom? Is the reversal
  an edit, or an appended counter-artifact? (E-02 decision 23 is the house pattern:
  finalized things are immutable; corrections are appended.)
- **Hardware.** Scanner, label printer, receipt printer, cash drawer, card terminal.
  Does this step assume one exists?
- **Volume.** Does this step repeat per item? Then ask what makes it fast at fifty
  items — the "tick box to auto-accept for the rest of the invoice" pattern (E-02
  step 13) came from exactly this question.

Ask in small batches — three or four questions at a time, on one theme. Prefer
concrete either/or questions over open ones: "does the till block the sale, or let
inventory go negative?" gets an answer; "how should we handle inventory?" does not.

### 4. Record as you go

After each batch, write the answers straight into the file. Do not accumulate
decisions in the conversation and write at the end — the user should be able to
stop at any point and keep what was settled.

- Settled by the user → a new numbered row in **Resolved decisions**, appended.
- Settled but with a knowable downside → the decision row, plus a short prose
  section naming the consequence being accepted.
- Not settled, and it matters → **Open questions**, phrased as a question with
  enough context that it can be picked up cold.
- Not settled, and you have a view → write the recommendation with its reasoning
  and alternatives considered, marked `_Status: recommended, not yet ratified._`
- Constrains another flow → write it into **that** flow's "Inherited from
  other flows" section, in the same edit. This is the step most often skipped.

### 5. Close out

- Update the `Status:` line, and the matching rows in `docs/README.md` and
  `docs/PRD.md` §3. All three must agree.
- If the flow settled something cross-cutting (a rule that will bind flows not yet
  written), raise it via `/architecture` as a candidate **A-n** decision in
  `docs/architecture.md` §2.
- Tell the user what is still open, and what the next flow to work is and why.

## Promotion rules

| To | Requires |
|---|---|
| `In clarification` | Numbered steps drafted end to end |
| `Specified` | Decision table filled, requirements written, every cross-flow commitment propagated, and only genuine unknowns left open |

`Specified` does not mean "no open questions". It means no open question is blocking
someone from building it. "Confirm tax treatment with an accountant" is compatible
with `Specified`; "we haven't decided how payment works" is not.

## Do not

- Do not renumber or delete an existing decision row. Append; supersede in prose.
- Do not resolve an open question on the user's behalf because it seems obvious.
  Domain conventions in record retail are not guessable — ask.
- Do not delete `_TBD_` markers by filling them with plausible content.
- Do not let the conversation drift into implementation. Data model and technology
  belong in `/architecture`; this skill settles behaviour.
