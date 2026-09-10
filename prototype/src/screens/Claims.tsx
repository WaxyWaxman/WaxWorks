import { useState } from "react";
import { Modal } from "../components/Modal";
import type { SupplierClaim } from "../data/types";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";

// Supplier Claims — claiming credit from a supplier for stock that arrived
// short, damaged, or not at all. Distinct from a customer Return (E-06),
// which lives at E-05 Point of Sale → + New Return. Specified in E-04
// §"Supplier claims", not a numbered flow of its own, so no flow-id badge here.
export function Claims() {
  const app = useApp();
  const [supplierQuery, setSupplierQuery] = useState("");
  const [sending, setSending] = useState<SupplierClaim | null>(null);
  const [crediting, setCrediting] = useState<SupplierClaim | null>(null);

  const q = supplierQuery.trim().toLowerCase();
  const inScope = q
    ? app.claims.filter((c) => {
        const supplier = app.supplierFor(c.supplierId);
        return supplier && (supplier.name.toLowerCase().includes(q) || supplier.shortName.toLowerCase().includes(q));
      })
    : app.claims;

  const drafts = inScope.filter((c) => c.status === "Draft");
  const pending = inScope.filter((c) => c.status === "Pending");
  const credited = inScope.filter((c) => c.status === "Credited");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Supplier Claims</h1>
          <p className="sub">
            Claiming credit from a supplier for stock that arrived short, damaged, or not at all —
            not a customer return (that's <strong>E-05 Point of Sale → + New Return</strong>).{" "}
            <em>(E-04 §"Supplier claims".)</em> Raise a claim from a titlecard's{" "}
            <strong>Claim vs. supplier</strong> button; it lands here as a Draft to batch and send.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="card-body">
          <input
            type="search"
            value={supplierQuery}
            onChange={(e) => setSupplierQuery(e.target.value)}
            placeholder="Filter by supplier — respects how claims are already batched by supplier + separator"
          />
        </div>
      </div>

      <ClaimSection
        title="Draft — not yet sent"
        empty={q ? `No draft claims match "${supplierQuery}".` : "Nothing drafted. Raise a claim from a Record's titlecard (Claim vs. supplier)."}
        claims={drafts}
        renderAction={(c) => (
          <button className="btn sm primary" onClick={() => setSending(c)}>
            Send claim
          </button>
        )}
      />

      <ClaimSection
        title="Pending — sent, awaiting credit"
        empty={q ? `No pending claims match "${supplierQuery}".` : "No claims currently pending a supplier's response."}
        claims={pending}
        renderAction={(c) => (
          <button className="btn sm" onClick={() => setCrediting(c)}>
            Mark Credited
          </button>
        )}
      />

      <ClaimSection title="Credited" empty={q ? `No credited claims match "${supplierQuery}".` : "No credited claims yet."} claims={credited} />

      {sending && <SendClaimModal claim={sending} onClose={() => setSending(null)} />}
      {crediting && <MarkCreditedModal claim={crediting} onClose={() => setCrediting(null)} />}
    </div>
  );
}

function ClaimSection({
  title,
  empty,
  claims,
  renderAction,
}: {
  title: string;
  empty: string;
  claims: SupplierClaim[];
  renderAction?: (c: SupplierClaim) => React.ReactNode;
}) {
  const app = useApp();
  return (
    <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
      <div className="card-head">{title}</div>
      <div className="card-body stack">
        {claims.length === 0 && <p className="small muted">{empty}</p>}
        {claims.map((c) => {
          const supplier = app.supplierFor(c.supplierId);
          const total = c.lines.reduce((sum, l) => sum + l.cost * l.qty, 0);
          return (
            <div key={c.id} className="card">
              <div className="card-head">
                <span>
                  {c.claimNumber !== undefined ? `Claim #${c.claimNumber}` : "Unsent"} — {supplier?.name ?? "Unknown supplier"}
                  {c.separator && (
                    <span className="badge" style={{ marginLeft: "var(--sp-2)" }}>
                      sep {c.separator}
                    </span>
                  )}
                  {c.creditMemo && (
                    <span className="badge ok" style={{ marginLeft: "var(--sp-2)" }}>
                      credit memo {c.creditMemo}
                    </span>
                  )}
                </span>
                {renderAction && renderAction(c)}
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>Invoice #</th>
                      <th>Reason</th>
                      <th className="num">Cost</th>
                      <th className="num">Qty</th>
                      <th className="num">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((l) => {
                      const rec = app.recordFor(l.recordId);
                      return (
                        <tr key={l.id}>
                          <td>
                            {rec ? `${rec.artist} — ${rec.title}` : l.recordId}
                            {l.note && <div className="xsmall muted">{l.note}</div>}
                          </td>
                          <td className="mono small">{l.invoiceNumber ?? "—"}</td>
                          <td className="small">{l.reason}</td>
                          <td className="num">{money(l.cost)}</td>
                          <td className="num">{l.qty}</td>
                          <td className="num">{money(l.cost * l.qty)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} className="small muted">
                        Total
                      </td>
                      <td className="num">
                        <strong>{money(total)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="card-body xsmall muted stack">
                {c.log.map((e, i) => (
                  <div key={i}>
                    <span className="mono">{e.at}</span> — {e.text}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SendClaimModal({ claim, onClose }: { claim: SupplierClaim; onClose: () => void }) {
  const app = useApp();
  const supplier = app.supplierFor(claim.supplierId);
  const [raw, setRaw] = useState(String(app.nextClaimNumber));
  const num = Number(raw) || 0;
  const taken = app.claims.some((c) => c.claimNumber === num);

  return (
    <Modal
      title={`Send claim — ${supplier?.name ?? "supplier"}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={num < 0 || taken}
            onClick={() => {
              app.sendClaim(claim.id, num);
              onClose();
            }}
          >
            Send claim #{num}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Emails {claim.lines.length} line{claim.lines.length === 1 ? "" : "s"} to{" "}
          <span className="mono">{supplier?.email}</span>, stating invoice #, reason, cost, and
          quantity per line plus a combined total. <em>(E-04 §"Supplier claims".)</em>
        </p>
        <label className="field">
          <span>Claim number — auto-generated, ascending; editable</span>
          <input type="number" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </label>
        {taken && <div className="callout danger">Claim number already in use — pick another.</div>}
      </div>
    </Modal>
  );
}

function MarkCreditedModal({ claim, onClose }: { claim: SupplierClaim; onClose: () => void }) {
  const app = useApp();
  const supplier = app.supplierFor(claim.supplierId);
  const [memo, setMemo] = useState("");
  const ready = memo.trim().length > 0;

  return (
    <Modal
      title={`Mark Credited — Claim #${claim.claimNumber} — ${supplier?.name ?? "supplier"}`}
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
              app.markClaimCredited(claim.id, memo.trim());
              onClose();
            }}
          >
            Mark Credited
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          The supplier's own reference for this credit — needed to reconcile it later against their
          statement or an invoice deduction.
        </p>
        <label className="field">
          <span>Supplier credit memo #</span>
          <input
            type="text"
            autoFocus
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. CM-5521"
          />
        </label>
      </div>
    </Modal>
  );
}
