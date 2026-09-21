// actor_resolve — §6 Identity; §5.3, M-04 d15
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const ActorResolveInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ActorResolveInput = z.infer<typeof ActorResolveInput>;

export const ActorResolveOutput = z.unknown();
export type ActorResolveOutput = z.infer<typeof ActorResolveOutput>;

export const actor_resolve = stub("actor_resolve", ActorResolveInput, ActorResolveOutput);
