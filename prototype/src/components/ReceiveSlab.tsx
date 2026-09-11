import { useEffect, useRef } from "react";
import type { Invoice, Supplier } from "../data/types";
import { money } from "../lib/money";
import { round2 } from "../lib/totals";
import { useApp } from "../store/AppStore";

// The receiving slab (E-02 d38, d42). Invoices, and only Invoices: the drafts
// in flight and the ones received lately, searched by supplier, number, date,
// title, barcode or PO number (d36, d43). A title or barcode lists the Invoices
// that took that copy IN, which is the question the Invoice side can answer.
//
// The outstanding-orders worklist used to share this list and this search box,
// and neither could be searched properly for it. It lives in the Invoice track
// now (d42), scoped to the open Invoice's Supplier.
//
// It PUSHES rather than overlays, the way Find's slab does and unlike the till
// rail (E-05 d30). The rail overlays because nothing being read should move
// mid-transaction; receiving is the opposite errand, where the worklist and the
// lines already taken in get read against each other, so an overlay would cover
// the half you are comparing to.

export function ReceiveSlab({
  open,
  onOpenChange,
  term,
  onTermChange,
  drafts,
  recent,
  matches,
  selectedId,
  onSelect,
  onNewIntake,
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: string;
  onTermChange: (term: string) => void;
  drafts: Invoice[];
  recent: Invoice[];
  /** Every Invoice matching the search, once there is one — searching reaches
      past the drafts and the last three into the whole history (d36). */
  matches: Invoice[] | null;
  selectedId?: string;
  onSelect: (invoiceId: string) => void;
  onNewIntake: () => void;
  onOpenExisting: () => void;
}) {
  const app = useApp();
  const searchRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onOpenChange(false);
      openRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const supplierOf = (iv: Invoice): Supplier | undefined => app.supplierFor(iv.supplierId);
  const copiesIn = (iv: Invoice) => iv.lines.reduce((n, l) => n + l.qty, 0);
  // What is owed on the paperwork: the reconciled figure if one was entered,
  // otherwise the same sum the reconcile track computes. `totalOverride` is
  // unset on an Invoice that reconciled cleanly, so reading it alone would
  // show every tidy invoice as $0.00.
  const invoiceTotal = (iv: Invoice) =>
    iv.totalOverride ??
    round2(iv.lines.reduce((sum, l) => sum + l.cost * l.qty, 0) + iv.tax + iv.freight + iv.misc);

  if (!open) {
    return (
      <nav className="recv-slab" aria-label="Receive">
        <div className="slab-strip">
          {/* The bar's own open control, in the slot the till rail keeps it in.
              Search below also opens the slab, but it opens it to DO something;
              this one just gives the width back. */}
          <button
            ref={openRef}
            type="button"
            className="rail-ico"
            aria-expanded={false}
            aria-label="Open the worklist"
            title="Open worklist"
            onClick={() => onOpenChange(true)}
          >
            <ChevronRight />
          </button>

          <div className="rail-sep" />

          <button
            type="button"
            className="rail-ico accent"
            onClick={onNewIntake}
            aria-label="New intake"
            title="New intake"
          >
            <Plus />
          </button>
          {/* The honesty rule (E-05 d30): the bar has to say there is something
              behind it. Drafts ride this icon rather than Search, because a
              half-finished draft is the thing you can actually lose track of —
              the worklist is reference you go looking for. */}
          <button
            type="button"
            className="rail-ico"
            onClick={onOpenExisting}
            aria-label={`Open an existing invoice — ${drafts.length} draft${drafts.length === 1 ? "" : "s"} in flight`}
            title={`Open existing — ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`}
          >
            <Box />
            {drafts.length > 0 && <span className="rail-badge">{drafts.length}</span>}
          </button>
          <button
            type="button"
            className="rail-ico"
            onClick={() => {
              onOpenChange(true);
              // Opened for an errand, so the first keystroke has somewhere to
              // go. The effect below cannot do this — it would also steal the
              // cursor when the plain chevron opens the slab.
              window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
            aria-label="Search invoices"
            title="Search invoices — opens the slab with the cursor in the box"
          >
            <Magnifier />
          </button>

          <div className="rail-sep" />

          <div className="slab-recent" role="list" aria-label="Received lately">
            <span className="recv-strip-lab">lately</span>
            {recent.length === 0 && <span className="recv-strip-lab">nothing yet</span>}
            {recent.map((iv) => {
              const sup = supplierOf(iv);
              const copies = copiesIn(iv);
              return (
                <button
                  key={iv.id}
                  type="button"
                  role="listitem"
                  className={"recv-tile" + (iv.id === selectedId ? " on" : "")}
                  onClick={() => onSelect(iv.id)}
                  title={`${sup?.shortName ?? "—"} ${iv.invoiceNumber} — ${iv.status.toLowerCase()}, ${copies} cop${copies === 1 ? "y" : "ies"}`}
                  aria-label={`${sup?.name ?? "Unknown supplier"} ${iv.invoiceNumber}, ${copies} copies`}
                >
                  <span className="tn">{sup?.shortName ?? "—"}</span>
                  <span className="tc">{copies}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="recv-slab" aria-label="Receive">
      <div className="slab-head">
        <span className="lab">Receive</span>
        <button
          type="button"
          className="rail-ico"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse the worklist"
          title="Collapse — the invoice takes the width"
        >
          <ChevronLeft />
        </button>
      </div>

      <div className="recv-slab-acts">
        <button className="btn primary" onClick={onNewIntake}>
          + New intake
        </button>
        <button className="btn" onClick={onOpenExisting}>
          Open existing
        </button>
      </div>

      <div className="slab-search">
        <input
          ref={searchRef}
          type="search"
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          aria-label="Search invoices — supplier, number, date, title, barcode, PO"
          placeholder="supplier · invoice no. · date · title · PO"
        />
        <p className="xsmall muted" style={{ margin: 0 }}>
          A title or barcode finds the invoices that took that copy in.
        </p>
      </div>

      <div className="slab-list">
        {/* A search reaches past the drafts and the last three into the whole
            history (d36), so it replaces the bands rather than filtering
            them — two lists both claiming to answer one query is worse than
            one that plainly does. */}
        {matches ? (
          <>
            <div className="slab-band">
              <span className="lab">Matching</span>
              <span className="lab">
                {matches.length} invoice{matches.length === 1 ? "" : "s"}
              </span>
            </div>
            {matches.length === 0 && (
              <p className="xsmall muted slab-empty">Nothing matches that.</p>
            )}
            {matches.map((iv) => (
              <InvoiceRow
                key={iv.id}
                invoice={iv}
                supplier={supplierOf(iv)}
                selected={iv.id === selectedId}
                onSelect={onSelect}
                copies={copiesIn(iv)}
                total={invoiceTotal(iv)}
              />
            ))}
          </>
        ) : (
          <>
            <div className="slab-band">
              <span className="lab">In flight</span>
              <span className="lab">
                {drafts.length} draft{drafts.length === 1 ? "" : "s"}
              </span>
            </div>
            {drafts.length === 0 && <p className="xsmall muted slab-empty">No draft open.</p>}
            {drafts.map((iv) => (
              <InvoiceRow
                key={iv.id}
                invoice={iv}
                supplier={supplierOf(iv)}
                selected={iv.id === selectedId}
                onSelect={onSelect}
                copies={copiesIn(iv)}
                total={invoiceTotal(iv)}
              />
            ))}

            <div className="slab-band">
              <span className="lab">Received lately</span>
              <span className="lab">as-was</span>
            </div>
            {recent.length === 0 && <p className="xsmall muted slab-empty">Nothing received yet.</p>}
            {recent.map((iv) => (
              <InvoiceRow
                key={iv.id}
                invoice={iv}
                supplier={supplierOf(iv)}
                selected={iv.id === selectedId}
                onSelect={onSelect}
                copies={copiesIn(iv)}
                total={invoiceTotal(iv)}
              />
            ))}
          </>
        )}
      </div>
    </nav>
  );
}

// One Invoice, wherever it appears. A draft says what it is carrying; a
// finished one says what it cost, because those are the two different
// questions you open them to answer.
function InvoiceRow({
  invoice,
  supplier,
  selected,
  onSelect,
  copies,
  total,
}: {
  invoice: Invoice;
  supplier?: Supplier;
  selected: boolean;
  onSelect: (id: string) => void;
  copies: number;
  total: number;
}) {
  const draft = invoice.status === "Draft";
  return (
    <button className={"wl" + (selected ? " on" : "")} onClick={() => onSelect(invoice.id)}>
      <span className="recv-art">{draft ? "📦" : "🧾"}</span>
      <span className="t">
        {supplier?.shortName} · {invoice.invoiceNumber}
      </span>
      <span className="n">
        {draft ? invoice.lines.length : money(total)}
        <small>{draft ? `line${invoice.lines.length === 1 ? "" : "s"}` : "total"}</small>
      </span>
      <span className="m">
        {draft
          ? `${supplier?.name} · ${invoice.intakeMode.toLowerCase()}`
          : `${invoice.status.toLowerCase()} ${invoice.finalizedAt?.slice(0, 10) ?? ""} · ${copies} cop${copies === 1 ? "y" : "ies"}`}
      </span>
    </button>
  );
}

const ICON = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" } as const;

const ChevronRight = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);
const ChevronLeft = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const Plus = () => (
  <svg {...ICON} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Box = () => (
  <svg {...ICON} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" />
    <path d="M3 7.5L12 12l9-4.5M12 12v9" />
  </svg>
);
const Magnifier = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6" />
    <path d="M15.6 15.6L20 20" />
  </svg>
);
