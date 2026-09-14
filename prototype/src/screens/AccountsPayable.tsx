import { useEffect, useMemo, useState } from "react";
import { PayableSlab, type PayableChip, type PayableSort } from "../components/PayableSlab";
import { SettleTrack } from "../components/SettleTrack";
import { CURRENT_USER } from "../data/seed";
import type { PayableEntryType, PaymentMethod } from "../data/types";
import {
  autoPlacement,
  creditOn,
  ledgerRows,
  moneyOn,
  settlementPlan,
  suggestedMethod,
  type LedgerRow,
} from "../lib/payables";
import { money } from "../lib/money";
import { readStored, writeStored } from "../lib/tillMemory";
import { round2, supplierBalance } from "../lib/totals";
import { useApp } from "../store/AppStore";

// Accounts payable (M-05), laid out as the till's three tracks — the same
// frame as Sell, Find, Receive, Customers, Suppliers and On Order (E-05 d29
// by way of E-02 d38, E-07 d17, M-01 d17, M-02 d31). Manager-only in its
// entirety (d2), labelled by convention like every other manager surface;
// nothing here is gated behind real auth, because E-01 is not built.
//
// The middle track is a real TABLE rather than On Order's row grid: six money
// columns that have to line up is what this screen is for, and forcing .lrow
// onto it would be symmetry bought at the cost of the job.
//
// d27 is the rule the whole screen turns on. There are no modes: the Manager
// ticks whatever they are settling, credits attach to the debits beside them,
// placeholders retire contributing nothing, and money covers the shortfall.
// A selection holding no debit is a clearing (d15) — the same act, arriving at
// the case where there is nothing for the credit to attach to.

interface SettleForm {
  method: PaymentMethod;
  reference: string;
  date: string;
  credit: Record<string, string>;
  money: Record<string, string>;
}

const SLAB_KEY = "waxworks.payable.slab";

export function AccountsPayable() {
  const app = useApp();
  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [scope, setScope] = useState<string>("");
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<PayableChip>("all");
  const [sort, setSort] = useState<PayableSort>("name");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const saveSlab = (open: boolean) => {
    setSlabOpen(open);
    writeStored(SLAB_KEY, open);
  };

  const data = {
    invoices: app.invoices,
    payableEntries: app.payableEntries,
    claims: app.claims,
    paymentBatches: app.paymentBatches,
    batchVoids: app.batchVoids,
    claimVoids: app.claimVoids,
  };

  const balanceOf = (id: string) => supplierBalance(id, data);

  // Only a Supplier with any payables activity belongs in the shortlist; the
  // lookup reaches any Supplier regardless, which is step 1's requirement and
  // the only way to start a Create new against one you have never owed.
  const active = useMemo(
    () =>
      app.suppliers.filter(
        (s) =>
          app.invoices.some((iv) => iv.supplierId === s.id && iv.status !== "Draft") ||
          app.claims.some((c) => c.supplierId === s.id) ||
          app.payableEntries.some((e) => e.supplierId === s.id) ||
          app.paymentBatches.some((b) => b.supplierId === s.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.suppliers, app.invoices, app.claims, app.payableEntries, app.paymentBatches],
  );

  const selId = scope || active[0]?.id || app.suppliers[0]?.id || "";
  const supplier = app.suppliers.find((s) => s.id === selId);
  const isCards = scope === "cards";

  const rows = useMemo(
    () => (supplier && !isCards ? ledgerRows(supplier.id, data, app.suppliers) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supplier?.id, isCards, app.invoices, app.payableEntries, app.claims, app.paymentBatches, app.batchVoids],
  );

  const selectedRows = rows.filter((r) => sel[r.key]);
  const plan = settlementPlan(selectedRows);
  // d34 — what the Invoices expected, which the Manager may override. What the
  // batch RECORDS is what actually happened, never this.
  const expectedMethod = suggestedMethod(plan);

  // A settlement starts fresh each time the selection changes: d34 pre-fills
  // the method from what was ticked, and any typed money override belongs to
  // the selection it was typed against, not to the screen.
  const selKey = Object.keys(sel).sort().join(",");
  useEffect(() => {
    setForm((f) => ({ ...f, method: expectedMethod ?? "Cheque", credit: {}, money: {} }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, expectedMethod]);

  const pick = (row: LedgerRow) => {
    if (row.band === "settled") return;
    setCreating(false);
    setSel((prev) => {
      const next = { ...prev };
      if (next[row.key]) delete next[row.key];
      else next[row.key] = true;
      return next;
    });
  };

  const goSupplier = (id: string) => {
    setScope(id);
    setSel({});
    setCreating(false);
    setOpenBatch(null);
  };

  const net = supplier && !isCards ? balanceOf(supplier.id) : 0;
  const counted = rows.filter((r) => r.band === "counted");
  const uncounted = rows.filter((r) => r.band === "uncounted");
  const settled = rows.filter((r) => r.band === "settled");
  const overdue = counted.filter((r) => r.overdueBy != null && r.overdueBy > 0 && r.balance > 0.005);

  const giftTotal = round2(app.giftCards.reduce((n, g) => n + g.balance, 0));

  const doSettle = () => {
    if (!supplier) return;
    const auto = autoPlacement(plan);
    app.settlePayables(
      {
        supplierId: supplier.id,
        method: form.method,
        reference: form.reference.trim(),
        date: form.date,
        debits: plan.debits.map((d) => ({
          kind: d.kind === "invoice" ? ("invoice" as const) : ("entry" as const),
          id: d.id,
          credit: creditOn(form, d.key, auto),
          money: moneyOn(form, d.key, d.balance, auto),
        })),
        credits: plan.credits.map((c) => ({ id: c.creditId!, amount: -c.balance, label: c.reference })),
        placeholderIds: plan.holds.map((h) => h.id),
      },
      CURRENT_USER,
    );
    const closed = plan.debits.filter((d) => d.balance <= round2(creditOn(form, d.key, auto) + moneyOn(form, d.key, d.balance, auto)) + 0.005).length;
    setMsg(
      `${money(plan.debitTotal)} settled as one batch — ${money(plan.attach)} credit, ${money(plan.money)} money` +
        (closed ? `, ${closed} now paid in full` : "") +
        (plan.remainder > 0.005
          ? `. ${money(plan.remainder)} of credit had nowhere to attach and came back as a remainder Credit (d25).`
          : "."),
    );
    setSel({});
  };

  const doClear = () => {
    const before = supplier ? balanceOf(supplier.id) : 0;
    app.clearPayableEntries(
      selectedRows.filter((r) => r.kind === "entry").map((r) => r.id),
      CURRENT_USER,
    );
    const after = supplier ? balanceOf(supplier.id) : 0;
    setMsg(
      `${selectedRows.length} retired against each other. Balance unchanged at ${money(before)} — a credit already counted and stays counted (d15, d27)${
        Math.abs(before - after) > 0.005 ? " — BUG" : ""
      }.`,
    );
    setSel({});
  };

  const doVoid = (batchId: string) => {
    if (!supplier) return;
    const before = balanceOf(supplier.id);
    app.voidPaymentBatch(batchId, CURRENT_USER);
    setMsg(
      `Settlement voided. Balance was ${money(before)} — nothing was deleted; where it emitted a remainder, a reversing Adjustment was appended beside it (d30).`,
    );
    setOpenBatch(null);
  };

  const [form, setForm] = useState<SettleForm>({
    method: "Cheque",
    reference: "",
    date: new Date().toLocaleDateString("en-CA"),
    credit: {} as Record<string, string>,
    money: {} as Record<string, string>,
  });

  return (
    <div className={"ap-frame" + (slabOpen ? "" : " slab-shut")}>
      <PayableSlab
        open={slabOpen}
        onOpenChange={saveSlab}
        suppliers={app.suppliers}
        active={active}
        balanceOf={balanceOf}
        data={data}
        query={query}
        onQueryChange={setQuery}
        chip={chip}
        onChipChange={setChip}
        sort={sort}
        onSortChange={setSort}
        scope={isCards ? "cards" : selId}
        onScope={goSupplier}
        onCards={() => {
          setScope("cards");
          setSel({});
          setCreating(false);
        }}
        giftTotal={giftTotal}
        giftLive={app.giftCards.filter((g) => g.balance > 0).length}
        onCreateNew={() => {
          setSel({});
          setCreating(true);
        }}
      />

      <section className="ap-main">
        <div className="ap-main-head">
          <div style={{ minWidth: 0 }}>
            <h2>{isCards ? "Gift card liability" : supplier?.name ?? "—"}</h2>
            <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
              {isCards ? (
                <>
                  <span className="badge ink">{money(giftTotal)} outstanding</span>
                  <span className="badge">owed to customers</span>
                </>
              ) : (
                <>
                  <span className={"badge " + (net > 0.005 ? "ink" : net < -0.005 ? "ok" : "")}>
                    {money(net)} {net > 0.005 ? "owed" : net < -0.005 ? "in our favour" : "— settled"}
                  </span>
                  <span className="badge mono">{supplier?.shortName}</span>
                  {supplier?.paymentTerms && <span className="badge">{supplier.paymentTerms}</span>}
                  {overdue.length > 0 && <span className="badge danger">{overdue.length} past due</span>}
                  {supplier && supplier.currency !== "CAD" && <span className="badge warn">{supplier.currency}</span>}
                  {selectedRows.length > 0 && <span className="badge accent">{selectedRows.length} selected</span>}
                </>
              )}
            </div>
          </div>
          <div className="ap-head-acts">
            {selectedRows.length > 0 ? (
              <button className="btn sm" onClick={() => setSel({})}>
                Clear selection
              </button>
            ) : (
              !isCards && (
                <button className="btn sm" onClick={() => setCreating(true)}>
                  ＋ Create new
                </button>
              )
            )}
          </div>
        </div>

        {msg && (
          <div className="callout ok" style={{ margin: "var(--sp-3) var(--sp-4) 0" }}>
            {msg}
          </div>
        )}

        <div className="ap-list">
          {isCards ? (
            <GiftRegistry />
          ) : rows.length === 0 ? (
            <div className="slab-empty" style={{ paddingTop: "var(--sp-6)" }}>
              Nothing outstanding for {supplier?.name}. Use <strong>Create new</strong> to log an Invoice, Claim,
              Credit, Adjustment or Consignment by hand (d12).
            </div>
          ) : (
            <>
              <Band
                label="Counted — this is the balance"
                say="These rows sum to the figure on the right."
                total={round2(counted.reduce((n, r) => n + r.balance, 0))}
                rows={counted}
                sel={sel}
                onPick={pick}
                onOpenReceiving={(r) => setMsg(receivingMsg(r))}
              />
              {uncounted.length > 0 && (
                <Band
                  label="Not counted until cleared"
                  say="A Claim placeholder moves nothing until it is cleared against a matching Credit (d14)."
                  total={round2(uncounted.reduce((n, r) => n + r.face, 0))}
                  rows={uncounted}
                  sel={sel}
                  onPick={pick}
                  onOpenReceiving={(r) => setMsg(receivingMsg(r))}
                  tone="uncounted"
                />
              )}
              {settled.length > 0 && (
                <>
                  <div className="ap-grp settled">
                    <span className="lab">Settled — paid in full</span>
                    <span className="say">
                      Off the outstanding list (step 5), still readable, and naming what settled it (d21).
                    </span>
                    <button className="btn sm" onClick={() => setShowSettled((v) => !v)}>
                      {showSettled ? "Hide" : "Show"} {settled.length}
                    </button>
                  </div>
                  {showSettled && (
                    <LedgerTable
                      rows={settled}
                      sel={sel}
                      onPick={pick}
                      onOpenReceiving={(r) => setMsg(receivingMsg(r))}
                      batchesFor={(r) =>
                        app.paymentBatches.filter(
                          (b) =>
                            !app.batchVoids.some((v) => v.batchId === b.id) &&
                            b.targets.some((t) => t.kind === r.kind && t.id === r.id),
                        )
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>

      <SettleTrack
        supplier={supplier}
        isCards={isCards}
        giftTotal={giftTotal}
        net={net}
        rows={rows}
        plan={plan}
        creating={creating}
        form={form}
        expectedMethod={expectedMethod}
        onForm={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onCancelCreate={() => setCreating(false)}
        onCreate={(input) => {
          if (!supplier) return;
          app.addPayableEntry({ ...input, supplierId: supplier.id });
          setCreating(false);
          setMsg(
            `${input.type} of ${money(round2(input.subtotal + input.tax + input.freight + input.misc))} added` +
              (input.type === "Claim" ? " — not counted until cleared (d14)." : "."),
          );
        }}
        onSettle={doSettle}
        onClear={doClear}
        onCancelSelection={() => setSel({})}
        onCreateNew={() => {
          setSel({});
          setCreating(true);
        }}
        batches={app.paymentBatches.filter((b) => b.supplierId === selId)}
        voids={app.batchVoids}
        openBatch={openBatch}
        onOpenBatch={(id) => setOpenBatch((cur) => (cur === id ? null : id))}
        onVoid={doVoid}
      />
    </div>
  );
}

const receivingMsg = (r: LedgerRow) =>
  r.isPaidInvoice
    ? `Would open /receiving/${r.id} read-only — a paid Invoice is immutable (E-02 d40, A-33). Amendments are E-04.`
    : `Would open /receiving/${r.id} — correctable until it is paid here (E-02 d4, d40, A-41).`;

function Band({
  label,
  say,
  total,
  rows,
  sel,
  onPick,
  onOpenReceiving,
  tone,
}: {
  label: string;
  say: string;
  total: number;
  rows: LedgerRow[];
  sel: Record<string, boolean>;
  onPick: (r: LedgerRow) => void;
  onOpenReceiving: (r: LedgerRow) => void;
  tone?: "uncounted";
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className={"ap-grp" + (tone ? " " + tone : "")}>
        <span className="lab">{label}</span>
        <span className="say">
          {say} <span className="mono" style={{ fontWeight: 700 }}>{money(total)}</span>
        </span>
      </div>
      <LedgerTable rows={rows} sel={sel} onPick={onPick} onOpenReceiving={onOpenReceiving} />
    </>
  );
}

function LedgerTable({
  rows,
  sel,
  onPick,
  onOpenReceiving,
  batchesFor,
}: {
  rows: LedgerRow[];
  sel: Record<string, boolean>;
  onPick: (r: LedgerRow) => void;
  onOpenReceiving: (r: LedgerRow) => void;
  batchesFor?: (r: LedgerRow) => { id: string; date: string; method: string; reference: string }[];
}) {
  return (
    <table className="ap-ledger">
      <thead>
        <tr>
          <th />
          <th>Type</th>
          <th>Reference</th>
          <th>Invoiced</th>
          <th>Due</th>
          <th className="num">Amount</th>
          <th className="num">Paid / netted</th>
          <th className="num">Balance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const shown = r.band === "uncounted" ? r.face : r.balance;
          const over = r.overdueBy != null && r.overdueBy > 0 && r.balance > 0.005;
          const settled = r.band === "settled";
          const batches = batchesFor?.(r) ?? [];
          return (
            <tr
              key={r.key}
              className={
                "ap-row" +
                (sel[r.key] ? " on" : "") +
                (settled ? " settled" : "") +
                (over ? " over" : "") +
                (r.source === "remainder" ? " remainder" : "")
              }
              onClick={() => onPick(r)}
            >
              <td>
                {!settled && (
                  <input type="checkbox" checked={!!sel[r.key]} readOnly aria-label={`Select ${r.type} ${r.reference}`} />
                )}
              </td>
              <td>
                {r.type}
                {r.sub && <span className="sub">{r.sub}</span>}
              </td>
              <td>
                <span className="ref">{r.reference}</span>
                {r.claimed != null && (
                  <span className="sub warn">
                    claimed {money(r.claimed)}, credited {money(r.amount)} — the memo governs (E-04 d20)
                  </span>
                )}
              </td>
              <td>
                <span className="num">{r.termsFrom}</span>
              </td>
              <td>
                {r.terms ? (
                  r.dueDate ? (
                    <>
                      <span className={"due" + (over ? " over" : r.overdueBy != null && r.overdueBy > -7 ? " soon" : "")}>
                        {r.dueDate}
                      </span>
                      <span className="terms">
                        {r.terms} ·{" "}
                        {r.overdueBy! > 0 ? `${r.overdueBy}d over` : r.overdueBy === 0 ? "due today" : `in ${-r.overdueBy!}d`}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={"due" + (over ? " over" : " none")}>{r.terms}</span>
                      {r.overdueBy != null && r.overdueBy > 0 && <span className="terms">{r.overdueBy}d unpaid</span>}
                    </>
                  )
                ) : (
                  <span className="due none">—</span>
                )}
              </td>
              <td className="num">{money(r.amount)}</td>
              <td className="num">{r.netted == null ? "—" : money(r.netted)}</td>
              <td className="num">
                <strong className={shown < -0.005 ? "cr" : Math.abs(shown) <= 0.005 ? "nil" : ""}>{money(shown)}</strong>
              </td>
              <td>
                <span className="st">{r.status}</span>
                {batches.map((b) => (
                  <span className="paid-by" key={b.id}>
                    {b.date} · {b.method} <span className="mono">{b.reference}</span>
                  </span>
                ))}
                {r.canOpenInReceiving && (
                  <button
                    className={"rec-link" + (r.isPaidInvoice ? " locked" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReceiving(r);
                    }}
                  >
                    {r.isPaidInvoice ? "View in Receiving" : "Open in Receiving"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GiftRegistry() {
  const app = useApp();
  return (
    <>
      <div className="ap-grp">
        <span className="lab">The registry</span>
        <span className="say">
          Loading and redeeming happen at the till (E-05) — this is the register, not the mechanism.
        </span>
      </div>
      <table className="ap-ledger">
        <thead>
          <tr>
            <th />
            <th>Code</th>
            <th>Customer</th>
            <th className="num">Balance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {app.giftCards.map((g) => (
            <tr key={g.code} className="ap-row settled">
              <td />
              <td>
                <span className="ref">{g.code}</span>
              </td>
              <td>{app.customerFor(g.customerId)?.name ?? <span className="muted">— not associated</span>}</td>
              <td className="num">{money(g.balance)}</td>
              <td>{g.balance > 0 ? "" : <span className="muted xsmall">not yet loaded</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export type { PayableEntryType };
