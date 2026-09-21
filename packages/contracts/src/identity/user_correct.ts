// user_correct — §6 Identity
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const UserCorrectInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type UserCorrectInput = z.infer<typeof UserCorrectInput>;

export const UserCorrectOutput = z.unknown();
export type UserCorrectOutput = z.infer<typeof UserCorrectOutput>;

export const user_correct = stub("user_correct", UserCorrectInput, UserCorrectOutput);
