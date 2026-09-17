import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FindAnswer } from "../components/FindAnswer";
import { FindSelection } from "../components/FindSelection";
import { FindSlab, hitId, hitState, type Hit } from "../components/FindSlab";
import { ReleaseSelection } from "../components/ReleaseSelection";
import type { RecordEntry } from "../data/types";
import { readStored, writeStored } from "../lib/tillMemory";
import { resolveScan } from "../lib/resolve";
import { money } from "../lib/money";
import { genreNameFor, sectionSearchTerms } from "../lib/taxonomy";
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
  // E-03 d21 — the local half searches `term` as it is typed; the provider
  // half searches `providerTerm`, which is only set on Enter. Two states
  // rather than one is the whole mechanism: "where is this in the shop" never
  // waits on, or spends, a provider request.
  const [providerTerm, setProviderTerm] = useState("");
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStored<string[]>(RECENT_KEY, []));

  useEffect(() => writeStored(SLAB_KEY, slabOpen), [slabOpen]);
  useEffect(() => writeStored(RECENT_KEY, recentIds), [recentIds]);

  const hits: Hit[] = useMemo(() => {
    const q = term.trim().toLowerCase();
    const match = (r: RecordEntry) => {
      if (!q) return true;
      // d31 — Section resolves through the genre rather than sitting on
      // the Record. Matches the Section's code and its name.
      const fields = [
        r.artist,
        r.title,
        r.label,
        r.catalogNo,
        genreNameFor(app.genres, r.genreId),
        sectionSearchTerms(app.genres, app.sections, r.genreId),
        r.manufacturerUpc,
      ];
      if (fields.filter(Boolean).some((f) => String(f).toLowerCase().includes(q))) return true;
      // E-03 d15 — internal barcode is a TYPED dimension too. d9 governs what
      // a scan does; a number read off a sleeve by hand has to reach the same
      // Record, and returned "nothing found" until now. It lists the Record
      // among the results rather than short-circuiting the way a scan does.
      return app.inventory.some((i) => i.recordId === r.id && i.internalBarcode.toLowerCase().includes(q));
    };

    const input = { inventory: app.inventory, pendingOrders: app.pendingOrders, sales: app.sales, invoices: app.invoices };
    // Ours: every Record here is one the shop adopted (d18).
    const rows: Hit[] = app.records
      .filter((r) => match(r))
      .map((r) => ({ kind: "record" as const, record: r, facts: stockFacts(r, input) }));

    // E-03 decision 4 — stock we hold sorts first. The four states extend that
    // into one ranked list: here, on the way, had before, never stocked, with
    // the most stock first inside each band.
    // E-03 d21 — the provider half answers only on Enter, so it keys off
    // `providerTerm` rather than what is being typed. The local half above
    // never waits on it and never spends a request against the rate limit.
    //
    // d8 — with the provider unreachable there is simply nothing to add,
    // and now the outage shows at the moment it was asked for.
    const pq = providerTerm.trim().toLowerCase();
    const adopted = new Set(app.records.map((r) => r.manufacturerUpc).filter(Boolean));
    const releases: Hit[] =
      pq && app.providerUp
        ? app.releaseCache
            .filter(
              (rel) =>
                !adopted.has(rel.manufacturerUpc) &&
                !app.records.some((r) => r.artist === rel.artist && r.title === rel.title) &&
                [rel.artist, rel.title, rel.label, rel.catalogNo].some((f) =>
                  f.toLowerCase().includes(pq),
                ),
            )
            .map((rel) => ({ kind: "release" as const, release: rel }))
        : [];

    const all = [...rows, ...releases];
    // E-03 decision 4 — stock we hold sorts first, and an unadopted match
    // bands as *never stocked* like any Record with nothing on the shelf (d17).
    all.sort(
      (a, b) =>
        stockRank(hitState(a)) - stockRank(hitState(b)) ||
        (b.kind === "record" ? b.facts.onHand : 0) - (a.kind === "record" ? a.facts.onHand : 0) ||
        (a.kind === "record" ? a.record.artist : a.release.artist).localeCompare(
          b.kind === "record" ? b.record.artist : b.release.artist,
        ),
    );
    return all;
  }, [
    term,
    providerTerm,
    app.records,
    app.releaseCache,
    app.inventory,
    app.pendingOrders,
    app.sales,
    app.invoices,
    app.providerUp,
  ]);

  const counts = useMemo(() => {
    const c: Record<StockState, number> = { here: 0, coming: 0, before: 0, never: 0 };
    for (const h of hits) c[hitState(h)] += 1;
    return c;
  }, [hits]);

  const visible = useMemo(
    () => (filter ? hits.filter((h) => hitState(h) === filter) : hits),
    [hits, filter],
  );

  // A URL recordId always wins. Without one, the top visible result stands in
  // — but the moment something is picked it goes in the URL and stops moving,
  // which is what lets the recent strip be clicked while a stale search term
  // is still in the box.
  const selectedId = recordId ?? (visible[0] && hitId(visible[0])) ?? (hits[0] && hitId(hits[0]));
  // Resolved against the CATALOG, not against the result list. Looking it up
  // in the results would make the selection a function of the search box —
  // type a term the pinned Record doesn't match and the middle and right
  // tracks would empty out, which is the opposite of what pinning it is for.
  // d18 — the selection is a Record of ours, or a provider match we have not
  // adopted. Resolved against the catalog and the cache rather than against
  // the result list, for the reason below.
  const selectedRelease = useMemo(
    () => (selectedId ? app.releaseCache.find((r) => r.id === selectedId) : undefined),
    [selectedId, app.releaseCache],
  );
  const selected = useMemo(() => {
    const record = selectedId ? app.recordFor(selectedId) : undefined;
    if (!record) return undefined;
    const input = { inventory: app.inventory, pendingOrders: app.pendingOrders, sales: app.sales, invoices: app.invoices };
    return { record, facts: stockFacts(record, input) };
  }, [selectedId, app.records, app.inventory, app.pendingOrders, app.sales, app.invoices]);
  // The pinned selection is not among the rows currently listed — the slab has
  // no highlighted row, and the selection track says so rather than leaving
  // that looking broken.
  const offList = Boolean(recordId) && !visible.some((h) => hitId(h) === selectedId);

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
        onTermChange={(v) => {
          setTerm(v);
          // d21 — provider results belong to the term they were ASKED
          // for. Typing anything else makes them stale, so they go rather
          // than sitting under a search that no longer describes them.
          setProviderTerm("");
        }}
        onSubmit={() => setProviderTerm(term)}
        onScan={doScan}
        providerDown={!app.providerUp}
        hits={hits}
        counts={counts}
        filter={filter}
        onFilterChange={setFilter}
        selectedId={selectedId}
        onSelect={select}
        recent={recent}
      />

      {selectedRelease ? (
        <ReleaseSelection
          release={selectedRelease}
          by={app.sessionUser?.initials ?? ""}
          onAdopted={(rec) => select(rec.id)}
        />
      ) : selected ? (
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
              {app.providerUp
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
