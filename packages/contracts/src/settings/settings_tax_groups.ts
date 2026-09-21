// settings_tax_groups — §6 Settings — derived group: tax_groups and tax_group_cells
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const SettingsTaxGroupsInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SettingsTaxGroupsInput = z.infer<typeof SettingsTaxGroupsInput>;

export const SettingsTaxGroupsOutput = z.unknown();
export type SettingsTaxGroupsOutput = z.infer<typeof SettingsTaxGroupsOutput>;

export const settings_tax_groups = stub("settings_tax_groups", SettingsTaxGroupsInput, SettingsTaxGroupsOutput);
