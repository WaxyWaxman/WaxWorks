# E-01 — Authenticate to the platform

**Actor:** Employee
**Status:** In clarification
**Related:** [M-04 Manage users](M-04-manage-users.md)

**Job:** As an employee, I need to identify myself to the system so my actions are attributed to me and I can access the till.

---

## Flow

1. A **terminal** presents the till with no active session.
2. Employee enters their **initials** to open a session on that terminal.
3. The session stays active on that terminal for **15 minutes** of inactivity, then lapses.
4. While a session is active, every action taken on that terminal is attributed to that Employee.
5. When no session is active, any action requiring attribution prompts for initials inline and proceeds without opening a full session.
6. A Manager performing a **manager override** enters their own initials at the point of the override; this does not replace the Employee's session.

---

## What a terminal is

A **terminal** is a browser session on a device. Two browsers on the same physical machine are two terminals, each with an independent staff session. Sessions are not shared between devices, and signing in at the counter does not sign anyone in at the receiving desk.

---

## Credentials

**v1 has no passwords.** Identification is by initials only. This is a deliberate trade for counter speed in a small shop where the physical premises are the real access control, and it is expected to be replaced.

The model is built so that adding real credentials later does not change the shape of anything else: actions are attributed to a **User**, sessions belong to a terminal, and the override mechanism is already distinct from the session. Adding a password or PIN step changes how a session is opened and nothing downstream of it.

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

- A **manager override** must be performable at a terminal that currently has an Employee session open, without ending that session.

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

---

## Open questions

- **When do real credentials arrive, and what kind?** Initials-only is explicitly a v1 trade. Password, PIN, or badge — and whether Managers get stronger credentials than Employees ahead of everyone else.
- **Multi-store membership.** The system is multi-store, but v1 scopes a User to one Store. Whether a User can later belong to several, and how they switch, is deferred to [M-04](M-04-manage-users.md).
- **Initials collisions.** Two Employees with the same initials need disambiguation, and initials are not unique in the general case.
- **Does the 15-minute lapse apply during an open Sale?** A Sale left part-rung on the counter while an Employee steps away is the common case; lapsing mid-Sale may be more disruptive than useful.
