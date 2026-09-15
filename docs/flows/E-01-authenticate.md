# E-01 — Authenticate to the platform

**Actor:** Employee
**Status:** Specified
**Related:** [M-04 Manage users](M-04-manage-users.md)

**Job:** As an employee, I need to identify myself to the system so my actions are attributed to me and I can access the till.

---

## Flow

0. A terminal is **enrolled** to a Store once, using a one-time code, and holds that enrollment thereafter (decision 9). Enrollment is what scopes everything the terminal can see to its Store; it is not a staff sign-in.
1. A **terminal** presents the till with no active session.
2. Employee enters their **initials** to open a session on that terminal. Identification **resolves as you type** (decision 19): no Enter, and Escape cancels whatever asked.
3. The session stays active on that terminal for a configured period of inactivity — **defaulting to 5 minutes** ([M-06](M-06-settings.md) d45, replacing decision 4's flat 15) — then lapses. An **Open Sale suppresses the lapse** on that terminal (decision 10).
4. While a session is active, every action taken on that terminal is attributed to that Employee.
5. When no session is active, any action requiring attribution prompts for initials inline and proceeds without opening a full session.
5a. **Some actions prompt every time, session or not** (decisions 12 and 15): opening a new Sale, recording a pay-out, adjusting on hand, and voiding. Starting a Return is not a fourth case — a Return *is* a Sale with negative lines ([E-06](E-06-process-a-return.md) steps 1-2), so it prompts as a new Sale does (decision 15). Receiving, order processing and the rest of the back office are covered by the session, because the same person works those for an hour at a stretch.
6. A Manager authorizing a **manager-only** action enters their own initials at the point of the action; this does not replace the Employee's session. Actions that formerly needed a *manager override* now proceed and raise a review flag instead ([M-04](M-04-manage-users.md) d8).

---

## What a terminal is

A **terminal** is a browser session on a device. Two browsers on the same physical machine are two terminals, each with an independent staff session. Sessions are not shared between devices, and signing in at the counter does not sign anyone in at the receiving desk.

---

## Credentials

**v1 has no passwords.** Identification is by initials only. This is a deliberate trade for counter speed in a small shop where the physical premises are the real access control, and it is expected to be replaced.

The model is built so that adding real credentials later does not change the shape of anything else: actions are attributed to a **User**, sessions belong to a terminal, and manager authorization is already distinct from the session. Adding a password or PIN step changes how a session is opened and nothing downstream of it.

**What the database trusts is the terminal, not the initials** (decision 9). Enrollment gives a terminal a real authenticated session carrying its Store, and every row it can reach is scoped to that Store. Initials sit on top as attribution. This is what lets v1 have no passwords without leaving the database open — and why issuing per-User credentials later is an addition rather than a rewrite.

---

## Requirements

- Every Sale, Return, void, hold cancellation, pay-out, inventory adjustment, and Invoice finalization is attributed to a User.
- A lapsed session must never silently reattribute actions to the previous Employee.
- **Draft Invoices must survive a session lapse mid-scan** (see Inherited). Receiving is a long operation and a timeout must not discard work.
- Users are scoped to a Store. In v1 a User belongs to exactly one Store.
- Historical attribution survives a User being deactivated — see [M-04](M-04-manage-users.md).
- Initials are unique among a Store's active Users (decision 14), and released when a User is deactivated (decision 16).
- A deactivation stops new work under those initials at once at the write path, and the shell drops the session at its next actor re-resolution; only an already-Open Sale outlives it ([M-04](M-04-manage-users.md) d15, d18).

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Draft Invoices must survive a session timeout mid-scan.

**From [E-05](E-05-sell-a-record.md) and [E-04](E-04-manage-inventory.md):**

- A **manager-only authorization** must be performable at a terminal that currently has an Employee session open, without ending that session. (This was written for the manager override, which [M-04](M-04-manage-users.md) d8 has since replaced with a review queue; the requirement survives for the manager-only list.)

**From [M-04](M-04-manage-users.md):**

- **Deactivating a User stops new work under their initials at once, and the screen follows within one actor re-resolution** ([M-04](M-04-manage-users.md) d15 as corrected by d18, [architecture](../architecture.md) A-55). There is no server-side session to end — under [architecture](../architecture.md) A-3 and A-50 a session is a timer in a browser — so the enforcement is `actor_resolve` refusing the User at the write path, and the shell catching up when it next re-resolves. It matters because decision 13 leaves the lapse unbounded: waiting for a lapse could leave a deactivated User attributing work for an hour.
- **An Open Sale survives the deactivation** and stays finishable, rather than being force-unlocked and raising a flag ([E-05](E-05-sell-a-record.md) d23, [architecture](../architecture.md) A-28). The session is gone; the Sale in front of the customer is not.
- **A deactivated User's initials are released** ([M-04](M-04-manage-users.md) d16), which is why decision 14's uniqueness holds among active Users only.
- **A Store always has at least one active Manager** ([M-04](M-04-manage-users.md) d14), so there is always somebody who can authorize a manager-only action at a terminal.

**From [M-06](M-06-settings.md):**

- **The session lapse is a store setting defaulting to 5 minutes**, not the 15 of decision 4 ([M-06](M-06-settings.md) d45). The rule is unchanged — it measures *inactivity*, so an hour of continuous work never prompts and a six-minute absence does. Configurable because in v1 it is ergonomics rather than security: there are no passwords, so what it prevents is accidental misattribution. **It changes character the day credentials arrive**, and must be revisited rather than inherited. **The setting takes no maximum** (decision 13), which declines A-50's standing recommendation and makes that revisit the only thing bounding a long lapse.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Terminals are shared; sessions are per-User, opened on a terminal |
| 2 | A terminal is a browser session on a device — two browsers on one machine are two terminals |
| 3 | v1 identification is **initials only**; no passwords, PINs, or fobs |
| 4 | ~~Sessions lapse after **15 minutes** of inactivity~~ — **amended by [M-06](M-06-settings.md) d45 and [architecture](../architecture.md) A-50**: the period is a store setting and the default is **5 minutes**. The *rule* is untouched — it still measures inactivity. Decision 13 additionally declines a maximum |
| 5 | With no active session, actions requiring attribution prompt for initials inline rather than forcing a full sign-in |
| 6 | ~~A manager override is entered at the point of override and does not replace the active Employee session~~ — **superseded by 11**: the *override* is retired ([M-04](M-04-manage-users.md) d8), but authorizing in place survives for **manager-only** actions |
| 7 | Draft Invoices survive a session lapse |
| 8 | In v1 a User belongs to exactly one Store |
| 9 | **A terminal enrolls to a Store once** and holds a real authenticated session carrying that Store. Row-level security scopes on the terminal's Store; initials are attribution on top ([architecture](../architecture.md) A-3) |
| 10 | **An Open Sale suppresses the 15-minute lapse** on its terminal. Closes the open question below (A-19a) |
| 11 | **A Manager authorizing a manager-only action enters their own initials at the point of the action, without replacing the Employee's session; both names are recorded. Supersedes decision 6**, which named the retired *manager override*. [M-04](M-04-manage-users.md) d8 retired that term and the actions it gated now raise a **ReviewFlag** instead — but d8 amends M-04 d3 and d4 **for override-gated actions only**, leaving the in-place mechanism unchanged for the manager-only set [architecture](../architecture.md) A-28a still gates. Step 6 of the Flow above already reads this way |
| 12 | **Some actions prompt for initials every time, even inside an active session.** Extends step 5, which prompts only when *no* session is active. The split is by **whether the actor plausibly changed since the last action**: at the counter the person ringing changes constantly, while someone sitting down to receive a carton or place a morning's orders is the same person for an hour, and prompting them per action would train them to type initials without reading the screen. **Always prompts:** opening a new Sale, starting a Return, and recording a pay-out. **Covered by the session:** receiving and finalizing an Invoice, order processing, and everything in the back office. An **inventory adjustment** and a **void** always prompt too, being consequential and occasional rather than rhythmic. *Accepted consequence:* the till asks for initials more often than it used to, which is the cost of a Sale's attribution being worth something — and it makes decision 10's open-Sale lapse suppression less load-bearing, since the next Sale re-establishes who is there regardless |
| 13 | **The session-lapse setting takes no maximum.** [architecture](../architecture.md) A-50 **recommended one and this decision declines it**, so the recommendation is closed rather than left standing: a shop tunes the lapse to whatever its counter and back office actually need, and nothing refuses a long value. The reasoning A-50 gives for a maximum is accepted and outweighed — while [E-01](E-01-authenticate.md) has no credentials the lapse protects **attribution, not access** (decision 3, decision 9), so a long value widens the window in which one Employee's initials sit on another's work and widens nothing about what the terminal can reach. A ceiling on a comfort dial is a rule that has to be justified to every shop that hits it, in exchange for a risk that does not exist yet. *Accepted consequence, and it is A-50's warning taken on deliberately:* the day credentials arrive, **every existing value has to be re-consented rather than inherited** — a shop sitting at an hour will have set a future access control to an hour without ever being asked, and there is now no maximum limiting how far that goes. A-50 already requires the whole row to be revisited at that point; this decision makes the revisit compulsory rather than merely advisable, because it is the only remaining thing standing between a long lapse and a real one |
| 14 | **Initials are unique within a Store, enforced when a User is created.** Closes the *initials collisions* open question. [M-04](M-04-manage-users.md)'s Add refuses a duplicate and the Manager resolves it at that moment — three letters, or a digit: `JD`, `JDB`, `JD2`. **Enforced at creation rather than disambiguated at use**, because the alternative puts a picker on the till's most-repeated keystroke and makes every prompt a two-step; and because attribution that needs a tiebreak at read time is attribution that can be argued with. Uniqueness is **per Store**, following decision 8 — a User belongs to exactly one Store, so there is nothing to collide with elsewhere, and this is one of the things multi-store membership will have to reopen. *Accepted consequence:* the Manager does the disambiguating at hiring, for a person who is not in the room, and somebody ends up with initials that are not their initials |
| 15 | **A Return is removed from decision 12's always-prompts list, having never been a separate case. Amends decision 12.** A Return is not a document type: the Employee **starts a Sale in the normal way** ([E-06](E-06-process-a-return.md) step 1) and adds the returned item as a negative-quantity line (step 2), and E-06's *Inherited from E-05* says so outright: *"Returns are lines on a Sale, not a separate document type"*. So the prompt a Return gets is the **new Sale** prompt it already had, and listing it separately described a second prompt that nothing in the flow ever reaches. The always-prompts list is therefore **opening a new Sale, recording a pay-out, adjusting on hand, and voiding**. **A pay-out stays on the list and is genuinely distinct**, even though it too lives inside a Sale: it is a *tender* ([E-05](E-05-sell-a-record.md) d16), so its prompt lands at tender time rather than at open — minutes later, and plausibly a different person at the counter. *Accepted consequence:* two of the four — an on-hand adjustment and a void — are **manager-only** under [architecture](../architecture.md) A-28a, so they now take **two** sets of initials: the acting Employee's, prompted fresh rather than read from the session, and the authorizing Manager's (decision 11). That is deliberate for actions this consequential, and it is the heaviest interaction in the flow; a Sale void takes one, being absent from [M-04](M-04-manage-users.md)'s manager-only table and therefore ungated by decision 2 — it is specified at [E-05](E-05-sell-a-record.md) d31, which bounds *when* it is allowed rather than *who* may do it |
| 16 | **A deactivated User's initials are released for reuse, so decision 14's uniqueness is among *active* Users. Amends decision 14.** Receives [M-04](M-04-manage-users.md) d16, which owns the rule because Deactivate is M-04's action. Nothing in the data stores initials as identity — every attributed row points at the User — so the correct name always resolves on screen; what becomes ambiguous is **paper**, and the mitigation is that every audit surface displays the User's **name** rather than stopping at the initials. See M-04 d16 for the consequence being accepted |
| 17 | **A deactivation is enforced at the write path, not by ending a session. Receives [M-04](M-04-manage-users.md) d18, which corrects M-04 d15's *"ends their sessions immediately on every terminal"*.** There is no session for a write to end: decision 9 and [architecture](../architecture.md) A-3 put the staff session in the browser, and A-50 says the lapse *"is a client-side timer and can be nothing else"*. So `actor_resolve` refuses the deactivated User from the instant the deactivation commits — **no new work is attributable to them anywhere** — and each terminal's shell drops the session when it next re-resolves its actor, on the cadence it already reads the lapse setting on. **This is the one place where this flow's client-side session model is load-bearing rather than incidental**, and it is worth reading decision 3's no-credentials trade against it: the thing standing between a departed employee and the till is a server-side refusal, not a login. *Accepted consequence:* the screen and the database disagree for up to one re-resolution interval, during which the till shows a session that can no longer do anything |
| 18 | **Credentials are deferred to a later version, and this row carries the list of what must be revisited when they arrive.** Decision 3's initials-only is confirmed as the v1 answer rather than left as an open question — v1 is a single-store pilot in which the physical premises are the access control, and nothing specified depends on credentials existing. **What makes this safe to defer is that it is written down rather than remembered.** When passwords, PINs or badges arrive, every one of these is reopened, and none of them is inherited: **(1)** the session lapse stops being ergonomics and becomes an access control ([architecture](../architecture.md) A-50) — decision 13 declined a maximum, so every shop's existing value has to be re-consented rather than carried over, and a shop sitting at an hour is the case A-50 named. **(2)** [M-04](M-04-manage-users.md) d7's *no invite step* ends: Add grows credential issuance. **(3)** Whether Managers get stronger credentials than Employees, which has never been decided. **(4)** Decision 9's *what the database trusts is the terminal, not the initials* is the whole of the current security model, and per-User credentials change what row-level security can scope on. **(5)** Decision 17 and [architecture](../architecture.md) A-55 — today the only thing between a departed employee and the till is a server-side refusal at the write path, not a login, and that stops being true the moment there is a login to revoke. **(6)** [M-04](M-04-manage-users.md) d16's initials reuse, which is only tolerable while initials are not a credential. *Accepted consequence:* v1 ships a system in which anyone who can reach a terminal can act as anyone, which decision 3 already chose deliberately and which this row declines to soften — the mitigation is that the trade is recorded, bounded to v1, and has a written way out |
| 19 | **Identification resolves as you type on a full match: no Enter, no OK button, and Escape cancels the action rather than just the dialog.** The counter is the constraint. Decisions 12 and 15 make opening a Sale, recording a pay-out, adjusting on hand and voiding prompt **every time, session or not**, so this runs many times an hour and has to be quick. **The instant what has been typed *is* an active User's initials, that is who it is** and the action proceeds — nothing to press, nothing to confirm. **The match is exact, not a prefix.** Typing `R` does nothing even where R. Delacroix is the only active R; the initials are typed in full. **Prefix resolution was tried first and rejected**, and the reason is worth keeping: it saved one keystroke and made that keystroke **unstable**, because `R` would work until somebody whose initials also begin with R was hired, at which point a colleague's muscle memory stopped working for a reason nothing put in front of the Manager who caused it. Initials are two to four characters (decision 14); the saving was never worth a login that changes under you. **It also removes a case prefix matching could not serve at all:** where `RD` and `RDX` are both on staff, committing on the prefix `RD` makes `RDX` unreachable — under exact matching both are typed and both resolve. **Anything short of a full match resolves to nobody and waits**, so the failure mode is a keystroke, never a misattribution; a string that is still the beginning of somebody's initials reads as *keep typing* rather than as an error, since a person mid-keystroke has not done anything wrong. **Only active Users resolve.** A deactivated User cannot be typed at all — the same refusal decision 17 and [architecture](../architecture.md) A-55 put in the write path, arriving one layer earlier. **The prompt confirms with the person's name, never by echoing the letters back** — initials are reusable ([M-04](M-04-manage-users.md) d16), so the letters are not the confirmation. **Deliberately not a picker:** a list of names would put every prompt behind a read-and-aim and would show the whole staff list to whoever is standing at the counter. *Accepted consequence:* every identification now costs the full initials, which at two to four characters is the price of a login that means the same thing tomorrow as it did today |

---

## Open questions

- **Credentials** — **deferred to a later version**, not open (decision 18). Initials-only is the v1 answer; password, PIN or badge, and whether Managers get stronger credentials than Employees, are decided when the work is scheduled. Decision 18 lists the six things that must be revisited rather than inherited at that point.
- **Multi-store membership** — **deferred to a later version**, not open. The system is multi-store, but v1 scopes a User to one Store (decision 8). Whether a User can later belong to several, and how they switch, is [M-04](M-04-manage-users.md)'s; decision 14's per-Store initials uniqueness reopens with it.
- ~~**Initials collisions.**~~ — **Resolved** by decision 14: initials are unique within a Store, enforced when [M-04](M-04-manage-users.md) creates the User. Whether **deactivated** Users hold their initials against reuse is part of that decision's detail and is recorded in M-04.
- ~~**Does the 15-minute lapse apply during an open Sale?**~~ — **Resolved** by decision 10: it does not. A Sale left part-rung on the counter keeps its terminal alive, and the Sale stays locked to the Employee who opened it ([E-05](E-05-sell-a-record.md) d23).
