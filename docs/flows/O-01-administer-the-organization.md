# O-01 — Administer the organization

**Actor:** Owner
**Status:** In clarification
**Related:** [E-01 Authenticate](E-01-authenticate.md) · [M-04 Manage users](M-04-manage-users.md) · [M-06 Configure the store](M-06-settings.md) · [S-01 Onboard and recover organizations](S-01-onboard-and-recover-organizations.md)

**Job:** As an owner, I need to run my Organization — its Stores, their store accounts, and the Managers and Owners who hold them — so that each Store can trade and nobody outside the Organization can reach it.

**Scope note:** This flow is the Organization as a thing an Owner holds. The day-to-day of one Store is [M-06](M-06-settings.md)'s; Employees and the rest of user administration are [M-04](M-04-manage-users.md)'s, which an Owner also does; creating the Organization in the first place, and recovering it when it has no Owner left, is [S-01](S-01-onboard-and-recover-organizations.md)'s. **A consolidated view across Stores is not here** — [architecture](../architecture.md) A-72 deferred it and this flow does not reopen it; an Owner works one Store at a time ([E-01](E-01-authenticate.md) d27) and administers all of them from this screen.

---

## Flow

1. An Owner reaches the Organization screen — on a **personal session** ([E-01](E-01-authenticate.md) d27) nothing is asked; on a **store session** the manager-only line asks for their PIN ([E-01](E-01-authenticate.md) d26). Everything on the screen is **Owner-only** (decision 1): a Manager who crosses the line sees a refusal by name, and the write path refuses a Manager's call regardless of what any screen offered.
2. The screen shows the Organization's **Stores** — Store ID, position, trading name, store account email, active — and its **Owners and Managers**, with their Stores. It shows nothing that any Store sold, holds or owes (decision 4).
3. **Create a Store:** the Owner gives a trading name and a store account email, and sets the store account's password. The system assigns the next seven-digit Store ID and the next position, neither editable afterwards ([M-06](M-06-settings.md) d70). The new Store starts with [M-06](M-06-settings.md)'s defaults (decision 2) and no one assigned; the Owner assigns people to it in [M-04](M-04-manage-users.md).
4. **Reset a store account password:** typed by the Owner and logged as changed, never as a value. Every terminal of that Store is signed out at once ([E-01](E-01-authenticate.md) d24) — this is the kill switch for a terminal nobody can reach (decision 3).
5. **Owners and Managers:** add one — email required, an invite is sent ([M-04](M-04-manage-users.md) d29), a PIN is given ([M-04](M-04-manage-users.md) d28); change a role; assign anyone to any Store ([M-04](M-04-manage-users.md) d27); deactivate. Each is [M-04](M-04-manage-users.md)'s action, reachable from here, and Owner-only because it touches a Manager or Owner ([M-04](M-04-manage-users.md) d30). **The last active Owner cannot be demoted or deactivated**, including by themselves ([M-04](M-04-manage-users.md) d26).
6. _TBD_ — closing a Store, and the Organization's own name and details, are open below.

---

## Requirements

- Everything in this flow is **Owner-only** (decision 1), refused by role in the write path and not merely absent from a Manager's screen.
- A Store's ID and position are assigned by the system at creation and are never editable ([M-06](M-06-settings.md) d47, M-06 d70).
- Every act here is logged with the Owner who did it and the values before and after — the pattern [architecture](../architecture.md) A-55 set for user administration (decision 5).
- The Organization screen reads identity and configuration only: no inventory, Sales, customers, suppliers, ledger or figures of any Store (decision 4).
- An Organization always has at least one active Owner ([M-04](M-04-manage-users.md) d26).
- A store account password is never shown after it is set; the log records that it changed and who changed it (decision 3).

---

## Inherited from other flows

**From [M-04](M-04-manage-users.md):**

- **Three roles; the Owner is the top** (M-04 d25). Everything manager-only is open to an Owner; the short Owner-only list is M-04 d30's and this flow's.
- **The floor is the Organization's last active Owner** (M-04 d26). No Store is required to have a Manager; a Store with none does its manager-only work through an Owner.
- **People are assigned to Stores** (M-04 d27). Owners may hold no assignment; Employees and Managers hold at least one; assignment refuses an initials or PIN clash at that Store.
- **PINs are set by an Owner or a Manager; passwords by their holder through an emailed link** (M-04 d28, M-04 d29). Adding a Manager or Owner here sends the invite.

**From [M-06](M-06-settings.md):**

- **An Owner creates a Store in-product; the system assigns its ID and position; its store account is Owner-only; every setting stays per Store** (M-06 d70). This flow is where that creation happens.

**From [E-01](E-01-authenticate.md):**

- **A terminal signs in with the store account and holds a store session that never lapses; rotating the password signs every terminal out** (E-01 d24).
- **An Owner on a personal session picks any active Store and may switch; a Manager only one they are assigned to** (E-01 d27). Whether a Manager may *read* a sister Store without assignment is an open question this flow owns (below).
- **Owners and Managers use a one-time code or a passkey as a second factor** (E-01 d28).

---

## Resolved decisions

_Numbered so they can be cited precisely. Append only — never renumber or delete._

| # | Decision |
|---|---|
| 1 | **Administering the Organization is Owner-only, in its entirety, and the write path refuses a Manager by role. Decided 2026-09-20 with the Organization model.** The screen is reached like any manager-locked area — by PIN on a store session, by the session itself on a personal one ([E-01](E-01-authenticate.md) d26, E-01 d27) — and then asks a second question the other manager-locked areas do not: *is this an Owner?* A Manager who crosses sees the refusal by name, the way [E-01](E-01-authenticate.md) d23 always named the person it refused, because here the person is known and the secret is not at stake. **Refused in the function, not hidden by the button** — [M-04](M-04-manage-users.md) d30's rule, restated here because this screen is the first whose *entire* surface is above Manager. *Accepted consequence:* a shop whose Owner is away cannot open a Store or rotate a store account until they are back or have made a second Owner, which [M-04](M-04-manage-users.md) d26 already accepted from the other side |
| 2 | **A new Store is created with a trading name and a store account; the system assigns its Store ID and position; it starts from [M-06](M-06-settings.md)'s defaults with nobody assigned.** Receives [M-06](M-06-settings.md) d70 — the *who* and the *where* of the creation M-06 d70 decided. The ID is the next seven-digit value and the position the next integer, minted in the function so two Owners creating two Stores at once cannot collide ([architecture](../architecture.md) A-89 — `store_create`, asserting inside the write on A-55's pattern). **Defaults, not a copy:** a new Store's tax types, tenders, currencies and Sections begin as [M-06](M-06-settings.md) ships them, because a sibling in another province is the wrong thing to copy silently and *copy from a Store* is a convenience this flow has not decided (see Open questions). **Nobody assigned** because assignment is a decision about a person, made in [M-04](M-04-manage-users.md) with that person's other Stores in view. *Accepted consequence:* opening a Store is two screens — create it here, staff it in M-04 — and a Store with nobody assigned cannot cross its own manager-only line until an Owner or Manager is |
| 3 | **The store account password is set by the Owner at the Store's creation and reset by an Owner afterwards; it is typed, logged as changed and never as a value, and a reset signs out every terminal of that Store at once.** The one credential an administrator types ([E-01](E-01-authenticate.md) requirements), because it is a Store's and not a person's: there is no holder to email a link to, and a Store's terminals are set up by whoever is standing at them. **A reset is the kill switch** [E-01](E-01-authenticate.md) d24 named — a terminal left signed in somewhere nobody can reach is signed out by rotating the password from here — and it is deliberately blunt: every terminal of the Store, not one, because the product does not know which terminal is the lost one. *Accepted consequence:* rotating the password on a busy day signs out the counter mid-shift, and re-signing each terminal is the price; a per-terminal sign-out is a plausible later refinement and is not designed here |
| 4 | **The Organization screen shows identity and configuration and nothing a Store sold, holds or owes.** Stores with their identifiers and store account emails; Owners and Managers with their Stores; the logs of this flow's own acts. **No figures, no consolidated anything** — [architecture](../architecture.md) A-72 deferred cross-store consolidation and [E-01](E-01-authenticate.md) d27 has an Owner work one Store at a time; the screen that administers every Store must not become the screen that reports on every Store by accident. When consolidation is designed it gets its own flow, and this row is the line it will have to cross knowingly. *Accepted consequence:* an Owner of three Stores opens three Stores in turn to read three days' takings |
| 5 | **Every act in this flow is logged with the Owner who did it, the timestamp, and the values before and after — on the Store for a Store's change, on the person for a person's, on the Organization for its own.** [architecture](../architecture.md) A-55's rule for user administration, applied to the level above it. Credentials are the exception A-55 already carved: a store account password is logged as changed, never as a value (decision 3), and so is a PIN ([M-04](M-04-manage-users.md) d28). The log is readable by any Owner — and, for what a System Administrator does to an Organization, by its Owners too ([S-01](S-01-onboard-and-recover-organizations.md) d3), because an act done to an Organization from outside it should never be a surprise found later |

---

## Open questions

- **Closing a Store.** Nothing here removes a Store. _Recommended, not yet ratified:_ **deactivate, never delete**, following [M-04](M-04-manage-users.md) d5's shape — the store account stops signing in, the Store's people are left assigned so their history reads correctly, and nothing that Store sold, held or owed is touched. Whether a deactivated Store's position is reused, and what happens to an Open Sale on its terminals, is part of the same answer.
- **The Organization's own name and details.** An Organization has a name ([S-01](S-01-onboard-and-recover-organizations.md) d2). Whether it also carries the **legal entity** — which [M-06](M-06-settings.md) d46 put on each Store as *legal name* for outbound customer invoices — or whether two Stores of one Organization may be two legal entities, is undecided. An Owner editing the name is _recommended, not yet ratified_.
- **Copy settings from a sibling Store at creation.** Decision 2 starts a new Store from defaults. A one-time *copy from* — tax types, tenders, Sections — would save an Owner opening a fifth Store in the same province an afternoon; it is a convenience, and this flow has not decided whether the risk of copying the wrong province's tax is worth it.
- **May a Manager read a sister Store without being assigned to it?** [E-01](E-01-authenticate.md) d27 lets a Manager pick only their assigned Stores on a personal session. Whether an Owner may grant a read-only view of another Store — for a Manager covering a colleague's day off — is a question about assignment's meaning, and this flow owns assignment across the Organization.
- **Consolidated views across Stores.** Deferred by [architecture](../architecture.md) A-72 and kept out by decision 4. The precondition A-72 named — multi-store membership — is now met ([M-04](M-04-manage-users.md) d27), so the question is live again; it is not answered here.
- **Does the store account need a second factor?** Owned by [E-01](E-01-authenticate.md) (E-01 d28's open question); it lands on this flow because an Owner would enrol it.
