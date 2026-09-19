import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarcodeInput } from "./BarcodeInput";
import { Modal } from "./Modal";
import type { JournalBatch, Sale } from "../data/types";
import type { DayBreakdown } from "../lib/dayBreakdown";
import { money } from "../lib/money";
import { DayReport, RangeReportView } from "./DayReport";
import { computeRangeReport, presetRange, type RangeReport } from "../lib/rangeReport";
import { resolveScan } from "../lib/resolve";
import { saleTotals } from "../lib/totals";
import { datesIn, isImbalanced } from "../lib/journal";
import { useApp } from "../store/AppStore";
import { ManagerAuthorize } from "./ManagerAuthorize";
import { useActor } from "./Identify";

// The things nobody touches with a customer waiting: past Sales, the holds
// list, and the day close (M-03). They belong to the TILL rather than to the
// Sell screen — the rail carries them, so every screen that mounts the rail
// gets them, Returns included (E-05 d30, E-06 d9).

type HoldSort = "age" | "customer" | "ref" | "items";

// A single "View Holds" replaces one quick-scan button per Held Sale, which
// gets unreadable once a store has 20+ holds going at once — search plus
// sortable columns instead of a wall of buttons.
export function HoldsModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<HoldSort>("age");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const ageMs = (sale: Sale) => {
    const created = new Date(sale.createdAt.replace(" ", "T"));
    return Number.isNaN(created.getTime()) ? 0 : Date.now() - created.getTime();
  };
  const ageLabel = (ms: number) => {
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 1) return "under an hour";
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  const rows = useMemo(() => {
    const held = app.sales.filter((s) => s.state === "Held" && !s.isReturn);
    const query = q.trim().toLowerCase();
    const filtered = query
      ? held.filter((s) => {
          const cust = app.customerFor(s.customerId);
          const haystack = [s.holdRef, s.po, cust?.name, cust?.phone, cust?.email, ...s.lines.map((l) => l.title)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : held;

    const withMeta = filtered.map((s) => ({ sale: s, customer: app.customerFor(s.customerId), ageMs: ageMs(s) }));
    withMeta.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "customer":
          cmp = (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "");
          break;
        case "ref":
          cmp = (a.sale.holdRef ?? "").localeCompare(b.sale.holdRef ?? "");
          break;
        case "items":
          cmp = a.sale.lines.length - b.sale.lines.length;
          break;
        case "age":
          cmp = a.ageMs - b.ageMs;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return withMeta;
  }, [app.sales, q, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: HoldSort) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sortArrow = (key: HoldSort) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <Modal title="Held Sales" onClose={onClose}>
      <div className="stack">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by customer, hold ref, PO, or item…"
        />
        <table className="data">
          <thead>
            <tr>
              <th className="row-click" onClick={() => toggleSort("ref")}>
                Hold{sortArrow("ref")}
              </th>
              <th className="row-click" onClick={() => toggleSort("customer")}>
                Customer{sortArrow("customer")}
              </th>
              <th className="row-click" onClick={() => toggleSort("items")}>
                Items{sortArrow("items")}
              </th>
              <th className="row-click" onClick={() => toggleSort("age")}>
                Age{sortArrow("age")}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sale, customer, ageMs: age }) => (
              <tr key={sale.id}>
                <td className="mono">{sale.holdRef}</td>
                <td>{customer?.name ?? "—"}</td>
                <td className="small">
                  {sale.lines.length} line{sale.lines.length !== 1 ? "s" : ""}
                  <div className="xsmall muted">{sale.lines.map((l) => l.title).join(", ")}</div>
                </td>
                <td className="small">{ageLabel(age)}</td>
                <td className="num">
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      nav(`/sell/${sale.id}`);
                      onClose();
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="small muted">
                  No holds{q ? " matching that search" : " right now"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// The primary job here is scanning recent Current Sales for entry errors
// before end-of-day close, not hunting for one item's history — so the
// default (nothing typed) is a plain recency list of Current Sales, and
// item/transaction/customer/date each narrow it further. Any filter widens
// scope to every non-Open Sale, since by then the Employee is looking for
// something specific rather than skimming.
export function SearchModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [txQuery, setTxQuery] = useState("");
  const [custQuery, setCustQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");

  // Resolves the same way the till's barcode field does: an internal
  // barcode narrows to one copy, a manufacturer UPC narrows to the Record
  // (any copy sold under it, since condition/price vary line to line).
  const codeFilter = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const res = resolveScan(trimmed, app);
    if (res.kind === "internal") return { itemId: res.item.id as string | undefined, recordId: res.record.id as string | undefined, noMatch: false };
    if (res.kind === "upc-single" || res.kind === "upc-multi")
      return { itemId: undefined, recordId: res.record.id as string | undefined, noMatch: false };
    return { itemId: undefined, recordId: undefined, noMatch: true };
  }, [code, app]);

  const hasFilter = !!(code.trim() || txQuery.trim() || custQuery.trim() || dateQuery);

  const rows = useMemo(() => {
    const txQ = txQuery.trim().toLowerCase();
    const custQ = custQuery.trim().toLowerCase();

    const matches = (sale: Sale) => {
      if (codeFilter) {
        if (codeFilter.noMatch) return false;
        const onSale = sale.lines.some((l) =>
          codeFilter.itemId ? l.inventoryItemId === codeFilter.itemId : l.recordId === codeFilter.recordId,
        );
        if (!onSale) return false;
      }
      if (txQ) {
        const label = (sale.saleNumber ? String(sale.saleNumber) : sale.holdRef ?? "").toLowerCase();
        if (!label.includes(txQ)) return false;
      }
      if (custQ) {
        const cust = app.customerFor(sale.customerId);
        if (!cust?.name.toLowerCase().includes(custQ)) return false;
      }
      if (dateQuery && sale.createdAt.slice(0, 10) !== dateQuery) return false;
      return true;
    };

    const scope = hasFilter ? app.sales.filter((s) => s.state !== "Open") : app.sales.filter((s) => s.state === "Current");
    return scope.filter(matches).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [app.sales, codeFilter, txQuery, custQuery, dateQuery, hasFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Search — past Sales" onClose={onClose} wide>
      <div className="stack">
        <p className="small muted">
          {hasFilter
            ? `${rows.length} matching Sale${rows.length !== 1 ? "s" : ""}, most recent first.`
            : "Current Sales, most recent first. Scan an item, or search by transaction #, customer, or date to widen the search to every Sale."}
        </p>
        <div className="row wrap">
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Transaction # / hold ref</span>
            <input type="text" value={txQuery} onChange={(e) => setTxQuery(e.target.value)} placeholder="e.g. 100241 or H3" />
          </label>
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Customer name</span>
            <input type="text" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="e.g. Vasquez" />
          </label>
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Date</span>
            <input type="date" value={dateQuery} onChange={(e) => setDateQuery(e.target.value)} />
          </label>
        </div>
        <BarcodeInput onScan={setCode} placeholder="…or scan/type an item barcode" />
        {code && codeFilter?.noMatch && <div className="callout danger">No catalog match for "{code}".</div>}

        <table className="data">
          <thead>
            <tr>
              <th>Sale</th>
              <th>When</th>
              <th>Customer</th>
              <th>Items</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((sale) => {
              const cust = app.customerFor(sale.customerId);
              const totals = saleTotals(sale, app.taxCtxFor(sale));
              return (
                <tr key={sale.id}>
                  <td>
                    {sale.isReturn && <span className="badge warn">Return</span>}{" "}
                    {sale.saleNumber ? (
                      <>
                        #{sale.saleNumber}{" "}
                        <span className={"badge" + (sale.state === "Closed" ? "" : sale.state === "Void" ? " danger" : " ok")}>
                          {sale.state}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="mono">{sale.holdRef}</span> <span className="badge">{sale.state}</span>
                      </>
                    )}
                  </td>
                  <td className="small mono">{sale.createdAt}</td>
                  <td className="small">{cust?.name ?? "—"}</td>
                  <td className="small muted">
                    {sale.lines.length} line{sale.lines.length !== 1 ? "s" : ""}
                    <div className="xsmall">{sale.lines.map((l) => l.title).join(", ")}</div>
                  </td>
                  <td className="num">{money(totals.grand)}</td>
                  <td className="num">
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        nav(sale.isReturn ? `/return/${sale.id}` : `/sell/${sale.id}`);
                        onClose();
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="small muted">
                  No Sales match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function OtherFunctionsModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  // The batch awaiting a Manager, and whoever holds the session — `undefined`
  // when nobody does, which is not a gap: the store then records the
  // authorizing Manager as the actor too, because with no session open they
  // are the person standing at the terminal. M-04 d4 gets both names either
  // way, and the till asks once rather than twice.
  const [undoing, setUndoing] = useState<{ batchId: string; actor?: string } | null>(null);
  const withActor = useActor();
  const [breakdown, setBreakdown] = useState<{
    closing: boolean;
    data: DayBreakdown;
    // M-07 d7 — what the close wrote beside the summary. Present only on a
    // real close: View Subtotal touches nothing and therefore writes nothing.
    journal?: {
      batch: JournalBatch;
      unresolved: string[];
      ambiguousTenders: string[];
    };
  } | null>(null);
  // d27 — the range report is its own view over the same eight sections minus
  // the listing. Separate state from `breakdown` because it is a different
  // scope, not a different rendering of the batch in flight.
  const [range, setRange] = useState<RangeReport | null>(null);
  // A-84 — a retired batch is history: it keeps its summary and nothing sums
  // it, and it is not offered for undo a second time.
  const openBatches = app.closeBatches.filter((b) => !b.undoneAt);

  // FIRST, above every other view. Undo is reached from the Other Functions
  // list, where neither `range` nor `breakdown` is set — so a branch nested
  // under one of those never renders, the button does nothing, and the
  // pending batch then surfaces this dialog on whatever view opens next.
  // Cancelling or confirming clears `undoing` and drops back to the list
  // underneath.
  if (undoing) {
    return (
      <ManagerAuthorize
        title="Undo End of Day — manager only"
        reason={
          "Reopens settled takings: the batch's Sales return to Current (M-03 d4). Manager-only under architecture A-28a." +
          (undoing.actor
            ? ` Recorded against ${undoing.actor}, whose session this does not replace (M-04 d3, d4).`
            : " Nobody is signed in, so this is recorded against you alone (M-04 d4).")
        }
        onConfirm={(by) => {
          app.undoEndOfDay(undoing.batchId, by, undoing.actor);
          setUndoing(null);
        }}
        onCancel={() => setUndoing(null)}
      />
    );
  }

  if (range) {
    return (
      <Modal title={`Sales — ${range.from} to ${range.to}`} onClose={() => setRange(null)}>
        <RangeReportView data={range} />
      </Modal>
    );
  }

  if (breakdown) {
    return (
      <Modal title={breakdown.closing ? "Today's Sales — Totalled" : "Subtotal"} onClose={onClose}>
        <DayReport data={breakdown.data} />
        {breakdown.closing && (
          <div className="callout ok" style={{ marginTop: "var(--sp-3)" }}>
            Current Sales moved to Closed. Undo from Other Functions if needed.
          </div>
        )}
        {breakdown.journal && <JournalNotice {...breakdown.journal} />}
      </Modal>
    );
  }

  return (
    <Modal title="Other Functions" onClose={onClose}>
      <div className="stack">
        <div className="card">
          <div className="card-body btn-row">
            <button className="btn" onClick={() => setBreakdown({ closing: false, data: app.viewSubtotal() })}>
              View Subtotal
            </button>
            <button
              className="btn primary"
              // Tier 2 (E-01 d5). M-03 records the closing User on the
              // CloseBatch, so this cannot ride a constant.
              onClick={() =>
                withActor("Total Today's Sales", (actor) => {
                  const { breakdown: data, journal, unresolved, ambiguousTenders } = app.totalTodaysSales(actor);
                  setBreakdown({ closing: true, data, journal: { batch: journal, unresolved, ambiguousTenders } });
                })
              }
            >
              Total Today's Sales
            </button>
          </div>
          {/* d27 — the SECOND entry point. A read: it closes nothing, and it
              sums closed batches, so the batch in flight is invisible to it.
              That is why View Subtotal stays beside it rather than being
              replaced by it. */}
          <div className="card-body btn-row" style={{ paddingTop: 0 }}>
            {(["this-month", "last-month", "ytd"] as const).map((preset) => (
              <button
                key={preset}
                className="btn"
                onClick={() => {
                  const { from, to } = presetRange(preset, new Date());
                  setRange(computeRangeReport(app.closeBatches, from, to, new Date().toISOString()));
                }}
              >
                {preset === "this-month" ? "This month" : preset === "last-month" ? "Last month" : "Year to date"}
              </button>
            ))}
          </div>
          <div className="card-body xsmall muted" style={{ paddingTop: 0 }}>
            Total Today's Sales moves every Current Sale to Closed — no longer editable except via
            Undo End of Day below (M-03).
          </div>
        </div>

        <div className="card">
          <div className="card-head">Undo End of Day (Admin)</div>
          <div className="card-body stack">
            {openBatches.length === 0 && <p className="small muted">No batches to undo.</p>}
            {openBatches.map((b) => {
              // M-08 d11 — "nothing may write into a sealed period, BY ANY
              // ROUTE, including M-03's Undo End of Day, which is the one
              // reversal in this system that does not post forward." Every
              // other correction appends a dated entry (M-07 d8); this one
              // reaches back and restates the day.
              //
              // The predicate is the LEDGER's and lives in lib/ledgerPeriods.ts.
              // Read here to disable and explain, and read again inside
              // undoEndOfDay to refuse — A-48: a bound enforced in the client
              // is not a bound, so the screen being helpful is not the guard.
              const sealedWhy = app.closeUndoRefusalFor(b.id);
              return (
                <div key={b.id} className="stack">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="small">
                      Batch <span className="mono">{b.id}</span> — {b.saleIds.length} Sale
                      {b.saleIds.length === 1 ? "" : "s"} — {b.at} by {b.by}
                    </span>
                    <button
                      className="btn sm danger"
                      // Manager-only (A-28a, M-03 d4) — it reopens settled takings.
                      // Reads the session directly rather than going through
                      // `withActor`: that helper prompts when nobody is signed
                      // in, which would ask for initials twice for one act. The
                      // Manager about to authorize IS the actor in that case,
                      // so there is nothing a first prompt could learn.
                      disabled={sealedWhy !== undefined}
                      onClick={() =>
                        setUndoing({
                          batchId: b.id,
                          actor: app.sessionUser ? `${app.sessionUser.name} (${app.sessionUser.role})` : undefined,
                        })
                      }
                    >
                      Undo
                    </button>
                  </div>
                  {sealedWhy && <p className="wo-caveat warn small">{sealedWhy}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * M-07 d10's SECOND mechanism, at the surface it names: *"the Manager is
 * told."*
 *
 * Suspense keeps the journal balanced by construction, so the export is always
 * a valid document — and telling the Manager is what stops a balanced-but-wrong
 * journal going quiet, which is the failure Suspense would otherwise introduce.
 * Two mechanisms, not two options.
 *
 * Deliberately NOT a journal view. d9 gives this flow no dashboard, no balances
 * and no journal display — *"a read-only journal view would be the first step
 * back toward the ledger decision 1 declined."* This is a receipt for a thing
 * that happened, in the close's own screen rather than in M-07's, and it counts
 * lines rather than showing them.
 */
function JournalNotice({
  batch,
  unresolved,
  ambiguousTenders,
}: {
  batch: JournalBatch;
  unresolved: string[];
  ambiguousTenders: string[];
}) {
  const dates = datesIn(batch);
  const bad = isImbalanced(batch);
  return (
    <div className={`callout ${bad ? "warn" : "ok"}`} style={{ marginTop: "var(--sp-2)" }}>
      {bad ? (
        <>
          <strong>The journal did not balance, and the close went through anyway.</strong> {money(batch.suspense ?? 0)}{" "}
          went to <strong>Suspense</strong> so the books stay a valid document (d10).{" "}
          <strong>Nobody at the till caused this and nobody can correct it</strong> — a figure in Suspense is always a
          defect in this software. It has been raised in the review queue; report it.
          {unresolved.length > 0 && (
            <>
              {" "}
              What could not be resolved: {unresolved.join("; ")}.
            </>
          )}
        </>
      ) : (
        <>
          <strong>Journal written</strong> onto this batch — {batch.lines.length} line
          {batch.lines.length === 1 ? "" : "s"}
          {dates.length > 1 ? (
            <>
              {" "}
              across <strong>{dates.length} business dates</strong> ({dates.join(", ")}), because this close swept more
              than one day (d14). Each day is dated its own, not today.
            </>
          ) : (
            <> dated {dates[0] ?? "—"}.</>
          )}{" "}
          Balanced. It posts nowhere else, and it is written by the close itself (d12) — no sweep, no posting queue.
          A month end now runs in <strong>Keep the general ledger</strong> (M-08), where a period is sealed; d12's
          objection to a month-end routine was answered by M-07 d27 and architecture A-75, not ignored.
          {/* d24 — a balanced journal can still have had a date guessed for it,
              and Suspense cannot see that. Shown on the balanced branch too, or
              the one case that needs saying is the one case never said. */}
          {unresolved.length > 0 && (
            <>
              {" "}
              <strong>But:</strong> {unresolved.join("; ")}
            </>
          )}
        </>
      )}
      {ambiguousTenders.length > 0 && (
        <p className="small" style={{ marginTop: "var(--sp-2)" }}>
          <strong>Told apart only by behaviour:</strong> {ambiguousTenders.join(", ")}. More than one configured tender
          shares each of these, and a Sale records the behaviour rather than the tender — so every one of them posted to
          a single account. M-06 d22 gives Visa and Mastercard separate accounts <em>because they settle as separate
          deposits</em>, and that reconciliation is not reachable until the till offers the configured tenders. Raised
          against E-05.
        </p>
      )}
    </div>
  );
}
