import type { CloseBatch } from "../data/types";

/**
 * Undoing a close — the record it leaves behind.
 *
 * Pulled out of the store so the one thing [M-04](docs/flows/M-04-manage-users.md)
 * d4 actually asks for — *"both the acting Employee and the authorising Manager
 * are recorded"* — is a pure function with a test named for it, rather than two
 * object spreads inside a React callback that nothing can reach.
 */

/** Who reversed a close, and when. Both names, because d4 wants both. */
export interface UndoRecord {
  /**
   * M-04 d3 — the Manager who authorized in place. Re-resolved at the moment
   * of the write (`requireManager`, architecture §6), so this is the name on
   * the row now rather than the one the prompt displayed.
   */
  manager: string;
  /**
   * M-04 d4 — the Employee who was standing at the till. **Required**, not
   * optional: the override does not replace their session (d3), so there is
   * always somebody it was performed *for*, and a record naming only the
   * Manager reads as though the Manager wandered over and did it alone. Where
   * no session is open, E-01 d5's inline prompt supplies it before the
   * authorization is even offered — the same path `Total Today's Sales`
   * already takes to fill `CloseBatch.by`.
   */
  actor: string;
  at: string;
}

/**
 * A-84 — an undo **retires** the batch. It is never deleted, its `summary` is
 * never rewritten, and re-closing writes a new CloseBatch with its own id and
 * its own summary, so a past day's figures can never move. All this adds is
 * who did it.
 */
export function retireCloseBatch(batch: CloseBatch, rec: UndoRecord): CloseBatch {
  return { ...batch, undoneAt: rec.at, undoneBy: rec.manager, undoneActor: rec.actor };
}

/**
 * The line appended to every Sale the undo returns to Current.
 *
 * Names both, in the order the act happened — the Employee did it, the Manager
 * allowed it — because the Sale's own log is the surface somebody actually
 * reads when they ask why yesterday reopened, and `undoneActor` on the batch is
 * not on any screen.
 */
export function undoLogText(batchId: string, rec: UndoRecord): string {
  return `Batch ${batchId} undone by ${rec.actor}, authorized by ${rec.manager} — back to Current`;
}
