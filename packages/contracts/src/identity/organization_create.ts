// organization_create — §6 Identity — S (A-90, A-110, A-113; S-01 d2, d5)
// Writes an Organization and its first Owner — a name and an email, no
// initials, no Store — and appends organizations.log with the System
// Administrator's identity. The invite is A-91's, after it commits.
import { z } from "zod";
import { contract, sysadminHeader } from "../wrapper";

export const OrganizationCreateInput = sysadminHeader.extend({
  p_name: z.string().trim().min(1),
  p_owner_name: z.string().trim().min(1),
  p_owner_email: z.string().email(),
}).strict();
export type OrganizationCreateInput = z.infer<typeof OrganizationCreateInput>;

export const OrganizationCreateOutput = z.object({
  org_id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
});
export type OrganizationCreateOutput = z.infer<typeof OrganizationCreateOutput>;

export const organization_create = contract("organization_create", OrganizationCreateInput, OrganizationCreateOutput);
