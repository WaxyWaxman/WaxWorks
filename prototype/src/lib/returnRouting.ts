import { isManagerial, type ItemStatus, type SaleState, type UserRole } from "../data/types";

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
/**
 * The authorizing Manager, as the write path receives them: a **resolved row**,
 * not a typed string. Architecture §6 — *"the id is what the function trusts
 * and the initials are what it displays"*.
 */
export interface AuthorizingManager {
  role: UserRole;
  active: boolean;
  name: string;
}

/**
 * Whether the Return itself may have its stock disposition chosen, before
 * asking who is asking.
 *
 * d29 REVERSES d20's direction, and the reversal is the whole of this change.
 * The disposition is chosen **while the Return is still a draft**, and
 * finishing refuses while any returned line is undecided (see
 * `finishReturnRefusal`). So the refusal here is no longer *not yet finished*
 * but *already finished*: at finish the choice was carried out, and a finished
 * artifact is immutable like every other one here (M-07 d8 — a correction
 * posts forward, never back onto the original).
 *
 * WHAT d20 WAS PROTECTING IS KEPT, and it is not this function that keeps it.
 * d20 forbade routing on a draft because routing one MINTED a sellable copy at
 * a grade and price the Employee chose, with no refund paid and no tendered
 * document. d29 keeps that closed by separating the CHOICE from the EFFECTS:
 * choosing records `routedTo` on the line and mints nothing, and the mint, the
 * shelf move and the write-off adjustment all run inside the finish act. An
 * abandoned draft therefore leaves no copy behind, which is the invariant
 * E-06-T23 exists to hold.
 *
 * d22 survives untouched and is checked FIRST, because it is the more specific
 * refusal and the more useful sentence: a void says the return did not happen.
 * Under d30 a void also UN-ROUTES, so there is genuinely nothing left to
 * re-route, and the finished test is still the Sale number, which a void
 * RETAINS ([E-05](docs/flows/E-05-sell-a-record.md) d31).
 *
 * d23 is retired as moot by d29: routing can no longer outlive the close
 * because it can no longer outlive the document.
 */
export function routeDocumentRefusal(sale: {
  saleNumber?: number;
  state: SaleState;
}): string | undefined {
  if (sale.state === "Void") {
    return "This Return was voided — the money went back and the copy went with the customer, so there is nothing to route (E-06 decision 22).";
  }
  if (sale.saleNumber) {
    return "This Return is finished — its stock disposition was chosen and carried out when it was finished, and a finished Return is not re-routed (E-06 decision 29).";
  }
  return undefined;
}

/**
 * A returned line as the finish gate sees it.
 */
export interface ReturnLineDisposition {
  qty: number;
  inventoryItemId?: string;
  routedTo?: ReturnRoute;
  /** What to call this line in a refusal — the Record, as the counter reads it. */
  describe: string;
}

/**
 * Why finishing a Return is refused, or `undefined`.
 *
 * d29 — a Return cannot be finished until every returned line carries a stock
 * disposition. This is the gate the decision adds, and the reason it is worth
 * adding: before it, a finished Return could leave the counter with its copy
 * in limbo — off the shelf per the Requirements and not yet anywhere else,
 * with the customer gone and nothing in the flow saying where an Employee
 * would ever see it again.
 *
 * IT NAMES THE LINE rather than reporting that something is incomplete. A
 * Return with four lines and one undecided is the case that matters, and
 * "something is missing" sends the Employee hunting.
 *
 * IN THE LIB AND NOT THE SCREEN (A-4, A-48). A disabled Finish button is not a
 * gate — E-06-T22 asserts the refusal on the write path for the same reason
 * A-82 says a screen that declines to offer a higher figure is not a cap.
 *
 * Only lines that took stock in are gated: a negative-quantity line carrying an
 * `inventoryItemId`. A refund-only line has no copy to dispose of.
 */
export function finishReturnRefusal(
  lines: ReadonlyArray<ReturnLineDisposition>,
): string | undefined {
  const undecided = lines.filter((l) => l.qty < 0 && l.inventoryItemId && !l.routedTo);
  if (undecided.length === 0) return undefined;
  const first = undecided[0].describe;
  if (undecided.length === 1) {
    return `${first} has no stock disposition — route it before finishing this Return (E-06 decision 29).`;
  }
  return `${undecided.length} returned lines have no stock disposition, starting with ${first} — route them before finishing this Return (E-06 decision 29).`;
}

/**
 * Why voiding a Return is refused on account of its stock, or `undefined`.
 *
 * d30 SUPERSEDES d10's blanket refusal. d10 refused a void while any returned
 * copy was routed, which was nearly harmless while routing was optional and
 * total once d29 makes every finished Return a routed one: it would have
 * forbidden every void, and with it every EDIT, which
 * [E-05](docs/flows/E-05-sell-a-record.md) d31 defines as a Void plus a
 * re-ring. Losing the ability to CANCEL a Return was arguable; losing the
 * ability to CORRECT one was not, and nothing had noticed the two travel
 * together.
 *
 * THE CONDITION IS STATED AS WHAT MUST BE TRUE, not as what is forbidden: the
 * copy must still be as the routing left it. d10's reasoning — "putting it
 * back is a different operation from voiding the paperwork" — is true exactly
 * when somebody else has acted on the copy since, and d10 read that as always.
 *
 * The refusal NAMES THE COPY AND WHAT HAPPENED TO IT. "A copy is routed" tells
 * a counter nothing it can act on; "copy 200000090001 has been sold since" does.
 *
 * `copy` is whichever copy the routing PRODUCED — the copy itself where it went
 * back to the shelf or was written off, and the MINTED one where the route was
 * a re-grade or d24's unmatched arrival.
 */
export function unrouteRefusal(
  route: ReturnRoute,
  copy: { internalBarcode: string; status: ItemStatus } | undefined,
): string | undefined {
  if (!copy) {
    return "The copy this Return routed cannot be found, so its routing cannot be undone (E-06 decision 30).";
  }
  if (copy.status === statusAfterRoute(route)) return undefined;
  const became =
    copy.status === "sold"
      ? "has been sold since"
      : copy.status === "held"
        ? "is reserved on another Sale"
        : copy.status === "written_off"
          ? "has been written off since"
          : "is back on the shelf";
  return `Copy ${copy.internalBarcode} ${became} — it is no longer as the routing left it, so this Return cannot be voided (E-06 decision 30).`;
}

export function routeStockRefusal(
  to: ReturnRoute,
  manager: AuthorizingManager | undefined,
): string | undefined {
  if (to !== "writeoff") return undefined;
  if (!manager) {
    return "Writing off a returned copy adjusts on hand — a Manager has to authorize it (A-28a).";
  }
  // A ROLE CHECK, not a presence check. This took any non-empty string, so
  // `routeStockRefusal("writeoff", "Marty Ng (Employee)")` was permitted and
  // the only thing testing Manager-ness was ManagerAuthorize — the screen.
  // That is the shape A-4 and A-48 exist to refuse, and A-81 says it of this
  // gate by name: "the enforcement point is the definer function and nowhere
  // else". The product enforces it in `manager_authorize`, which resolves an
  // active Manager at the moment of the call (§6); this is the prototype
  // standing in the same place, so a walk of the gate means something.
  if (!manager.active) {
    return `${manager.name} is not an active User — this needs a Manager (A-28a).`;
  }
  if (!isManagerial(manager.role)) {
    return `${manager.name} is an ${manager.role} — this needs a Manager or Owner (A-28a).`;
  }
  return undefined;
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
