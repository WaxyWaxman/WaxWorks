import { useNavigate } from "react-router-dom";
import type { Supplier } from "../data/types";
import { apState, groupFlight, type FlightKind, type SupplierFacts } from "../lib/supplierFacts";
import { money } from "../lib/money";

// ---- Track 3: the ledger (M-01 d14, d15, d18) ----
//
// The till's money track doing the supplier job, in the order d14 sets: what is
// in flight with them, the outstanding A/P figure, trade over 12 months, and
// recent intake. Head and foot are fixed and only the middle scrolls, so the
// primary action sits in the same place on a quiet Supplier and on a busy one.
//
// What is NOT here is the row-by-row ledger. M-05 d3 already shows outstanding
// Invoices, Pending claims and manual entries in one combined list per
// Supplier, and it is the screen that can act on them; restating the rows here
// would mean two places to read the same facts with only one able to do
// anything about them (d18). The figure links through instead.
export function SupplierLedger({
  supplier,
  facts,
}: {
  supplier: Supplier;
  facts: SupplierFacts;
}) {
  const nav = useNavigate();
  const st = apState(facts.apBalance);
  const groups = groupFlight(facts.flight);
  const flightCount = facts.flight.length;

  // d18 — every row opens the thing it names on the screen that owns it.
  const go = (dest: string, id?: string) => {
    if (dest === "receiving") nav(id ? `/receiving/${id}` : "/receiving");
    else if (dest === "on-order") nav("/on-order");
    else nav("/claims");
  };

  return (
    <aside className="cust-acct sup-acct" aria-label="Ledger and actions">
      {/* 1. In flight, above the money: a draft Invoice, an overdue PO line
             and a Pending claim all go stale silently, and nothing else
             chases them (d14, the supplier-side of E-07 d19). Capped at
             three rows and scrolling — a busy Supplier carries six, and
             unbounded this band would push the figure off a track whose
             whole purpose is being fixed. */}
      <div className={"cust-waiting sup-flight" + (flightCount > 0 ? " live" : "")}>
        <div className="sup-flight-head">
          <span className="lab">In flight with them</span>
          {flightCount > 0 && (
            <span className="sup-flight-count">
              {groups.map((g) => `${g.rows.length} ${kindShort(g.kind, g.rows.length)}`).join(" · ")}
            </span>
          )}
        </div>
        {flightCount === 0 ? (
          <div className="xsmall muted">
            Nothing open — no draft invoice, no outstanding order, no claim waiting.
          </div>
        ) : (
          // The per-kind counts live in the label ABOVE this scroll, so the
          // cap can never hide that a claim exists.
          <div className={"sup-flight-scroll" + (flightCount > 3 ? " capped" : "")}>
            {groups.map((g) => (
              <div key={g.kind}>
                <div className="sup-flight-type">
                  {kindLabel(g.kind, g.rows.length)}
                  {g.rows.length > 1 && " · oldest first"}
                </div>
                {g.rows.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className="sup-flight-row"
                    onClick={() => go(r.dest, r.destId)}
                    title={`Open in ${destName(r.dest)}`}
                  >
                    <span className="wait-t">{r.title}</span>
                    <span className="wait-ref">{r.ref}</span>
                    <span className="wait-m">{r.meta}</span>
                    <span className="sup-flight-go">→ open in {destName(r.dest)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. The figure. Invoice TOTALS, tax included — what is owed them.
             Deliberately a different basis from Received below, which is cost
             of goods; the caveat under Trade says so rather than leaving the
             two to be read as comparable. */}
      <div className="cust-acct-head">
        <div className="lab">Outstanding A/P</div>
        <div className={"cust-figure " + st}>{money(facts.apBalance)}</div>
        <div className="cust-figure-say">
          {st === "owed" ? "Owed to them" : st === "credit" ? "In our favour" : "Settled"}
        </div>
        <div className="cust-figure-sub">
          {st === "owed"
            ? "Finalized Invoices and entries, less payments and applied credits."
            : st === "credit"
              ? "A credit exceeded what was outstanding. It nets against the next Invoice."
              : "Nothing outstanding either way."}{" "}
          <button className="linkish" onClick={() => nav("/payable")}>
            See it in Accounts Payable →
          </button>
        </div>
      </div>
      <div className="cust-rule" />

      <div className="cust-acct-mid">
        {/* 3. Trade. Reporting only, and the first step onto a surface the
               PRD §7 defers — so every figure says what basis it is on. */}
        <div className="cust-sec">
          <span className="lab">Trade, last 12 months</span>
          <div className="cust-standing">
            <Stat k="Received (COGS)" v={money(facts.trade.received)} cls="in" />
            <Stat k="Sold" v={money(facts.trade.sold)} cls="out" />
            <div className="stat span">
              <span className="v">
                {facts.trade.copiesIn} in · {facts.trade.copiesSold} sold
                {facts.trade.marginPct != null && ` · ${facts.trade.marginPct.toFixed(1)}% margin`}
              </span>
              <span className="k">Copies, and the spread</span>
            </div>
          </div>
          <div className="sup-caveat">
            <p>
              Received is <strong>cost of goods</strong> — subtotal + freight + misc, inbound tax
              excluded (A-29, E-02 d34). The figure above it is Invoice totals, tax included:
              different bases, on purpose.
            </p>
            {facts.trade.marginPct != null && (
              <p>
                Margin reflects supplier cost only; freight and misc stay at Invoice level, so it is
                overstated — roughly 2.6% on the reference Invoice (E-02 d34, M-03).
              </p>
            )}
            {supplier.currency !== "CAD" && (
              <p>
                Received is in {supplier.currency} as invoiced. The store-currency equivalent needs
                the configured rate (M-06) and is not guessed at here.
              </p>
            )}
            {facts.trade.unattributed > 0 && (
              <p>
                {facts.trade.unattributed} sold {facts.trade.unattributed === 1 ? "copy has" : "copies have"}{" "}
                no Invoice behind {facts.trade.unattributed === 1 ? "it" : "them"} — oversold (E-05
                d21) or predating the system — so {facts.trade.unattributed === 1 ? "it is" : "they are"}{" "}
                excluded from Sold rather than guessed at.
              </p>
            )}
          </div>
        </div>

        {/* 4. What came in lately. Each row opens that Invoice in Receiving,
               which opens as it was finalized (E-02 d36, A-27). */}
        <div className="cust-sec">
          <span className="lab">Recent intake</span>
          {facts.intake.length === 0 ? (
            <div className="xsmall muted">Nothing received from them yet.</div>
          ) : (
            <>
              {facts.intake.map((r) => (
                <button
                  key={r.invoiceId}
                  type="button"
                  className="cust-salerow sup-intake"
                  onClick={() => nav(`/receiving/${r.invoiceId}`)}
                  title="Open in Receiving"
                >
                  <span className="t">{r.invoiceNumber || "(unnumbered)"}</span>
                  <span className="m">
                    {r.at} · {r.lines} {r.lines === 1 ? "line" : "lines"} · {r.copies}{" "}
                    {r.copies === 1 ? "copy" : "copies"}
                  </span>
                  <span className="v">{money(r.cogs)}</span>
                </button>
              ))}
              <span className="xsmall muted">
                Opens in Receiving, as it was finalized (E-02 d36, A-27).
              </span>
            </>
          )}
        </div>
      </div>

      <LedgerFoot supplier={supplier} facts={facts} />
    </aside>
  );
}

// d15 — the ladder. Open the draft Invoice, else process the pending order
// stream, else start an intake. Mirrors E-07 d20's shape and its reasoning:
// the thing that goes stale silently outranks the thing that does not.
function LedgerFoot({ supplier, facts }: { supplier: Supplier; facts: SupplierFacts }) {
  const nav = useNavigate();
  const st = apState(facts.apBalance);
  const draft = facts.openDraft;
  const pending = facts.pendingLines;

  return (
    <div className="cust-acct-foot">
      {draft ? (
        <>
          <button className="btn primary cust-primary" onClick={() => nav(`/receiving/${draft.id}`)}>
            Open draft invoice
            <br />
            {draft.invoiceNumber || "(unnumbered)"}
          </button>
          <div className="cust-foot-sub">
            {draft.lines.length} {draft.lines.length === 1 ? "line" : "lines"} scanned so far ·
            started by {draft.createdBy}.
          </div>
        </>
      ) : pending.length > 0 ? (
        <>
          <button className="btn primary cust-primary" onClick={() => nav("/orders")}>
            Process order
            <br />
            {pending.length} {pending.length === 1 ? "line" : "lines"} pending
          </button>
          <div className="cust-foot-sub">
            Assigns a PO number and placed date to every line in the stream (M-02).
          </div>
        </>
      ) : (
        <>
          <button className="btn primary cust-primary" onClick={() => nav("/receiving")}>
            Start an intake from
            <br />
            {supplier.name || "this supplier"}
          </button>
          <div className="cust-foot-sub">
            {supplier.defaultForSecondHand
              ? "Pre-selected at Receiving when Second-hand intake is chosen (E-02 d27)."
              : "Opens a new draft Invoice at Receiving with this Supplier set."}
          </div>
        </>
      )}
      {/* Recording a payment is an accounts-payable ACTION, so it stays
          manager-only (M-05 d2) even though the figure above it does not
          (d16). It rides in the slot E-07 d20 gives its own secondary. */}
      {st === "owed" && (
        <button className="btn cust-secondary" onClick={() => nav("/payable")}>
          Record a payment (Manager)
        </button>
      )}
    </div>
  );
}

/** The blank card's ledger track: replaced by a band that says why it is empty. */
export function NewSupplierLedger({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  return (
    <aside className="cust-acct sup-acct" aria-label="Ledger">
      <div className="cust-acct-head">
        <div className="lab">Outstanding A/P</div>
        <div className="cust-figure nil">—</div>
        <div className="cust-figure-say">Nothing yet</div>
      </div>
      <div className="cust-rule" />
      <div className="cust-acct-blank">
        No ledger until the record exists. A Supplier's balance only moves through a finalized
        Invoice, a payment, or a credit applied in Accounts Payable — and their Discount starts at
        0% until a Manager sets it (d1, d11).
      </div>
      <div className="cust-acct-foot">
        <button className="btn primary cust-primary" disabled={!canAdd} onClick={onAdd}>
          Add supplier
        </button>
        <div className="cust-foot-sub">
          A short name and a full name are the only two required, and the short name must be unique.
        </div>
      </div>
    </aside>
  );
}

function Stat({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="stat">
      <span className={"v" + (cls ? " " + cls : "")}>{v}</span>
      <span className="k">{k}</span>
    </div>
  );
}

function kindLabel(kind: FlightKind, n: number): string {
  if (kind === "draft") return `${n} draft ${n === 1 ? "invoice" : "invoices"}`;
  if (kind === "order") return n === 1 ? "1 order outstanding" : `${n} orders outstanding`;
  return `${n} ${n === 1 ? "claim" : "claims"} waiting`;
}

function kindShort(kind: FlightKind, n: number): string {
  if (kind === "draft") return n === 1 ? "draft" : "drafts";
  if (kind === "order") return "on order";
  return n === 1 ? "claim" : "claims";
}

function destName(dest: string): string {
  if (dest === "receiving") return "Receiving";
  if (dest === "on-order") return "What's on Order";
  return "Claims";
}
