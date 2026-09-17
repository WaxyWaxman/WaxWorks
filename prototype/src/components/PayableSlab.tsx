import { useEffect, useRef } from "react";
import type { Supplier } from "../data/types";
import { ledgerRows, type PayablesData } from "../lib/payables";
import { money } from "../lib/money";
import { round2 } from "../lib/totals";
import { ChevronLeft, ChevronRight } from "./Chevrons";

export type PayableChip = "all" | "overdue" | "owed" | "credit" | "claims" | "foreign" | "settled";
export type PayableSort = "name" | "balance" | "overdue";

// Track 1 of Accounts Payable. The store-wide figure at the top, then the
// lookup, then the chips, then the sort, then who is owed — and gift-card
// liability as the last destination, because the slab is a list of what the
// store owes and card holders are owed too (d10).
//
// The lookup is NOT a filter of the list: it reaches any Supplier, balance or
// no balance (step 1), which is the only way to start a Create new against one
// you have never owed. There is no scan box — nothing in accounts payable has
// a barcode on it.
//
// Shares .slab-head / .slab-search / .slab-chips / .slab-list / .slab-strip
// with Find, Receiving, Customers, Suppliers and On Order.
export function PayableSlab({
  open,
  onOpenChange,
  suppliers,
  active,
  balanceOf,
  data,
  query,
  onQueryChange,
  chip,
  onChipChange,
  sort,
  onSortChange,
  scope,
  onScope,
  onCards,
  giftTotal,
  giftLive,
  onCreateNew,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  active: Supplier[];
  balanceOf: (id: string) => number;
  data: PayablesData;
  query: string;
  onQueryChange: (q: string) => void;
  chip: PayableChip;
  onChipChange: (c: PayableChip) => void;
  sort: PayableSort;
  onSortChange: (s: PayableSort) => void;
  scope: string;
  onScope: (id: string) => void;
  onCards: () => void;
  giftTotal: number;
  giftLive: number;
  onCreateNew: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const facts = (s: Supplier) => {
    const rows = ledgerRows(s.id, data, suppliers);
    const overdue = rows.filter((r) => r.overdueBy != null && r.overdueBy > 0 && r.balance > 0.005);
    return {
      net: balanceOf(s.id),
      credit: round2(rows.filter((r) => r.role === "credit").reduce((n, r) => n - r.balance, 0)),
      claims: rows.filter((r) => r.role === "placeholder").length,
      openCount: rows.filter((r) => r.band !== "settled").length,
      overdue,
      worst: overdue.length ? Math.max(...overdue.map((r) => r.overdueBy!)) : null,
    };
  };

  const matches = (s: Supplier, c: PayableChip) => {
    const f = facts(s);
    switch (c) {
      case "overdue":
        return f.overdue.length > 0;
      case "owed":
        return f.net > 0.005;
      case "credit":
        return f.credit > 0.005;
      case "claims":
        return f.claims > 0;
      case "foreign":
        return s.currency !== "CAD";
      case "settled":
        return f.net <= 0.005;
      default:
        return true;
    }
  };

  const q = query.trim().toLowerCase();
  const found = q
    ? suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.shortName.toLowerCase().includes(q) ||
          (s.accountNumber ?? "").toLowerCase().includes(q),
      )
    : null;

  const listed = (found ?? active.filter((s) => matches(s, chip))).slice().sort((a, b) => {
    if (found) return a.name.localeCompare(b.name);
    if (sort === "balance") return balanceOf(b.id) - balanceOf(a.id) || a.name.localeCompare(b.name);
    if (sort === "overdue") {
      const wa = facts(a).worst;
      const wb = facts(b).worst;
      if (wa == null && wb == null) return a.name.localeCompare(b.name);
      if (wa == null) return 1;
      if (wb == null) return -1;
      return wb - wa;
    }
    return a.name.localeCompare(b.name);
  });

  const dot = (s: Supplier) => {
    const f = facts(s);
    if (f.overdue.length) return "late";
    if (f.credit > 0.005) return "credit";
    if (f.claims) return "claim";
    return f.net > 0.005 ? "owed" : "settled";
  };

  const row = (s: Supplier, dim?: boolean) => {
    const f = facts(s);
    const key = f.overdue.length
      ? `${f.worst}d past due`
      : f.credit > 0.005
        ? `${money(f.credit)} credit`
        : f.net > 0.005
          ? "owing"
          : "settled";
    return (
      <button
        key={s.id}
        type="button"
        className={"sup-row" + (s.consignment ? " cons" : "") + (scope === s.id ? " on" : "") + (dim ? " dim" : "")}
        onClick={() => onScope(s.id)}
      >
        <span className="code">{s.shortName}</span>
        <span className="t">{s.name}</span>
        <span className="m">
          <span className={"ap-dot " + dot(s)} /> {s.shortName}
          {s.paymentTerms ? ` · ${s.paymentTerms}` : ""}
          {s.currency !== "CAD" ? ` · ${s.currency}` : ""}
          {f.openCount ? ` · ${f.openCount} open` : " · nothing open"}
        </span>
        <span className={"n" + (f.net > 0.005 ? (f.overdue.length ? " late" : "") : " nil")}>{money(f.net)}</span>
        <span className={"k" + (f.overdue.length ? " late" : f.credit > 0.005 ? " good" : "")}>{key}</span>
      </button>
    );
  };

  // One line per currency, never a sum: M-05 requires a Supplier's currency to
  // carry through, and the store-currency rate that would let these be added
  // lives in M-06, which is not built. A single total would be a fabricated rate.
  const byCurrency = active.reduce<Record<string, number>>((acc, s) => {
    acc[s.currency] = round2((acc[s.currency] ?? 0) + balanceOf(s.id));
    return acc;
  }, {});
  const lateCount = active.reduce((n, s) => n + facts(s).overdue.length, 0);

  if (!open) {
    return (
      <nav className="ap-slab" aria-label="What the store owes">
        <div className="slab-strip">
          <button
            type="button"
            className="rail-ico"
            onClick={() => onOpenChange(true)}
            aria-label="Expand the payables list"
            title="Expand — the lookup is still in there"
          >
            <ChevronRight />
            {lateCount > 0 && <span className="rail-badge hot">{lateCount}</span>}
          </button>
          <button type="button" className="rail-ico" onClick={onCreateNew} aria-label="Create a ledger entry by hand" title="Create new">
            ＋
          </button>
          <div className="rail-sep" />
          <div className="slab-recent" role="list" aria-label="Suppliers">
            {active.map((s) => (
              <button
                key={s.id}
                type="button"
                role="listitem"
                className={"po-tile" + (scope === s.id ? " on" : "")}
                onClick={() => onScope(s.id)}
                title={`${s.name} — ${money(balanceOf(s.id))}`}
              >
                {s.shortName}
                <span className={"ap-dot " + dot(s)} />
              </button>
            ))}
            <button
              type="button"
              role="listitem"
              className={"po-tile gc" + (scope === "cards" ? " on" : "")}
              onClick={onCards}
              title="Gift card liability"
            >
              ★
            </button>
          </div>
        </div>
      </nav>
    );
  }

  const chips: { k: PayableChip; label: string; hot?: boolean; good?: boolean }[] = [
    { k: "all", label: "All" },
    { k: "overdue", label: "Overdue", hot: true },
    { k: "owed", label: "Owed" },
    { k: "credit", label: "Credit to spend", good: true },
    { k: "claims", label: "Claims open" },
    { k: "foreign", label: "Foreign" },
    { k: "settled", label: "Settled" },
  ];

  return (
    <nav className="ap-slab" aria-label="What the store owes">
      <div className="slab-head">
        <span className="lab">Owed</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse the list"
          title="Collapse — the ledger takes the width"
        >
          <ChevronLeft />
        </button>
      </div>

      <div className="ap-total">
        {Object.keys(byCurrency)
          .sort()
          .map((c, i) => (
            <div className="tot" key={c}>
              <span className="lab">{i === 0 ? "Owed to suppliers" : " "}</span>
              <span className={"v" + (i ? " sub" : "")}>
                {money(byCurrency[c])}
                {c !== "CAD" ? ` ${c}` : ""}
              </span>
            </div>
          ))}
        <div className="tot" style={{ marginTop: 6 }}>
          <span className="lab">Gift cards</span>
          <span className="v sub">{money(giftTotal)}</span>
        </div>
        {lateCount > 0 && (
          <div className="tot" style={{ marginTop: 6 }}>
            <span className="lab" style={{ color: "var(--c-danger)" }}>
              Past due
            </span>
            <span className="v sub" style={{ color: "var(--c-danger)" }}>
              {lateCount} item{lateCount === 1 ? "" : "s"}
            </span>
          </div>
        )}
        <span className="hint">
          One line per currency, never a sum — the store-currency rate that would let these be added lives in M-06,
          which is not built.
        </span>
      </div>

      <div className="ap-slab-acts">
        <button className="btn" onClick={onCreateNew}>
          ＋ Create new
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Look up any supplier by name, short code or account number"
          placeholder="name · short code · account #"
        />
        <div className="xsmall muted">
          The lookup reaches <strong>any</strong> Supplier, balance or no balance (step 1) — to read their history, or
          to log a new entry against them.
        </div>
      </div>

      <div className="slab-chips">
        {chips.map((c) => {
          const n = active.filter((s) => matches(s, c.k)).length;
          return (
            <button
              key={c.k}
              className={
                "filter-chip" + (c.hot ? " hot" : "") + (c.good ? " good" : "") + (chip === c.k ? " on" : "")
              }
              onClick={() => onChipChange(chip === c.k && c.k !== "all" ? "all" : c.k)}
              disabled={c.k !== "all" && n === 0}
            >
              {c.label} <span className="count">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="ap-sortbar">
        <span className="lab">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as PayableSort)}>
          <option value="name">Supplier name</option>
          <option value="balance">Balance — largest first</option>
          <option value="overdue">Most overdue</option>
        </select>
      </div>

      <div className="slab-list">
        {found ? (
          <>
            <div className="slab-band">
              <span className="lab">Lookup</span>
              <span className="xsmall muted">
                {found.length} match{found.length === 1 ? "" : "es"} · any supplier, balance or not
              </span>
            </div>
            {found.length === 0 && <div className="slab-empty">No supplier matches “{query.trim()}”.</div>}
            {found.map((s) => row(s, !active.some((a) => a.id === s.id)))}
          </>
        ) : (
          <>
            {listed.filter((s) => balanceOf(s.id) > 0.005).length > 0 && (
              <div className="slab-band">
                <span className="lab">Outstanding</span>
                <span className="xsmall muted">{listed.filter((s) => balanceOf(s.id) > 0.005).length}</span>
              </div>
            )}
            {listed.filter((s) => balanceOf(s.id) > 0.005).map((s) => row(s))}
            {listed.filter((s) => balanceOf(s.id) <= 0.005).length > 0 && (
              <div className="slab-band">
                <span className="lab">Settled — no balance owing</span>
                <span className="xsmall muted">{listed.filter((s) => balanceOf(s.id) <= 0.005).length}</span>
              </div>
            )}
            {listed.filter((s) => balanceOf(s.id) <= 0.005).map((s) => row(s, true))}
            {listed.length === 0 && <div className="slab-empty">No supplier matches this filter.</div>}

            {/* Gift cards are not a Supplier, and the row says so rather than
                sitting in the same list pretending to be one (d10). */}
            <button type="button" className={"sup-row gc" + (scope === "cards" ? " on" : "")} onClick={onCards}>
              <span className="code">★</span>
              <span className="t">Gift card liability</span>
              <span className="m">Owed to customers, not to a supplier · {giftLive} live</span>
              <span className="n">{money(giftTotal)}</span>
              <span className="k">outstanding</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
