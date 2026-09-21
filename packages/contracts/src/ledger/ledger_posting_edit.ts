// ledger_posting_edit — §6 Ledger; A-74, A-52
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const LedgerPostingEditInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type LedgerPostingEditInput = z.infer<typeof LedgerPostingEditInput>;

export const LedgerPostingEditOutput = z.unknown();
export type LedgerPostingEditOutput = z.infer<typeof LedgerPostingEditOutput>;

export const ledger_posting_edit = stub("ledger_posting_edit", LedgerPostingEditInput, LedgerPostingEditOutput);
