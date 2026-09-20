import { describe, expect, it } from "vitest";
import type { CloseBatch } from "../data/types";
import { retireCloseBatch, undoLogText, type UndoRecord } from "./closeBatch";

const batch = (over: Partial<CloseBatch> = {}): CloseBatch => ({
  id: "batch-close-2026-09-17",
  at: "2026-09-17T19:30:00",
  by: "R. Delacroix (Manager)",
  saleIds: ["s-1", "s-2"],
  summary: { totalItems: 14, netSales: 502.86 },
  summaryVersion: 1,
  ...over,
});

const rec: UndoRecord = {
  manager: "Y. Nakamura (Manager)",
  actor: "E. Okafor (Employee)",
  at: "2026-09-18T23:07:00",
};

describe("M-04 d4 / M-03 d4 — an undo records both names", () => {
  it("puts the acting Employee on the CloseBatch beside the authorising Manager", () => {
    const retired = retireCloseBatch(batch(), rec);

    expect(retired.undoneBy).toBe("Y. Nakamura (Manager)");
    expect(retired.undoneActor).toBe("E. Okafor (Employee)");
  });

  it("names both in the line each restored Sale carries", () => {
    const text = undoLogText("batch-close-2026-09-17", rec);

    expect(text).toMatch(/E\. Okafor \(Employee\)/);
    expect(text).toMatch(/Y\. Nakamura \(Manager\)/);
    expect(text).toMatch(/batch-close-2026-09-17/);
  });

  it("says the name once when the actor and the Manager are one person", () => {
    const text = undoLogText("batch-close-2026-09-17", { ...rec, actor: rec.manager });

    expect(text).toBe("Batch batch-close-2026-09-17 undone by Y. Nakamura (Manager) — back to Current");
  });

  it("keeps the two apart when they are two people", () => {
    // The bug this test exists for: `undoneBy: by` alone, where `by` was the
    // Manager, left nothing on the record saying who the act was performed
    // FOR — while the dialog told the user both names were being kept.
    const retired = retireCloseBatch(batch(), rec);

    expect(retired.undoneActor).not.toBe(retired.undoneBy);
  });

  it("records the Manager as both when nobody else is there", () => {
    // Architecture §6 puts `p_actor_user_id` on every function and
    // `p_manager_user_id` only on the manager-only ones, so a Manager working
    // alone genuinely IS the actor. Both names are recorded and both are
    // theirs — which is what lets the till ask once instead of twice.
    const alone = retireCloseBatch(batch(), { ...rec, actor: rec.manager });

    expect(alone.undoneActor).toBe("Y. Nakamura (Manager)");
    expect(alone.undoneBy).toBe("Y. Nakamura (Manager)");
  });
});

describe("A-84 — retired, not deleted, and the summary never moves", () => {
  it("keeps the id, timestamp, closing User, saleIds and summary untouched", () => {
    const before = batch();
    const retired = retireCloseBatch(before, rec);

    expect(retired.id).toBe(before.id);
    expect(retired.at).toBe(before.at);
    expect(retired.by).toBe(before.by);
    expect(retired.saleIds).toEqual(before.saleIds);
    expect(retired.summary).toEqual(before.summary);
    expect(retired.summaryVersion).toBe(before.summaryVersion);
  });

  it("marks the batch undone, which is what every reader filters on", () => {
    expect(retireCloseBatch(batch(), rec).undoneAt).toBe("2026-09-18T23:07:00");
  });

  it("does not mutate the batch it was handed", () => {
    const before = batch();
    retireCloseBatch(before, rec);

    expect(before.undoneAt).toBeUndefined();
    expect(before.undoneActor).toBeUndefined();
  });
});
