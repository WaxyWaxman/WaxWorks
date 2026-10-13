# Work order — M1 contracts (joint)

**Flow:** none — the contract pull request that opens M1 (A-99); its flows are [E-01](../../flows/E-01-authenticate.md), [M-04](../../flows/M-04-manage-users.md), [O-01](../../flows/O-01-administer-the-organization.md) and [S-01](../../flows/S-01-onboard-and-recover-organizations.md)
**Milestone / track:** M1 / joint — no track; `packages/contracts` is neither D's nor U's (conventions §5)
**Status:** Drafted
**Approved by:** _human, date_ — **both** owners review the pull request (workflow §4: *a change to `packages/contracts`*)
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
**Conventions this order hits that are not written — to answer before approval:**
the two items under *Before approval* at the end of the Checklist.

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
| 18 | O-01 decision 2 — _"A new Store is created with a trading name and a store account."_ — and O-01 decision 3 — _"The store account password is set by the Owner at the Store's creation and reset by an Owner afterwards."_ — with A-91: _"a definer function authorizes and logs, a server-side handler holding the service-role key performs the Auth write"_ | `store_create` and `store_account_reset`. **Doubt, for the human at approval:** the record never says whether the password is an *argument* of the definer function. Reading A-91 and A-93 together, it should reach only the Server Action's Auth call and never the database function — so the contract would take the store account **email** and not the password | unit — `store_create`'s input has no password field (if the doubt is resolved that way) |
| 19 | A-112 — _"`store_create` writes a new Store's configuration rows itself, in its own transaction, from default values written in its body."_ | `store_create`'s output and the fake: a new Store comes with its M1 settings rows (A-53) at the first shop's values (Alberta, CAD, March 31, 80mm — §11, once #193 merges) | unit — the fake's new Store reads back its settings rows |
| 20 | M-04 decision 26 — _"The floor moves to the Organization: at least one active Owner, always."_ | The fake refuses the last active Owner's deactivation or demotion | unit — M-04-T8's and T9's refusals in the fake |
| 21 | M-04 decision 27 as amended by M-04 decision 32 — _"a **PIN** clash at assignment is refused without naming the holder; an initials clash still names them."_ | The fake's clash refusals in `user_assign` and `user_set_pin` | unit — PIN clash: no name in the error; initials clash: the holder's name |
| 22 | M-04 decision 34 — _"A User may hold no initials while they hold no Store; assignment requires them."_ | `organization_create` takes no initials (S-01 d5); `user_assign` refuses a User without initials, and without a PIN per row 16 | unit — the fake's assign refuses an Owner with no initials, then with no PIN |
| 23 | M-04 decision 38 — _"A lost passkey is recovered by asking: an Owner sends a re-enrolment link (`user_reset_request`), and an Organization's only Owner asks a System Administrator (`owner_reset_request`)."_ | `user_reset_request` **O** and `user_invite_resend` **O**; the latter refuses a person who already holds a passkey | unit — a Manager's call of either is refused by role; `user_invite_resend` refuses an enrolled person |
| 24 | S-01 decision 2 — _"Onboarding is a System Administrator's act: an Organization is created with a name and its first Owner's name and email."_ — and S-01 decision 5 — _"Onboarding takes the first Owner's name and email and nothing else — not their initials."_ | `organization_create`'s input | unit — the input schema is name, Owner name, Owner email; initials refused as unknown keys |
| 25 | S-01 decision 3 — _"Recovery is: triggering a password reset for an Owner; and, for an Organization with no active Owner, reactivating a deactivated Owner or inviting a new one."_ — as A-90 refuses `owner_recover` while an active Owner exists | `owner_recover` and `owner_reset_request` in the fake | unit — `owner_recover` refused while an active Owner exists |
| 26 | A-110 — _"A System Administrator is a row in `system_administrators`, which the access-token hook reads to set `principal = sysadmin`."_ | The fake's S functions accept only a sysadmin principal, and every non-S function refuses one (A-90) | unit — an S call on a store or personal session is refused; `user_add` on a sysadmin session is refused |
| 27 | A-93 — _"Five things enter no log, error event or breadcrumb anywhere."_ | A `ContractError` can reach Sentry under A-106; nothing this order adds may put a PIN, a password or a link in an error's message or `request_id` | unit — a refused `user_set_pin`'s error, serialised, contains no digit of the PIN |
| 28 | A-4 — every write is a definer function; and A-40 — tenancy re-asserted in the function | The fake keys every row by Organization and refuses a call whose session has none (except S, row 26) | unit — a call with a null Organization in the fake session is refused |
| 29 | **Before approval — a conventions §5 gap.** **How the fake models a session.** Conventions §5 and A-98 say the fake is a `WaxClient`; neither says how it learns the principal, Organization, Store, user and terminal that the database reads from the JWT (A-87, §5.4). _Recommended, not yet ratified:_ `createFakeClient({ session })`, with a `session` of the §5.4 claim shape, and a `withSession()` to switch it — so a screen test states its principal explicitly | Rows 8–28 all depend on it | **answer at approval**, then unit |
| 30 | **Before approval — a conventions §5 gap.** **Which error codes refusals use.** A-98 says the typed error carries _"the database `errcode`"_; the header template uses `28000` for tenancy and actor, and nothing else is catalogued. The screens must tell *refused by role*, *clash*, *not found*, *floor*, *line closed (with a reopening time)* and *invalid state* apart. _Recommended, not yet ratified:_ a small table in conventions §5 mapping each refusal kind to one SQLSTATE and a stable `message` key, which D raises and the fake mimics | Rows 8–25 | **answer at approval**, then unit |

## Evidence

_Written by the developer. One row per Checklist row, in the same order._

| # | State | Test (name and `file:line`) | Run output | Note |
|---|---|---|---|---|

## Findings

| # | Reviewer | Decision cited | `file:line` | Finding | Severity | Developer |
|---|---|---|---|---|---|---|

## Verdict

**Accepted** | **Returned** — _coordinator, date_

### Needs a human

_Raised while drafting, before any code:_

- **Rows 29 and 30** — the fake's session model and the refusal error codes. Both are conventions §5 gaps; answer before approval.
- **Row 18's doubt** — is the store account password an argument of `store_create` and `store_account_reset`, or only of the Server Action? Strike or keep the row's unit test at approval.
- **`drawer_opens` has no writer.** §8 builds the table at M1, and no §6 function writes it. Owner: `/architecture`. Not this order's.
- **The two predicates and A-113.** `invoice_is_paid` and `period_is_sealed` are labelled `pure` in the M0 skeleton, but §6 says they read tables; if they are definer functions they take no actor header either, and A-113 says there are *five exceptions and no others*. Owner: `/architecture`, before M3's contract pull request.
