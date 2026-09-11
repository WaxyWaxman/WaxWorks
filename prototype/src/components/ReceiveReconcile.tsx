import type { Invoice, Supplier } from "../data/types";
import { figureField, numericOnly } from "../lib/fields";
import { money } from "../lib/money";
import { round2 } from "../lib/totals";

// Track 3 (E-02 d38) — the till's money track doing the receiving job.
//
// The figures are here rather than in a footer strip because d37's reason
// still holds: derived vs. stated is the check step 18 turns on, and on a
// 60-line invoice a footer that scrolled away would hide it exactly when it
// matters. A right-hand track never scrolls at any line count, and it stops
// competing with the line table for vertical room. Below 1180px the CSS drops
// it back to a bottom strip, which is d37's own arrangement.
//
// Their paperwork figures are entered HERE, next to ours, because this is
// where the two get compared — moving them out of the left rail is what frees
// that track to be purely the worklist.

export function ReceiveReconcile({
  invoice,
  supplier,
  onPatchTotals,
  derivedSubtotal,
  mismatch,
  totalRaw,
  onTotalRawChange,
  enteredTotal,
  delta,
  pctDelta,
  beyondTolerance,
  expectedSellValue,
  expectedMarginPct,
  belowCostLines,
  onFinalize,
  onSaveUpdates,
  onPrintAllLabels,
  mintedCount,
}: {
  invoice: Invoice;
  supplier: Supplier;
  onPatchTotals: (patch: Partial<Pick<Invoice, "statedSubtotal" | "tax" | "freight" | "misc">>) => void;
  derivedSubtotal: number;
  mismatch: boolean;
  totalRaw: string;
  onTotalRawChange: (raw: string) => void;
  enteredTotal: number;
  delta: number;
  pctDelta: number;
  beyondTolerance: boolean;
  expectedSellValue: number;
  expectedMarginPct: number;
  belowCostLines: number;
  onFinalize: () => void;
  onSaveUpdates: () => void;
  onPrintAllLabels: () => void;
  mintedCount: number;
}) {
  // Paid is the only state that locks (d40). Finalize makes stock sellable;
  // it does not close the paperwork.
  const locked = invoice.status === "Paid";
  const copies = invoice.lines.reduce((n, l) => n + l.qty, 0);
  const statedDelta = round2(derivedSubtotal - invoice.statedSubtotal);

  // Two things can raise a review flag here (d35) and they are independent:
  // a line priced under cost, and a total adjustment beyond ±2%.
  const flags: string[] = [];
  if (belowCostLines > 0) {
    flags.push(
      `${belowCostLines} line${belowCostLines === 1 ? "" : "s"} priced below cost (d35)`,
    );
  }
  if (beyondTolerance) flags.push("Total adjustment beyond ±2% (d35)");

  return (
    <aside className="recv-recon" aria-label="Reconcile">
      <div className="recv-recon-head">
        {/* The headline is what will be owed, not the difference: the total is
            the figure staff read aloud and the one M-05 consumes. The check
            sits immediately under it so it cannot be read past. */}
        <div className="lab">Invoice total</div>
        <div className="recv-figure">{money(enteredTotal)}</div>
        <div className="xsmall muted recv-figure-sub">
          {copies} cop{copies === 1 ? "y" : "ies"} · {invoice.lines.length} line
          {invoice.lines.length === 1 ? "" : "s"} · {supplier.name}
        </div>
      </div>

      <Verdict
        mismatch={mismatch}
        statedDelta={statedDelta}
        beyondTolerance={beyondTolerance}
        delta={delta}
        pctDelta={pctDelta}
        hasLines={invoice.lines.length > 0}
      />

      <div className="recv-rule" />

      <div className="recv-recon-mid">
        <div className="recv-sec">
          <span className="lab">Ours — derived from the lines</span>
          <div className="totals-row">
            <span className="xsmall">Copies received</span>
            <strong className="num">{copies}</strong>
          </div>
          <div className="totals-row">
            <span className="xsmall">Line subtotal</span>
            <strong className="num">{money(derivedSubtotal)}</strong>
          </div>
        </div>

        <div className="recv-sec">
          <span className="lab">Theirs — off the paperwork</span>
          <PaperworkFields invoice={invoice} locked={locked} onPatch={onPatchTotals} />
          <div className={"totals-row recv-delta" + (mismatch ? " warn" : " ok")}>
            <span className="xsmall">Difference</span>
            <strong className="num">{money(statedDelta)}</strong>
          </div>
        </div>

        <div className="recv-sec">
          <span className="lab">Total</span>
          <div className="recv-entry total">
            <span>Payable</span>
            <input
              {...figureField}
              disabled={locked}
              value={totalRaw}
              onChange={(e) => onTotalRawChange(numericOnly(e.target.value, true))}
              aria-label="Invoice total — ±2% free, beyond raises a review flag"
            />
          </div>
          <div className="xsmall muted">
            Tax is excluded from cost of goods — an input tax credit, not a cost (d34).
          </div>
        </div>

        <div className="recv-sec">
          <span className="lab">Expected</span>
          <div className="totals-row">
            <span className="xsmall">Sell value</span>
            <strong className="num">{money(expectedSellValue)}</strong>
          </div>
          <div className="totals-row">
            <span className="xsmall">Margin</span>
            <strong
              className="num"
              style={{ color: expectedMarginPct < 0 ? "var(--c-danger)" : "var(--c-ok)" }}
            >
              {expectedMarginPct.toFixed(1)}%
            </strong>
          </div>
          <div className="xsmall muted">
            Sell value against the full invoice total — informational, not COGS.
          </div>
        </div>

        {flags.length > 0 && (
          <div className="recv-flags">
            <span className="lab">
              Review flag{flags.length === 1 ? "" : "s"} · {flags.length}
            </span>
            <ul>
              {flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="recv-recon-foot">
        {invoice.status === "Draft" && (
          <>
            <button
              className="btn primary recv-finalize"
              disabled={invoice.lines.length === 0}
              onClick={onFinalize}
            >
              Finalize
            </button>
            <div className="recv-foot-sub">
              {copies} cop{copies === 1 ? "y" : "ies"} become sellable · labels · summary prints
            </div>
          </>
        )}
        {invoice.status === "Finalized" && (
          <>
            <button className="btn primary recv-finalize" onClick={onSaveUpdates}>
              Save updates
            </button>
            <div className="recv-foot-sub">
              Sellable since {invoice.finalizedAt?.slice(0, 16) ?? "finalize"} · corrections stay
              open until this invoice is paid
            </div>
          </>
        )}
        {locked && (
          <div className="recv-foot-sub">
            Immutable · settled in Accounts Payable (M-05)
            {invoice.paidAt ? ` on ${invoice.paidAt}` : ""}
          </div>
        )}
        <button
          className="btn recv-foot-alt"
          onClick={onPrintAllLabels}
          disabled={mintedCount === 0}
          title={mintedCount ? "Stub — hooked up down the line" : "Nothing minted yet"}
        >
          <PrinterIcon /> Print all labels
        </button>
      </div>
    </aside>
  );
}

const PrinterIcon = () => (
  <svg
    width={15}
    height={15}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 9V3h10v6" />
    <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </svg>
);

// Said in words as well as in colour, because "is this invoice right" is the
// question the whole track exists to answer and a coloured number alone does
// not answer it.
function Verdict({
  mismatch,
  statedDelta,
  beyondTolerance,
  delta,
  pctDelta,
  hasLines,
}: {
  mismatch: boolean;
  statedDelta: number;
  beyondTolerance: boolean;
  delta: number;
  pctDelta: number;
  hasLines: boolean;
}) {
  if (!hasLines) {
    return (
      <div className="recv-verdict">
        <span className="mark" aria-hidden="true">
          ·
        </span>
        <span>Nothing taken in yet — scan something to start checking against their paperwork.</span>
      </div>
    );
  }
  if (beyondTolerance) {
    return (
      <div className="recv-verdict warn">
        <span className="mark" aria-hidden="true">
          ▲
        </span>
        <span>
          <strong>Total adjusted by {money(delta)}</strong> — {(pctDelta * 100).toFixed(1)}%, beyond
          ±2%. Finalizing proceeds and raises a review flag (d35).
        </span>
      </div>
    );
  }
  if (mismatch) {
    return (
      <div className="recv-verdict warn">
        <span className="mark" aria-hidden="true">
          ▲
        </span>
        <span>
          <strong>Out by {money(statedDelta)} against their paperwork</strong> — recheck the lines,
          or proceed if it is explainable (d18).
        </span>
      </div>
    );
  }
  return (
    <div className="recv-verdict ok">
      <span className="mark" aria-hidden="true">
        ✓
      </span>
      <span>
        <strong>Matches their paperwork.</strong> Our lines and their stated subtotal agree.
      </span>
    </div>
  );
}

function PaperworkFields({
  invoice,
  locked,
  onPatch,
}: {
  invoice: Invoice;
  locked: boolean;
  onPatch: (patch: Partial<Pick<Invoice, "statedSubtotal" | "tax" | "freight" | "misc">>) => void;
}) {
  const fields: { key: "statedSubtotal" | "tax" | "freight" | "misc"; label: string }[] = [
    { key: "statedSubtotal", label: "Stated subtotal" },
    { key: "tax", label: "Tax" },
    { key: "freight", label: "Freight" },
    { key: "misc", label: "Miscellaneous" },
  ];
  return (
    <>
      {fields.map(({ key, label }) => (
        <label className="recv-entry" key={key}>
          <span>{label}</span>
          <input
            {...figureField}
            disabled={locked}
            value={invoice[key]}
            onChange={(e) => onPatch({ [key]: Number(numericOnly(e.target.value)) || 0 })}
          />
        </label>
      ))}
    </>
  );
}
