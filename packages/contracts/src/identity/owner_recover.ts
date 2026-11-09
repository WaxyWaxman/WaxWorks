// owner_recover — §6 Identity — S (A-90, A-113, A-146; S-01 d3, d10, d11, d14)
// For an Organization with no active Owner: reactivate a deactivated Owner
// (p_user_id) or write a new Owner and invite them (p_owner_name and
// p_owner_email). Refused while an active Owner exists (A-90) — unless that
// Owner is named in p_replace_user_id: then they are deactivated and the
// restoration happens in the same act (A-146, S-01 d11). A reactivated Owner
// keeps their Stores; clashing initials or a clashing PIN are cleared (S-01
// d10). An invite is logged on the person (S-01 d14). A new Owner invited at a
// replacement may not carry the replaced Owner's email (S-01 d15) — a check on
// stored data, so the function's and the fake's, not the wrapper's.
import { z } from "zod";
import { contract, sysadminHeader } from "../wrapper";

export const OwnerRecoverInput = sysadminHeader.extend({
  p_org_id: z.string().uuid(),
  p_user_id: z.string().uuid().nullable(),
  p_owner_name: z.string().trim().min(1).nullable(),
  p_owner_email: z.string().email().nullable(),
  /** The active, unreachable Owner to replace (A-146); null for the plain recovery. */
  p_replace_user_id: z.string().uuid().nullable(),
}).strict().refine(
  (v) => (v.p_user_id === null) === (v.p_owner_name !== null && v.p_owner_email !== null),
  { error: "either a deactivated Owner to reactivate, or a new Owner's name and email" },
).refine(
  (v) => v.p_replace_user_id === null || v.p_replace_user_id !== v.p_user_id,
  { error: "the Owner replaced cannot be the Owner restored", path: ["p_replace_user_id"] },
);
export type OwnerRecoverInput = z.infer<typeof OwnerRecoverInput>;

export const OwnerRecoverOutput = z.object({
  user_id: z.string().uuid(),
  /** True for a new Owner, or a reactivated one who never enrolled a passkey (A-117). */
  invite: z.boolean(),
  /** Where the Server Action sends the invite; null when `invite` is false (A-118). */
  email: z.string().email().nullable(),
});
export type OwnerRecoverOutput = z.infer<typeof OwnerRecoverOutput>;

export const owner_recover = contract("owner_recover", OwnerRecoverInput, OwnerRecoverOutput);
