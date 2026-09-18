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

/**
 * Why a re-graded copy's assessed cost is refused, or `undefined`.
 *
 * A-82 / [E-06](docs/flows/E-06-process-a-return.md) d19 — the minted copy is
 * assessed against its new grade and **capped at the cost the sold copy
 * carried**. Below is sound and is the point: a disc that comes back ruined is
 * worth less than the store paid, and the shortfall posts to its E-04 reason
 * code, where M-07 d6 already sends condition losses.
 *
 * ABOVE IS BARRED, and the reason is arithmetic rather than taste. The only
 * credit M-07 d2 supplies is the copy's own cost, so anything booked above it
 * has no honest home — crediting it recognises income for taking a disc back.
 * E-06 d16 tried exactly that, giving the copy the refund paid, and since a
 * refund normally exceeds cost it wrote Inventory up on almost every return:
 * on the flow's worked example, profit and Inventory were each overstated by
 * $23.49.
 *
 * THE CAP LIVES HERE, not on the screen (A-4, A-48). A-82 says so in terms: a
 * screen that merely declines to offer a higher figure is not a cap.
 */
export function regradeCostRefusal(assessedCost: number, soldCopyCost: number): string | undefined {
  if (!Number.isFinite(assessedCost) || assessedCost < 0) {
    return "A re-graded copy's cost cannot be negative.";
  }
  // Half a cent of slack, so a figure equal to the cap is never refused by
  // floating-point noise — the ordinary case is assessing at or above it.
  if (assessedCost > soldCopyCost + 0.005) {
    return `A re-graded copy cannot be booked above the $${soldCopyCost.toFixed(2)} the sold copy carried — the excess would be income the store did not earn (A-82).`;
  }
  return undefined;
}

/**
 * What a re-grade strands, and therefore what posts to `Damaged`.
 *
 * A-82 / [E-06](docs/flows/E-06-process-a-return.md) d19 — where the copy is
 * assessed BELOW what the sold copy carried, the difference is a **period
 * cost** and posts to its E-04 reason code, which is where M-07 d6 already
 * sends condition losses. Assessed at or above the cap, nothing is stranded
 * and no journal is written at all.
 *
 * Kept here rather than inline in the store so the figure that reaches the
 * ledger is the one a test can read.
 */
export function regradeShortfall(assessedCost: number, soldCopyCost: number): number {
  const gap = soldCopyCost - assessedCost;
  // Sub-cent gaps are not journals. Above the cap is refused elsewhere, and
  // returns 0 here rather than a negative "shortfall".
  return gap > 0.005 ? Math.round(gap * 100) / 100 : 0;
}
