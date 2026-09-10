# Working on Wax Works

Two people, ten flow documents, one shared agent configuration. This is how the
local-to-GitHub loop works.

## Setup

```bash
git clone https://github.com/WaxyWaxman/WaxWorks.git
cd WaxWorks
```

That is the whole setup. The planning agent is **in the repository**, not in
anyone's personal configuration:

| Path | What the clone gets you |
|---|---|
| `.claude/skills/` | `/plan-check`, `/flow-clarify`, `/flow-new`, `/architecture`, `/qa`, `/spec-audit` |
| `.claude/agents/` | `spec-auditor`, `architect`, `qa-reviewer` — read-only sweeps |
| `.claude/settings.json` | Shared permissions, so neither of us re-approves the same tools |
| `CLAUDE.md` | The conventions, loaded into every session automatically |

Open Claude Code in the repo root and the skills are available immediately. Both
of us get identical agent behaviour because it is version-controlled alongside the
documents it operates on — a change to how the agent works is reviewed like any
other change.

Anything you want configured for yourself alone (personal permissions, model
choice) goes in `.claude/settings.local.json`, which is gitignored.

Tracking the agent configuration rather than keeping it per-machine is a recorded
decision — [architecture.md](docs/architecture.md) §2.7, **A-31**.

## The loop

```bash
git switch main && git pull
git switch -c e05-payment          # one branch per flow
```

Then, in Claude Code:

```
/flow-clarify E-05
```

Work through it conversationally. The skill writes to the flow file as decisions
land, so you can stop at any point and keep what was settled.

Before pushing, merge `main` first, then check the merged result:

```bash
git fetch origin && git merge origin/main
python scripts/check_docs.py
```

and in Claude Code:

```
/spec-audit
```

The order matters. Running the checks before merging `main` tells you your branch is
fine in isolation, which is not the question — the question is whether the merged
result is coherent. Conflicts land in `docs/PRD.md`, `docs/README.md`, and any flow
receiving an inherited commitment; they are table rows and resolve in seconds.

The script catches the mechanical breakage — status drift across the three index
locations, decision numbers renumbered, citations that no longer resolve, dead
links. `/spec-audit` catches what needs judgement: two flows asserting
incompatible things, or a commitment that was decided in one flow and never
written into the flow it binds.

Then:

```bash
git add -A && git commit -m "E-05: resolve payment method decisions"
git push -u origin e05-payment
gh pr create
```

CI re-runs `check_docs.py` on the pull request. It does not run the model —
there is no API key in CI, and the judgement half of the audit is yours to run
locally before you open the PR.

## Why branch per flow

One file per flow means two people can hold two flows open indefinitely without
merge pain. The files that *do* collide are the three shared ones — `docs/PRD.md`,
`docs/README.md`, and any flow receiving an inherited commitment. Those conflicts
are small and in tables, so they resolve by hand in seconds. Pull `main` before
starting a flow and the collisions stay rare.

## Rules that the tooling enforces

`scripts/check_docs.py` will fail the build on these, so they are worth knowing:

- **Never renumber or delete a decision row.** "E-02 decision 8" is a permanent
  address. Supersede in prose; append the correction as a new row.
- **Status lives in three places** — the flow file, `docs/README.md`, and
  `docs/PRD.md` §3 — and they must agree.
- **Flow IDs and filenames are stable.** `<ID>-<kebab-slug>.md`, verb-led.
- **Links resolve.** Including into flows that are still stubs.

## Rules that only a human or `/spec-audit` catches

- A cross-flow commitment written in the deciding flow but not propagated to the
  flow it binds. This is the most common real defect.
- Two documents asserting incompatible rules about pricing, permissions,
  immutability, or store scoping.
- A flow marked `Specified` that has not earned it.
- **A decision superseded on one branch and cited as live on another.** The merge is
  textually clean and `check_docs.py` passes, because the superseded row still
  exists — that is what makes decisions permanently citable. Only reading catches
  it. Say so in the PR description whenever you supersede something.
- Requirements invented rather than decided. If it did not come from the docs or
  from one of us, it is an open question — and recording a sharp open question is
  a successful outcome here, not a failure.
