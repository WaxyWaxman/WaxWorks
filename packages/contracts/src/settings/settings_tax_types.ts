// settings_tax_types — §6 Settings — derived group: tax_types
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const SettingsTaxTypesInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SettingsTaxTypesInput = z.infer<typeof SettingsTaxTypesInput>;

export const SettingsTaxTypesOutput = z.unknown();
export type SettingsTaxTypesOutput = z.infer<typeof SettingsTaxTypesOutput>;

export const settings_tax_types = stub("settings_tax_types", SettingsTaxTypesInput, SettingsTaxTypesOutput);
