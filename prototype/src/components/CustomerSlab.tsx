import { useEffect, useRef } from "react";
import type { Customer } from "../data/types";
import { money } from "../lib/money";

export type CustomerFilter = "all" | "waiting" | Customer["accountType"];
export type CustomerSort = "az" | "recent" | "spend";

export const ACCOUNT_TYPES: Customer["accountType"][] = ["Regular", "Business", "Staff"];

export interface SlabRow {
  customer: Customer;
  /** Held Sales in their name — the one state anyone has to act on (d17). */
  waiting: number;
  thisYear: number;
}

// The customer slab (E-07 d17). Open it is the search box, the chips, the sort
// and the list; shut it is a 52px strip carrying New, the result count, and the
// cards actually opened.
//
// It shares .slab-head / .slab-search / .slab-chips / .slab-list / .slab-band /
// .slab-strip with Find and Receiving rather than restating them — one slab,
// three errands. Like both of those and unlike the till rail, it PUSHES rather
// than overlays: the list and the card are read against each other, so an
// overlay would cover the half being compared to.
export function CustomerSlab({
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
  filter: CustomerFilter;
  onFilterChange: (f: CustomerFilter) => void;
  sort: CustomerSort;
  onSortChange: (s: CustomerSort) => void;
  /** Already searched, filtered and sorted by the screen. */
  rows: SlabRow[];
  counts: Record<CustomerFilter, number>;
  selectedId?: string | null;
  onSelect: (customerId: string) => void;
  onNew: (presetName?: string) => void;
  recent: SlabRow[];
  isNew: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // Customers begins with a look-up (E-07 steps 1-2), so the cursor sits in the
  // box on arrival and again whenever the slab is reopened — the same reason
  // Find's does, and the opposite of the till, which begins with a scan.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <nav className="cust-slab" aria-label="Customers">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico"
            onClick={() => onOpenChange(true)}
            aria-label={`Open the customer list (${rows.length} shown)`}
            title="Open the list — the search is still in there"
          >
            🔎
            {rows.length > 0 && <span className="rail-badge">{rows.length}</span>}
          </button>
          <button
            type="button"
            className="rail-ico"
            onClick={() => onNew()}
            aria-label="New customer"
            title="New customer"
          >
            ＋
          </button>
          <div className="rail-sep" />
          {/* The cards actually opened, newest first — a way back, not only a
              way out. Each tile carries its balance state as a dot. */}
          <div className="slab-recent" role="list" aria-label="Recently opened">
            {recent.length === 0 && <div className="slab-recent-empty">none opened yet</div>}
            {recent.map(({ customer: c, waiting }) => (
              <button
                key={c.id}
                type="button"
                role="listitem"
                className={"ini-tile" + (c.id === selectedId && !isNew ? " on" : "")}
                onClick={() => onSelect(c.id)}
                title={`${c.name} · ${money(c.balance)}${waiting ? ` · ${waiting} waiting` : ""}`}
                aria-label={`${c.name}, balance ${money(c.balance)}${waiting ? `, ${waiting} waiting to collect` : ""}`}
              >
                {initials(c.name)}
                <span className={"bal-dot " + balState(c.balance)} />
              </button>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="cust-slab" aria-label="Customers">
      <div className="slab-head">
        <span className="lab">Customers</span>
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
          ＋ New customer
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search customers by name, email or phone"
          placeholder="name · email · phone"
        />
        {/* Said out loud, because everyone tries the account number first. */}
        <div className="xsmall muted">
          Account number is not searched (d14) — you find it by opening the card.
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
          className={"filter-chip" + (filter === "waiting" ? " on" : "")}
          onClick={() => onFilterChange(filter === "waiting" ? "all" : "waiting")}
          disabled={counts.waiting === 0}
        >
          Waiting <span className="count">{counts.waiting}</span>
        </button>
        {/* Two axes in one row — a live state and a stored field — so they are
            divided rather than read as five equivalent things. */}
        <span className="chip-sep" />
        {ACCOUNT_TYPES.map((t) => (
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
        <select value={sort} onChange={(e) => onSortChange(e.target.value as CustomerSort)}>
          <option value="az">A–Z, whole name</option>
          <option value="recent">Recently seen</option>
          <option value="spend">Spend, this year</option>
        </select>
      </div>

      <div className="slab-list">
        <SlabList
          rows={rows}
          query={query}
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
  filter,
  selectedId,
  onSelect,
  onNew,
}: {
  rows: SlabRow[];
  query: string;
  filter: CustomerFilter;
  selectedId?: string;
  onSelect: (id: string) => void;
  onNew: (presetName?: string) => void;
}) {
  if (rows.length === 0) {
    // The real counter sequence: you look someone up first, and only then find
    // out they need creating (d18). So the empty state IS the New button.
    return (
      <div className="slab-empty">
        {query ? (
          <>
            <div>No customer matches “{query}”.</div>
            <div className="xsmall" style={{ marginTop: 6 }}>
              Account number is not searched (d14) — if that is what you typed, open the card
              instead.
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => onNew(query)}>
              ＋ New customer named “{query}”
            </button>
          </>
        ) : (
          <div>Nothing in this band.</div>
        )}
      </div>
    );
  }

  const waiting = rows.filter((r) => r.waiting > 0);
  const rest = rows.filter((r) => r.waiting === 0);
  // A band only earns its keep when it actually splits the list, and only with
  // no filter on — under the Waiting chip every row is waiting.
  const banded = filter === "all" && waiting.length > 0 && rest.length > 0;

  if (!banded) {
    return (
      <>
        {rows.map((r) => (
          <CustRow key={r.customer.id} row={r} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </>
    );
  }

  return (
    <>
      <Band label="Waiting to collect" n={waiting.length} />
      {waiting.map((r) => (
        <CustRow key={r.customer.id} row={r} selectedId={selectedId} onSelect={onSelect} />
      ))}
      <Band label="Everyone else" n={rest.length} />
      {rest.map((r) => (
        <CustRow key={r.customer.id} row={r} selectedId={selectedId} onSelect={onSelect} />
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

// The same three-column skeleton as Find's .hit: a tile, two lines of name, one
// right-hand figure. A third datum would stop the strip scanning as a column of
// names, so the band carries "waiting" rather than the row.
function CustRow({
  row,
  selectedId,
  onSelect,
}: {
  row: SlabRow;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const c = row.customer;
  const st = balState(c.balance);
  return (
    <button
      type="button"
      className={"hit" + (c.id === selectedId ? " on" : "")}
      onClick={() => onSelect(c.id)}
    >
      <span className="ini">{initials(c.name)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="t" style={{ display: "block" }}>
          {c.name || "(unnamed)"}
        </span>
        <span className="m" style={{ display: "block" }}>
          {c.accountType} · {c.accountNumber}
        </span>
      </span>
      <span className={"n bal-" + st}>
        {money(c.balance)}
        <small>{st === "credit" ? "credit" : st === "owed" ? "owes us" : "settled"}</small>
      </span>
    </button>
  );
}

/** Positive is store credit owed to them, negative is owed to the store (d4). */
export function balState(balance: number): "credit" | "owed" | "nil" {
  if (balance > 0) return "credit";
  if (balance < 0) return "owed";
  return "nil";
}

/**
 * The name without its trailing qualifier — "Left Bank Cafe (wholesale)" is
 * filed, addressed and spoken of as "Left Bank Cafe". Used by both the
 * initials tile and the foot action, so the two never disagree.
 */
export function plainName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

export function initials(name: string): string {
  const parts = plainName(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
