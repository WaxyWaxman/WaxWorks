import { useState } from "react";
import { ClaimModal } from "./ClaimModal";
import { PriceEditModal, PrintLabelModal } from "./CopyModals";
import { ReserveModal } from "./ReserveModal";
import type { InventoryItem, RecordEntry } from "../data/types";
import { money } from "../lib/money";
import type { StockFacts } from "../lib/stockState";
import { STOCK_LABEL } from "../lib/stockState";
import { useApp } from "../store/AppStore";

// Track 2 of Find: the Record you picked (E-04's titlecard, minus the stock
// and order figures — those are the answer track's job now).
//
// The head is fixed and the body scrolls, so the title of the thing you are
// looking at never leaves the screen while you read down its copies.
export function FindSelection({
  record,
  facts,
  showCost,
  onToggleShowCost,
  onStatus,
  offList,
  onClearSearch,
}: {
  record: RecordEntry;
  facts: StockFacts;
  showCost: boolean;
  onToggleShowCost: () => void;
  onStatus: (confirmation: string) => void;
  /** The pinned selection is not among the rows the slab is currently listing. */
  offList: boolean;
  onClearSearch: () => void;
}) {
  const app = useApp();
  const [reserveFor, setReserveFor] = useState<InventoryItem | null>(null);
  const [priceEdit, setPriceEdit] = useState<InventoryItem | null>(null);
  const [labelFor, setLabelFor] = useState<InventoryItem | null>(null);
  const [claiming, setClaiming] = useState(false);

  const copies = app.inventory.filter((i) => i.recordId === record.id && i.status !== "sold");

  const doRemoveHold = (c: InventoryItem) => {
    const res = app.releaseHoldLine(c.id);
    if (!res) return;
    const what = `${record.artist} — ${record.title} (${c.grade})`;
    onStatus(
      res.holdClosed
        ? `Hold ${res.holdRef} cancelled — ${what} released back to sellable stock.`
        : `Removed from hold ${res.holdRef} — ${what} released back to sellable stock; other items on ${res.holdRef} are unaffected.`,
    );
  };

  return (
    <section className="find-main" aria-label="Selected Record">
      <div className="find-head">
        <span className="cover lg" style={{ width: 84, height: 84, fontSize: 40 }}>
          {record.art}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="by">{record.artist}</div>
          <h2>{record.title}</h2>
          <div className="badges">
            <span className="badge">
              <span className={"stock-dot " + facts.state} />
              {STOCK_LABEL[facts.state]}
            </span>
            <span className="badge">{record.format}</span>
            <span className="badge">
              {record.year} · {record.country}
            </span>
            <span className="badge">{record.section}</span>
            {record.stickyPrice && (
              <span className="badge warn">sticky {money(record.stickyPrice)} (New)</span>
            )}
            {record.catalogOnly && <span className="badge">catalog only</span>}
            {/* A pinned selection that has fallen out of the results leaves the
                slab with no highlighted row. Say so rather than let the list
                look broken. */}
            {offList && (
              <button className="badge offlist" onClick={onClearSearch}>
                not in these results — clear the search
              </button>
            )}
          </div>
        </div>
        <button
          className="btn ghost sm"
          onClick={onToggleShowCost}
          title="Cost is visible on this screen — a customer standing at the counter can see it too"
        >
          {showCost ? "🔓 Cost shown" : "🔒 Cost hidden"}
        </button>
      </div>

      <div className="find-scroll">
        {record.catalogOnly && (
          <div className="callout">
            This is a <strong>catalog match we don’t hold</strong>. Acting on it — ordering,
            stocking, editing — pulls it into the local catalog and prompts for store-specific
            fields (supplier, Section). <em>(E-03 decision 6.)</em>
          </div>
        )}

        <section className="find-sect">
          <div className="head">
            <span className="lab">Catalog</span>
            <span className="muted xsmall">E-04</span>
          </div>
          <div className="facts">
            <Fact k="Label / cat. no." v={`${record.label} · ${record.catalogNo}`} />
            <Fact k="Format" v={record.format} />
            <Fact k="Year / country" v={`${record.year} · ${record.country}`} />
            <Fact k="Genre / Section" v={`${record.genre} · ${record.section}`} />
            <Fact
              k="Manufacturer UPC"
              v={<span className="mono">{record.manufacturerUpc ?? "— (none on sleeve)"}</span>}
            />
            <Fact k="Catalog ID" v={<span className="mono">{record.discogsId ?? "—"}</span>} />
            <Fact
              k="Sticky price"
              v={record.stickyPrice ? `${money(record.stickyPrice)} (New)` : "no sticky price"}
            />
            <Fact
              k="Preferred supplier"
              v={
                <select
                  value={record.preferredSupplierId ?? ""}
                  onChange={(e) =>
                    app.setRecordPreferredSupplier(record.id, e.target.value || undefined)
                  }
                  style={{ width: "auto", padding: "2px var(--sp-2)", fontSize: "var(--fs-sm)" }}
                  title="A default only — the Supplier actually used is recorded on each order line (M-02)"
                >
                  <option value="">— none —</option>
                  {app.suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} ({sup.shortName})
                    </option>
                  ))}
                </select>
              }
            />
          </div>
          <div className="btn-row">
            <button className="btn sm">Edit catalog</button>
            <button className="btn sm" onClick={() => setClaiming(true)}>
              Claim vs. supplier
            </button>
          </div>
        </section>

        <section className="find-sect">
          <div className="head">
            <span className="lab">Copies</span>
            <span className="muted xsmall">
              each InventoryItem — grade, price, cost, internal barcode
            </span>
          </div>
          {copies.length > 0 ? (
            // Six columns and three buttons a row outgrow a narrow middle
            // track. The table scrolls inside its own box rather than pushing
            // the track sideways.
            <div className="find-table">
            <table className="data">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Internal barcode</th>
                  <th className="num">Cost</th>
                  <th className="num">Price</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {copies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="badge grade">{c.grade}</span>
                    </td>
                    <td className="mono small muted">{c.internalBarcode}</td>
                    <td className="num">
                      {showCost ? (
                        money(c.cost)
                      ) : (
                        <span
                          className="muted mono"
                          title="Cost hidden — use Cost shown/hidden above to reveal"
                        >
                          ••••
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <strong>{money(c.price)}</strong>
                    </td>
                    <td className="small">
                      {c.status === "held" ? (
                        <span className="badge">
                          Held · {app.customerFor(c.heldByCustomerId)?.name ?? "customer"}
                        </span>
                      ) : c.backroom ? (
                        <span className="badge warn">Backroom</span>
                      ) : (
                        <span className="badge ok">Sellable</span>
                      )}
                      {c.conditionNote && <div className="xsmall muted">{c.conditionNote}</div>}
                    </td>
                    <td className="num">
                      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn sm" onClick={() => setPriceEdit(c)}>
                          Edit price
                        </button>
                        <button className="btn sm" onClick={() => setLabelFor(c)}>
                          Print label
                        </button>
                        {c.status === "sellable" && (
                          <button className="btn sm" onClick={() => setReserveFor(c)}>
                            Put on hold
                          </button>
                        )}
                        {c.status === "held" && (
                          <button className="btn sm danger" onClick={() => doRemoveHold(c)}>
                            Remove hold
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="callout">
              <NoCopiesLine facts={facts} />
            </div>
          )}
        </section>

        <section className="find-sect">
          <div className="head">
            <span className="lab">Sold history</span>
            <span className="muted xsmall">reachable from here, not mixed into results — E-03</span>
          </div>
          <div className="callout">
            {facts.everSold > 0
              ? `${facts.everSold} sold all time. Full history not in this pass.`
              : "Never sold here."}
          </div>
        </section>
      </div>

      {reserveFor && (
        <ReserveModal
          record={record}
          items={[reserveFor]}
          initialItemId={reserveFor.id}
          onClose={() => setReserveFor(null)}
          onDone={(confirmation) => {
            setReserveFor(null);
            onStatus(confirmation);
          }}
        />
      )}
      {priceEdit && <PriceEditModal item={priceEdit} onClose={() => setPriceEdit(null)} />}
      {labelFor && (
        <PrintLabelModal
          item={labelFor}
          record={record}
          onClose={() => setLabelFor(null)}
          onDone={onStatus}
        />
      )}
      {claiming && (
        <ClaimModal
          record={record}
          items={copies}
          onClose={() => setClaiming(false)}
          onDone={onStatus}
        />
      )}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fact">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

// A Record with no copies is not one situation but three, and telling them
// apart is the whole point of the stock states.
function NoCopiesLine({ facts }: { facts: StockFacts }) {
  if (facts.state === "coming") {
    return (
      <>
        None on hand — {facts.onOrder} on order, so “it’s coming” is answerable without leaving the
        screen.
      </>
    );
  }
  if (facts.state === "before") {
    return (
      <>
        None on hand — but we have stocked it before
        {facts.everSold > 0 ? `, and sold ${facts.everSold}` : ""}.{" "}
        {facts.raised > 0
          ? `${facts.raised} pending on a supplier stream, not placed yet (M-02).`
          : "Orderable."}
      </>
    );
  }
  return (
    <>
      Catalog match — we have never stocked this.{" "}
      {facts.raised > 0
        ? `${facts.raised} pending on a supplier stream, not placed yet (M-02).`
        : "“No, but we can order it.”"}
    </>
  );
}
