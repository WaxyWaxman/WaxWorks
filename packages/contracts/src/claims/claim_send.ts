// claim_send — §6 Claims; E-04 d22, d23, d26
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ClaimSendInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ClaimSendInput = z.infer<typeof ClaimSendInput>;

export const ClaimSendOutput = z.unknown();
export type ClaimSendOutput = z.infer<typeof ClaimSendOutput>;

export const claim_send = stub("claim_send", ClaimSendInput, ClaimSendOutput);
