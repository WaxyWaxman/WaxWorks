import { describe, expect, it } from "vitest";
import {
  addUser,
  changeUserRole,
  correctUser,
  deactivateUser,
  initialsHeldBy,
  normalizeInitials,
  passwordAccepted,
  reactivateUser,
  setUserPassword,
  wouldStrandStore,
  INITIALS_MIN,
  PASSWORD_MAX,
} from "./users";
import type { User } from "../data/types";

const at = () => "2026-09-18T12:00:00";

const u = (over: Partial<User> = {}): User =>
  ({ id: "u-1", name: "Y. Nakamura", initials: "Y", role: "Manager", active: true, log: [], ...over }) as User;

// A Store that survives losing one Manager, so d14's floor is never the thing
// under test unless a test says it is.
const shop = (): User[] => [
  u(),
  u({ id: "u-2", name: "R. Delacroix", initials: "RD", role: "Manager" }),
  u({ id: "u-3", name: "E. Okafor", initials: "EO", role: "Employee" }),
];

describe("M-04 d20 — initials are trimmed and upper-cased on write", () => {
  it("treats jd, JD and 'JD ' as one", () => {
    expect(normalizeInitials("jd")).toBe("JD");
    expect(normalizeInitials("JD ")).toBe("JD");
    expect(normalizeInitials(" Jd")).toBe("JD");
  });

  it("stores the normalised form, so uniqueness is a plain comparison", () => {
    const r = addUser(shop(), { name: "J. Doe", initials: " jd ", role: "Employee" }, "Y", { id: "u-9", now: at });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-9")!.initials).toBe("JD");
  });
});

describe("M-04 d13, d16 — initials are unique among ACTIVE users, and a deactivated user releases theirs", () => {
  it("refuses initials an active user already holds, naming who", () => {
    const r = addUser(shop(), { name: "Someone Else", initials: "eo", role: "Employee" }, "Y", { id: "u-9", now: at });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/E\. Okafor/);
  });

  it("releases a deactivated user's initials to a new hire (d16)", () => {
    // The amendment that makes the string not-identity: nothing stores initials
    // as a reference, which is why every audit surface shows the name instead.
    const after = deactivateUser(shop(), "u-3", "Y", at);
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    expect(initialsHeldBy(after.users, "EO")).toBeUndefined();
    const hire = addUser(after.users, { name: "E. Osei", initials: "EO", role: "Employee" }, "Y", {
      id: "u-9",
      now: at,
    });
    expect(hire.ok).toBe(true);
  });

  it("allows a single character, which d13 never barred", () => {
    // INITIALS_MIN is 1, and is only safe because E-01 d19 matches EXACTLY:
    // `Y` resolves to Y and never shadows YM.
    expect(INITIALS_MIN).toBe(1);
    const r = addUser(shop(), { name: "Q. Person", initials: "Q", role: "Employee" }, "Y", { id: "u-9", now: at });
    expect(r.ok).toBe(true);
  });

  it("requires a name and requires initials", () => {
    expect(addUser(shop(), { name: "  ", initials: "ZZ", role: "Employee" }, "Y", { id: "u-9" }).ok).toBe(false);
    expect(addUser(shop(), { name: "A Person", initials: " ", role: "Employee" }, "Y", { id: "u-9" }).ok).toBe(false);
  });
});

describe("M-04 d14 — a Store always keeps at least one active Manager", () => {
  const solo = (): User[] => [u(), u({ id: "u-3", name: "E. Okafor", initials: "EO", role: "Employee" })];

  it("refuses to deactivate the last active Manager", () => {
    const r = deactivateUser(solo(), "u-1", "Y", at);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/only active Manager/);
  });

  it("refuses to demote the last active Manager", () => {
    // d11 answers what could authorise past this: nothing. There is no tier
    // above Manager to appeal to, so the floor is absolute.
    const r = changeUserRole(solo(), "u-1", "Employee", "Y", at);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/only active Manager/);
  });

  it("applies to a Manager acting on themselves", () => {
    expect(wouldStrandStore(solo(), "u-1")).toBe(true);
  });

  it("permits both once a second Manager exists", () => {
    expect(deactivateUser(shop(), "u-1", "RD", at).ok).toBe(true);
    expect(changeUserRole(shop(), "u-1", "Employee", "RD", at).ok).toBe(true);
  });
});

describe("M-04 d5 — deactivated, never deleted", () => {
  it("keeps the row so historical attribution survives", () => {
    const r = deactivateUser(shop(), "u-3", "Y", at);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gone = r.users.find((x) => x.id === "u-3")!;
    expect(gone).toBeDefined();
    expect(gone.active).toBe(false);
    expect(r.users).toHaveLength(3);
  });
});

describe("M-04 d19 — a deactivated User can be reactivated, taking new initials if theirs were reused", () => {
  const reused = () => {
    const off = deactivateUser(shop(), "u-3", "Y", at);
    if (!off.ok) throw new Error("setup");
    const hire = addUser(off.users, { name: "E. Osei", initials: "EO", role: "Employee" }, "Y", {
      id: "u-9",
      now: at,
    });
    if (!hire.ok) throw new Error("setup");
    return hire.users;
  };

  it("refuses to reactivate onto initials somebody else now holds", () => {
    const r = reactivateUser(reused(), "u-3", "EO", "Y", at);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/E\. Osei/);
  });

  it("reactivates on different initials", () => {
    const r = reactivateUser(reused(), "u-3", "EOK", "Y", at);

    expect(r.ok).toBe(true);
    if (r.ok) {
      const back = r.users.find((x) => x.id === "u-3")!;
      expect(back.active).toBe(true);
      expect(back.initials).toBe("EOK");
    }
  });
});

describe("M-04 d22 — a name and initials can both be corrected after creation", () => {
  it("corrects a misspelled name", () => {
    const r = correctUser(shop(), "u-3", { name: "E. Okafor-Smith" }, "Y", at);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-3")!.name).toBe("E. Okafor-Smith");
  });

  it("refuses initials an active user already holds", () => {
    const r = correctUser(shop(), "u-3", { initials: "RD" }, "Y", at);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/R\. Delacroix/);
  });

  it("is a no-op when nothing changed, rather than an error", () => {
    const r = correctUser(shop(), "u-3", { name: "E. Okafor", initials: "EO" }, "Y", at);
    expect(r.ok).toBe(true);
  });
});

describe("M-04 d23 — a Manager may set, change or clear any password; nobody must have one", () => {
  it("sets one, and it is then accepted", () => {
    const r = setUserPassword(shop(), "u-3", "p", "Y", at);

    expect(r.ok).toBe(true);
    if (r.ok) expect(passwordAccepted(r.users.find((x) => x.id === "u-3")!, "p")).toBe(true);
  });

  it("clears one, and the User keeps working without it", () => {
    const set = setUserPassword(shop(), "u-3", "p", "Y", at);
    if (!set.ok) throw new Error("setup");
    const cleared = setUserPassword(set.users, "u-3", "", "Y", at);

    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.users.find((x) => x.id === "u-3")!.password).toBeUndefined();
  });

  it("refuses one longer than the cap", () => {
    const r = setUserPassword(shop(), "u-3", "x".repeat(PASSWORD_MAX + 1), "Y", at);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(new RegExp(String(PASSWORD_MAX)));
  });

  it("accepts anything from a User who has none, since none is required", () => {
    expect(passwordAccepted(u({ password: undefined }), "")).toBe(true);
  });
});

describe("M-04 d4 — both names are recorded", () => {
  it("logs the authorising Manager against the act", () => {
    const r = addUser(shop(), { name: "N. Hire", initials: "NH", role: "Employee" }, "Y. Nakamura (Manager)", {
      id: "u-9",
      now: at,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-9")!.log[0].text).toMatch(/Y\. Nakamura \(Manager\)/);
  });

  it("logs a role change with both the old and the new role", () => {
    const r = changeUserRole(shop(), "u-3", "Manager", "Y. Nakamura (Manager)", at);

    expect(r.ok).toBe(true);
    if (r.ok) {
      const entries = r.users.find((x) => x.id === "u-3")!.log;
      const log = entries[entries.length - 1].text;
      expect(log).toMatch(/Employee/);
      expect(log).toMatch(/Manager/);
    }
  });
});
