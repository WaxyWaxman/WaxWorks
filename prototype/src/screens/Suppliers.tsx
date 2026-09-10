import { useState } from "react";
import { Modal } from "../components/Modal";
import type { Supplier, SupplierMinBasis, SupplierOrderVia, SupplierType } from "../data/types";
import { useApp } from "../store/AppStore";

const ORDER_VIA: SupplierOrderVia[] = ["Phone", "Email", "FTP", "Their Website", "Fax", "Rep"];
const MIN_BASIS: SupplierMinBasis[] = ["Retail", "Net"];
const TYPES: SupplierType[] = ["Used", "Bargain", "New"];

const blankSupplier: Omit<Supplier, "id" | "log"> = {
  shortName: "",
  name: "",
  accountNumber: "",
  orderVia: "Email",
  minOrderQty: 0,
  minOrderAmount: 0,
  minOrderAmountBasis: "Net",
  discountPct: 0,
  cancelByDays: undefined,
  currency: "CAD",
  type: "New",
  notes: "",
  email: "",
  backordersAllowed: false,
  repName: "",
  repPhone: "",
  mainPhone: "",
  consignment: false,
};

// M-01 — nothing here is gated; New/Edit/Copy are open to any Employee.
// Delete and Merge are Admin-only by label, not by an enforced check yet.
export function Suppliers() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const q = query.trim().toLowerCase();
  const results = q
    ? app.suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.shortName.toLowerCase().includes(q) ||
          (s.accountNumber ?? "").toLowerCase().includes(q),
      )
    : app.suppliers;

  const selId = app.lastViewedSupplierId ?? app.suppliers[0]?.id ?? null;
  const sel = app.suppliers.find((s) => s.id === selId) ?? null;

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">M-01</span>
        <div>
          <h1>Suppliers</h1>
          <p className="sub">
            Every Supplier a shipment, a second-hand walk-in, or a future order can be received
            against. Opens on the most recently searched card.
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            All suppliers
            <button className="btn sm" onClick={() => setEditing("new")}>
              + New
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, short code, or account #…"
              />
            </div>
            <table className="data">
              <tbody>
                {results.map((s) => (
                  <tr
                    key={s.id}
                    style={{ cursor: "pointer" }}
                    className={s.id === selId ? "selected" : ""}
                    onClick={() => app.viewSupplier(s.id)}
                  >
                    <td>
                      <strong>{s.name}</strong>
                      <div className="xsmall muted">
                        {s.shortName} · {s.type} · {s.email}
                      </div>
                    </td>
                    <td className="small">
                      {s.defaultForSecondHand && <span className="badge ok">2nd-hand default</span>}
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td className="small muted">No suppliers match "{query}".</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {sel && (
          <div className="card">
            <div className="card-head">
              {sel.name}
              <div className="btn-row">
                <button className="btn sm" onClick={() => setEditing(sel)}>
                  Edit
                </button>
                <button className="btn sm" onClick={() => app.copySupplier(sel.id)}>
                  Copy
                </button>
                <button
                  className="btn sm"
                  disabled={!!sel.defaultForSecondHand}
                  onClick={() => app.setDefaultForSecondHand(sel.id)}
                  title="Pre-selects this Supplier when Second-hand intake is chosen at Receiving"
                >
                  Make 2nd-hand default
                </button>
                <button className="btn sm" onClick={() => setMerging(true)} title="Admin">
                  Merge (Admin)
                </button>
                <button className="btn sm danger" onClick={() => setDeleting(true)} title="Admin">
                  Delete (Admin)
                </button>
              </div>
            </div>
            <div className="card-body stack">
              <table className="data">
                <tbody>
                  <Row k="Short name" v={sel.shortName} />
                  <Row k="Account #" v={sel.accountNumber || "—"} />
                  <Row k="Order via" v={sel.orderVia} />
                  <Row
                    k="Minimum to place order"
                    v={
                      sel.minOrderQty > 0
                        ? `${sel.minOrderQty} units`
                        : `${money(sel.minOrderAmount)} (${sel.minOrderAmountBasis})`
                    }
                  />
                  <Row k="Discount — also drives suggested retail at receiving" v={`${sel.discountPct}%`} />
                  <Row k="Cancel-by" v={sel.cancelByDays != null ? `${sel.cancelByDays} days` : "Not supported"} />
                  <Row k="Currency" v={sel.currency} />
                  <Row k="Type" v={sel.type} />
                  <Row k="Backorders allowed" v={sel.backordersAllowed ? "Yes" : "No"} />
                  <Row
                    k="Consignment — default Invoice type in Accounts Payable"
                    v={sel.consignment ? "Yes" : "No"}
                  />
                  <Row k="Email" v={sel.email} />
                  <Row k="Rep" v={[sel.repName, sel.repPhone].filter(Boolean).join(" · ") || "—"} />
                  <Row k="Main phone" v={sel.mainPhone || "—"} />
                  <Row k="Notes" v={sel.notes || "—"} />
                </tbody>
              </table>

              <div className="card">
                <div className="card-head">Log</div>
                <div className="card-body xsmall muted stack">
                  {sel.log.map((e, i) => (
                    <div key={i}>
                      <span className="mono">{e.at}</span> — {e.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <SupplierFormModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(id) => {
            app.viewSupplier(id);
            setEditing(null);
          }}
        />
      )}
      {merging && sel && (
        <MergeModal
          supplier={sel}
          onClose={() => setMerging(false)}
          onDone={(keepId) => {
            app.viewSupplier(keepId);
            setMerging(false);
          }}
        />
      )}
      {deleting && sel && (
        <Modal
          title="Delete supplier (Admin)"
          onClose={() => setDeleting(false)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setDeleting(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  app.deleteSupplier(sel.id);
                  setDeleting(false);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <div className="callout danger">
            Deletes {sel.name} outright. Historical orders and InventoryItems that point to it keep
            pointing to a now-missing Supplier — use Merge instead if this Supplier has history
            worth keeping attached to another record.
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="muted">{k}</td>
      <td>{v}</td>
    </tr>
  );
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function SupplierFormModal({
  initial,
  onClose,
  onDone,
}: {
  initial: Supplier | null;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const app = useApp();
  const [f, setF] = useState<Omit<Supplier, "id" | "log">>(initial ?? blankSupplier);
  const set = <K extends keyof Omit<Supplier, "id" | "log">>(k: K, v: Omit<Supplier, "id" | "log">[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));
  const canSubmit = f.shortName.trim() && f.name.trim();

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : "New supplier"}
      wide
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!canSubmit}
            onClick={() => {
              const clean = { ...f, shortName: f.shortName.trim(), name: f.name.trim() };
              if (initial) {
                app.updateSupplier(initial.id, clean);
                onDone(initial.id);
              } else {
                onDone(app.addSupplier(clean));
              }
            }}
          >
            {initial ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <div className="grid cols-2">
        <label className="field">
          <span>Short name (4-letter code)</span>
          <input type="text" maxLength={4} value={f.shortName} onChange={(e) => set("shortName", e.target.value.toUpperCase())} autoFocus />
        </label>
        <label className="field">
          <span>Full name</span>
          <input type="text" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="field">
          <span>Account #</span>
          <input type="text" value={f.accountNumber ?? ""} onChange={(e) => set("accountNumber", e.target.value)} />
        </label>
        <label className="field">
          <span>Order via</span>
          <select value={f.orderVia} onChange={(e) => set("orderVia", e.target.value as SupplierOrderVia)}>
            {ORDER_VIA.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Minimum order qty (0 = use amount instead)</span>
          <input type="number" min={0} value={f.minOrderQty} onChange={(e) => set("minOrderQty", Number(e.target.value) || 0)} />
        </label>
        <div className="row" style={{ gap: "var(--sp-2)" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Minimum order amount</span>
            <input type="number" min={0} step="0.01" value={f.minOrderAmount} onChange={(e) => set("minOrderAmount", Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span>Basis</span>
            <select value={f.minOrderAmountBasis} onChange={(e) => set("minOrderAmountBasis", e.target.value as SupplierMinBasis)}>
              {MIN_BASIS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Discount off retail (%) — also drives suggested retail at receiving</span>
          <input type="number" min={0} max={100} value={f.discountPct} onChange={(e) => set("discountPct", Number(e.target.value) || 0)} />
        </label>
        <label className="field">
          <span>Cancel-by (days, blank = not supported)</span>
          <input
            type="number"
            min={0}
            value={f.cancelByDays ?? ""}
            onChange={(e) => set("cancelByDays", e.target.value === "" ? undefined : Number(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <input type="text" value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={f.type} onChange={(e) => set("type", e.target.value as SupplierType)}>
            {TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ alignItems: "center" }}>
          <input type="checkbox" checked={f.backordersAllowed} onChange={(e) => set("backordersAllowed", e.target.checked)} />
          <span>Backorders allowed</span>
        </label>
        <label className="row" style={{ alignItems: "center" }}>
          <input type="checkbox" checked={!!f.consignment} onChange={(e) => set("consignment", e.target.checked)} />
          <span>Consignment — Invoices from this Supplier default to Consignment in Accounts Payable</span>
        </label>
        <label className="field">
          <span>Email — where orders/claims are sent</span>
          <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="field">
          <span>Rep name</span>
          <input type="text" value={f.repName ?? ""} onChange={(e) => set("repName", e.target.value)} />
        </label>
        <label className="field">
          <span>Rep phone</span>
          <input type="text" value={f.repPhone ?? ""} onChange={(e) => set("repPhone", e.target.value)} />
        </label>
        <label className="field">
          <span>Main phone</span>
          <input type="text" value={f.mainPhone ?? ""} onChange={(e) => set("mainPhone", e.target.value)} />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span>Notes — visible to all staff</span>
          <textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </label>
      </div>
    </Modal>
  );
}

function MergeModal({
  supplier,
  onClose,
  onDone,
}: {
  supplier: Supplier;
  onClose: () => void;
  onDone: (keepId: string) => void;
}) {
  const app = useApp();
  const others = app.suppliers.filter((s) => s.id !== supplier.id);
  const [targetId, setTargetId] = useState(others[0]?.id ?? "");

  return (
    <Modal
      title={`Merge ${supplier.name} (Admin)`}
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={!targetId}
            onClick={() => {
              app.mergeSuppliers(targetId, supplier.id);
              onDone(targetId);
            }}
          >
            Merge into selected
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="callout danger">
          Combines {supplier.name} into the Supplier picked below. Every Invoice, order, claim, and
          InventoryItem currently pointing to {supplier.name} is reassigned to the survivor, and{" "}
          {supplier.name} is removed — historical orders/inventory are not rewritten, just
          repointed.
        </div>
        <label className="field">
          <span>Merge into</span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.shortName})
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
