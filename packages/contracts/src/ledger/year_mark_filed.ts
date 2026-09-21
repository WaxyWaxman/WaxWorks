// year_mark_filed — §6 Ledger; A-74, A-77
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const YearMarkFiledInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type YearMarkFiledInput = z.infer<typeof YearMarkFiledInput>;

export const YearMarkFiledOutput = z.unknown();
export type YearMarkFiledOutput = z.infer<typeof YearMarkFiledOutput>;

export const year_mark_filed = stub("year_mark_filed", YearMarkFiledInput, YearMarkFiledOutput);
