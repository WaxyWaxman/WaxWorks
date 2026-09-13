import type { PendingOrderLine } from "../data/types";
import { money } from "../lib/money";
import { receivedAgainst } from "../lib/orderLines";
import { daysAgo } from "../lib/totals";
import { useApp } from "../store/AppStore";
import { TitlecardPanel } from "./TitlecardPanel";
import type { PlacedRow, StreamRow } from "./StreamSlab";

// Track 3 of Order Processing. Five faces, one per thing the middle track can
// be showing, and the same contract the other screens' third tracks keep: the
// standing state of whatever is in the middle, and the one verb that acts on
// it, on the floor.
//
// Who is waiting sits above the figure for the reason it does on On Order and
// on the Customer card: a stream with names on it is people expecting a phone
// call, and step 4's customer-attached count is the only column that knows.

export interface WaitingPerson {
  id: string;
  name: string;
  title: string;
  note?: string;
}

function Waiting({ people, label }: { people: WaitingPerson[]; label: string }) {
  return (
    <div className={"op-waiting" + (people.length ? " live" : "")}>
      <div className="lab">
        <span>{label}</span>
        <span className="xsmall mono">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <div className="op-w-name">Nobody</div>
      ) : (
        <>
          {people.slice(0, 3).map((p) => (
            <div className="op-w-row" key={p.id}>
              <strong>{p.name}</strong>{" "}
              <span className="xsmall muted">
                — {p.title}
                {p.note ? `, ${p.note}` : ""}
              </span>
            </div>
          ))}
          {people.length > 3 && <div className="op-w-sub">+{people.length - 3} more</div>}
        </>
      )}
    </div>
  );
}

/**
 * How this Supplier's minimum is expressed, and how far off it we are.
 * "An order is 'ready to place' once it hits minOrderQty. If that's 0,
 * readiness falls back to minOrderAmount instead" — the same wording the
 * Suppliers screen uses.
 */
export function minimumFacts(s: StreamRow) {
  const { supplier } = s;
  if (supplier.minOrderQty > 0) {
    return {
      kind: "qty" as const,
      requires: `${supplier.minOrderQty} units`,
      figure: String(s.unitCount),
      say: `${supplier.name} requires ${supplier.minOrderQty} units`,
      pct: Math.min(1, s.unitCount / supplier.minOrderQty),
      mark: `min ${supplier.minOrderQty}`,
    };
  }
  if (supplier.minOrderAmount > 0) {
    const basis = supplier.minOrderAmountBasis === "Net" ? s.estCost : s.sellTotal;
    return {
      kind: "amount" as const,
      requires: `${money(supplier.minOrderAmount)} (${supplier.minOrderAmountBasis.toLowerCase()})`,
      figure: money(basis),
      say: `${supplier.name} requires ${money(supplier.minOrderAmount)} ${supplier.minOrderAmountBasis.toLowerCase()}`,
      pct: Math.min(1, basis / supplier.minOrderAmount),
      mark: `min ${money(supplier.minOrderAmount)}`,
    };
  }
  return {
    kind: "none" as const,
    requires: "none configured",
    figure: String(s.unitCount),
    say: `${supplier.name} sets no minimum`,
    pct: 1,
    mark: "no minimum",
  };
}

// ---- Face A: the whole pending pile ----
export function PileTrack({
  streams,
  waiting,
}: {
  streams: StreamRow[];
  waiting: WaitingPerson[];
}) {
  const ready = streams.filter((s) => s.ready).length;
  const lines = streams.reduce((n, s) => n + s.lines.length, 0);
  const units = streams.reduce((n, s) => n + s.unitCount, 0);
  const sell = streams.reduce((n, s) => n + s.sellTotal, 0);
  const cost = streams.reduce((n, s) => n + s.estCost, 0);
  const oldest = streams.reduce((n, s) => Math.max(n, daysAgo(s.oldestAt)), 0);
  const stale = streams.filter((s) => !s.ready && daysAgo(s.oldestAt) >= 14);

  return (
    <aside className="op-track" aria-label="What the pending pile amounts to">
      <Waiting people={waiting} label="People waiting" />

      <div className="op-track-head">
        <div className="lab">Streams ready to send</div>
        <div className={"op-figure" + (ready ? " ready" : "")}>{ready}</div>
        <div className="op-figure-say">
          {ready ? "over their supplier's minimum" : "nothing is over its minimum yet"}
        </div>
        <div className="op-figure-sub">
          of {streams.length} stream{streams.length === 1 ? "" : "s"} · {lines} lines · {units} units
        </div>
      </div>
      <div className="op-rule" />

      <div className="op-track-mid">
        <div className="op-sec">
          <span className="lab">The pending pile</span>
          <div className="cust-standing">
            <div className="stat">
              <span className="v">{lines}</span>
              <span className="k">Lines</span>
            </div>
            <div className="stat">
              <span className="v">{units}</span>
              <span className="k">Units</span>
            </div>
            <div className="stat">
              <span className="v">{money(sell)}</span>
              <span className="k">Sell total</span>
            </div>
            <div className="stat">
              <span className="v">{money(cost)}</span>
              <span className="k">Est. cost</span>
            </div>
            <div className="stat">
              <span className="v">{oldest}d</span>
              <span className="k">Oldest line</span>
            </div>
            <div className="stat">
              <span className="v">{waiting.length}</span>
              <span className="k">Customer-attached</span>
            </div>
          </div>
        </div>

        <div className="op-sec">
          <span className="lab">Pick a stream</span>
          <div className="op-sec-empty">
            Processing is per stream — a supplier plus a separator (d3, d4). Choose one and this
            track becomes its dossier.
          </div>
        </div>

        {stale.length > 0 && (
          <div className="op-caveat">
            {stale.length} stream{stale.length === 1 ? " has" : "s have"} been waiting a fortnight or
            more and {stale.length === 1 ? "is" : "are"} still under the supplier's minimum. That is
            ordinary — nothing expires a stream or sends it short (d31) — but a customer attached to
            one of those lines is waiting with it.
          </div>
        )}
      </div>

      <div className="op-track-foot">
        <div className="cust-foot-sub">
          No primary action across the whole pile: an order goes to one supplier. The button appears
          when a stream is chosen.
        </div>
      </div>
    </aside>
  );
}

// ---- Face B: one pending stream ----
export function StreamDossier({
  stream,
  waiting,
  poNumber,
  onPoNumberChange,
  poTaken,
  nextPo,
  onProcess,
}: {
  stream: StreamRow;
  waiting: WaitingPerson[];
  poNumber: string;
  onPoNumberChange: (v: string) => void;
  poTaken: boolean;
  nextPo: string;
  onProcess: () => void;
}) {
  const m = minimumFacts(stream);
  const via = stream.supplier.orderVia;
  const cancelBy = stream.supplier.cancelByDays
    ? new Date(Date.now() + stream.supplier.cancelByDays * 86400000).toLocaleDateString("en-CA")
    : undefined;

  return (
    <aside className="op-track" aria-label="What this stream amounts to">
      <Waiting people={waiting} label="People waiting" />

      <div className="op-track-head">
        <div className="lab">{m.kind === "amount" ? "Value against the minimum" : "Units against the minimum"}</div>
        <div className={"op-figure" + (stream.ready ? " ready" : "")}>{m.figure}</div>
        <div className="op-figure-say">{m.say}</div>
        {m.kind !== "none" && (
          <div className="op-meter">
            <div className="bar">
              <div
                className={"fill" + (stream.ready ? " ready" : "")}
                style={{ width: `${Math.round(m.pct * 100)}%` }}
              />
            </div>
            <div className="mk">
              <span>0</span>
              <span>{m.mark}</span>
            </div>
          </div>
        )}
        <div className="op-figure-sub">
          {stream.ready ? "Over the minimum — sendable." : `Short: ${stream.shortBy}.`}
        </div>
      </div>
      <div className="op-rule" />

      <div className="op-track-mid">
        <div className="op-sec">
          <span className="lab">Meeting the minimum</span>
          <div>
            <div className="totals-row">
              <span>Supplier requires</span>
              <strong>{m.requires}</strong>
            </div>
            <div className="totals-row">
              <span>Qty (units)</span>
              <span className="num mono">
                {stream.unitCount}
                {stream.supplier.minOrderQty > 0 && (
                  <span className="muted"> / {stream.supplier.minOrderQty}</span>
                )}
              </span>
            </div>
            <div className="totals-row">
              <span>Retail value</span>
              <span className="num mono">{money(stream.sellTotal)}</span>
            </div>
            <div className="totals-row">
              <span>Cost (est., less {stream.supplier.discountPct}%)</span>
              <span className="num mono">{money(stream.estCost)}</span>
            </div>
          </div>
          {stream.ready ? (
            <div className="callout ok small">Ready to place.</div>
          ) : (
            <div className="callout small">
              Not yet ready — below the supplier's minimum. Nothing expires it and nothing sends it
              short (d31).
            </div>
          )}
        </div>

        <div className="op-sec">
          <span className="lab">This stream</span>
          <div className="cust-standing">
            <div className="stat">
              <span className="v">{stream.lines.length}</span>
              <span className="k">Lines</span>
            </div>
            <div className="stat">
              <span className="v">{stream.unitCount}</span>
              <span className="k">Units</span>
            </div>
            <div className="stat">
              <span className="v">{daysAgo(stream.oldestAt)}d</span>
              <span className="k">Oldest line</span>
            </div>
            <div className="stat">
              <span className="v">{stream.customerCount}</span>
              <span className="k">Customer-attached</span>
            </div>
            <div className="stat span">
              <span className="v" style={{ fontSize: "var(--fs-sm)" }}>
                {via}
                {via === "Email" && stream.supplier.email ? ` · ${stream.supplier.email}` : ""}
              </span>
              <span className="k">
                Order via
                {stream.supplier.accountNumber ? ` · account ${stream.supplier.accountNumber}` : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="op-sec">
          <span className="lab">What sending does</span>
          <div className="op-caveat">
            {via === "Email"
              ? "Composes and sends the order, stating items, quantities, cancel-by date and backorder policy (step 6)."
              : "Produces a printable order document and marks the stream placed. Nothing is sent — a person still has to act on it (step 6)."}
            {cancelBy ? ` Cancel by ${cancelBy} — ${stream.supplier.cancelByDays} days, this supplier's default.` : " No cancel-by default configured."}
            {` Backorders ${stream.supplier.backordersAllowed ? "allowed" : "not allowed"}.`}
          </div>
          <div className="op-caveat">
            On placement the lines become on order and the catalog prefetch is queued for those
            titles (step 8). They leave this screen for What's on Order.
          </div>
        </div>
      </div>

      <div className="op-track-foot">
        <label className="field">
          <span>PO number — blank takes the next unused ascending number ({nextPo})</span>
          <input
            type="text"
            className="mono"
            value={poNumber}
            placeholder={nextPo}
            onChange={(e) => onPoNumberChange(e.target.value)}
          />
        </label>
        {poTaken && (
          <div className="callout danger small">PO number already in use — pick another.</div>
        )}
        <button className="btn accent cust-primary" disabled={poTaken} onClick={onProcess}>
          {via === "Email" ? "Process — send order" : "Process — mark placed"}
        </button>
        <div className="cust-foot-sub">
          Auto-numbering is ascending from 0 and skips anything already in use, including a number
          typed by hand (d16). A manual number is free text and need not be numeric.
        </div>
      </div>
    </aside>
  );
}

// ---- Face C: a line is highlighted — its titlecard (step 5) ----
export function LineTrack({
  line,
  stream,
  showCost,
  onToggleShowCost,
  onBack,
}: {
  line: PendingOrderLine;
  stream: StreamRow;
  showCost: boolean;
  onToggleShowCost: () => void;
  onBack: () => void;
}) {
  const app = useApp();
  const rec = app.recordFor(line.recordId);
  const cust = app.customerFor(line.customerId);
  const siblings = stream.lines.filter((l) => l.recordId === line.recordId && l.id !== line.id);

  return (
    <aside className="op-track" aria-label="The highlighted line">
      <Waiting
        label="Waiting on this line"
        people={
          cust
            ? [
                {
                  id: line.id,
                  name: cust.name,
                  title: `asked ${daysAgo(line.createdAt)} days ago`,
                },
              ]
            : []
        }
      />

      <div className="op-track-head">
        <div className="lab">
          Titlecard <span className="mono">E-04</span>
        </div>
        <div className="op-title">{rec ? `${rec.artist} — ${rec.title}` : line.recordId}</div>
        <div className="op-figure-sub">{rec?.catalogNo}</div>
      </div>
      <div className="op-rule" />

      <div className="op-track-mid">
        <div className="op-sec">
          <span className="lab">On this line</span>
          <div>
            <div className="totals-row">
              <span>Supplier</span>
              <strong>{stream.supplier.name}</strong>
            </div>
            <div className="totals-row">
              <span>Separator</span>
              <span>{stream.separator ?? "—"}</span>
            </div>
            <div className="totals-row">
              <span>Qty</span>
              <span className="num mono">{line.qty}</span>
            </div>
            <div className="totals-row">
              <span>Sell price</span>
              <span className="num mono">{money(line.sellPrice)}</span>
            </div>
            <div className="totals-row">
              <span>Raised</span>
              <span>
                {daysAgo(line.createdAt)}d ago{line.createdBy ? `, by ${line.createdBy}` : ""}
              </span>
            </div>
          </div>
          <div className="op-caveat warn">
            The supplier is recorded on the <em>line</em>, not taken from the Record (d2). Checking
            it here, before the order goes out, is what step 5 exists for.
          </div>
          {siblings.length > 0 && (
            <div className="op-caveat warn">
              {siblings.length} other line{siblings.length === 1 ? "" : "s"} for this title{" "}
              {siblings.length === 1 ? "sits" : "sit"} in the same stream. Two separate commitments,
              not a mistake — nothing merges order lines (step 3). If the customer cancels, detach
              rather than delete (d32), or the copy you would have stocked anyway goes with them.
            </div>
          )}
        </div>

        <div className="op-sec">
          <span className="lab">The titlecard</span>
          <TitlecardPanel
            recordId={line.recordId}
            onStatus={() => {}}
            showCost={showCost}
            onToggleShowCost={onToggleShowCost}
          />
        </div>
      </div>

      <div className="op-track-foot">
        <button className="btn cust-secondary" onClick={onBack}>
          Back to the stream
        </button>
        <div className="cust-foot-sub">
          Sending is the stream's action, not this line's — clearing the highlight puts the Process
          button back.
        </div>
      </div>
    </aside>
  );
}

// ---- Face D: a placed PurchaseOrder ----
export function PlacedDossier({
  row,
  waiting,
  onVoid,
}: {
  row: PlacedRow;
  waiting: WaitingPerson[];
  onVoid: () => void;
}) {
  const app = useApp();
  const ordered = row.lines.reduce((n, l) => n + l.qty, 0);
  const received = row.lines.reduce((n, l) => n + receivedAgainst(l.id, app.invoices), 0);
  const sell = row.lines.reduce((n, l) => n + l.qty * l.sellPrice, 0);
  const outstanding = Math.max(0, ordered - received);

  return (
    <aside className="op-track" aria-label="What this purchase order amounts to">
      <Waiting people={waiting} label="People waiting" />

      <div className="op-track-head">
        <div className="lab">Still outstanding</div>
        <div className={"op-figure" + (outstanding === 0 ? " ready" : "")}>{outstanding}</div>
        <div className="op-figure-say">units of {ordered} ordered</div>
        <div className="op-figure-sub">
          {row.lines.length} line{row.lines.length === 1 ? "" : "s"} · placed {row.placedAt} ·{" "}
          {daysAgo(row.placedAt)} days ago
        </div>
      </div>
      <div className="op-rule" />

      <div className="op-track-mid">
        <div className="op-sec">
          <span className="lab">{row.poNumber}</span>
          <div className="cust-standing">
            <div className="stat">
              <span className="v">{row.lines.length}</span>
              <span className="k">Lines</span>
            </div>
            <div className="stat">
              <span className="v">{ordered}</span>
              <span className="k">Units ordered</span>
            </div>
            <div className="stat">
              <span className="v">{received}</span>
              <span className="k">Units received</span>
            </div>
            <div className="stat">
              <span className="v">{money(sell)}</span>
              <span className="k">Sell total</span>
            </div>
            <div className="stat span">
              <span className="v" style={{ fontSize: "var(--fs-sm)" }}>
                {row.supplier?.name ?? "—"} · {row.supplier?.orderVia ?? "—"}
              </span>
              <span className="k">
                Placed {row.placedAt}
                {row.external ? " · recorded, placed elsewhere" : ""}
              </span>
            </div>
          </div>
          <div className="op-caveat">
            Outstanding is counted, not stored — ordered minus received across every Invoice, and
            one Invoice may span several POs (d15, E-02 d28, d30).
          </div>
        </div>

        <div className="op-sec">
          <span className="lab">Chasing it</span>
          <div className="op-sec-empty">
            Statuses, follow-up flags and the line's log live on What's on Order (Phase 3). This
            screen's remaining business with a placed PO is voiding it.
          </div>
        </div>
      </div>

      <div className="op-track-foot">
        <button className="btn danger cust-primary" disabled={row.voided} onClick={onVoid}>
          {row.voided ? "Already voided" : `Void ${row.poNumber}`}
        </button>
        <div className="cust-foot-sub">
          Manager-only. Unreceived lines return to pending; a part-received line keeps what arrived
          and its remainder returns as a new pending line (d11, d24).{" "}
          <strong>Tells the supplier nothing</strong> (d10).
          {waiting.length > 0 &&
            ` ${waiting.length} line${waiting.length === 1 ? "" : "s"} here ${waiting.length === 1 ? "has" : "have"} a customer attached who will need telling.`}
        </div>
      </div>
    </aside>
  );
}

// ---- Face E: processing — the send controls ----
export function ProcessTrack({
  stream,
  poNumber,
  onPoNumberChange,
  poTaken,
  nextPo,
  onSend,
  onCancel,
}: {
  stream: StreamRow;
  poNumber: string;
  onPoNumberChange: (v: string) => void;
  poTaken: boolean;
  nextPo: string;
  onSend: () => void;
  onCancel: () => void;
}) {
  const via = stream.supplier.orderVia;
  const emailed = via === "Email";
  const cancelBy = stream.supplier.cancelByDays
    ? new Date(Date.now() + stream.supplier.cancelByDays * 86400000).toLocaleDateString("en-CA")
    : undefined;

  return (
    <aside className="op-track" aria-label="Confirm the send">
      <div className="op-waiting live">
        <div className="lab">
          <span>About to send</span>
          <span className="xsmall mono">{stream.lines.length}</span>
        </div>
        <div style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginTop: 2 }}>
          {stream.supplier.name}
        </div>
        <div className="op-w-sub">
          {stream.separator ? `separator ${stream.separator} · ` : ""}
          {stream.unitCount} units · {money(stream.estCost)} estimated cost
        </div>
      </div>

      <div className="op-track-head">
        <div className="lab">Sending via</div>
        <div className="op-figure sm">{via}</div>
        <div className="op-figure-say">
          {emailed ? "the system sends this one" : "the system prints it; a person sends it"}
        </div>
        <div className="op-figure-sub">
          Phone, fax, website and rep produce a printable document instead, and are marked placed by
          hand (step 6, d6).
        </div>
      </div>
      <div className="op-rule" />

      <div className="op-track-mid">
        <div className="op-sec">
          <label className="field">
            <span>PO number — blank takes the next unused ascending number</span>
            <input
              type="text"
              className="mono"
              value={poNumber}
              placeholder={nextPo}
              onChange={(e) => onPoNumberChange(e.target.value)}
            />
          </label>
          {poTaken && (
            <div className="callout danger small">PO number already in use — pick another.</div>
          )}
          <div className="op-caveat">
            Ascending from 0, skipping anything already in use (d16). Free text — a supplier's own
            reference is legal here.
          </div>
        </div>

        <div className="op-sec">
          <span className="lab">Confirm the send</span>
          <div>
            <div className="totals-row">
              <span>Lines</span>
              <span className="num mono">{stream.lines.length}</span>
            </div>
            <div className="totals-row">
              <span>Units</span>
              <span className="num mono">{stream.unitCount}</span>
            </div>
            <div className="totals-row">
              <span>Sell total</span>
              <span className="num mono">{money(stream.sellTotal)}</span>
            </div>
            <div className="totals-row">
              <span>Est. cost</span>
              <span className="num mono">{money(stream.estCost)}</span>
            </div>
            <div className="totals-row">
              <span>Cancel by</span>
              <span className="num">{cancelBy ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="op-caveat">
          On placement, catalog metadata prefetch is queued for these titles (step 8, d14) so the box
          arrives scannable.
        </div>
      </div>

      <div className="op-track-foot">
        <button className="btn accent cust-primary" disabled={poTaken} onClick={onSend}>
          {emailed ? `Send order to ${stream.supplier.shortName}` : "Mark placed"}
        </button>
        <button className="btn ghost cust-secondary" onClick={onCancel}>
          Cancel
        </button>
        <div className="cust-foot-sub">
          {emailed
            ? "Irreversible in the sense that matters: the email goes out. Voiding afterwards reverses our paperwork only, never the supplier's (d10)."
            : "Marking placed does not tell the supplier anything — the printed document still has to be sent by a person (step 6)."}
        </div>
      </div>
    </aside>
  );
}
