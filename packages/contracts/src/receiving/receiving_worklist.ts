// receiving_worklist — §6 Receiving
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ReceivingWorklistInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ReceivingWorklistInput = z.infer<typeof ReceivingWorklistInput>;

export const ReceivingWorklistOutput = z.unknown();
export type ReceivingWorklistOutput = z.infer<typeof ReceivingWorklistOutput>;

export const receiving_worklist = stub("receiving_worklist", ReceivingWorklistInput, ReceivingWorklistOutput);
