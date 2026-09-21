// ledger_posting_create — §6 Ledger; A-74
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const LedgerPostingCreateInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type LedgerPostingCreateInput = z.infer<typeof LedgerPostingCreateInput>;

export const LedgerPostingCreateOutput = z.unknown();
export type LedgerPostingCreateOutput = z.infer<typeof LedgerPostingCreateOutput>;

export const ledger_posting_create = stub("ledger_posting_create", LedgerPostingCreateInput, LedgerPostingCreateOutput);
