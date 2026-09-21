// bank_deposit_void — §6 Ledger
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const BankDepositVoidInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type BankDepositVoidInput = z.infer<typeof BankDepositVoidInput>;

export const BankDepositVoidOutput = z.unknown();
export type BankDepositVoidOutput = z.infer<typeof BankDepositVoidOutput>;

export const bank_deposit_void = stub("bank_deposit_void", BankDepositVoidInput, BankDepositVoidOutput);
