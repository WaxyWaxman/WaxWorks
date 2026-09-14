import type { ClaimVoid, Supplier, SupplierClaim } from "../data/types";
import { claimPhase, claimTotal, daysWaiting, isSent } from "../lib/claims";
import { money } from "../lib/money";
import { ChevronLeft, ChevronRight } from "./Chevrons";

export type ClaimChip = "all" | "unsent" | "waiting" | "stale" | "closed";
export type ClaimSort = "name" | "waiting" | "value";

/** E-04 d23 — the age at which a row starts asking a question. */
export const STALE_DAYS = 30;

// Track 1 of Supplier Claims. Suppliers who have claims, banded by what the
// store has to DO with them — send these, then chase those, then the finished
// ones — which is the reverse of the Suppliers slab's reasoning (M-01 d17) and
// arrives at the opposite answer for a good reason: there, A–Z is a lookup and
// a band splits the name you want into two places. Here the bands ARE the work
// queue, which is what the screen is for, so they earn their place under any
// sort.
//
// There is no "+ New claim". Claims are raised from a titlecard or a receiving
// flag (E-04 step 1), and a second door into an act that already has one would
// be a worse screen, not a richer one. The slab says so rather than leaving the
// absence to be noticed.
//
// Shares .slab-head / .slab-search / .slab-chips / .slab-list / .slab-strip
// with Find, Receiving, Customers, Suppliers, On Order and Payable.
export function ClaimsSlab({
  open,
  onOpenChange,
  suppliers,
  claims,
  voids,
  today,
  query,
  onQueryChange,
  chip,
  onChipChange,
  sort,
  onSortChange,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  claims: SupplierClaim[];
  voids: ClaimVoid[];
  today: Date;
  query: string;
  onQueryChange: (q: string) => void;
  chip: ClaimChip;
  onChipChange: (c: ClaimChip) => void;
  sort: ClaimSort;
  onSortChange: (s: ClaimSort) => void;
  selectedId: string;
  onSelect: (supplierId: string) => void;
}) {
  const of = (id: string) => claims.filter((c) => c.supplierId === id);

  type Row = {
    supplier: Supplier;
    unsent: number;
    waiting: number;
    closed: number;
    oldest?: number;
    value: number;
  };

  const rows: Row[] = suppliers
    .filter((s) => of(s.id).length > 0)
    .map((s) => {
      const mine = of(s.id);
      const phases = mine.map((c) => claimPhase(c, voids));
      const waitingClaims = mine.filter((c) => claimPhase(c, voids) === "waiting");
      const days = waitingClaims
        .map((c) => daysWaiting(c, today))
        .filter((d): d is number => d !== undefined);
      return {
        supplier: s,
        unsent: phases.filter((p) => p === "unsent").length,
        waiting: phases.filter((p) => p === "waiting").length,
        closed: phases.filter((p) => p === "credited" || p === "abandoned" || p === "voided").length,
        oldest: days.length ? Math.max(...days) : undefined,
        // What is still in play — a closed claim is nobody's money.
        value: mine
          .filter((c) => ["unsent", "waiting"].includes(claimPhase(c, voids)))
          .reduce((n, c) => n + claimTotal(c), 0),
      };
    });

  const q = query.trim().toLowerCase();
  const visible = rows
    .filter((r) => {
      if (q && !(r.supplier.name.toLowerCase().includes(q) || r.supplier.shortName.toLowerCase().includes(q)))
        return false;
      if (chip === "unsent") return r.unsent > 0;
      if (chip === "waiting") return r.waiting > 0;
      if (chip === "stale") return (r.oldest ?? 0) >= STALE_DAYS;
      if (chip === "closed") return r.closed > 0;
      return true;
    })
    .sort((a, b) => {
      if (sort === "waiting") return (b.oldest ?? -1) - (a.oldest ?? -1);
      if (sort === "value") return b.value - a.value;
      return a.supplier.name.localeCompare(b.supplier.name);
    });

  // The bands are the work queue. Unsent first because it is the only thing on
  // this screen the store can act on alone; everything else waits on somebody.
  const bands: { key: string; label: string; rows: Row[] }[] = [
    { key: "unsent", label: "Unsent — ours to send", rows: visible.filter((r) => r.unsent > 0) },
    { key: "waiting", label: "Waiting on the supplier", rows: visible.filter((r) => r.unsent === 0 && r.waiting > 0) },
    {
      key: "closed",
      label: "Closed",
      rows: visible.filter((r) => r.unsent === 0 && r.waiting === 0),
    },
  ].filter((b) => b.rows.length > 0);

  const counts = {
    all: rows.length,
    unsent: rows.filter((r) => r.unsent > 0).length,
    waiting: rows.filter((r) => r.waiting > 0).length,
    stale: rows.filter((r) => (r.oldest ?? 0) >= STALE_DAYS).length,
    closed: rows.filter((r) => r.closed > 0).length,
  };

  if (!open) {
    return (
      <nav className="claims-slab" aria-label="Suppliers with claims">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico"
            onClick={() => onOpenChange(true)}
            aria-label="Expand the claims list"
            title="Expand"
          >
            <ChevronRight />
            {counts.stale > 0 && <span className="rail-badge hot">{counts.stale}</span>}
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="claims-slab" aria-label="Suppliers with claims">
      <div className="slab-head">
        <span className="slab-title">Suppliers with claims</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse the claims list"
          title="Collapse"
        >
          <ChevronLeft />
        </button>
      </div>

      <div className="slab-search">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="name · short code"
          aria-label="Find a supplier with claims"
        />
        <span className="hint">
          Claims are raised <strong>elsewhere</strong> — from a titlecard's <em>Claim vs. supplier</em>, or from a line
          flagged during receiving (E-04 step 1). This screen batches, sends and closes them.
        </span>
      </div>

      <div className="slab-chips">
        {(
          [
            ["all", "All"],
            ["unsent", "Unsent"],
            ["waiting", "Waiting"],
            ["stale", `Waiting ${STALE_DAYS}d+`],
            ["closed", "Closed"],
          ] as [ClaimChip, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={"chip" + (chip === k ? " on" : "")}
            onClick={() => onChipChange(k)}
          >
            {label} <span className="n">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="claims-sortbar">
        <span className="lab">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as ClaimSort)}>
          <option value="name">Supplier name, A–Z</option>
          <option value="waiting">Longest waiting</option>
          <option value="value">Largest value</option>
        </select>
      </div>

      <div className="slab-list">
        {bands.length === 0 ? (
          <div className="slab-empty">
            {q ? `No supplier with claims matches "${query}".` : "No claims anywhere. Raise one from a titlecard."}
          </div>
        ) : (
          bands.map((band) => (
            <div key={band.key}>
              <div className="claims-band">
                <span>{band.label}</span>
                <span>{band.rows.length}</span>
              </div>
              {band.rows.map((r) => (
                <button
                  key={r.supplier.id}
                  type="button"
                  className={"claims-srow" + (selectedId === r.supplier.id ? " on" : "")}
                  onClick={() => onSelect(r.supplier.id)}
                >
                  {/* Flat, not nested: every cell is its own grid item, so the
                      name and the figure sit in different columns with a real
                      gutter. Wrapping them in spans made the gutter 8px of
                      nothing between two blocks of text. */}
                  <span className="code">{r.supplier.shortName}</span>
                  <span className="nm">{r.supplier.name}</span>
                  <span className="sub">
                    {[
                      r.unsent ? `${r.unsent} unsent` : null,
                      r.waiting ? `${r.waiting} waiting` : null,
                      r.closed && !r.unsent && !r.waiting ? `${r.closed} closed` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="amt">{money(r.value)}</span>
                  {r.oldest !== undefined && r.oldest >= STALE_DAYS && (
                    <span className="wait">{r.oldest}d waiting</span>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </nav>
  );
}

/** Exported for the work track's header, which counts the same things. */
export const liveClaims = (claims: SupplierClaim[], voids: ClaimVoid[]) =>
  claims.filter((c) => ["unsent", "waiting"].includes(claimPhase(c, voids)));

export const unsentBatches = (claims: SupplierClaim[]) => claims.filter((c) => !isSent(c));
