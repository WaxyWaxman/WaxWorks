// resolve_scan — §6 scan resolution — read-only
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ResolveScanInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ResolveScanInput = z.infer<typeof ResolveScanInput>;

export const ResolveScanOutput = z.unknown();
export type ResolveScanOutput = z.infer<typeof ResolveScanOutput>;

export const resolve_scan = stub("resolve_scan", ResolveScanInput, ResolveScanOutput);
