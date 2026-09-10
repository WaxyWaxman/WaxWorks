---
name: flow-new
description: Create a new WaxWorks flow document with the next stable ID and register it in every index. Use when the user wants to add a flow, a new job to be done, or says an existing flow should be split in two.
---

# Add a flow

A new flow is four coordinated edits, not one file. Missing any of them leaves the
doc set inconsistent, which `/spec-audit` will then flag.

## 1. Decide the ID

- `E-` for a job an Employee does; `M-` for a Manager job.
- Take the **next unused number** in that series. Read `docs/README.md` and
  `ls docs/flows/` — never reuse a number, even if a flow was abandoned.
- IDs are permanent. If you are unsure whether this is a new flow or part of an
  existing one, ask before minting an ID.

**Splitting an existing flow:** the original keeps its ID and its decision numbers.
The new half gets a fresh ID, and the original gains a scope note saying what moved
where. Decisions that move are restated in the new flow with a citation back to
their origin (`Split from E-02 decision 14`), and the original row stays put with a
pointer forward. Never renumber to tidy this up.

## 2. Create the file

Copy `docs/templates/flow-template.md` to `docs/flows/<ID>-<kebab-slug>.md`.
The slug is short and verb-led: `E-05-sell-a-record.md`, not `E-05-sales.md`.

Fill in only what you actually know: actor, job statement, related flows, and the
open questions that prompted the flow's creation. Everything else stays `_TBD_`.
A good stub is a job sentence plus five sharp questions.

## 3. Register it

Add a row in the same relative position in **both** index tables:

- `docs/README.md` → the Flows table
- `docs/PRD.md` → §3 Jobs to be Done, under the right actor heading

Both rows say `Stub`.

## 4. Wire the cross-references

- Add the new flow to the **Related** line of each flow it touches, and add those
  flows to its own.
- If the new flow inherits a commitment from an existing one, copy it into the new
  file's "Inherited from other flows" section now, citing the source decision.

## Then

Offer to run `/flow-clarify <ID>` on it. A stub's value is that it is a place to put
the next answer — say so, and get the first questions in front of the user.
