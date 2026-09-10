# E-01 — Authenticate to the platform

**Actor:** Employee
**Status:** In clarification
**Related:** [M-04 Manage users](M-04-manage-users.md)

**Job:** As an employee, I need to identify myself to the system so my actions are attributed to me and I can access the till.

---

## Flow

0. A terminal is **enrolled** to a Store once, using a one-time code, and holds that enrollment thereafter (decision 9). Enrollment is what scopes everything the terminal can see to its Store; it is not a staff sign-in.
1. A **terminal** presents the till with no active session.
2. Employee enters their **initials** to open a session on that terminal.
3. The session stays active on that terminal for **15 minutes** of inactivity, then lapses. An **Open Sale suppresses the lapse** on that terminal (decision 10).
4. While a session is active, every action taken on that terminal is attributed to that Employee.
5. When no session is active, any action requiring attribution prompts for initials inline and proceeds without opening a full session.
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

---

## Inherited from other flows

**From [E-02](E-02-receive-inventory.md):**

- Draft Invoices must survive a session timeout mid-scan.

**From [E-05](E-05-sell-a-record.md) and [E-04](E-04-manage-inventory.md):**

- A **manager-only authorization** must be performable at a terminal that currently has an Employee session open, without ending that session. (This was written for the manager override, which [M-04](M-04-manage-users.md) d8 has since replaced with a review queue; the requirement survives for the manager-only list.)

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Terminals are shared; sessions are per-User, opened on a terminal |
| 2 | A terminal is a browser session on a device — two browsers on one machine are two terminals |
| 3 | v1 identification is **initials only**; no passwords, PINs, or fobs |
| 4 | Sessions lapse after **15 minutes** of inactivity |
| 5 | With no active session, actions requiring attribution prompt for initials inline rather than forcing a full sign-in |
| 6 | A manager override is entered at the point of override and does not replace the active Employee session |
| 7 | Draft Invoices survive a session lapse |
| 8 | In v1 a User belongs to exactly one Store |
| 9 | **A terminal enrolls to a Store once** and holds a real authenticated session carrying that Store. Row-level security scopes on the terminal's Store; initials are attribution on top ([architecture](../architecture.md) A-3) |
| 10 | **An Open Sale suppresses the 15-minute lapse** on its terminal. Closes the open question below (A-19a) |

---

## Open questions

- **When do real credentials arrive, and what kind?** Initials-only is explicitly a v1 trade. Password, PIN, or badge — and whether Managers get stronger credentials than Employees ahead of everyone else.
- **Multi-store membership.** The system is multi-store, but v1 scopes a User to one Store. Whether a User can later belong to several, and how they switch, is deferred to [M-04](M-04-manage-users.md).
- **Initials collisions.** Two Employees with the same initials need disambiguation, and initials are not unique in the general case.
- ~~**Does the 15-minute lapse apply during an open Sale?**~~ — **Resolved** by decision 10: it does not. A Sale left part-rung on the counter keeps its terminal alive, and the Sale stays locked to the Employee who opened it ([E-05](E-05-sell-a-record.md) d23).
