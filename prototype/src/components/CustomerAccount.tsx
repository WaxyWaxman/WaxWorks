import { useNavigate } from "react-router-dom";
import { balState, plainName } from "./CustomerSlab";
import type { Customer } from "../data/types";
import type { CustomerFacts } from "../lib/customerFacts";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";

// ---- Track 3: the account (E-07 d19, d20) ----
//
// The till's money track doing the customer job, in the order d19 sets:
// what is waiting for them, the signed balance, standing, the two
// till-affecting fields, on-order lines, recent sales, and what moved the
// balance. Head and foot are fixed and only the middle scrolls, so the
// primary action sits in the same place on a quiet regular and on a business
// account with six movements — the same reason Finish sale has its own floor.
export function CustomerAccount({
  customer,
  facts,
}: {
  customer: Customer;
  facts: CustomerFacts;
}) {
  const app = useApp();
  const nav = useNavigate();
  const st = balState(customer.balance);

  // d20's ladder. A Customer with something on the hold shelf outranks an
  // anonymous Sale at the till, because the hold is the one that goes stale
  // silently (E-05 d7). Merging the two is deliberately NOT offered — that
  // needs its own decision (E-05 d23, d3), so the in-flight Sale is a separate
  // rung rather than something folded into the hold.
  const inFlight = app.sales.find((s) => s.state === "Open" && !s.isReturn) ?? null;
  const hold = facts.held[0];

  const openHold = () => {
    app.setActiveSale(hold.saleId);
    nav(`/sell/${hold.saleId}`);
  };
  const attach = (saleId: string) => {
    app.attachCustomer(saleId, customer.id);
    nav(`/sell/${saleId}`);
  };
  const startSale = () => {
    const id = app.newSale();
    app.attachCustomer(id, customer.id);
    nav(`/sell/${id}`);
  };

  // A business has no first name — "New Sale with Left" is not what anyone
  // calls them. Drop any parenthetical qualifier and keep the whole trading
  // name; the button is two lines tall and centred, so it fits.
  const shortName =
    customer.accountType === "Business"
      ? plainName(customer.name) || "this account"
      : plainName(customer.name).split(/\s+/)[0] || "customer";

  return (
    <aside className="cust-acct" aria-label="Account and actions">
      {/* 1. Waiting, above the balance: a hold does not expire and nothing else
             chases it, so this screen is where it stops being invisible. */}
      <div className={"cust-waiting" + (facts.held.length > 0 ? " live" : "")}>
        <div className="lab">Waiting for them</div>
        {facts.held.length === 0 ? (
          <div className="xsmall muted">Nothing held, nothing to collect.</div>
        ) : (
          facts.held.map((h) => (
            <div key={h.saleId} className="wait-row">
              <span className="wait-t">
                {h.titles[0] ?? "(no lines)"}
                {h.titles.length > 1 && (
                  <span className="muted"> +{h.titles.length - 1} more</span>
                )}
              </span>
              <span className="wait-ref">{h.holdRef}</span>
              <span className="wait-m">
                {h.qty} {h.qty === 1 ? "copy" : "copies"} held · <strong>{h.days} days</strong> ·
                contact by {customer.contactPreference.toLowerCase()}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 2. The balance — small when settled, because most Customers never
             carry one and a big zero is the least informative figure here. */}
      <div className="cust-acct-head">
        <div className="lab">Account balance</div>
        <div className={"cust-figure " + st}>{money(customer.balance)}</div>
        <div className="cust-figure-say">
          {st === "credit" ? "Store credit" : st === "owed" ? "Owed to the store" : "Settled"}
        </div>
        <div className="cust-figure-sub">
          {st === "credit"
            ? "Spendable at the till on the Account Balance tender."
            : st === "owed"
              ? "Outstanding against their account, not tendered at the till."
              : "Nothing runs either way."}
        </div>
      </div>
      <div className="cust-rule" />

      <div className="cust-acct-mid">
        {/* 3. Standing. PRD G-4 and the Manager's "top customers by quantity or
               life-time value". Reporting only — NG-2 says there is no loyalty
               programme, so these never become tiers or automatic discounts. */}
        <div className="cust-sec">
          <span className="lab">Standing</span>
          <div className="cust-standing">
            <Stat k="This year" v={money(facts.thisYear)} />
            <Stat k="Last year" v={money(facts.lastYear)} />
            <div className="stat span">
              <span className="v">
                {money(facts.lifetime)} · {facts.saleCount}{" "}
                {facts.saleCount === 1 ? "sale" : "sales"}
              </span>
              <span className="k">Lifetime</span>
            </div>
          </div>
        </div>

        {/* 4. What they change at the till — the two fields d19 moves off the
               card, because they describe a counterparty rather than a person. */}
        <div className="cust-sec">
          <span className="lab">What they change at the till</span>
          <label className="field">
            <span>Global discount (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={customer.globalDiscountPct}
              onChange={(e) =>
                app.updateCustomer(customer.id, { globalDiscountPct: Number(e.target.value) || 0 })
              }
            />
            <span className="hint">
              Pre-fills every Sale line; a changed line discount still overrides it (d6).
            </span>
          </label>
          <label className="field">
            <span>Default tax line</span>
            <select
              value={customer.defaultTaxLineId ?? ""}
              onChange={(e) =>
                app.updateCustomer(customer.id, { defaultTaxLineId: e.target.value || undefined })
              }
            >
              <option value="">— none (uses the item's) —</option>
              {app.taxLines.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Overrides the item's tax line at the till when set (d7).
            </span>
          </label>
        </div>

        {/* 5. On order — coming, not here. A received line becomes a Held Sale
               of its own (M-02 d13) and moves up into Waiting. */}
        <div className="cust-sec">
          <span className="lab">On order</span>
          {facts.openOrders.length === 0 ? (
            <div className="xsmall muted">Nothing on order for them.</div>
          ) : (
            facts.openOrders.map((o) => (
              <div key={o.line.id} className="cust-ord">
                <span className="t">{o.title}</span>
                <span className={"badge " + orderBadge(o.state)}>{o.state}</span>
                <span className="m">
                  {o.outstanding} × ·{" "}
                  {o.line.poNumber ? `PO ${o.line.poNumber}` : "no PO number yet"}
                  {o.line.expectedDate ? ` · due ${o.line.expectedDate}` : ""}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="cust-sec">
          <span className="lab">Recent sales</span>
          {facts.recentSales.length === 0 ? (
            <div className="xsmall muted">No sales yet.</div>
          ) : (
            facts.recentSales.slice(0, 6).map((s) => (
              <div key={s.saleId} className="cust-salerow">
                <span className="t">#{s.saleNumber}</span>
                <span className="m">{s.at}</span>
                <span className="v">{money(s.total)}</span>
              </div>
            ))
          )}
        </div>

        {/* 7. Only when there are any. E-07 records that showing these at all
               is an inference, so an empty section would be asserting it twice. */}
        {(facts.movements.length > 0 || customer.balance !== 0) && (
          <div className="cust-sec">
            <span className="lab">What moved the balance</span>
            {/* A non-zero balance with nothing behind it is worth saying out
                loud rather than leaving as silence — it means the figure came
                from somewhere this screen cannot show. */}
            {facts.movements.length === 0 && (
              <div className="xsmall muted">
                No movements recorded against this balance — it predates anything the till has
                tendered to this account.
              </div>
            )}
            {facts.movements.map((m, i) => (
              <div key={i} className="cust-mv">
                <span className="what">{m.label}</span>
                <span className={"amt " + (m.amount > 0 ? "credit" : "owed")}>
                  {money(m.amount)}
                </span>
                <span className="when">
                  {m.ref} · {m.at}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cust-acct-foot">
        {hold ? (
          <>
            <button className="btn primary cust-primary" onClick={openHold}>
              Open hold {hold.holdRef}
            </button>
            <div className="cust-foot-sub">
              {hold.qty} {hold.qty === 1 ? "copy" : "copies"} · held {hold.days} days · contact by{" "}
              {customer.contactPreference.toLowerCase()}
            </div>
            {inFlight && (
              <button className="btn cust-secondary" onClick={() => attach(inFlight.id)}>
                Attach to the Sale in flight instead
              </button>
            )}
          </>
        ) : inFlight ? (
          <>
            <button className="btn primary cust-primary" onClick={() => attach(inFlight.id)}>
              Attach to Sale in flight
            </button>
            <div className="cust-foot-sub">
              {customer.globalDiscountPct > 0
                ? `Their ${customer.globalDiscountPct}% pre-fills every line; a changed line discount still overrides it.`
                : "Their tax line replaces the item's on every line already rung up."}
            </div>
          </>
        ) : (
          <>
            <button className="btn primary cust-primary" onClick={startSale}>
              New Sale with {shortName}
            </button>
            <div className="cust-foot-sub">
              Opens a Sale at the till with their discount and tax line already on it.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// The account track for the blank card: replaced by a band that says why it is
// empty, rather than left as a hole, and keeping Add in the same place the
// primary action sits on an open card.
export function NewCustomerAccount({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  return (
    <aside className="cust-acct" aria-label="Account">
      <div className="cust-acct-head">
        <div className="lab">Account balance</div>
        <div className="cust-figure nil">—</div>
        <div className="cust-figure-say">Nothing yet</div>
      </div>
      <div className="cust-rule" />
      <div className="cust-acct-blank">
        No account until the record exists. The Primary ID is assigned on save, and the balance
        starts at zero — it can only move through a Sale, a Return or a counter buy.
      </div>
      <div className="cust-acct-foot">
        <button className="btn primary cust-primary" disabled={!canAdd} onClick={onAdd}>
          Add customer
        </button>
        <div className="cust-foot-sub">
          Name and a unique account number are the only two required.
        </div>
      </div>
    </aside>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <span className="v">{v}</span>
      <span className="k">{k}</span>
    </div>
  );
}

// M-02's own states. Shipped is something a supplier said out loud, so it reads
// as progress; Backordered is a delay worth seeing.
function orderBadge(state: string): string {
  if (state === "Shipped") return "ok";
  if (state === "Backordered") return "warn";
  if (state === "Ordered") return "ink";
  return "";
}
