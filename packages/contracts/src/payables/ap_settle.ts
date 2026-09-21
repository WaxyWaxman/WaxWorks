// ap_settle — §6 Payables; A-38
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ApSettleInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ApSettleInput = z.infer<typeof ApSettleInput>;

export const ApSettleOutput = z.unknown();
export type ApSettleOutput = z.infer<typeof ApSettleOutput>;

export const ap_settle = stub("ap_settle", ApSettleInput, ApSettleOutput);
