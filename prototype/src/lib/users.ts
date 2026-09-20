import { isManagerial, type User, type UserRole } from "../data/types";

// M-04's invariants under the Organization model, as pure functions.
//
// They live here rather than in the store or the screen because architecture
// A-89 puts every one of them in the WRITE PATH — initials and PIN uniqueness
// as function assertions under a lock, the Owner floor as an assertion under a
// lock — and because §6 calls pure helpers the highest-value tests in the
// system. A rule enforced by a disabled button is not enforced; a rule that
// can only be exercised by clicking is not testable.
//
// Every write answers with a REASON rather than a boolean. M-04 d13 has the
// Manager resolve a clash on the spot, and A-54's rule that a refusal must
// name what blocked it applies here too — "no" with no cause reads as the
// system simply refusing. The one deliberate exception is a PIN clash, which
// names nobody (M-04 d32): a PIN is a credential and a refusal that names its
// holder is an oracle.

export type UserWrite =
  | { ok: true; users: User[]; id: string }
  | { ok: false; reason: string };

// M-04 d20 — trimmed and upper-cased ON WRITE, so uniqueness is a plain
// comparison and the stored value is the value everything compares against.
export function normalizeInitials(x: string): string {
  return x.trim().toUpperCase();
}

export function activeManagerCount(users: User[]): number {
  return users.filter((u) => u.active && isManagerial(u.role)).length;
}

export function activeOwnerCount(users: User[]): number {
  return users.filter((u) => u.active && u.role === "Owner").length;
}

const assignedTo = (u: User, storeId: string) => u.assignments.includes(storeId);

// d13 as amended by d16 and d27: unique among the ACTIVE users ASSIGNED TO A
// STORE. A deactivated user's initials are released, which is safe in the data
// because nothing stores the string as identity — and unsafe on paper, which
// is why every audit surface displays the name. Two people in one Organization
// may hold the same initials if no Store has both of them (E-01 d25).
export function initialsHeldBy(
  users: User[],
  initials: string,
  storeId: string,
  exceptId?: string,
): User | undefined {
  const want = normalizeInitials(initials);
  return users.find((u) => u.active && u.id !== exceptId && assignedTo(u, storeId) && u.initials === want);
}

// The same question for a PIN (E-01 d26, M-04 d28): unique among the Managers
// and Owners assigned to a Store. Callers must NOT put the holder's name in a
// refusal (M-04 d32) — this returns the row so the log can say a clash
// happened, not so the screen can say whose.
export function pinHeldBy(users: User[], pin: string, storeId: string, exceptId?: string): User | undefined {
  return users.find(
    (u) => u.active && u.id !== exceptId && isManagerial(u.role) && assignedTo(u, storeId) && u.pin === pin,
  );
}

// d26 — the floor, one level up from d14's. True when removing this user's
// Owner standing would take the ORGANIZATION to zero active Owners. Applies at
// every role, including an Owner acting on themselves; nothing authorises past
// it. There is no per-Store floor any more — a Store may have no Manager
// assigned, and does its manager-only work through an Owner.
export function wouldStrandOrganization(users: User[], userId: string): boolean {
  const u = users.find((x) => x.id === userId);
  if (!u || !u.active || u.role !== "Owner") return false;
  return activeOwnerCount(users) <= 1;
}

const stamp = (text: string, now: () => string) => ({ at: now(), text });
const defaultNow = () => new Date().toISOString().slice(0, 19);

function lastOwnerReason(name: string): string {
  return `${name} is the only active Owner. Make somebody else an Owner first — an Organization always has at least one (M-04 d26).`;
}

// One character is allowed. M-04 d13 never set a minimum — the two-character
// floor was an implementation invention — and a single letter is only safe
// because E-01 d19 matches EXACTLY: `Y` resolves to Y and never shadows YM,
// which is precisely what prefix matching could not do.
export const INITIALS_MIN = 1;

function checkInitials(v: string): string | null {
  if (normalizeInitials(v).length < INITIALS_MIN) return "Initials are required.";
  return null;
}

// E-01 d26 — exactly four digits.
export const PIN_LENGTH = 4;
const PIN_RE = /^\d{4}$/;

function checkPin(v: string): string | null {
  if (!PIN_RE.test(v)) return `A PIN is exactly ${PIN_LENGTH} digits.`;
  return null;
}

// M-04 d32 — the one refusal that names nobody. A Manager may set PINs (d28),
// so a Set PIN that said "that one is R. Delacroix's" would let ten thousand
// tries name every colleague's PIN, and learning one leaves no log row.
export const PIN_CLASH_REASON = "That PIN is in use at this Store. Choose another.";

// M-04 d27 — Employees and Managers hold at least one Store; an Owner may hold
// none, because an Owner's work is the Organization's and a newly invited Owner
// has no Store yet.
function checkAssignments(role: UserRole, assignments: string[]): string | null {
  if (role !== "Owner" && assignments.length === 0)
    return `A ${role} must be assigned to at least one Store (M-04 d27).`;
  return null;
}

// M-04 d29 — a Manager or Owner is invited by email and sets their own
// password through the link, so Add requires an address for them. An Employee
// needs none.
function checkEmail(role: UserRole, email: string | undefined): string | null {
  if (isManagerial(role) && !email?.trim()) return `A ${role} needs an email address — they are invited to set their own password (M-04 d29).`;
  return null;
}

// Initials must be free at EVERY Store the person is assigned to (d27 —
// assignment is the second enforcement point). Names the holder: initials are
// not secret.
function initialsClashAt(users: User[], initials: string, stores: string[], exceptId?: string): string | null {
  for (const storeId of stores) {
    const clash = initialsHeldBy(users, initials, storeId, exceptId);
    if (clash) return `${initials} is already ${clash.name}'s at this Store. Give this person different initials — three letters, or a digit.`;
  }
  return null;
}

function pinClashAt(users: User[], pin: string, stores: string[], exceptId?: string): boolean {
  return stores.some((storeId) => Boolean(pinHeldBy(users, pin, storeId, exceptId)));
}

export function addUser(
  users: User[],
  input: {
    name: string;
    initials: string;
    role: UserRole;
    assignments: string[];
    email?: string;
    // Optional at Add — whether a Manager may be saved without one is M-04's
    // open question. When given, it is checked like `setUserPin`.
    pin?: string;
  },
  by: string,
  opts: { id: string; orgId: string; now?: () => string },
): UserWrite {
  const now = opts.now ?? defaultNow;
  const bad = checkInitials(input.initials);
  if (bad) return { ok: false, reason: bad };
  if (!input.name.trim()) return { ok: false, reason: "A name is required." };
  const badAssign = checkAssignments(input.role, input.assignments);
  if (badAssign) return { ok: false, reason: badAssign };
  const badEmail = checkEmail(input.role, input.email);
  if (badEmail) return { ok: false, reason: badEmail };
  const initials = normalizeInitials(input.initials);
  const clash = initialsClashAt(users, initials, input.assignments);
  if (clash) return { ok: false, reason: clash };
  if (input.pin !== undefined) {
    if (!isManagerial(input.role)) return { ok: false, reason: "An Employee has no PIN (M-04 d28)." };
    const badPin = checkPin(input.pin);
    if (badPin) return { ok: false, reason: badPin };
    if (pinClashAt(users, input.pin, input.assignments)) return { ok: false, reason: PIN_CLASH_REASON };
  }
  const log = [stamp(`Added as ${input.role} by ${by}`, now)];
  if (isManagerial(input.role)) log.push(stamp(`Invite sent to ${input.email!.trim()}`, now));
  if (input.pin !== undefined) log.push(stamp(`PIN set by ${by}`, now));
  const user: User = {
    id: opts.id,
    orgId: opts.orgId,
    name: input.name.trim(),
    initials,
    role: input.role,
    active: true,
    assignments: [...input.assignments],
    email: input.email?.trim() || undefined,
    pin: input.pin,
    log,
  };
  return { ok: true, users: [...users, user], id: opts.id };
}

export function changeUserRole(
  users: User[],
  userId: string,
  role: UserRole,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (u.role === role) return { ok: true, users, id: userId };
  // d26 — leaving Owner is what the floor guards, in either direction down.
  if (u.role === "Owner" && wouldStrandOrganization(users, userId))
    return { ok: false, reason: lastOwnerReason(u.name) };
  // d27 — a Manager or Owner needs a Store unless they are an Owner.
  const badAssign = checkAssignments(role, u.assignments);
  if (badAssign) return { ok: false, reason: badAssign };
  // d29 — promotion into a role that is invited by email needs the address.
  const badEmail = checkEmail(role, u.email);
  if (badEmail) return { ok: false, reason: badEmail };
  const changes = [stamp(`Role: ${u.role} → ${role} (by ${by})`, now)];
  let pin = u.pin;
  // An Employee has no PIN (d28): demotion to Employee clears it, and says so.
  if (!isManagerial(role) && pin !== undefined) {
    pin = undefined;
    changes.push(stamp(`PIN cleared by ${by} — an Employee has none`, now));
  }
  return {
    ok: true,
    id: userId,
    users: users.map((x) => (x.id === userId ? { ...x, role, pin, log: [...x.log, ...changes] } : x)),
  };
}

export function deactivateUser(
  users: User[],
  userId: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (!u.active) return { ok: true, users, id: userId };
  if (wouldStrandOrganization(users, userId)) return { ok: false, reason: lastOwnerReason(u.name) };
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? {
            ...x,
            active: false,
            log: [...x.log, stamp(`Deactivated by ${by} — initials ${x.initials} released`, now)],
          }
        : x,
    ),
  };
}

// d19 — the original row comes back, so one person keeps one history (d5).
// Their initials may have been reissued while they were gone, which is why
// this takes initials rather than assuming the old ones are still free — and
// d27 makes the check run at every Store they return to.
export function reactivateUser(
  users: User[],
  userId: string,
  initials: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (u.active) return { ok: true, users, id: userId };
  const bad = checkInitials(initials);
  if (bad) return { ok: false, reason: bad };
  const next = normalizeInitials(initials);
  const clash = initialsClashAt(users, next, u.assignments, userId);
  if (clash) return { ok: false, reason: clash.replace("is already", "is now") };
  const log = [
    stamp(
      next === u.initials
        ? `Reactivated by ${by}`
        : `Reactivated by ${by} — initials ${u.initials} → ${next} (previous initials reissued)`,
      now,
    ),
  ];
  // Their PIN may have been reissued too. A PIN clash is not a reason to keep
  // somebody out (d19's reasoning for initials applies), so the returning
  // person's PIN is cleared and an Owner or Manager sets a new one (d28).
  let pin = u.pin;
  if (pin !== undefined && pinClashAt(users, pin, u.assignments, userId)) {
    pin = undefined;
    log.push(stamp(`PIN cleared on reactivation — it is now in use at one of their Stores`, now));
  }
  return {
    ok: true,
    id: userId,
    users: users.map((x) => (x.id === userId ? { ...x, active: true, initials: next, pin, log: [...x.log, ...log] } : x)),
  };
}

// d22 — correcting is not reassigning. It changes what one row is CALLED and
// never which row a past action points at, so history follows the correction
// on screen and the log is the only place the old value survives.
export function correctUser(
  users: User[],
  userId: string,
  patch: { name?: string; initials?: string; email?: string },
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  const nextName = patch.name === undefined ? u.name : patch.name.trim();
  const nextInitials = patch.initials === undefined ? u.initials : normalizeInitials(patch.initials);
  const nextEmail = patch.email === undefined ? u.email : patch.email.trim() || undefined;
  if (!nextName) return { ok: false, reason: "A name is required." };
  const bad = checkInitials(nextInitials);
  if (bad) return { ok: false, reason: bad };
  const badEmail = checkEmail(u.role, nextEmail);
  if (badEmail) return { ok: false, reason: badEmail };
  // A deactivated user's initials are not held against anyone (d16), so the
  // uniqueness check only bites while they are active.
  if (u.active) {
    const clash = initialsClashAt(users, nextInitials, u.assignments, userId);
    if (clash) return { ok: false, reason: clash };
  }
  const changes: string[] = [];
  if (nextName !== u.name) changes.push(`Name: ${u.name} → ${nextName}`);
  if (nextInitials !== u.initials) changes.push(`Initials: ${u.initials} → ${nextInitials}`);
  if (nextEmail !== u.email) changes.push(`Email: ${u.email ?? "—"} → ${nextEmail ?? "—"}`);
  if (!changes.length) return { ok: true, users, id: userId };
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? {
            ...x,
            name: nextName,
            initials: nextInitials,
            email: nextEmail,
            log: [...x.log, stamp(`${changes.join("; ")} (by ${by})`, now)],
          }
        : x,
    ),
  };
}

// M-04 d27 — assignment is where initials and PINs collide, and the second
// enforcement point for both. Refuses an initials clash naming the holder and
// a PIN clash naming nobody (d32).
export function assignToStore(
  users: User[],
  userId: string,
  storeId: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (u.assignments.includes(storeId)) return { ok: true, users, id: userId };
  if (u.active) {
    const clash = initialsClashAt(users, u.initials, [storeId], userId);
    if (clash) return { ok: false, reason: clash };
    if (u.pin !== undefined && pinClashAt(users, u.pin, [storeId], userId))
      return { ok: false, reason: PIN_CLASH_REASON };
  }
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? { ...x, assignments: [...x.assignments, storeId], log: [...x.log, stamp(`Assigned to Store ${storeId} by ${by}`, now)] }
        : x,
    ),
  };
}

// d27 — unassigning the last Store of an Employee or a Manager is refused: an
// unassigned Employee can act nowhere and is a deactivation nobody logged.
export function unassignFromStore(
  users: User[],
  userId: string,
  storeId: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (!u.assignments.includes(storeId)) return { ok: true, users, id: userId };
  const next = u.assignments.filter((s) => s !== storeId);
  const bad = checkAssignments(u.role, next);
  if (bad) return { ok: false, reason: `${bad} Deactivate them instead if they are leaving.` };
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? { ...x, assignments: next, log: [...x.log, stamp(`Unassigned from Store ${storeId} by ${by}`, now)] }
        : x,
    ),
  };
}

// M-04 d28 — an Owner or a Manager sets, changes or clears a Manager's or
// Owner's PIN. Logged like any other user change (A-55) — but the LOG NEVER
// CARRIES THE VALUE, and neither does the before-and-after a role change gets,
// because "what did it used to be" is the one question a credential log must
// not answer. An empty string clears it.
export function setUserPin(
  users: User[],
  userId: string,
  pin: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (!isManagerial(u.role)) return { ok: false, reason: `${u.name} is an Employee and has no PIN (M-04 d28).` };
  const next = pin.trim();
  const had = u.pin !== undefined;
  if (!next) {
    if (!had) return { ok: true, users, id: userId };
    return {
      ok: true,
      id: userId,
      users: users.map((x) => (x.id === userId ? { ...x, pin: undefined, log: [...x.log, stamp(`PIN cleared by ${by}`, now)] } : x)),
    };
  }
  const bad = checkPin(next);
  if (bad) return { ok: false, reason: bad };
  if (pinClashAt(users, next, u.assignments, userId)) {
    // d32 — the refusal names nobody, and the attempt is logged against the
    // person it was tried for, so a run of them is visible to an Owner.
    return { ok: false, reason: PIN_CLASH_REASON };
  }
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId ? { ...x, pin: next, log: [...x.log, stamp(`${had ? "PIN changed" : "PIN set"} by ${by}`, now)] } : x,
    ),
  };
}

// d32's second half: a refused clash leaves a trace. Kept separate from
// `setUserPin` so the store can append it without the write having happened.
export function logPinClash(users: User[], userId: string, by: string, now: () => string = defaultNow): User[] {
  return users.map((x) =>
    x.id === userId ? { ...x, log: [...x.log, stamp(`PIN refused — in use at one of their Stores (tried by ${by})`, now)] } : x,
  );
}

// M-04 d29 — a reset is an emailed link the person follows; an administrator
// triggers it and types nothing. The log records that it was sent, never the
// link. No other state changes.
export function requestPasswordReset(
  users: User[],
  userId: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (!isManagerial(u.role)) return { ok: false, reason: `${u.name} is an Employee and has no password to reset (M-04 d29).` };
  if (!u.email) return { ok: false, reason: `${u.name} has no email address to send a link to.` };
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId ? { ...x, log: [...x.log, stamp(`Password reset link sent to ${x.email} (by ${by})`, now)] } : x,
    ),
  };
}

// M-04 d29 — the landing of that link: the person sets their OWN password.
// There is no `by`, because nobody set it for them, and the log says so.
export function setOwnPassword(
  users: User[],
  userId: string,
  password: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  if (!isManagerial(u.role)) return { ok: false, reason: "Only a Manager or Owner holds a personal password (E-01 d27)." };
  if (!u.active) return { ok: false, reason: `${u.name} is no longer an active User.` };
  if (password.length < 8) return { ok: false, reason: "A password is at least 8 characters." };
  return {
    ok: true,
    id: userId,
    users: users.map((x) => (x.id === userId ? { ...x, password, log: [...x.log, stamp("Password set by the user", now)] } : x)),
  };
}

// ---------------------------------------------------------------------------
// RETIRED — E-01 d21's barrier password (superseded by E-01 d29; M-04 d23 by
// d28). These shims exist only so the screens that still call them compile
// until the store and the prompts are reworked; nothing new may use them.
// ---------------------------------------------------------------------------

/** @deprecated E-01 d21 is superseded by d29. Removed with the PIN pad. */
export const PASSWORD_MAX = 8;

/** @deprecated E-01 d21 is superseded by d29. Removed with the PIN pad. */
export function setUserPassword(
  users: User[],
  userId: string,
  password: string,
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  const next = password.trim();
  if (next.length > PASSWORD_MAX)
    return { ok: false, reason: `A password is at most ${PASSWORD_MAX} characters.` };
  const had = Boolean(u.password);
  const has = Boolean(next);
  if (!had && !has) return { ok: true, users, id: userId };
  const what = !has ? "Password cleared" : had ? "Password changed" : "Password set";
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? { ...x, password: has ? next : undefined, log: [...x.log, stamp(`${what} by ${by}`, now)] }
        : x,
    ),
  };
}

/** @deprecated E-01 d21 is superseded by d29. Removed with the PIN pad. */
export function passwordAccepted(user: User, typed: string): boolean {
  if (!user.password) return true;
  return typed === user.password;
}

/** @deprecated E-01 d21's cap went with it (d29, A-88). Removed with the PIN pad. */
export const PASSWORD_LAPSE_CAP_SECONDS = 300;

/** @deprecated The lapse is one dial again (A-88). Removed with the PIN pad. */
export function effectiveLapseSeconds(user: User | null, storeSetting: number): number {
  if (!user?.password) return storeSetting;
  return Math.min(storeSetting, PASSWORD_LAPSE_CAP_SECONDS);
}
