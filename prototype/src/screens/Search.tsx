import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FindAnswer } from "../components/FindAnswer";
import { FindSelection } from "../components/FindSelection";
import { FindSlab, type Hit } from "../components/FindSlab";
import type { RecordEntry } from "../data/types";
import { resolveScan } from "../lib/resolve";
import { money } from "../lib/money";
import { stockFacts, stockRank, type StockState } from "../lib/stockState";
import { useApp } from "../store/AppStore";

// E-03 Find and E-04 Titlecard share one screen, now laid out as the till's
// three tracks (E-05 d29): the slab you look in, the Record you picked, and
// the answer to the question the customer actually asked. The frame is pinned
// to the viewport and each track scrolls on its own, so the search box and the
// actions are always where they were last time.
//
// Selection is carried in the URL (recordId) so it is deep-linkable and
// independent of what the search box currently filters — a selection survives
// typing a different search term, which is what makes the recent strip safe to
// click from.
//
// Results are one ranked list carrying STOCK STATE — here now, on the way, had
// before, never stocked (see lib/stockState). E-03 already put all four kinds
// of thing in scope; what it never said was how an employee tells them apart
// while a customer waits.

// Per till, not per employee: this is the machine at the counter, the same way
// the till rail's own open/shut state already is.
const SLAB_KEY = "waxworks.find.slab";
const RECENT_KEY = "waxworks.find.recent";
const RECENT_MAX = 9;

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    /* private window, or site data blocked — the slab just forgets */
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do — forgetting is an acceptable outcome here */
  }
}

export function Search() {
  const app = useApp();
  const nav = useNavigate();
  const { recordId } = useParams();

  const [term, setTerm] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Cost is hidden by default — a customer standing at the counter can read
  // this screen too. One toggle covers the copies table and everything nested.
  const [showCost, setShowCost] = useState(false);
  // Null means "all four states". Filtering narrows the same ranked list
  // rather than switching to a different one, so the bands never move.
  const [filter, setFilter] = useState<StockState | null>(null);
  // Open on arrival, cursor in the box: Find begins with a search. (The till
  // rail starts shut for the opposite reason — a sale begins with a scan.)
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStored<string[]>(RECENT_KEY, []));

  useEffect(() => writeStored(SLAB_KEY, slabOpen), [slabOpen]);
  useEffect(() => writeStored(RECENT_KEY, recentIds), [recentIds]);

  const hits: Hit[] = useMemo(() => {
    const q = term.trim().toLowerCase();
    const match = (r: RecordEntry) =>
      !q ||
      [r.artist, r.title, r.label, r.catalogNo, r.genre, r.section, r.manufacturerUpc]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));

    const input = { inventory: app.inventory, pendingOrders: app.pendingOrders, sales: app.sales, invoices: app.invoices };
    const rows = app.records
      // A catalog-only match is a provider result: when the provider is down
      // it simply isn't there to show (E-03 decision 8).
      .filter((r) => match(r) && (app.discogsUp || !r.catalogOnly))
      .map((r) => ({ record: r, facts: stockFacts(r, input) }));

    // E-03 decision 4 — stock we hold sorts first. The four states extend that
    // into one ranked list: here, on the way, had before, never stocked, with
    // the most stock first inside each band.
    rows.sort(
      (a, b) =>
        stockRank(a.facts.state) - stockRank(b.facts.state) ||
        b.facts.onHand - a.facts.onHand ||
        a.record.artist.localeCompare(b.record.artist),
    );
    return rows;
  }, [term, app.records, app.inventory, app.pendingOrders, app.sales, app.invoices, app.discogsUp]);

  const counts = useMemo(() => {
    const c: Record<StockState, number> = { here: 0, coming: 0, before: 0, never: 0 };
    for (const h of hits) c[h.facts.state] += 1;
    return c;
  }, [hits]);

  const visible = useMemo(
    () => (filter ? hits.filter((h) => h.facts.state === filter) : hits),
    [hits, filter],
  );

  // A URL recordId always wins. Without one, the top visible result stands in
  // — but the moment something is picked it goes in the URL and stops moving,
  // which is what lets the recent strip be clicked while a stale search term
  // is still in the box.
  const selectedId = recordId ?? visible[0]?.record.id ?? hits[0]?.record.id;
  // Resolved against the CATALOG, not against the result list. Looking it up
  // in the results would make the selection a function of the search box —
  // type a term the pinned Record doesn't match and the middle and right
  // tracks would empty out, which is the opposite of what pinning it is for.
  const selected = useMemo(() => {
    const record = selectedId ? app.recordFor(selectedId) : undefined;
    if (!record) return undefined;
    const input = { inventory: app.inventory, pendingOrders: app.pendingOrders, sales: app.sales, invoices: app.invoices };
    return { record, facts: stockFacts(record, input) };
  }, [selectedId, app.records, app.inventory, app.pendingOrders, app.sales, app.invoices]);
  // The pinned selection is not among the rows currently listed — the slab has
  // no highlighted row, and the selection track says so rather than leaving
  // that looking broken.
  const offList = Boolean(recordId) && !visible.some((h) => h.record.id === selectedId);

  const select = (id: string) => {
    nav(`/search/${id}`, { replace: true });
    setRecentIds((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, RECENT_MAX));
  };

  // Recently viewed resolves against the live catalog every render, so a
  // remembered id for a Record that no longer exists just drops out.
  const recent = useMemo(() => {
    const input = { inventory: app.inventory, pendingOrders: app.pendingOrders, sales: app.sales, invoices: app.invoices };
    return recentIds
      .map((id) => app.recordFor(id))
      .filter((r): r is RecordEntry => Boolean(r))
      .map((r) => ({ record: r, facts: stockFacts(r, input) }));
  }, [recentIds, app.inventory, app.pendingOrders, app.sales, app.invoices, app.records]);

  const doScan = (code: string) => {
    const res = resolveScan(code, app);
    if (res.kind === "internal") {
      setStatusMsg(`Internal barcode → one copy: ${res.record.title} (${res.item.grade}).`);
      select(res.record.id);
    } else if (res.kind === "upc-single" || res.kind === "upc-multi") {
      setStatusMsg(`Manufacturer UPC → Record: ${res.record.title}.`);
      select(res.record.id);
    } else if (res.kind === "giftcard") {
      setStatusMsg(
        `Gift card ${res.card.code} — balance ${money(res.card.balance)}. (Handled at the till, not Find.)`,
      );
    } else if (res.kind === "nontracked") {
      setStatusMsg(`Non-tracked item ${res.item.code}. (Handled at the till, not Find.)`);
    } else {
      setStatusMsg(`No match for “${code}”.`);
    }
  };

  return (
    <div className={"find-frame" + (slabOpen ? "" : " slab-shut")}>
      <FindSlab
        open={slabOpen}
        onOpenChange={setSlabOpen}
        term={term}
        onTermChange={setTerm}
        onScan={doScan}
        providerDown={!app.discogsUp}
        hits={hits}
        counts={counts}
        filter={filter}
        onFilterChange={setFilter}
        selectedId={selectedId}
        onSelect={select}
        recent={recent}
      />

      {selected ? (
        <>
          <FindSelection
            record={selected.record}
            facts={selected.facts}
            showCost={showCost}
            onToggleShowCost={() => setShowCost((v) => !v)}
            onStatus={setStatusMsg}
            offList={offList}
            onClearSearch={() => {
              setTerm("");
              setFilter(null);
            }}
          />
          <FindAnswer record={selected.record} facts={selected.facts} onStatus={setStatusMsg} />
        </>
      ) : (
        // Only reachable with nothing selected AND nothing to fall back to —
        // a search that matched no Record at all.
        <div className="find-nosel">
          <div>
            <h2>Nothing found</h2>
            <p className="muted">
              {app.discogsUp
                ? "No Record matches that search. Try fewer words, or scan the sleeve."
                : "The catalog provider is unreachable, so catalog-only matches are hidden. Local inventory is unaffected."}
            </p>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className="find-toast">
          <span>{statusMsg}</span>
          <button className="btn ghost sm" onClick={() => setStatusMsg(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
