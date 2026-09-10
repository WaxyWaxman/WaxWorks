import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CURRENT_USER } from "./data/seed";
import { Home } from "./screens/Home";
import { Search } from "./screens/Search";
import { PointOfSale } from "./screens/PointOfSale";
import { ReturnScreen } from "./screens/Return";
import { Claims } from "./screens/Claims";
import { Customers } from "./screens/Customers";
import { Receiving } from "./screens/Receiving";
import { Suppliers } from "./screens/Suppliers";
import { ReviewQueueBadge } from "./components/ReviewQueue";

// The top menu is one band of equal segments (design review — Signal). The
// short word is what staff read; the flow ID stays underneath it because this
// is a review prototype and every screen has to stay citable.
const NAV = [
  { to: "/", label: "Home", flow: "flow map", end: true },
  { to: "/sell", label: "Sell", flow: "E-05" },
  { to: "/search", label: "Find", flow: "E-03/04" },
  { to: "/receiving", label: "Receive", flow: "E-02" },
  { to: "/customers", label: "Customers", flow: "E-07" },
  { to: "/suppliers", label: "Suppliers", flow: "M-01" },
  { to: "/claims", label: "Claims", flow: "E-04" },
];

export function App() {
  const location = useLocation();
  // /return/:saleId has no nav entry of its own — a Return is entered from
  // (and belongs to) Point of Sale, so its editor keeps "E-05 Point of Sale"
  // lit rather than showing no active tab at all.
  const onReturn = location.pathname.startsWith("/return");

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="dot" /> Wax Works
        </NavLink>
        <nav>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive || (n.to === "/sell" && onReturn) ? "active" : "")}
            >
              {n.label}
              <span className="flow">{n.flow}</span>
            </NavLink>
          ))}
        </nav>
        <span className="review-slot">
          <ReviewQueueBadge />
        </span>
        <span className="who">{CURRENT_USER} · Till 1 · Prototype</span>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/search/:recordId" element={<Search />} />
          <Route path="/sell" element={<PointOfSale />} />
          <Route path="/sell/:saleId" element={<PointOfSale />} />
          <Route path="/return/:saleId" element={<ReturnScreen />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/receiving" element={<Receiving />} />
          <Route path="/suppliers" element={<Suppliers />} />
        </Routes>
      </main>
    </div>
  );
}
