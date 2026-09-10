---
name: plan-check
description: Check a proposal, plan, or suggested change against the decisions already recorded, and report conflicts before anything is written. Use when the user proposes a feature, approach, or change and wants to know whether it contradicts existing decisions, or asks "does this conflict with anything" / "can we do X".
---

# Check a plan against the record

The coordination gate. A proposal arrives — from either of us, from a subagent, or
from your own reasoning — and this decides whether it can proceed as stated, needs
an existing decision superseded first, or is blocked on something undecided.

Nothing is written to `docs/` by this skill. Its output is a verdict and a route.

## Method

### 1. Restate the proposal as claims

Break it into the specific claims it makes about system behaviour. "Add gift cards"
is not checkable; "a sale may be tendered against a stored balance", "a return may
credit that balance", "the balance is store-scoped" are.

Vague proposals produce vague conflict checks. Do this step even when it feels
pedantic — most conflicts surface here, at the moment of making the claim explicit.

### 2. Find the governing decisions

For each claim, search the record for what already governs it:

```bash
grep -rn "<term>" docs/
```

Read `docs/PRD.md` §4 and §6, the decision tables of every related flow, and any
A-n decision in `docs/architecture.md` §2. Check §9 too: an A-n may already have
amended the flow decision you are about to cite. Read the actual rows — do not rely
on memory of them from earlier in the conversation, and check `docs/lexicon.md` for
terms marked retired.

### 3. Classify every claim

| Verdict | Meaning | Route |
|---|---|---|
| **Consistent** | An existing decision permits it | Proceed |
| **Conflicts** | An existing decision forbids or contradicts it | Stop. Needs supersession (below) |
| **Unconstrained** | Nothing on record either way | Proceed, and record the new decision where it lands |
| **Blocked** | Depends on an open question | Stop. Name the question and which flow owns it |

**Every verdict cites `path:line` or a decision number.** A conflict you cannot cite
is not a conflict — report it as a suspicion, in those words, and say what you
searched. This is the rule that keeps this skill honest: it is easy to generate a
plausible-sounding contradiction, and a false conflict costs more than a missed one
because it blocks real work and erodes trust in the check.

### 4. Report

Lead with the verdict. Conflicts first, quoted verbatim from both sides:

> **Conflicts.** The proposal prices second-hand copies from a shared catalogue
> price. E-02 decision 11 (`docs/flows/E-02-receive-inventory.md:118`) says sticky
> retail pricing applies to New stock only; second-hand copies are priced per copy.

Then blocked claims with the owning flow, then unconstrained claims with where the
decision would land, then the consistent ones in one line — do not elaborate on
things that are fine.

## Supersession

An existing decision can be wrong. It is changed by **appending a new decision row
that names and reverses the old one** — never by editing or deleting the original,
because citations of it are permanent addresses.

Propose the wording, cite what breaks downstream (every flow that inherited the old
commitment needs its "Inherited from other flows" entry updated in the same change),
and let the user decide. Do not supersede a decision on your own judgement.

## Routing

Once the verdict is clear, hand off rather than doing everything here:

| The proposal is... | Route to |
|---|---|
| Behaviour inside one flow | `/flow-clarify <ID>` |
| A job nobody has written down yet | `/flow-new` |
| Structural, or a security or reliability question | `/architecture` |
| A claim that the code does or does not do something | `/qa` |
| Broad — "is the whole set still consistent?" | `/spec-audit` |

State the route and why. If the proposal spans several, sequence them and say what
has to be settled first.
