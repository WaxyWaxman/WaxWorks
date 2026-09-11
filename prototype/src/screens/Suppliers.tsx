import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import {
  blankSupplier,
  NewSupplierCard,
  shortNameTaken,
  SupplierCard,
  type SupplierDraft,
} from "../components/SupplierCard";
import { NewSupplierLedger, SupplierLedger } from "../components/SupplierLedger";
import {
  SUPPLIER_TYPES,
  SupplierSlab,
  type SupplierFilter,
  type SupplierSort,
  type SupRow,
} from "../components/SupplierSlab";
import type { Supplier } from "../data/types";
import { readStored, writeStored } from "../lib/tillMemory";
import { apState, supplierApBalance, supplierFacts } from "../lib/supplierFacts";
import { useApp } from "../store/AppStore";

// M-01 Suppliers, laid out as the till's three tracks (d12): the slab you look
// in, the card you opened, and the ledger. The frame is pinned to the viewport
// and each track scrolls on its own, so the search box and the primary action
// are always where they were last time.
//
// Selection is carried in the URL (supplierId) so it is deep-linkable — a
// claim, an Invoice or Accounts Payable can link straight to a card — and so
// it survives the search box moving on without it.

const SLAB_KEY = "waxworks.suppliers.slab";
const RECENT_KEY = "waxworks.suppliers.recent";
const RECENT_MAX = 9;

export function Suppliers() {
  const app = useApp();
  const nav = useNavigate();
  const { supplierId } = useParams();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SupplierFilter>("all");
  // A-Z is the default because this screen begins with a look-up by name
  // (steps 1-2), which is also why it carries no band — see d17.
  const [sort, setSort] = useState<SupplierSort>("az");
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStored<string[]>(RECENT_KEY, []));
  // Non-null means the blank card is open (d13, following E-07 d18).
  const [draft, setDraft] = useState<SupplierDraft | null>(null);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => writeStored(SLAB_KEY, slabOpen), [slabOpen]);
  useEffect(() => writeStored(RECENT_KEY, recentIds), [recentIds]);

  // d8 — opens on the most recently searched card, not a fixed default and not
  // an empty state. A URL id always wins over it.
  const selectedId = supplierId ?? app.lastViewedSupplierId ?? app.suppliers[0]?.id ?? null;
  const selected = app.suppliers.find((s) => s.id === selectedId) ?? null;

  const factsInput = useMemo(
    () => ({
      invoices: app.invoices,
      payableEntries: app.payableEntries,
      paymentBatches: app.paymentBatches,
      claims: app.claims,
      pendingOrders: app.pendingOrders,
      inventory: app.inventory,
      sales: app.sales,
      records: app.records,
    }),
    [
      app.invoices,
      app.payableEntries,
      app.paymentBatches,
      app.claims,
      app.pendingOrders,
      app.inventory,
      app.sales,
      app.records,
    ],
  );

  const facts = useMemo(
    () => (selected ? supplierFacts(selected, factsInput) : null),
    [selected, factsInput],
  );

  // One row per Supplier, carrying only what the slab shows: the money, the
  // count of things in flight, and the figure the received sort orders by.
  const allRows: SupRow[] = useMemo(
    () =>
      app.suppliers.map((s) => {
        const f = supplierFacts(s, factsInput);
        return {
          supplier: s,
          balance: f.apBalance,
          inFlight: f.flight.length,
          received: f.trade.received,
        };
      }),
    [app.suppliers, factsInput],
  );

  const searched = useMemo(
    () => allRows.filter((r) => supplierMatches(r.supplier, query)),
    [allRows, query],
  );

  // Chip counts are of what the SEARCH left, not of the whole file — otherwise
  // a chip reading 3 filters to nothing.
  const counts = useMemo(() => {
    const c = { all: searched.length, owing: 0, flight: 0 } as Record<SupplierFilter, number>;
    for (const t of SUPPLIER_TYPES) c[t] = 0;
    for (const r of searched) {
      if (apState(r.balance) === "owed") c.owing += 1;
      if (r.inFlight > 0) c.flight += 1;
      c[r.supplier.type] += 1;
    }
    return c;
  }, [searched]);

  const rows = useMemo(() => {
    const filtered =
      filter === "all"
        ? searched
        : filter === "owing"
          ? searched.filter((r) => apState(r.balance) === "owed")
          : filter === "flight"
            ? searched.filter((r) => r.inFlight > 0)
            : searched.filter((r) => r.supplier.type === filter);

    const out = [...filtered];
    if (sort === "code") {
      out.sort((a, b) => a.supplier.shortName.localeCompare(b.supplier.shortName));
    } else if (sort === "recent") {
      // Unseen cards sort after every seen one rather than jumbling with them.
      const rank = (id: string) => {
        const i = recentIds.indexOf(id);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      out.sort((a, b) => rank(a.supplier.id) - rank(b.supplier.id));
    } else if (sort === "owing") {
      out.sort((a, b) => b.balance - a.balance);
    } else if (sort === "received") {
      out.sort((a, b) => b.received - a.received);
    } else {
      out.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
    }
    return out;
  }, [searched, filter, sort, recentIds]);

  const recent = useMemo(
    () =>
      recentIds
        .map((id) => allRows.find((r) => r.supplier.id === id))
        .filter((r): r is SupRow => Boolean(r)),
    [recentIds, allRows],
  );

  const select = (id: string) => {
    setDraft(null);
    app.viewSupplier(id);
    nav(`/suppliers/${id}`, { replace: true });
    setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, RECENT_MAX));
  };

  const startNew = (presetName?: string) =>
    setDraft({ ...blankSupplier, name: presetName ?? "", billing: {}, shipping: {} });

  const addDraft = () => {
    if (!draft) return;
    const id = app.addSupplier({
      ...draft,
      name: draft.name.trim(),
      shortName: draft.shortName.trim().toUpperCase(),
    });
    setDraft(null);
    setQuery("");
    select(id);
  };

  const canAdd =
    Boolean(draft?.name.trim()) &&
    Boolean(draft?.shortName.trim()) &&
    !shortNameTaken(app.suppliers, draft?.shortName ?? "");

  return (
    <div className={"cust-frame sup-frame" + (slabOpen ? "" : " slab-shut")}>
      <SupplierSlab
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
          <NewSupplierCard
            draft={draft}
            onChange={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
            onCancel={() => setDraft(null)}
          />
          <NewSupplierLedger canAdd={canAdd} onAdd={addDraft} />
        </>
      ) : selected && facts ? (
        <>
          <SupplierCard key={selected.id} supplier={selected} />
          <SupplierLedger supplier={selected} facts={facts} />
        </>
      ) : (
        <div className="cust-nosel">
          <div>
            <h2>No suppliers yet</h2>
            <p className="muted">
              Every shipment, second-hand walk-in and future order is received against a Supplier.
              Add one and receiving has somewhere to point.
            </p>
            <button className="btn primary" onClick={() => startNew()}>
              ＋ New supplier
            </button>
          </div>
        </div>
      )}

      {/* Merge and Delete keep their modals: both are destructive, both act on
          two records at once, and neither is an edit to the open card. Merge
          is manager-only (d11); whether Delete joins it is an open question
          M-01 deliberately leaves open, so it is drawn ungated. */}
      {selected && !draft && (
        <div className="sup-danger">
          <button className="btn sm" onClick={() => app.copySupplier(selected.id)}>
            Copy
          </button>
          <button className="btn sm" onClick={() => setMerging(true)}>
            Merge (Manager)
          </button>
          <button className="btn sm danger" onClick={() => setDeleting(true)}>
            Delete
          </button>
        </div>
      )}

      {merging && selected && (
        <MergeModal
          supplier={selected}
          onClose={() => setMerging(false)}
          onDone={(keepId) => {
            setMerging(false);
            select(keepId);
          }}
        />
      )}
      {deleting && selected && (
        <Modal
          title={`Delete ${selected.name}`}
          onClose={() => setDeleting(false)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setDeleting(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  app.deleteSupplier(selected.id);
                  setDeleting(false);
                  nav("/suppliers", { replace: true });
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <div className="callout danger">
            Deletes {selected.name} outright. Historical Invoices, orders and InventoryItems that
            point at it keep pointing at a now-missing Supplier — use Merge instead if this Supplier
            has history worth keeping attached to another record (d9).
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Name, short code and account number — all three (M-01 step 2). */
export function supplierMatches(s: Supplier, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    s.name.toLowerCase().includes(q) ||
    s.shortName.toLowerCase().includes(q) ||
    (s.accountNumber ?? "").toLowerCase().includes(q)
  );
}

function MergeModal({
  supplier,
  onClose,
  onDone,
}: {
  supplier: Supplier;
  onClose: () => void;
  onDone: (keepId: string) => void;
}) {
  const app = useApp();
  const others = app.suppliers.filter((s) => s.id !== supplier.id);
  const [targetId, setTargetId] = useState(others[0]?.id ?? "");
  const target = others.find((s) => s.id === targetId);

  // Merge absorbs one Supplier's history into another (d9), so it absorbs
  // their figures too. M-01 leaves open whether that is what a Manager
  // expects — saying so here is cheaper than letting it be discovered.
  const combined =
    target &&
    supplierApBalance(supplier.id, app) + supplierApBalance(target.id, app);

  return (
    <Modal
      title={`Merge ${supplier.name} (Manager)`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={!targetId}
            onClick={() => {
              app.mergeSuppliers(targetId, supplier.id);
              onDone(targetId);
            }}
          >
            Merge into selected
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="callout danger">
          Combines {supplier.name} into the Supplier picked below. Every Invoice, order, claim and
          InventoryItem pointing at {supplier.name} is reassigned to the survivor, and{" "}
          {supplier.name} is removed — history is repointed, never rewritten (d9).
        </div>
        <label className="field">
          <span>Merge into</span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.shortName})
              </option>
            ))}
          </select>
        </label>
        {target && (
          <div className="callout">
            The survivor's ledger absorbs this one's: their outstanding A/P becomes{" "}
            <strong>${Math.abs(combined ?? 0).toFixed(2)}</strong>, and their Received and Sold
            totals absorb {supplier.name}'s. Whether that is the right reading of a merge is an open
            question in M-01.
          </div>
        )}
      </div>
    </Modal>
  );
}
