// tax_rate_at — §6 pure helpers; A-58
// Pure: takes its values as arguments and reads no table (§6).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { stub } from "../wrapper";

export const TaxRateAtInput = z.object({
  rate_ppm: z.number().int(),
  pending_rate_ppm: z.number().int().nullable(),
  pending_from: z.string().date().nullable(),
  at: z.string().datetime(),
});
export type TaxRateAtInput = z.infer<typeof TaxRateAtInput>;

export const TaxRateAtOutput = z.unknown();
export type TaxRateAtOutput = z.infer<typeof TaxRateAtOutput>;

export const tax_rate_at = stub("tax_rate_at", TaxRateAtInput, TaxRateAtOutput);
