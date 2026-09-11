import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Sale } from "../data/types";
import { money } from "../lib/money";
import { saleTotals } from "../lib/totals";
import { useApp } from "../store/AppStore";

// The till rail (E-05 d30). Closed it is a 52px strip of the things you
// START — new sale, new return, holds, past sales. Open it is a drawer of
// the things you COME BACK TO: what is in flight, what just went through,
// and the functions nobody touches with a customer waiting.
//
// It opens OVER the sale rather than pushing it. A push would reflow the
// line list mid-transaction, which is the one thing a till should never do;
// an overlay means the rail can be opened with someone standing there and
// nothing being read moves.
//
// The state is remembered per till (d30) rather than reset per sale — a shop
// that works with it open should never have to fight it. localStorage rather
// than the store because it is a preference of this machine, not of the
// business: it should survive a reload, which the in-memory store does not.
const RAIL_KEY = "waxworks.till.rail";

function loadRailOpen(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "open";
  } catch {
    return false;
  }
}

function saveRailOpen(open: boolean) {
  try {
    localStorage.setItem(RAIL_KEY, open ? "open" : "closed");
  } catch {
    /* private window, or site data blocked — the rail just forgets */
  }
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
const Minus = () => (
  <svg {...ICON} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);
const RecordDisc = () => (
  <svg {...ICON} strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const Magnifier = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6" />
    <path d="M15.6 15.6L20 20" />
  </svg>
);

export function TillRail({
  activeSaleId,
  onHolds,
  onPastSales,
  onOtherFunctions,
}: {
  activeSaleId?: string;
  onHolds: () => void;
  onPastSales: () => void;
  onOtherFunctions: () => void;
}) {
  const app = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(loadRailOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  const setRail = (next: boolean) => {
    setOpen(next);
    saveRailOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRail(false);
      openRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const openSales = app.sales.filter((s) => s.state === "Open" && !s.isReturn);
  const openReturns = app.sales.filter((s) => s.isReturn && s.state === "Open");
  const heldCount = app.sales.filter((s) => s.state === "Held" && !s.isReturn).length;
  const recent = [...app.sales]
    .filter((s) => s.state === "Current" && !s.isReturn)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const inFlight = openSales.length + openReturns.length;

  const newSale = () => nav(`/sell/${app.newSale()}`);
  const newReturn = () => nav(`/return/${app.newSale({ isReturn: true })}`);

  // A sale number is only findable if you already know it; the name is what
  // staff actually remember. Walk-ins say so rather than leaving a gap.
  const whoFor = (s: Sale) => app.customerFor(s.customerId)?.name ?? "Walk-in";
  const totalFor = (s: Sale) => saleTotals(s, app.taxLines).grand;

  const pick = (s: Sale) => {
    nav(s.isReturn ? `/return/${s.id}` : `/sell/${s.id}`);
    // Picking something is the end of the errand the rail was opened for, but
    // it is not a reason to override someone who chose to work with it open.
  };

  return (
    <nav className={"till-rail" + (open ? " open" : "")} aria-label="Till">
      <div className="till-strip">
        <button
          ref={openRef}
          type="button"
          className="rail-ico"
          aria-expanded={open}
          aria-label={open ? "Close till functions" : "Open till functions"}
          title={open ? "Close" : "Till functions"}
          onClick={() => setRail(!open)}
        >
          {open ? <ChevronLeft /> : <ChevronRight />}
          {!open && inFlight > 0 && <span className="rail-badge">{inFlight}</span>}
        </button>

        <div className="rail-sep" />

        <button type="button" className="rail-ico accent" onClick={newSale} aria-label="New sale" title="New sale">
          <Plus />
        </button>
        <button type="button" className="rail-ico" onClick={newReturn} aria-label="New return" title="New return">
          <Minus />
        </button>

        <div className="rail-sep" />

        <button type="button" className="rail-ico" onClick={onHolds} aria-label={`Holds (${heldCount})`} title="Holds">
          <RecordDisc />
          {heldCount > 0 && <span className="rail-badge">{heldCount}</span>}
        </button>
        <button type="button" className="rail-ico" onClick={onPastSales} aria-label="Past sales" title="Past sales">
          <Magnifier />
        </button>
      </div>

      {open && (
        <div className="till-drawer">
          <div className="till-drawer-head">
            <button
              ref={closeRef}
              type="button"
              className="rail-ico"
              onClick={() => {
                setRail(false);
                openRef.current?.focus();
              }}
              aria-label="Close till functions"
              title="Close"
            >
              <ChevronLeft />
            </button>
            <span className="lab">Till</span>
          </div>

          <div className="till-drawer-scroll">
            <div className="rail-group">
              <button className="btn primary rail-wide" onClick={newSale}>
                + New sale
              </button>
              <button className="btn rail-wide" onClick={newReturn}>
                + New return
              </button>
            </div>

            <div className="rail-group">
              <div className="lab rail-group-head">
                <span>Open now</span>
                <span>{inFlight}</span>
              </div>
              {inFlight === 0 && <p className="xsmall muted">Nothing in flight.</p>}
              {openSales.map((s) => (
                <button
                  key={s.id}
                  className={"rail-item" + (s.id === activeSaleId ? " current" : "")}
                  onClick={() => pick(s)}
                >
                  <span className="rail-item-main">
                    <span className="top">
                      Sale · {s.lines.length} line{s.lines.length !== 1 ? "s" : ""}
                    </span>
                    <span className="who">{whoFor(s)}</span>
                  </span>
                  <span className="amt">{money(totalFor(s))}</span>
                </button>
              ))}
              {openReturns.map((s) => (
                <button
                  key={s.id}
                  className={"rail-item" + (s.id === activeSaleId ? " current" : "")}
                  onClick={() => pick(s)}
                >
                  <span className="rail-item-main">
                    <span className="top">
                      Return · {s.lines.length} line{s.lines.length !== 1 ? "s" : ""}
                    </span>
                    <span className="who">{whoFor(s)}</span>
                  </span>
                  <span className="amt">{money(totalFor(s))}</span>
                </button>
              ))}
            </div>

            <div className="rail-group">
              <div className="lab rail-group-head">
                <span>Recent</span>
                <span>today</span>
              </div>
              {recent.length === 0 && <p className="xsmall muted">Nothing tendered yet.</p>}
              {recent.map((s) => (
                <button
                  key={s.id}
                  className={"rail-item" + (s.id === activeSaleId ? " current" : "")}
                  onClick={() => pick(s)}
                >
                  <span className="rail-item-main">
                    <span className="top">#{s.saleNumber}</span>
                    <span className="who">{whoFor(s)}</span>
                  </span>
                  <span className="amt">{money(totalFor(s))}</span>
                </button>
              ))}
            </div>

            <div className="rail-group">
              <div className="lab rail-group-head">
                <span>Till functions</span>
              </div>
              <div className="rail-fns">
                <button className="rail-fn" onClick={onHolds}>
                  <span>Holds</span>
                  <span className="count">{heldCount}</span>
                </button>
                <button className="rail-fn" onClick={onPastSales}>
                  <span>Past sales</span>
                  <span className="count">search</span>
                </button>
                <button className="rail-fn" onClick={onOtherFunctions}>
                  <span>Other functions</span>
                  <span className="count">day close</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
