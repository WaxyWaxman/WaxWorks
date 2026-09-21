// reconciliation_create — §6 Ledger; A-74
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ReconciliationCreateInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ReconciliationCreateInput = z.infer<typeof ReconciliationCreateInput>;

export const ReconciliationCreateOutput = z.unknown();
export type ReconciliationCreateOutput = z.infer<typeof ReconciliationCreateOutput>;

export const reconciliation_create = stub("reconciliation_create", ReconciliationCreateInput, ReconciliationCreateOutput);
