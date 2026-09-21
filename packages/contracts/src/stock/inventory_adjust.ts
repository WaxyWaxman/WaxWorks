// inventory_adjust — §6 Stock; A-67
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const InventoryAdjustInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type InventoryAdjustInput = z.infer<typeof InventoryAdjustInput>;

export const InventoryAdjustOutput = z.unknown();
export type InventoryAdjustOutput = z.infer<typeof InventoryAdjustOutput>;

export const inventory_adjust = stub("inventory_adjust", InventoryAdjustInput, InventoryAdjustOutput);
