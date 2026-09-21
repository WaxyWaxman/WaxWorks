// sale_tender — §6 Selling — the heaviest function
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SaleTenderInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SaleTenderInput = z.infer<typeof SaleTenderInput>;

export const SaleTenderOutput = z.unknown();
export type SaleTenderOutput = z.infer<typeof SaleTenderOutput>;

export const sale_tender = stub("sale_tender", SaleTenderInput, SaleTenderOutput);
