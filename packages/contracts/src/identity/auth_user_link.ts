// auth_user_link — §6 Identity — the service role's alone (A-91, A-113, A-114)
// A header exception (A-113): A-91's Auth write-back. Takes the kind and id of
// the row it completes — a users row, or a stores row for the store account —
// and the new Auth user's id, and nothing else; asserts the caller is the
// service role. Logs the link, never a credential (A-93).
import { z } from "zod";
import { contract } from "../wrapper";

export const AuthUserLinkInput = z.strictObject({
  p_kind: z.enum(["user", "store"]),
  p_row_id: z.string().uuid(),
  p_auth_user_id: z.string().uuid(),
});
export type AuthUserLinkInput = z.infer<typeof AuthUserLinkInput>;

export const AuthUserLinkOutput = z.object({
  kind: z.enum(["user", "store"]),
  row_id: z.string().uuid(),
});
export type AuthUserLinkOutput = z.infer<typeof AuthUserLinkOutput>;

export const auth_user_link = contract("auth_user_link", AuthUserLinkInput, AuthUserLinkOutput);
