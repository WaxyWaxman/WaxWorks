import { Modal } from "./Modal";
import type { Sale } from "../data/types";
import { money } from "../lib/money";
import { tenderedTotal } from "../lib/totals";
import { useApp } from "../store/AppStore";
import { defaultTenderRow } from "../lib/tenders";

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
  // E-06 d30 SUPERSEDES d10 — a void UN-ROUTES rather than refusing, and
  // refuses only while the copy the routing produced is no longer as the
  // routing left it. The test is the store's (A-4, A-48); this asks it rather
  // than counting routed lines, which is what d10 did and what d29 would have
  // turned into a refusal on every finished Return.
  const routed = live.lines.filter((l) => l.stockRouted);
  const stockRefusal = app.voidStockRefusal(live.id);
  const settled = Math.abs(outstanding) <= 0.005 && !stockRefusal;

  const reverse = (type: "Cash" | "Account Balance") =>
    app.addTender(live.id, {
      type,
      amount: -outstanding,
      ...(type === "Account Balance"
        ? { accountDirection: "add" as const }
        : {}),
      note: took ? "Reversal before void" : "Collected back before void",
      // E-05 d36 — raised by the system to undo a Sale rather than chosen at
      // the pad, so it takes the default row for the behaviour.
      tenderRowId: defaultTenderRow(type, app.tenders)?.id,
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
            {stockRefusal && (
              <div className="callout warn">
                {/* d30 — the store's own sentence, which NAMES THE COPY and
                    what happened to it. "A copy is routed" told a counter
                    nothing it could act on. */}
                {stockRefusal}
              </div>
            )}

            {!stockRefusal && routed.length > 0 && (
              <div className="callout">
                {/* d30 — what the void is about to undo, said before it is
                    done. A re-grade's minted copy goes; a copy that went back
                    to the shelf returns to sold. */}
                Voiding this return will un-route {routed.length} cop
                {routed.length === 1 ? "y" : "ies"} —{" "}
                {routed.map((l) => l.routedTo).join(", ")}.
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
