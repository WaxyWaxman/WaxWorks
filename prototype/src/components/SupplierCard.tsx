import { useEffect, useRef, useState } from "react";
import { ManagerOverride } from "./ManagerOverride";
import type {
  PostalAddress,
  Supplier,
  SupplierMinBasis,
  SupplierOrderVia,
  SupplierType,
} from "../data/types";
import { useApp } from "../store/AppStore";

const ORDER_VIA: SupplierOrderVia[] = ["Phone", "Email", "FTP", "Their Website", "Fax", "Rep"];
const MIN_BASIS: SupplierMinBasis[] = ["Retail", "Net"];
const TYPES: SupplierType[] = ["New", "Used", "Bargain"];

export type SupplierDraft = Omit<Supplier, "id" | "log">;

export const blankSupplier: SupplierDraft = {
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
  billing: {},
  shipping: {},
  shipSameAsBilling: true,
};

const ADDRESS_FIELDS: { key: keyof PostalAddress; label: string; wide?: boolean; max?: number }[] = [
  { key: "line1", label: "Line 1", wide: true },
  { key: "line2", label: "Line 2", wide: true },
  { key: "city", label: "City" },
  { key: "provinceState", label: "Province / State", max: 2 },
  { key: "country", label: "Country" },
];

// ---- Track 2: the card (M-01 d13) ----
//
// The card IS the edit surface, following E-07 d13 and d18 — no Edit function,
// no confirm step, no modal restating the same fields. Two things follow from
// that and neither is cosmetic:
//
// 1. Discount is the one gated field. It is the margin (d7 as superseded:
//    there is no separate Margin field), and setting a margin is manager-only
//    (d11, E-02 d44, architecture A-28a). So it is locked, and a Manager
//    authorises in place with their own initials — both names recorded.
//
// 2. Edits are held locally and committed on BLUR, not on keystroke.
//    `updateSupplier` appends a log row per call and d4 requires every change
//    logged; committing live would mean one log row per character, which turns
//    the audit trail M-01 d4 asks for into noise. One field touched is one row.
export function SupplierCard({ supplier }: { supplier: Supplier }) {
  const app = useApp();
  const [saved, setSaved] = useState(false);
  const [askingManager, setAskingManager] = useState(false);
  // Session-scoped, and dropped the moment another card is opened: authorising
  // once does not leave every Supplier's margin open for the rest of the shift.
  const [discountUnlocked, setDiscountUnlocked] = useState(false);
  const discountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDiscountUnlocked(false);
  }, [supplier.id]);

  const flash = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const commit = (patch: Partial<SupplierDraft>) => {
    app.updateSupplier(supplier.id, patch);
    flash();
  };

  return (
    <section className="cust-main sup-main">
      <div className="cust-head">
        <div style={{ minWidth: 0 }}>
          <h2>{supplier.name || "(unnamed supplier)"}</h2>
          <div className="cust-badges">
            <span className="badge mono">{supplier.shortName || "—"}</span>
            <span className="badge">{supplier.type}</span>
            {supplier.defaultForSecondHand && <span className="badge ok">2nd-hand default</span>}
            {supplier.currency !== "CAD" && <span className="badge warn">{supplier.currency}</span>}
            {supplier.consignment && <span className="badge">Consignment</span>}
          </div>
        </div>
        <div className="cust-head-acts">
          {/* Always rendered: the chip holds its width so the head does not
              jump when it appears (the same reason E-07 gives). */}
          <span className={"saved-chip" + (saved ? " on" : "")}>✓ Saved</span>
        </div>
      </div>

      <div className="cust-scroll">
        <Group label="Identity">
          <Text label="Short name" value={supplier.shortName} maxLength={4} upper
            hint="4-letter code, the one that appears on their invoices."
            onCommit={(v) => commit({ shortName: v })} />
          <Text label="Full name" value={supplier.name} onCommit={(v) => commit({ name: v })} />
          <Text label="Account #" value={supplier.accountNumber ?? ""}
            onCommit={(v) => commit({ accountNumber: v })} />
          <label className="field">
            <span>Type</span>
            <select value={supplier.type}
              onChange={(e) => commit({ type: e.target.value as SupplierType })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </Group>

        <Group label="Ordering" aside="Captured for M-02 — not yet consumed">
          <label className="field">
            <span>Order via</span>
            <select value={supplier.orderVia}
              onChange={(e) => commit({ orderVia: e.target.value as SupplierOrderVia })}>
              {ORDER_VIA.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <Text label="Currency" value={supplier.currency} maxLength={3} upper
            hint={supplier.currency === "CAD"
              ? "Store currency."
              : "Foreign — an Invoice shows its own currency and the store equivalent at the configured rate (M-05, M-06)."}
            onCommit={(v) => commit({ currency: v })} />
          <Num label="Minimum order qty" value={supplier.minOrderQty}
            hint="0 means quantity does not gate it — readiness falls back to the amount."
            onCommit={(n) => commit({ minOrderQty: n })} />
          <div className="field sup-pair">
            <span>Minimum order amount / basis</span>
            <div className="sup-pair-row">
              <input type="number" min={0} step="0.01" defaultValue={supplier.minOrderAmount}
                key={`mina-${supplier.id}-${supplier.minOrderAmount}`}
                onBlur={(e) => {
                  const n = Number(e.target.value) || 0;
                  if (n !== supplier.minOrderAmount) commit({ minOrderAmount: n });
                }} />
              <select value={supplier.minOrderAmountBasis}
                onChange={(e) => commit({ minOrderAmountBasis: e.target.value as SupplierMinBasis })}>
                {MIN_BASIS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <span className="hint">Only consulted when qty is 0.</span>
          </div>
          <Text label="Cancel-by (days)" value={supplier.cancelByDays == null ? "" : String(supplier.cancelByDays)}
            hint="Blank means this Supplier does not support it. Overridable per order."
            onCommit={(v) => commit({ cancelByDays: v.trim() === "" ? undefined : Number(v) || 0 })} />
          <label className="field">
            <span>Backorders allowed</span>
            <select value={supplier.backordersAllowed ? "Yes" : "No"}
              onChange={(e) => commit({ backordersAllowed: e.target.value === "Yes" })}>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>
        </Group>

        <Group label="Terms" aside="One of these is gated">
          <label className={"field sup-gated" + (discountUnlocked ? " open" : "")}>
            <span>
              Discount (%)
              <span className={"sup-lock" + (discountUnlocked ? " open" : "")}>
                {discountUnlocked ? "authorised" : "manager-only"}
              </span>
            </span>
            <div className="sup-pair-row">
              <input
                ref={discountRef}
                type="number"
                min={0}
                max={100}
                disabled={!discountUnlocked}
                key={`disc-${supplier.id}-${supplier.discountPct}`}
                defaultValue={supplier.discountPct}
                onBlur={(e) => {
                  const n = Number(e.target.value) || 0;
                  if (n !== supplier.discountPct) commit({ discountPct: n });
                }}
              />
              {!discountUnlocked && (
                <button className="btn sm" onClick={() => setAskingManager(true)}>
                  Change (Manager)
                </button>
              )}
            </div>
            <span className="hint">
              % off <em>their</em> retail, and the multiplier in the suggested-retail formula at
              receiving (E-02 d8). This is the margin field — there is no separate one (d7
              superseded), which is why setting it is manager-only (d11, E-02 d44, A-28a). A change
              applies to <strong>future receiving only</strong> (d2).
            </span>
          </label>
          <label className="field">
            <span>Consignment</span>
            <select value={supplier.consignment ? "Yes" : "No"}
              onChange={(e) => commit({ consignment: e.target.value === "Yes" })}>
              <option>No</option>
              <option>Yes</option>
            </select>
            <span className="hint">
              Invoices from them default to Consignment in accounts payable (M-05 d13).
            </span>
          </label>
          <div className="field wide">
            <span>Second-hand default</span>
            <div className="sup-pair-row">
              <button className="btn sm" disabled={!!supplier.defaultForSecondHand}
                onClick={() => app.setDefaultForSecondHand(supplier.id)}>
                Make 2nd-hand default
              </button>
              <span className="xsmall muted">
                {supplier.defaultForSecondHand
                  ? "This Supplier carries it."
                  : "Only one Supplier carries it at a time (d5, E-02 d27)."}
              </span>
            </div>
          </div>
        </Group>

        <Group label="Contact">
          <Text label="Email" value={supplier.email} hint="Where orders and claims are sent."
            onCommit={(v) => commit({ email: v })} />
          <Text label="Main phone" value={supplier.mainPhone ?? ""}
            onCommit={(v) => commit({ mainPhone: v })} />
          <Text label="Rep name" value={supplier.repName ?? ""}
            onCommit={(v) => commit({ repName: v })} />
          <Text label="Rep phone" value={supplier.repPhone ?? ""}
            onCommit={(v) => commit({ repPhone: v })} />
        </Group>

        <Addresses supplier={supplier} onCommit={commit} />

        <Group label="Notes">
          <label className="field wide">
            <textarea rows={2} key={`notes-${supplier.id}`} defaultValue={supplier.notes ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (supplier.notes ?? "")) commit({ notes: e.target.value });
              }} />
            <span className="hint">Free-form, visible to all staff.</span>
          </label>
        </Group>

        <div className="cust-group">
          <div className="head">
            <span className="lab">Log</span>
            <span className="xsmall muted">Every change, with who and when (d4)</span>
          </div>
          <div className="cust-table">
            <table className="data">
              <thead>
                <tr><th style={{ width: 170 }}>When</th><th>What</th></tr>
              </thead>
              <tbody>
                {supplier.log.slice().reverse().map((e, i) => (
                  <tr key={i}>
                    <td className="mono xsmall">{e.at}</td>
                    <td className="small">{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {askingManager && (
        <ManagerOverride
          // manager-ONLY, not the retired manager override (M-04 d8, lexicon).
          title="Manager authorisation — setting a margin"
          reason={
            `Setting a Supplier's Discount is manager-only (M-01 d11, E-02 d44, architecture ` +
            `A-28a) — Discount is the margin. The change applies to future receiving only and ` +
            `does not reprice stock already on hand (d2).`
          }
          onConfirm={(by) => {
            setAskingManager(false);
            setDiscountUnlocked(true);
            app.logSupplier(supplier.id, `Discount unlocked for editing by ${by}`);
            window.setTimeout(() => discountRef.current?.focus(), 0);
          }}
          onCancel={() => setAskingManager(false)}
        />
      )}
    </section>
  );
}

// Billing and shipping, with the mirror lock (d13). Ticked, shipping mirrors
// billing and is LOCKED — a mirrored field that stays typable is one that
// silently stops mirroring the moment someone corrects the billing address,
// and then the two disagree with nothing to say which is right.
function Addresses({
  supplier,
  onCommit,
}: {
  supplier: Supplier;
  onCommit: (patch: Partial<SupplierDraft>) => void;
}) {
  const same = supplier.shipSameAsBilling !== false;
  const billing = supplier.billing ?? {};
  // Derived at render rather than stored, so a mirrored shipping address can
  // never be a stale second copy.
  const shipping = same ? billing : supplier.shipping ?? {};

  const setAddr = (which: "billing" | "shipping", key: keyof PostalAddress, value: string) => {
    const base = which === "billing" ? billing : supplier.shipping ?? {};
    onCommit({ [which]: { ...base, [key]: value } } as Partial<SupplierDraft>);
  };

  return (
    <>
      <Group label="Billing address" aside="Where payment is remitted — captured for M-05">
        {ADDRESS_FIELDS.map((f) => (
          <Text
            key={`b-${f.key}`}
            label={f.label}
            wide={f.wide}
            maxLength={f.max}
            value={billing[f.key] ?? ""}
            onCommit={(v) => setAddr("billing", f.key, v)}
          />
        ))}
      </Group>

      <Group label="Shipping address" aside="Where stock ships from — what a claim is argued against">
        <label className="field wide sup-same">
          <input
            type="checkbox"
            checked={same}
            onChange={(e) => {
              const on = e.target.checked;
              // Unticking leaves the copied values behind as a starting
              // point — "nearly the same address, different unit" is the
              // usual reason to untick.
              onCommit(on ? { shipSameAsBilling: true } : { shipSameAsBilling: false, shipping: { ...billing } });
            }}
          />
          <span>Same as billing address</span>
          <span className="hint">
            Ticked, the fields below mirror billing and are locked. Untick to enter a different one
            — a distributor's warehouse is rarely its accounts office.
          </span>
        </label>
        {ADDRESS_FIELDS.map((f) => (
          <Text
            key={`s-${f.key}`}
            label={f.label}
            wide={f.wide}
            maxLength={f.max}
            value={shipping[f.key] ?? ""}
            disabled={same}
            mirrored={same}
            onCommit={(v) => setAddr("shipping", f.key, v)}
          />
        ))}
      </Group>
    </>
  );
}

function Group({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cust-group">
      <div className="head">
        <span className="lab">{label}</span>
        {aside && <span className="xsmall muted">{aside}</span>}
      </div>
      <div className="cust-grid">{children}</div>
    </div>
  );
}

/**
 * A text field that reads live and commits on blur. The `key` carries the
 * current value so an external change — the mirror, a merge, switching cards —
 * re-seeds the uncontrolled input instead of leaving a stale one on screen.
 */
function Text({
  label,
  value,
  onCommit,
  hint,
  wide,
  maxLength,
  upper,
  disabled,
  mirrored,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  hint?: string;
  wide?: boolean;
  maxLength?: number;
  upper?: boolean;
  disabled?: boolean;
  mirrored?: boolean;
}) {
  const cls = ["field", wide ? "wide" : "", mirrored ? "sup-mirrored" : ""].filter(Boolean).join(" ");
  return (
    <label className={cls}>
      <span>{label}</span>
      <input
        type="text"
        key={`${label}-${value}-${disabled ? "off" : "on"}`}
        defaultValue={value}
        maxLength={maxLength}
        disabled={disabled}
        onBlur={(e) => {
          const next = upper ? e.target.value.toUpperCase() : e.target.value;
          if (next !== value) onCommit(next);
        }}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Num({
  label,
  value,
  onCommit,
  hint,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        key={`${label}-${value}`}
        defaultValue={value}
        onBlur={(e) => {
          const n = Number(e.target.value) || 0;
          if (n !== value) onCommit(n);
        }}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** The blank card (d13, following E-07 d18): New is a card, not a modal. */
export function NewSupplierCard({
  draft,
  onChange,
  onCancel,
}: {
  draft: SupplierDraft;
  onChange: (patch: Partial<SupplierDraft>) => void;
  onCancel: () => void;
}) {
  const billing = draft.billing ?? {};
  const same = draft.shipSameAsBilling !== false;
  const shipping = same ? billing : draft.shipping ?? {};

  return (
    <section className="cust-main sup-main">
      <div className="cust-head">
        <div style={{ minWidth: 0 }}>
          <h2>New supplier</h2>
          <div className="cust-badges">
            <span className="badge accent">unsaved</span>
            <span className="xsmall muted">
              Short name and full name are the only two required.
            </span>
          </div>
        </div>
        <div className="cust-head-acts">
          <button className="btn sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      <div className="cust-scroll">
        <Group label="Identity">
          <label className="field">
            <span>Short name</span>
            <input type="text" maxLength={4} autoFocus value={draft.shortName}
              onChange={(e) => onChange({ shortName: e.target.value.toUpperCase() })} />
            <span className="hint">4-letter code, the one that appears on their invoices.</span>
          </label>
          <label className="field">
            <span>Full name</span>
            <input type="text" value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>Account #</span>
            <input type="text" value={draft.accountNumber ?? ""}
              onChange={(e) => onChange({ accountNumber: e.target.value })} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={draft.type} onChange={(e) => onChange({ type: e.target.value as SupplierType })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </Group>

        <Group label="Ordering">
          <label className="field">
            <span>Order via</span>
            <select value={draft.orderVia}
              onChange={(e) => onChange({ orderVia: e.target.value as SupplierOrderVia })}>
              {ORDER_VIA.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Currency</span>
            <input type="text" maxLength={3} value={draft.currency}
              onChange={(e) => onChange({ currency: e.target.value.toUpperCase() })} />
          </label>
        </Group>

        <Group label="Terms" aside="Discount is manager-only and starts at 0% (d1, d11)">
          <label className="field sup-gated">
            <span>Discount (%) <span className="sup-lock">manager-only</span></span>
            <input type="number" value={0} disabled />
            <span className="hint">
              A fresh Supplier's Discount is 0% until a Manager sets it (d1, d11). It can be set
              from the card once the record exists.
            </span>
          </label>
        </Group>

        <Group label="Contact">
          <label className="field">
            <span>Email</span>
            <input type="text" value={draft.email} onChange={(e) => onChange({ email: e.target.value })} />
          </label>
          <label className="field">
            <span>Main phone</span>
            <input type="text" value={draft.mainPhone ?? ""}
              onChange={(e) => onChange({ mainPhone: e.target.value })} />
          </label>
        </Group>

        <Group label="Billing address" aside="Where payment is remitted">
          {ADDRESS_FIELDS.map((f) => (
            <label key={`nb-${f.key}`} className={"field" + (f.wide ? " wide" : "")}>
              <span>{f.label}</span>
              <input type="text" maxLength={f.max} value={billing[f.key] ?? ""}
                onChange={(e) => onChange({ billing: { ...billing, [f.key]: e.target.value } })} />
            </label>
          ))}
        </Group>

        <Group label="Shipping address" aside="Where stock ships from">
          <label className="field wide sup-same">
            <input type="checkbox" checked={same}
              onChange={(e) => onChange(
                e.target.checked
                  ? { shipSameAsBilling: true }
                  : { shipSameAsBilling: false, shipping: { ...billing } },
              )} />
            <span>Same as billing address</span>
          </label>
          {ADDRESS_FIELDS.map((f) => (
            <label key={`ns-${f.key}`}
              className={"field" + (f.wide ? " wide" : "") + (same ? " sup-mirrored" : "")}>
              <span>{f.label}</span>
              <input type="text" maxLength={f.max} disabled={same} value={shipping[f.key] ?? ""}
                onChange={(e) => onChange({
                  shipping: { ...(draft.shipping ?? {}), [f.key]: e.target.value },
                })} />
            </label>
          ))}
        </Group>
      </div>
    </section>
  );
}

export function shortNameTaken(suppliers: Supplier[], code: string, exceptId?: string): boolean {
  const c = code.trim().toUpperCase();
  if (!c) return false;
  return suppliers.some((s) => s.id !== exceptId && s.shortName.toUpperCase() === c);
}
