import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarcodeInput } from "../components/BarcodeInput";
import { ReserveModal } from "../components/ReserveModal";
import { TitlecardPanel } from "../components/TitlecardPanel";
import type { RecordEntry } from "../data/types";
import { resolveScan } from "../lib/resolve";
import { money } from "../lib/money";
import { availableOnHand, heldCount, onHand } from "../lib/totals";
import { useApp } from "../store/AppStore";

// E-03 Search and E-04 Titlecard share one screen: the titlecard for the
// selected Record sits at the top, search + results below it to find or
// switch to a different one. Selection is carried in the URL (recordId) so
// it's deep-linkable and independent of what the search box currently
// filters — picking a new Record doesn't lose your place if you go on to
// type a different search term.
export function Search() {
  const app = useApp();
  const nav = useNavigate();
  const { recordId } = useParams();
  const [term, setTerm] = useState("blue");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [reserveRecord, setReserveRecord] = useState<RecordEntry | null>(null);

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    const match = (r: RecordEntry) =>
      !q ||
      [r.artist, r.title, r.label, r.catalogNo, r.genre, r.section, r.manufacturerUpc]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));

    const held = app.records.filter((r) => !r.catalogOnly && match(r));
    const catalogOnly = app.records.filter((r) => r.catalogOnly && match(r));

    // E-03 decision 4 — stock we hold sorts above catalog-only; within, on hand first
    held.sort((a, b) => onHand(b.id, app.inventory) - onHand(a.id, app.inventory));
    return { held, catalogOnly: app.discogsUp ? catalogOnly : [] };
  }, [term, app.records, app.inventory, app.discogsUp]);

  // Selection defaults to the last-searched/added item (E-04) — the top
  // result — but a URL recordId always wins, so a selection survives typing
  // a new search term into the box below.
  const selectedId = recordId ?? results.held[0]?.id ?? results.catalogOnly[0]?.id;
  const selectedRecord = app.recordFor(selectedId);

  const select = (id: string) => nav(`/search/${id}`, { replace: true });

  const doScan = (code: string) => {
    const res = resolveScan(code, app);
    if (res.kind === "internal") {
      setScanMsg(`Internal barcode → one copy: ${res.record.title} (${res.item.grade}).`);
      select(res.record.id);
    } else if (res.kind === "upc-single" || res.kind === "upc-multi") {
      setScanMsg(`Manufacturer UPC → Record: ${res.record.title}.`);
      select(res.record.id);
    } else if (res.kind === "giftcard") {
      setScanMsg(`Gift card ${res.card.code} — balance ${money(res.card.balance)}. (Handled at the till, not search.)`);
    } else if (res.kind === "nontracked") {
      setScanMsg(`Non-tracked item ${res.item.code}. (Handled at the till, not search.)`);
    } else {
      setScanMsg(`No match for “${code}”.`);
    }
  };

  return (
    <div>
      {selectedRecord ? (
        <TitlecardPanel recordId={selectedRecord.id} onReserved={(id) => nav(`/sell/${id}`)} />
      ) : (
        <div className="callout">No item selected yet — search for something below.</div>
      )}

      <hr className="hr" style={{ margin: "var(--sp-5) 0" }} />

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body stack">
          <label className="field" style={{ margin: 0 }}>
            <span>Search — artist, title, label, catalog no., genre, Section, UPC</span>
            <input
              type="search"
              value={term}
              autoFocus
              onChange={(e) => setTerm(e.target.value)}
              placeholder="try: blue · rumours · jazz · warner · radiohead"
            />
          </label>
          <BarcodeInput onScan={doScan} placeholder="…or scan a barcode to resolve directly" />
          {scanMsg && <div className="callout ok">{scanMsg}</div>}
          {!app.discogsUp && (
            <div className="callout danger">
              Discogs is unreachable — catalog-only rows are hidden. Local inventory and every till
              function are unaffected. <em>(E-03 decision 8 — visible, not silent.)</em>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          Results
          <span className="muted xsmall">
            {results.held.length} in catalog · {results.catalogOnly.length} Discogs-only
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Record</th>
                <th>Format · Year</th>
                <th className="num">On hand</th>
                <th className="num">Avail.</th>
                <th className="num">Held</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.held.map((r) => {
                const copies = app.inventory.filter((i) => i.recordId === r.id && i.status !== "sold");
                const sellable = copies.filter((c) => c.status === "sellable");
                const isSelected = r.id === selectedId;
                return (
                  <FragmentRow key={r.id}>
                    <tr
                      className={"group-row row-click" + (isSelected ? " selected" : "")}
                      onClick={() => select(r.id)}
                    >
                      <td>
                        <div className="row">
                          <span className="cover" style={{ width: 34, height: 34, fontSize: 16 }}>
                            {r.art}
                          </span>
                          <div>
                            <div>
                              {r.artist} — {r.title}
                            </div>
                            <div className="xsmall muted">
                              {r.label} · {r.catalogNo} · {r.genre} · {r.section}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="small">
                        {r.format} · {r.year}
                      </td>
                      <td className="num">{onHand(r.id, app.inventory)}</td>
                      <td className="num">{availableOnHand(r.id, app.inventory)}</td>
                      <td className="num">{heldCount(r.id, app.inventory)}</td>
                      <td className="num">
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn sm"
                            title="M-02 — not in this pass"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Order
                          </button>
                          {sellable.length > 0 && (
                            <button
                              className="btn sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReserveRecord(r);
                              }}
                            >
                              Reserve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {copies.map((c) => (
                      <tr
                        key={c.id}
                        className={"nested row-click" + (isSelected ? " selected" : "")}
                        onClick={() => select(r.id)}
                      >
                        <td className="small">
                          <span className="badge grade">{c.grade}</span>{" "}
                          {c.backroom && <span className="badge warn">Backroom</span>}{" "}
                          {c.status === "held" && <span className="badge">Held</span>}
                          <span className="mono muted"> {c.internalBarcode}</span>
                          {c.conditionNote && <div className="xsmall muted">{c.conditionNote}</div>}
                        </td>
                        <td className="small muted">cost {money(c.cost)}</td>
                        <td className="num" colSpan={3}>
                          {money(c.price)}
                        </td>
                        <td />
                      </tr>
                    ))}
                    {copies.length === 0 && (
                      <tr
                        className={"nested row-click" + (isSelected ? " selected" : "")}
                        onClick={() => select(r.id)}
                      >
                        <td colSpan={6} className="small muted">
                          No copies on hand — orderable. (On order / pending order would show here.)
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}

              {results.catalogOnly.map((r) => {
                const isSelected = r.id === selectedId;
                return (
                  <tr
                    key={r.id}
                    className={"row-click" + (isSelected ? " selected" : "")}
                    onClick={() => select(r.id)}
                  >
                    <td>
                      <div className="row">
                        <span className="cover" style={{ width: 34, height: 34, fontSize: 16, filter: "grayscale(1)" }}>
                          {r.art}
                        </span>
                        <div>
                          <div>
                            {r.artist} — {r.title} <span className="badge warn">Not in stock</span>
                          </div>
                          <div className="xsmall muted">
                            Discogs match · {r.label} · {r.year} — “no, but we can order it”
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="small">
                      {r.format} · {r.year}
                    </td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num">
                      <button
                        className="btn sm"
                        title="M-02 — not in this pass"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Order
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {reserveRecord && (
        <ReserveModal
          record={reserveRecord}
          items={app.inventory.filter(
            (i) => i.recordId === reserveRecord.id && i.status === "sellable",
          )}
          onClose={() => setReserveRecord(null)}
          onDone={(saleId) => {
            setReserveRecord(null);
            nav(`/sell/${saleId}`);
          }}
        />
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
