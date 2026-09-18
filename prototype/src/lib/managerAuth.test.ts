import { describe, expect, it } from "vitest";
import { authorizeManager } from "./managerAuth";
import type { User } from "../data/types";

const u = (over: Partial<User>): User =>
  ({ id: "u-1", name: "Y. Nakamura", initials: "Y", role: "Manager", active: true, log: [], ...over }) as User;

const users: User[] = [
  u({}),
  u({ id: "u-2", name: "E. Okafor", initials: "EO", role: "Employee" }),
  u({ id: "u-3", name: "T. Oyelaran", initials: "TO", active: false }),
];

describe("A-28a / architecture §6 — manager_authorize resolves an active Manager", () => {
  it("authorizes an active Manager and returns a name to record", () => {
    const res = authorizeManager(users, "u-1");

    expect(res.ok).toBe(true);
    // A-28a records BOTH names; this is the one the gated write logs.
    if (res.ok) expect(res.auth).toBe("Y. Nakamura (Manager)");
  });

  it("refuses an Employee, by name", () => {
    // The failure this whole sweep exists for. Every gated write took the
    // authorizer as a plain string and re-checked nothing, so an Employee's
    // name was accepted and only the screen tested Manager-ness.
    const res = authorizeManager(users, "u-2");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal).toMatch(/E\. Okafor/);
      expect(res.refusal).toMatch(/Employee/);
    }
  });

  it("refuses a Manager who has been deactivated", () => {
    // M-04 d5 deactivates rather than deletes, so the row outlives them and a
    // stale id stays resolvable. §6: resolved "at the moment of the call, so a
    // demotion bites server-side at once".
    const res = authorizeManager(users, "u-3");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal).toMatch(/no longer an active User/);
  });

  it("refuses an id that resolves to nobody", () => {
    // A caller inventing one, which is what A-4's "invariants hold regardless
    // of caller" is for.
    const res = authorizeManager(users, "u-nobody");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal).toMatch(/does not resolve/);
  });

  it("refuses when no authorizer was supplied at all", () => {
    expect(authorizeManager(users, undefined).ok).toBe(false);
  });
});
