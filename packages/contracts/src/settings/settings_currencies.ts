// settings_currencies — §6 Settings — derived group: currencies
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const SettingsCurrenciesInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SettingsCurrenciesInput = z.infer<typeof SettingsCurrenciesInput>;

export const SettingsCurrenciesOutput = z.unknown();
export type SettingsCurrenciesOutput = z.infer<typeof SettingsCurrenciesOutput>;

export const settings_currencies = stub("settings_currencies", SettingsCurrenciesInput, SettingsCurrenciesOutput);
