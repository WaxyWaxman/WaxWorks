import type { User, UserRole } from "../data/types";

// M-04's two invariants, as pure functions.
//
// They live here rather than in the store or the screen because architecture
// A-55 puts both in the WRITE PATH — a partial unique index on active
// initials, and the last-Manager floor as an assertion under a lock — and
// because §6 calls pure helpers the highest-value tests in the system. A rule
// enforced by a disabled button is not enforced; a rule that can only be
// exercised by clicking is not testable.
//
// Every write answers with a REASON rather than a boolean. M-04 d13 has the
// Manager resolve a clash on the spot, and A-54's rule that a refusal must
// name what blocked it applies here too — "no" with no cause reads as the
// system simply refusing.

export type UserWrite =
  | { ok: true; users: User[]; id: string }
  | { ok: false; reason: string };

// M-04 d20 — trimmed and upper-cased ON WRITE, so uniqueness is a plain
// comparison and the stored value is the value everything compares against.
export function normalizeInitials(x: string): string {
  return x.trim().toUpperCase();
}

export function activeManagerCount(users: User[]): number {
  return users.filter((u) => u.active && u.role === "Manager").length;
}

// d13 as amended by d16: unique among ACTIVE users only. A deactivated user's
// initials are released, which is safe in the data because nothing stores the
// string as identity — and unsafe on paper, which is why every audit surface
// displays the name.
export function initialsHeldBy(
  users: User[],
  initials: string,
  exceptId?: string,
): User | undefined {
  const want = normalizeInitials(initials);
  return users.find((u) => u.active && u.id !== exceptId && u.initials === want);
}

// d14 — the floor. True when removing this user's Manager standing would take
// the Store to zero active Managers. Applies at every role, including a
// Manager acting on themselves; nothing authorises past it, and there is no
// tier above Manager to authorise with (d11).
export function wouldStrandStore(users: User[], userId: string): boolean {
  const u = users.find((x) => x.id === userId);
  if (!u || !u.active || u.role !== "Manager") return false;
  return activeManagerCount(users) <= 1;
}

const stamp = (text: string, now: () => string) => ({ at: now(), text });
const defaultNow = () => new Date().toISOString().slice(0, 19);

function lastManagerReason(name: string): string {
  return `${name} is the only active Manager. Promote somebody else first — a Store always has at least one (M-04 d14).`;
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

export function addUser(
  users: User[],
  input: { name: string; initials: string; role: UserRole },
  by: string,
  opts: { id: string; now?: () => string },
): UserWrite {
  const bad = checkInitials(input.initials);
  if (bad) return { ok: false, reason: bad };
  if (!input.name.trim()) return { ok: false, reason: "A name is required." };
  const initials = normalizeInitials(input.initials);
  const clash = initialsHeldBy(users, initials);
  if (clash)
    return {
      ok: false,
      reason: `${initials} is already ${clash.name}'s. Give this person different initials — three letters, or a digit.`,
    };
  const user: User = {
    id: opts.id,
    name: input.name.trim(),
    initials,
    role: input.role,
    active: true,
    log: [stamp(`Added as ${input.role} by ${by}`, opts.now ?? defaultNow)],
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
  if (role === "Employee" && wouldStrandStore(users, userId))
    return { ok: false, reason: lastManagerReason(u.name) };
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? { ...x, role, log: [...x.log, stamp(`Role: ${x.role} → ${role} (by ${by})`, now)] }
        : x,
    ),
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
  if (wouldStrandStore(users, userId)) return { ok: false, reason: lastManagerReason(u.name) };
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
// this takes initials rather than assuming the old ones are still free.
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
  const clash = initialsHeldBy(users, next, userId);
  if (clash) return { ok: false, reason: `${next} is now ${clash.name}'s. Choose different initials.` };
  return {
    ok: true,
    id: userId,
    users: users.map((x) =>
      x.id === userId
        ? {
            ...x,
            active: true,
            initials: next,
            log: [
              ...x.log,
              stamp(
                next === x.initials
                  ? `Reactivated by ${by}`
                  : `Reactivated by ${by} — initials ${x.initials} → ${next} (previous initials reissued)`,
                now,
              ),
            ],
          }
        : x,
    ),
  };
}

// d22 — correcting is not reassigning. It changes what one row is CALLED and
// never which row a past action points at, so history follows the correction
// on screen and the log is the only place the old value survives.
export function correctUser(
  users: User[],
  userId: string,
  patch: { name?: string; initials?: string },
  by: string,
  now: () => string = defaultNow,
): UserWrite {
  const u = users.find((x) => x.id === userId);
  if (!u) return { ok: false, reason: "No such user." };
  const nextName = patch.name === undefined ? u.name : patch.name.trim();
  const nextInitials = patch.initials === undefined ? u.initials : normalizeInitials(patch.initials);
  if (!nextName) return { ok: false, reason: "A name is required." };
  const bad = checkInitials(nextInitials);
  if (bad) return { ok: false, reason: bad };
  // A deactivated user's initials are not held against anyone (d16), so the
  // uniqueness check only bites while they are active.
  if (u.active) {
    const clash = initialsHeldBy(users, nextInitials, userId);
    if (clash) return { ok: false, reason: `${nextInitials} is already ${clash.name}'s.` };
  }
  const changes: string[] = [];
  if (nextName !== u.name) changes.push(`Name: ${u.name} → ${nextName}`);
  if (nextInitials !== u.initials) changes.push(`Initials: ${u.initials} → ${nextInitials}`);
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
            log: [...x.log, stamp(`${changes.join("; ")} (by ${by})`, now)],
          }
        : x,
    ),
  };
}

// E-01 d21 — an optional password, for anyone, up to 8 characters.
//
// A barrier, not authentication. It exists so that walking up to an unattended
// till and typing a Manager's initials is not enough to reach the manager-only
// space; a shop may reasonably set it to one letter. Nothing here treats it as
// proof of identity, and nothing else in the model gets stronger because it
// exists.
export const PASSWORD_MAX = 8;

// Setting one, clearing one, and changing one are all the same write. Logged
// like any other user change (A-55) — but the LOG NEVER CARRIES THE VALUE, and
// neither does the before-and-after that a role change gets, because "what did
// it used to be" is the one question a password log must not answer.
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

// The check. Separate from resolution on purpose: initials say WHO, this says
// they got past the barrier, and the two are asked at different moments
// (d21 — session opening and manager-only authorisation, not every prompt).
export function passwordAccepted(user: User, typed: string): boolean {
  if (!user.password) return true;
  return typed === user.password;
}

// d21's second half. A user carrying a password has something worth reaching,
// so their session must not sit open for however long the shop set the lapse
// to: it is capped at the 5-minute DEFAULT (M-06 d45), which is the figure
// already judged right for a counter rather than a new one invented here.
// A shop that shortened the lapse keeps its own, shorter, value.
export const PASSWORD_LAPSE_CAP_SECONDS = 300;

export function effectiveLapseSeconds(user: User | null, storeSetting: number): number {
  if (!user?.password) return storeSetting;
  return Math.min(storeSetting, PASSWORD_LAPSE_CAP_SECONDS);
}
