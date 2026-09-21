// resolve_scan — §6 scan resolution — read-only
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ResolveScanInput = header.extend({
  /** §6 scan resolution: `resolve_scan(p_code)` — the scanned code, branched on by prefix and shape. */
  p_code: z.string(),
});
export type ResolveScanInput = z.infer<typeof ResolveScanInput>;

export const ResolveScanOutput = z.unknown();
export type ResolveScanOutput = z.infer<typeof ResolveScanOutput>;

export const resolve_scan = stub("resolve_scan", ResolveScanInput, ResolveScanOutput);
