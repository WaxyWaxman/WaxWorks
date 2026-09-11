import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CURRENT_USER } from "./data/seed";
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
import { ReviewQueueBadge } from "./components/ReviewQueue";

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
    group: "This prototype",
    items: [{ to: "/", label: "Flow map", flow: "review path", end: true }],
  },
];

const MORE_PATHS = MORE_NAV.flatMap((g) => g.items.map((i) => i.to));

export function App() {
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

  // Find was the second screen built this way, Receiving the third (E-02
  // d38) and Customers the fourth (E-07 d17). Three tracks only work if the frame is fixed: a page that scrolls as
  // one document cannot keep the scan field and the reconcile check where they
  // were. Still scoped to these screens rather than made a global rule — the
  // remaining long tables (Order Processing, Accounts Payable) are read top to
  // bottom and lose more than they gain from a fixed frame.
  const ownsWindow =
    atTill ||
    location.pathname.startsWith("/search") ||
    location.pathname.startsWith("/receiving") ||
    location.pathname.startsWith("/customers");

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
        <span className="who">{CURRENT_USER} · Till 1 · Prototype</span>
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
