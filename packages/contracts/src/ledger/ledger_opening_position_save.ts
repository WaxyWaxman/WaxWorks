// ledger_opening_position_save — §6 Ledger; A-74, A-78
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const LedgerOpeningPositionSaveInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type LedgerOpeningPositionSaveInput = z.infer<typeof LedgerOpeningPositionSaveInput>;

export const LedgerOpeningPositionSaveOutput = z.unknown();
export type LedgerOpeningPositionSaveOutput = z.infer<typeof LedgerOpeningPositionSaveOutput>;

export const ledger_opening_position_save = stub("ledger_opening_position_save", LedgerOpeningPositionSaveInput, LedgerOpeningPositionSaveOutput);
