---
name: qa
description: Write, maintain, and run tests against the WaxWorks specs, keep the end-to-end register, and check that implemented code matches what was decided. Use when the user asks about testing, test coverage, end-to-end or Playwright tests, whether the code or the prototype matches the spec, error handling, edge cases, or mobile/counter usability of a flow. Modes — register, walk, automate, run, stale, ready — are described inside.
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

## Modes

`/qa` with no argument reviews an implementation (§5). With an argument it does
one of these; each is a procedure below.

| Invocation | Does | Writes to |
|---|---|---|
| `/qa register <ID>` | Derive end-to-end rows for a flow from its numbered steps | `docs/qa/e2e-register.md` |
| `/qa walk <ID>` or `<row>` | Drive the target by hand with `playwright-cli`, file divergences | register (`Walked`), findings to the user |
| `/qa automate <row>` | Write the `@playwright/test` spec for a row, once the gate passes | `e2e/`, register (`Automated`) |
| `/qa run [<ID> \| <row>]` | Run the suite, or one flow's, or one row's, and report as it came out | nothing but the report |
| `/qa stale <decision>` | Mark every row asserting a superseded decision `Stale` | register |
| `/qa ready <ID> \| <milestone>` | Check the automate gate and say what is missing | nothing — a verdict |

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

| Level | Holds | Example | Tracked in |
|---|---|---|---|
| **Unit** | A rule with a worked example in the spec | A pricing or rounding rule with numbers attached | Test names (§1) |
| **Integration** | A phase of a flow across components | Scan → resolve barcode → catalog provider → price | Test names (§1) |
| **End-to-end** | A whole flow as the actor performs it | Open invoice → scan five items → reconcile → finalise | [`docs/qa/e2e-register.md`](../../../docs/qa/e2e-register.md) (§6) |

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
| A `Specified` flow has no register rows, or a row's decision is superseded | `/qa register` / `/qa stale` |
| Spec never made the choice | `/flow-clarify <ID>` — do not invent the requirement |
| Structural or security concern | `/architecture` |
| A cited decision turns out superseded | Re-read `architecture.md` §9; the finding is void |

## 6. The end-to-end register

[`docs/qa/e2e-register.md`](../../../docs/qa/e2e-register.md) is the running list
of end-to-end scenarios for the current designs — one row per whole-flow scenario,
derived from a flow's numbered steps, asserting numbered decisions, tracked against
two targets (the prototype and the product) with a status each. Its conventions are
at its head; the ones that bite are:

- **Row IDs are append-only**, `<FLOW>-T<n>`. Retire by striking through, as with
  a decision. Never renumber.
- **Cite decisions in long form** (`E-05 decision 23`) so `check_docs.py` verifies
  them. A row citing nothing asserts nothing — say so in the row, and route the gap
  to `/flow-clarify`.
- **`Needs` is honest.** Name the seed the row starts from. If it does not exist,
  say that; do not write a fixture that invents domain data.

### `/qa register <ID>`

1. Read the flow in full, and `architecture.md` §9 for what amended it. Only a
   `Specified` flow gets rows.
2. Derive rows: the happy path first, then one row per named failure or abuse path
   in the flow (§3), then any layout decision the flow records (§4). Every row cites
   steps and decisions. Where a step's outcome is not written, that is a `Blocked`
   row naming the open question, not a guessed assertion.
3. Append the rows under the flow's heading, `Planned` for each target that models
   it, `—` for one that does not. Add the rows to the milestone view.
4. Run `python scripts/check_docs.py`.

## 7. Playwright — two CLIs, two jobs

Two tools, deliberately distinct. One explores; one holds.

| Tool | Package | Job |
|---|---|---|
| `playwright-cli` | `@playwright/cli` | **Walk** a flow by hand against the running target: open, snapshot, act, record. Token-frugal — it returns refs, not the page. |
| `npx playwright test` | `@playwright/test` | **Hold** a row: a spec file, run headless, in CI, with a trace on failure. |

Install: `npm install -g @playwright/cli@latest` for the first; the second lives in
`e2e/package.json` once the suite's location is ratified (register §"Where the
suite lives"). `playwright-cli install --skills` can drop its own skill files into
the agent configuration — that configuration is version-controlled (A-31), so check
where it writes before committing anything it produces.

The target is whatever `PLAYWRIGHT_BASE_URL` names — the prototype
(`npm --prefix prototype run dev`, port 5273, per `.claude/launch.json`) today,
`apps/web` once it exists. **A walk of the prototype says nothing about the
product**; the register tracks them separately.

### `/qa walk <ID>` or `/qa walk <row>`

Drive the row's steps as the actor would, and write down where the target
disagrees with the flow.

```bash
playwright-cli open http://localhost:5273/receiving
playwright-cli recording-start
playwright-cli snapshot                       # refs for what is on screen
playwright-cli click <ref>                    # act by ref, never by guessed selector
playwright-cli fill <ref> "SH-260911-1"
playwright-cli screenshot                     # at every divergence, before moving on
playwright-cli recording-stop                 # keep the generated code with the findings
```

Rules of the walk:

- **The flow's step is the oracle**, not the screen. At each step, state what the
  step says happens, then what the target did. A difference is a finding citing
  `path:line` of the step and the decision it rests on — "E-05 step 6 says a `0.00`
  price prompts at the till; the prototype added the line at `0.00`."
- **A difference where the flow is silent is not a finding.** It is an open
  question for `/flow-clarify <ID>` — the prototype made a choice the spec never
  made. Record the question; do not judge the target against a rule you inferred.
- **Do not fix the target during a walk.** Whatever judges is not the thing that
  writes. Findings go to the user; a prototype fix is a separate change that cites
  the decision it restores.
- On finishing, set the row's column for that target to `Walked`, note where the
  recording went, and report the findings ordered by consequence.

### `/qa automate <row>`

Only after `/qa ready` passes for the row (§8). Then:

- One spec per row, named for it: `e2e/E-05/E-05-T1.spec.ts`. The test title is
  the row's scenario name; each `expect` carries the decision it asserts in a
  comment or the step title, so `grep "decision 23"` finds it.
- Start from the walk's recording; replace its selectors with **role and label
  locators** (`getByRole`, `getByLabel`), because the prototype's UI copy is what
  the product harvests (`prototype.md` §"Why it exists") and role-based locators
  are what survives the move. No CSS-path selectors; no `waitForTimeout`.
- Seed through a fixture named for the row's `Needs` entry, in `e2e/fixtures/`.
  A fixture creates state through the same surface the actor uses, or through the
  seed the architecture names (`supabase/seed.sql`) — never by writing tables
  directly, which A-4 forbids the client.
- Assert the record where the design is permissive: a row that says "proceeds and
  raises a review flag" asserts the flag row exists with an attributable actor, not
  merely that the action succeeded.
- Set the row `Automated` for that target, fill `Spec`, and commit the spec in the
  same change as the register row.

### `/qa run`

```bash
npx playwright test                            # everything
npx playwright test e2e/E-05                   # one flow
npx playwright test --grep "E-05-T7"           # one row
npx playwright test --list                     # what would run — compare against the register's Automated rows
npx playwright test --trace on                 # when something fails
npx playwright show-report
```

Report the run **as it came out**. A failing row names the decision now unmet. A
row the register calls `Automated` that `--list` does not show is register drift —
report it, and set the row back to `Planned` or `Stale` with a note saying why.

## 8. The gate — when a row may move, and who calls QA

QA is triggered by events in the other skills, not by the calendar. The
coordinator (the main session) watches for these and routes; the full table is
in `CLAUDE.md` §"When QA is called". The gate for each transition:

| Transition | Requires |
|---|---|
| → `Planned` | The flow is `Specified`, in all three status locations. |
| → `Walked` | The target has a screen for the flow — for the prototype, a row in `docs/prototype.md`'s flow ↔ screen map; for the product, the milestone's **U** row in `architecture.md` §8 merged. |
| → `Automated` | Everything below passes (`/qa ready`). |
| → `Stale` | A decision the row cites was superseded (`/plan-check` supersession, or an A-n in §9), or a contract in `packages/contracts` that the row calls changed. |

### `/qa ready <row>` or `/qa ready <milestone>`

Answer each with a citation or a "no"; one "no" is `Blocked`, and the report names
it. Reuse `/plan-check`'s verdict vocabulary — consistent, conflicts, blocked.

1. **Specified.** The flow's `Status:` line, `docs/README.md`, and `PRD.md` §3
   agree on `Specified`.
2. **Live.** No decision the row cites is struck through, and none is amended in
   `architecture.md` §9 in a way the row does not reflect. `/qa stale` has been run
   for anything superseded since the row was written.
3. **Both tracks landed.** For the product: the `architecture.md` §8 milestone rows
   for **D** and **U** that cover this flow are merged to `main` — name the pull
   requests. End-to-end runs against the real database function behind the real
   screen, so one track alone is not "development complete"; a screen against the
   in-memory fake is an integration test, not this.
4. **Contract stable.** The `packages/contracts` entries the row exercises have not
   changed since those pull requests merged.
5. **Seed exists.** Every `Needs` entry has a fixture, or the seed the architecture
   names contains it.
6. **Nothing blocking.** No open question in the flow stops a step in the row from
   being stated.

For the prototype, 3 and 4 collapse to "the screen exists in the map" — the
prototype has no contracts and its store is in memory.

For a milestone, run the check for every row the register's milestone view lists
against it. M6 (hardening) is the milestone whose deliverable is this register's
product column reading `Automated` for every v1 row.

### When QA calls back

| QA finds | Route |
|---|---|
| The target disagrees with a live decision | The user — a fix to the target, citing the decision, or a supersession via `/plan-check` |
| The target does something the spec never decided | `/flow-clarify <ID>` |
| A row cannot be stated because a step's outcome is unwritten | `/flow-clarify <ID>`; row is `Blocked` |
| A fixture would need data no decision describes | `/architecture` (seed) or `/flow-clarify` (domain) |
| Where the suite lives, what it runs on, what viewport | `/architecture` — the register's open questions |

## Reporting

Report test results as they actually are. If tests fail, show the output and say
which decision is now unmet. If you could not run the suite, say that — never infer
a pass from reading the code. A red suite reported accurately is worth more than a
green one asserted.

Every register change is reported by row ID and transition ("E-05-T7: Planned →
Walked, prototype; two findings"), so the pull request can list it.
