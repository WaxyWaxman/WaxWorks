// close_preview — §6 Close
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ClosePreviewInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ClosePreviewInput = z.infer<typeof ClosePreviewInput>;

export const ClosePreviewOutput = z.unknown();
export type ClosePreviewOutput = z.infer<typeof ClosePreviewOutput>;

export const close_preview = stub("close_preview", ClosePreviewInput, ClosePreviewOutput);
