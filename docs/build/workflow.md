# Wax Works — the build workflow

**Status:** Ratified 2026-09-17 (files for work orders; a path hook on the developer subagent; developer as both skill and subagent)
**Owners:** sr-talbot, WaxyWaxman

How a `Specified` flow becomes reliable code once we are past the prototype. It
reuses what the documents already do — append-only decisions, the [end-to-end
register](../qa/e2e-register.md), `check_docs.py`, and the rule that whatever
judges is not the thing that writes — and adds one role, one artifact, and one
deterministic gate.

Two tracks after M0, as [architecture](../architecture.md) §8 says: **D** (the
database) and **U** (the screens), meeting at `packages/contracts`. Per flow per
milestone, the unit of work is a **work order** — a file, not a conversation —
that carries the requirement checklist in and the evidence out. The developer
never writes its own checklist and never judges its own evidence.

```
                 human approves                       human merges
                      │                                    │
 spec ──► /work-order ─► developer ─► CI gates ─► reviewers ─► coordinator ─► /qa ready ─► e2e
 (Specified)   │            │            │           │              │
         checklist      evidence     coverage    findings      verdict per item
         derived from   per item,    script:     cite a        Done / Deferred /
         decisions,     test-first   nothing     decision,     Blocked / N-A —
         not by dev                  unaccounted run tests     never blank
```

---

## 1. Roles and what each may write

| Role | Entry point | Writes | Never writes | Enforced by |
|---|---|---|---|---|
| **Coordinator** | the main session | [`docs/build/status.md`](status.md); the Scope, Checklist and Verdict sections of a work order; routes | code, tests, decisions | convention |
| **Planning** | `/plan-check`, `/flow-clarify`, `/flow-new`, `/spec-audit` + `spec-auditor` | `docs/flows/`, `docs/PRD.md`, `docs/lexicon.md` | code | existing |
| **Architect** | `/architecture` + `architect` (read-only) | `docs/architecture.md` | code | existing |
| **Developer** | `/develop <order>` (interactive) and the `developer` subagent (runs one order to completion in its own worktree and reports back) | **D:** `supabase/`, `packages/db-types/`; **U:** `apps/web/`; the unit and integration tests for its track; the Evidence section of its work order | `docs/flows/`, `docs/architecture.md`, `docs/PRD.md`, `docs/lexicon.md`, `docs/qa/`, `docs/prototype.md`, `.claude/`, `.github/`, `scripts/check_*.py`; `packages/contracts/` except through a contract pull request both humans review | `tools:` on the subagent, and a `PreToolUse` hook (`scripts/hooks/developer_paths.py`) that refuses an Edit, Write, or write-shaped Bash command on those paths. The interactive skill is bound by convention only — a human is at the keyboard |
| **QA** | `/qa` + `qa-reviewer` (read-only; runs tests) | `e2e/`, `docs/qa/` | product code | existing |

Two rules keep the hand-offs clean. **A reviewer receives the work order and the
diff, never the developer's narrative** — so it cannot anchor on a claimed
completion. And **every hand-off is a file with a fixed shape**, so a missing
section is visible rather than forgotten.

---

## 2. The work order

`docs/build/orders/<ID>-<track>-M<n>.md`, from
[`docs/templates/work-order-template.md`](../templates/work-order-template.md).
Created by `/work-order <ID> <track>` from the spec, **before any code**.

| Section | Written by | Content |
|---|---|---|
| **Scope** | coordinator | Flow, milestone, track, the contract entries it implements, the pull request once one exists |
| **Checklist** | coordinator, derived | One row per live decision the flow and its *Inherited from other flows* section bind to this track, plus every A-n that constrains it (A-4 definer functions, A-5 tenancy, A-15/A-47 money, A-28 flags, …). Each row: the decision → the evidence required — `unit`, `integration`, or `manual` with the reason a test cannot hold it |
| **Register rows** | coordinator | The [register](../qa/e2e-register.md) rows this order must make automatable |
| **Evidence** | developer | Per checklist row, exactly one of: **`Done`** — test name, `file:line`, and the run output quoted; **`Deferred`** — why, who owns it, and where it is recorded (a `Blocked` register row, or an open question); **`Blocked`** — the open question, routed to the flow that owns it; **`N/A`** — why this decision does not bind this track. **A blank cell fails the gate** |
| **Findings** | reviewers | Per finding: the decision cited, `file:line`, severity; the developer marks each `fixed` or `disputed`, never deletes one |
| **Verdict** | coordinator | `Accepted` or `Returned`, and the **Needs a human** list |

A human approves the Checklist before development starts. **That approval is the
moment scope is fixed**: a decision missing from the list is a coordinator error
you can see in the diff, not a developer omission you cannot.

---

## 3. The gates, in order

1. **Deterministic, in CI** — typecheck, lint, the unit suites (vitest; pgTAP),
   `python scripts/check_docs.py`, and **`python scripts/check_coverage.py --order <file>`**:
   for every decision on the order's Checklist, grep the test trees for
   `<ID> d<n>` or `<ID> decision <n>`; **fail if any row is unaccounted for** — no
   test named for it and no `Deferred` / `Blocked` / `N/A` in its Evidence cell.
2. **`qa-reviewer`** — conformance per Checklist row, citing decisions; **it runs
   the suites itself** and quotes the output. Unaccounted rows are reported first.
3. **`architect`** — the diff against A-4, A-5, A-15/A-47, A-28/A-28a: RLS on
   every table, no client writes, integer money, a flag written on every path
   with an actor, manager-only still gated. A security finding blocks.
4. **`/code-review`** — quality only.
5. **The developer fixes**; reviewers re-check the findings only, not the whole
   order.
6. **A human merges.** Agents open pull requests; they never merge one.
7. When both tracks' orders for a milestone are `Accepted`, the coordinator writes
   the row in [`status.md`](status.md) — the pull requests and the contract
   commit — and `/qa ready <milestone>` becomes answerable. Then `/qa automate`
   per register row, and the register's product column moves.

---

## 4. Human gates

These are the moments where an agent stops and a person decides. Every agent
report ends with a **Needs a human** section in this shape — the question, the
options, the flow that owns it — and the coordinator collects them into the
order's Verdict.

| Gate | Who | What they are deciding |
|---|---|---|
| Work-order approval | either owner | That the Checklist is the whole scope |
| Contract pull request | **both** owners | A change to `packages/contracts` — the only coordination ritual §7 imposes |
| Supersession | either owner | A decision an order found wrong — via `/plan-check`, never by the developer editing the flow |
| Open question | either owner | A step whose outcome the spec does not state — the order's row is `Blocked` until answered |
| Merge | either owner | The pull request, with the order's Verdict `Accepted` |
| A-n ratification | either owner | Anything `/architecture` drafted while the order ran |

---

## 5. The five risks, and where each is caught

| Risk | Mitigation | Where it bites |
|---|---|---|
| **Hallucinated completion** | Test-first — a failing test named for the decision exists before the code; evidence per row with the run output quoted; the reviewer re-runs everything; `check_coverage.py` fails the build on an unaccounted decision; the reviewer never sees the narrative | Gates 1–2 |
| **Unclear hand-offs** | Every hand-off is a file with a fixed shape; the roles table; subagent `tools:` and the path hook | §1, §2 |
| **No independent check** | Three reviewers, none of which wrote the code; deterministic checks before model judgement; findings cite `file:line` and a decision, or are labelled opinion | Gates 2–4 |
| **Dropped requirements** | The Checklist is derived from the spec by the coordinator, not the developer; four exhaustive terminal states, blank fails; `Deferred` must name an owner and be written into the register as `Blocked` so it survives the pull request | §2, gate 1 |
| **Decisions made by the wrong party** | Fixed human gates; **Needs a human** on every report; agents propose and nobody ratifies | §4 |

---

## 6. Milestone rhythm

```
M0  contracts skeleton (joint, human-reviewed)
    └─ per milestone Mn, per flow in it:
         /work-order <ID> D    /work-order <ID> U      ← coordinator, human approves
         developer (D)         developer (U)           ← test-first, evidence per row
         gates 1–5             gates 1–5               ← CI, qa-reviewer, architect
         human merges          human merges
         └─────────── both Accepted ───────────┘
                          status.md row
                          /qa ready Mn  →  /qa automate  →  register product column
```

The prototype is outside this loop. It is walked, not built against
([`/qa walk`](../../.claude/skills/qa/SKILL.md)); nothing in the register's
prototype column gates a milestone.

---

## Open questions

- **Where `e2e/` lives** and whether `docs/build/orders/` needs an index —
  neither is in [architecture](../architecture.md) §7. Owner: `/architecture`.
- **Which suites run in CI at M0.** §8 names pgTAP and CI as M0 deliverables
  without saying whether vitest for `apps/web`, the coverage script, and
  Playwright are wired at M0 or arrive with the first order that needs them.
  Owner: `/architecture`.
- **The interactive `/develop` skill has no path hook.** A hook in
  `settings.json` would bind the whole session, coordinator included. Accepted
  for now because a human is at the keyboard; revisit if an order is ever run
  interactively without one. Owner: the user.
