import { useState } from "react";
import { ManagerOverride } from "./ManagerOverride";
import { OrderModal } from "./OrderModal";
import { ReserveModal } from "./ReserveModal";
import type { RecordEntry } from "../data/types";
import { agoLabel, type StockFacts } from "../lib/stockState";
import { backroomCount } from "../lib/totals";
import { useApp } from "../store/AppStore";

// Track 3 of Find: the answer to the question the customer actually asked.
//
// Head and foot are fixed and only the figures between them scroll, so the
// action sits in the same place on a one-copy Record and a six-copy one —
// the same reason Finish sale has its own floor at the till (E-05 d29).
export function FindAnswer({
  record,
  facts,
  onStatus,
}: {
  record: RecordEntry;
  facts: StockFacts;
  onStatus: (confirmation: string) => void;
}) {
  const app = useApp();
  const [reserving, setReserving] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const backroom = backroomCount(record.id, app.inventory);
  const sellable = app.inventory.filter((i) => i.recordId === record.id && i.status === "sellable");
  const outstandingOversold = app.inventory.filter(
    (i) => i.recordId === record.id && i.oversold && !i.oversoldReconciledAt,
  );
  const belowMin = facts.onHand < record.minOnHand;

  // AVAILABLE, not on hand — the figure you can actually promise someone. A
  // held copy is already somebody else's.
  //
  // "never stocked" gets a dash rather than a zero: "we don't carry it" and
  // "we're out" are different answers, and a 0 flattens them into one.
  const big = facts.state === "never" ? "—" : String(facts.available);

  return (
    <aside className="find-answer" aria-label="Stock answer and actions">
      <div className="answer-head">
        <div className="lab">Do we have it?</div>
        <div className={"answer-big " + facts.state}>{big}</div>
        <div className="answer-say">{sayLine(facts)}</div>
        <div className="answer-sub">{subLine(facts, backroom)}</div>
      </div>
      <div className="answer-rule" />

      <div className="answer-mid">
        <div>
          <Tot k="Available to sell" v={facts.available} />
          <Tot k="On hand (derived)" v={facts.onHand} />
          <Tot k="Held for customers" v={facts.held} />
          <Tot k="In backroom" v={backroom} />
          <Tot k="Minimum on hand" v={record.minOnHand} />
          {outstandingOversold.length > 0 && (
            <Tot k="Oversold, unreconciled" v={outstandingOversold.length} danger />
          )}
        </div>

        <div>
          <div className="lab" style={{ marginBottom: 6 }}>
            Orders
          </div>
          <Tot k="On order (placed)" v={facts.onOrder} />
          {/* M-02's own word for a line raised into a supplier stream with no
              PO number yet (d1, d9, d11). Kept separate from "on order"
              because it is not a promise anyone can make to a customer
              (E-03 d13). */}
          <Tot k="Pending" v={facts.raised} />
          <Tot k="Backordered" v={<span className="muted">not modelled</span>} />
        </div>

        {belowMin && (
          <div className="callout">
            Below minimum on hand. Informational only in v1 — does not raise an order.{" "}
            <em>(E-04 decision 13.)</em>
          </div>
        )}

        {outstandingOversold.length > 0 && (
          <div className="callout danger">
            Sold before ever being received — a promise the copy exists{" "}
            <em>(E-05 decision 21)</em>. Clears automatically, oldest first, when matching stock is
            received — or Adjust on hand below forces it to zero.
          </div>
        )}
      </div>

      <div className="answer-foot">
        {/* One accent per screen, pointed at the thing the stock state says
            you would actually do next. */}
        {facts.available > 0 ? (
          <button className="btn primary" onClick={() => setReserving(true)}>
            Put on hold
          </button>
        ) : (
          <button className="btn primary" onClick={() => setOrdering(true)}>
            Order this
          </button>
        )}
        <div className="answer-acts">
          {facts.available > 0 ? (
            <button className="btn" onClick={() => setOrdering(true)}>
              Order more
            </button>
          ) : (
            <button className="btn" disabled title="Nothing available to hold">
              Put on hold
            </button>
          )}
          <button className="btn" title="M-02 — not in this pass">
            What&rsquo;s on order
          </button>
          <button
            className={"btn" + (outstandingOversold.length ? " danger" : "")}
            disabled={outstandingOversold.length === 0}
            onClick={() => setAdjusting(true)}
            title={
              outstandingOversold.length
                ? `Force ${outstandingOversold.length} outstanding oversold cop${outstandingOversold.length === 1 ? "y" : "ies"} back to zero`
                : "Manager only — nothing outstanding to adjust yet"
            }
          >
            Adjust (Mgr)
          </button>
          <button className="btn" title="E-04 — not in this pass">
            Sold history
          </button>
        </div>
      </div>

      {reserving && (
        <ReserveModal
          record={record}
          items={sellable}
          onClose={() => setReserving(false)}
          onDone={(confirmation) => {
            setReserving(false);
            onStatus(confirmation);
          }}
        />
      )}
      {ordering && (
        <OrderModal record={record} onClose={() => setOrdering(false)} onDone={onStatus} />
      )}
      {adjusting && (
        <ManagerOverride
          reason={`Force ${outstandingOversold.length} outstanding oversold cop${outstandingOversold.length === 1 ? "y" : "ies"} of ${record.artist} — ${record.title} back to zero. Use this only when there's no incoming shipment to explain the deficit — receiving matching stock reconciles it automatically instead.`}
          onCancel={() => setAdjusting(false)}
          onConfirm={(by) => {
            const n = app.reconcileOversold(record.id, by);
            setAdjusting(false);
            onStatus(`Adjusted on hand — ${n} oversold cop${n === 1 ? "y" : "ies"} cleared.`);
          }}
        />
      )}
    </aside>
  );
}

function Tot({ k, v, danger }: { k: string; v: React.ReactNode; danger?: boolean }) {
  return (
    <div className="totals-row">
      <span>{k}</span>
      <span className="num mono" style={danger ? { color: "var(--c-danger)" } : undefined}>
        <strong>{v}</strong>
      </span>
    </div>
  );
}

function sayLine(facts: StockFacts): string {
  switch (facts.state) {
    case "here":
      return facts.available > 0 ? "available to sell, right now" : "on hand — every copy is held";
    case "coming":
      return `available — ${facts.onOrder} on the way`;
    case "before":
      return "available — we’ve had it before";
    case "never":
      return "never stocked";
  }
}

// The figures the big number deliberately excludes. The backroom is called out
// because two available reads as two on the shelf unless the line says one of
// them is a walk out back.
function subLine(facts: StockFacts, backroom: number): string {
  const parts: string[] = [];
  const ago = agoLabel(facts.lastSoldAt);

  if (facts.state === "here") {
    parts.push(`${facts.onHand} on hand`);
    if (facts.held > 0) parts.push(`${facts.held} held`);
    if (backroom > 0) parts.push(`${backroom} in the backroom`);
    if (facts.onOrder > 0) parts.push(`+${facts.onOrder} on order`);
  } else if (facts.state === "coming") {
    parts.push(`${facts.onOrder} on order, none on the floor`);
  } else if (facts.state === "never") {
    return facts.raised > 0 ? `${facts.raised} pending — catalog match only` : "catalog match only";
  }

  if (ago) parts.push(`last sold ${ago}`);
  else if (facts.state === "before") parts.push("no sales recorded");
  if (facts.raised > 0) parts.push(`${facts.raised} pending`);

  return parts.join(" · ");
}
