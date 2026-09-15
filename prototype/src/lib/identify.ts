import type { User } from "../data/types";
import { normalizeInitials } from "./users";

// E-01 identification, resolved AS YOU TYPE.
//
// The counter is the constraint. Identifying yourself happens many times an
// hour — E-01 d12 and d15 make opening a Sale, recording a pay-out, adjusting
// on hand and voiding prompt EVERY time, session or not — so the interaction
// has to cost a keystroke or two and no more. There is no Enter and no OK
// button: the moment what has been typed can only be one active person, that
// is who it is.
//
// Prefix, not exact match. "R" is enough where R. Delacroix is the only active
// person whose initials start with R; "RD" is needed once R. Mbeki is hired.
// That is the whole trade and it is worth stating plainly: the keystroke that
// worked yesterday can stop working tomorrow, because who else is on the staff
// list changed. It fails SAFE — an ambiguous prefix resolves to nobody and
// waits for another character, so the cost is a keystroke, never a
// misattribution.
//
// Only ACTIVE users can be resolved. A deactivated user's initials are
// released to a new hire (M-04 d16), and a deactivated person must not be able
// to be typed at all (d15, d18).

export type Resolution =
  | { kind: "empty" }
  | { kind: "none"; typed: string }
  | { kind: "one"; user: User }
  | { kind: "many"; candidates: User[]; typed: string };

export function resolveInitials(users: User[], typed: string): Resolution {
  const want = normalizeInitials(typed);
  if (!want) return { kind: "empty" };
  const candidates = users.filter((u) => u.active && u.initials.startsWith(want));
  if (candidates.length === 0) return { kind: "none", typed: want };
  if (candidates.length === 1) return { kind: "one", user: candidates[0] };
  // An exact hit still wins outright when it is also a prefix of somebody
  // else's. Initials are at least two characters (M-04 d13), so this is the
  // "RD typed, RDX also on staff" case rather than a single letter.
  const exact = candidates.find((u) => u.initials === want);
  if (exact) return { kind: "one", user: exact };
  return { kind: "many", candidates, typed: want };
}

// What the prompt says under the field. Kept here rather than in the component
// so the wording is testable and cannot drift from the rule it describes.
export function resolutionHint(r: Resolution): string {
  switch (r.kind) {
    case "empty":
      return "Type your initials.";
    case "none":
      return `No active user with initials starting ${r.typed}.`;
    case "many":
      return `${r.candidates.map((u) => u.initials).join(", ")} — keep typing.`;
    case "one":
      return r.user.name;
  }
}
