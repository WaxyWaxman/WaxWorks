import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { IdentifyProvider, useIdentify } from "./components/Identify";
import { useApp } from "./store/AppStore";
import { Home } from "./screens/Home";
import { Search } from "./screens/Search";
import { PointOfSale } from "./screens/PointOfSale";
import { ReturnScreen } from "./screens/Return";
import { Claims } from "./screens/Claims";
import { Customers } from "./screens/Customers";
import { Receiving } from "./screens/Receiving";
import { OrderProcessing } from "./screens/OrderProcessing";
import { WhatsOnOrder } from "./screens/WhatsOnOrder";
import { Suppliers } from "./screens/Suppliers";
import { AccountsPayable } from "./screens/AccountsPayable";
import { Users } from "./screens/Users";
import { Settings } from "./screens/Settings";
import { ChartOfAccounts } from "./screens/ChartOfAccounts";
import { Ledger } from "./screens/Ledger";
import { SignIn } from "./screens/SignIn";
import { PickStore } from "./screens/PickStore";
import { Organization } from "./screens/Organization";
import { Sysadmin } from "./screens/Sysadmin";
import { ReviewQueueBadge } from "./components/ReviewQueue";
import { useEffect as useEffectShell } from "react";

// The top menu is one band of equal segments (design review — Signal), and it
// carries exactly the three jobs done with a customer at the counter. Everything
// else lives under More.
//
// The split is by WHO IS WAITING, not by how often a screen is used: Find,
// Sell and Receive are the things done with someone standing there, so they
// never cost a click. Accounts payable is used every week and is still under
// More, because nobody is waiting on it.
//
// The short word is what staff read; the flow ID stays underneath it because
// this is a review prototype and every screen has to stay citable.
const PRIMARY_NAV = [
  { to: "/search", label: "Find", flow: "E-03/04" },
  { to: "/sell", label: "Sell", flow: "E-05" },
  { to: "/receiving", label: "Receive", flow: "E-02" },
];

// Grouped so More is a menu rather than a list of ten things. Group names are
// what the work is, not what the screens are called.
const MORE_NAV: { group: string; items: { to: string; label: string; flow: string; end?: boolean }[] }[] = [
  {
    group: "Ordering",
    items: [
      { to: "/orders", label: "Order processing", flow: "M-02" },
      { to: "/on-order", label: "What's on order", flow: "M-02" },
    ],
  },
  {
    group: "Money",
    items: [
      { to: "/payable", label: "Accounts payable", flow: "M-05" },
      { to: "/claims", label: "Supplier claims", flow: "E-04" },
    ],
  },
  {
    group: "Records",
    items: [
      { to: "/customers", label: "Customers", flow: "E-07" },
      { to: "/suppliers", label: "Suppliers", flow: "M-01" },
    ],
  },
  {
    group: "Administration",
    items: [
      { to: "/users", label: "Users", flow: "M-04" },
      { to: "/organization", label: "Organization", flow: "O-01" },
      { to: "/settings", label: "Settings", flow: "M-06" },
      { to: "/chart", label: "Chart of accounts", flow: "M-07" },
      { to: "/ledger", label: "General ledger", flow: "M-08" },
    ],
  },
  {
    group: "This prototype",
    items: [{ to: "/", label: "Flow map", flow: "review path", end: true }],
  },
];

const MORE_PATHS = MORE_NAV.flatMap((g) => g.items.map((i) => i.to));

export function App() {
  return (
    <IdentifyProvider>
      <Gate />
    </IdentifyProvider>
  );
}

// WHO SIGNED IN decides what is on screen (A-87). No principal: the three
// doors. A System Administrator: the administration area and nothing of any
// Store (S-01 d1). A personal session with no Store picked: the picker
// (E-01 d27). Otherwise the shell, on the Store in session.
function Gate() {
  const app = useApp();
  if (!app.principal) return <SignIn />;
  if (app.principal.kind === "sysadmin") return <Sysadmin />;
  if (app.principal.kind === "personal" && !app.principal.selectedStoreId) return <PickStore />;
  return <AppShell />;
}

// E-01's staff session, drawn where the till can see it.
//
// It is an actor and a timer in the browser and nothing else (A-87, A-88), so
// the whole of it lives in the shell: who is in session ON THE STORE SESSION,
// and a lapse that measures INACTIVITY rather than elapsed time — an hour of
// continuous work never prompts, six minutes away does (M-06 d45). On a
// PERSONAL session there is no staff session to lapse: the person is the
// actor (E-01 d27), and the chip shows them and their Store instead.
function SessionChip() {
  const app = useApp();
  const identify = useIdentify();

  // d10 / A-19a — an Open Sale suppresses the lapse on its terminal, whatever
  // the setting says, so a lapse can never strand a locked Sale mid-ring.
  const openSale = app.sales.some((x) => x.state === "Open");
  const lapse = app.storeSettings.sessionLapseSeconds;

  useEffectShell(() => {
    // A-88 — the lapse governs staff sessions on a store session only.
    if (app.isPersonalSession || !app.sessionUser || openSale) return;
    const tick = setInterval(() => {
      const idleFor = (Date.now() - app.sessionLastActivity) / 1000;
      if (idleFor >= lapse) app.endSession();
    }, 1000);
    return () => clearInterval(tick);
  }, [app, openSale, lapse]);

  // Any interaction is activity. Cheap and global rather than sprinkled
  // through every screen, because the rule is about the terminal, not any
  // particular control.
  useEffectShell(() => {
    if (app.isPersonalSession || !app.sessionUser) return;
    const touch = () => app.touchSession();
    document.addEventListener("pointerdown", touch);
    document.addEventListener("keydown", touch);
    return () => {
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
    };
  }, [app]);

  if (!app.sessionUser)
    return (
      <span className="who">
        <button
          className="btn sm primary"
          onClick={() =>
            identify.request({
              reason: "Put your initials on this store session",
              onOk: (u) => app.identify(u.id),
            })
          }
          title="Enter initials — open a session on this terminal"
          aria-label="Enter initials"
        >
          {/* An outline of a person rather than the words: the header strip is
              the till's busiest real estate and this sat in it permanently.
              The label survives as the accessible name and the tooltip, so
              nothing is lost to a screen reader or to a hover. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <span className="idy-none">
          no session · {app.storeDetails.tradingName} · {app.terminalName}
        </span>
      </span>
    );

  // The name opens a small menu carrying Log out, rather than a button sitting
  // permanently on the till's busiest strip. Ending a session on purpose has
  // to be POSSIBLE — the lapse has no maximum (d13) and an Open Sale
  // suppresses it outright (d10), so a till left signed in stays signed in —
  // but it is not a per-minute action, and the width is worth more.
  return <SessionMenu openSale={openSale} />;
}

function SessionMenu({ openSale }: { openSale: boolean }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffectShell(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!app.sessionUser) return null;
  const personal = app.isPersonalSession;
  const lapseMin = Math.round(app.storeSettings.sessionLapseSeconds / 60);
  const otherStores = app.selectableStores().filter((x) => x.id !== app.currentStoreId);

  return (
    <span className="who sess-wrap" ref={wrapRef}>
      <button
        className={"sess-name" + (open ? " on" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {app.sessionUser.name} <span aria-hidden="true">▾</span>
      </button>
      <span className="muted">
        {" "}
        {app.sessionUser.role} · {app.storeDetails.tradingName}
        {personal ? " · as yourself" : ` · ${app.terminalName}`}
        {!personal && openSale ? " · sale open, no lapse" : ""}
      </span>
      {open && (
        <span className="sess-menu" role="menu">
          {personal ? (
            <>
              {otherStores.map((st) => (
                <button
                  key={st.id}
                  className="sess-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    app.selectStore(st.id);
                  }}
                >
                  Switch to {app.storeDetailsFor(st.id).tradingName}
                </button>
              ))}
              <button
                className="sess-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  app.signOut();
                }}
              >
                Sign out
              </button>
              <span className="sess-note">
                Signed in as yourself: nothing asks for initials or a PIN, and nothing lapses
                (E-01 d27). Sign out when you leave this device.
              </span>
            </>
          ) : (
            <>
              <button
                className="sess-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  app.endSession();
                }}
              >
                Log out
              </button>
              <button
                className="sess-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  app.signOut();
                }}
              >
                Sign out of this store account
              </button>
              <span className="sess-note">
                {openSale
                  ? "A Sale is open, so the lapse is suppressed (d10) — this till stays signed in until you log out."
                  : `Lapses after ${lapseMin} min idle (M-06 d45). The store session beneath it does not lapse (E-01 d24).`}
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

function AppShell() {
  const location = useLocation();
  // /return/:saleId has no nav entry of its own — a Return is entered from
  // (and belongs to) Point of Sale, so its editor keeps "Sell" lit rather than
  // showing no active tab at all.
  const onReturn = location.pathname.startsWith("/return");

  // The till owns the whole window rather than scrolling as a document
  // (E-05 d29): its three tracks scroll independently underneath the band, so
  // the frame is pinned to the viewport and the page itself never scrolls.
  //
  // Both till screens: a Return is a till transaction, and E-06 now has the
  // same three tracks (E-06 d9), so the rail follows you across rather than
  // stranding you on a screen with no way back to a Sale in flight.
  const atTill = location.pathname.startsWith("/sell") || onReturn;

  // Find was the second screen built this way, Receiving the third (E-02 d38),
  // Customers the fourth (E-07 d17), Suppliers the fifth (M-01 d17), What's on
  // Order the sixth and Order Processing the seventh (M-02 Phase 2).
  //
  // Three tracks only work if the frame is fixed: a page that scrolls as one
  // document cannot keep the search box and the primary action where they were
  // last time, which is the entire claim the layout makes. Suppliers and
  // What's on Order were re-laid onto the frame without being added here, so
  // both were scrolling as documents and quietly giving that up.
  //
  // Still a list rather than a global rule: Accounts Payable is a long table
  // read top to bottom and loses more than it gains from a fixed frame.
  const ownsWindow =
    atTill ||
    location.pathname.startsWith("/search") ||
    location.pathname.startsWith("/receiving") ||
    location.pathname.startsWith("/customers") ||
    location.pathname.startsWith("/suppliers") ||
    location.pathname.startsWith("/on-order") ||
    location.pathname.startsWith("/orders") ||
    location.pathname.startsWith("/users") ||
    location.pathname.startsWith("/settings");

  return (
    <div className={"app" + (ownsWindow ? " app-fixed" : "")}>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="dot" /> Wax Works
        </NavLink>
        <nav>
          {PRIMARY_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => (isActive || (n.to === "/sell" && onReturn) ? "active" : "")}
            >
              {n.label}
              <span className="flow">{n.flow}</span>
            </NavLink>
          ))}
          <MoreMenu />
        </nav>
        <span className="review-slot">
          <ReviewQueueBadge />
        </span>
        <SessionChip />
      </header>
      <main className={"main" + (ownsWindow ? " main-fixed" : "")}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/search/:recordId" element={<Search />} />
          <Route path="/sell" element={<PointOfSale />} />
          <Route path="/sell/:saleId" element={<PointOfSale />} />
          <Route path="/return/:saleId" element={<ReturnScreen />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:customerId" element={<Customers />} />
          <Route path="/receiving" element={<Receiving />} />
          <Route path="/receiving/:invoiceId" element={<Receiving />} />
          <Route path="/orders" element={<OrderProcessing />} />
          <Route path="/on-order" element={<WhatsOnOrder />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/suppliers/:supplierId" element={<Suppliers />} />
          <Route path="/payable" element={<AccountsPayable />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:userId" element={<Users />} />
          <Route path="/organization" element={<Organization />} />
          <Route path="/chart" element={<ChartOfAccounts />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:group" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

// More is a segment of the band that happens to open a panel. It lights up
// like any other segment when the screen you are on lives inside it, so the
// band never claims nothing is selected.
function MoreMenu() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const holdsCurrent =
    location.pathname === "/" ||
    MORE_PATHS.some((p) => p !== "/" && location.pathname.startsWith(p));

  // Close on route change — otherwise the panel hangs over the screen it just
  // navigated to.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="more-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={"more-btn" + (holdsCurrent || open ? " active" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        More
        <span className="flow">
          {MORE_PATHS.length} more <span aria-hidden="true">▾</span>
        </span>
      </button>

      {open && (
        <div className="more-panel" role="menu">
          {MORE_NAV.map((g) => (
            <div className="more-group" key={g.group}>
              <div className="more-group-head">{g.group}</div>
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  role="menuitem"
                  className={({ isActive }) => "more-item" + (isActive ? " active" : "")}
                >
                  <span>{i.label}</span>
                  <span className="flow">{i.flow}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
