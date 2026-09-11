import { useEffect, useRef } from "react";
import type { Supplier, SupplierType } from "../data/types";
import { apState } from "../lib/supplierFacts";
import { money } from "../lib/money";

export type SupplierFilter = "all" | "owing" | "flight" | SupplierType;
export type SupplierSort = "az" | "code" | "recent" | "owing" | "received";

export const SUPPLIER_TYPES: SupplierType[] = ["New", "Used", "Bargain"];

export interface SupRow {
  supplier: Supplier;
  balance: number;
  /** How many things are in flight with them — the Employee-side state. */
  inFlight: number;
  received: number;
}

// The supplier slab (M-01 d12). Open it is the search box, the chips, the sort
// and the list; shut it is a 52px strip carrying New, the result count, and the
// cards actually opened.
//
// It shares .slab-head / .slab-search / .slab-chips / .slab-list / .slab-band /
// .slab-strip / .hit / .filter-chip with Find, Receiving and Customers rather
// than restating them — one slab, four errands. Like all three and unlike the
// till rail it PUSHES rather than overlays: the list and the card are read
// against each other, so an overlay would cover the half being compared to.
export function SupplierSlab({
  open,
  onOpenChange,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  rows,
  counts,
  selectedId,
  onSelect,
  onNew,
  recent,
  isNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
  filter: SupplierFilter;
  onFilterChange: (f: SupplierFilter) => void;
  sort: SupplierSort;
  onSortChange: (s: SupplierSort) => void;
  /** Already searched, filtered and sorted by the screen. */
  rows: SupRow[];
  counts: Record<SupplierFilter, number>;
  selectedId?: string | null;
  onSelect: (supplierId: string) => void;
  onNew: (presetName?: string) => void;
  recent: SupRow[];
  isNew: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // M-01 steps 1-2 begin with a look-up, so the cursor sits in the box on
  // arrival and again whenever the slab is reopened — the same as Find's and
  // Customers', and the opposite of the till, which begins with a scan.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <nav className="sup-slab" aria-label="Suppliers">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico"
            onClick={() => onOpenChange(true)}
            aria-label={`Open the supplier list (${rows.length} shown)`}
            title="Open the list — the search is still in there"
          >
            🔎
            {rows.length > 0 && <span className="rail-badge">{rows.length}</span>}
          </button>
          <button
            type="button"
            className="rail-ico"
            onClick={() => onNew()}
            aria-label="New supplier"
            title="New supplier"
          >
            ＋
          </button>
          <div className="rail-sep" />
          {/* Tiled by short code rather than initials: that code is the
              Supplier's identity on every invoice they send. */}
          <div className="slab-recent" role="list" aria-label="Recently opened">
            {recent.length === 0 && <div className="slab-recent-empty">none opened yet</div>}
            {recent.map(({ supplier: s, balance, inFlight }) => (
              <button
                key={s.id}
                type="button"
                role="listitem"
                className={"code-tile" + (s.id === selectedId && !isNew ? " on" : "")}
                onClick={() => onSelect(s.id)}
                title={`${s.name} · ${money(balance)}${inFlight ? ` · ${inFlight} in flight` : ""}`}
                aria-label={`${s.name}, balance ${money(balance)}${inFlight ? `, ${inFlight} in flight` : ""}`}
              >
                {s.shortName || "—"}
                <span className={"bal-dot " + dotState(balance, inFlight)} />
              </button>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sup-slab" aria-label="Suppliers">
      <div className="slab-head">
        <span className="lab">Suppliers</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse the list"
          title="Collapse — the card takes the width"
        >
          ⟨
        </button>
      </div>

      <div className="cust-slab-acts">
        <button className="btn" onClick={() => onNew()}>
          ＋ New supplier
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search suppliers by name, short code or account number"
          placeholder="name · short code · account #"
        />
        {/* Said out loud because Customers' box deliberately does NOT search
            the account number, and the two slabs look identical. */}
        <div className="xsmall muted">
          All three are searched (M-01 step 2) — unlike Customers, where the account number is not.
        </div>
      </div>

      <div className="slab-chips">
        <button
          className={"filter-chip" + (filter === "all" ? " on" : "")}
          onClick={() => onFilterChange("all")}
        >
          All <span className="count">{counts.all}</span>
        </button>
        <button
          className={"filter-chip" + (filter === "owing" ? " on" : "")}
          onClick={() => onFilterChange(filter === "owing" ? "all" : "owing")}
          disabled={counts.owing === 0}
        >
          Owing <span className="count">{counts.owing}</span>
        </button>
        <button
          className={"filter-chip" + (filter === "flight" ? " on" : "")}
          onClick={() => onFilterChange(filter === "flight" ? "all" : "flight")}
          disabled={counts.flight === 0}
        >
          In flight <span className="count">{counts.flight}</span>
        </button>
        {/* Two live states and a stored field are two axes, not five
            equivalent things — the same division Customers draws. */}
        <span className="chip-sep" />
        {SUPPLIER_TYPES.map((t) => (
          <button
            key={t}
            className={"filter-chip" + (filter === t ? " on" : "")}
            onClick={() => onFilterChange(filter === t ? "all" : t)}
            disabled={counts[t] === 0}
          >
            {t} <span className="count">{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="cust-sortbar">
        <span className="lab">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as SupplierSort)}>
          <option value="az">A–Z, full name</option>
          <option value="code">Short code</option>
          <option value="recent">Recently seen</option>
          <option value="owing">Outstanding A/P</option>
          <option value="received">Received, 12 months</option>
        </select>
      </div>

      <div className="slab-list">
        <SlabList
          rows={rows}
          query={query}
          sort={sort}
          filter={filter}
          selectedId={isNew ? undefined : selectedId ?? undefined}
          onSelect={onSelect}
          onNew={onNew}
        />
      </div>
    </nav>
  );
}

function SlabList({
  rows,
  query,
  sort,
  filter,
  selectedId,
  onSelect,
  onNew,
}: {
  rows: SupRow[];
  query: string;
  sort: SupplierSort;
  filter: SupplierFilter;
  selectedId?: string;
  onSelect: (id: string) => void;
  onNew: (presetName?: string) => void;
}) {
  if (rows.length === 0) {
    // Same counter sequence Customers has: you look a Supplier up first, and
    // only then find out they need creating.
    return (
      <div className="slab-empty">
        {query ? (
          <>
            <div>No supplier matches “{query}”.</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => onNew(query)}>
              ＋ New supplier named “{query}”
            </button>
          </>
        ) : (
          <div>Nothing in this band.</div>
        )}
      </div>
    );
  }

  // d17 — the band belongs to the SORT, not to the list. A-Z is a look-up by
  // name, and a band across it splits the alphabet in two, so the name you
  // want is in one of two places instead of one. Under the A/P sort the split
  // IS the ordering, so it is free.
  const owing = rows.filter((r) => apState(r.balance) === "owed");
  const rest = rows.filter((r) => apState(r.balance) !== "owed");
  const banded = sort === "owing" && filter === "all" && owing.length > 0 && rest.length > 0;

  if (!banded) {
    return (
      <>
        {rows.map((r) => (
          <SupRowView key={r.supplier.id} row={r} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </>
    );
  }

  return (
    <>
      <Band label="Owing" n={owing.length} />
      {owing.map((r) => (
        <SupRowView key={r.supplier.id} row={r} selectedId={selectedId} onSelect={onSelect} />
      ))}
      <Band label="Settled" n={rest.length} />
      {rest.map((r) => (
        <SupRowView key={r.supplier.id} row={r} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </>
  );
}

function Band({ label, n }: { label: string; n: number }) {
  return (
    <div className="slab-band cust-band">
      <span className="lab">{label}</span>
      <span className="lab">{n}</span>
    </div>
  );
}

// Find's .hit skeleton on two rows rather than one. The meta line used to
// share the middle column with the figure and end its ellipsis a hair from the
// money; it gets the full width under the name instead, and the figure's
// caption drops to that same row so the number and its label still read as a
// unit.
function SupRowView({
  row,
  selectedId,
  onSelect,
}: {
  row: SupRow;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const s = row.supplier;
  const st = apState(row.balance);
  const meta = [s.orderVia, s.accountNumber || "no account #", row.inFlight ? `${row.inFlight} in flight` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      className={"hit sup-hit" + (s.id === selectedId ? " on" : "")}
      onClick={() => onSelect(s.id)}
    >
      <span className="code">{s.shortName || "—"}</span>
      <span className="t">{s.name || "(unnamed)"}</span>
      <span className={"n bal-" + st}>{money(row.balance)}</span>
      <span className="m">{meta}</span>
      <span className="k">{st === "owed" ? "we owe" : st === "credit" ? "in credit" : "settled"}</span>
    </button>
  );
}

/** Balance state wins the dot; in-flight takes it only when nothing is owed. */
export function dotState(balance: number, inFlight: number): string {
  const st = apState(balance);
  if (st !== "nil") return st;
  return inFlight > 0 ? "flight" : "nil";
}
