import { useEffect, useRef } from "react";
import type { Invoice, PendingOrderLine, RecordEntry, Supplier } from "../data/types";
import { money } from "../lib/money";
import { round2 } from "../lib/totals";
import { useApp } from "../store/AppStore";

// The receiving slab (E-02 d38). Open, it is the worklist d29 asks for —
// outstanding PurchaseOrder lines across every open PO, searchable by title or
// barcode and filterable by PO — with the drafts in flight above it and the
// Invoices received lately below. Shut, it is a 52px bar.
//
// It PUSHES rather than overlays, the way Find's slab does and unlike the till
// rail (E-05 d30). The rail overlays because nothing being read should move
// mid-transaction; receiving is the opposite errand, where the worklist and the
// lines already taken in get read against each other, so an overlay would cover
// the half you are comparing to.

export interface OutstandingLine {
  order: PendingOrderLine;
  record?: RecordEntry;
  /** Ordered minus received against this PO line, derived not stored (d30). */
  outstanding: number;
  /** True once anything has been received against it — partial receipt is not
      modelled in the prototype store, so today this is always false and the
      row reads as a plain ordered quantity rather than a fake "n of m". */
  partiallyReceived: boolean;
}

export function ReceiveSlab({
  open,
  onOpenChange,
  term,
  onTermChange,
  poFilter,
  onPoFilterChange,
  outstanding,
  poCounts,
  drafts,
  recent,
  selectedId,
  onSelect,
  onNewIntake,
  onOpenExisting,
  onPickOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: string;
  onTermChange: (term: string) => void;
  /** null means every open PO. */
  poFilter: string | null;
  onPoFilterChange: (po: string | null) => void;
  outstanding: OutstandingLine[];
  poCounts: { po: string; count: number }[];
  drafts: Invoice[];
  recent: Invoice[];
  selectedId?: string;
  onSelect: (invoiceId: string) => void;
  onNewIntake: () => void;
  onOpenExisting: () => void;
  onPickOrder: (order: PendingOrderLine) => void;
}) {
  const app = useApp();
  const searchRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onOpenChange(false);
      openRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const supplierOf = (iv: Invoice): Supplier | undefined => app.supplierFor(iv.supplierId);
  const copiesIn = (iv: Invoice) => iv.lines.reduce((n, l) => n + l.qty, 0);
  // What is owed on the paperwork: the reconciled figure if one was entered,
  // otherwise the same sum the reconcile track computes. `totalOverride` is
  // unset on an Invoice that reconciled cleanly, so reading it alone would
  // show every tidy invoice as $0.00.
  const invoiceTotal = (iv: Invoice) =>
    iv.totalOverride ??
    round2(iv.lines.reduce((sum, l) => sum + l.cost * l.qty, 0) + iv.tax + iv.freight + iv.misc);

  if (!open) {
    return (
      <nav className="recv-slab" aria-label="Receive">
        <div className="slab-strip">
          {/* The bar's own open control, in the slot the till rail keeps it in.
              Search below also opens the slab, but it opens it to DO something;
              this one just gives the width back. */}
          <button
            ref={openRef}
            type="button"
            className="rail-ico"
            aria-expanded={false}
            aria-label="Open the worklist"
            title="Open worklist"
            onClick={() => onOpenChange(true)}
          >
            <ChevronRight />
          </button>

          <div className="rail-sep" />

          <button
            type="button"
            className="rail-ico accent"
            onClick={onNewIntake}
            aria-label="New intake"
            title="New intake"
          >
            <Plus />
          </button>
          {/* The honesty rule (E-05 d30): the bar has to say there is something
              behind it. Drafts ride this icon rather than Search, because a
              half-finished draft is the thing you can actually lose track of —
              the worklist is reference you go looking for. */}
          <button
            type="button"
            className="rail-ico"
            onClick={onOpenExisting}
            aria-label={`Open an existing invoice — ${drafts.length} draft${drafts.length === 1 ? "" : "s"} in flight`}
            title={`Open existing — ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`}
          >
            <Box />
            {drafts.length > 0 && <span className="rail-badge">{drafts.length}</span>}
          </button>
          <button
            type="button"
            className="rail-ico"
            onClick={() => {
              onOpenChange(true);
              // Opened for an errand, so the first keystroke has somewhere to
              // go. The effect below cannot do this — it would also steal the
              // cursor when the plain chevron opens the slab.
              window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
            aria-label="Search the worklist"
            title="Search — opens the slab with the cursor in the box"
          >
            <Magnifier />
          </button>

          <div className="rail-sep" />

          <div className="slab-recent" role="list" aria-label="Received lately">
            <span className="recv-strip-lab">lately</span>
            {recent.length === 0 && <span className="recv-strip-lab">nothing yet</span>}
            {recent.map((iv) => {
              const sup = supplierOf(iv);
              const copies = copiesIn(iv);
              return (
                <button
                  key={iv.id}
                  type="button"
                  role="listitem"
                  className={"recv-tile" + (iv.id === selectedId ? " on" : "")}
                  onClick={() => onSelect(iv.id)}
                  title={`${sup?.shortName ?? "—"} ${iv.invoiceNumber} — ${iv.status.toLowerCase()}, ${copies} cop${copies === 1 ? "y" : "ies"}`}
                  aria-label={`${sup?.name ?? "Unknown supplier"} ${iv.invoiceNumber}, ${copies} copies`}
                >
                  <span className="tn">{sup?.shortName ?? "—"}</span>
                  <span className="tc">{copies}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="recv-slab" aria-label="Receive">
      <div className="slab-head">
        <span className="lab">Receive</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse the worklist"
          title="Collapse — the invoice takes the width"
        >
          <ChevronLeft />
        </button>
      </div>

      <div className="recv-slab-acts">
        <button className="btn primary" onClick={onNewIntake}>
          + New intake
        </button>
        <button className="btn" onClick={onOpenExisting}>
          Open existing
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          aria-label="Search the worklist — title, artist, barcode, PO number"
          placeholder="title · barcode · PO no."
        />
        {/* Filterable by PO (d29). The chips narrow the same list rather than
            switching to a different one, so the bands never move. */}
        {poCounts.length > 0 && (
          <div className="slab-chips">
            <button
              className={"filter-chip" + (poFilter === null ? " on" : "")}
              onClick={() => onPoFilterChange(null)}
            >
              All POs <span className="count">{outstanding.length}</span>
            </button>
            {poCounts.map(({ po, count }) => (
              <button
                key={po}
                className={"filter-chip" + (poFilter === po ? " on" : "")}
                onClick={() => onPoFilterChange(poFilter === po ? null : po)}
              >
                {po === "unplaced" ? "Not on a PO" : po}{" "}
                <span className="count">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="slab-list">
        <div className="slab-band">
          <span className="lab">In flight</span>
          <span className="lab">
            {drafts.length} draft{drafts.length === 1 ? "" : "s"}
          </span>
        </div>
        {drafts.length === 0 && <p className="xsmall muted slab-empty">No draft open.</p>}
        {drafts.map((iv) => {
          const sup = supplierOf(iv);
          return (
            <button
              key={iv.id}
              className={"wl" + (iv.id === selectedId ? " on" : "")}
              onClick={() => onSelect(iv.id)}
            >
              <span className="recv-art">📦</span>
              <span style={{ minWidth: 0 }}>
                <span className="t">
                  {sup?.shortName} · {iv.invoiceNumber}
                </span>
                <span className="m">
                  {sup?.name} · {iv.intakeMode.toLowerCase()}
                </span>
              </span>
              <span className="n">
                {iv.lines.length}
                <small>line{iv.lines.length === 1 ? "" : "s"}</small>
              </span>
            </button>
          );
        })}

        <div className="slab-band">
          <span className="lab">Outstanding</span>
          <span className="lab">{poFilter ?? "all open POs"}</span>
        </div>
        {outstanding.length === 0 && (
          <p className="xsmall muted slab-empty">
            {term.trim()
              ? "Nothing outstanding matches that."
              : "Nothing outstanding. A cold intake with no PO behind it is fine — start one above."}
          </p>
        )}
        {outstanding.map(({ order, record, outstanding: left, partiallyReceived }) => (
          <button key={order.id} className="wl" onClick={() => onPickOrder(order)}>
            {/* Art is a stored URL (A-14) and the provider misses often, so the
                missing state is designed rather than left to a broken image. */}
            {record ? (
              <span className="recv-art">{record.art}</span>
            ) : (
              <span className="recv-art empty">no art</span>
            )}
            <span style={{ minWidth: 0 }}>
              <span className="t">
                {record ? `${record.artist} — ${record.title}` : order.recordId}
              </span>
              <span className="m">
                {record ? `${record.label} · ${record.catalogNo}` : ""}
                {/* M-02 raises a line before a Manager places it on a PO. It is
                    still something to receive against, but nothing was ordered
                    yet — so the row says which it is. */}
                {order.poNumber ? ` · ${order.poNumber}` : " · not on a PO"}
                {order.customerId ? " · customer hold" : ""}
              </span>
            </span>
            <span className="n">
              {left}
              <small>{partiallyReceived ? `of ${order.qty}` : "ordered"}</small>
            </span>
          </button>
        ))}

        <div className="slab-band">
          <span className="lab">Received lately</span>
          <span className="lab">as-was</span>
        </div>
        {recent.length === 0 && <p className="xsmall muted slab-empty">Nothing received yet.</p>}
        {recent.map((iv) => {
          const sup = supplierOf(iv);
          const copies = copiesIn(iv);
          return (
            <button
              key={iv.id}
              className={"wl" + (iv.id === selectedId ? " on" : "")}
              onClick={() => onSelect(iv.id)}
            >
              <span className="recv-art">🧾</span>
              <span style={{ minWidth: 0 }}>
                <span className="t">
                  {sup?.shortName} · {iv.invoiceNumber}
                </span>
                <span className="m">
                  {iv.status.toLowerCase()} · {copies} cop{copies === 1 ? "y" : "ies"}
                </span>
              </span>
              <span className="n">
                {money(invoiceTotal(iv))}
                <small>total</small>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const ICON = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" } as const;

const ChevronRight = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);
const ChevronLeft = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const Plus = () => (
  <svg {...ICON} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Box = () => (
  <svg {...ICON} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" />
    <path d="M3 7.5L12 12l9-4.5M12 12v9" />
  </svg>
);
const Magnifier = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6" />
    <path d="M15.6 15.6L20 20" />
  </svg>
);
