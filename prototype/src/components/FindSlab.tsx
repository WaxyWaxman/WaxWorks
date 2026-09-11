import { useEffect, useRef } from "react";
import { BarcodeInput } from "./BarcodeInput";
import type { RecordEntry } from "../data/types";
import {
  STOCK_HEADING,
  STOCK_LABEL,
  STOCK_STATES,
  type StockFacts,
  type StockState,
} from "../lib/stockState";

export interface Hit {
  record: RecordEntry;
  facts: StockFacts;
}

// The finding slab (E-03). Open it is the search box, the state filters and
// the ranked result list; shut it is a 52px strip carrying the result count
// and the Records you have actually opened.
//
// It differs from the till rail (E-05 d30) in one deliberate way: it PUSHES
// the selection over rather than lying on top of it. The rail overlays because
// nothing being read should move mid-transaction. Find is the opposite errand
// — the list and the titlecard get read against each other — so an overlay
// would cover the half you are comparing to.
export function FindSlab({
  open,
  onOpenChange,
  term,
  onTermChange,
  onScan,
  providerDown,
  hits,
  counts,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  recent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: string;
  onTermChange: (term: string) => void;
  onScan: (code: string) => void;
  /** The catalog provider is unreachable — said out loud, never silently (E-03 d8). */
  providerDown: boolean;
  hits: Hit[];
  counts: Record<StockState, number>;
  filter: StockState | null;
  onFilterChange: (filter: StockState | null) => void;
  selectedId?: string;
  onSelect: (recordId: string) => void;
  recent: Hit[];
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // Find begins with a search, so the first keystroke should already have
  // somewhere to go — the cursor sits in the box on arrival and again whenever
  // the slab is reopened. (The till starts with its rail shut for the opposite
  // reason: a sale begins with a scan, and a scan needs no slab.)
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <nav className="find-slab" aria-label="Find">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico accent"
            onClick={() => onOpenChange(true)}
            aria-label={`Open search (${hits.length} results)`}
            title="Open search — the results are still in there"
          >
            🔍
            {hits.length > 0 && <span className="rail-badge">{hits.length}</span>}
          </button>
          <div className="rail-sep" />
          {/* Recently viewed, newest first. A customer comparing two pressings
              is the case this exists for: bounce between two titlecards
              without reopening the slab and re-running the search. */}
          <div className="slab-recent" role="list" aria-label="Recently viewed">
            {recent.length === 0 && <div className="slab-recent-empty">nothing viewed yet</div>}
            {recent.map(({ record, facts }) => (
              <button
                key={record.id}
                type="button"
                role="listitem"
                className={"recent-tile" + (record.id === selectedId ? " on" : "")}
                onClick={() => onSelect(record.id)}
                title={`${record.artist} — ${record.title} · ${STOCK_LABEL[facts.state].toLowerCase()}`}
                aria-label={`${record.artist} — ${record.title}, ${STOCK_LABEL[facts.state].toLowerCase()}`}
              >
                {record.art}
                <span className={"stock-dot " + facts.state} />
              </button>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="find-slab" aria-label="Find">
      <div className="slab-head">
        <span className="lab">Find</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse search"
          title="Collapse — the selection takes the width"
        >
          ⟨
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          aria-label="Search — artist, title, label, catalog no., genre, Section, UPC"
          placeholder="artist · title · label · cat. no. · Section · UPC"
        />
        {/* A scanned barcode resolves directly rather than running a keyword
            search (E-03 decision 9). */}
        <BarcodeInput onScan={onScan} placeholder="…or scan to resolve directly" collapsibleSamples />
        {/* Degrades visibly, not silently (E-03 decision 8). It sits in the
            slab because that is where the missing rows would have been. */}
        {providerDown && (
          <div className="callout danger xsmall" style={{ margin: 0 }}>
            The catalog provider is unreachable — catalog-only rows are hidden. Local inventory and
            every till function are unaffected.
          </div>
        )}
      </div>

      <div className="slab-chips">
        <button
          className={"filter-chip" + (filter === null ? " on" : "")}
          onClick={() => onFilterChange(null)}
        >
          All <span className="count">{hits.length}</span>
        </button>
        {STOCK_STATES.map((st) => (
          <button
            key={st}
            className={"filter-chip" + (filter === st ? " on" : "")}
            onClick={() => onFilterChange(filter === st ? null : st)}
            disabled={counts[st] === 0}
          >
            <span className={"stock-dot " + st} />
            {STOCK_LABEL[st]} <span className="count">{counts[st]}</span>
          </button>
        ))}
      </div>

      <div className="slab-list">
        <SlabList hits={hits} filter={filter} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </nav>
  );
}

function SlabList({
  hits,
  filter,
  selectedId,
  onSelect,
}: {
  hits: Hit[];
  filter: StockState | null;
  selectedId?: string;
  onSelect: (recordId: string) => void;
}) {
  const shown = filter ? hits.filter((h) => h.facts.state === filter) : hits;
  if (shown.length === 0) {
    return <div className="slab-empty">Nothing matches that search in this band.</div>;
  }

  return (
    <>
      {shown.map(({ record: r, facts }, i) => {
        const startsBand = i === 0 || shown[i - 1].facts.state !== facts.state;
        return (
          <div key={r.id}>
            {startsBand && (
              <div className="slab-band">
                <span className={"stock-chip " + facts.state}>
                  <span className={"stock-dot " + facts.state} />
                  {STOCK_HEADING[facts.state]}
                </span>
              </div>
            )}
            <button
              type="button"
              className={"hit" + (r.id === selectedId ? " on" : "")}
              onClick={() => onSelect(r.id)}
            >
              <span className="art">{r.art}</span>
              <span style={{ minWidth: 0 }}>
                <span className="t" style={{ display: "block" }}>
                  {r.artist} — {r.title}
                </span>
                <span className="m" style={{ display: "block" }}>
                  {r.label} · {r.catalogNo} · {r.year}
                </span>
              </span>
              <span className="n">{countFor(facts)}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}

// The figure a result carries, and what it is a count OF — a Record with none
// on hand but four placed is not "0", it is "4 on order", and that is a
// different answer to give someone. "Pending" is M-02's own word for a line
// raised into a supplier stream with no PO number yet (M-02 d1).
function countFor(facts: StockFacts) {
  if (facts.available > 0) return <>{facts.available}<small>available</small></>;
  if (facts.onHand > 0) return <>{facts.onHand}<small>all held</small></>;
  if (facts.onOrder > 0) return <>{facts.onOrder}<small>on order</small></>;
  if (facts.raised > 0) return <>{facts.raised}<small>pending</small></>;
  return <>—<small>none</small></>;
}
