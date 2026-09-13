import { useEffect, useRef } from "react";
import { BarcodeInput } from "./BarcodeInput";
import { Modal } from "./Modal";
import { defaultSellPrice } from "./OrderModal";
import type { RecordEntry } from "../data/types";
import { money } from "../lib/money";
import { existingOpenLine } from "../lib/orderLines";
import { orderLineState } from "../lib/orderLines";
import { daysAgo } from "../lib/totals";
import { useApp } from "../store/AppStore";

// The bulk entry sheet (M-02 d25, d28-d30) — a second MODE of track 2, not a
// panel bolted into track 3. The right track never stops meaning the same
// thing: the standing state of whatever is in the middle, and the one action
// to take on it. Here the middle is the sheet you are filling and the right is
// that batch's standing.
//
// Two destinations, chosen at the HEAD (d28). The routes need different fields
// — placed needs a PO reference and a placed-on date, pending needs a
// separator and must have neither — so a foot-level "add to pending" would
// silently discard a reference already typed, which is how an order somebody
// believes is placed ends up sitting in the pending pile instead.

export type BulkDest = "pending" | "placed";

export interface BulkLine {
  recordId: string;
  qty: number;
  sellPrice: number;
}

export interface BulkDraft {
  supplierId: string;
  dest: BulkDest;
  poNumber: string;
  separator: string;
  placedOn: string;
  followUpDays: number;
  lines: BulkLine[];
}

export const blankDraft = (supplierId: string): BulkDraft => ({
  supplierId,
  dest: "placed",
  poNumber: "",
  separator: "",
  placedOn: new Date().toLocaleDateString("en-CA"),
  followUpDays: 14,
  lines: [],
});

export function BulkOrderSheet({
  draft,
  onChange,
  onLeave,
  onDiscard,
  poError,
  discarding,
  onDiscardAsk,
  onDiscardCancel,
}: {
  draft: BulkDraft;
  onChange: (patch: Partial<BulkDraft>) => void;
  onLeave: () => void;
  onDiscard: () => void;
  poError: string;
  discarding: boolean;
  onDiscardAsk: () => void;
  onDiscardCancel: () => void;
}) {
  const app = useApp();
  const scanRef = useRef<HTMLInputElement>(null);
  const placed = draft.dest === "placed";
  const supplier = app.supplierFor(draft.supplierId);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const addByCode = (code: string) => {
    const c = code.trim();
    if (!c) return;
    const rec =
      app.records.find((r) => r.manufacturerUpc === c) ||
      app.records.find((r) => r.catalogNo.toLowerCase() === c.toLowerCase());
    if (!rec) return; // the caller surfaces the miss; a line must point at a Record
    const at = draft.lines.findIndex((l) => l.recordId === rec.id);
    if (at >= 0) {
      const next = [...draft.lines];
      next[at] = { ...next[at], qty: next[at].qty + 1 };
      onChange({ lines: next });
    } else {
      onChange({
        lines: [...draft.lines, { recordId: rec.id, qty: 1, sellPrice: defaultSellPrice(rec, app.inventory) }],
      });
    }
  };

  return (
    <section className="wo-main">
      <div className="wo-main-head entry">
        <div style={{ minWidth: 0 }}>
          <h2>Record an order placed elsewhere</h2>
          <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
            {placed ? (
              <>
                <span className="badge accent">Recorded as placed (d25)</span>
                <span className="badge ink">Manager only</span>
              </>
            ) : (
              <>
                <span className="badge">Raised as pending — plain Phase 1 (d1)</span>
                <span className="badge ok">Employee or Manager</span>
              </>
            )}
          </div>
        </div>
        {/* d30 — two jobs, two controls. Cancel read as destructive and behaved
            as back, and the failure was silent in both directions. */}
        <div className="wo-head-acts">
          <button className="btn sm" onClick={onLeave}>
            ← Leave open
          </button>
          <button className="btn sm danger" onClick={onDiscardAsk}>
            Discard batch
          </button>
        </div>
      </div>

      <div className="wo-entry-scroll">
        <div className="cust-group">
          <div className="cust-group-head">
            <span className="lab">Where these lines go</span>
            <span className="xsmall muted">
              Chosen here, not at the foot — so no field on screen is about to be discarded (d28)
            </span>
          </div>
          <div className="wo-dest">
            <button
              type="button"
              className="wo-dest-opt"
              aria-pressed={!placed}
              onClick={() => onChange({ dest: "pending" })}
            >
              <span className="dt">Raise as pending</span>
              <span className="dm">
                Joins this supplier's pending pile to be processed and sent the normal way. Plain
                Phase 1 (d1).
              </span>
            </button>
            <button
              type="button"
              className="wo-dest-opt"
              aria-pressed={placed}
              onClick={() => onChange({ dest: "placed" })}
            >
              <span className="dt">Already placed elsewhere</span>
              <span className="dm">
                The order went out on their website or over the phone. Born placed, carrying their
                reference (d25).
              </span>
            </button>
          </div>
          <div className="xsmall muted">
            {placed
              ? "Nothing is sent: no email, no printable document (d6). The order already went out."
              : "These join the pending pile. Nothing is sent yet either — a Manager processes the stream and sends it (step 6)."}
          </div>
        </div>

        <div className="cust-group">
          <div className="cust-group-head">
            <span className="lab">The order</span>
            <span className="xsmall muted">Set once, stamped on every line below</span>
          </div>
          <div className="cust-grid">
            <label className="field">
              <span>Supplier</span>
              <select
                value={draft.supplierId}
                onChange={(e) => onChange({ supplierId: e.target.value })}
              >
                {app.suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.shortName})
                  </option>
                ))}
              </select>
              <span className="hint">
                Order via <strong>{supplier?.orderVia}</strong> · discount {supplier?.discountPct}%
                {supplier?.orderVia === "Their Website" && " — the case this sheet exists for."}
              </span>
            </label>

            {placed ? (
              <>
                <label className={"field" + (poError ? " bad" : "")}>
                  <span>Their PO / order reference</span>
                  <input
                    type="text"
                    className="mono"
                    value={draft.poNumber}
                    placeholder="IDS-88214"
                    onChange={(e) => onChange({ poNumber: e.target.value })}
                  />
                  <span className="hint">
                    Free-text, need not be numeric (d16). Leave blank to mint our next one —
                    auto-numbering skips whatever you type here.
                  </span>
                  {poError && <span className="err">{poError}</span>}
                </label>

                <label className="field">
                  <span>Placed on</span>
                  <input
                    type="date"
                    value={draft.placedOn}
                    onChange={(e) => onChange({ placedOn: e.target.value })}
                  />
                  <span className="hint">
                    The date it actually went out, not today (d26). The follow-up window, the age
                    column and the overdue grouping all read from it — so a line can be overdue the
                    moment it is entered.
                  </span>
                </label>
              </>
            ) : (
              <label className="field">
                <span>Ordering separator</span>
                <input
                  type="text"
                  className="mono"
                  maxLength={1}
                  value={draft.separator}
                  placeholder="blank"
                  onChange={(e) => onChange({ separator: e.target.value.toUpperCase() })}
                />
                <span className="hint">
                  One optional letter, splitting this supplier's pending lines into independently
                  sendable streams (d3). Blank joins the regular pile.
                </span>
              </label>
            )}

            <label className="field">
              <span>Follow-up flag — days</span>
              <input
                className="inline-num"
                type="number"
                min={0}
                value={draft.followUpDays}
                onChange={(e) =>
                  onChange({ followUpDays: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <span className="hint">
                Every line carries one (d8). Counted from {placed ? "Placed on" : "when it is raised"},
                not from now.
              </span>
            </label>
          </div>

          <div className="wo-caveat">
            {placed ? (
              <>
                <strong>No ordering separator.</strong> A separator splits a supplier's{" "}
                <em>pending</em> lines into independently sendable streams (d3). These lines were
                never in a stream — they are born placed — so the field would have no job.
              </>
            ) : (
              <>
                <strong>No PO reference and no placed-on date.</strong> Neither exists yet: a
                pending line has not been sent anywhere (d1), so the PO number is assigned when the
                stream is Processed (step 7). <strong>The separator is offered instead</strong> —
                this batch is exactly the kind of stream d3 exists to keep apart.
              </>
            )}
          </div>
        </div>

        <div className="cust-group">
          <div className="cust-group-head">
            <span className="lab">Add the lines</span>
            <span className="xsmall muted">Scan, or type a catalog number</span>
          </div>
          <BarcodeInput
            onScan={addByCode}
            placeholder="scan a barcode, or type a catalog number…"
            samples={app.records
              .filter((r) => r.manufacturerUpc)
              .slice(0, 4)
              .map((r) => ({ code: r.manufacturerUpc!, label: `${r.artist} — ${r.title}` }))}
          />

          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Qty</th>
                <th>Item</th>
                <th>Cat no.</th>
                <th className="num">Sell price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((row, i) => {
                const rec = app.recordFor(row.recordId);
                // d29 — mark, never block.
                const dupe = existingOpenLine(
                  row.recordId,
                  draft.supplierId,
                  app.pendingOrders,
                  app.invoices,
                );
                return (
                  <tr key={row.recordId} className={dupe ? "has-dupe" : undefined}>
                    <td>
                      <input
                        className="inline-num"
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) => {
                          const next = [...draft.lines];
                          next[i] = { ...next[i], qty: Math.max(1, Number(e.target.value) || 1) };
                          onChange({ lines: next });
                        }}
                      />
                    </td>
                    <td>
                      <strong>{rec ? `${rec.artist} — ${rec.title}` : row.recordId}</strong>
                      {dupe && (
                        <span className="wo-dupe">
                          Already on order — <span className="mono">{dupe.poNumber}</span>,{" "}
                          {orderLineState(dupe, app.invoices).toLowerCase()},{" "}
                          {daysAgo(dupe.placedAt ?? dupe.createdAt)}d
                        </span>
                      )}
                    </td>
                    <td className="mono xsmall muted">{rec?.catalogNo}</td>
                    <td className="num mono">{money(row.sellPrice)}</td>
                    <td className="num">
                      <button
                        className="btn sm ghost danger"
                        title="Remove"
                        onClick={() => onChange({ lines: draft.lines.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {draft.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="small muted" style={{ padding: "var(--sp-4)" }}>
                    Nothing added yet. Scan a barcode, or type a catalog number and press Enter.
                    The cursor stays in the box — you should never have to reach for the mouse
                    between copies.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {discarding && (
        <Modal
          title="Discard this batch?"
          onClose={onDiscardCancel}
          foot={
            <>
              <button className="btn ghost" onClick={onDiscardCancel}>
                Keep it open
              </button>
              <button className="btn danger" onClick={onDiscard}>
                Discard
              </button>
            </>
          }
        >
          <div className="stack">
            <p>
              <strong>
                {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"} (
                {draft.lines.reduce((n, l) => n + l.qty, 0)} unit
                {draft.lines.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"})
              </strong>{" "}
              will be thrown away. This cannot be undone.
            </p>
            <p className="small muted">
              Leaving it open instead keeps every line and puts it back on the slab, where you can
              pick it up after you have served whoever just walked up (d30).
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Track 3 while the sheet is open: this batch's standing, and the one action. */
export function BulkOrderBatch({
  draft,
  poError,
  onCommit,
}: {
  draft: BulkDraft;
  poError: string;
  onCommit: () => void;
}) {
  const app = useApp();
  const supplier = app.supplierFor(draft.supplierId);
  const placed = draft.dest === "placed";
  const units = draft.lines.reduce((n, l) => n + l.qty, 0);
  const retail = draft.lines.reduce((n, l) => n + l.qty * l.sellPrice, 0);
  const cost = retail * (1 - (supplier?.discountPct ?? 0) / 100);
  const ref = draft.poNumber.trim();
  const ok = draft.lines.length > 0 && !(placed && poError);

  const dupes = draft.lines.filter((l) =>
    existingOpenLine(l.recordId, draft.supplierId, app.pendingOrders, app.invoices),
  );

  // Informational only — M-02 step 4 shows readiness on the PROCESSING screen,
  // and for a placed order it gates nothing at all: the order already went out.
  const minQty = supplier?.minOrderQty ?? 0;
  const minAmt = supplier?.minOrderAmount ?? 0;
  const minSay =
    minQty > 0
      ? `${units} / ${minQty} units`
      : minAmt > 0
        ? `${money(retail)} / ${minAmt.toFixed(2)} retail`
        : "no minimum set";

  return (
    <aside className="wo-track" aria-label="This batch">
      <div className={"wo-waiting" + (ok ? " live" : "")}>
        <div className="lab">
          <span>This batch</span>
          <span className="xsmall mono">
            {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="wo-w-name">{supplier?.name}</div>
        <div className="wo-w-sub">
          {placed
            ? `${ref ? `${ref} — their reference` : "No reference yet — ours will be minted"} · placed ${draft.placedOn}`
            : `Pending stream${draft.separator.trim() ? ` ${draft.separator.trim()}` : " — regular pile"} · no PO until it is processed`}
        </div>
      </div>

      <div className="wo-track-head">
        <div className="lab">Estimated cost</div>
        <div className={"wo-figure" + (ok ? "" : " nil")}>{money(cost)}</div>
        <div className="wo-figure-say">
          {units} unit{units === 1 ? "" : "s"} · {money(retail)} at retail
        </div>
        <div className="wo-figure-sub">
          Sell total less {supplier?.discountPct ?? 0}% (step 4), in CAD — it is derived from{" "}
          <em>our</em> retail. Goods only: freight, tax and misc arrive at Invoice level and are
          never allocated to items (E-02:100).
          {supplier && supplier.currency !== "CAD" && (
            <>
              {" "}
              <strong>
                {supplier.name} will invoice in {supplier.currency}
              </strong>{" "}
              — no rate is applied here (M-01 d14, M-06 d7).
            </>
          )}
        </div>
      </div>
      <div className="wo-rule" />

      <div className="wo-track-mid">
        {dupes.length > 0 && (
          <div className="wo-sec">
            <span className="lab">Already on order</span>
            <div className="wo-caveat warn">
              {dupes.length} of these {dupes.length === 1 ? "is" : "are"} already outstanding with{" "}
              {supplier?.name}. Marked, not blocked — reordering something late or short is
              ordinary, and only you know which this is (d29).
            </div>
          </div>
        )}

        <div className="wo-sec">
          <span className="lab">Against their minimum</span>
          <div className="cust-standing">
            <div className="stat span">
              <span className="v" style={{ fontSize: "var(--fs-sm)" }}>
                {minSay}
              </span>
              <span className="k">
                {minQty === 0 && minAmt === 0
                  ? "Nothing to meet"
                  : (minQty > 0 ? units >= minQty : retail >= minAmt)
                    ? "Met"
                    : "Below — informational only"}
              </span>
            </div>
          </div>
          <div className="wo-caveat">
            Readiness gates the <em>processing</em> screen (step 4).{" "}
            {placed
              ? "It gates nothing here: the order already went out."
              : "This batch will be measured against it there."}
            {minAmt > 0 && supplier && supplier.currency !== "CAD" && (
              <>
                {" "}
                <strong>Which currency the minimum is in is not recorded</strong> — M-01 gives it a
                basis but no currency, so the comparison is shown bare.
              </>
            )}
          </div>
        </div>

        <div className="wo-sec">
          <span className="lab">What this does</span>
          {placed ? (
            <>
              <Step n={1}>
                Writes {draft.lines.length || "n"} line
                {draft.lines.length === 1 ? "" : "s"} already carrying{" "}
                <span className="mono">{ref || "our next PO"}</span> — born placed, never pending
                (d25).
              </Step>
              <Step n={2}>
                Stamps <span className="mono">{draft.placedOn}</span> as the placed date, so the
                follow-up window and the age sort are right from the first render (d26).
              </Step>
              <Step n={3}>
                Writes the reason into each line's log and the supplier's, so the history says where
                it came from (d23).
              </Step>
              <Step n={4}>
                <strong>Sends nothing.</strong> No email, no printable document (d6).
              </Step>
            </>
          ) : (
            <>
              <Step n={1}>
                Raises {draft.lines.length || "n"} <strong>pending</strong> line
                {draft.lines.length === 1 ? "" : "s"} against {supplier?.name}
                {draft.separator.trim() ? `, separator ${draft.separator.trim()}` : ""} — plain
                Phase 1 (d1, d28).
              </Step>
              <Step n={2}>
                They join the pending pile and appear on <strong>Order Processing</strong> as one
                stream, grouped by supplier + separator (d4).
              </Step>
              <Step n={3}>
                <strong>No PO number and no placed date yet</strong> — both are assigned when a
                Manager Processes the stream (step 7).
              </Step>
              <Step n={4}>
                <strong>Nothing reaches the supplier.</strong> Processing the stream is what sends
                it (step 6).
              </Step>
            </>
          )}
          {/* d27 is recorded but cannot be honoured here: the prototype models
              no catalog prefetch at all. Said out loud rather than faked. */}
          <div className="wo-caveat">
            d27's catalog metadata prefetch is <strong>not modelled in this prototype</strong> —
            there is no prefetch job to queue. See docs/prototype.md.
          </div>
        </div>
      </div>

      <div className="wo-track-foot">
        <button className="btn accent cust-primary" onClick={onCommit} disabled={!ok}>
          {placed ? (
            <>
              Place {draft.lines.length || ""} line{draft.lines.length === 1 ? "" : "s"}
              <br />
              on {ref || "our next PO"}
            </>
          ) : (
            <>
              Add {draft.lines.length || ""} line{draft.lines.length === 1 ? "" : "s"}
              <br />
              to the pending pile
            </>
          )}
        </button>
        <div className="cust-foot-sub">
          {placed && poError
            ? poError
            : !ok
              ? "Add at least one line."
              : placed
                ? "They go straight onto this screen as ordered."
                : "They go to Order Processing, not to this screen — nothing is on order until the stream is sent."}
        </div>
      </div>
    </aside>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="wo-logline">
      <span className="at mono">{n}</span>
      <span>{children}</span>
    </div>
  );
}

export type { RecordEntry };
