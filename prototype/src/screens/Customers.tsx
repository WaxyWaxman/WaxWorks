import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import type { Customer, CustomerAddress } from "../data/types";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";

const ACCOUNT_TYPES: Customer["accountType"][] = ["Regular", "Staff", "Business"];
const CONTACT_PREFS: Customer["contactPreference"][] = ["Phone", "Email"];

const blankCustomer: Omit<Customer, "id" | "primaryId" | "balance"> = {
  accountNumber: "",
  accountType: "Regular",
  name: "",
  phone: "",
  email: "",
  contactPreference: "Email",
  address: {},
  globalDiscountPct: 0,
  defaultTaxLineId: undefined,
  note: "",
};

// E-07 — Search/New/Delete. Every other field is edited in place on the open
// card (there's no separate Edit function), which is also why New's form and
// the open card render the same fields the same way.
export function Customers() {
  const app = useApp();
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const q = query.trim().toLowerCase();
  const results = q
    ? app.customers.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
      )
    : app.customers;

  const selId = app.lastViewedCustomerId ?? app.customers[0]?.id ?? null;
  const sel = app.customers.find((c) => c.id === selId) ?? null;

  const history = useMemo(() => {
    if (!sel) return [];
    return app.sales
      .filter((s) => s.customerId === sel.id && s.saleNumber)
      .flatMap((s) =>
        s.lines
          .filter((l) => l.kind === "item" && l.qty > 0)
          .map((l) => ({ title: l.title, saleNumber: s.saleNumber!, at: s.createdAt })),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [app.sales, sel]);

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">E-07</span>
        <div>
          <h1>Customers</h1>
          <p className="sub">
            Look someone up to attach them to a Sale, hold something, apply their discount, or settle
            what's owed. Opens on the most recently searched or added card. A Customer is never
            required.
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            All customers
            <button className="btn sm" onClick={() => setAdding(true)}>
              + New
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <input
                type="search"
                value={query}
                autoFocus
                placeholder="Search name, email, or phone…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <table className="data">
              <tbody>
                {results.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} className={c.id === selId ? "selected" : ""} onClick={() => app.viewCustomer(c.id)}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="xsmall muted">
                        {c.accountType} · {c.accountNumber}
                      </div>
                    </td>
                    <td className="small">{c.phone}</td>
                    <td className={"num badge " + (c.balance >= 0 ? "ok" : "warn")}>{money(c.balance)}</td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td className="small muted">No match for "{query}".</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {sel && (
          <div className="card">
            <div className="card-head">
              {sel.name || "(unnamed)"}
              <div className="btn-row">
                <span className="muted xsmall">#{sel.primaryId} · permanent</span>
                <button className="btn sm danger" onClick={() => setDeleting(true)}>
                  Delete
                </button>
              </div>
            </div>
            <div className="card-body stack">
              <table className="data">
                <tbody>
                  <FieldRow label="Account #">
                    <AccountNumberInput key={sel.id} customer={sel} />
                  </FieldRow>
                  <FieldRow label="Account type">
                    <select value={sel.accountType} onChange={(e) => app.updateCustomer(sel.id, { accountType: e.target.value as Customer["accountType"] })}>
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Name">
                    <input type="text" value={sel.name} onChange={(e) => app.updateCustomer(sel.id, { name: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="Phone">
                    <input type="text" value={sel.phone} onChange={(e) => app.updateCustomer(sel.id, { phone: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="Email">
                    <input type="email" value={sel.email} onChange={(e) => app.updateCustomer(sel.id, { email: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="Contact preference">
                    <select value={sel.contactPreference} onChange={(e) => app.updateCustomer(sel.id, { contactPreference: e.target.value as Customer["contactPreference"] })}>
                      {CONTACT_PREFS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Address line 1">
                    <AddressInput customer={sel} field="line1" />
                  </FieldRow>
                  <FieldRow label="Address line 2">
                    <AddressInput customer={sel} field="line2" />
                  </FieldRow>
                  <FieldRow label="City">
                    <AddressInput customer={sel} field="city" />
                  </FieldRow>
                  <FieldRow label="Province/State">
                    <AddressInput customer={sel} field="provinceState" maxLength={2} />
                  </FieldRow>
                  <FieldRow label="Country">
                    <AddressInput customer={sel} field="country" />
                  </FieldRow>
                  <FieldRow label="Global discount (%)">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={sel.globalDiscountPct}
                      onChange={(e) => app.updateCustomer(sel.id, { globalDiscountPct: Number(e.target.value) || 0 })}
                    />
                    <span className="xsmall muted"> — pre-fills the POS line discount; a changed line discount always overrides it</span>
                  </FieldRow>
                  <FieldRow label="Default tax line">
                    <select
                      value={sel.defaultTaxLineId ?? ""}
                      onChange={(e) => app.updateCustomer(sel.id, { defaultTaxLineId: e.target.value || undefined })}
                    >
                      <option value="">— none (uses the item's tax line) —</option>
                      {app.taxLines.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <span className="xsmall muted"> — overrides the item's default tax line at POS when set</span>
                  </FieldRow>
                  <FieldRow label="Note">
                    <textarea rows={2} value={sel.note ?? ""} onChange={(e) => app.updateCustomer(sel.id, { note: e.target.value })} />
                  </FieldRow>
                  <FieldRow label="A/R balance">
                    <strong>{money(sel.balance)}</strong>{" "}
                    {sel.balance > 0 ? "— store owes them (store credit)" : sel.balance < 0 ? "— they owe the store" : "— settled"}
                    <div className="xsmall muted">A single signed figure, derived from movements — not directly editable here.</div>
                  </FieldRow>
                </tbody>
              </table>

              <div className="btn-row">
                <button
                  className="btn primary"
                  onClick={() => {
                    const id = app.newSale();
                    app.attachCustomer(id, sel.id);
                    nav(`/sell/${id}`);
                  }}
                >
                  New Sale with {sel.name.split(" ")[0] || "customer"}
                </button>
              </div>

              <div className="card">
                <div className="card-head">History</div>
                <div className="card-body" style={{ padding: 0 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Invoice #</th>
                        <th>Date sold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i}>
                          <td className="small">{h.title}</td>
                          <td className="small mono">#{h.saleNumber}</td>
                          <td className="small muted">{h.at}</td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td className="small muted" colSpan={3}>
                            Nothing sold to this Customer yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {adding && <NewCustomerModal onClose={() => setAdding(false)} />}
      {deleting && sel && (
        <Modal
          title={`Delete ${sel.name}`}
          onClose={() => setDeleting(false)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setDeleting(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  app.deleteCustomer(sel.id);
                  setDeleting(false);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <div className="callout danger">
            Deletes {sel.name} outright, A/R balance included. Past Sales keep their own record of
            what happened; they just no longer point at a Customer.
          </div>
        </Modal>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="muted" style={{ width: 160 }}>
        {label}
      </td>
      <td>{children}</td>
    </tr>
  );
}

function accountNumberTaken(customers: Customer[], value: string, excludeId?: string): boolean {
  const v = value.trim().toLowerCase();
  return customers.some((c) => c.id !== excludeId && c.accountNumber.trim().toLowerCase() === v);
}

function AccountNumberInput({ customer }: { customer: Customer }) {
  const app = useApp();
  const [raw, setRaw] = useState(customer.accountNumber);
  const taken = raw.trim() !== customer.accountNumber && accountNumberTaken(app.customers, raw, customer.id);
  return (
    <div>
      <input
        type="text"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          if (!raw.trim() || taken) {
            setRaw(customer.accountNumber);
            return;
          }
          app.updateCustomer(customer.id, { accountNumber: raw.trim() });
        }}
      />
      {taken && <div className="xsmall" style={{ color: "var(--c-danger)" }}>Already in use — must stay unique.</div>}
    </div>
  );
}

function AddressInput({
  customer,
  field,
  maxLength,
}: {
  customer: Customer;
  field: keyof CustomerAddress;
  maxLength?: number;
}) {
  const app = useApp();
  return (
    <input
      type="text"
      maxLength={maxLength}
      value={customer.address?.[field] ?? ""}
      onChange={(e) =>
        app.updateCustomer(customer.id, {
          address: { ...customer.address, [field]: field === "provinceState" ? e.target.value.toUpperCase() : e.target.value },
        })
      }
    />
  );
}

function NewCustomerModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [f, setF] = useState(blankCustomer);
  const set = <K extends keyof typeof blankCustomer>(k: K, v: (typeof blankCustomer)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const taken = f.accountNumber.trim() !== "" && accountNumberTaken(app.customers, f.accountNumber);
  const canSubmit = f.name.trim() && f.accountNumber.trim() && !taken;

  return (
    <Modal
      title="New customer"
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
              app.addCustomer({ ...f, name: f.name.trim(), accountNumber: f.accountNumber.trim() });
              onClose();
            }}
          >
            Add
          </button>
        </>
      }
    >
      <div className="grid cols-2">
        <label className="field">
          <span>Name</span>
          <input type="text" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Account #</span>
          <input type="text" value={f.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
          {taken && <div className="xsmall" style={{ color: "var(--c-danger)" }}>Already in use — must stay unique.</div>}
        </label>
        <label className="field">
          <span>Account type</span>
          <select value={f.accountType} onChange={(e) => set("accountType", e.target.value as Customer["accountType"])}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="text" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="field">
          <span>Contact preference</span>
          <select value={f.contactPreference} onChange={(e) => set("contactPreference", e.target.value as Customer["contactPreference"])}>
            {CONTACT_PREFS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Address line 1</span>
          <input type="text" value={f.address?.line1 ?? ""} onChange={(e) => set("address", { ...f.address, line1: e.target.value })} />
        </label>
        <label className="field">
          <span>Address line 2</span>
          <input type="text" value={f.address?.line2 ?? ""} onChange={(e) => set("address", { ...f.address, line2: e.target.value })} />
        </label>
        <label className="field">
          <span>City</span>
          <input type="text" value={f.address?.city ?? ""} onChange={(e) => set("address", { ...f.address, city: e.target.value })} />
        </label>
        <label className="field">
          <span>Province/State</span>
          <input
            type="text"
            maxLength={2}
            value={f.address?.provinceState ?? ""}
            onChange={(e) => set("address", { ...f.address, provinceState: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="field">
          <span>Country</span>
          <input type="text" value={f.address?.country ?? ""} onChange={(e) => set("address", { ...f.address, country: e.target.value })} />
        </label>
        <label className="field">
          <span>Global discount (%)</span>
          <input type="number" min={0} max={100} value={f.globalDiscountPct} onChange={(e) => set("globalDiscountPct", Number(e.target.value) || 0)} />
        </label>
        <label className="field">
          <span>Default tax line</span>
          <select value={f.defaultTaxLineId ?? ""} onChange={(e) => set("defaultTaxLineId", e.target.value || undefined)}>
            <option value="">— none —</option>
            {app.taxLines.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span>Note</span>
          <textarea rows={2} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
