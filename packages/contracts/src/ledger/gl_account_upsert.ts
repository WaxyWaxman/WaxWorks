// gl_account_upsert — §6 Ledger
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const GlAccountUpsertInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type GlAccountUpsertInput = z.infer<typeof GlAccountUpsertInput>;

export const GlAccountUpsertOutput = z.unknown();
export type GlAccountUpsertOutput = z.infer<typeof GlAccountUpsertOutput>;

export const gl_account_upsert = stub("gl_account_upsert", GlAccountUpsertInput, GlAccountUpsertOutput);
