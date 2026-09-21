// suggested_retail — §6 pure helpers; E-02 d49
// Pure: takes its values as arguments and reads no table (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { stub } from "../wrapper";

export const SuggestedRetailInput = z.object({
  list_minor: z.bigint(),
  margin_ppm: z.number().int(),
});
export type SuggestedRetailInput = z.infer<typeof SuggestedRetailInput>;

// §6 line 462: suggested_retail(...) → minor — minor units are bigint, as list_minor is.
export const SuggestedRetailOutput = z.bigint();
export type SuggestedRetailOutput = z.infer<typeof SuggestedRetailOutput>;

export const suggested_retail = stub("suggested_retail", SuggestedRetailInput, SuggestedRetailOutput);
