import { useEffect, useRef } from "react";
import type { PendingOrderLine, Supplier } from "../data/types";
import { daysAgo } from "../lib/totals";
import { ChevronLeft, ChevronRight } from "./Chevrons";

export type OrderChip = "all" | "late" | "shipped" | "backordered" | "part" | "waiting";
export type OrderSort = "age" | "title" | "artist";

/** One open PurchaseOrder, as the slab lists it. */
export interface PoRow {
  poNumber: string;
  supplier?: Supplier;
  lines: PendingOrderLine[];
  /** The oldest line's placed date — a PO is as old as its oldest line. */
  oldest: string;
  overdue: number;
  /** Recorded after being placed elsewhere, so the number is THEIR reference (d25). */
  external: boolean;
  /** Whether any of its lines survived the current search. */
  matched: boolean;
}

// Track 1 of What's on Order (M-02 Phase 3). Open it is the search, the scan,
// the chips, the sort and the open POs; shut it is a 52px strip carrying the
// new-order button, an overdue badge and the POs tiled by their number's tail.
//
// It shares .slab-head / .slab-search / .slab-chips / .slab-list / .slab-strip
// with Find, Receiving, Customers and Suppliers rather than restating them —
// one slab, five errands. Like all of those and unlike the till rail it PUSHES
// rather than overlays: you read the list and the lines against each other.
//
// Two controls that do different jobs and are drawn differently, on purpose:
// the CHIPS filter lines and their counts are lines; a PO ROW scopes the
// middle track and its figure is that order's open lines. "Everything on
// order" is a permanent first row rather than a state you have to find your
// way back to — step 9 lists lines oldest first ACROSS everything, and a slab
// that made you pick a PO first would quietly retire that.
export function OrderSlab({
  open,
  onOpenChange,
  query,
  onQueryChange,
  onScan,
  chip,
  onChipChange,
  counts,
  sort,
  onSortChange,
  pos,
  totalLines,
  totalOverdue,
  scope,
  onScopeChange,
  onNewBatch,
  draftLineCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onScan: (code: string) => void;
  chip: OrderChip;
  onChipChange: (c: OrderChip) => void;
  counts: Record<OrderChip, number>;
  sort: OrderSort;
  onSortChange: (s: OrderSort) => void;
  pos: PoRow[];
  totalLines: number;
  totalOverdue: number;
  /** "all", or a PO number. */
  scope: string;
  onScopeChange: (scope: string) => void;
  onNewBatch: () => void;
  /** Lines held in the open draft batch — 0 when there is none (d30). */
  draftLineCount: number;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // This screen begins with a question about something specific — a customer
  // ringing about their record, a supplier on the phone — so the cursor sits
  // in the search box, the way Find's and Customers' do.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // d30 — a batch you can leave but cannot find again is a batch you have
  // lost, so an open draft is advertised in BOTH slab states.
  const resuming = draftLineCount > 0;

  if (!open) {
    return (
      <nav className="wo-slab" aria-label="Purchase orders">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico"
            onClick={() => onOpenChange(true)}
            aria-label={`Expand the order list (${totalLines} lines)`}
            title="Expand — the search is still in there"
          >
            <ChevronRight />
            {totalLines > 0 && <span className="rail-badge">{totalLines}</span>}
          </button>
          <button
            type="button"
            className={"rail-ico" + (resuming ? " accent" : "")}
            onClick={onNewBatch}
            aria-label={
              resuming
                ? `Resume the open batch, ${draftLineCount} lines`
                : "Record an order placed elsewhere"
            }
            title={
              resuming
                ? `Resume the open batch — ${draftLineCount} line${draftLineCount === 1 ? "" : "s"}`
                : "Record an order placed elsewhere"
            }
          >
            {resuming ? "↩" : "＋"}
            {resuming && <span className="rail-badge">{draftLineCount}</span>}
          </button>
          <div className="rail-sep" />
          <div className="slab-recent" role="list" aria-label="Open purchase orders">
            {pos.length === 0 && <div className="slab-recent-empty">nothing on order</div>}
            {pos.map((po) => (
              <button
                key={po.poNumber}
                type="button"
                role="listitem"
                className={"po-tile" + (scope === po.poNumber ? " on" : "")}
                onClick={() => onScopeChange(po.poNumber)}
                title={`${po.poNumber} · ${po.supplier?.shortName ?? ""} · ${po.lines.length} line${po.lines.length === 1 ? "" : "s"}${po.overdue ? ` · ${po.overdue} overdue` : ""}`}
                aria-label={`Purchase order ${po.poNumber}, ${po.lines.length} lines${po.overdue ? `, ${po.overdue} overdue` : ""}`}
              >
                {poTail(po.poNumber)}
                <span className={"ord-dot " + dotState(po)} />
              </button>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="wo-slab" aria-label="Purchase orders">
      <div className="slab-head">
        <span className="lab">On order</span>
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

      <div className="wo-slab-acts">
        <button className={"btn" + (resuming ? " accent" : "")} onClick={onNewBatch}>
          {resuming
            ? `↩ Resume batch — ${draftLineCount} line${draftLineCount === 1 ? "" : "s"}`
            : "＋ Order placed elsewhere"}
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search on-order lines by artist, title, catalog number, PO or supplier"
          placeholder="artist · title · cat no. · PO · supplier"
        />
        {/* A scan is how you look up the line in your hand, so the box is a
            peer of the search rather than a control tucked under it. */}
        <div className="wo-scanbox">
          <span className="lab">Scan</span>
          <input
            ref={scanRef}
            type="text"
            placeholder="barcode"
            aria-label="Scan a barcode to filter the lines"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const code = e.currentTarget.value.trim();
              if (!code) return;
              onScan(code);
              e.currentTarget.value = "";
            }}
          />
        </div>
        <div className="xsmall muted">
          Search and scan both filter the lines (step 10). A scan matching no catalog UPC falls
          back to a keyword.
        </div>
      </div>

      <div className="slab-chips">
        <Chip k="all" chip={chip} onChange={onChipChange} counts={counts} label="All" />
        <Chip k="late" chip={chip} onChange={onChipChange} counts={counts} label="Overdue" hot />
        <span className="chip-sep" />
        <Chip k="shipped" chip={chip} onChange={onChipChange} counts={counts} label="Shipped" />
        <Chip
          k="backordered"
          chip={chip}
          onChange={onChipChange}
          counts={counts}
          label="Backordered"
        />
        <Chip k="part" chip={chip} onChange={onChipChange} counts={counts} label="Part rec'd" />
        <Chip k="waiting" chip={chip} onChange={onChipChange} counts={counts} label="Waiting" />
      </div>

      <div className="wo-sortbar">
        <span className="lab">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as OrderSort)}>
          <option value="age">Age — oldest first</option>
          <option value="title">Title</option>
          <option value="artist">Artist</option>
        </select>
      </div>

      <div className="slab-list">
        <button
          type="button"
          className={"po-row all" + (scope === "all" ? " on" : "")}
          onClick={() => onScopeChange("all")}
        >
          <span className="code">ALL</span>
          <span className="t">Everything on order</span>
          <span className="m">
            {pos.length} open PO{pos.length === 1 ? "" : "s"}
          </span>
          <span className={"n" + (totalOverdue ? " late" : "")}>{totalLines}</span>
          <span className="k">{totalOverdue ? `${totalOverdue} overdue` : "lines"}</span>
        </button>

        {pos.length === 0 && (
          <div className="slab-empty">
            {query ? <>Nothing on order matches “{query}”.</> : <>Nothing is on order.</>}
          </div>
        )}

        {pos.map((po) => (
          <button
            key={po.poNumber}
            type="button"
            className={
              "po-row" +
              (po.external ? " ext" : "") +
              (scope === po.poNumber ? " on" : "") +
              (po.matched ? "" : " dim")
            }
            onClick={() => onScopeChange(po.poNumber)}
          >
            <span className="code">{poTail(po.poNumber)}</span>
            <span className="t">
              {po.poNumber}
              {po.external && <span className="badge mono xsmall">their ref</span>}
            </span>
            <span className="m">
              <span className={"ord-dot " + dotState(po)} /> {po.supplier?.shortName ?? "—"} ·{" "}
              {daysAgo(po.oldest)}d old
            </span>
            <span className={"n" + (po.overdue ? " late" : "")}>{po.lines.length}</span>
            <span className="k">{po.overdue ? `${po.overdue} overdue` : "lines"}</span>
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
  hot,
}: {
  k: OrderChip;
  chip: OrderChip;
  onChange: (c: OrderChip) => void;
  counts: Record<OrderChip, number>;
  label: string;
  hot?: boolean;
}) {
  const n = counts[k];
  return (
    <button
      className={"filter-chip" + (hot ? " hot" : "") + (chip === k ? " on" : "")}
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

// Colour means STATE, the way Find's stock dots do. Overdue outranks
// everything, because it is the only one of these anybody has to act on.
function dotState(po: PoRow): string {
  if (po.overdue > 0) return "late";
  if (po.lines.some((l) => l.status === "Backordered")) return "back";
  if (po.lines.length > 0 && po.lines.every((l) => l.status === "Shipped")) return "ship";
  return "plain";
}
