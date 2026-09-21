// return_route_stock — §6 Stock — M where the route is written off; A-81
// Manager-only (M): p_manager_pin on a store session (§6, A-89).
// M0 skeleton (A-99): signature and a stub that throws not_implemented. The
// schemas' bodies and the fake's behaviour are the milestone's contract PR.
import { z } from "zod";
import { managerHeader, stub } from "../wrapper";

export const ReturnRouteStockInput = managerHeader.extend({
  // The function's own arguments land in the contract pull request that opens its milestone (A-99).
});
export type ReturnRouteStockInput = z.infer<typeof ReturnRouteStockInput>;

export const ReturnRouteStockOutput = z.unknown();
export type ReturnRouteStockOutput = z.infer<typeof ReturnRouteStockOutput>;

export const return_route_stock = stub("return_route_stock", ReturnRouteStockInput, ReturnRouteStockOutput);
