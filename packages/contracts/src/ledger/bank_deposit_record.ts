// bank_deposit_record — §6 Ledger
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const BankDepositRecordInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type BankDepositRecordInput = z.infer<typeof BankDepositRecordInput>;

export const BankDepositRecordOutput = z.unknown();
export type BankDepositRecordOutput = z.infer<typeof BankDepositRecordOutput>;

export const bank_deposit_record = stub("bank_deposit_record", BankDepositRecordInput, BankDepositRecordOutput);
