// receiving_history — §6 Receiving
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ReceivingHistoryInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ReceivingHistoryInput = z.infer<typeof ReceivingHistoryInput>;

export const ReceivingHistoryOutput = z.unknown();
export type ReceivingHistoryOutput = z.infer<typeof ReceivingHistoryOutput>;

export const receiving_history = stub("receiving_history", ReceivingHistoryInput, ReceivingHistoryOutput);
