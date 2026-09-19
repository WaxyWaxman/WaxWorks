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
   * M-04 d4 — who the act was performed for. **Required**, because
   * [architecture](docs/architecture.md) §6 puts `p_actor_user_id` on *every*
   * function and `p_manager_user_id` only on the manager-only ones: the actor
   * is the baseline on any write, and the Manager's names are the addition.
   *
   * **It is not necessarily an Employee.** Where nobody is signed in, the
   * Manager who authorizes is also the person standing there, and both names
   * on the record are theirs — which is the honest reading, and the reason the
   * till asks **once**. An Employee's name lands here only when an Employee
   * genuinely had a session and called a Manager over, which is the case
   * M-04 d3 was written for.
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
 * Names both, in the order the act happened — one person did it, a Manager
 * allowed it — because the Sale's own log is the surface somebody actually
 * reads when they ask why yesterday reopened, and `undoneActor` on the batch is
 * not on any screen.
 *
 * **One name when they are one person.** The record still carries both fields
 * and both hold that name, which is what M-04 d9 asks for; repeating it in
 * prose — *"undone by X, authorized by X"* — reads as though something happened
 * twice. A single name is itself the signal that nobody else was there.
 */
export function undoLogText(batchId: string, rec: UndoRecord): string {
  const who = rec.actor === rec.manager ? rec.actor : `${rec.actor}, authorized by ${rec.manager}`;
  return `Batch ${batchId} undone by ${who} — back to Current`;
}
