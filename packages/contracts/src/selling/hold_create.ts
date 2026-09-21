// hold_create — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const HoldCreateInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type HoldCreateInput = z.infer<typeof HoldCreateInput>;

export const HoldCreateOutput = z.unknown();
export type HoldCreateOutput = z.infer<typeof HoldCreateOutput>;

export const hold_create = stub("hold_create", HoldCreateInput, HoldCreateOutput);
