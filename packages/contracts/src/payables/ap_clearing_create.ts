// ap_clearing_create — §6 Payables; A-38
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ApClearingCreateInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ApClearingCreateInput = z.infer<typeof ApClearingCreateInput>;

export const ApClearingCreateOutput = z.unknown();
export type ApClearingCreateOutput = z.infer<typeof ApClearingCreateOutput>;

export const ap_clearing_create = stub("ap_clearing_create", ApClearingCreateInput, ApClearingCreateOutput);
