import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";

export function Customers() {
  const app = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string>(app.customers[0]?.id ?? "");

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return app.customers;
    return app.customers.filter((c) =>
      [c.name, c.phone, c.email, c.accountNumber].some((f) => f.toLowerCase().includes(s)),
    );
  }, [q, app.customers]);

  const sel = app.customers.find((c) => c.id === selId);

  return (
    <div>
      <div className="page-head">
        <span className="flow-id">E-07</span>
        <div>
          <h1>Manage customers</h1>
          <p className="sub">
            Look someone up to attach them to a Sale, hold something, apply their discount, or settle
            what’s owed. A Customer is never required.
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">Lookup — name, phone, email, account no.</div>
          <div className="card-body stack">
            <input
              type="search"
              value={q}
              autoFocus
              placeholder="ramona · left bank · A-3311"
              onChange={(e) => setQ(e.target.value)}
            />
            <table className="data">
              <tbody>
                {matches.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelId(c.id)}>
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
                {matches.length === 0 && (
                  <tr>
                    <td className="small muted">
                      No match. <a href="#/customers">Create a Customer</a> (not built in this pass).
                    </td>
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
              <span className="muted xsmall">Customer ID permanent · account no. editable</span>
            </div>
            <div className="card-body stack">
              <table className="data">
                <tbody>
                  <tr>
                    <td className="muted">Account</td>
                    <td>
                      {sel.accountNumber} · {sel.accountType}
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">Contact</td>
                    <td>
                      {sel.phone} · {sel.email} <span className="badge">prefers {sel.contactPreference}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">Global discount</td>
                    <td>{sel.globalDiscountPct}% — pre-fills line discount, overridable per line</td>
                  </tr>
                  <tr>
                    <td className="muted">Default tax line</td>
                    <td>
                      {sel.defaultTaxLineId
                        ? `${app.taxLines.find((t) => t.id === sel.defaultTaxLineId)?.name} — overrides the item’s at the till`
                        : "— (uses the item’s tax line)"}
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">Account balance</td>
                    <td>
                      <strong>{money(sel.balance)}</strong>{" "}
                      {sel.balance > 0
                        ? "— store owes them (store credit)"
                        : sel.balance < 0
                          ? "— they owe the store (unpaid customer invoice)"
                          : "— settled"}
                      <div className="xsmall muted">A single signed figure, derived from movements (E-07 decision 4/5).</div>
                    </td>
                  </tr>
                  {sel.note && (
                    <tr>
                      <td className="muted">Note</td>
                      <td>{sel.note}</td>
                    </tr>
                  )}
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
                  New Sale with {sel.name.split(" ")[0]}
                </button>
                <button className="btn" disabled>
                  Edit
                </button>
                <button className="btn" disabled>
                  History
                </button>
              </div>

              <div className="callout">
                <strong>Open question (E-07):</strong> terms / aging on outbound customer invoices,
                duplicate-customer merge, credit limit, data-protection retention — all unspecified.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
