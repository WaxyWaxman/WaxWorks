import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CustomerAccount, NewCustomerAccount } from "../components/CustomerAccount";
import {
  accountNumberTaken,
  blankCustomer,
  CustomerCard,
  NewCustomerCard,
  type CustomerDraft,
} from "../components/CustomerCard";
import {
  ACCOUNT_TYPES,
  CustomerSlab,
  type CustomerFilter,
  type CustomerSort,
  type SlabRow,
} from "../components/CustomerSlab";
import type { Customer } from "../data/types";
import { customerFacts, customerMatches, waitingCount } from "../lib/customerFacts";
import { saleTotals } from "../lib/totals";
import { readStored, writeStored } from "../lib/tillMemory";
import { useApp } from "../store/AppStore";

// E-07 Customers, laid out as the till's three tracks (d17): the slab you look
// in, the card you opened, and the account. The frame is pinned to the viewport
// and each track scrolls on its own, so the search box and the primary action
// are always where they were last time.
//
// Selection is carried in the URL (customerId) so it is deep-linkable — a hold,
// a Sale or the slab can all link straight to a card — and so it survives the
// search box moving on without it.

const SLAB_KEY = "waxworks.customers.slab";
const RECENT_KEY = "waxworks.customers.recent";
const RECENT_MAX = 9;

export function Customers() {
  const app = useApp();
  const nav = useNavigate();
  const { customerId } = useParams();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [sort, setSort] = useState<CustomerSort>("az");
  // Open on arrival, cursor in the box: Customers begins with a look-up
  // (steps 1-2). The till rail starts shut for the opposite reason.
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStored<string[]>(RECENT_KEY, []));
  // Non-null means the blank card is open (d18). Held here rather than in the
  // card so the account track's foot can carry Add.
  const [draft, setDraft] = useState<CustomerDraft | null>(null);

  useEffect(() => writeStored(SLAB_KEY, slabOpen), [slabOpen]);
  useEffect(() => writeStored(RECENT_KEY, recentIds), [recentIds]);

  // d15 — opens on the most recently searched or added card, not a fixed
  // default and not an empty state. A URL id always wins over it.
  const selectedId = customerId ?? app.lastViewedCustomerId ?? app.customers[0]?.id ?? null;
  const selected = app.customers.find((c) => c.id === selectedId) ?? null;

  const factsInput = useMemo(
    () => ({
      sales: app.sales,
      pendingOrders: app.pendingOrders,
      invoices: app.invoices,
      taxLines: app.taxLines,
      records: app.records,
    }),
    [app.sales, app.pendingOrders, app.invoices, app.taxLines, app.records],
  );

  const facts = useMemo(
    () => (selected ? customerFacts(selected, factsInput) : null),
    [selected, factsInput],
  );

  // One row per Customer, carrying only what the slab shows: the state anyone
  // has to act on, and the figure the spend sort orders by.
  const allRows: SlabRow[] = useMemo(
    () =>
      app.customers.map((c) => ({
        customer: c,
        waiting: waitingCount(c, app.sales),
        thisYear: thisYearSpend(c, app.sales, app.taxLines),
      })),
    [app.customers, app.sales, app.taxLines],
  );

  const searched = useMemo(
    () => allRows.filter((r) => customerMatches(r.customer, query)),
    [allRows, query],
  );

  // Chip counts are of what the SEARCH left, not of the whole file — otherwise
  // a chip reading 3 filters to nothing.
  const counts = useMemo(() => {
    const c = { all: searched.length, waiting: 0 } as Record<CustomerFilter, number>;
    for (const t of ACCOUNT_TYPES) c[t] = 0;
    for (const r of searched) {
      if (r.waiting > 0) c.waiting += 1;
      c[r.customer.accountType] += 1;
    }
    return c;
  }, [searched]);

  const rows = useMemo(() => {
    const filtered =
      filter === "all"
        ? searched
        : filter === "waiting"
          ? searched.filter((r) => r.waiting > 0)
          : searched.filter((r) => r.customer.accountType === filter);

    const out = [...filtered];
    if (sort === "recent") {
      // Unseen cards sort after every seen one rather than jumbling with them.
      const rank = (id: string) => {
        const i = recentIds.indexOf(id);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      out.sort((a, b) => rank(a.customer.id) - rank(b.customer.id));
    } else if (sort === "spend") {
      out.sort((a, b) => b.thisYear - a.thisYear);
    } else {
      // A-Z on the whole name. The record carries one Name field, so surname
      // order would mean guessing the final token — E-07 leaves that open.
      out.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
    }
    return out;
  }, [searched, filter, sort, recentIds]);

  const recent = useMemo(
    () =>
      recentIds
        .map((id) => allRows.find((r) => r.customer.id === id))
        .filter((r): r is SlabRow => Boolean(r)),
    [recentIds, allRows],
  );

  const select = (id: string) => {
    setDraft(null);
    app.viewCustomer(id);
    nav(`/customers/${id}`, { replace: true });
    setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, RECENT_MAX));
  };

  const startNew = (presetName?: string) =>
    setDraft({ ...blankCustomer, name: presetName ?? "" });

  const addDraft = () => {
    if (!draft) return;
    const id = app.addCustomer({
      ...draft,
      name: draft.name.trim(),
      accountNumber: draft.accountNumber.trim(),
    });
    setDraft(null);
    setQuery("");
    select(id);
  };

  const canAdd =
    Boolean(draft?.name.trim()) &&
    Boolean(draft?.accountNumber.trim()) &&
    !accountNumberTaken(app.customers, draft?.accountNumber ?? "");

  return (
    <div className={"cust-frame" + (slabOpen ? "" : " slab-shut")}>
      <CustomerSlab
        open={slabOpen}
        onOpenChange={setSlabOpen}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        rows={rows}
        counts={counts}
        selectedId={selectedId}
        onSelect={select}
        onNew={startNew}
        recent={recent}
        isNew={draft !== null}
      />

      {draft !== null ? (
        <>
          <NewCustomerCard
            draft={draft}
            onChange={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
            onCancel={() => setDraft(null)}
          />
          <NewCustomerAccount canAdd={canAdd} onAdd={addDraft} />
        </>
      ) : selected && facts ? (
        <>
          <CustomerCard key={selected.id} customer={selected} />
          <CustomerAccount customer={selected} facts={facts} />
        </>
      ) : (
        // Only reachable with no Customers at all — the file is empty, or the
        // last one was just deleted.
        <div className="cust-nosel">
          <div>
            <h2>No customers yet</h2>
            <p className="muted">
              A Customer is never required — most Sales are anonymous walk-ins (d2). Add one when
              someone needs a hold, a discount, or an account.
            </p>
            <button className="btn primary" onClick={() => startNew()}>
              ＋ New customer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function thisYearSpend(
  customer: Customer,
  sales: ReturnType<typeof useApp>["sales"],
  taxLines: ReturnType<typeof useApp>["taxLines"],
): number {
  const year = new Date().getFullYear();
  return sales
    .filter(
      (s) =>
        s.customerId === customer.id &&
        s.saleNumber &&
        s.state !== "Void" &&
        !s.isReturn &&
        Number(s.createdAt.slice(0, 4)) === year,
    )
    .reduce((n, s) => n + saleTotals(s, taxLines).grand, 0);
}
