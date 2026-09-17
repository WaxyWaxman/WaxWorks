import { useState } from "react";
import { ORDER_LINE_STATUSES } from "../data/types";
import type { OrderLineStatus, PendingOrderLine, Supplier } from "../data/types";
import { money } from "../lib/money";
import { orderLineState, outstandingQty, receivedAgainst } from "../lib/orderLines";
import { daysAgo, followUpDueAt, isFollowUpOverdue } from "../lib/totals";
import { useApp } from "../store/AppStore";
import type { PoRow } from "./OrderSlab";

// Track 3 of What's on Order: the line you picked, and the one thing to do
// with it. Head and foot are fixed and only the middle scrolls, so the primary
// action sits in the same place on a quiet line and on one with nine log
// entries — the same reason Finish sale has its own floor (E-05 d29).
//
// Both of Phase 3's modals live here now. Set status and Re-flag do exactly
// what d12, d22, d8 and d18 already say, in a place that does not cover the
// table — and the line's own log (d23) stops being reachable only by opening
// the thing that changes it.

const DAY = 86400000;

export function OrderLineTrack({
  line,
  supplier,
  onStatus,
}: {
  line: PendingOrderLine;
  supplier?: Supplier;
  onStatus: (msg: string) => void;
}) {
  const app = useApp();
  const record = app.recordFor(line.recordId);
  const customer = app.customerFor(line.customerId);
  const state = orderLineState(line, app.invoices);
  const out = outstandingQty(line, app.invoices);
  const received = receivedAgainst(line.id, app.invoices);
  const late = isFollowUpOverdue(line);
  const due = followUpDueAt(line);
  const overdueDays = due == null ? 0 : Math.floor((Date.now() - due) / DAY);

  const [editing, setEditing] = useState<"status" | "reflag" | null>(null);

  const title = record ? `${record.artist} — ${record.title}` : line.recordId;

  // The foot is a ladder, the way E-07 d20's is. Overdue means the errand is
  // chasing, and d18 makes that a fresh today+n window rather than an
  // extension of a deadline already in the past.
  const primary: "reflag" | "status" = late ? "reflag" : "status";

  return (
    <aside className="wo-track" aria-label="The selected line">
      {/* Who is waiting outranks the age, for the reason Waiting outranks the
          balance on the Customer card (E-07 d19, E-05 d7): a late line nobody
          is waiting on is a supplier problem, a late line with a name on it is
          a phone call somebody is owed. */}
      <div className={"wo-waiting" + (customer ? " live" : "")}>
        <div className="lab">Waiting on this</div>
        {customer ? (
          <>
            <div className="wo-w-name">{customer.name}</div>
            <div className="wo-w-sub">
              {late
                ? "Past the flag — d8's window is for warning them as much as for chasing the supplier."
                : "Their card reads this line's status too (E-07 d19)."}
            </div>
          </>
        ) : (
          <>
            <div className="wo-w-name none">Nobody — floor stock</div>
            <div className="wo-w-sub">
              No customer attached, so no Held Sale is created on receipt (d13).
            </div>
          </>
        )}
      </div>

      <div className="wo-track-head">
        <div className="lab">{late ? "Overdue" : "Age"}</div>
        {late ? (
          <>
            <div className="wo-figure late">{overdueDays}</div>
            <div className="wo-figure-say">days past the flag</div>
            <div className="wo-figure-sub">
              Flagged for {line.followUpDays}d. Nothing chases it but you.
            </div>
          </>
        ) : (
          <>
            <div className="wo-figure">{daysAgo(line.placedAt ?? line.createdAt)}</div>
            <div className="wo-figure-say">days on order</div>
            <div className="wo-figure-sub">
              {due == null
                ? "No follow-up flag set."
                : `Chase again in ${Math.ceil((due - Date.now()) / DAY)} days.`}
            </div>
          </>
        )}
      </div>
      <div className="wo-rule" />

      <div className="wo-track-mid">
        <div className="wo-sec">
          <span className="lab">The line</span>
          <div className="wo-title">{title}</div>
          <div className="xsmall muted mono">
            {record?.catalogNo ?? "—"}
            {record?.manufacturerUpc ? ` · ${record.manufacturerUpc}` : " · no barcode"}
          </div>
          <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 4 }}>
            <span className={"badge " + toneOf(state)}>{state}</span>
            {line.recordedAt && <span className="badge accent">their reference</span>}
            {line.expectedDate && <span className="badge mono">due {line.expectedDate}</span>}
          </div>
        </div>

        <div className="wo-sec">
          <span className="lab">Standing</span>
          <div className="cust-standing">
            <div className="stat">
              <span className="v">{line.qty}</span>
              <span className="k">Ordered</span>
            </div>
            <div className="stat">
              <span className={"v" + (received ? " part" : "")}>{received}</span>
              <span className="k">Received</span>
            </div>
            <div className="stat">
              <span className="v">{out}</span>
              <span className="k">Outstanding</span>
            </div>
            <div className="stat">
              <span className="v">{money(line.sellPrice)}</span>
              <span className="k">Sell price</span>
            </div>
            <div className="stat span">
              <span className="v mono">{line.poNumber}</span>
              <span className="k">
                {supplier?.name ?? "—"} · {supplier?.orderVia ?? "—"}
              </span>
            </div>
          </div>
          {received > 0 && (
            <div className="wo-caveat">
              Outstanding is counted off the Invoice lines pointing back here, across every Invoice
              (E-02 d30) — not stored on the line.
            </div>
          )}
          {supplier && supplier.currency !== "CAD" && (
            <div className="wo-caveat">
              Sell price is ours, in CAD. {supplier.name} invoices in {supplier.currency};
              converting needs M-06's rate and is not invented here (M-01 d14).
            </div>
          )}
        </div>

        {editing === "status" && (
          <SetStatusPanel
            line={line}
            onClose={() => setEditing(null)}
            onDone={(msg) => {
              setEditing(null);
              onStatus(msg);
            }}
          />
        )}

        {editing === "reflag" && (
          <ReflagPanel
            line={line}
            onClose={() => setEditing(null)}
            onDone={(msg) => {
              setEditing(null);
              onStatus(msg);
            }}
          />
        )}

        {/* d23 — on the floor of the scroll, the same place History sits on the
            Customer card (E-07 d16) and the Log on the Supplier card. Receipt
            writes here too, so a part-received line reads as one sequence,
            which is the only way "2 of 5" ever explains itself. */}
        <div className="wo-sec">
          <span className="lab">History</span>
          {(line.log?.length ?? 0) === 0 ? (
            <div className="wo-sec-empty">Nothing has happened to this line yet.</div>
          ) : (
            [...(line.log ?? [])].reverse().map((e, i) => (
              <div className="wo-logline" key={i}>
                <span className="at mono">{e.at.slice(5, 16)}</span>
                <span>{e.text}</span>
              </div>
            ))
          )}
          <span className="xsmall muted">Every status change and every receipt, one sequence (d23).</span>
        </div>
      </div>

      <div className="wo-track-foot">
        <button
          className="btn accent cust-primary"
          onClick={() => setEditing(primary)}
          disabled={editing === primary}
        >
          {primary === "reflag" ? "Re-flag — chase again" : "Set status"}
        </button>
        <div className="cust-foot-sub">
          {primary === "reflag"
            ? "A fresh today + n window, not an extension of a deadline already past (d18)."
            : "Shipped carries their expected date. Nothing verifies it — a date that passes is a prompt to chase (d22)."}
        </div>
        <button
          className="btn cust-secondary"
          onClick={() => setEditing(primary === "reflag" ? "status" : "reflag")}
          disabled={editing === (primary === "reflag" ? "status" : "reflag")}
        >
          {primary === "reflag" ? "Set status" : "Re-flag"}
        </button>
      </div>
    </aside>
  );
}

/**
 * Track 3 with no line picked: what the current scope amounts to, and the
 * actions that belong to a whole PurchaseOrder rather than to one line — both
 * of them recorded in M-02's "Cancelling and unwinding" table, and neither of
 * which had anywhere to live on the old screen.
 */
export function OrderScopeTrack({
  scope,
  po,
  rows,
  waiting,
  onNewBatch,
  onBulkStatus,
  onVoid,
}: {
  scope: string;
  po?: PoRow;
  rows: PendingOrderLine[];
  waiting: { line: PendingOrderLine; name: string; late: boolean; title: string }[];
  onNewBatch: () => void;
  onBulkStatus: () => void;
  onVoid: () => void;
}) {
  const app = useApp();
  const late = rows.filter(isFollowUpOverdue);
  const units = rows.reduce((n, l) => n + outstandingQty(l, app.invoices), 0);
  const retail = rows.reduce((n, l) => n + outstandingQty(l, app.invoices) * l.sellPrice, 0);
  const oldest = rows.reduce((n, l) => Math.max(n, daysAgo(l.placedAt ?? l.createdAt)), 0);
  const isAll = scope === "all";

  return (
    <aside className="wo-track" aria-label="What this scope amounts to">
      <div className={"wo-waiting" + (waiting.length ? " live" : "")}>
        <div className="lab">
          <span>People waiting</span>
          <span className="xsmall mono">{waiting.length}</span>
        </div>
        {waiting.length === 0 ? (
          <div className="wo-w-name none">Nobody</div>
        ) : (
          <>
            {waiting.slice(0, 3).map((w) => (
              <div className="wo-w-row" key={w.line.id}>
                <strong>{w.name}</strong>{" "}
                <span className="xsmall muted">
                  — {w.title}
                  {w.late ? ", overdue" : ""}
                </span>
              </div>
            ))}
            {waiting.length > 3 && (
              <div className="wo-w-sub">+{waiting.length - 3} more</div>
            )}
          </>
        )}
      </div>

      <div className="wo-track-head">
        <div className="lab">{late.length ? "Overdue lines" : "Lines on order"}</div>
        <div className={"wo-figure" + (late.length ? " late" : "")}>
          {late.length || rows.length}
        </div>
        <div className="wo-figure-say">
          {late.length ? "past their follow-up flag" : "still expected"}
        </div>
        <div className="wo-figure-sub">
          {late.length
            ? `of ${rows.length} line${rows.length === 1 ? "" : "s"} · ${units} units outstanding`
            : `${units} units · ${money(retail)} at retail`}
        </div>
      </div>
      <div className="wo-rule" />

      <div className="wo-track-mid">
        <div className="wo-sec">
          <span className="lab">{isAll ? "Across every open PO" : "This order"}</span>
          <div className="cust-standing">
            <div className="stat">
              <span className="v">{rows.length}</span>
              <span className="k">Lines</span>
            </div>
            <div className="stat">
              <span className="v">{units}</span>
              <span className="k">Units</span>
            </div>
            <div className="stat">
              <span className="v">{money(retail)}</span>
              <span className="k">Retail</span>
            </div>
            <div className="stat">
              <span className="v">{oldest}d</span>
              <span className="k">Oldest</span>
            </div>
            {po && (
              <div className="stat span">
                <span className="v mono">{po.poNumber}</span>
                <span className="k">
                  {po.supplier?.name ?? "—"} · {po.supplier?.orderVia ?? "—"}
                  {po.external ? " · their reference" : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="wo-sec">
          <span className="lab">Pick a line</span>
          <div className="wo-sec-empty">
            Select a line to set its status, re-flag it, or read its history.
          </div>
        </div>
      </div>

      <div className="wo-track-foot">
        {isAll ? (
          <>
            <button className="btn accent cust-primary" onClick={onNewBatch}>
              ＋ Record an order
              <br />
              placed elsewhere
            </button>
            <div className="cust-foot-sub">
              For orders that went out on a supplier's website or over the phone (d25).
            </div>
          </>
        ) : (
          <>
            <button className="btn accent cust-primary" onClick={onBulkStatus}>
              Bulk status update
            </button>
            <div className="cust-foot-sub">
              Sets every unreceived line on {scope} to Cancelled or Backordered at once.
            </div>
            <button className="btn cust-secondary danger" onClick={onVoid}>
              Void {scope}
            </button>
            <div className="cust-foot-sub">
              Unreceived lines return to pending; a part-received line keeps what arrived and its
              remainder returns as a new pending line (d11, d24). Tells the supplier nothing (d10).
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// d12 and d22 — the statuses a person SETS. Pending and Ordered are not
// offered because they are derived from whether the line has a PO number, and
// Received is not offered because it is counted: a status contradicting the
// count would just be a second, wrong answer.
function SetStatusPanel({
  line,
  onClose,
  onDone,
}: {
  line: PendingOrderLine;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const app = useApp();
  const record = app.recordFor(line.recordId);
  const title = record ? `${record.artist} — ${record.title}` : line.recordId;
  const [status, setStatus] = useState<OrderLineStatus | "">(line.status ?? "");
  const [expected, setExpected] = useState(line.expectedDate ?? "");

  const apply = () => {
    const next = status === "" ? undefined : status;
    app.setPendingOrderLineStatus(
      line.id,
      next,
      next === "Shipped" ? expected.trim() || undefined : undefined,
    );
    onDone(
      next
        ? `${title} marked ${next.toLowerCase()}${next === "Shipped" && expected.trim() ? `, due ${expected.trim()}` : ""}.`
        : `${title} — status cleared.`,
    );
  };

  return (
    <div className="wo-editor">
      <div className="lab">Set status</div>
      <label className="field">
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as OrderLineStatus | "")}>
          <option value="">None — ordered, nothing reported</option>
          {ORDER_LINE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </label>

      {status === "Shipped" && (
        <label className="field">
          <span>Expected date — the supplier's, as given</span>
          <input
            type="text"
            value={expected}
            placeholder="DD/MM/YYYY"
            onChange={(e) => setExpected(e.target.value)}
          />
        </label>
      )}

      {status === "Cancelled" && (
        <div className="callout small">
          This does not cancel anything with the supplier — someone still has to contact them (d10).
          The line stays on file with its history; it is never deleted once placed (d21).
        </div>
      )}

      <div className="btn-row">
        <button className="btn ghost sm" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary sm" onClick={apply}>
          Save status
        </button>
      </div>
    </div>
  );
}

function ReflagPanel({
  line,
  onClose,
  onDone,
}: {
  line: PendingOrderLine;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const app = useApp();
  const record = app.recordFor(line.recordId);
  const title = record ? `${record.artist} — ${record.title}` : line.recordId;
  const [days, setDays] = useState(line.followUpDays ?? 7);

  const commit = () => {
    app.reflagPendingOrderLine(line.id, Math.max(0, days));
    onDone(`${title} re-flagged — chasing again in ${days} day${days === 1 ? "" : "s"} from today.`);
  };

  return (
    <div className="wo-editor">
      <div className="lab">Re-flag</div>
      <p className="small muted" style={{ margin: 0 }}>
        Sets a fresh due date of today + <em>n</em> days, replacing whatever was there (d18) — used
        both to chase the supplier and to warn a waiting customer.
      </p>
      {line.customerId && (
        <div className="callout small">
          {app.customerFor(line.customerId)?.name ?? "A customer"} is waiting on this line.
        </div>
      )}
      <label className="field">
        <span>Chase again in (days)</span>
        <input
          className="inline-num"
          type="number"
          min={0}
          value={days}
          onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))}
        />
      </label>
      <div className="btn-row">
        <button className="btn ghost sm" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary sm" onClick={commit}>
          Re-flag
        </button>
      </div>
    </div>
  );
}

function toneOf(state: string): string {
  if (state === "Backordered" || state === "Part received") return "warn";
  if (state === "Cancelled") return "danger";
  if (state === "Shipped") return "ok";
  return "";
}
