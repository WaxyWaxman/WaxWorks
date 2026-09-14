import type { InventoryItem } from "../data/types";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";

/**
 * The copies sold before they were received — E-02 d21's negative inventory,
 * listed rather than counted. Each one names the Sale that minted it, which is
 * the only way to answer "which sale is this deficit from" without leaving the
 * screen.
 *
 * Shared because the titlecard forked: this list lived in `TitlecardPanel`
 * (Receiving, Order Processing) while Find showed a bare count of the same
 * copies. E-04 d1 makes the titlecard **one view of a Record**, so two
 * renderings of the same fact was the drift, not the layout around them.
 *
 * A copy here is `status: "sold"` and unreconciled — architecture §5.1
 * subtracts exactly these from on hand, which is what lets that figure go
 * negative (E-04 d19 clears them, oldest first, when stock arrives).
 */
export function OversoldList({ copies }: { copies: InventoryItem[] }) {
  const app = useApp();
  if (copies.length === 0) return null;

  const saleFor = (itemId: string) =>
    app.sales.find((sale) => sale.lines.some((l) => l.inventoryItemId === itemId));

  return (
    <table className="data oversold-list">
      <tbody>
        {copies.map((i) => {
          const sale = saleFor(i.id);
          return (
            <tr key={i.id}>
              {/* A Sale with no number is still being rung up — it has not
                  been tendered, so there is nothing to cite yet. */}
              <td className="small">{sale?.saleNumber ? `Sale #${sale.saleNumber}` : "Sale in progress"}</td>
              <td className="small muted">{i.oversoldAt}</td>
              <td className="num small">{money(i.price)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
