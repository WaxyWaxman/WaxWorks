import { NavLink, Route, Routes } from "react-router-dom";
import { CURRENT_USER } from "./data/seed";
import { Home } from "./screens/Home";
import { Search } from "./screens/Search";
import { Titlecard } from "./screens/Titlecard";
import { Sell } from "./screens/Sell";
import { Return } from "./screens/Return";
import { Customers } from "./screens/Customers";

const NAV = [
  { to: "/", label: "Flow map", end: true },
  { to: "/search", label: "E-03 Search" },
  { to: "/titlecard/r-blue", label: "E-04 Titlecard" },
  { to: "/sell", label: "E-05 Sell" },
  { to: "/return", label: "E-06 Return" },
  { to: "/customers", label: "E-07 Customers" },
];

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="dot" /> Wax Works
        </span>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <span className="who">{CURRENT_USER} · Till 1 · Prototype</span>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/titlecard/:recordId" element={<Titlecard />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/sell/:saleId" element={<Sell />} />
          <Route path="/return" element={<Return />} />
          <Route path="/customers" element={<Customers />} />
        </Routes>
      </main>
    </div>
  );
}
