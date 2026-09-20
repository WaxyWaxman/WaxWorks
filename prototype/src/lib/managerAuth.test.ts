import { describe, expect, it } from "vitest";
import {
  authorizeByPin,
  authorizeFromPersonalSession,
  authorizeManager,
  requireManager,
  requireOwner,
} from "./managerAuth";
import type { User } from "../data/types";

const A = "0000001";
const B = "0000002";
const u = (over: Partial<User>): User =>
  ({ id: "u-1", orgId: "org-1", name: "Y. Nakamura", initials: "Y", role: "Manager", active: true, assignments: [A], pin: "1111", log: [], ...over }) as User;

const users: User[] = [
  u({}),
  u({ id: "u-2", name: "E. Okafor", initials: "EO", role: "Employee", pin: undefined }),
  u({ id: "u-3", name: "T. Oyelaran", initials: "TO", active: false, pin: "3333" }),
  u({ id: "u-4", name: "A. Beaulieu", initials: "AB", role: "Owner", assignments: [A, B], pin: "9999" }),
  u({ id: "u-5", name: "P. Plateau", initials: "PP", role: "Manager", assignments: [B], pin: "2222" }),
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

  it("authorizes an Owner — a strict superset of a Manager (M-04 d25, A-89)", () => {
    const res = authorizeManager(users, "u-4");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auth.name).toBe("A. Beaulieu (Owner)");
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

describe("E-01 d26 / A-89 — on a store session the manager-only line is a PIN, typed alone, resolved among the Store's assigned Managers and Owners", () => {
  it("resolves the one holder at this Store and mints the same authorization the id path does", () => {
    const res = authorizeByPin(users, A, "1111");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.userId).toBe("u-1");
      expect(res.auth.name).toBe("Y. Nakamura (Manager)");
    }
  });

  it("an Owner's PIN opens the line too", () => {
    const res = authorizeByPin(users, B, "9999");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auth.name).toBe("A. Beaulieu (Owner)");
  });

  it("a wrong PIN names NOBODY", () => {
    const res = authorizeByPin(users, A, "0000");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal).toMatch(/No Manager or Owner at this Store/);
      expect(res.refusal).not.toMatch(/Nakamura|Beaulieu|Plateau/);
    }
  });

  it("the PIN of a Manager assigned to another Store is refused the same way — the pad does not say it exists elsewhere", () => {
    const res = authorizeByPin(users, A, "2222"); // P. Plateau, B only
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal).not.toMatch(/Plateau/);
  });

  it("a deactivated Manager's PIN opens nothing (M-04 d15, d18)", () => {
    expect(authorizeByPin(users, A, "3333").ok).toBe(false);
  });

  it("an Employee has no PIN to type", () => {
    const withPinnedEmployee = users.map((x) => (x.id === "u-2" ? { ...x, pin: "5555" } : x));
    // Even if a row somehow carried digits, an Employee never resolves.
    expect(authorizeByPin(withPinnedEmployee, A, "5555").ok).toBe(false);
  });
});

describe("E-01 d27 / M-04 d31 — on a personal session the session is the authorization", () => {
  it("a Manager signed in as themselves authorizes with no PIN", () => {
    const res = authorizeFromPersonalSession(users, "u-1");
    expect(res.ok).toBe(true);
  });

  it("an Employee's id never opens the line, however it arrived", () => {
    expect(authorizeFromPersonalSession(users, "u-2").ok).toBe(false);
  });
});

describe("O-01 d1 / M-04 d30 / A-89 — an O function asks a second question, and refuses a Manager BY NAME", () => {
  it("passes an Owner", () => {
    const minted = authorizeManager(users, "u-4");
    if (!minted.ok) throw new Error("setup");
    expect(requireOwner(users, minted.auth).ok).toBe(true);
  });

  it("refuses a Manager, naming them — the person is known and no secret is at stake", () => {
    const minted = authorizeManager(users, "u-1");
    if (!minted.ok) throw new Error("setup");
    const res = requireOwner(users, minted.auth);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal).toMatch(/Y\. Nakamura/);
      expect(res.refusal).toMatch(/Owner-only/);
    }
  });

  it("re-resolves: an Owner demoted after the prompt is refused at the write", () => {
    const minted = authorizeManager(users, "u-4");
    if (!minted.ok) throw new Error("setup");
    const demoted = users.map((x) => (x.id === "u-4" ? { ...x, role: "Manager" as const } : x));
    expect(requireOwner(demoted, minted.auth).ok).toBe(false);
  });
});
