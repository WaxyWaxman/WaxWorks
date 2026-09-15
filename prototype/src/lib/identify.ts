import type { User } from "../data/types";
import { normalizeInitials } from "./users";

// E-01 identification, resolved AS YOU TYPE.
//
// The counter is the constraint. Identifying yourself happens many times an
// hour — E-01 d12 and d15 make opening a Sale, recording a pay-out, adjusting
// on hand and voiding prompt EVERY time, session or not — so the interaction
// has to be quick. There is no Enter and no OK button: the moment what has
// been typed IS an active person's initials, that is who it is.
//
// EXACT match, not prefix. Typing `R` does nothing even when R. Delacroix is
// the only active R — the initials have to be typed in full. Resolution is
// still as-you-type: the instant what is typed IS somebody's initials, that is
// who it is, with no Enter.
//
// Prefix resolution was tried and rejected. It saved a keystroke and made the
// keystroke unstable: `R` worked until somebody whose initials also start with
// R was hired, at which point a colleague's muscle memory silently stopped
// working, for a reason nothing put in front of the Manager who caused it.
// Initials are two to four characters; the saving was never worth a login that
// changes under you.
//
// Only ACTIVE users can be resolved. A deactivated user's initials are
// released to a new hire (M-04 d16), and a deactivated person must not be able
// to be typed at all (d15, d18).

export type Resolution =
  | { kind: "empty" }
  // Nothing matches yet. `partial` is true when what has been typed is the
  // start of somebody's initials — still worth typing — as against a string
  // that can never become anyone.
  | { kind: "none"; typed: string; partial: boolean }
  | { kind: "one"; user: User };

export function resolveInitials(users: User[], typed: string): Resolution {
  const want = normalizeInitials(typed);
  if (!want) return { kind: "empty" };
  const exact = users.find((u) => u.active && u.initials === want);
  if (exact) return { kind: "one", user: exact };
  const partial = users.some((u) => u.active && u.initials.startsWith(want));
  return { kind: "none", typed: want, partial };
}

// What the prompt says under the field. Kept here rather than in the component
// so the wording is testable and cannot drift from the rule it describes.
export function resolutionHint(r: Resolution): string {
  switch (r.kind) {
    case "empty":
      return "Type your initials.";
    case "none":
      // A partial is not an error — it is somebody halfway through typing, so
      // it must not be dressed as a failure.
      return r.partial ? "Keep typing." : `No active user with initials ${r.typed}.`;
    case "one":
      return r.user.name;
  }
}
