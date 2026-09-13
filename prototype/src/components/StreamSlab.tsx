import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "./Chevrons";
import type { PendingOrderLine, Supplier } from "../data/types";
import { daysAgo } from "../lib/totals";

export type StreamChip = "all" | "ready" | "waiting" | "aging" | "email";
export type StreamSort = "ready" | "age" | "supplier" | "cost";

/** One pending stream — a Supplier plus an optional separator (d3, d4). */
export interface StreamRow {
  /** `supplierId::separator` — stable, and what `scope` holds. */
  key: string;
  supplier: Supplier;
  separator?: string;
  lines: PendingOrderLine[];
  unitCount: number;
  sellTotal: number;
  estCost: number;
  customerCount: number;
  oldestAt: string;
  ready: boolean;
  /** How far off the minimum, phrased for the row's caption. */
  shortBy: string;
  /** Whether any of its lines survived the current search. */
  matched: boolean;
}

/** One PurchaseOrder already placed, as the slab lists it. */
export interface PlacedRow {
  poNumber: string;
  supplier?: Supplier;
  separator?: string;
  lines: PendingOrderLine[];
  placedAt: string;
  voided: boolean;
  /** Recorded after being placed elsewhere, so the number is THEIR reference (d25). */
  external: boolean;
  matched: boolean;
}

// Track 1 of Order Processing (M-02 Phase 2). Open it is the search, the
// chips, the sort and two lists; shut it is a 52px strip carrying the expand
// chevron, a ready count and one tile per stream and PO.
//
// It shares .slab-head / .slab-search / .slab-chips / .slab-list / .slab-strip
// and .po-row with Find, Receiving, Customers, Suppliers and On Order rather
// than restating them — one slab, six errands. Like all of those and unlike
// the till rail it PUSHES rather than overlays: you read the list and the
// lines against each other.
//
// Pending streams and placed POs are two different KINDS of scope, so they are
// two bands of one list rather than a toggle. Processing a stream and voiding
// a PO are the same errand at the same desk, and a toggle would make each of
// them somewhere you have to go and find.
export function StreamSlab({
  open,
  onOpenChange,
  query,
  onQueryChange,
  chip,
  onChipChange,
  counts,
  sort,
  onSortChange,
  streams,
  placed,
  totalLines,
  totalReady,
  scope,
  onScopeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
  chip: StreamChip;
  onChipChange: (c: StreamChip) => void;
  counts: Record<StreamChip, number>;
  sort: StreamSort;
  onSortChange: (s: StreamSort) => void;
  streams: StreamRow[];
  placed: PlacedRow[];
  totalLines: number;
  totalReady: number;
  /** "all", a stream key, or `po:<number>`. */
  scope: string;
  onScopeChange: (scope: string) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // This screen begins with a question about somebody specific — a rep on the
  // phone, a supplier chasing an order — so the cursor sits in the search box,
  // the way Find's and Customers' do.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <nav className="op-slab" aria-label="Order streams and purchase orders">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico"
            onClick={() => onOpenChange(true)}
            aria-label={`Expand the stream list (${totalLines} pending lines)`}
            title="Expand — the search is still in there"
          >
            <ChevronRight />
            {totalLines > 0 && <span className="rail-badge">{totalLines}</span>}
          </button>
          {totalReady > 0 && (
            <div
              className="rail-ico"
              aria-label={`${totalReady} streams ready to place`}
              title={`${totalReady} stream${totalReady === 1 ? "" : "s"} over the supplier's minimum`}
              style={{ color: "var(--c-ok)", borderColor: "var(--c-ok)", cursor: "default" }}
            >
              ✓<span className="rail-badge" style={{ background: "var(--c-ok)" }}>{totalReady}</span>
            </div>
          )}
          <div className="rail-sep" />
          <div className="slab-recent" role="list" aria-label="Pending streams and placed purchase orders">
            {streams.length === 0 && placed.length === 0 && (
              <div className="slab-recent-empty">nothing pending</div>
            )}
            {streams.map((s) => (
              <button
                key={s.key}
                type="button"
                role="listitem"
                className={"po-tile" + (scope === s.key ? " on" : "")}
                onClick={() => onScopeChange(s.key)}
                title={`${s.supplier.name}${s.separator ? ` · separator ${s.separator}` : ""} · ${s.lines.length} line${s.lines.length === 1 ? "" : "s"} · ${s.ready ? "ready" : s.shortBy}`}
                aria-label={`${s.supplier.name}, ${s.lines.length} pending lines, ${s.ready ? "ready to place" : s.shortBy}`}
              >
                {s.supplier.shortName.slice(0, 4)}
                <span className={"ord-dot " + (s.ready ? "ready" : "short")} />
              </button>
            ))}
            {placed.length > 0 && <div className="rail-sep" />}
            {placed.map((p) => (
              <button
                key={p.poNumber}
                type="button"
                role="listitem"
                className={"po-tile" + (scope === `po:${p.poNumber}` ? " on" : "")}
                onClick={() => onScopeChange(`po:${p.poNumber}`)}
                title={`${p.poNumber} · ${p.supplier?.shortName ?? ""} · placed ${p.placedAt}${p.voided ? " · voided" : ""}`}
                aria-label={`Purchase order ${p.poNumber}${p.voided ? ", voided" : ""}`}
              >
                {poTail(p.poNumber)}
                <span className={"ord-dot " + (p.voided ? "void" : "placed")} />
              </button>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="op-slab" aria-label="Order streams and purchase orders">
      <div className="slab-head">
        <span className="lab">Order processing</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse the list"
          title="Collapse — the lines take the width"
        >
          <ChevronLeft />
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search streams and purchase orders by supplier, short code, artist or title"
          placeholder="supplier · short code · artist · title"
        />
        <div className="xsmall muted">
          A title filters to the streams that contain it — how you answer “is that one going on the
          next order?” without opening every stream to look.
        </div>
      </div>

      <div className="slab-chips">
        <Chip k="all" chip={chip} onChange={onChipChange} counts={counts} label="All" />
        <Chip k="ready" chip={chip} onChange={onChipChange} counts={counts} label="Ready" go />
        <span className="chip-sep" />
        <Chip k="waiting" chip={chip} onChange={onChipChange} counts={counts} label="Waiting" />
        <Chip k="aging" chip={chip} onChange={onChipChange} counts={counts} label="Aging" />
        <Chip k="email" chip={chip} onChange={onChipChange} counts={counts} label="Email" />
      </div>

      <div className="op-sortbar">
        <span className="lab">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as StreamSort)}>
          <option value="ready">Readiness — sendable first</option>
          <option value="age">Age — oldest line first</option>
          <option value="supplier">Supplier</option>
          <option value="cost">Estimated cost</option>
        </select>
      </div>

      <div className="slab-list">
        <button
          type="button"
          className={"po-row all" + (scope === "all" ? " on" : "")}
          onClick={() => onScopeChange("all")}
        >
          <span className="code">ALL</span>
          <span className="t">Everything pending</span>
          <span className="m">
            {streams.length} stream{streams.length === 1 ? "" : "s"}
          </span>
          <span className={"n" + (totalReady ? " ready" : "")}>{totalLines}</span>
          <span className={"k" + (totalReady ? " ready" : "")}>
            {totalReady ? `${totalReady} ready` : "lines"}
          </span>
        </button>

        <div className="op-band">
          <span className="lab">Pending — not yet placed</span>
          <span className="xsmall mono muted">{streams.length}</span>
        </div>

        {streams.length === 0 && (
          <div className="slab-empty">
            {query ? <>No pending stream matches “{query}”.</> : <>Nothing is waiting to be sent.</>}
          </div>
        )}

        {streams.map((s) => (
          <button
            key={s.key}
            type="button"
            className={"po-row" + (scope === s.key ? " on" : "") + (s.matched ? "" : " dim")}
            onClick={() => onScopeChange(s.key)}
          >
            <span className="code">{s.supplier.shortName.slice(0, 4)}</span>
            <span className="t">
              {s.supplier.name}
              {s.separator && <span className="badge">{s.separator}</span>}
            </span>
            <span className="m">
              <span className={"ord-dot " + (s.ready ? "ready" : "short")} /> {s.supplier.orderVia} ·{" "}
              {daysAgo(s.oldestAt)}d old
              {s.customerCount > 0 && ` · ${s.customerCount} waiting`}
            </span>
            <span className={"n" + (s.ready ? " ready" : "")}>{s.lines.length}</span>
            <span className={"k" + (s.ready ? " ready" : "")}>
              {s.ready ? "ready" : s.shortBy}
            </span>
          </button>
        ))}

        <div className="op-band">
          <span className="lab">Previously placed</span>
          <span className="xsmall mono muted">{placed.length}</span>
        </div>

        {placed.length === 0 && <div className="slab-empty">No PurchaseOrders placed yet.</div>}

        {placed.map((p) => (
          <button
            key={p.poNumber}
            type="button"
            className={
              "po-row" +
              (p.external ? " ext" : "") +
              (p.voided ? " voided" : "") +
              (scope === `po:${p.poNumber}` ? " on" : "") +
              (p.matched ? "" : " dim")
            }
            onClick={() => onScopeChange(`po:${p.poNumber}`)}
          >
            <span className="code">{poTail(p.poNumber)}</span>
            <span className="t">
              <span className="nm">{p.poNumber}</span>
              {p.external && <span className="badge mono xsmall">their ref</span>}
              {p.voided && <span className="badge danger">voided</span>}
            </span>
            <span className="m">
              <span className={"ord-dot " + (p.voided ? "void" : "placed")} />{" "}
              {p.supplier?.shortName ?? "—"} · placed {p.placedAt}
            </span>
            <span className="n">{p.lines.length}</span>
            <span className="k">lines</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Chip({
  k,
  chip,
  onChange,
  counts,
  label,
  go,
}: {
  k: StreamChip;
  chip: StreamChip;
  onChange: (c: StreamChip) => void;
  counts: Record<StreamChip, number>;
  label: string;
  go?: boolean;
}) {
  const n = counts[k];
  return (
    <button
      className={"filter-chip" + (go ? " go" : "") + (chip === k ? " on" : "")}
      onClick={() => onChange(chip === k && k !== "all" ? "all" : k)}
      disabled={k !== "all" && n === 0}
    >
      {label} <span className="count">{n}</span>
    </button>
  );
}

/** The tail of a PO number — what fits on a 44px tile and still identifies it. */
function poTail(poNumber: string): string {
  return poNumber.split(/[-/\s]/).pop()!.slice(-4) || poNumber.slice(-4);
}
