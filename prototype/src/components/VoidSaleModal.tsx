import { Modal } from "./Modal";
import type { Sale } from "../data/types";
import { money } from "../lib/money";
import { tenderedTotal } from "../lib/totals";
import { useApp } from "../store/AppStore";

// E-05 d31 — Void (and Edit, which is a Void plus a re-ring) only at zero.
// Rather than refusing and leaving the operator to work out what to do, this
// is where the money gets dealt with: refund it, move it onto the Customer's
// account, or strike the line as never having happened. Each of those is a
// real reversal — removing a settled Gift Card tender puts the balance back
// on the card — so the number on screen and the money agree.
export function VoidSaleModal({
  sale,
  mode,
  onClose,
  onDone,
}: {
  sale: Sale;
  mode: "void" | "edit";
  onClose: () => void;
  onDone: (nextId?: string) => void;
}) {
  const app = useApp();
  const live = app.sales.find((s) => s.id === sale.id) ?? sale;
  const outstanding = tenderedTotal(live);
  const customer = app.customerFor(live.customerId);
  const copies = live.lines.filter(
    (l) => l.inventoryItemId && l.qty > 0,
  ).length;
  const took = outstanding > 0;
  // E-06 d10 — routed stock is already back on the shelf; putting it back is
  // its own job, not something Void should do silently.
  const routed = live.lines.filter((l) => l.stockRouted);
  const settled = Math.abs(outstanding) <= 0.005 && routed.length === 0;

  const reverse = (type: "Cash" | "Account Balance") =>
    app.addTender(live.id, {
      type,
      amount: -outstanding,
      ...(type === "Account Balance"
        ? { accountDirection: "add" as const }
        : {}),
      note: took ? "Reversal before void" : "Collected back before void",
    });

  const act = () => {
    if (mode === "edit") {
      const id = app.editSale(live.id);
      onDone(id ?? undefined);
      return;
    }
    app.voidSale(live.id);
    onDone();
  };

  // The same modal serves both till screens, so it calls the document what it
  // actually is rather than always saying "sale" at someone voiding a Return.
  const noun = live.isReturn ? "return" : "sale";

  return (
    <Modal
      title={
        mode === "edit"
          ? `Edit ${live.saleNumber ? `#${live.saleNumber}` : "sale"}`
          : `Void ${noun}`
      }
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" disabled={!settled} onClick={act}>
            {mode === "edit" ? "Void & duplicate" : `Void ${noun}`}
          </button>
        </>
      }
    >
      <div className="stack">
        {settled ? (
          <>
            <p className="small">
              {mode === "edit"
                ? "Voids this Sale and opens a copy of it to correct. The original keeps its number and stays in the day's record as voided."
                : `The ${noun} keeps its number and stays in the day's record as voided.`}
            </p>
            {copies > 0 && (
              <div className="callout">
                {copies} cop{copies === 1 ? "y" : "ies"} return
                {copies === 1 ? "s" : ""} to sellable stock.
              </div>
            )}
          </>
        ) : (
          <>
            {routed.length > 0 && (
              <div className="callout warn">
                {routed.length} returned cop
                {routed.length === 1 ? "y has" : "ies have"} already been routed
                — {routed.map((l) => l.routedTo).join(", ")}. Putting stock back
                where it came from is its own job, so this Return can't be
                voided while that stands.
              </div>
            )}

            {Math.abs(outstanding) > 0.005 && (
              <div className="callout warn">
                <strong>{money(Math.abs(outstanding))}</strong>{" "}
                {took ? "was taken on" : "was paid out of"} this {noun}. Money has
                to be accounted for before it can be voided — otherwise the
                drawer and the day's figures stop agreeing.
              </div>
            )}

            {Math.abs(outstanding) > 0.005 && (
              <>
                <div className="stack">
                  <div className="lab">On this {noun}</div>
                  {live.tenders.map((t) => (
                    <div key={t.id} className="tender-line">
                      <span>
                        {t.type}
                        {t.reference ? ` · ${t.reference}` : ""}
                        {t.note ? (
                          <span className="muted"> — {t.note}</span>
                        ) : (
                          ""
                        )}
                      </span>
                      <span className="row">
                        <span className="num">{money(t.amount)}</span>
                        <button
                          className="btn ghost sm"
                          title="This payment never happened — strike it and put back whatever it moved"
                          onClick={() => app.removeTender(live.id, t.id)}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="lab">Account for it</div>
                <div className="btn-row">
                  <button className="btn" onClick={() => reverse("Cash")}>
                    {took ? "Refund" : "Collect"} {money(Math.abs(outstanding))}{" "}
                    cash
                  </button>
                  <button
                    className="btn"
                    disabled={!customer}
                    title={
                      customer
                        ? undefined
                        : "Attach a customer first — an account needs an owner"
                    }
                    onClick={() => reverse("Account Balance")}
                  >
                    {took ? "Put on" : "Charge to"}{" "}
                    {customer ? `${customer.name}'s` : "an"} account
                  </button>
                </div>
                <p className="xsmall muted">
                  Striking a line says the payment never happened — a mis-key,
                  or a card reversed on the terminal. Refunding or moving it to
                  an account says it did, and this is where it went.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
