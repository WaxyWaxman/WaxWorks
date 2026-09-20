import { isManagerial, type Store, type Sysadmin, type User } from "../data/types";

// The three doors of E-01 (d24, d27, d28) and S-01 (d4), as pure functions.
//
// Everything here is a STAND-IN for Supabase Auth (A-87). The prototype has no
// server, so passwords are compared in memory, the one-time code is a
// constant, and a passkey is a button — every one labelled as a fake on the
// screen that shows it. What this file is for is the RULES around the doors:
// who may open which, what a refusal says, and that a refusal says the same
// thing whatever the cause.

export type SignIn<T> = { ok: true; value: T } | { ok: false; refusal: string };

// One wording for every failure. A sign-in that says "no such account" for one
// email and "wrong password" for another lets a stranger enumerate the shop's
// addresses; the store account and the personal session are both worth that
// care (A-87's shared-secret consequence, §10).
export const SIGN_IN_REFUSAL = "That email and password were not accepted.";

// E-01 d24 — a terminal signs in with the Store's store account and holds a
// store session. An inactive Store's account opens nothing.
export function signInStoreAccount(stores: Store[], email: string, password: string): SignIn<{ storeId: string }> {
  const want = email.trim().toLowerCase();
  const s = stores.find((x) => x.accountEmail === want);
  if (!s || !s.active || s.accountPassword !== password) return { ok: false, refusal: SIGN_IN_REFUSAL };
  return { ok: true, value: { storeId: s.id } };
}

// E-01 d27 — a Manager or Owner signs in as themselves. An Employee has no
// personal session and is refused with the SAME wording as a wrong password:
// the door does not explain itself.
export function signInPersonal(users: User[], email: string, password: string): SignIn<{ userId: string }> {
  const want = email.trim().toLowerCase();
  const u = users.find((x) => x.email?.toLowerCase() === want);
  if (!u || !u.active || !isManagerial(u.role) || !u.password || u.password !== password)
    return { ok: false, refusal: SIGN_IN_REFUSAL };
  return { ok: true, value: { userId: u.id } };
}

// E-01 d28 — the second factor. The prototype's one-time code is a constant,
// shown on the screen that asks for it, because there is no phone to send it
// to; the rule under test is that the personal session is not open until it
// is entered.
export const OTP_CODE = "000000";
export const OTP_REFUSAL = "That code was not accepted.";

export function otpAccepted(typed: string): boolean {
  return typed.trim() === OTP_CODE;
}

// S-01 d4 — a System Administrator signs in with a passkey; a password alone
// opens nothing, so there is no password here to check. The prototype's
// passkey is a button; what this resolves is that the email names a System
// Administrator and nobody else — never a User, however senior (S-01 d1).
export function signInSysadmin(sysadmins: Sysadmin[], email: string): SignIn<{ sysadminId: string }> {
  const want = email.trim().toLowerCase();
  const sa = sysadmins.find((x) => x.email.toLowerCase() === want);
  if (!sa) return { ok: false, refusal: "That passkey is not registered to a System Administrator." };
  return { ok: true, value: { sysadminId: sa.id } };
}

// E-01 d27 — which Stores a personal session may pick. An Owner any active
// Store of the Organization; a Manager only one they are assigned to. Whether
// a Manager may READ a sister Store without assignment is O-01's open question,
// so this is the narrow answer until it is decided.
export function selectableStores(stores: Store[], user: User): Store[] {
  return stores.filter(
    (s) => s.active && s.orgId === user.orgId && (user.role === "Owner" || user.assignments.includes(s.id)),
  );
}
