// gl_mapping_set — §6 Ledger
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const GlMappingSetInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type GlMappingSetInput = z.infer<typeof GlMappingSetInput>;

export const GlMappingSetOutput = z.unknown();
export type GlMappingSetOutput = z.infer<typeof GlMappingSetOutput>;

export const gl_mapping_set = stub("gl_mapping_set", GlMappingSetInput, GlMappingSetOutput);
