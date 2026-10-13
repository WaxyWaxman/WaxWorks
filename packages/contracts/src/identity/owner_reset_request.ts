// owner_reset_request — §6 Identity — S (A-90, A-113; S-01 d3; M-04 d38)
// A System Administrator sends an Owner a re-enrolment link; logged on the
// Organization, where its Owners read it (O-01 d5). Never the link (A-93).
import { z } from "zod";
import { contract, sysadminHeader } from "../wrapper";

export const OwnerResetRequestInput = sysadminHeader.extend({
  p_org_id: z.string().uuid(),
  p_user_id: z.string().uuid(),
}).strict();
export type OwnerResetRequestInput = z.infer<typeof OwnerResetRequestInput>;

export const OwnerResetRequestOutput = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
});
export type OwnerResetRequestOutput = z.infer<typeof OwnerResetRequestOutput>;

export const owner_reset_request = contract("owner_reset_request", OwnerResetRequestInput, OwnerResetRequestOutput);
