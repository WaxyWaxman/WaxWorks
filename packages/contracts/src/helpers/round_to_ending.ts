// round_to_ending — §6 pure helpers; A-47, A-49
// Pure: takes its values as arguments and reads no table (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { stub } from "../wrapper";

export const RoundToEndingInput = z.object({
  minor: z.bigint(),
  ending_minor: z.bigint(),
});
export type RoundToEndingInput = z.infer<typeof RoundToEndingInput>;

// §6 line 461: round_to_ending(...) → bigint.
export const RoundToEndingOutput = z.bigint();
export type RoundToEndingOutput = z.infer<typeof RoundToEndingOutput>;

export const round_to_ending = stub("round_to_ending", RoundToEndingInput, RoundToEndingOutput);
