import { Link } from "react-router-dom";
import { useApp } from "../store/AppStore";

const BUILT = [
  {
    id: "E-03",
    to: "/search",
    title: "Search the inventory",
    blurb: "Grouped results, catalog-only rows, Discogs-down degradation.",
  },
  {
    id: "E-04",
    to: "/titlecard/r-blue",
    title: "The titlecard",
    blurb: "One Record, every copy, stock + order state. Reserve, re-price (guardrail).",
  },
  {
    id: "E-05",
    to: "/sell",
    title: "Sell a record",
    blurb: "Barcode resolver, line edits, negative inventory, split tender, hold.",
  },
  {
    id: "E-06",
    to: "/return",
    title: "Process a return",
    blurb: "Negative-quantity line, refund default, stock routing.",
  },
  {
    id: "E-07",
    to: "/customers",
    title: "Manage customers",
    blurb: "Lookup, signed balance, discount + tax-line defaults.",
  },
];

const NOT_BUILT = [
  ["E-01", "Authenticate"],
  ["E-02", "Receive inventory"],
  ["M-01", "Supplier margin"],
  ["M-02", "Re-order inventory"],
  ["M-03", "Daily summary"],
  ["M-04", "Manage users"],
  ["M-05", "Accounts payable"],
  ["M-06", "Configure the store"],
];

export function Home() {
  const { sales, discogsUp, toggleDiscogs } = useApp();
  const held = sales.filter((s) => s.state === "Held");
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Wax Works — clickable prototype</h1>
          <p className="sub">
            Counter-core flows built for review: <strong>E-03 → E-04 → E-05 → E-06</strong>, with{" "}
            <strong>E-07</strong> supporting. Every screen is wired to a shared in-memory store, so a
            hold placed on the titlecard shows up at the till, a sale consumes stock, and a return
            puts it back. Use it to make calls on style, content, flow, and behaviour — then record
            them as numbered decisions in the flow docs.
          </p>
        </div>
      </div>

      <div className="legend">
        <span>
          <span className="badge accent">Built</span> clickable, wired to state
        </span>
        <span>
          <span className="badge">Stub</span> not in this first pass
        </span>
        <span className="right">
          Discogs:{" "}
          <button className="btn sm" onClick={toggleDiscogs}>
            {discogsUp ? "🟢 up — click to simulate outage" : "🔴 down — click to restore"}
          </button>
        </span>
      </div>

      <h2>Walk a flow</h2>
      <div className="flowmap" style={{ marginBottom: "var(--sp-6)" }}>
        {BUILT.map((f) => (
          <Link key={f.id} to={f.to} className="flow-card">
            <span className="fid">{f.id}</span>
            <h3>{f.title}</h3>
            <p>{f.blurb}</p>
          </Link>
        ))}
        {held.length > 0 && (
          <Link to="/sell" className="flow-card">
            <span className="fid">HELD</span>
            <h3>{held.length} hold{held.length > 1 ? "s" : ""} waiting</h3>
            <p>{held.map((h) => h.holdRef).join(", ")} — open at the till to tender or cancel.</p>
          </Link>
        )}
      </div>

      <h2>Suggested review path</h2>
      <ol className="small stack">
        <li>
          <strong>E-03 Search</strong> — search “blue”. Check the grouping (one row per Record,
          copies nested), the catalog-only rows, and how it reads when Discogs is down.
        </li>
        <li>
          <strong>E-04 Titlecard</strong> — open Joni Mitchell — Blue. Try <em>Reserve</em> for
          Ramona, and <em>Edit price</em> below cost to see the guardrail + override.
        </li>
        <li>
          <strong>E-05 Sell</strong> — new sale, attach Ramona (watch discount + tax pre-fill),
          scan the Blue UPC (picker), scan <span className="mono">FREIGHT</span> (price prompt),
          split the tender across gift card + cash, then hold or tender.
        </li>
        <li>
          <strong>E-06 Return</strong> — start a return, scan a copy, link it to a prior sale, set
          the refund, then route the returned copy.
        </li>
      </ol>

      <hr className="hr" />
      <h2 className="muted">Not in this pass</h2>
      <div className="flowmap">
        {NOT_BUILT.map(([id, title]) => (
          <div key={id} className="flow-card disabled">
            <span className="fid">{id}</span>
            <h3>{title}</h3>
            <p>Stub — add when the counter core is signed off.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
