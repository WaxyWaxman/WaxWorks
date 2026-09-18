import { describe, expect, it } from "vitest";
import { authorizeManager, requireManager } from "./managerAuth";
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
    if (res.ok) {
      // The id is the fact and the name is the label (§6) — both travel, so a
      // gated write can re-resolve and still record what A-28a asks for.
      expect(res.auth.userId).toBe("u-1");
      expect(res.auth.name).toBe("Y. Nakamura (Manager)");
    }
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

describe("architecture §6 — the gated write re-resolves, it does not trust the brand", () => {
  it("refuses an authorization whose Manager was demoted after it was minted", () => {
    // THE REASON THIS EXISTS. The brand proves the check passed when the id was
    // minted. It does not prove it still holds: a Manager demoted between the
    // prompt and the write would otherwise get through on a stale token. §6 has
    // the function resolve "at the moment of the call, so a demotion bites
    // server-side at once".
    const minted = authorizeManager(users, "u-1");
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    const afterDemotion = users.map((x) => (x.id === "u-1" ? u({ role: "Employee" }) : x));

    expect(requireManager(users, minted.auth).ok).toBe(true);
    const now = requireManager(afterDemotion, minted.auth);
    expect(now.ok).toBe(false);
    if (!now.ok) expect(now.refusal).toMatch(/Employee/);
  });

  it("refuses one whose Manager was deactivated after it was minted", () => {
    const minted = authorizeManager(users, "u-1");
    if (!minted.ok) return;
    const gone = users.map((x) => (x.id === "u-1" ? u({ active: false }) : x));

    expect(requireManager(gone, minted.auth).ok).toBe(false);
  });

  it("re-derives the display name from the row rather than the carried label", () => {
    // A rename between prompt and write should not record a stale label.
    const minted = authorizeManager(users, "u-1");
    if (!minted.ok) return;
    const renamed = users.map((x) => (x.id === "u-1" ? u({ name: "Y. Nakamura-Reid" }) : x));

    const res = requireManager(renamed, minted.auth);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.name).toBe("Y. Nakamura-Reid (Manager)");
  });
});
