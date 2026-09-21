// close_run — §6 Close; A-67, A-83
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const CloseRunInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type CloseRunInput = z.infer<typeof CloseRunInput>;

export const CloseRunOutput = z.unknown();
export type CloseRunOutput = z.infer<typeof CloseRunOutput>;

export const close_run = stub("close_run", CloseRunInput, CloseRunOutput);
