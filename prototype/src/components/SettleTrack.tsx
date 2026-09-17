import { useState } from "react";
import {
  PAYABLE_ENTRY_TYPES,
  PAYMENT_METHODS,
  type Clearing,
  type PayableEntryType,
  type PayableEntry,
  type PaymentBatch,
  type PaymentBatchVoid,
  type PaymentMethod,
  type Supplier,
} from "../data/types";
import {
  agedBuckets,
  autoPlacement,
  batchMoneyPaid,
  clearsToZero,
  creditOn,
  moneyOn,
  type LedgerRow,
  type SettlementPlan,
} from "../lib/payables";
import { money } from "../lib/money";
import { payableEntrySignedAmount, round2 } from "../lib/totals";

/**
 * Track 3. Three states, in strict priority: the entry being composed, else
 * the SELECTION, else the supplier's standing.
 *
 * "The selection" is the important one. Every action in M-05 acts on a set —
 * a settlement covers a mix (d16, d19), a clearing needs at least two (d15).
 * So the track reads the set back and names the one thing it is, instead of
 * leaving two greyed buttons and a `title` attribute to explain themselves.
 */
export function SettleTrack({
  supplier,
  isCards,
  giftTotal,
  net,
  rows,
  plan,
  creating,
  form,
  expectedMethod,
  onForm,
  onCancelCreate,
  onCreate,
  onSettle,
  onClear,
  onCancelSelection,
  onCreateNew,
  batches,
  voids,
  entries,
  clearings,
  duplicateRef,
  openBatch,
  onOpenBatch,
  onVoid,
  onUnclear,
}: {
  supplier?: Supplier;
  isCards: boolean;
  giftTotal: number;
  net: number;
  rows: LedgerRow[];
  plan: SettlementPlan;
  creating: boolean;
  /** M-05 d34 — what the ticked Invoices expected, or undefined if they disagree. */
  expectedMethod?: PaymentMethod;
  form: { method: PaymentMethod; reference: string; date: string; credit: Record<string, string>; money: Record<string, string> };
  onForm: (patch: Partial<{ method: PaymentMethod; reference: string; date: string; credit: Record<string, string>; money: Record<string, string> }>) => void;
  onCancelCreate: () => void;
  onCreate: (input: {
    type: PayableEntryType;
    reference: string;
    date: string;
    subtotal: number;
    tax: number;
    freight: number;
    misc: number;
    adjustmentDirection?: "increase" | "decrease";
  }) => void;
  onSettle: () => void;
  onClear: () => void;
  onCancelSelection: () => void;
  onCreateNew: () => void;
  batches: PaymentBatch[];
  voids: PaymentBatchVoid[];
  /** d38 — the overpayment remainders a batch emitted, for `batchMoneyPaid`. */
  entries: PayableEntry[];
  /** d41 — an earlier batch on this same reference, if there is one. */
  /** d46 — a clearing is an act with members, listed beside payment history. */
  clearings: Clearing[];
  duplicateRef?: { reference: string; date: string; voided: boolean };
  openBatch: string | null;
  onOpenBatch: (id: string) => void;
  onVoid: (id: string) => void;
  onUnclear: (clearingId: string) => void;
}) {
  if (creating && supplier) {
    return <CreateEntry supplier={supplier} onCancel={onCancelCreate} onCreate={onCreate} />;
  }
  if (plan.rows.length > 0 && supplier) {
    return (
      <Selection
        supplier={supplier}
        plan={plan}
        form={form}
        expectedMethod={expectedMethod}
        duplicateRef={duplicateRef}
        onForm={onForm}
        onSettle={onSettle}
        onClear={onClear}
        onCancel={onCancelSelection}
      />
    );
  }
  if (isCards) return <CardsStanding total={giftTotal} />;
  if (!supplier) return <aside className="ap-track" />;
  return (
    <Standing
      supplier={supplier}
      net={net}
      rows={rows}
      batches={batches}
      voids={voids}
      entries={entries}
      clearings={clearings}
      openBatch={openBatch}
      onOpenBatch={onOpenBatch}
      onVoid={onVoid}
      onUnclear={onUnclear}
      onCreateNew={onCreateNew}
    />
  );
}

/* ---------------------------------------------------------------- standing */

function Standing({
  supplier,
  net,
  rows,
  batches,
  voids,
  entries,
  clearings,
  openBatch,
  onOpenBatch,
  onVoid,
  onUnclear,
  onCreateNew,
}: {
  supplier: Supplier;
  net: number;
  rows: LedgerRow[];
  batches: PaymentBatch[];
  voids: PaymentBatchVoid[];
  entries: PayableEntry[];
  clearings: Clearing[];
  openBatch: string | null;
  onOpenBatch: (id: string) => void;
  onVoid: (id: string) => void;
  onUnclear: (clearingId: string) => void;
  onCreateNew: () => void;
}) {
  const credits = rows.filter((r) => r.role === "credit");
  const creditTotal = round2(credits.reduce((n, r) => n - r.balance, 0));
  const debits = rows.filter((r) => r.role === "debit" && r.balance > 0.005);
  const overdue = debits.filter((r) => r.overdueBy != null && r.overdueBy > 0);
  const lateSum = round2(overdue.reduce((n, r) => n + r.balance, 0));
  const worst = overdue.length ? Math.max(...overdue.map((r) => r.overdueBy!)) : null;
  const owed = round2(debits.reduce((n, r) => n + r.balance, 0));

  return (
    <aside className="ap-track" aria-label="The supplier">
      {/* The top slot, where On Order puts "who is waiting". Same reasoning:
          of everything true about this supplier, a credit in hand is the one
          thing that is money on the table. */}
      <div className={"ap-waiting" + (creditTotal > 0.005 ? " live" : "")}>
        <span className="lab">
          Credit in hand
          <span className="mono">{creditTotal > 0.005 ? money(creditTotal) : ""}</span>
        </span>
        {creditTotal > 0.005 ? (
          <>
            <div className="ap-w-name">{credits[0].reference}</div>
            {credits[0].sub && <div className="ap-w-sub">{credits[0].sub}</div>}
            {credits[0].claimed != null && (
              <div className="ap-w-sub" style={{ color: "var(--c-warn)" }}>
                Claimed {money(credits[0].claimed)}, credited {money(credits[0].amount)} — the{" "}
                <strong>credit memo</strong> is the point of truth, not the claim (E-04 d20).
              </div>
            )}
            {creditTotal > owed + 0.005 && (
              <div className="ap-w-sub">
                Larger than the <strong>{money(owed)}</strong> outstanding — applying it returns{" "}
                {money(round2(creditTotal - owed))} as a remainder Credit (d25).
              </div>
            )}
            <div className="wo-caveat">
              You pick which Invoices it lands on (d18), not the total (d23) — it goes out in full, or to the limit of
              what is owed. Whole or not at all (d24).
            </div>
          </>
        ) : (
          <>
            <div className="ap-w-name none">No credit in hand.</div>
            <div className="ap-w-sub">
              Claims arrive here already raised, sent and carrying Pending or Credited (from E-04). Only a{" "}
              <strong>Credited</strong> one counts (d26).
            </div>
          </>
        )}
      </div>

      <div className="ap-track-head">
        <div className={"ap-figure" + (net > 0.005 ? "" : net < -0.005 ? " cr" : " nil")}>{money(net)}</div>
        <div className="ap-figure-say">
          {net > 0.005 ? `owed to ${supplier.name}` : net < -0.005 ? "in the store’s favour" : "nothing owing"}
        </div>
        {overdue.length > 0 && (
          <div className="ap-figure-say" style={{ color: "var(--c-danger)" }}>
            of which <strong>{money(lateSum)}</strong> is past due — {overdue.length} item
            {overdue.length === 1 ? "" : "s"}, worst {worst}d
          </div>
        )}
        <div className="ap-figure-sub">
          Derived from amounts less payments and credits — never edited directly (d8).
        </div>
      </div>
      <div className="wo-rule" />

      <div className="ap-track-mid">
        {/* d51 — aging lives here, one Supplier at a time. The cross-supplier
            report belongs to the surface PRD section 7 defers, and must agree
            with these buckets when it is built. d52 — counted from the DUE
            DATE, so a Net 60 invoice 45 days old sits in "Not yet due" rather
            than being reported as 45 days old and chased. */}
        {owed > 0.005 && (
          <div className="wo-sec">
            <span className="lab">Aged — overdue by</span>
            {agedBuckets(rows)
              .filter((b) => b.count > 0)
              .map((b) => (
                <div className={"ap-split" + (b.key === "over90" ? " warn" : "")} key={b.key}>
                  <span>
                    {b.label} <span className="muted">· {b.count}</span>
                  </span>
                  <span className="mono">{money(b.total)}</span>
                </div>
              ))}
            <div className="wo-caveat">
              Counted from the <strong>due date</strong>, not the invoice date (d52) — a <code>Net 60</code> bill
              forty-five days old is not late. What is <strong>owed</strong> and has no due date — <code>COD</code>,{" "}
              <code>Prepaid</code> (d35), a hand-entered Adjustment (d53) — is shown as <strong>Not aged</strong>{" "}
              rather than dropped. Credit in hand is not here at all: it is not owed, and it has its own figure above.
              Across every Supplier is a report this flow does not own (d51).
            </div>
          </div>
        )}
        <div className="wo-sec">
          <span className="lab">Standing</span>
          <div className="cust-standing">
            <div className="stat">
              <span className="v">{debits.length}</span>
              <span className="k">open, payable</span>
            </div>
            <div className="stat">
              <span className="v" style={overdue.length ? { color: "var(--c-danger)" } : undefined}>
                {worst == null ? "—" : `${worst}d`}
              </span>
              <span className="k">worst past due</span>
            </div>
            <div className="stat">
              <span className="v">{money(creditTotal)}</span>
              <span className="k">credit in hand</span>
            </div>
            <div className="stat span">
              <span className="v">{supplier.paymentTerms ?? "—"}</span>
              <span className="k">payment terms — from the invoice date</span>
            </div>
          </div>
          {supplier.currency !== "CAD" && (
            <div className="wo-caveat warn">
              Invoiced in {supplier.currency}. No store-currency equivalent: M-05 requires it at the configured rate,
              and that rate lives in M-06, which is not built.
            </div>
          )}
          {(supplier.paymentTerms === "Prepaid" || supplier.paymentTerms === "COD") && debits.length > 0 && (
            <div className="wo-caveat warn">
              <strong>{supplier.paymentTerms}</strong>, and yet something is outstanding. Whether such a Supplier may
              carry a balance at all is behaviour M-01 d19 has to answer — shown rather than hidden.
            </div>
          )}
        </div>

        {supplier.billing && (
          <div className="wo-sec">
            <span className="lab">Remit to</span>
            <div className="small">
              {supplier.billing.line1}
              <br />
              {supplier.billing.city}
              {supplier.billing.provinceState ? `, ${supplier.billing.provinceState}` : ""}
              <br />
              {supplier.billing.country}
            </div>
            <div className="wo-caveat">
              <strong>M-05 d17</strong> — display only. M-01 d13 captured this address and recorded that nothing
              consumed it; this is what now does. Edited on the Supplier card.
            </div>
          </div>
        )}

        <div className="wo-sec">
          <span className="lab">Payment history</span>
          {batches.length === 0 && <div className="wo-sec-empty">No settlement recorded yet.</div>}
          {batches.map((b) => {
            const voided = voids.find((v) => v.batchId === b.id);
            // d5/d38 — what LEFT THE BANK, not what the targets settled. An
            // overpayment is capped on its target and returned as a Credit, so
            // summing targets would show $68.65 against an $80.00 cheque on the
            // one screen that reconciles against the statement.
            const money_ = batchMoneyPaid(b, entries);
            const cr = round2(
              b.targets.filter((t) => t.settleKind === "credit").reduce((n, t) => n + t.amount, 0),
            );
            const total = round2(money_ + cr);
            const open = openBatch === b.id;
            return (
              <div className={"ap-batch" + (voided ? " voided" : "")} key={b.id}>
                <button className="ap-batch-head" onClick={() => onOpenBatch(b.id)} aria-expanded={open}>
                  <span className="l">
                    {b.date} — {cr > 0.005 && total - cr <= 0.005 ? "credit only" : b.method}{" "}
                    {b.reference && <span className="mono">{b.reference}</span>}
                  </span>
                  <span className={"badge " + (voided ? "danger" : "ok")}>{voided ? "voided" : money(total)}</span>
                </button>
                {open && (
                  <div className="ap-batch-body">
                    {b.targets.map((t, i) => (
                      <div className="tgt" key={i}>
                        <span>
                          {t.settleKind === "credit" ? "↳ credit — " : ""}
                          {t.kind} {t.id.slice(0, 12)}
                        </span>
                        <span className="mono">{money(t.amount)}</span>
                      </div>
                    ))}
                    {cr > 0.005 && (
                      <div className="by">
                        {money(cr)} of this was credit, {money(round2(total - cr))} was money (d19).
                      </div>
                    )}
                    <div className="by">
                      Recorded by {b.recordedBy} · one batch, however many targets it settled (d16)
                    </div>
                    {voided ? (
                      <div className="by" style={{ color: "var(--c-danger)" }}>
                        <strong>Voided</strong> {voided.voidedAt.slice(0, 10)} by {voided.voidedBy}. The batch is kept
                        as the record of what was recorded at the time — never deleted, never edited (d22).
                      </div>
                    ) : (
                      <button className="btn sm danger" style={{ marginTop: 6 }} onClick={() => onVoid(b.id)}>
                        Void this settlement
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* d46 — a clearing is an act with members, so it is listed the way a
            settlement is and opened the same way, with Un-clear where Void sits
            on a batch. This is d21's move in the other direction: a retired row
            is reached through the act that retired it, because the reverse
            lookup is the one someone reconciling actually needs. */}
        <div className="wo-sec">
          <span className="lab">Clearings</span>
          {clearings.length === 0 && (
            <div className="wo-sec-empty">
              Nothing retired against anything else. A clearing moves no money (d15).
            </div>
          )}
          {clearings.map((c) => {
            const members = c.memberIds
              .map((id) => entries.find((e) => e.id === id))
              .filter((e): e is PayableEntry => !!e);
            const open = openBatch === c.id;
            return (
              <div className="ap-batch" key={c.id}>
                <button className="ap-batch-head" onClick={() => onOpenBatch(c.id)} aria-expanded={open}>
                  <span className="l">
                    {c.clearedAt.slice(0, 10)} — cleared{" "}
                    <span className="mono">{c.memberIds.length} entries</span>
                  </span>
                  <span className="badge">{money(0)}</span>
                </button>
                {open && (
                  <div className="ap-batch-body">
                    {members.map((m) => (
                      <div className="tgt" key={m.id}>
                        <span>{m.reference}</span>
                        <span className="mono">{money(payableEntrySignedAmount(m))}</span>
                      </div>
                    ))}
                    <div className="by">
                      Cleared by {c.clearedBy} — the members sum to zero and the balance did not move (d15).
                    </div>
                    <button className="btn ink danger sm" onClick={() => onUnclear(c.id)}>
                      Un-clear
                    </button>
                    <div className="by">
                      Reverses whole (d47) and <strong>removes this clearing</strong> (d48) — it moved no money and
                      posted no journal line, so there is nothing to keep. Each entry's log names what it was cleared
                      against ([architecture] A-70).
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ap-track-foot">
        <button className="btn ink primary" onClick={onCreateNew}>
          ＋ Create new entry
        </button>
        <div className="foot-sub">
          {debits.length ? "To settle, tick what it covers in the ledger." : "Nothing payable to tick."}
        </div>
      </div>
    </aside>
  );
}

/* --------------------------------------------------------------- selection */

function Selection({
  supplier,
  plan,
  form,
  expectedMethod,
  duplicateRef,
  onForm,
  onSettle,
  onClear,
  onCancel,
}: {
  supplier: Supplier;
  plan: SettlementPlan;
  form: { method: PaymentMethod; reference: string; date: string; credit: Record<string, string>; money: Record<string, string> };
  expectedMethod?: PaymentMethod;
  duplicateRef?: { reference: string; date: string; voided: boolean };
  onForm: (patch: Partial<typeof form>) => void;
  onSettle: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const auto = autoPlacement(plan);
  const creditPlaced = round2(plan.debits.reduce((n, d) => n + creditOn(form, d.key, auto), 0));
  const moneyPlaced = round2(plan.debits.reduce((n, d) => n + moneyOn(form, d.key, d.balance, auto), 0));

  // d38 — per debit, what is being put against it over and above its balance.
  // Not a problem: an artifact, and the Manager is told before they commit.
  const overpaid = plan.debits
    .map((d) => ({
      d,
      by: round2(creditOn(form, d.key, auto) + moneyOn(form, d.key, d.balance, auto) - d.balance),
    }))
    .filter((o) => o.by > 0.005);
  const overpaidTotal = round2(overpaid.reduce((n, o) => n + o.by, 0));

  const problems: string[] = [];
  if (!plan.isClearing) {
    // d33 — there is no "place the credit exactly" check any more, because
    // there is nothing to place: the fill is computed and is exact by
    // construction. What remains is the money, which IS the Manager's.
    // d38 — an overpayment is NOT refused. Money that ends up in the store's
    // favour always gets an artifact: a remainder Credit, on d25's terms, with
    // the supplier balance allowed to go negative because of it. Refusing it
    // here forced the Manager to mis-record what they actually paid, which is
    // the one thing a payables ledger must never make them do (d34 — "the
    // batch records the event, never the expectation").
    //
    // It is surfaced rather than blocked: `overpaid` below drives a notice, and
    // the Settle button stays enabled.
    if (moneyPlaced > 0.005 && !form.reference.trim()) {
      problems.push("A reference is required for the money half — it is what reconciles against the statement (d5).");
    }
  }

  // d27 — a selection with no debit has nothing for its credits to attach to,
  // so they stay counted and only the placeholders retire. That is d15's
  // clearing, arrived at by the general rule rather than a separate button.
  if (plan.isClearing) {
    // d15 — a clearing needs the set's SIGNED amounts to sum to zero, and d29's
    // two figures are why a Claim placeholder can be in one. Without this test
    // a Manager could retire a live credit on its own, which would hide money
    // the store is owed while leaving it in the balance.
    const netsToZero = clearsToZero(plan.rows);
    return (
      <aside className="ap-track" aria-label="Clearing">
        <div className="ap-waiting">
          <span className="lab">
            Selected<span className="mono">{plan.rows.length}</span>
          </span>
          <div className="ap-w-name">Clearing — no money moves</div>
          <div className="ap-w-sub">{supplier.name}</div>
        </div>
        <div className="ap-track-head">
          <div className="ap-figure nil">{money(0)}</div>
          <div className="ap-figure-say">nothing ticked is owed</div>
          <div className="ap-figure-sub">So there is nothing for a credit to attach to (d27).</div>
        </div>
        <div className="wo-rule" />
        <div className="ap-track-mid">
          <div className="ap-zero-ok">
            <div className="t">The balance does not move</div>
            <div className="m">
              {plan.credits.length > 0 &&
                "A credit here was already counted and stays counted — it is not consumed, because there is no debit to consume it against. "}
              {plan.holds.length > 0 && "A placeholder was never counted and retires. "}
              Both stay in the ledger as history (d15, d27).
            </div>
          </div>
          <div className="wo-sec">
            <span className="lab">Retiring</span>
            {plan.rows.map((r) => (
              <div className="ap-tgt" key={r.key}>
                <div className="l">
                  <div className="t">
                    {r.type} — {r.reference}
                  </div>
                  <div className="m">{r.role === "placeholder" ? "never counted" : "already counted, stays counted"}</div>
                </div>
                <span className="num mono">{money(r.face)}</span>
              </div>
            ))}
          </div>
          {!netsToZero && (
            <div className="ap-blocked">
              <div className="t">These do not sum to zero</div>
              <div className="m">
                <div>
                  They net to{" "}
                  <strong>{money(round2(plan.rows.reduce((n, r) => n + r.face, 0)))}</strong>, and d15 requires exactly
                  zero — a credit may only be retired alongside something that cancels it, which is what stops a
                  clearing being used to hide money the store is owed.
                </div>
              </div>
            </div>
          )}
          <div className="wo-caveat warn">
            M-05 does not say whether a clearing can be reversed, so this does not offer it and does not promise it.
          </div>
        </div>
        <div className="ap-track-foot">
          <button className="btn ink primary" disabled={!netsToZero} onClick={onClear}>
            Clear these {plan.rows.length}
          </button>
          <button className="btn ghost secondary" onClick={onCancel}>
            Cancel
          </button>
          <div className="foot-sub">Tick something that is owed to turn this into a settlement.</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ap-track" aria-label="The selection">
      <div className="ap-waiting">
        <span className="lab">
          Selected<span className="mono">{plan.rows.length}</span>
        </span>
        <div className="ap-w-name">Settling</div>
        <div className="ap-w-sub">{supplier.name}</div>
      </div>

      <div className="ap-track-head">
        <div className="ap-figure">{money(round2(creditPlaced + moneyPlaced))}</div>
        <div className="ap-figure-say">
          {money(creditPlaced)} credit + {money(moneyPlaced)} money
        </div>
        <div className="ap-figure-sub">
          One <strong>PaymentBatch</strong> carrying both kinds of target (d16, d19). Nothing instructs a bank — this
          is recording, not executing.
        </div>
      </div>
      <div className="wo-rule" />

      <div className="ap-track-mid">
        <div className="wo-sec">
          <span className="lab">What this selection comes to</span>
          <div className="ap-split">
            <span>Owed — {plan.debits.length} item{plan.debits.length === 1 ? "" : "s"}</span>
            <span className="mono">{money(plan.debitTotal)}</span>
          </div>
          {plan.credits.length > 0 && (
            <div className="ap-split">
              <span>Credit ticked — {plan.credits.length}</span>
              <span className="mono">−{money(plan.creditTotal)}</span>
            </div>
          )}
          {/* d43 — where the ticked credits are worth more than is owed, the
              summary has to name the credit being partly applied and the
              remainder it will emit, BEFORE the Manager commits rather than
              after. One aggregate figure cannot say which credit it came from,
              and the drawdown order is only as visible as this makes it. */}
          {plan.credits.length > 1 && (
            <div className="ap-credit-order">
              {plan.credits.map((c, i) => {
                const d = plan.drawdown[i];
                return (
                  <div className="ap-split sub" key={c.key}>
                    <span>
                      {i + 1}. {c.reference}
                      {!d.touched && " — not drawn on, stays as it is (d27)"}
                      {d.touched && d.left > 0.005 && " — partly applied"}
                    </span>
                    <span className="mono">{d.drawn > 0.005 ? `−${money(d.drawn)}` : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
          {plan.holds.length > 0 && (
            <div className="ap-split">
              <span>Claim placeholders — {plan.holds.length}</span>
              <span className="mono">{money(0)}</span>
            </div>
          )}
          <div className="ap-split tot">
            <span>To pay</span>
            <span className="mono">{money(plan.money)}</span>
          </div>
          {plan.holds.length > 0 && (
            <div className="wo-caveat">
              A Claim placeholder contributes <strong>nothing to the money</strong>, ever (d27). Ticking it retires it —
              a decision to stop chasing it.
            </div>
          )}
          {overpaidTotal > 0.005 && (
            <div className="wo-caveat warn">
              {money(overpaidTotal)} more than is owed
              {overpaid.length === 1 ? ` on ${overpaid[0].d.type} ${overpaid[0].d.reference}` : ""}. This is recorded as
              paid, not refused — it comes back as a <strong>remainder Credit</strong> and the supplier balance goes
              negative by that much until it is used (d38, d25). The batch records what you actually paid (d34).
            </div>
          )}
          {plan.remainder > 0.005 && (
            <div className="wo-caveat warn">
              {(() => {
                // d43 — name the credit that overflows. It is the last one the
                // drawdown touched, since the ones before it were used up.
                const over = [...plan.drawdown].reverse().find((d) => d.touched && d.left > 0.005);
                const row = over ? plan.credits.find((c) => c.key === over.id) : undefined;
                return row ? (
                  <>
                    {money(plan.remainder)} of <strong>{row.reference}</strong> cannot attach to anything ticked. It is
                    consumed whole and the {money(plan.remainder)} comes back as a <strong>remainder Credit</strong>,
                    staying in the store’s favour (d25, d28, d43).
                  </>
                ) : (
                  <>
                    {money(plan.remainder)} of credit cannot attach to anything ticked. It comes back as a{" "}
                    <strong>remainder Credit</strong> and stays in the store’s favour (d25, d28).
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="wo-sec">
          <span className="lab">What this settles</span>
          {plan.attach > 0.005 && (
            <div className="wo-caveat">
              {money(plan.attach)} of credit lands across what you ticked, in order. <strong>Ticking is the
              choosing</strong> (d18, d33) — to put a credit against one Invoice, tick one Invoice. The money is
              yours to set: leave it and it settles what the credit did not (d4).
            </div>
          )}
          {plan.debits.map((d) => (
            <div className="ap-tgt dual" key={d.key}>
              <div className="l">
                <div className="t">
                  {d.type} {d.reference}
                </div>
                <div className="m">
                  balance {money(d.balance)}
                  {d.overdueBy != null && d.overdueBy > 0 ? ` · ${d.overdueBy}d over` : ""}
                </div>
              </div>
              {/* d33 — the credit is shown where it landed, not asked for. */}
              <div className="inp">
                <span className="tag cr">credit</span>
                <span className={"placed" + (creditOn(form, d.key, auto) > 0.005 ? " cr" : " nil")}>
                  {money(creditOn(form, d.key, auto))}
                </span>
              </div>
              <div className="inp">
                <span className="tag">money</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={moneyOn(form, d.key, d.balance, auto).toFixed(2)}
                  onChange={(e) => onForm({ money: { ...form.money, [d.key]: e.target.value } })}
                />
              </div>
            </div>
          ))}
          {plan.attach > 0.005 ? (
            <div className="ap-credit-bar">
              <div className="ln">
                <span>Credit going out</span>
                <span className="mono">{money(plan.attach)}</span>
              </div>
              {plan.remainder > 0.005 && (
                <div className="ln">
                  <span>Coming back as a remainder</span>
                  <span className="mono">{money(plan.remainder)}</span>
                </div>
              )}
              <div className="who">
                A credit goes out in full, or to the limit of what you ticked, whichever is smaller — the total is not
                yours to choose (d23), and it is consumed whole (d24, d28).
              </div>
            </div>
          ) : plan.attach <= 0.005 ? (
            <div className="wo-caveat">
              No credit ticked, so this is money only. Tick a Credit or a Credited claim to net it off.
            </div>
          ) : null}
          <div className="wo-caveat">
            Partial <em>payment</em> is supported (d4); partial <em>credit</em> is not (d24, d28).
          </div>
        </div>

        <div className="wo-sec">
          <span className="lab">How the money half was paid</span>
          <div className="grid cols-2">
            <label className="field">
              <span>Method</span>
              <select
                value={form.method}
                onChange={(e) => onForm({ method: e.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(e) => onForm({ date: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Reference</span>
            <input
              type="text"
              value={form.reference}
              placeholder="Cheque 101"
              onChange={(e) => onForm({ reference: e.target.value })}
            />
          </label>
          {/* d41 — warns, never refuses. The reference is free text on purpose
              (d5) and one cheque can legitimately cover two settlements. Naming
              the match and whether it is VOIDED is what stops this becoming
              noise the Manager learns to click through: after a void and a
              re-record (d40) the repeat is expected, and the warning says so. */}
          {duplicateRef && (
            <div className={"wo-caveat" + (duplicateRef.voided ? "" : " warn")}>
              <strong>{duplicateRef.reference}</strong> is already on a settlement dated {duplicateRef.date}
              {duplicateRef.voided ? (
                <> — a <strong>voided</strong> one, so re-using it here is expected (d40).</>
              ) : (
                <>
                  , and that one is <strong>live</strong>. Recording it twice would double the payment. Proceeding is
                  allowed — a single cheque covering two settlements is a real thing (d5, d41).
                </>
              )}
            </div>
          )}
          {expectedMethod ? (
            <div className="wo-caveat">
              {expectedMethod === form.method ? (
                <>
                  What was ticked expected <strong>{expectedMethod}</strong> (E-02 d47), and that is what this records.
                </>
              ) : (
                <>
                  What was ticked expected <strong>{expectedMethod}</strong> (E-02 d47) — this records{" "}
                  <strong>{form.method}</strong>, which is right if that is what you actually did. The batch records
                  the event, never the expectation (d34).
                </>
              )}
            </div>
          ) : plan.debits.length > 1 ? (
            <div className="wo-caveat">
              What you ticked does not agree on a method, so nothing is offered — guessing whose habit governs a mixed
              run is the kind of quiet inference d18 retired (d34).
            </div>
          ) : null}
          <div className="wo-caveat">
            Free text, on purpose (d5). Required only where money actually moves (d19). Recorded by R. Duval.
          </div>
        </div>

        {problems.length > 0 && (
          <div className="ap-blocked">
            <div className="t">Not ready</div>
            <div className="m">
              {problems.map((p, i) => (
                <div key={i}>{p}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ap-track-foot">
        <button className="btn accent primary" disabled={problems.length > 0} onClick={onSettle}>
          Settle {money(round2(creditPlaced + moneyPlaced))}
        </button>
        <button className="btn ghost secondary" onClick={onCancel}>
          Cancel
        </button>
        <div className="foot-sub">
          Anything ticked that reaches zero leaves the outstanding list and stays readable below it (step 5, d21).
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- create new */

function CreateEntry({
  supplier,
  onCancel,
  onCreate,
}: {
  supplier: Supplier;
  onCancel: () => void;
  onCreate: (input: {
    type: PayableEntryType;
    reference: string;
    date: string;
    subtotal: number;
    tax: number;
    freight: number;
    misc: number;
    adjustmentDirection?: "increase" | "decrease";
  }) => void;
}) {
  const [type, setType] = useState<PayableEntryType>(supplier.consignment ? "Consignment" : "Invoice");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("0");
  const [freight, setFreight] = useState("0");
  const [misc, setMisc] = useState("0");
  const [dir, setDir] = useState<"increase" | "decrease">("increase");

  const nums = {
    subtotal: Number(subtotal) || 0,
    tax: Number(tax) || 0,
    freight: Number(freight) || 0,
    misc: Number(misc) || 0,
  };
  const total = round2(nums.subtotal + nums.tax + nums.freight + nums.misc);
  const signed = type === "Credit" ? -total : type === "Claim" ? 0 : type === "Adjustment" && dir === "decrease" ? -total : total;

  const caveat =
    type === "Claim"
      ? "A Claim is a placeholder — logged before the supplier’s credit memo is in hand. It does not affect the balance at all until it is cleared against a matching Credit (d14)."
      : type === "Credit"
        ? "A Credit always reduces the balance, the moment it is entered (d14). It attaches to debits in a settlement like any other credit (d27)."
        : type === "Adjustment"
          ? "An Adjustment moves the balance either way — the Manager’s choice at entry (d14)."
          : type === "Consignment"
            ? "The same default a real Receiving Invoice gets for a consignment Supplier (d13)."
            : "An Invoice entered by hand is owed immediately. Accounts payable never creates a Receiving Invoice — it consumes those (d9).";

  return (
    <aside className="ap-track" aria-label="Create a ledger entry">
      <div className="ap-waiting">
        <span className="lab">Creating</span>
        <div className="ap-w-name">A ledger entry, by hand</div>
        <div className="ap-w-sub">Against {supplier.name}</div>
      </div>
      <div className="ap-track-head">
        <div className={"ap-figure" + (total > 0 ? (signed < 0 ? " cr" : "") : " nil")}>{money(signed)}</div>
        <div className="ap-figure-say">
          {type === "Claim" ? "placeholder — moves nothing yet" : signed < 0 ? "reduces what is owed" : "increases what is owed"}
        </div>
        <div className="ap-figure-sub">
          A lump subtotal/tax/freight/misc — never itemized against an InventoryItem (d12).
        </div>
      </div>
      <div className="wo-rule" />
      <div className="ap-track-mid">
        <div className="wo-sec">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as PayableEntryType)}>
              {PAYABLE_ENTRY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {supplier.consignment && (
            <div className="wo-caveat">
              Defaulted to <strong>Consignment</strong>: this Supplier carries the consignment flag (d13).
            </div>
          )}
          {type === "Adjustment" && (
            <label className="field">
              <span>Direction</span>
              <select value={dir} onChange={(e) => setDir(e.target.value as "increase" | "decrease")}>
                <option value="increase">Increases what is owed</option>
                <option value="decrease">Decreases what is owed</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Reference — a bill #, memo #, or note</span>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="wo-sec">
          <span className="lab">Amounts</span>
          <div className="grid cols-2">
            <label className="field">
              <span>Subtotal</span>
              <input type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
            </label>
            <label className="field">
              <span>Tax</span>
              <input type="number" min={0} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
            </label>
            <label className="field">
              <span>Freight</span>
              <input type="number" min={0} step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
            </label>
            <label className="field">
              <span>Misc</span>
              <input type="number" min={0} step="0.01" value={misc} onChange={(e) => setMisc(e.target.value)} />
            </label>
          </div>
          <div className="wo-caveat">{caveat}</div>
        </div>
        <div className="wo-caveat">
          Not sourced from Receiving or Supplier Claims. A deliberate shortcut, not a replacement for either (d12).
        </div>
      </div>
      <div className="ap-track-foot">
        <button
          className="btn accent primary"
          disabled={total <= 0}
          onClick={() =>
            onCreate({
              type,
              reference: reference.trim(),
              date,
              ...nums,
              adjustmentDirection: type === "Adjustment" ? dir : undefined,
            })
          }
        >
          Add {type}
        </button>
        <button className="btn ghost secondary" onClick={onCancel}>
          Cancel
        </button>
        <div className="foot-sub">{total > 0 ? `Total ${money(total)}` : "An amount is needed."}</div>
      </div>
    </aside>
  );
}

function CardsStanding({ total }: { total: number }) {
  return (
    <aside className="ap-track" aria-label="Gift card liability">
      <div className="ap-waiting">
        <span className="lab">Owed to</span>
        <div className="ap-w-name">Customers, not suppliers</div>
        <div className="ap-w-sub">
          Registered here rather than buried in settings, because it is money the store owes (d10).
        </div>
      </div>
      <div className="ap-track-head">
        <div className="ap-figure">{money(total)}</div>
        <div className="ap-figure-say">outstanding gift-card liability</div>
        <div className="ap-figure-sub">The sum of every card carrying a balance.</div>
      </div>
      <div className="wo-rule" />
      <div className="ap-track-mid">
        <div className="wo-sec">
          <span className="lab">What is not here</span>
          <div className="wo-caveat warn">
            M-05 asks the registry for issue date and last-used date. The prototype’s GiftCard record carries{" "}
            <strong>code, balance and an optional customer only</strong>, so those two columns are absent rather than
            fabricated.
          </div>
          <div className="wo-caveat">
            Nothing is editable here. Loading and redeeming are the till’s (E-05). No terms and no due date: a gift card
            is owed on demand, so nothing ages.
          </div>
        </div>
      </div>
      <div className="ap-track-foot">
        <div className="foot-sub">A register has no primary action.</div>
      </div>
    </aside>
  );
}
