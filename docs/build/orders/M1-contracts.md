# Work order — M1 contracts (joint)

**Flow:** none — the contract pull request that opens M1 (A-99); its flows are [E-01](../../flows/E-01-authenticate.md), [M-04](../../flows/M-04-manage-users.md), [O-01](../../flows/O-01-administer-the-organization.md) and [S-01](../../flows/S-01-onboard-and-recover-organizations.md)
**Milestone / track:** M1 / joint — no track; `packages/contracts` is neither D's nor U's (conventions §5)
**Status:** In review
**Approved by:** sr-talbot, 2026-10-13 — instructed in session after reading the Checklist on #195; recorded by the coordinator. The Checklist is fixed as merged in [#195](https://github.com/WaxyWaxman/WaxWorks/pull/195). **Both** owners review the pull request (workflow §4: *a change to `packages/contracts`*)
**Pull request:** _once opened_
**Register rows:** none made automatable by this order alone — it is the interface the M1 **D** and **U** orders build against. It *consumes* the M1 rows: E-01-T1–T4, T8–T22; M-04-T7–T9, T11–T19; O-01-T1, T3, T5; S-01-T1–T3

## Scope

Replace the M0 stubs for **§6's Identity set** with full contracts — input schema,
output schema, and the wrapper (A-98, A-99) — and give the **in-memory fake** the
behaviour those functions have, so the **U** track can build every M1 screen
against it before **D** lands. Add the three functions A-114 created. Land
**A-108's wrapper change**. Encode **A-113's five header exceptions**, so the
uniform header stops being asserted where the record says it does not hold.

This order writes `packages/contracts/` and the repository tests that hold it
(`tests/contracts.test.ts` and new files beside it). It writes **no** migration,
no screen, and no fake behaviour for any function outside the Identity set. It is
run interactively with `/develop` by a human, as M0 was: the `developer`
subagent's hook refuses `packages/contracts/`.

**Contract entries — implemented here (20):** `terminal_register`,
`actor_resolve`, `manager_authorize_pin`, `session_select_store`, `user_add`,
`user_change_role`, `user_deactivate`, `user_reactivate`, `user_assign`,
`user_unassign`, `user_correct`, `user_set_pin`, `store_create`,
`store_account_reset`, `organization_create`, `owner_recover`,
`owner_reset_request`, and **new**: `user_reset_request` **O**,
`user_invite_resend` **O**, `auth_user_link` (A-114). **Not here:** every
`settings_*` function (A-112 — none ships at M1), `review_flag_acknowledge`
(the review queue is M5's screen; M1 raises flags inside other functions), and
the two predicates (M3, M5).

**Reading list:** [conventions](../conventions.md) §3.3 (line 160) and §5 (304)
in full; `architecture.md` §1 (15), §5.4 (454), §6 intro and the Identity row
(464–485), §7 (505), §8's M1 row (565); the §2 rows this Checklist cites — A-4
(44), A-87 (50), A-28 (69), A-89 (79), A-40 (119), A-98 (181), A-99 (182),
A-103 (185), A-104 (186), A-108 (190), A-90 (196), A-91 (197), A-110 (198),
A-111 (199), A-112 (200), A-113 (201), A-114 (202), A-115 (203), A-93 (211),
A-94 (212); §9's rows for A-110 to A-116 and for E-01 d31–d36 and M-04 d35–d38.
The four flows' decision tables for the rows quoted below.
**Conventions this order hits:** conventions §5's three rows added for this order — the fake's session, the refusal keys and their table, and *What never reaches a definer function* (rows 18, 29, 30).

## Checklist

| # | Decision | Binds this order because | Evidence required |
|---|---|---|---|
| 1 | A-99 — _"The M0 contracts skeleton is every §6 function's name, argument list and return shape, with a stub wrapper that throws `not_implemented`; the input and output schemas, the wrapper body and the fake's behaviour land in the contract pull request that opens the milestone building the function."_ | This is that pull request for M1: the 20 Identity entries move from `stub` to `contract`, with schemas and fake behaviour; no other entry changes | unit — every Identity entry exports a `contract`, not a `stub`; every non-Identity entry still throws `not_implemented` |
| 2 | A-98 — _"A contract is one file per database function exporting a Zod input schema, a Zod output schema, and one wrapper of a single shape; the fake is chosen by an explicit client at the composition root, never by an environment variable read inside a wrapper."_ | Shape of every file this order writes; the fake stays on `@waxworks/contracts/fake` | unit — one file per function, three exports each; no `process.env` read under `packages/contracts/src/` |
| 3 | A-108 — the wrapper _"mints the correlation id before it validates, mints one for every call including a pure helper and an unimplemented stub, and sends it to the database only where A-94 requires an argument"_; `ContractError` carries `request_id` (conventions §5) | M0 left it minting after validation (plan.md §2); this order lands the change | unit — an `invalid_input` error carries a `request_id`; a stub's `not_implemented` carries one; the id is sent to the database only where A-94 wants it |
| 4 | A-94 — _"Every write carries a request id; every write on a store session names the terminal it came from, verified as A-87 already verifies it."_ | Which inputs carry `p_terminal_id`, and that `p_request_id` is never a caller's input | unit — no input schema accepts `p_request_id`; `isCorrelated` is true for all 20 |
| 5 | A-113 — _"The uniform header (§6, A-103) has five named exceptions, and no others."_ `actor_resolve` takes `p_initials` and `p_terminal_id` and no actor arguments; `manager_authorize_pin` takes `p_pin` and `p_terminal_id`; `terminal_register` takes no `p_terminal_id` and takes `p_actor_initials`, resolving them itself; every **S** function takes `p_actor_user_id` = the System Administrator's Auth id and no initials, terminal or PIN; `auth_user_link` takes the row it completes and the new Auth user id only | The M0 skeleton gives `actor_resolve` the header today — the conflict M0 findings 6, 24 and 33 named | unit — `tests/contracts.test.ts`'s *every non-pure function carries the header* gains the list of exactly these five; a sixth exception fails it |
| 6 | A-103 — _"Every definer function starts from one header"_ … `execute` _"granted to `authenticated` alone (to the `sysadmin` role for an S function)"_, amended by A-114 for `auth_user_link` | The remaining 15 Identity functions keep `header` / `managerHeader` | unit — each of the 15 extends `header` or `managerHeader`, M/O ones the latter |
| 7 | A-114 — _"A-91's Auth write-back is `app.auth_user_link`, the one function the `service_role` may execute; `user_change_role` joins A-91's acts; an Owner's reset and an Owner's re-sent invite are definer functions of their own, shipped at M1 with a button each."_ | Three new entries: added to `functions.ts` with their kind, given contracts and fake behaviour; `auth_user_link` has a kind the list does not have yet | unit — the committed function list names all three; `tests/contracts.test.ts`'s §6 enumeration includes them |
| 8 | E-01 decision 26 — _"On a store session, a manager-only action is authorized by a four-digit PIN typed on its own — no initials first — and the PIN is unique among the Managers and Owners assigned to that Store."_ | `p_manager_pin` is four digits; the fake resolves it among the Store's assigned Managers and Owners; a wrong PIN names nobody | unit — the fake's `user_add` with a wrong PIN refuses without a name in the error |
| 9 | E-01 decision 31 — _"Wrong PINs are throttled per Store: five refused within fifteen minutes, across all the Store's terminals, close the Store's manager-only line for fifteen minutes and raise a review flag."_ | The fake counts refusals per Store across terminals and refuses every PIN while closed, telling the screen when the line reopens; the error shape is a contract | unit — five refusals on two terminals close the line; a correct PIN is then refused with a reopening time; a personal-session call is unaffected |
| 10 | E-01 decision 32 — _"The PIN pad checks a PIN by itself when a Manager or Owner crosses into a manager-locked area, under decision 31's throttle."_ | `manager_authorize_pin` is a callable contract; its refusals count toward row 9's limit | unit — three refusals at `manager_authorize_pin` and two at `user_set_pin` close the line |
| 11 | E-01 decision 25 — _"A User belongs to an Organization and is assigned to one or more of its Stores."_ — initials resolve among those assigned to the Store in session | `actor_resolve` and `terminal_register` resolve among the assigned only | unit — initials held at another Store do not resolve |
| 12 | E-01 decision 33 — _"A Manager or Owner signs in to a personal session with a passkey and no password, and nothing else."_ | No input schema carries a password for a Manager or Owner; invite and reset are re-enrolment links | unit — no Identity input has a `password`-named field except as row 18 decides for the store account |
| 13 | E-01 decision 36 — _"An Owner whose Organization has no Store signs in to a personal session with no Store picked and lands on Create Store."_ | `session_select_store`'s fake behaviour with zero Stores; `store_create` makes the new Store the caller's pick | unit — a fake Organization with no Store: `session_select_store` reports none; after `store_create`, it reports the new one |
| 14 | M-04 decision 30 — _"What a Manager may do to Users: add, correct, deactivate, reactivate and assign Employees at the Stores they are themselves assigned to, and set PINs there."_ — Owner-only for anything touching a Manager or Owner | The fake's role refusals — the U track's screens must see the write-path refusal, not only a missing button | unit — a Manager's `user_add` of a Manager is refused by role; an Owner's is accepted |
| 15 | M-04 decision 37 — _"A Manager may deactivate, reactivate or correct an Employee who shares any one of the Manager's Stores, even if the Employee is also assigned elsewhere."_ | The fake's scope check for `user_deactivate`, `user_reactivate`, `user_correct`: one shared active Store; `user_assign` stays at the Manager's own Stores | unit — Manager at A deactivates an Employee at A and B; cannot assign them to B; cannot deactivate one at B only |
| 16 | M-04 decision 35 — _"Every Manager and Owner who holds a Store holds a PIN: Add and a promotion into Manager refuse without one, and an Owner's first assignment requires one beside their initials."_ | `user_add` / `user_change_role` inputs carry the PIN for a Manager; the fake refuses without one, and refuses `user_set_pin` clearing a Manager's | unit — each of the four refusals in M-04-T16 |
| 17 | M-04 decision 36 — _"An Employee's email address is optional."_ — and M-04 decision 33 — _"A promotion into Manager or Owner sends the invite."_ | `user_add`'s email is optional for an Employee, required for a Manager or Owner; `user_change_role` into Manager or Owner requires one | unit — Employee with and without email accepted; promotion without email refused |
| 18 | O-01 decision 2 — _"A new Store is created with a trading name and a store account."_ — and O-01 decision 3 — _"The store account password is set by the Owner at the Store's creation and reset by an Owner afterwards."_ — with A-91: _"a definer function authorizes and logs, a server-side handler holding the service-role key performs the Auth write"_ | `store_create` and `store_account_reset`. **Resolved 2026-10-13 by sr-talbot** (conventions §5, *What never reaches a definer function*): the password reaches only the Server Action's Auth call; both functions take the store account's **email** | unit — neither input schema has a password field |
| 19 | A-112 — _"`store_create` writes a new Store's configuration rows itself, in its own transaction, from default values written in its body."_ | `store_create`'s output and the fake: a new Store comes with its M1 settings rows (A-53) at the first shop's values (Alberta, CAD, March 31, 80mm — §11) | unit — the fake's new Store reads back its settings rows |
| 20 | M-04 decision 26 — _"The floor moves to the Organization: at least one active Owner, always."_ | The fake refuses the last active Owner's deactivation or demotion | unit — M-04-T8's and T9's refusals in the fake |
| 21 | M-04 decision 27 as amended by M-04 decision 32 — _"a **PIN** clash at assignment is refused without naming the holder; an initials clash still names them."_ | The fake's clash refusals in `user_assign` and `user_set_pin` | unit — PIN clash: no name in the error; initials clash: the holder's name |
| 22 | M-04 decision 34 — _"A User may hold no initials while they hold no Store; assignment requires them."_ | `organization_create` takes no initials (S-01 d5); `user_assign` refuses a User without initials, and without a PIN per row 16 | unit — the fake's assign refuses an Owner with no initials, then with no PIN |
| 23 | M-04 decision 38 — _"A lost passkey is recovered by asking: an Owner sends a re-enrolment link (`user_reset_request`), and an Organization's only Owner asks a System Administrator (`owner_reset_request`)."_ | `user_reset_request` **O** and `user_invite_resend` **O**; the latter refuses a person who already holds a passkey | unit — a Manager's call of either is refused by role; `user_invite_resend` refuses an enrolled person |
| 24 | S-01 decision 2 — _"Onboarding is a System Administrator's act: an Organization is created with a name and its first Owner's name and email."_ — and S-01 decision 5 — _"Onboarding takes the first Owner's name and email and nothing else — not their initials."_ | `organization_create`'s input | unit — the input schema is name, Owner name, Owner email; initials refused as unknown keys |
| 25 | S-01 decision 3 — _"Recovery is: triggering a password reset for an Owner; and, for an Organization with no active Owner, reactivating a deactivated Owner or inviting a new one."_ — as A-90 refuses `owner_recover` while an active Owner exists | `owner_recover` and `owner_reset_request` in the fake | unit — `owner_recover` refused while an active Owner exists |
| 26 | A-110 — _"A System Administrator is a row in `system_administrators`, which the access-token hook reads to set `principal = sysadmin`."_ | The fake's S functions accept only a sysadmin principal, and every non-S function refuses one (A-90) | unit — an S call on a store or personal session is refused; `user_add` on a sysadmin session is refused |
| 27 | A-93 — _"Five things enter no log, error event or breadcrumb anywhere."_ | A `ContractError` can reach Sentry under A-106; nothing this order adds may put a PIN, a password or a link in an error's message or `request_id` | unit — a refused `user_set_pin`'s error, serialised, contains no digit of the PIN |
| 28 | A-4 — every write is a definer function; and A-40 — tenancy re-asserted in the function | The fake keys every row by Organization and refuses a call whose session has none (except S, row 26) | unit — a call with a null Organization in the fake session is refused |
| 29 | **Answered 2026-10-13 by sr-talbot — conventions §5, *How the fake knows who is signed in*.** **How the fake models a session.** Conventions §5 and A-98 say the fake is a `WaxClient`; neither says how it learns the principal, Organization, Store, user and terminal that the database reads from the JWT (A-87, §5.4). _Recommended, not yet ratified:_ `createFakeClient({ session })`, with a `session` of the §5.4 claim shape, and a `withSession()` to switch it — so a screen test states its principal explicitly | Rows 8–28 all depend on it | unit — a test acts as two principals over one state with `withSession` |
| 30 | **Answered 2026-10-13 by sr-talbot — conventions §5, *How a refusal is told apart*, and its table** (SQLSTATE values to be confirmed in this pull request's review). **Which error codes refusals use.** A-98 says the typed error carries _"the database `errcode`"_; the header template uses `28000` for tenancy and actor, and nothing else is catalogued. The screens must tell *refused by role*, *clash*, *not found*, *floor*, *line closed (with a reopening time)* and *invalid state* apart. _Recommended, not yet ratified:_ a small table in conventions §5 mapping each refusal kind to one SQLSTATE and a stable `message` key, which D raises and the fake mimics | Rows 8–25 | unit — every refusal in rows 8–25 asserts its key and SQLSTATE from the table |

## Evidence

_Written by the developer. One row per Checklist row, in the same order._

_Developed interactively with `/develop` on 2026-10-13 (sr-talbot pairing). `M1` = `tests/contracts-m1.test.ts`, `C` = `tests/contracts.test.ts`. **Red first:** with the tests written and nothing implemented, `pnpm test:repo` → `Test Files  2 failed | 10 passed (12)` / `Tests  127 failed | 357 passed (484)` (46 in `M1`, 81 in `C`; the first, `an invalid_input error carries a request_id`: `expected NotImplementedError … to match object { code: 'invalid_input' }`). **Green:** `pnpm test` → `Test Files  12 passed (12)` / `Tests  497 passed (497)`; `pnpm typecheck` → every member `Done`; `pnpm lint` → every member `Done`. Each row's quote below is from `vitest run tests/contracts-m1.test.ts tests/contracts.test.ts --reporter=verbose` → `Tests  432 passed (432)`._

| # | State | Test (name and `file:line`) | Run output | Note |
|---|---|---|---|---|
| 1 | Done | `C:61` *the 20 Identity entries of M1 are contracts, not stubs (A-99)*; `C:41` *%s, outside M1's Identity set, still throws not_implemented through the fake client* (69 cases) | `✓ … A-99 — … > the 20 Identity entries of M1 are contracts, not stubs (A-99)`; `A-99 —` describe: 240 passed, 0 failed | A wrapper now carries `isStub` (`wrapper.ts`), so *contract, not stub* is asserted rather than inferred |
| 2 | Done | `C:145` *%s's file exports exactly its input schema, output schema and wrapper* (89 cases); `C:129` *no file under packages/contracts/src reads process.env or branches on a flag* | `A-98 —` describe: 93 passed, 0 failed | The fake's two new files sit under `fake/`, which the one-file-per-function guard already excludes |
| 3 | Done | `M1:80` *an invalid_input error carries a request_id*; `M1:86` *a stub's not_implemented carries one*; `M1:92` *a refusal carries the very id that was sent as p_request_id*; `M1:103` (a non-refusal failure); `C:207` and the A-94 pure-helper case for *sent only where A-94 wants it* | `A-108` describe: 4 passed, 0 failed; `A-94 — p_request_id …`: 6 passed, 0 failed | `ContractError` gains `key`, `request_id`, `detail`; clients throw `RpcRefusal`, which the wrapper converts so every error carries the id. **Changes `ContractError`'s constructor** — see Needs a human |
| 4 | Done | `C:321` *no input schema in the Identity set accepts p_request_id, and every one is correlated (A-94)*; `M1:112` *users.log carries the request id of the call that wrote it, and the principal* | `✓ … A-114 — … > no input schema in the Identity set accepts p_request_id, and every one is correlated (A-94)`; `✓ … A-94 — every write … > users.log carries the request id …` | Every Identity input is `.strict()`, so a supplied `p_request_id` is refused as `invalid_input` rather than dropped |
| 5 | Done | `C:254` describe *A-113 — the uniform header has five named exceptions, and no others*: `C:260` *the non-pure functions without the full header are exactly the five exceptions*, plus one shape test per exception | `A-113` describe: 9 passed, 0 failed | The list is the test's (`HEADER_EXCEPTIONS`), not the package's, so a sixth is a reviewed edit to the test |
| 6 | Done | `C:298` *there are thirteen of them*; `C:307` *%s extends header, or managerHeader if M or O* (13 cases, asserting the shared header's own field schemas by identity) | `A-103 —` describe: 14 passed, 0 failed | **The row says 15; there are 13.** 20 − 3 named − 3 **S** − `auth_user_link` = 13: the row counts the **S** functions as one. Checklist left as approved |
| 7 | Done | `C:316` *with their kinds: O, O, and the service role's own*; `C:61`'s enumeration; `M1:474` *the service role links an Auth user …* | `✓ … A-114 — … > with their kinds: O, O, and the service role's own`; `A-114 — auth_user_link is …`: 1 passed | New `Kind` `"service"` in `functions.ts` |
| 8 | Done | `M1:122` *a wrong PIN on user_add refuses without a name*; `M1:130` (another Store's Manager's PIN); `M1:136` (four digits); `M1:142` *both names are recorded* | `E-01 d26` describe: 4 passed, 0 failed | — |
| 9 | Done | `M1:153` *five refusals on two terminals close the line; a correct PIN is then refused with the reopening time; a personal session is unaffected*; `M1:178` *each refusal is recorded with its Store, terminal, time and open staff session, never the digits* | `E-01 d31` describe: 2 passed, 0 failed | Error shape: `pin_line_closed`, `WX429`, `detail` = the reopening time as ISO-8601. Three throttle details are the fake's placeholders — see Needs a human |
| 10 | Done | `M1:200` *three refusals at manager_authorize_pin and two at user_set_pin close the line*; `M1:194`; `M1:207` | `E-01 d32` describe: 3 passed, 0 failed | — |
| 11 | Done | `M1:214` *initials held only at another Store do not resolve, at actor_resolve or at terminal_register*; `M1:222`; `M1:228` | `E-01 d25` describe: 3 passed, 0 failed | — |
| 12 | Done | `M1:234` describe *E-01 d33 — … no Identity input carries a password* (one case per Identity function) | `E-01 d33`: 20 passed, 0 failed | Row 18 decided none for the store account, so the exception is empty |
| 13 | Done | `M1:243` *session_select_store reports none, then the new one after store_create*; `M1:255` (E-01 d27's pick rule) | `E-01 d36` describe: 2 passed, 0 failed | `session_select_store(p_store_id: null)` reports without changing the pick |
| 14 | Done | `M1:266` *a Manager's user_add of a Manager is refused by role; an Owner's is accepted*; `M1:274`; `M1:280` | `M-04 d30` describe: 3 passed, 0 failed | `role_refused`'s `detail` is the role required — `owner` for a Manager out of scope too |
| 15 | Done | `M1:287` *Manager at A deactivates an Employee at A and B; cannot assign them elsewhere or deactivate one at B only* | `✓ … M-04 d37 … > Manager at A deactivates an Employee at A and B; …` (1 passed) | The Employee already holds B, so *cannot assign them* is tested against a third Store, C, and as *cannot unassign them from B* |
| 16 | Done | `M1:302` *M-04-T16's four refusals* | `✓ … M-04 d35 … > M-04-T16's four refusals` | — |
| 17 | Done | `M1:320` *Employee with and without email accepted, neither invited; promotion without email refused*; `M1:329`; `M1:334` (no second invite) | `M-04 d36` describe: 3 passed, 0 failed | — |
| 18 | Done | `M1:343` *neither store_create nor store_account_reset has a password field, and one supplied is refused as unknown*; `M1:352` | `O-01 d2` describe: 2 passed, 0 failed | — |
| 19 | Done | `M1:364` *a new Store reads back Alberta, CAD, March 31, 80mm and M-06 d45's five-minute lapse* | `✓ … A-112 … > a new Store reads back Alberta, CAD, March 31, 80mm …` | The output carries `store_settings`' five values only — see Needs a human on tenders and tax groups |
| 20 | Done | `M1:374` *M-04-T8 and M-04-T9: the last active Owner can neither be deactivated nor demoted …* | `✓ … M-04 d26 … > M-04-T8 and M-04-T9: …` | — |
| 21 | Done | `M1:387` *PIN clash: no name; initials clash: the holder's name* | `✓ … M-04 d32 … > PIN clash: no name; initials clash: the holder's name` | Also asserts the two refused PIN clashes are logged (M-04 d32) |
| 22 | Done | `M1:409` *organization_create takes no initials; user_assign refuses an Owner with none, then with no PIN* | `✓ … M-04 d34 … > organization_create takes no initials; …` | — |
| 23 | Done | `M1:420` *a Manager's call of either is refused by role; user_invite_resend refuses a person already enrolled* | `✓ … M-04 d38 … > a Manager's call of either is refused by role; …` | *Enrolled* is `FakeClient.enrolPasskey` — the database's means is an open question, below |
| 24 | Done | `M1:435` *the input schema is exactly that, and initials are refused as unknown keys* | `✓ … S-01 d2 and S-01 d5 … > the input schema is exactly that, …` | — |
| 25 | Done | `M1:446` *owner_recover is refused while an active Owner exists; owner_reset_request reaches the Owner and is logged on the Organization* | `✓ … S-01 d3 … > owner_recover is refused while an active Owner exists; …` | `owner_recover`'s two success paths are implemented, not tested: no Organization without an active Owner can be built through the write surface (S-01-T3 found the same) |
| 26 | Done | `M1:457` *an S call on a store or personal session is refused; user_add on a sysadmin session is refused*; `M1:465` | `A-110` describe: 2 passed, 0 failed | — |
| 27 | Done | `M1:487` *a refused user_set_pin's error, serialised, contains no digit of the PIN*; `M1:496` (a malformed PIN is not echoed) | `A-93` describe: 2 passed, 0 failed | `request_id` and the stack are left out of the digit check: a uuid and line numbers carry digits that are not the PIN |
| 28 | Done | `M1:505` *a null Organization is refused*; `M1:512` (another Organization's row: `not_found`); `M1:519` | `A-40` describe: 3 passed, 0 failed | — |
| 29 | Done | `M1:526` *an Employee added on the Owner's personal session resolves on the Store's store session* | `✓ … row 29 … > an Employee added on the Owner's personal session …` | The session adds `auth_uid` and the principal `service` to §5.4's five claims — see Needs a human |
| 30 | Done | `M1:536` *REFUSALS is exactly conventions §5's table* (parses the table); every refusal in rows 8–25 goes through `refused()` (`M1:27`), which asserts key **and** SQLSTATE from `REFUSALS` | `✓ … row 30 … > REFUSALS is exactly conventions §5's table` | The SQLSTATE values are still the table's recommendation, for this pull request's review |

## Findings

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|

## Verdict

**Accepted** | **Returned** — _coordinator, date_

### Needs a human

_Raised while drafting, before any code:_

- ~~**Rows 29 and 30**~~ — answered 2026-10-13 by sr-talbot into conventions §5; the SQLSTATE values stay to be confirmed in the pull request's review.
- ~~**Row 18's doubt**~~ — resolved 2026-10-13 by sr-talbot: the password never reaches a definer function.
- **`drawer_opens` has no writer.** §8 builds the table at M1, and no §6 function writes it. Owner: `/architecture`. Not this order's.
- **The two predicates and A-113.** `invoice_is_paid` and `period_is_sealed` are labelled `pure` in the M0 skeleton, but §6 says they read tables; if they are definer functions they take no actor header either, and A-113 says there are *five exceptions and no others*. Owner: `/architecture`, before M3's contract pull request.

_Raised while developing, 2026-10-13:_

**Contract changes this pull request makes beyond the Checklist's wording — both owners review them:**

- **`p_actor_initials` is nullable in the shared header.** On a personal session the actor is the session holder (§6), and an Owner holds no initials until their first assignment (M-04 d34) — yet they must call `store_create` (E-01 d36). Required initials would have made d36 impossible. On a store session the fake still requires them and checks they name the actor at that Store.
- **`ContractError`'s constructor and fields change** (A-108): it now carries `key` and `request_id` always, and a refusal's `detail`. Clients throw a new `RpcRefusal`, which the wrapper converts. The PostgREST error stays in `details` — A-106's allowlist must still take `request_id` and drop `details`.
- **`managerHeader.p_manager_pin` is four digits**, not any string (row 8).
- **Every Identity input is `.strict()`**: an unknown key is `invalid_input`, not silently dropped. Rows 18 and 24 need that for the password and initials keys.
- **Every output shape is proposed here**, not taken from the record — §6 gives none for the Identity set. The ones a screen leans on: `user_add` / `user_change_role` return `invite`; `store_account_reset` returns the store account's `auth_user_id` for the Server Action; `session_select_store` returns the pickable Stores.
- **The fake's session adds two things to §5.4's five claims:** `auth_uid` (the JWT `sub`, which an **S** function compares with `p_actor_user_id` under A-113), and the principal `service` for `auth_user_link` (A-114). Conventions §5's row names five fields.

**Open questions — the fake holds a placeholder for each, marked in the code; none is a decision:**

- **A refusal that must also leave a record.** E-01 d31's refusal row, the flag raised at closure (A-28), and M-04 d32's log of a refused PIN clash must all survive a refusal. Under conventions §5 a refusal is `raise exception`, which rolls back the row the function just wrote. The fake keeps them outside its rolled-back state. **D** needs a mechanism: return the refusal instead of raising it, an autonomous write, or something else — and the first two change conventions §5's refusal shape. Owner: `/architecture`, before the M1 **D** order.
- **`manager_authorize_pin` cannot record the open staff session.** E-01 d31 records *"whose staff session was open"* on every refusal, but A-113 gives the pad's function only `p_pin` and `p_terminal_id`. The fake records `null` there; the write path, which has the actor, records them. Owner: `/architecture` (A-113) with E-01.
- **How does the database know someone holds a passkey?** `user_invite_resend` is *"refused for someone who already has one"* (A-114), and a promotion sends no second invite to someone who does (M-04 d33). A passkey lives in Supabase Auth, and A-104 gives `waxworks_app` no grant on `auth.*`. The fake stands in with `FakeClient.enrolPasskey`. Owner: `/architecture`.
- **Refusal keys the table has no kind for.** The fake uses `invalid_state` for: an Employee or Manager added with no Store, or unassigned from their last (M-04 d27); a PIN given to an Employee (M-04 d28); a reset or re-sent invite to an Employee. It uses `email_required` for clearing a Manager's or Owner's email at Correct. The behaviour is specified; the key is not. Confirm or extend conventions §5's table in this review.
- **`user_set_pin`'s scope for a Manager.** *"At their own Stores"* (M-04 d28, A-89) is read in the fake as *sharing one Store with the PIN's holder*. M-04 d37 settled the wide reading for deactivate, reactivate and correct only. Open against **M-04**.
- **The throttle's edges (E-01 d31).** In the fake: a missing PIN is refused without counting as a guess; the five refusals are spent when the line closes; attempts while it is closed are not counted. None of these is recorded. Open against **E-01**.
- **Store ID.** *"The next seven-digit value"* (O-01 d2): where the sequence starts, and whether it is global or per Organization. The fake starts at `1000001`, globally. Open against **O-01** / **M-06** d47.
- **`store_create`'s other M1 settings rows.** A-53 puts `tender_types` (with `rounding`), `currencies` and `tax_groups` at M1, but M-06 does not list the default tenders or name the default tax group. So the output carries only the five `store_settings` values the record states. The full rows are **D**'s migration body (A-112).
- **Not modelled:** `actor_resolve`'s exception for a Sale already Open and locked to a deactivated User (§6) — no Sales exist before M4; and `pin_pepper_missing` (A-115) — the fake has no Vault, so it never raises it.

**A Checklist discrepancy, not edited:** row 6 says *the remaining 15*; there are 13 (Evidence row 6).
