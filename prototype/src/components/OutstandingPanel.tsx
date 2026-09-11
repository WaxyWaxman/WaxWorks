import { useMemo, useState } from "react";
import type { Invoice, PendingOrderLine, Supplier } from "../data/types";
import { useApp } from "../store/AppStore";

// The outstanding-orders worklist (E-02 d42). It lives here, in the Invoice
// track, rather than in the left slab: the slab is Invoices, and mixing two
// kinds of thing behind one search box meant neither could be searched.
//
// Scoped to this Invoice's Supplier, spanning all of that Supplier's open POs
// — which is the set d29's "across all open POs" was always for, since the
// reason it gave was that suppliers ship several POs in one box (d28).
//
// BROWSABLE, not only scanned against. Two cases have no barcode to match on:
// seeing what has NOT turned up out of a part-shipped box, which a scan cannot
// answer because it is a negative; and an unbarcoded copy (step 8), whose only
// route to its PO line is being picked from a list — and a line that reaches
// no PO line is a derived backorder that never closes (d30).

export interface OutstandingRow {
  order: PendingOrderLine;
  outstanding: number;
  partiallyReceived: boolean;
  label: string;
  meta: string;
  art?: string;
}

export function OutstandingPanel({
  invoice,
  supplier,
  onPick,
}: {
  invoice: Invoice;
  supplier: Supplier;
  onPick: (order: PendingOrderLine) => void;
}) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [poFilter, setPoFilter] = useState<string | null>(null);

  const rows: OutstandingRow[] = useMemo(() => {
    // Ordered minus received against that PO line across every Invoice (d30).
    // Partial receipt is not modelled in the prototype store — a received line
    // is removed outright — so `received` is 0 today and a row reads as a plain
    // ordered quantity rather than a fake "n of m".
    const receivedAgainst = (orderId: string) =>
      app.invoices.reduce(
        (n, iv) =>
          n + iv.lines.filter((l) => l.fromOrderId === orderId).reduce((m, l) => m + l.qty, 0),
        0,
      );

    return app.pendingOrders
      .filter((o) => o.supplierId === supplier.id)
      .map((order) => {
        const record = app.recordFor(order.recordId);
        const received = receivedAgainst(order.id);
        return {
          order,
          outstanding: Math.max(0, order.qty - received),
          partiallyReceived: received > 0,
          label: record ? `${record.artist} — ${record.title}` : order.recordId,
          meta:
            (record ? `${record.label} · ${record.catalogNo}` : "") +
            // M-02 raises a line before a Manager places it on a PO. It is
            // still something to receive against, but nothing was ordered yet.
            (order.poNumber ? ` · ${order.poNumber}` : " · not on a PO") +
            (order.customerId ? " · customer hold" : ""),
          art: record?.art,
        };
      })
      .filter((r) => r.outstanding > 0)
      .sort(
        (a, b) =>
          (a.order.poNumber ?? "~").localeCompare(b.order.poNumber ?? "~") ||
          a.label.localeCompare(b.label),
      );
  }, [app.pendingOrders, app.invoices, app.records, supplier.id]);

  // Chips come from every open PO for this Supplier, not from the filtered
  // list — otherwise picking one would hide the others and strand you in it.
  const poCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.order.poNumber ?? "unplaced", (counts.get(r.order.poNumber ?? "unplaced") ?? 0) + 1);
    return [...counts.entries()].map(([po, count]) => ({ po, count })).sort((a, b) => a.po.localeCompare(b.po));
  }, [rows]);

  const q = term.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (poFilter && (r.order.poNumber ?? "unplaced") !== poFilter) return false;
    if (!q) return true;
    return (
      r.label.toLowerCase().includes(q) ||
      r.meta.toLowerCase().includes(q) ||
      (r.order.scannedCode ?? "").toLowerCase().includes(q)
    );
  });

  const totalCopies = rows.reduce((n, r) => n + r.outstanding, 0);

  return (
    <div className={"recv-outstanding" + (open ? " open" : "")}>
      <button
        type="button"
        className="recv-outstanding-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lab">Outstanding from {supplier.shortName}</span>
        {/* Shut, the panel still has to say what is behind it — the same
            honesty rule the till rail's badges follow (E-05 d30). */}
        <span className="recv-outstanding-count">
          {rows.length === 0 ? (
            <span className="muted xsmall">nothing on order</span>
          ) : (
            <>
              <strong>{rows.length}</strong> line{rows.length === 1 ? "" : "s"} ·{" "}
              <strong>{totalCopies}</strong> cop{totalCopies === 1 ? "y" : "ies"}
            </>
          )}
        </span>
        <span className="recv-outstanding-chev" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="recv-outstanding-body">
          {rows.length === 0 ? (
            <p className="xsmall muted" style={{ margin: 0 }}>
              {invoice.intakeMode === "Second-hand"
                ? "A second-hand intake has nothing on order behind it — scan the copies in."
                : `Nothing outstanding from ${supplier.name}. A cold invoice with no PO behind it is fine.`}
            </p>
          ) : (
            <>
              <div className="recv-outstanding-controls">
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="title · artist · cat. no. · barcode"
                  aria-label="Search this supplier's outstanding orders"
                />
                {poCounts.length > 1 && (
                  <div className="slab-chips" style={{ border: "none", padding: 0 }}>
                    <button
                      className={"filter-chip" + (poFilter === null ? " on" : "")}
                      onClick={() => setPoFilter(null)}
                    >
                      All <span className="count">{rows.length}</span>
                    </button>
                    {poCounts.map(({ po, count }) => (
                      <button
                        key={po}
                        className={"filter-chip" + (poFilter === po ? " on" : "")}
                        onClick={() => setPoFilter(poFilter === po ? null : po)}
                      >
                        {po === "unplaced" ? "Not on a PO" : po}{" "}
                        <span className="count">{count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="recv-outstanding-list">
                {shown.length === 0 && (
                  <p className="xsmall muted" style={{ margin: 0 }}>
                    Nothing outstanding matches that.
                  </p>
                )}
                {shown.map((r) => (
                  <button key={r.order.id} className="wl" onClick={() => onPick(r.order)}>
                    {/* Art is a stored URL (A-14) and the provider misses
                        often, so the missing state is designed. */}
                    {r.art ? (
                      <span className="recv-art">{r.art}</span>
                    ) : (
                      <span className="recv-art empty">no art</span>
                    )}
                    <span className="t">{r.label}</span>
                    <span className="n">
                      {r.outstanding}
                      <small>{r.partiallyReceived ? `of ${r.order.qty}` : "ordered"}</small>
                    </span>
                    <span className="m">{r.meta}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
