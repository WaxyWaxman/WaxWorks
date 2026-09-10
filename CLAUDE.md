# WaxWorks — working agreements

This repository is in the **requirements phase**. There is no application code yet;
the deliverables are specification documents under `docs/`. Treat writing and
interrogating specs as the primary work, not as preamble to code.

Two people work here in parallel — `sr-talbot` and `WaxyWaxman`. Everything below
exists so that two humans and their agents can edit at the same time without
colliding or quietly contradicting each other.

## Map

| Path | What it holds |
|---|---|
| `docs/PRD.md` | The spine — product context, users, domain model, cross-cutting concerns |
| `docs/flows/` | One document per user flow. The detailed specs. |
| `docs/architecture/` | System architecture, once flows are specified enough to constrain it |
| `docs/decisions/` | ADRs — cross-cutting decisions that outlive any single flow |
| `docs/reference/` | Worked examples and external-system notes |
| `docs/templates/` | Starting points for new flows and ADRs |
| `.claude/skills/` | The planning skills (see below) |

`docs/README.md` is the authoritative statement of the documentation conventions.
Read it before editing anything under `docs/`.

## Conventions that are load-bearing

- **Flow IDs are stable.** `E-` employee, `M-` manager. Never renumber.
- **Decisions are numbered and cited.** "E-02 decision 8" must stay unambiguous
  forever, so **append** to a decision table, never renumber or delete a row.
  A decision that turns out wrong is superseded by a new row that says so.
- **One file per flow.** Keeps parallel edits conflict-free.
- **Cross-flow commitments are written into the receiving document**, under
  "Inherited from other flows" — not left only in the flow that raised them.
- **Status lives in three places** and they must agree: the flow file's `Status:`
  line, the table in `docs/README.md`, and the table in `docs/PRD.md` §3.
  Change one, change all three.
- **`_TBD_` is a real marker.** Leave it in place rather than inventing content
  to fill a section. An honest gap is more useful than a plausible guess.

## How to behave in this repo

- **Do not invent requirements.** If the answer isn't in the docs or from the
  user, it is an open question — write it down as one. Recording a good question
  is a successful outcome here.
- **Distinguish recorded from proposed.** A recommendation that has not been
  ratified is marked as such (see the internal barcode scheme in the PRD for the
  house style: `_Status: recommended, not yet ratified._`).
- **Name the consequence you are accepting.** When a decision has a knowable
  downside, write it down next to the decision rather than leaving it to be
  rediscovered (see "Cost treatment" in E-02).
- **Keep prose tight.** Tables for anything enumerable, worked examples for
  anything numeric. Match the register of `docs/flows/E-02-receive-inventory.md`,
  which is the reference for what a finished flow looks like.

## The agents

Three roles. Each is an **interactive skill** that converses and writes, paired with
a **read-only subagent** for the read-heavy sweep. The subagent reports; it never
edits. Whatever judges is not the thing that writes.

**You — this session — are the coordinator.** There is no coordinator subagent,
because coordination means asking the user questions and a subagent cannot. Route
work to a skill; delegate a sweep to a subagent when reading everything at once
would flood the conversation.

### 1. Planning / coordination

| Entry point | Use it to |
|---|---|
| `/plan-check` | Check a proposal against recorded decisions before anything is written |
| `/flow-clarify <ID>` | Walk a flow, interrogate it, drive it toward `Specified` |
| `/flow-new` | Scaffold a new flow and register it in every index |
| `/spec-audit` | Check the doc set for contradictions, drift, dangling links |
| `spec-auditor` | Read-only consistency sweep behind `/spec-audit` |

### 2. Architecture / security

| Entry point | Use it to |
|---|---|
| `/architecture` | Derive architecture docs and ADRs; security and reliability review |
| `architect` | Read-only structural and security review; drafts ADR text, ratifies nothing |

### 3. QA

| Entry point | Use it to |
|---|---|
| `/qa` | Write, maintain, and run tests; decision-to-test traceability |
| `qa-reviewer` | Read-only conformance review, error states, abuse paths |

### Routing

| The request is about... | Goes to |
|---|---|
| "can we do X" / a proposal that may conflict | `/plan-check` first, always |
| Behaviour inside one flow | `/flow-clarify <ID>` |
| A job not yet written down | `/flow-new` |
| Structure, security, reliability, tech choice | `/architecture` |
| Whether code matches the spec; tests; edge cases | `/qa` |
| Consistency of the whole set | `/spec-audit` |

`/plan-check` comes first when a proposal might contradict something recorded.
Finding the conflict before the writing is the cheap moment to find it.

## Gates against confident wrong answers

These apply to every agent and every session. They exist because a plausible
invention is more expensive here than a gap: gaps get noticed, inventions get built.

- **Cite or drop it.** Every finding, conflict, or conformance claim carries a
  `path:line` or a decision number. Uncitable means unverified — report it as a
  suspicion in those words, or not at all.
- **"Not specified" is a real answer**, and during the requirements phase it is
  usually the right one. Record the open question; never fill the gap.
- **Separate what is written, what you infer, and what you recommend.** Never let a
  recommendation read as a recorded decision. Unratified proposals are marked
  `_Status: recommended, not yet ratified._`
- **Propose, don't ratify.** ADRs land at `Status: Proposed`. A human moves them to
  `Accepted`.
- **Deterministic checks before model judgement.** `python scripts/check_docs.py`
  answers the mechanical questions; do not re-derive its output by hand.
- **Read the file, don't recall it.** Re-read decision tables before citing them,
  even if they appeared earlier in the conversation.
- **Report outcomes as they happened.** Failing tests are reported failing, with the
  output. Never infer a pass from reading code.

## Before pushing

```bash
python scripts/check_docs.py
```

Deterministic gate -- status drift across the three index locations, renumbered
decisions, unresolved citations, dead links. CI runs the same script on every pull
request. Then run `/spec-audit` for the judgement checks the script cannot make.

## Git

Branch per flow; `main` is the integration branch. Because each flow is its own
file, two people can hold two flows open indefinitely without merging pain.
Commit messages name the artifact: `E-05: resolve payment method decisions`.

Full workflow in [CONTRIBUTING.md](CONTRIBUTING.md).
