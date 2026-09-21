// close_undo — §6 Close; A-66, A-84
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const CloseUndoInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type CloseUndoInput = z.infer<typeof CloseUndoInput>;

export const CloseUndoOutput = z.unknown();
export type CloseUndoOutput = z.infer<typeof CloseUndoOutput>;

export const close_undo = stub("close_undo", CloseUndoInput, CloseUndoOutput);
