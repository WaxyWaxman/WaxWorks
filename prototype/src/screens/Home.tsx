import { Link } from "react-router-dom";
import { useApp } from "../store/AppStore";

const BUILT = [
  {
    id: "E-03 / E-04",
    to: "/search/r-blue",
    title: "Search & the titlecard",
    blurb:
      "One screen: grouped results, catalog-only rows, catalog-provider-down degradation, click a Record " +
      "to open its titlecard above — every copy, stock + order state, Put on hold, re-price (guardrail).",
  },
  {
    id: "E-05",
    to: "/sell",
    title: "Point of Sale",
    blurb: "Barcode resolver, line edits, negative inventory, split tender, hold, Edit/Copy/Void, Search, end-of-day close.",
  },
  {
    id: "E-06",
    to: "/sell",
    title: "Process a return",
    blurb:
      "Click + New Return on E-05 Point of Sale to open it — negative-quantity line, refund default, " +
      "stock routing. Distinct from a supplier claim (below).",
  },
  {
    id: "E-07",
    to: "/customers",
    title: "Manage customers",
    blurb: "Lookup, signed balance, discount + tax-line defaults.",
  },
  {
    id: "CLAIMS",
    to: "/claims",
    title: "Supplier claims",
    blurb:
      "Credit from a supplier for short/damaged/unshipped stock — not a customer return. Raised " +
      "from a titlecard's Claim vs. supplier button, batched by supplier, sent with a claim number.",
  },
  {
    id: "E-02",
    to: "/receiving",
    title: "Receive inventory",
    blurb:
      "Open an invoice, scan/identify each record, price it against the supplier's margin " +
      "(sticky price, below-cost guardrail), then reconcile and finalize — nothing's sellable " +
      "before that.",
  },
  {
    id: "M-02",
    to: "/orders",
    title: "Order Processing",
    blurb:
      "Phases 1 and 2. Raise a pending line from a titlecard's Order button (supplier/separator/qty/price/" +
      "customer/follow-up). Order Processing lists one line per supplier + separator — click a row to View " +
      "its lines and titlecards, edit qty/price/separator, or Process it into a PurchaseOrder (auto PO number, " +
      "email or printable). Phase 3 (on-order tracking) isn't built.",
  },
];

const NOT_BUILT = [
  ["E-01", "Authenticate"],
  ["M-01", "Supplier margin"],
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
            Counter-core flows built for review: <strong>E-02 → E-03 → E-04 → E-05 → E-06</strong>,
            with <strong>E-07</strong> supporting and <strong>Supplier Claims</strong> (from E-04)
            alongside. E-03 and E-04 share one screen — search, then open a Record's titlecard
            inline. A <strong>Return</strong> (customer refund) starts from E-05 Point of Sale's{" "}
            <em>+ New Return</em> and opens the E-06 editor; a <strong>Supplier Claim</strong> (credit
            from a supplier for short/damaged stock) is a different thing entirely, raised from a
            titlecard and sent from its own screen. Every screen is wired to a shared in-memory
            store, so a copy received on E-02 is what you'll find when you search for it, a hold
            placed on the titlecard shows up at the till, a sale consumes stock, a return puts it
            back, and a claim lands in Supplier Claims to batch and send. Use it to make calls on
            style, content, flow, and behavior — then record them as numbered decisions in the flow
            docs.
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
          Catalog provider:{" "}
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
          <strong>E-02 Receiving</strong> — start a New-stock intake from F.A.B. Distribution.
          Scan the Blue UPC (a local hit — Blue's already stocked) at list $27.99 to see the
          suggested-retail worked example ($44.99, 60% margin); scan it again and the sticky
          price it just set takes over. Then scan Horses's UPC to watch a catalog-only title pull
          in — try an accepted price below cost to see it proceed and raise a review flag, and
          reconcile the total beyond ±2% for the same reason. Finalize, then go find your new
          copies in Search.
        </li>
        <li>
          <strong>E-03/E-04 Search</strong> — search “blue”. Check the grouping (one row per
          Record, copies nested), the catalog-only rows, and how it reads when the catalog
          provider is down.
          Click the Joni Mitchell — Blue row (or its Put on hold button) to see the titlecard above
          update in place. Try <em>Put on hold</em> for Ramona twice under the same PO (watch it
          merge onto one hold), and <em>Edit price</em> below cost to see it proceed and raise a
          review flag (M-04 decision 8) instead of blocking.
        </li>
        <li>
          <strong>E-05 Point of Sale</strong> — new sale, attach Ramona (watch discount + tax
          pre-fill), scan the Blue UPC (picker), scan <span className="mono">FREIGHT</span> (price
          prompt), split the tender across gift card + cash, then hold or tender.
        </li>
        <li>
          <strong>E-06 Return</strong> — on E-05 Point of Sale, click <em>+ New Return</em> (opens
          the E-06 editor, not the Sale one). Scan a copy, link it to a prior sale, set the refund,
          then route the returned copy.
        </li>
        <li>
          <strong>Supplier Claims</strong> — open the Joni Mitchell — Blue titlecard (it arrived on
          a F.A.B. invoice) and click <em>Claim vs. supplier</em>. Raise a couple of claims under
          the same supplier and separator to see them merge onto one Draft, then send it from the{" "}
          <strong>Supplier Claims</strong> screen and mark it Credited.
        </li>
        <li>
          <strong>M-02 Order Processing</strong> — from the Joni Mitchell — Blue titlecard, click{" "}
          <em>Order</em> to raise a pending line (try attaching Ramona as the customer). Then open{" "}
          <strong>Order Processing</strong>: F.A.B. Distribution's stream now includes it — click
          anywhere on the row to <em>View</em>, check the titlecard, edit a qty or sell price
          inline, then <em>Process</em> and leave the PO number blank to watch it auto-assign. Crate
          Digger Wholesale (Order via <em>Email</em>) has two streams — its default stream and a
          rush "R" stream that alone already meets the 10-unit minimum (
          <span className="badge ok">Ready</span>) — try the Sep dropdown to merge them, then
          Process the Email one to see the composed order preview. Previously placed POs (F.A.B.'s
          PO-1042, Indie Direct's PO-77) sit below, most recent first.
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
