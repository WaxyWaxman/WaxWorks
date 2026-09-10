import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { CURRENT_USER } from "../data/seed";
import {
  PAYABLE_ENTRY_TYPES,
  PAYMENT_METHODS,
  type PayableEntryType,
  type PayableTargetKind,
  type PaymentMethod,
} from "../data/types";
import { money } from "../lib/money";
import {
  claimTotal,
  invoiceBalance,
  invoicePaidToDate,
  invoiceTotal,
  payableEntryBalance,
  payableEntryContribution,
  payableEntryIsPayable,
  payableEntryPaidToDate,
  payableEntrySignedAmount,
  payableEntryTotal,
  round2,
} from "../lib/totals";
import { useApp } from "../store/AppStore";

const today = () => new Date().toLocaleDateString("en-CA");

interface CombinedRow {
  key: string;
  kind: "invoice" | "claim" | "entry";
  id: string;
  type: string;
  reference: string;
  date: string;
  amount: number; // face value, unsigned
  netted: number | null; // "Paid/netted" column — null renders as "—" (a Pending claim: nothing to net yet)
  balance: number; // signed — negative means a credit in the store's favor
  status: string;
  payable: boolean; // eligible for the Record payment checkbox
  clearable: boolean; // eligible for the Clear checkbox (manual entries only)
}

// M-05 — Manager-only in its entirety (decision 2), labeled by convention
// like every other "(Admin)"/"(Manager)" surface in this prototype; nothing
// here is actually gated behind real auth (E-01 isn't built).
export function AccountsPayable() {
  const app = useApp();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  const balanceForSupplier = (supplierId: string) => {
    const invoiceSum = app.invoices
      .filter((iv) => iv.supplierId === supplierId && iv.status === "Finalized")
      .reduce((sum, iv) => sum + invoiceBalance(iv, app.paymentBatches), 0);
    const entrySum = app.payableEntries
      .filter((e) => e.supplierId === supplierId)
      .reduce((sum, e) => sum + payableEntryContribution(e, app.paymentBatches), 0);
    return round2(invoiceSum + entrySum);
  };

  // Sorted by supplier (decision 1). Only a Supplier with any AP activity at
  // all belongs in this shortlist; the lookup box below reaches any Supplier
  // regardless, so one can always be found to start a Create new against.
  const supplierActivity = useMemo(() => {
    return app.suppliers
      .filter(
        (sup) =>
          app.invoices.some((iv) => iv.supplierId === sup.id) ||
          app.claims.some((c) => c.supplierId === sup.id) ||
          app.payableEntries.some((e) => e.supplierId === sup.id),
      )
      .map((sup) => ({ supplier: sup, balance: balanceForSupplier(sup.id) }))
      .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.suppliers, app.invoices, app.payableEntries, app.paymentBatches]);

  const suppliersOwed = supplierActivity.filter((x) => x.balance > 0.005);
  const suppliersSettled = supplierActivity.filter((x) => x.balance <= 0.005);

  const lookupQuery = supplierQuery.trim().toLowerCase();
  const lookupResults = lookupQuery
    ? app.suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(lookupQuery) ||
          s.shortName.toLowerCase().includes(lookupQuery) ||
          (s.accountNumber ?? "").toLowerCase().includes(lookupQuery),
      )
    : [];

  const selId = selectedSupplierId ?? suppliersOwed[0]?.supplier.id ?? suppliersSettled[0]?.supplier.id ?? null;
  const sel = app.suppliers.find((s) => s.id === selId) ?? null;

  const selectSupplier = (id: string) => {
    setSelectedSupplierId(id);
    setSelectedKeys(new Set());
    setSupplierQuery("");
  };

  const combinedRows: CombinedRow[] = useMemo(() => {
    if (!sel) return [];
    const rows: CombinedRow[] = [];

    for (const iv of app.invoices.filter((iv) => iv.supplierId === sel.id && iv.status === "Finalized")) {
      const balance = invoiceBalance(iv, app.paymentBatches);
      rows.push({
        key: `invoice:${iv.id}`,
        kind: "invoice",
        id: iv.id,
        type: sel.consignment ? "Consignment" : "Invoice",
        reference: iv.invoiceNumber,
        date: iv.receivedDate,
        amount: invoiceTotal(iv),
        netted: invoicePaidToDate(iv, app.paymentBatches),
        balance,
        status: iv.status,
        payable: balance > 0.005,
        clearable: false,
      });
    }

    for (const c of app.claims.filter(
      (c) => c.supplierId === sel.id && (c.status === "Pending" || (c.status === "Credited" && !c.applied)),
    )) {
      const amount = claimTotal(c);
      rows.push({
        key: `claim:${c.id}`,
        kind: "claim",
        id: c.id,
        type: c.status === "Credited" ? "Credit" : "Claim",
        reference: c.claimNumber !== undefined ? `#${c.claimNumber}` : "Unsent",
        date: c.createdAt.slice(0, 10),
        amount,
        netted: null,
        balance: c.status === "Credited" ? -amount : 0,
        status: c.status,
        payable: false,
        clearable: false,
      });
    }

    for (const e of app.payableEntries.filter((e) => e.supplierId === sel.id && !e.clearedAt)) {
      const payable = payableEntryIsPayable(e);
      const balance = payable ? payableEntryBalance(e, app.paymentBatches) : payableEntrySignedAmount(e);
      if (payable && balance <= 0.005) continue; // fully paid off — its PaymentBatch still shows it in history
      rows.push({
        key: `entry:${e.id}`,
        kind: "entry",
        id: e.id,
        type: e.type,
        reference: e.reference || "—",
        date: e.date,
        amount: payableEntryTotal(e),
        netted: payable ? payableEntryPaidToDate(e, app.paymentBatches) : null,
        balance,
        status: payable ? "Open" : e.type === "Claim" ? "Open" : "Applied",
        payable: payable && balance > 0.005,
        clearable: true,
      });
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [sel, app.invoices, app.claims, app.payableEntries, app.paymentBatches]);

  const netBalance = sel ? balanceForSupplier(sel.id) : 0;

  const toggleKey = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedRows = combinedRows.filter((r) => selectedKeys.has(r.key));
  const payableSelected = selectedRows.filter((r) => r.payable);
  const clearCandidate =
    selectedRows.length >= 2 &&
    selectedRows.every((r) => r.kind === "entry") &&
    Math.abs(round2(selectedRows.reduce((sum, r) => sum + r.balance, 0))) <= 0.005;

  const paymentBatchesForSupplier = sel
    ? [...app.paymentBatches.filter((b) => b.supplierId === sel.id)].sort((a, b) =>
        (b.createdAt || b.date).localeCompare(a.createdAt || a.date),
      )
    : [];

  const giftCardTotal = round2(app.giftCards.reduce((sum, g) => sum + g.balance, 0));

  const targetLabel = (t: { kind: PayableTargetKind; id: string }): string => {
    if (t.kind === "invoice") {
      const iv = app.invoiceFor(t.id);
      return iv ? `Invoice ${iv.invoiceNumber}` : "Invoice (removed)";
    }
    const e = app.payableEntryFor(t.id);
    return e ? `${e.type} — ${e.reference || "no reference"}` : "Entry (removed)";
  };

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">M-05</span>
        <div>
          <h1>Accounts payable</h1>
          <p className="sub">
            What the store owes, and settling it — outstanding Invoices, Pending/Credited Supplier
            Claims, and manual ledger entries shown together per supplier, since what's owed is
            the net of all of it (decision 3). A Credited claim's credit nets against the
            supplier's whole balance, not one Invoice picked by hand (decision 11). Manager-only,
            in its entirety (decision 2).
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">Suppliers</div>
          <div className="card-body" style={{ paddingBottom: 0 }}>
            <input
              type="text"
              value={supplierQuery}
              onChange={(e) => setSupplierQuery(e.target.value)}
              placeholder="Look up any supplier — name, short code, or account #…"
            />
          </div>

          {lookupQuery ? (
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data">
                <tbody>
                  {lookupResults.map((s) => (
                    <tr
                      key={s.id}
                      style={{ cursor: "pointer" }}
                      className={s.id === selId ? "selected" : ""}
                      onClick={() => selectSupplier(s.id)}
                    >
                      <td>
                        <strong>{s.name}</strong>
                        <div className="xsmall muted">{s.shortName}</div>
                      </td>
                      <td className="num">{money(balanceForSupplier(s.id))}</td>
                    </tr>
                  ))}
                  {lookupResults.length === 0 && (
                    <tr>
                      <td className="small muted">No supplier matches "{supplierQuery}".</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data">
                  <tbody>
                    {suppliersOwed.map(({ supplier, balance }) => (
                      <tr
                        key={supplier.id}
                        style={{ cursor: "pointer" }}
                        className={supplier.id === selId ? "selected" : ""}
                        onClick={() => selectSupplier(supplier.id)}
                      >
                        <td>
                          <strong>{supplier.name}</strong>
                          <div className="xsmall muted">
                            {supplier.shortName}
                            {supplier.currency !== "CAD" && ` · ${supplier.currency}`}
                          </div>
                        </td>
                        <td className="num">{money(balance)}</td>
                      </tr>
                    ))}
                    {suppliersOwed.length === 0 && (
                      <tr>
                        <td className="small muted">
                          Nothing outstanding. Look up a supplier above, or finalize an Invoice in
                          Receiving.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {suppliersSettled.length > 0 && (
                <>
                  <div className="card-head">Settled — no balance owing</div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="data">
                      <tbody>
                        {suppliersSettled.map(({ supplier }) => (
                          <tr
                            key={supplier.id}
                            style={{ cursor: "pointer" }}
                            className={supplier.id === selId ? "selected" : ""}
                            onClick={() => selectSupplier(supplier.id)}
                          >
                            <td className="muted">
                              {supplier.name}
                              <div className="xsmall muted">{supplier.shortName}</div>
                            </td>
                            <td className="num muted">$0.00</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {sel && (
          <div className="card">
            <div className="card-head">
              {sel.name}
              <div className="btn-row">
                <span className="badge">{money(netBalance)} owed</span>
                <button className="btn sm" onClick={() => setCreating(true)}>
                  + Create new
                </button>
              </div>
            </div>
            <div className="card-body stack">
              {sel.currency !== "CAD" && (
                <p className="xsmall muted">
                  Invoiced in {sel.currency} — no store-currency equivalent shown; the configured
                  exchange rate this depends on isn't modeled (M-06 isn't built).
                </p>
              )}
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                    <th className="num">Paid/netted</th>
                    <th className="num">Balance</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {combinedRows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        {(r.payable || r.clearable) && (
                          <input type="checkbox" checked={selectedKeys.has(r.key)} onChange={() => toggleKey(r.key)} />
                        )}
                      </td>
                      <td className="small">{r.type}</td>
                      <td className="mono small">{r.reference}</td>
                      <td className="small">{r.date}</td>
                      <td className="num">{money(r.amount)}</td>
                      <td className="num">{r.netted != null ? money(r.netted) : "—"}</td>
                      <td className="num">
                        <strong>{money(r.balance)}</strong>
                      </td>
                      <td className="small">{r.status}</td>
                      <td>
                        {r.kind === "claim" && r.type === "Credit" && (
                          <button
                            className="btn sm"
                            disabled={!combinedRows.some((x) => x.kind === "invoice")}
                            title={
                              combinedRows.some((x) => x.kind === "invoice")
                                ? `Nets against ${sel.name}'s whole balance — oldest Invoice first`
                                : `No outstanding Invoice for ${sel.name} to apply it against yet`
                            }
                            onClick={() => app.applyClaimCredit(r.id, CURRENT_USER)}
                          >
                            Apply credit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {combinedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="small muted">
                        Nothing outstanding for {sel.name}. Use Create new to log an Invoice,
                        Claim, Credit, Adjustment, or Consignment by hand.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="row" style={{ gap: "var(--sp-2)" }}>
                <button className="btn primary" disabled={payableSelected.length === 0} onClick={() => setPaying(true)}>
                  Record payment{payableSelected.length > 0 ? ` (${payableSelected.length})` : ""}
                </button>
                <button
                  className="btn"
                  disabled={!clearCandidate}
                  onClick={() => setClearing(true)}
                  title="Select 2+ ledger entries whose amounts sum to zero"
                >
                  Clear selected{selectedRows.length > 0 ? ` (${selectedRows.length})` : ""}
                </button>
              </div>

              <div className="card">
                <div className="card-head">Payment history</div>
                <div className="card-body stack">
                  {paymentBatchesForSupplier.length === 0 && (
                    <p className="small muted">No payments recorded yet for {sel.name}.</p>
                  )}
                  {paymentBatchesForSupplier.map((b) => {
                    const total = round2(b.targets.reduce((sum, t) => sum + t.amount, 0));
                    const open = expandedBatchId === b.id;
                    return (
                      <div key={b.id} className="card">
                        <div
                          className="card-head"
                          style={{ cursor: "pointer" }}
                          onClick={() => setExpandedBatchId(open ? null : b.id)}
                        >
                          <span>
                            {b.date} — {b.method} {b.reference}
                          </span>
                          <span className="badge ok">{money(total)}</span>
                        </div>
                        {open && (
                          <div className="card-body xsmall muted stack">
                            <div>Recorded by {b.recordedBy}</div>
                            {b.targets.map((t, i) => (
                              <div key={i}>
                                {targetLabel(t)} — {money(t.amount)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "var(--sp-4)" }}>
        <div className="card-head">
          Gift card liability
          <span className="badge">{money(giftCardTotal)} outstanding</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <p className="small muted" style={{ padding: "var(--sp-3)" }}>
            Money owed to customers, registered here rather than buried in settings. Loading and
            redeeming happen at the till (E-05) — this is the register, not the mechanism. Issue
            date and last-used date aren't modeled by this prototype's GiftCard record yet.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {app.giftCards.map((g) => (
                <tr key={g.code}>
                  <td className="mono small">{g.code}</td>
                  <td className="small">{app.customerFor(g.customerId)?.name ?? "—"}</td>
                  <td className="num">{money(g.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {paying && sel && (
        <RecordPaymentModal
          supplierId={sel.id}
          supplierName={sel.name}
          targets={payableSelected.map((r) => ({
            kind: r.kind as PayableTargetKind,
            id: r.id,
            label: `${r.type} ${r.reference}`,
            balance: r.balance,
          }))}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            setSelectedKeys(new Set());
          }}
        />
      )}
      {clearing && sel && (
        <ClearEntriesModal
          supplierName={sel.name}
          rows={selectedRows}
          onClose={() => setClearing(false)}
          onDone={() => {
            setClearing(false);
            setSelectedKeys(new Set());
          }}
        />
      )}
      {creating && sel && (
        <CreatePayableEntryModal
          supplierId={sel.id}
          supplierName={sel.name}
          supplierConsignment={!!sel.consignment}
          onClose={() => setCreating(false)}
          onDone={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function RecordPaymentModal({
  supplierId,
  supplierName,
  targets,
  onClose,
  onDone,
}: {
  supplierId: string;
  supplierName: string;
  targets: { kind: PayableTargetKind; id: string; label: string; balance: number }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const app = useApp();
  const [method, setMethod] = useState<PaymentMethod>("Cheque");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(today());
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(targets.map((t) => [t.id, t.balance.toFixed(2)])),
  );

  const setAmount = (id: string, v: string) => setAmounts((prev) => ({ ...prev, [id]: v }));
  const total = targets.reduce((sum, t) => sum + (Number(amounts[t.id]) || 0), 0);
  const ready = reference.trim().length > 0 && total > 0;

  return (
    <Modal
      title={`Record payment — ${supplierName}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!ready}
            onClick={() => {
              app.recordPayment(
                targets.map((t) => ({ kind: t.kind, id: t.id })),
                {
                  supplierId,
                  method,
                  reference: reference.trim(),
                  date,
                  amounts: Object.fromEntries(targets.map((t) => [t.id, Number(amounts[t.id]) || 0])),
                },
                CURRENT_USER,
              );
              onDone();
            }}
          >
            Record {money(round2(total))}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          One payment, whatever mix of Invoices and ledger entries it covers — recorded as a
          single batch you can reopen later to see exactly what it paid (decision 5).
        </p>
        <div className="grid cols-2">
          <label className="field">
            <span>Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reference</span>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Cheque 101"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Target</th>
              <th className="num">Balance</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <td className="small">{t.label}</td>
                <td className="num small">{money(t.balance)}</td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    max={t.balance}
                    step="0.01"
                    style={{ width: "6rem" }}
                    value={amounts[t.id] ?? ""}
                    onChange={(e) => setAmount(t.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="small muted">
                Total
              </td>
              <td className="num">
                <strong>{money(round2(total))}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

function ClearEntriesModal({
  supplierName,
  rows,
  onClose,
  onDone,
}: {
  supplierName: string;
  rows: CombinedRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const app = useApp();
  const net = round2(rows.reduce((sum, r) => sum + r.balance, 0));

  return (
    <Modal
      title={`Clear entries — ${supplierName}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              app.clearPayableEntries(
                rows.map((r) => r.id),
                CURRENT_USER,
              );
              onDone();
            }}
          >
            Clear these {rows.length} entries
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          These net to {money(net)} — marking them Cleared against each other settles them
          administratively, without any money moving or any Invoice balance changing. Both stay in
          the ledger as history.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Type</th>
              <th>Reference</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="small">{r.type}</td>
                <td className="mono small">{r.reference}</td>
                <td className="num">{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function CreatePayableEntryModal({
  supplierId,
  supplierName,
  supplierConsignment,
  onClose,
  onDone,
}: {
  supplierId: string;
  supplierName: string;
  supplierConsignment: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const app = useApp();
  const [type, setType] = useState<PayableEntryType>(supplierConsignment ? "Consignment" : "Invoice");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(today());
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("0");
  const [freight, setFreight] = useState("0");
  const [misc, setMisc] = useState("0");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");

  const nums = {
    subtotal: Number(subtotal) || 0,
    tax: Number(tax) || 0,
    freight: Number(freight) || 0,
    misc: Number(misc) || 0,
  };
  const total = round2(nums.subtotal + nums.tax + nums.freight + nums.misc);
  const ready = total > 0;

  const signPreview =
    type === "Credit" ? -total : type === "Claim" ? 0 : type === "Adjustment" ? (direction === "decrease" ? -total : total) : total;

  return (
    <Modal
      title={`Create new — ${supplierName}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!ready}
            onClick={() => {
              app.addPayableEntry({
                supplierId,
                type,
                reference: reference.trim(),
                date,
                subtotal: nums.subtotal,
                tax: nums.tax,
                freight: nums.freight,
                misc: nums.misc,
                adjustmentDirection: type === "Adjustment" ? direction : undefined,
              });
              onDone();
            }}
          >
            Add {type}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Not sourced from Receiving or Supplier Claims, and not tied to any InventoryItem — the
          total is just recorded as owed; the stock (or claim, or credit) behind it is treated as
          inventory unlinked to items for now.
        </p>
        <div className="grid cols-2">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as PayableEntryType)}>
              {PAYABLE_ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {type === "Adjustment" && (
            <label className="field">
              <span>Direction</span>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}>
                <option value="increase">Increases what's owed</option>
                <option value="decrease">Decreases what's owed</option>
              </select>
            </label>
          )}
          <label className="field" style={{ gridColumn: type === "Adjustment" ? undefined : "1 / -1" }}>
            <span>Reference — a bill #, memo #, or note</span>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
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
        <div className="callout">
          Total {money(total)} —{" "}
          {type === "Claim"
            ? "informational only, doesn't affect the balance until Cleared against a matching Credit"
            : `${signPreview < 0 ? "reduces" : "increases"} what's owed by ${money(Math.abs(signPreview))}`}
          .
        </div>
      </div>
    </Modal>
  );
}
