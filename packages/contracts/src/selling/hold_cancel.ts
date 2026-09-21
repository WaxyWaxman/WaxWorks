// hold_cancel — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const HoldCancelInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type HoldCancelInput = z.infer<typeof HoldCancelInput>;

export const HoldCancelOutput = z.unknown();
export type HoldCancelOutput = z.infer<typeof HoldCancelOutput>;

export const hold_cancel = stub("hold_cancel", HoldCancelInput, HoldCancelOutput);
