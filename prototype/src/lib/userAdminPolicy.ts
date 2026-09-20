import { isManagerial, type User, type UserRole } from "../data/types";

// M-04 d30 — what a Manager may do to Users, as a pure policy.
//
// A Manager may add, correct, deactivate, reactivate and assign EMPLOYEES at
// the Stores they are themselves assigned to, and set PINs there. Everything
// that touches a Manager or an Owner — creating one, changing a role to or from
// one, deactivating or reassigning one — is Owner-only. The screen offers what
// the policy allows; the write path refuses what the screen should not have
// offered (A-4, A-48) — which is why this is a function the store calls after
// `requireManager`, and not a set of hidden buttons.
//
// Returns the refusal, or `undefined` when the act is permitted.

export type AdminAction =
  | { kind: "add"; role: UserRole; assignments: string[] }
  | { kind: "changeRole"; from: UserRole; to: UserRole; assignments: string[] }
  | { kind: "deactivate"; role: UserRole; assignments: string[] }
  | { kind: "reactivate"; role: UserRole; assignments: string[] }
  | { kind: "correct"; role: UserRole; assignments: string[] }
  | { kind: "assign"; role: UserRole; storeId: string }
  | { kind: "unassign"; role: UserRole; storeId: string }
  | { kind: "setPin"; role: UserRole; assignments: string[] }
  | { kind: "requestReset"; role: UserRole; assignments: string[] };

const ownerOnly = (what: string) => `${what} is Owner-only (M-04 d30).`;
export const withArticle = (role: UserRole) => (role === "Owner" || role === "Employee" ? `an ${role}` : `a ${role}`);

export function adminRefusal(actor: User, action: AdminAction): string | undefined {
  if (!actor.active || !isManagerial(actor.role)) return "This needs a Manager or Owner (A-28a).";
  // An Owner is bounded by nothing here; the floor (d26) and the clash rules
  // live in the write itself.
  if (actor.role === "Owner") return undefined;

  // From here down the actor is a Manager.
  const mine = new Set(actor.assignments);
  const allMine = (stores: string[]) => stores.length > 0 && stores.every((s) => mine.has(s));
  const outside = "A Manager administers Employees at their own Stores only (M-04 d30).";

  switch (action.kind) {
    case "add":
      if (isManagerial(action.role)) return ownerOnly(`Adding ${withArticle(action.role)}`);
      return allMine(action.assignments) ? undefined : outside;
    case "changeRole":
      // Any role change that touches Manager or Owner on either side.
      return ownerOnly("Changing a role to or from Manager or Owner");
    case "deactivate":
    case "reactivate":
    case "correct":
      if (isManagerial(action.role)) return ownerOnly(`Touching ${withArticle(action.role)}`);
      // d30's "at their own Stores": for an act with no Store argument the
      // narrow reading is used — every Store the Employee holds must be one
      // of the Manager's. The wider reading is M-04's open question.
      return allMine(action.assignments) ? undefined : outside;
    case "assign":
    case "unassign":
      if (isManagerial(action.role)) return ownerOnly(`Reassigning ${withArticle(action.role)}`);
      return mine.has(action.storeId) ? undefined : outside;
    case "setPin":
      // The one thing about a Manager or Owner a Manager may touch (d28): a
      // locked-out Owner at the counter should not need a second Owner.
      if (!isManagerial(action.role)) return "An Employee has no PIN (M-04 d28).";
      return action.assignments.some((s) => mine.has(s)) ? undefined : outside;
    case "requestReset":
      if (!isManagerial(action.role)) return "An Employee has no password to reset (M-04 d29).";
      return action.assignments.some((s) => mine.has(s)) ? undefined : outside;
  }
}
