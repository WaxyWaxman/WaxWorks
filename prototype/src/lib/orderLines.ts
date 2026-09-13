import type { Invoice, OrderLineStatus, PendingOrderLine } from "../data/types";

// What a PurchaseOrder line is DOING, derived in one place.
//
// A placed line is never deleted (M-02 d21) — it is Cancelled, or it is
// received — so "does this row exist" stopped being the same question as "is
// this still coming". Every screen that used to read existence has to read
// this instead, or a received copy goes on being advertised as on order.
//
// Only two things are stored: the statuses a person SETS (M-02 d12, d22), and
// the expected date that comes with Shipped. Everything else is counted:
// pending versus ordered from whether the line has a PO number, outstanding
// from the Invoice lines pointing back at it (E-02 d30). Storing either would
// be a second copy of a fact the data already answers, and two copies drift.

/** What has been taken in against this line, across *every* Invoice (E-02 d30). */
export function receivedAgainst(orderId: string, invoices: Invoice[]): number {
  return invoices.reduce(
    (n, iv) => n + iv.lines.filter((l) => l.fromOrderId === orderId).reduce((m, l) => m + l.qty, 0),
    0,
  );
}

/** Ordered minus received, floored at zero — an over-receipt is not a negative
 *  backorder, it is a discrepancy for the Invoice to reconcile. */
export function outstandingQty(order: PendingOrderLine, invoices: Invoice[]): number {
  return Math.max(0, order.qty - receivedAgainst(order.id, invoices));
}

/**
 * Still expected? Cancelled lines are not, however little arrived — that is
 * what cancelling means. Fully received lines are not either. Everything else
 * is, including a Backordered line: the supplier has said it is late, not that
 * it is gone.
 */
export function isOpenOrderLine(order: PendingOrderLine, invoices: Invoice[]): boolean {
  if (order.status === "Cancelled") return false;
  return outstandingQty(order, invoices) > 0;
}

/** Raised but never sent to anyone (M-02 d1), and still expected. */
export function isPendingOrderLine(order: PendingOrderLine, invoices: Invoice[]): boolean {
  return !order.poNumber && isOpenOrderLine(order, invoices);
}

/** Placed with a supplier, and still expected. */
export function isPlacedOrderLine(order: PendingOrderLine, invoices: Invoice[]): boolean {
  return Boolean(order.poNumber) && isOpenOrderLine(order, invoices);
}

export type OrderLineState = "Pending" | "Ordered" | OrderLineStatus | "Received" | "Part received";

/**
 * The one label a line wears. A set status wins over a derived one — somebody
 * said it out loud — except that being fully received wins over everything but
 * Cancelled, because it has demonstrably arrived.
 */
export function orderLineState(order: PendingOrderLine, invoices: Invoice[]): OrderLineState {
  if (order.status === "Cancelled") return "Cancelled";
  const received = receivedAgainst(order.id, invoices);
  if (received >= order.qty) return "Received";
  if (received > 0) return "Part received";
  if (order.status) return order.status;
  return order.poNumber ? "Ordered" : "Pending";
}

/** Whether a state means "nothing more is coming", for screens that hide those. */
export function isClosedState(state: OrderLineState): boolean {
  return state === "Received" || state === "Cancelled";
}
