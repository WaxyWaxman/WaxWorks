// upc_a_check_digit — §6 pure helpers
// Pure: takes its values as arguments and reads no table (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { stub } from "../wrapper";

export const UpcACheckDigitInput = z.object({
  digits: z.string(),
});
export type UpcACheckDigitInput = z.infer<typeof UpcACheckDigitInput>;

export const UpcACheckDigitOutput = z.unknown();
export type UpcACheckDigitOutput = z.infer<typeof UpcACheckDigitOutput>;

export const upc_a_check_digit = stub("upc_a_check_digit", UpcACheckDigitInput, UpcACheckDigitOutput);
