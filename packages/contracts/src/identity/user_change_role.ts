// user_change_role — §6 Identity
// Owner-only (O): resolves as M, then asserts the person is an Owner (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const UserChangeRoleInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type UserChangeRoleInput = z.infer<typeof UserChangeRoleInput>;

export const UserChangeRoleOutput = z.unknown();
export type UserChangeRoleOutput = z.infer<typeof UserChangeRoleOutput>;

export const user_change_role = stub("user_change_role", UserChangeRoleInput, UserChangeRoleOutput);
