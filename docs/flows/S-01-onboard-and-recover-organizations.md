# S-01 — Onboard and recover organizations

**Actor:** System Administrator
**Status:** In clarification
**Related:** [O-01 Administer the organization](O-01-administer-the-organization.md) · [M-04 Manage users](M-04-manage-users.md) · [E-01 Authenticate](E-01-authenticate.md)

**Job:** As a system administrator, I need to create an Organization and its first Owner, and restore an Organization's access when it has none, without ever seeing what the Organization sells.

**Scope note:** A System Administrator is WaxWorks staff and is **not a role inside an Organization** ([M-04](M-04-manage-users.md) d25). This flow is the whole of what they can do in the product: bring an Organization into existence, see who its people are, and hand access back when it has been lost. Running an Organization is [O-01](O-01-administer-the-organization.md)'s and its people [M-04](M-04-manage-users.md)'s; nothing a Store sells, holds or owes is reachable from here at all (decision 1). Billing, support tooling outside the product, and anything a System Administrator does with a database console are **out of scope** — this flow is the in-product surface, and the point of writing it is that the in-product surface is small.

---

## Flow

1. A System Administrator signs in with their email and a **passkey** ([E-01](E-01-authenticate.md) d28; decision 4). The session reaches the administration area and nothing else — no Store, no store session, no personal session in any Organization.
2. Sees **identity data across every Organization** (decision 1): Organizations by name; each one's Stores — trading name, Store ID, position, store account email, active; each one's people — name, email, role, active, Store assignments; and the user-change log. Nothing else.
3. **Creates an Organization** (decision 2): a name, and the first Owner's name and email. The Owner receives an invite and sets their own password and second factor ([M-04](M-04-manage-users.md) d29, [E-01](E-01-authenticate.md) d28). The Organization has no Store yet — its Owner creates the first one ([O-01](O-01-administer-the-organization.md) d2). There is no public sign-up.
4. **Recovers access** (decision 3): triggers a password reset for an Owner who has lost theirs; and where an Organization has **no active Owner left** — the one case [M-04](M-04-manage-users.md) d26's floor cannot prevent, because it protects the last Owner from the inside and not from death, departure or a lost second factor — reactivates a deactivated Owner or invites a new one. Every such act is written to the Organization's own log, where its Owners read it afterwards.
5. _TBD_ — what else *edit users* covers for a System Administrator is open below.

---

## Requirements

- A System Administrator reaches identity data only, and the boundary is enforced where the data is read, not by which screens exist (decision 1; [architecture](../architecture.md) — _amendment proposed, not yet ratified_).
- Onboarding is a System Administrator's act; there is no public sign-up (decision 2).
- Every act a System Administrator takes on an Organization is logged in that Organization's own log, readable by its Owners (decision 3; [O-01](O-01-administer-the-organization.md) d5).
- A System Administrator signs in with a passkey; a password alone opens nothing (decision 4).
- A System Administrator never opens a store session or a personal session in any Organization, and never sees a PIN, a password or a store account password.

---

## Inherited from other flows

**From [M-04](M-04-manage-users.md):**

- **A System Administrator is not a fourth role in the Organization** but WaxWorks staff outside it, reaching identity data only (d25).
- **An Organization always has at least one active Owner; recovery of one that has lost its last Owner is a System Administrator's act** (d26).
- **Owners may hold no Store assignment** (d27) — which is what lets an Organization be created before its first Store.
- **Passwords are set by their holder through an emailed link; a System Administrator may trigger a reset for an Owner** (d29).

**From [E-01](E-01-authenticate.md):**

- **A System Administrator signs in with a passkey** (d28).

---

## Resolved decisions

_Numbered so they can be cited precisely. Append only — never renumber or delete._

| # | Decision |
|---|---|
| 1 | **A System Administrator reaches identity data only — Organizations, Stores' identity, people, the user-change log — and nothing a Store sells, holds or owes; there is no *view as* and no store session for them. Decided 2026-09-20 with the Organization model.** *Identity data* is: an Organization's name; each Store's trading name, Store ID, position, store account email and active flag; each person's name, email, role, active flag and Store assignments; and the log of changes to those. **Not** inventory, Sales, Returns, Customers, Suppliers, payables, the ledger, settings, or any figure derived from them. **The boundary is the read path's, not the screen's** — a System Administrator's session must be a principal the database recognises as one that can read the identity tables and no other ([architecture](../architecture.md) A-3 and §11's *nothing gates a read by role* are to be amended — _proposed, not yet ratified_). **No impersonation:** a support case that needs to see a Store's data is done by the Store's Owner showing it, not by WaxWorks staff becoming them. *Accepted consequence:* the WaxWorks team cannot debug a shop's trading data from inside the product, and a data problem becomes a conversation with an Owner plus whatever exists outside the product, which this flow deliberately does not design |
| 2 | **Onboarding is a System Administrator's act: an Organization is created with a name and its first Owner's name and email; the Owner is invited by email; there is no public sign-up.** A new customer of Wax Works is a conversation before it is a row, and the first Owner is somebody WaxWorks has spoken to. The invite is [M-04](M-04-manage-users.md) d29's — the Owner sets their own password and second factor and no administrator ever types it. **No Store is created here:** an Owner creates their first Store in [O-01](O-01-administer-the-organization.md) d2, because the store account is theirs to set (O-01 d3) and the Store's details are theirs to know; a System Administrator with no Store to create has no store account to see. *Accepted consequence:* a new shop's first day has a WaxWorks person in it, which is the intended shape for a product whose customers are counted in dozens; self-service onboarding, if it ever comes, starts by superseding this row |
| 3 | **Recovery is: triggering a password reset for an Owner; and, for an Organization with no active Owner, reactivating a deactivated Owner or inviting a new one. Every act is logged in the Organization's own log, readable by its Owners.** [M-04](M-04-manage-users.md) d26 protects the last Owner from being removed from inside; it cannot protect against death, departure or a lost second factor, and an Organization in that state has no one who can act. **The System Administrator's remedy is the smallest that works:** restore an Owner, not act as one — a reactivation restores the original row ([M-04](M-04-manage-users.md) d19), an invite creates an Owner who then sets their own credentials, and in neither case does WaxWorks staff hold the Organization's access afterwards. **Logged where the Organization reads it** ([O-01](O-01-administer-the-organization.md) d5), so an act done from outside is never discovered by accident. *Accepted consequence:* the person WaxWorks invites as a new Owner is chosen on WaxWorks's judgement of who speaks for the business, which is a judgement the product cannot make and this row does not pretend to |
| 4 | **A System Administrator signs in with a passkey; a password alone opens nothing.** Receives [E-01](E-01-authenticate.md) d28. The account that reaches every Organization's people is the one worth phishing, and a passkey is the credential that cannot be. Owners and Managers are allowed a one-time code because a small shop may own no passkey-capable device; WaxWorks staff are not a small shop. *Accepted consequence:* a System Administrator who loses their passkey is recovered by another System Administrator, outside this flow, and there must therefore always be more than one |

---

## Open questions

- **What does *edit users* cover for a System Administrator?** The description that founded this flow says they can *edit users and recover accounts*. Decision 3 is the recovery half. _Recommended, not yet ratified:_ **correct a person's name or email and re-send their invite** — the things that unblock a lost-access case — and **nothing else**: no PIN, no password, no role change, no assignment, no deactivation, because each of those is an Owner's judgement about their own people.
- **Closing an Organization.** Nothing here removes one. _Recommended, not yet ratified:_ deactivate, never delete, mirroring the recommendation for a Store in [O-01](O-01-administer-the-organization.md); its store accounts and personal sessions stop signing in; its data is retained under whatever the PRD decides for retention ([PRD](../PRD.md) §5's open question).
- **Notifying the Organization.** Decision 3 logs every System Administrator act where Owners read it. Whether the Owners are also **emailed** when one happens — so that a reset nobody asked for is noticed the same day — is _recommended, not yet ratified_.
- **Who watches the System Administrators?** Their acts are logged per Organization (decision 3). Whether there is also a cross-Organization log of everything System Administrators did, readable by System Administrators, and how a System Administrator is created or removed, is undecided and is the architecture's to place.
- **Where does the administration area live?** A route group of the same application or a separate one is a structural choice for [architecture](../architecture.md); this flow only requires that nothing of any Store is reachable from it.
