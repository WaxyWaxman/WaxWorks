// settings_product_tax_codes — §6 Settings — derived group: product_tax_codes
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const SettingsProductTaxCodesInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type SettingsProductTaxCodesInput = z.infer<typeof SettingsProductTaxCodesInput>;

export const SettingsProductTaxCodesOutput = z.unknown();
export type SettingsProductTaxCodesOutput = z.infer<typeof SettingsProductTaxCodesOutput>;

export const settings_product_tax_codes = stub("settings_product_tax_codes", SettingsProductTaxCodesInput, SettingsProductTaxCodesOutput);
