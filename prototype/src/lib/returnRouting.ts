import type { ItemStatus } from "../data/types";

/**
 * E-06 step 6 — where a returned copy goes once the Employee has assessed it.
 */
export type ReturnRoute = "sellable" | "regrade" | "writeoff";

/**
 * Why routing a returned copy is refused, or `undefined`.
 *
 * A-81, A-28a — **routing a returned copy to *written off* IS adjusting on
 * hand**, by another door, so it is manager-only and joins A-28a's list.
 * Architecture §6 gates it as `return_route_stock` **M** where the route is
 * *written off*.
 *
 * E-06 d3's *no time window, no receipt requirement, and no manager approval
 * for a Return* stands whole for the **refund**, which is what it was written
 * about, and does not reach the **stock disposition**, which d7 already holds
 * apart from it. The other two routes stay ungated: A-81 gates the disposition
 * that removes a copy, not the assessment.
 *
 * THIS LIVES IN THE LIB AND NOT IN THE SCREEN — A-4, A-48: a bound enforced in
 * the client is not a bound. Return was the only stock-adjusting surface in the
 * prototype outside the `ManagerAuthorize` caller set; it wrapped the call in
 * `withActor`, which resolves any active user of any role. Ungated, that is a
 * copy taken in over the counter, cash refunded (d4), and the copy removed from
 * stock with no Manager anywhere in the act — the shrinkage path, ungated, in
 * the one flow deliberately ungated everywhere else.
 */
export function routeStockRefusal(to: ReturnRoute, by: string | undefined): string | undefined {
  if (to !== "writeoff") return undefined;
  if (by && by.trim()) return undefined;
  return "Writing off a returned copy adjusts on hand — a Manager has to authorize it (A-28a).";
}

/**
 * The status a routed copy lands on.
 *
 * A-81 gives a write-off its **own** status rather than storing it as `sold`.
 * `written_off` is a departure from on hand exactly as `sold` is, and it is
 * **not a sale** (architecture §5.1). Stored as `sold` a written-off copy was
 * indistinguishable from one somebody bought in every derivation including
 * margin, and it leaves no artifact the way a real sale does — a Sale line is
 * what makes a sale reconstructible and a write-off has none — so the
 * shrinkage figure and the margin figure came out wrong by the same amount
 * with nothing saying so.
 */
export function statusAfterRoute(to: ReturnRoute): ItemStatus {
  return to === "writeoff" ? "written_off" : "sellable";
}
