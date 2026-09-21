// return_add_line — §6 Selling
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ReturnAddLineInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ReturnAddLineInput = z.infer<typeof ReturnAddLineInput>;

export const ReturnAddLineOutput = z.unknown();
export type ReturnAddLineOutput = z.infer<typeof ReturnAddLineOutput>;

export const return_add_line = stub("return_add_line", ReturnAddLineInput, ReturnAddLineOutput);
