// owner_recover — §6 Identity — S (A-90, A-113; S-01 d3)
// For an Organization with no active Owner: reactivate a deactivated Owner
// (p_user_id) or write a new Owner and invite them (p_owner_name and
// p_owner_email). Refused while an active Owner exists (A-90).
import { z } from "zod";
import { contract, sysadminHeader } from "../wrapper";

export const OwnerRecoverInput = sysadminHeader.extend({
  p_org_id: z.string().uuid(),
  p_user_id: z.string().uuid().nullable(),
  p_owner_name: z.string().trim().min(1).nullable(),
  p_owner_email: z.string().email().nullable(),
}).strict().refine(
  (v) => (v.p_user_id === null) === (v.p_owner_name !== null && v.p_owner_email !== null),
  { error: "either a deactivated Owner to reactivate, or a new Owner's name and email" },
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
