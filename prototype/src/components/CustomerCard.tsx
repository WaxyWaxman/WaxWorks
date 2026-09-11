import { useEffect, useMemo, useRef, useState } from "react";
import { ACCOUNT_TYPES } from "./CustomerSlab";
import type { Customer, CustomerAddress } from "../data/types";
import { useApp } from "../store/AppStore";

const CONTACT_PREFS: Customer["contactPreference"][] = ["Email", "Phone"];

export type CustomerDraft = Omit<Customer, "id" | "primaryId" | "balance">;

export const blankCustomer: CustomerDraft = {
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

export function accountNumberTaken(customers: Customer[], value: string, excludeId?: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return customers.some((c) => c.id !== excludeId && c.accountNumber.trim().toLowerCase() === v);
}

// ---- Track 2: the open card (E-07 d13, d18) ----
//
// Every field is a live input; there is no Edit function and no confirm step.
// The consequence d13 accepts is that the employee is left with no evidence a
// keystroke landed, so the head carries a saved chip that appears on write and
// fades — "no confirm step" and "no feedback" are not the same thing.
export function CustomerCard({ customer }: { customer: Customer }) {
  const app = useApp();
  const [saved, pulse] = useSavedPulse();

  const history = useMemo(
    () =>
      app.sales
        // d16 — sold items only: qty > 0 item lines from tendered Sales.
        .filter((s) => s.customerId === customer.id && s.saleNumber && s.state !== "Void")
        .flatMap((s) =>
          s.lines
            .filter((l) => l.kind === "item" && l.qty > 0)
            .map((l) => ({ title: l.title, saleNumber: s.saleNumber!, at: s.createdAt })),
        )
        .sort((a, b) => b.at.localeCompare(a.at)),
    [app.sales, customer.id],
  );

  const patch = (p: Partial<Omit<Customer, "id" | "primaryId">>) => {
    app.updateCustomer(customer.id, p);
    pulse();
  };

  return (
    <section className="cust-main">
      <div className="cust-head">
        <div style={{ minWidth: 0 }}>
          <h2>{customer.name || "(unnamed)"}</h2>
          <div className="cust-badges">
            <span className="badge ink">{customer.accountType}</span>
            <span className="badge mono">{customer.accountNumber || "no account no."}</span>
            {customer.globalDiscountPct > 0 && (
              <span className="badge ok">{customer.globalDiscountPct}% discount</span>
            )}
          </div>
        </div>
        <div className="cust-head-acts">
          <span className={"saved-chip" + (saved ? " on" : "")} aria-live="polite">
            {saved ? "✓ Saved" : ""}
          </span>
          <DeleteCustomer customer={customer} />
        </div>
      </div>

      <div className="cust-scroll">
        <CustomerFields
          value={customer}
          onChange={patch}
          primaryId={String(customer.primaryId)}
          otherCustomers={app.customers}
          excludeId={customer.id}
        />

        <div className="cust-group">
          <div className="head">
            <span className="lab">History</span>
            <span className="xsmall muted">Sold items only, newest first (d16).</span>
          </div>
          <div className="cust-table">
            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Invoice #</th>
                  <th className="num">Date sold</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="small">{h.title}</td>
                    <td className="small mono">#{h.saleNumber}</td>
                    <td className="small muted num">{h.at}</td>
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
    </section>
  );
}

// ---- The blank card (d18) ----
//
// New opens here rather than in a modal, because d13 made the card the edit
// surface and a modal rendering the same fields a second time is that rule
// stopping one step short. Same component tree, local state until Add.
export function NewCustomerCard({
  draft,
  onChange,
  onCancel,
}: {
  /** Held by the screen, so the account track's foot can carry Add — the
      primary action stays in the place an open card puts it. */
  draft: CustomerDraft;
  onChange: (patch: Partial<CustomerDraft>) => void;
  onCancel: () => void;
}) {
  const app = useApp();

  return (
    <section className="cust-main">
      <div className="cust-head">
        <div style={{ minWidth: 0 }}>
          <h2>{draft.name.trim() || "New customer"}</h2>
          <div className="cust-badges">
            <span className="badge">Unsaved</span>
            <span className="badge mono">Primary ID assigned on save</span>
          </div>
        </div>
        <div className="cust-head-acts">
          <button className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="cust-scroll">
        <CustomerFields
          value={draft}
          onChange={onChange}
          primaryId="—"
          otherCustomers={app.customers}
          isNew
        />
        <div className="cust-group">
          <div className="head">
            <span className="lab">History</span>
          </div>
          <div className="xsmall muted">
            Nothing sold yet — history begins at their first tendered Sale.
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomerFields({
  value,
  onChange,
  primaryId,
  otherCustomers,
  excludeId,
  isNew,
}: {
  value: CustomerDraft;
  onChange: (patch: Partial<CustomerDraft>) => void;
  primaryId: string;
  otherCustomers: Customer[];
  excludeId?: string;
  isNew?: boolean;
}) {
  const app = useApp();
  const addr = (field: keyof CustomerAddress, v: string) =>
    onChange({ address: { ...value.address, [field]: v } });

  return (
    <>
      <div className="cust-group">
        <div className="head">
          <span className="lab">Identity</span>
          <span className="xsmall muted">
            {isNew
              ? "Name and a unique account number are the only two required."
              : "Every field here saves as you type — there is no Edit step (d13)."}
          </span>
        </div>
        <div className="cust-grid">
          <label className="field">
            <span>Primary ID</span>
            <input type="text" value={primaryId} disabled />
            <span className="hint">
              Internal, permanent, never reused, never editable (d11).
            </span>
          </label>
          <AccountNumberField
            value={value.accountNumber}
            onCommit={(v) => onChange({ accountNumber: v })}
            otherCustomers={otherCustomers}
            excludeId={excludeId}
            live={isNew}
          />
          <label className="field">
            <span>Account type</span>
            <select
              value={value.accountType}
              onChange={(e) => onChange({ accountType: e.target.value as Customer["accountType"] })}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={value.name}
              autoFocus={isNew}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="cust-group">
        <div className="head">
          <span className="lab">Contact</span>
          <span className="xsmall muted">
            Preference is what the hold timeline chases them on (d8, E-05).
          </span>
        </div>
        <div className="cust-grid">
          <label className="field">
            <span>Phone</span>
            <input type="text" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} />
          </label>
          <label className="field">
            <span>Contact preference</span>
            <select
              value={value.contactPreference}
              onChange={(e) =>
                onChange({ contactPreference: e.target.value as Customer["contactPreference"] })
              }
            >
              {CONTACT_PREFS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="cust-group">
        <div className="head">
          <span className="lab">Mailing address</span>
        </div>
        <div className="cust-grid">
          <label className="field wide">
            <span>Line 1</span>
            <input type="text" value={value.address?.line1 ?? ""} onChange={(e) => addr("line1", e.target.value)} />
          </label>
          <label className="field wide">
            <span>Line 2</span>
            <input type="text" value={value.address?.line2 ?? ""} onChange={(e) => addr("line2", e.target.value)} />
          </label>
          <label className="field">
            <span>City</span>
            <input type="text" value={value.address?.city ?? ""} onChange={(e) => addr("city", e.target.value)} />
          </label>
          <label className="field">
            <span>Province / State</span>
            <input
              type="text"
              maxLength={2}
              value={value.address?.provinceState ?? ""}
              onChange={(e) => addr("provinceState", e.target.value.toUpperCase())}
            />
          </label>
          <label className="field">
            <span>Country</span>
            <input type="text" value={value.address?.country ?? ""} onChange={(e) => addr("country", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="cust-group">
        <div className="head">
          <span className="lab">Note</span>
          <span className="xsmall muted">Free-form, visible to every Employee.</span>
        </div>
        <label className="field">
          <textarea rows={2} value={value.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} />
        </label>
      </div>

      {/* Discount and tax line are NOT here — d19 moves them under the balance,
          because those three together describe a Customer as a counterparty
          rather than as a person. The accepted consequence is that the card is
          two surfaces; this note is the signpost between them. */}
      <div className="xsmall muted">
        Global discount and default tax line sit on the account track, beside the balance —
        they change what happens at the till rather than describing the person (d19).
        {isNew && " Both are editable there once the record exists."}
        {!isNew && app.taxLines.length === 0 && " No tax lines are configured."}
      </div>
    </>
  );
}

// Unique, so it is the one field that validates — on blur rather than per
// keystroke, since a half-typed number is not yet a duplicate.
function AccountNumberField({
  value,
  onCommit,
  otherCustomers,
  excludeId,
  live,
}: {
  value: string;
  onCommit: (v: string) => void;
  otherCustomers: Customer[];
  excludeId?: string;
  live?: boolean;
}) {
  const [raw, setRaw] = useState(value);
  useEffect(() => setRaw(value), [value]);
  // No `raw !== value` guard: excludeId already excludes this Customer's own
  // number, and on the blank card (which commits per keystroke) that guard made
  // raw and value identical, so a duplicate disabled Add without ever saying why.
  const taken = accountNumberTaken(otherCustomers, raw, excludeId);
  const emptyOnExisting = !live && !raw.trim();

  return (
    <label className="field">
      <span>Account number</span>
      <input
        type="text"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          // On the blank card there is nothing to revert to, so it writes
          // straight through and Add is what gates it.
          if (live) onCommit(e.target.value);
        }}
        onBlur={() => {
          if (live) return;
          if (emptyOnExisting || taken) {
            setRaw(value);
            return;
          }
          if (raw.trim() !== value) onCommit(raw.trim());
        }}
      />
      {taken ? (
        <span className="hint bad">Already in use — must stay unique.</span>
      ) : (
        <span className="hint">Store-facing. Must stay unique.</span>
      )}
    </label>
  );
}

function DeleteCustomer({ customer }: { customer: Customer }) {
  const app = useApp();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className="btn danger sm" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className="cust-confirm">
      <span className="xsmall">Delete {customer.name}? Past Sales keep their record.</span>
      <button className="btn ghost sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      <button className="btn danger sm" onClick={() => app.deleteCustomer(customer.id)}>
        Delete
      </button>
    </span>
  );
}

/** d13 removed the confirm step; this is what replaces the reassurance it gave. */
function useSavedPulse(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    on,
    () => {
      setOn(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOn(false), 1600);
    },
  ];
}
