import { useState } from "react";
import { ClaimModal } from "../components/ClaimModal";
import { Modal } from "../components/Modal";
import { ReserveModal } from "../components/ReserveModal";
import type { InventoryItem, RecordEntry } from "../data/types";
import { money, roundUpShelf } from "../lib/money";
import {
  availableOnHand,
  backroomCount,
  heldCount,
  onHand,
} from "../lib/totals";
import { useApp } from "../store/AppStore";

// The titlecard is a view, not a route of its own (E-04 decision 1) — it's
// embedded in the Search screen (E-03), which owns the outer page chrome.
// Given a Record, this renders everything E-04 specifies: catalog, copies,
// stock/orders/history, Reserve, and the below-cost guardrail.
export function TitlecardPanel({
  recordId,
  onStatus,
  showCost,
  onToggleShowCost,
}: {
  recordId: string;
  onStatus: (confirmation: string) => void;
  showCost: boolean;
  onToggleShowCost: () => void;
}) {
  const app = useApp();
  const record = app.recordFor(recordId);
  const [reserveFor, setReserveFor] = useState<InventoryItem | null>(null);
  const [priceEdit, setPriceEdit] = useState<InventoryItem | null>(null);
  const [labelFor, setLabelFor] = useState<InventoryItem | null>(null);
  const [claiming, setClaiming] = useState(false);

  if (!record) return <p className="muted">Unknown Record.</p>;
  const copies = app.inventory.filter((i) => i.recordId === record.id && i.status !== "sold");
  const oh = onHand(record.id, app.inventory);
  const belowMin = oh < record.minOnHand;

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
    <div>
      {record.catalogOnly && (
        <div className="callout">
          This is a <strong>catalog match we don’t hold</strong>. Acting on it — ordering,
          stocking, editing — pulls it into the local catalog and prompts for store-specific fields
          (supplier, Section). <em>(E-03 decision 6.)</em>
        </div>
      )}

      <div className="grid cols-2">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              Catalog
              <span className="flow-id" style={{ marginTop: 0 }}>
                E-04
              </span>
            </div>
            <div className="card-body">
              <div className="row" style={{ alignItems: "flex-start", gap: "var(--sp-4)" }}>
                <span className="cover lg">{record.art}</span>
                <div className="small stack" style={{ flex: 1 }}>
                  <h2 style={{ margin: 0 }}>
                    {record.artist} — {record.title}
                  </h2>
                  <table className="data">
                    <tbody>
                      <Row k="Label / cat. no." v={`${record.label} · ${record.catalogNo}`} />
                      <Row k="Format" v={record.format} />
                      <Row k="Year / country" v={`${record.year} · ${record.country}`} />
                      <Row k="Genre / Section" v={`${record.genre} · ${record.section}`} />
                      <Row k="Manufacturer UPC" v={record.manufacturerUpc ?? "— (none on sleeve)"} />
                      <Row k="Catalog ID / sticky" v={`${record.discogsId ?? "—"} · ${record.stickyPrice ? money(record.stickyPrice) + " (New)" : "no sticky price"}`} />
                    </tbody>
                  </table>
                  <div className="btn-row">
                    <button className="btn sm">Edit catalog</button>
                    <button className="btn sm" title="M-02 — not in this pass">
                      Order
                    </button>
                    <button className="btn sm" onClick={() => setClaiming(true)}>
                      Claim vs. supplier
                    </button>
                    <button className="btn sm" title="Manager only">
                      Adjust on hand (Mgr)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              Copies
              <span className="row" style={{ gap: "var(--sp-3)" }}>
                <span className="muted xsmall">
                  each InventoryItem — grade, price, cost, internal barcode
                </span>
                <button
                  className="btn ghost sm"
                  onClick={onToggleShowCost}
                  title="Cost is visible on this screen — a customer standing at the counter can see it too"
                >
                  {showCost ? "🔓 Cost shown" : "🔒 Cost hidden"}
                </button>
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
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
                      <td className="mono small">{c.internalBarcode}</td>
                      <td className="num">
                        {showCost ? (
                          money(c.cost)
                        ) : (
                          <span className="muted mono" title="Cost hidden — click Cost shown/hidden above to reveal">
                            ••••
                          </span>
                        )}
                      </td>
                      <td className="num">{money(c.price)}</td>
                      <td className="small">
                        {c.status === "held" ? (
                          <span className="badge">Held · {app.customerFor(c.heldByCustomerId)?.name ?? "customer"}</span>
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
                  {copies.length === 0 && (
                    <tr>
                      <td colSpan={6} className="small muted">
                        No copies on hand.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">Stock</div>
            <div className="card-body small">
              <div className="totals-row">
                <span>On hand (derived)</span>
                <strong className="num">{oh}</strong>
              </div>
              <div className="totals-row">
                <span>Available on hand</span>
                <span className="num">{availableOnHand(record.id, app.inventory)}</span>
              </div>
              <div className="totals-row">
                <span>Held for customers</span>
                <span className="num">{heldCount(record.id, app.inventory)}</span>
              </div>
              <div className="totals-row">
                <span>In backroom</span>
                <span className="num">{backroomCount(record.id, app.inventory)}</span>
              </div>
              <div className="totals-row">
                <span>Minimum on hand</span>
                <span className="num">{record.minOnHand}</span>
              </div>
              {belowMin && (
                <div className="callout">
                  Below minimum on hand. Informational only in v1 — does not raise an order.
                  <em> (E-04 decision 13.)</em>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">Orders</div>
            <div className="card-body small muted">
              <div className="totals-row">
                <span>Pending order</span>
                <span className="num">0</span>
              </div>
              <div className="totals-row">
                <span>On order</span>
                <span className="num">0</span>
              </div>
              <div className="totals-row">
                <span>Backordered</span>
                <span className="num">0</span>
              </div>
              <p className="xsmall" style={{ marginTop: "var(--sp-2)" }}>
                Populated by M-02 (Re-order) — not in this pass.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-head">Sold history</div>
            <div className="card-body small muted">
              Reachable from here, not mixed into search (E-03). Not in this pass.
            </div>
          </div>
        </div>
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
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="muted" style={{ width: 150 }}>
        {k}
      </td>
      <td>{v}</td>
    </tr>
  );
}

function PrintLabelModal({
  item,
  record,
  onClose,
  onDone,
}: {
  item: InventoryItem;
  record: RecordEntry;
  onClose: () => void;
  onDone: (confirmation: string) => void;
}) {
  const [qty, setQty] = useState(1);

  const commit = () => {
    onDone(
      `Printed ${qty} label${qty === 1 ? "" : "s"} — ${item.internalBarcode} ` +
        `(${item.grade}, ${money(item.price)}).`,
    );
    onClose();
  };

  return (
    <Modal
      title={`Print label — ${record.artist} — ${record.title}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={qty < 1} onClick={commit}>
            Print {qty} label{qty === 1 ? "" : "s"}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          A Code 128 store label for this copy, with condition and price printed as human-readable
          text alongside the code — legible without a scanner, and the code itself stays an opaque
          ID so re-grading or re-pricing later doesn't require a reprint. <em>(PRD §4.3.)</em>
        </p>
        <div className="small muted">
          <span className="badge grade">{item.grade}</span> {money(item.price)} ·{" "}
          <span className="mono">{item.internalBarcode}</span>
        </div>
        <label className="field">
          <span>Number of copies</span>
          <input
            className="inline-num"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
        </label>
      </div>
    </Modal>
  );
}

function PriceEditModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const app = useApp();
  const [raw, setRaw] = useState(String(item.price));
  const next = Number(raw) || 0;
  const rounded = roundUpShelf(next);
  const belowCost = next < item.cost;

  const commit = () => {
    app.setCopyPrice(item.id, rounded);
    onClose();
  };

  return (
    <Modal
      title="Edit copy price (shelf price)"
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={next <= 0} onClick={commit}>
            Save price
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="small muted">
          Cost {money(item.cost)} · current shelf {money(item.price)}
        </div>
        <label className="field">
          <span>New shelf price</span>
          <input type="number" step="0.01" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </label>
        <div className="callout">
          Rounds up to <strong>{money(rounded)}</strong> — shelf prices suggest ending in{" "}
          <span className="mono">.50</span> or <span className="mono">.99</span>, though any amount
          is accepted (E-02 decision 32 / E-04 decision 17).
        </div>
        {belowCost && (
          <div className="callout">
            <strong>Below cost.</strong> This proceeds and raises a review flag for a manager
            rather than blocking (M-04 decision 8) — no override needed.
          </div>
        )}
      </div>
    </Modal>
  );
}
