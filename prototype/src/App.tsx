import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CURRENT_USER } from "./data/seed";
import { Home } from "./screens/Home";
import { Search } from "./screens/Search";
import { Sell } from "./screens/Sell";
import { ReturnScreen } from "./screens/Return";
import { Claims } from "./screens/Claims";
import { Customers } from "./screens/Customers";
import { Receiving } from "./screens/Receiving";
import { ReviewQueueBadge } from "./components/ReviewQueue";

const NAV = [
  { to: "/", label: "Flow map", end: true },
  { to: "/search", label: "E-03/E-04 Search" },
  { to: "/sell", label: "E-05 Sell" },
  { to: "/claims", label: "Supplier Claims" },
  { to: "/customers", label: "E-07 Customers" },
  { to: "/receiving", label: "E-02 Receiving" },
];

export function App() {
  const location = useLocation();
  // /return/:saleId has no nav entry of its own — a Return is entered from
  // (and belongs to) Sell, so its editor keeps "E-05 Sell" lit rather than
  // showing no active tab at all.
  const onReturn = location.pathname.startsWith("/return");

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="dot" /> Wax Works
        </span>
        <nav>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive || (n.to === "/sell" && onReturn) ? "active" : "")}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <ReviewQueueBadge />
        <span className="who">{CURRENT_USER} · Till 1 · Prototype</span>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/search/:recordId" element={<Search />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/sell/:saleId" element={<Sell />} />
          <Route path="/return/:saleId" element={<ReturnScreen />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/receiving" element={<Receiving />} />
        </Routes>
      </main>
    </div>
  );
}
