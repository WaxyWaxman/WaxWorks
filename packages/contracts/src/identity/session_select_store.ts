// session_select_store — §6 Identity; E-01 d27
// Any actor. Header per A-103.
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { header, stub } from "../wrapper";

export const SessionSelectStoreInput = header.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SessionSelectStoreInput = z.infer<typeof SessionSelectStoreInput>;

export const SessionSelectStoreOutput = z.unknown();
export type SessionSelectStoreOutput = z.infer<typeof SessionSelectStoreOutput>;

export const session_select_store = stub("session_select_store", SessionSelectStoreInput, SessionSelectStoreOutput);
