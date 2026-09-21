// period_is_sealed — §6; A-80 — M5 ships it returning false
// Pure: takes its values as arguments and reads no table (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { stub } from "../wrapper";

export const PeriodIsSealedInput = z.object({
  p_business_date: z.string().date(),
});
export type PeriodIsSealedInput = z.infer<typeof PeriodIsSealedInput>;

export const PeriodIsSealedOutput = z.unknown();
export type PeriodIsSealedOutput = z.infer<typeof PeriodIsSealedOutput>;

export const period_is_sealed = stub("period_is_sealed", PeriodIsSealedInput, PeriodIsSealedOutput);
