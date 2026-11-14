# Wax Works — the build plan

**Maintained by:** the coordinator, at the end of every build session. Read first by whoever picks up next.
**Last updated:** 2026-11-03, sr-talbot's session — through #257; M-04 D `Accepted`; A-142 and A-143 ratified; S-01 D M1 and O-01 D M1 drafted and awaiting approval

The [workflow](workflow.md) says how an order moves; the [conventions](conventions.md)
say what the code looks like; the [status table](status.md) says what has landed.
This says **where we are, what is next, in what order, and what is waiting on a
human** — so a contributor can open the repository cold and start. Everything here
is a pointer to a file that is the record; nothing here is a decision.

---

## 1. The sequence

Architecture [§8](../architecture.md#8-build-order) fixes the milestones. The
order inside them is this, and the reasons are the three hazards of an agent
build: invented conventions, silent bugs, and context blown by reading everything.

| # | Step | Why this order |
|---|---|---|
| 1 | **M0 as a work order**, cited to A-n only, run interactively by a human | The first order sets the pattern for every later one; the joint skeleton writes `packages/contracts/` and `.github/`, which the `developer` subagent's hook refuses |
| 2 | **M0's review findings fixed and the order `Accepted`** before any M1 order is drafted | An M1 order builds on the contracts skeleton and the owner role; both are wrong today in ways the findings name |
| 3 | **M1 opens with E-01 alone** — `E-01-D-M1` and `E-01-U-M1`, two developers, to `Accepted` — then M-04, then O-01 d3. *Since A-111 (2026-10-13), M1 also carries S-01's Create Organization and O-01 d2's Create Store* | E-01 is the thin vertical slice that proves the whole loop (order → developer → CI → reviewers → merge → `/qa ready`) before a second flow depends on it |
| 4 | **Each milestone opens with a contract pull request** both humans review: the schemas and the fake's behaviour for that milestone's functions (A-99) | The signatures exist since M0; the schemas are written against the specification that ships with the milestone, not guessed earlier |
| 5 | **Never two orders on one flow in one track.** One developer worktree per order, fresh context each time | The unit of work is already small; the failure is two agents editing one lane |
| 6 | `resolve_scan` and `review_flags` land early behind their contracts (§8's dependency note) | M3 and M4 both need them |
| 7 | **`/qa ready Mn`** only when both tracks' orders show `Accepted` in [status.md](status.md) | One track alone is an integration test against the fake |

---

## 2. Where we are — 2026-11-08

**E-01 D is `Accepted`** (sr-talbot, 2026-10-31, verdict in #231). **M-04 D is `Accepted`**
(sr-talbot, 2026-11-03, verdict in #255): built in #237, corrected in #241 (pass 1), #248
(pass 2), #251 (pass 3) and #254 (pass 4), each pass reviewed by qa-reviewer, architect and
`/code-review` — 74 findings, finding 1 `discharged` by A-137, nothing blocking open; the
Verdict's carried-forward table names an owner for each of the rest (the Windows race
harness → the next `tests/auth` order; two structural assertions → the next `0032`/`0033`
order; d60 and T33 → the **U** order; a PIN history → M-04's open question). Pass 4
merged before its verdict, as every pass has; the verdict followed within the hour.
The identity function set is built and tested: the ten user functions, the shared
header and re-check in `app_internal`, `user_pins.set_by`, M-04 d50–d62 and A-137–A-141
with a reading note. **Nothing on the U track exists beyond M0's shell.** Read the rows,
not this list.

| PR | What it did |
|---|---|
| [#231](https://github.com/WaxyWaxman/WaxWorks/pull/231) | **E-01 D `Accepted`** — the final check's findings 46–54; rows 27 and 31 amended. The Verdict's *carried forward* table names what moved to M-04 D, S-01 D and the runbook |
| [#233](https://github.com/WaxyWaxman/WaxWorks/pull/233) | **A-135, A-136** — `organizations.id` is its tenant key; `drawer_opens` waits for the print agent. Two §4 schema rows closed |
| [#234](https://github.com/WaxyWaxman/WaxWorks/pull/234) | GimpyMatey is the second owner; WaxyWaxman's role stays a §4 question |
| [#235](https://github.com/WaxyWaxman/WaxWorks/pull/235) | **The M1 contract pull request** (`5ea9522`) — E-01 d38–d39 and M-04 d48 in the fake; `linked`, `auth_user_in_use`; `invalid_input` and `read_only` refusals |
| [#236](https://github.com/WaxyWaxman/WaxWorks/pull/236), [#237](https://github.com/WaxyWaxman/WaxWorks/pull/237) | [`M-04-D-M1`](orders/M-04-D-M1.md) drafted and approved (39 rows), then **built**: the ten user functions, the shared PIN resolution, their tests. Merged with findings open |
| [#238](https://github.com/WaxyWaxman/WaxWorks/pull/238) | **A-137, A-138** — `delete` on `store_assignments` and `user_pins` only; one lock order for the identity functions |
| [#239](https://github.com/WaxyWaxman/WaxWorks/pull/239), [#240](https://github.com/WaxyWaxman/WaxWorks/pull/240) | **M-04 d50–d54, E-01 d40, A-139** (`app_internal`) — the review's open questions answered; then the fake brought to them |
| [#241](https://github.com/WaxyWaxman/WaxWorks/pull/241) | **Rework pass 1** — A-138's lock order, A-139's schema, d50–d54, E-01 d40; rows 40–48 |
| [#242](https://github.com/WaxyWaxman/WaxWorks/pull/242), [#243](https://github.com/WaxyWaxman/WaxWorks/pull/243) | **M-04 d55** (a Manager-set PIN does not carry into Owner standing); **A-140** (the authoriser re-checked after the last lock) |
| [#244](https://github.com/WaxyWaxman/WaxWorks/pull/244)–[#246](https://github.com/WaxyWaxman/WaxWorks/pull/246) | Finding 1 discharged; d56–d58; `app_internal` in conventions; pass 2 approved — rows 49–54 |
| [#247](https://github.com/WaxyWaxman/WaxWorks/pull/247), [#248](https://github.com/WaxyWaxman/WaxWorks/pull/248) | **M-04 d59, d60**; **rework pass 2 built** — `user_pins.set_by`, the shared header in `app_internal`, the two-session race harness; findings 37–49 and their answers |
| [#249](https://github.com/WaxyWaxman/WaxWorks/pull/249), [#250](https://github.com/WaxyWaxman/WaxWorks/pull/250) | **M-04 d61** (the new PIN at a promotion into Owner must differ from the held one); **pass 3 approved** — rows 55, 56; register rows M-04-T29–T33, T16/T20/T22/T27 `Stale`; then d61 in the fake |
| [#251](https://github.com/WaxyWaxman/WaxWorks/pull/251) | **Rework pass 3 built** — `authoriser_recheck` returns the role it read; the four PIN writers record it (d59); `user_change_role` refuses an equal PIN (d61); `user_correct` re-checks before its initials loop; the race harness hardened (finding 39); the backfill test (finding 45). Reviewers' runs: pgTAP 842, `test:auth` 40 ×7, `pnpm test` 564 |
| [#252](https://github.com/WaxyWaxman/WaxWorks/pull/252), [#253](https://github.com/WaxyWaxman/WaxWorks/pull/253) | Pass-3 findings 50–62; **M-04 d62** (Set PIN refuses the same digits over a Manager-set PIN, by an Owner or the holder); **A-141** (the re-check's place among the checks); pass 4 approved — rows 57, 58; then d62 in the fake |
| [#254](https://github.com/WaxyWaxman/WaxWorks/pull/254) | **Rework pass 4 built** — `user_set_pin` replaced for d62; A-141's structural tests; findings 50, 52, 53, 57–61 fixed, 60 disputed. Reviewers' runs: pgTAP 863, `pnpm test` 566, `test:auth` 43 in 8 of 10 Windows runs (finding 63); CI green. Findings 63–74 |
| [#255](https://github.com/WaxyWaxman/WaxWorks/pull/255) | **M-04 D `Accepted`** — the Verdict and its carried-forward table; A-141's reading note (findings 64, 65); d62's accepted consequence and a PIN-history open question (66, 67) |
| [#256](https://github.com/WaxyWaxman/WaxWorks/pull/256)–[#261](https://github.com/WaxyWaxman/WaxWorks/pull/261) | **A-142, A-143**; the Store ID in the fake; [`S-01-D-M1`](orders/S-01-D-M1.md) and [`O-01-D-M1`](orders/O-01-D-M1.md) drafted; S-01 D approved with **S-01 d8, d9**, then those in the fake (`ce1e723`) and recorded in the order |
| [#262](https://github.com/WaxyWaxman/WaxWorks/pull/262), [#263](https://github.com/WaxyWaxman/WaxWorks/pull/263) | **S-01 D built** — `organization_create`, `owner_recover`, `owner_reset_request`, `In review`; then findings 1–15 from qa-reviewer, architect and `/code-review` — nothing blocking; six human decisions raised |
| [#264](https://github.com/WaxyWaxman/WaxWorks/pull/264) | **The review's decisions** — A-144 ratified; **A-145** (the seed under sysadmin claims), **A-146** (`owner_recover` replaces an unreachable active Owner; supersedes A-90's refusal), **A-147** (a System Administrator enrols by Supabase's invite; several passkeys; no recovery); **S-01 d10–d14, M-04 d63, E-01 d41**; conventions §5's keys for finding 4; S-01-T1/T3 `Stale`, T4/T5 registered; **pass 2 approved** (rows 27–33) |
| [#265](https://github.com/WaxyWaxman/WaxWorks/pull/265) | **The contract change for pass 2** (`163d9a6`) — `owner_recover` takes `p_replace_user_id` (A-146); clashing initials and PIN cleared at a reactivation (S-01 d10); `invite_sent` on the person (d14) |
| [#267](https://github.com/WaxyWaxman/WaxWorks/pull/267) | **Pass 2 built and reviewed** — the correcting migration for the three **S** functions, `0043`, the S-01 race; qa-reviewer's runs: pgTAP 1066, `test:auth` 59 ×2, `pnpm test` 571; findings 16–35, nothing blocking. **A-148** (a deactivation closes the enrolment window), **A-149** (E-01 d41 is the shell's, the E-01 **U** order), **S-01 d15** (no new Owner at the replaced Owner's address); finding 20 kept as built; **pass 3 approved** (rows 34–37) |
| [#268](https://github.com/WaxyWaxman/WaxWorks/pull/268)–[#271](https://github.com/WaxyWaxman/WaxWorks/pull/271) | The pass-2 decisions recorded; S-01 d15 in the fake (`b16cc99`); **pass 3 built and reviewed** — S-01 d15, A-148 in `owner_recover` and `user_deactivate`, `owner_recover`'s argument order; qa-reviewer's runs: pgTAP 1099, `test:auth` 60 ×2, `pnpm test` 571; findings 36–51, nothing blocking. **A-150** (a demotion to Employee closes the window); the contract tightens `owner_recover`'s shapes (#272); fourteen register rows `Stale`; **pass 4 approved** (rows 38–40) |

**What M1's D track still needs:** **S-01 D M1 pass 4** (rows 38–40, against the contract at `1009b86`, #272) built and reviewed, then `/work-order accept`; **O-01 D M1** approved and built (drafted, #258; A-142's columns are its row 11); then the seed order (A-145 — `organization_create` under the fabricated System Administrator's claims). Then E-01 U M1 and M-04 U M1 against the fake at `0c1c173`, carrying
M-04 d60's screen half, the two refusals' text at d61/d62 (*a different PIN*), and the
Windows harness item from M-04 D's verdict. `/qa ready M1` once both tracks' rows show
in `status.md`.

**Production** is unchanged since 2026-10-13: M0's two migrations, never seeded, no
hook, no pepper, no System Administrators. **M1's migrations have not been pushed**,
and must not be until §4's *blocks deployment* rows are clear.

**Decided since 2026-10-30 and ratified by sr-talbot alone:** A-122 to A-140, E-01
d38–d40, M-04 d50–d61, the `invalid_input` = `22023` and `read_only` = `25006` notes in
conventions §5, the A-91 amendment. Joint assent is pending on all of them (§4).

**What runs today**, from a clean clone (tooling in §5): `pnpm test` → 536;
`supabase test db` → 815 across 19 files (the M-04 D order's pass-2 run G2); `pnpm test:auth`
→ 34 plus the M-04 race harness, which has flaked once (order finding 39) — (needs
`supabase start` and Chromium via `playwright install`). **Run `test:auth` with the
agent environment removed too** — `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT pnpm test:auth` —
because the Supabase CLI's JSON differs under an agent and CI sees the second form;
#221 went red on exactly that while three agent-run local passes were green.

**Do not stack pull requests, and gate the push on the state.** #225 merged while
the re-review ran; the commit pushed to it afterwards went nowhere (recovered as
#226). `gh pr view N --json state -q .state && git push` prints `MERGED` and pushes
anyway — use `[ "$(gh pr view N --json state -q .state)" = OPEN ] && git push`.

**Merge after the verdict.** #221 and #225 join #176, #197, #200 and #204 — six
pull requests merged before `/work-order check` finished. Branch protection remains
the owners' call.

---

## 3. The path to M4

**The aim:** reach M4 (the till) with real shop data in production as early as M1
lets us, and hold everything that is not a schema shape or a deployment blocker for
after live testing. §8 fixes what each milestone *contains*; this fixes the order
and the cut. Where this file recommends narrowing a milestone, the narrowing is
_Status: recommended, not yet ratified_ and goes through `/plan-check` before it
binds anything — §8 is the record, not this.

**The one rule that makes "quickly" safe:** a decision that changes a table's shape
is made **before the migration that creates the table**, because A-101 forbids
editing a merged migration and real data makes a reshaping migration expensive.
A decision that changes only a screen, a refusal key, a test or a runbook line can
wait. §4 sorts every open item on that line.

Ask sr-talbot before each step that writes.

### M1 — finish the onboarding slice (now)

| # | Step | Gate | Notes |
|---|---|---|---|
| 1 | ~~**Close E-01 D's review**~~ *done — `Accepted` 2026-10-31, #231.* Was: the developer fixes — the developer fixes findings 14 and 33 (tests only); `/architecture` ratifies or rejects the two drafts (System Administrator window closed by hand; PostgREST `db-tx-end` stays `commit`, with a `Prefer: tx=rollback` test); `/work-order accept` | Verdict by an owner | Nothing here touches a table |
| 2 | ~~**One contract pull request**~~ *done — #235 (`5ea9522`), then #240 and #245 for the review's decisions.* Was: both owners review: M-04 d48 in the fake; attempts while closed recorded (d38); the flag's null actor (d39); `linked` and `auth_user_in_use` in the fake; `invalid_input` and `read_only` into `REFUSALS`, `REFUSAL_DETAIL` and conventions §5's table (which `tests/contracts-m1.test.ts` holds equal); `authz.` names in the contracts' comments; the inactive-Store detail once §4 decides it | Merged after review | E-01 U branches on these keys; every M1 order cites the resulting commit |
| 3 | ~~**`M-04-D-M1`**~~ *done — `Accepted` 2026-11-03, #255, after four rework passes (#237, #241, #248, #251, #254).* Was: the Identity function set (`user_add`, `user_change_role`, `user_set_pin`, `user_reactivate`, …), **carrying A-129's guard on every PIN function and A-131's setters** on every link-sending function. Decide `drawer_opens`' writer and `organizations.org_id` (§4) **before drafting** — both are schema | Drafted, `Approved`, built, checked, `Accepted` | The order's Checklist names A-129 and A-131 by their rows |
| 4 | **`S-01-D-M1`** (`organization_create`, `owner_recover`, `owner_reset_request`) and **`O-01-D-M1`** (`store_create` with A-142's schema and the first shop's values — A-112; `store_account_reset`). *(The Owner's reset and re-send — A-114 — were built in M-04 D, rows 28 and 36.)* The schema decisions landed 2026-11-03: A-142 (the Store ID), A-143 (a System Administrator's enrolment). **S-01 D `Approved` 2026-11-03** (S-01 d8, d9 decided at approval; its contract change for the fake comes first, then the developer). **O-01 D drafted, awaiting approval** — `Blocked` rows 17–19 on M-06's values | As above | Both small; one developer each, in sequence, so neither edits the other's lane — O-01 D touches `0010`–`0033`'s Store fixtures and `tests/auth/fixtures.ts`, so S-01 D should land first or branch after it |
| 5 | **`E-01-U-M1`**, then **`M-04-U-M1`** with Create Organization and Create Store screens (A-111) | As above | The accept-invite route moves Auth links onto the product's origin (runbook) |
| 6 | **`/qa ready M1`**; `/qa automate` the rows that both tracks make automatable (E-01-T1, T10, T11, T13 at least — order finding 15 says the rest wait on M-04's half) | Both tracks in [status.md](status.md) | — |
| 7 | **Production**: [runbook](runbook.md) §2 in order — templates, email switches, link lifetime, `supabase db push`, hook on, `pin_pepper`, three System Administrators with passkeys, the first Organization and Store through the product | Every §4 *blocks deployment* row clear | **Live testing starts here**, with the onboarding slice alone |

### M2 — catalog and scan

Tables, `resolve_scan`, barcode minting, the MusicBrainz adapter, the configuration
tables A-53 placed here, the starter chart (A-79). **Schema decisions due before the
D order:** Records and genres — Organization or Store (§4); the `release_cache`
shape stands (§11) unless an owner reopens it. **Candidate for after live testing**
— _recommended, not yet ratified_: the coverage check against real shelf stock
(§8 says *measured rather than assumed*; the trigger for switching providers can
be read once real stock is scanned). E-03 search and E-04 titlecard are the U
order; land `resolve_scan` first behind its contract — M3 and M4 both need it.

### M3 — receiving

PurchaseOrder and Invoice tables, the pricing helpers, `invoice_is_paid()` returning
`false` (A-41), `journal_batches` and `journal_lines` with `invoice_finalize`
writing its journal in the same transaction (A-67). **Schema decisions due before
the D order:** `invoice_number` and `SH-YYMMDD-n` across Stores (§4); bigint minor
units across PostgREST (M0 finding 10); the predicates' `pure` label against A-113.
~~**Candidate for after live testing:** the label print stylesheet, which the
receiving loop does not need to be exercised.~~ — **declined 2026-11-13 by GimpyMatey** ([questions for GimpyMatey](questions-for-gimpymatey.md) Q15): labels print from day one of receiving, so the stylesheet stays in M3.

### M4 — the till

Sale functions, locking, counters, the sell screen, split tender, hold and re-open,
returns with routing. **Schema decisions due before the D order:** gift card
currency across Stores (A-51); whose void and which batch (§11). ~~**Candidates for
after live testing** — _recommended, not yet ratified_, via `/plan-check` against
§8: gift cards, the customer ledger and E-07 as a whole, oversold items, the copy
picker. Each is a table group or a screen that a one-shop pilot can run without,
and each is cheaper to shape after a week of real sales than before.~~ — **declined 2026-11-13 by GimpyMatey** ([questions for GimpyMatey](questions-for-gimpymatey.md) Q16): all four are needed on the first day of selling, so M4 keeps §8's full scope.

**What this path does not do:** M5's close and receipts, M6's hardening, M7 and
M8. The cron drain's principal (§4) is therefore not on this path, but A-118 forces
it before the receipt job, so it is decided during M4 rather than after.

---

## 4. Open decisions

Three buckets. **Blocks deployment** means production cannot take real data
until it is answered. **Schema** means a table's shape depends on it, so it is
answered before the migration that creates or alters that table — the row names
which. Everything else **waits for live testing** and is listed so it is not lost,
not so it is worked now. Every row points at the record; nothing here is a decision.

### Blocks deployment

| Item | Record | Who | Due |
|---|---|---|---|
| ~~**Who is the second owner?** CLAUDE.md names WaxyWaxman; assents and verdicts this month came from GimpyMatey. Until answered, every decision since A-119 is one owner's~~ — **answered by sr-talbot, 2026-10-31: GimpyMatey.** CLAUDE.md and the documents' *Owners* lines now say so | this file | sr-talbot | — |
| **What is WaxyWaxman?** The GitHub repository's owner, and one of the three System Administrators [runbook](runbook.md) §2 creates (from A-110's landing, #190), but not an owner of the documents and with no commits. A third person, GimpyMatey's other account, or an account no one signs in as — the runbook creates a `sysadmin` passkey for it, so the answer decides whether that row stays | [runbook](runbook.md) §2 | sr-talbot | Before the first System Administrator is created |
| **Joint assent on A-119 to A-134 and every A-n after, E-01 d38–d39, M-04 d39–d49, the A-91 amendment** — each ratified by sr-talbot alone | `architecture.md` §2 rows; the flows | GimpyMatey | Before `/qa ready M1` |
| **Production's PostgREST `db-tx-end`** must be `commit` (no client override), or `Prefer: tx=rollback` reopens the PIN oracle A-129 closed. Unrecorded. Draft decision in [E-01-D-M1](orders/E-01-D-M1.md) Needs a human — _recommended, not yet ratified_ | order finding 31 | `/architecture`, then an owner reads the dashboard | Before `supabase db push` |
| ~~**A System Administrator's `enrolment_open_until` is never closed by enrolling**~~ — **A-134, ratified 2026-10-31** (cleared by hand, in the runbook); confirmed by A-143, 2026-11-03, with a one-hour window. ~~Still open: how a System Administrator obtains the link and on which page they enrol — S-01, with the E-01 **U** order~~ **Closed by A-147 / S-01 d13, 2026-11-08:** Supabase's invite, opened on the accept page; several passkeys, one window each; no recovery | order finding 30; A-131, A-134, A-143, A-147 | [runbook](runbook.md) §2 — two confirmations before the first entry | Before the first System Administrator enrols |
| **Runbook §2's hand steps**: invite and recovery templates reworded (they promise a password that no longer exists); email provider on and sign-up off; link lifetime ≤ 24 h; hook enabled; `pin_pepper` created; three System Administrators with passkeys; `store_create`'s body carries the first shop's values | [runbook](runbook.md) §2 | sr-talbot | In the runbook's order, after M1 merges |
| ~~**E-01 D `Accepted`**~~ — **done 2026-10-31, #231.** ~~**M-04 D `Accepted`**~~ — **done 2026-11-03, #255.** In their place: **S-01 D M1 and O-01 D M1 drafted** — blocked on the schema rows above (the Store ID sequence; the System Administrator's enrolment record) | [S-01](../flows/S-01-onboard-and-recover-organizations.md), [O-01](../flows/O-01-administer-the-organization.md) | `/architecture` for the schema rows, then `/work-order` | Before `/qa ready M1` |

### Schema — decide before the migration that depends on it

| Item | Record | Decides the shape of | Due before |
|---|---|---|---|
| ~~**`organizations` has no `org_id`**~~ — **answered by A-135** (the root's `id` is its tenant key; no migration) — it uses `id` as its tenant, against A-86's *every table carries `org_id`*. Already on `main`; a later change is a correcting migration against live rows | order finding 20; A-86 | every Organization-dimensioned policy written from here on | `M-04-D-M1` |
| ~~**`drawer_opens` has no §6 writer**, though §8 builds the table at M1~~ — **answered by A-136**: with the print agent | §11; M1-contracts Needs a human | whether the table lands at M1 or waits for M4's till | `M-04-D-M1` |
| ~~**The Store ID sequence**~~ — **A-142, 2026-11-03:** `stores.store_number`, one global identity sequence from 1000001; the position max + 1 under the Organization's row lock. (The `SH-…` reference carries no Store ID — A-32; its cross-Store collision stays §11's.) The fake's placeholder follows in a contract pull request | [M1-contracts](orders/M1-contracts.md) Needs a human; A-142 | `stores` | `O-01-D-M1` — unblocked |
| ~~**Where a System Administrator's passkey enrolment is recorded**~~ — **A-143, 2026-11-03:** in the runbook, nowhere in the schema; no migration | [M1-contracts](orders/M1-contracts.md) Needs a human; A-117, A-131, A-134, A-143 | none | `S-01-D-M1` — unblocked |
| **Records, genres and the genre map — Organization or Store?** Blocked by `genres.section_id` and `product_tax_code_id` referencing per-Store rows | §11 (user model) | M2's catalog tables and their policies | `M2 D` |
| **`invoice_number` and `SH-YYMMDD-n` collide across Stores** against one Organization-level Supplier — key gains `store_id`, or the minted value carries it | §11 (user model); A-17, A-22, A-32 | M3's Invoice tables | `M3 D` |
| **Bigint minor units across PostgREST** — a `bigint` arrives in JSON as a string or loses precision | M0 finding 10 | every money column's wire type, from M3's first price | `M3 D` |
| **The predicates' `pure` label against A-113's *five exceptions and no others*** | this file (2026-10-30) | the header of every M3 function | `M3 D` |
| **Gift card currency across Stores** with different home currencies | §11; A-51, M-06 d34 | M4's gift card tables — if gift cards stay in M4 | `M4 D` |
| **Whose void is it, and which batch** — A-19 attributes a tender to the lock holder; a void is a later act | §11; M-03 d26 | `sales` and the close's batch keys | `M4 D` |
| **Under what principal the cron drain runs** — A-118 forces it before the receipt job: the service-role key reads no table, `jobs` included | §11; A-92, A-118 | `jobs` and its grants | `M5 D`, decided during M4 |
| **One Auth user is one email**, so a person at two Organizations cannot be invited to the second (A-132's accepted consequence names System Administrators only) | order finding 44 | whether the uniqueness is per table or across them — a constraint already on `main` | `M-04-U-M1`, when the screen shows `auth_user_in_use` |

### Waits for live testing

| Item | Record | Why it can wait |
|---|---|---|
| **An inactive Store picked by an Owner** gets `role_refused` / `owner` — the wrong key; the closed list has no state detail for it | order finding 9; conventions §5 | A key in the contract, not a table; one pilot shop has no inactive Store |
| **A PIN or initials held twice** raise raw `P0003` — failure, not a keyed refusal, and uncounted | order finding 34 | Unreachable while M-04's uniqueness holds |
| **`no_principal` reused** for the A-130 and A-131 refusals — _recommended, not yet ratified_ | order finding 36 | A key; ratify in the contract pull request or later |
| **conventions §5's `employee` row** does not list `auth_user_link` in *Raised by* | order finding 37 | A doc line |
| **A missing PIN while the line is closed** — the code answers `pin_refused`, records nothing | E-01 d38 open question | Behaviour at an edge no screen reaches yet |
| **The hook does not set `role` explicitly** on the store, person and enrolment paths | order findings 19, 38 | Defence in depth; `auth.users.role` is `authenticated` unless changed with the service key |
| **`enrolment_open_until` unbounded; readable Org-wide by every store session; an open enrolment session outlives its window by up to an hour** | order findings 39, 45 | Observations against a one-shop pilot |
| **`print_strict_params`** would put a PIN in a `P0003` detail if ever turned on | order finding 40 | Off by default; a one-line guard whenever the function is next touched |
| **A-129's guard is inline** — M-04 D copies it; a shared `authz` assertion and a suite-wide check would hold it as A-107 holds grants | order finding 41 | Do it in `M-04-D-M1`, where the second copy appears |
| **A personal session on a device holding a store session** | E-01 d27, A-88 | Practice, not code, until observed |
| **How an Owner reads every Store's rows on the Organization screen** | O-01 d4–d5; A-86, A-95 | The screen is post-v1 (A-111 leaves only Create Store at M1) |
| **How a migration-time write is attributed** | §11; A-53 | Production is never seeded (A-109); the first Organization comes through `organization_create` — likely moot, to be confirmed, not assumed |
| **Operator alerting and health**; **the paid Supabase plan and backups**; **A-96's `staging` branch**; **Sentry's allowlist and DSN**; **A-91's key-rule CI job** | §11; A-109; A-96; A-106 | M6 hardening's list |
| **The `release_cache` shape**; **a date-range report as an issuance** | §11 | M2 and M5 respectively, neither a blocker |
| **Auto-renew on `waxworks.store`** (off; expires 2027-10-13) | runbook | A year away; one dashboard switch |
| **Feature scope**: gift cards, the customer ledger and E-07, oversold items, the copy picker (M4); the coverage check (M2); ~~the label stylesheet (M3)~~ | §8 | Candidates for deferral — _recommended, not yet ratified_, through `/plan-check`. **M4's four and M3's label stylesheet declined 2026-11-13 by GimpyMatey** ([questions for GimpyMatey](questions-for-gimpymatey.md) Q15, Q16) — needed from day one; the coverage check (M2) is still a candidate |

---

## 5. Picking up cold

1. Read this file, then [`workflow.md`](workflow.md) §1–§3, then [`conventions.md`](conventions.md).
2. `git log --oneline -15` and the open pull requests: the state above may have moved.
3. `python scripts/check_docs.py` and `python scripts/check_coverage.py` — both must be clean before anything else is touched.
4. Open [`orders/M0-foundation.md`](orders/M0-foundation.md). Its **Findings** table is the record of the review — 39 rows, each marked — and its **Needs a human** list is where every `disputed` finding's question was collected. Read the Needs a human list before the table: it says who owns what, and most of it is not M0's.
5. Every session ends by updating **§2 and §3 of this file** and, if an order moved, its `Status:` line. A plan that says yesterday's state is the confident wrong answer this repository is built to avoid.

Tooling this machine needed and a fresh one will too: **Node 24** (CI's `NODE_VERSION`; `engines` requires ≥ 22), pnpm **11.0.9** (`packageManager` pins it; `corepack enable pnpm` under Node 24), Docker Desktop **running** — `supabase start` fails with an undescriptive daemon error otherwise and needs nothing else configured — Supabase CLI **2.117.0** (CI pins it; `scoop install supabase` on Windows, **not** `supabase-beta`), Python 3 for the check scripts. Vercel CLI is not needed; the project is linked to the GitHub repository.
