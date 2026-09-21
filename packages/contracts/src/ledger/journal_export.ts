// journal_export — §6 Ledger
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const JournalExportInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type JournalExportInput = z.infer<typeof JournalExportInput>;

export const JournalExportOutput = z.unknown();
export type JournalExportOutput = z.infer<typeof JournalExportOutput>;

export const journal_export = stub("journal_export", JournalExportInput, JournalExportOutput);
