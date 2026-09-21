// ap_batch_void — §6 Payables; A-38, A-42
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ApBatchVoidInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ApBatchVoidInput = z.infer<typeof ApBatchVoidInput>;

export const ApBatchVoidOutput = z.unknown();
export type ApBatchVoidOutput = z.infer<typeof ApBatchVoidOutput>;

export const ap_batch_void = stub("ap_batch_void", ApBatchVoidInput, ApBatchVoidOutput);
