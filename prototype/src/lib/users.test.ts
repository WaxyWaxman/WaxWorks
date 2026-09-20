import { describe, expect, it } from "vitest";
import {
  activeOwnerCount,
  addUser,
  assignToStore,
  changeUserRole,
  correctUser,
  deactivateUser,
  initialsHeldBy,
  normalizeInitials,
  pinHeldBy,
  reactivateUser,
  requestPasswordReset,
  setOwnPassword,
  setUserPin,
  unassignFromStore,
  wouldStrandOrganization,
  INITIALS_MIN,
  PIN_CLASH_REASON,
  PIN_LENGTH,
} from "./users";
import type { User } from "../data/types";

const at = () => "2026-09-20T12:00:00";
const ORG = "org-1";
const A = "0000001"; // home Store
const B = "0000002"; // sister Store

const u = (over: Partial<User> = {}): User =>
  ({
    id: "u-1",
    orgId: ORG,
    name: "Y. Nakamura",
    initials: "Y",
    role: "Manager",
    active: true,
    assignments: [A],
    email: "y@example.test",
    pin: "1111",
    log: [],
    ...over,
  }) as User;

// An Organization that survives losing one Owner, so d26's floor is never the
// thing under test unless a test says it is. R. Delacroix covers both Stores.
const shop = (): User[] => [
  u({ id: "u-o1", name: "A. Beaulieu", initials: "AB", role: "Owner", assignments: [A, B], email: "ab@example.test", pin: "9999" }),
  u({ id: "u-o2", name: "B. Owner", initials: "BO", role: "Owner", assignments: [], email: "bo@example.test", pin: undefined }),
  u(),
  u({ id: "u-2", name: "R. Delacroix", initials: "RD", role: "Manager", assignments: [A, B], email: "rd@example.test", pin: "1234" }),
  u({ id: "u-3", name: "E. Okafor", initials: "EO", role: "Employee", assignments: [A], email: undefined, pin: undefined }),
  u({ id: "u-4", name: "E. Ouellet", initials: "EO", role: "Employee", assignments: [B], email: undefined, pin: undefined }),
];

const emp = (over: Partial<Parameters<typeof addUser>[1]> = {}) => ({
  name: "J. Doe",
  initials: "JD",
  role: "Employee" as const,
  assignments: [A],
  ...over,
});
const opts = { id: "u-9", orgId: ORG, now: at };

describe("M-04 d20 — initials are trimmed and upper-cased on write", () => {
  it("treats jd, JD and 'JD ' as one", () => {
    expect(normalizeInitials("jd")).toBe("JD");
    expect(normalizeInitials("JD ")).toBe("JD");
    expect(normalizeInitials(" Jd")).toBe("JD");
  });

  it("stores the normalised form, so uniqueness is a plain comparison", () => {
    const r = addUser(shop(), emp({ initials: " jd " }), "Y", opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-9")!.initials).toBe("JD");
  });
});

describe("M-04 d13, d16, d27 / E-01 d25 — initials are unique per Store among the ACTIVE users ASSIGNED to it", () => {
  it("refuses initials an active user already holds at that Store, naming who", () => {
    const r = addUser(shop(), emp({ initials: "eo", assignments: [A] }), "Y", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/E\. Okafor/);
  });

  it("permits the same initials at a Store where nobody holds them (E-01 d25)", () => {
    // E. Okafor and E. Ouellet both hold EO — one at A, one at B — and the
    // shop() fixture is legal. A third EO at a third Store would be too.
    expect(initialsHeldBy(shop(), "EO", A)!.name).toBe("E. Okafor");
    expect(initialsHeldBy(shop(), "EO", B)!.name).toBe("E. Ouellet");
    const r = addUser(shop(), emp({ initials: "EO", assignments: ["0000003"] }), "Y", opts);
    expect(r.ok).toBe(true);
  });

  it("checks every Store in the new person's assignments (d27)", () => {
    const r = addUser(shop(), emp({ initials: "EO", assignments: [B] }), "Y", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/E\. Ouellet/);
  });

  it("releases a deactivated user's initials to a new hire (d16)", () => {
    const after = deactivateUser(shop(), "u-3", "Y", at);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(initialsHeldBy(after.users, "EO", A)).toBeUndefined();
    const hire = addUser(after.users, emp({ name: "E. Osei", initials: "EO" }), "Y", opts);
    expect(hire.ok).toBe(true);
  });

  it("allows a single character, which d13 never barred", () => {
    expect(INITIALS_MIN).toBe(1);
    const r = addUser(shop(), emp({ name: "Q. Person", initials: "Q" }), "Y", opts);
    expect(r.ok).toBe(true);
  });

  it("requires a name and requires initials", () => {
    expect(addUser(shop(), emp({ name: "  ", initials: "ZZ" }), "Y", opts).ok).toBe(false);
    expect(addUser(shop(), emp({ name: "A Person", initials: " " }), "Y", opts).ok).toBe(false);
  });
});

describe("M-04 d27 — a User belongs to the Organization and is assigned to one or more Stores", () => {
  it("refuses an Employee or Manager with no Store", () => {
    const e = addUser(shop(), emp({ assignments: [] }), "Y", opts);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toMatch(/at least one Store/);
    const m = addUser(shop(), emp({ role: "Manager", email: "m@example.test", assignments: [] }), "Y", opts);
    expect(m.ok).toBe(false);
  });

  it("permits an Owner with no Store — their work is the Organization's", () => {
    const r = addUser(shop(), emp({ name: "C. Owner", initials: "CO", role: "Owner", email: "co@example.test", assignments: [] }), "Y", opts);
    expect(r.ok).toBe(true);
  });

  it("stamps the Organization on the row", () => {
    const r = addUser(shop(), emp(), "Y", opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-9")!.orgId).toBe(ORG);
  });

  it("assignment is the second enforcement point for initials — refused naming the holder", () => {
    // E. Okafor (EO at A) assigned to B, where E. Ouellet holds EO.
    const r = assignToStore(shop(), "u-3", B, "Y", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/E\. Ouellet/);
  });

  it("assigns where nothing collides, and logs it", () => {
    const r = assignToStore(shop(), "u-1", B, "Y", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const y = r.users.find((x) => x.id === "u-1")!;
      expect(y.assignments).toEqual([A, B]);
      expect(y.log[y.log.length - 1]!.text).toMatch(/Assigned to Store 0000002/);
    }
  });

  it("refuses to unassign an Employee's or Manager's last Store", () => {
    const r = unassignFromStore(shop(), "u-3", A, "Y", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/at least one Store/);
  });

  it("lets an Owner drop to no Store", () => {
    const r = unassignFromStore(shop(), "u-o1", A, "Y", at);
    expect(r.ok).toBe(true);
    const r2 = r.ok ? unassignFromStore(r.users, "u-o1", B, "Y", at) : r;
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.users.find((x) => x.id === "u-o1")!.assignments).toEqual([]);
  });
});

describe("M-04 d26 — an Organization always keeps at least one active Owner; there is no per-Store floor", () => {
  const solo = (): User[] => shop().filter((x) => x.id !== "u-o2");

  it("refuses to deactivate the last active Owner", () => {
    const r = deactivateUser(solo(), "u-o1", "Y", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/only active Owner/);
  });

  it("refuses to demote the last active Owner, including by themselves", () => {
    expect(wouldStrandOrganization(solo(), "u-o1")).toBe(true);
    const r = changeUserRole(solo(), "u-o1", "Manager", "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/only active Owner/);
  });

  it("permits both once a second Owner exists", () => {
    expect(activeOwnerCount(shop())).toBe(2);
    expect(deactivateUser(shop(), "u-o1", "Y", at).ok).toBe(true);
    expect(changeUserRole(shop(), "u-o1", "Manager", "Y", at).ok).toBe(true);
  });

  it("no longer protects a Store's only Manager (d14 superseded)", () => {
    // Y. Nakamura is the only Manager assigned solely to A besides R. Delacroix;
    // remove R. Delacroix from A and Y. Nakamura is A's last Manager — and can
    // still be deactivated.
    const withoutRd = unassignFromStore(shop(), "u-2", A, "Y", at);
    expect(withoutRd.ok).toBe(true);
    if (!withoutRd.ok) return;
    expect(deactivateUser(withoutRd.users, "u-1", "A. Beaulieu (Owner)", at).ok).toBe(true);
  });
});

describe("M-04 d5 — deactivated, never deleted", () => {
  it("keeps the row so historical attribution survives", () => {
    const r = deactivateUser(shop(), "u-3", "Y", at);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gone = r.users.find((x) => x.id === "u-3")!;
    expect(gone.active).toBe(false);
    expect(r.users).toHaveLength(shop().length);
  });
});

describe("M-04 d19 — a deactivated User can be reactivated, taking new initials if theirs were reused at any of their Stores", () => {
  const reused = () => {
    const off = deactivateUser(shop(), "u-3", "Y", at);
    if (!off.ok) throw new Error("setup");
    const hire = addUser(off.users, emp({ name: "E. Osei", initials: "EO" }), "Y", opts);
    if (!hire.ok) throw new Error("setup");
    return hire.users;
  };

  it("refuses to reactivate onto initials somebody else now holds there", () => {
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

  it("clears a returning Manager's PIN if it has since been reissued at one of their Stores, and says so", () => {
    const off = deactivateUser(shop(), "u-1", "Y", at); // Y. Nakamura, PIN 1111 at A
    if (!off.ok) throw new Error("setup");
    const reissued = setUserPin(off.users, "u-2", "1111", "A. Beaulieu (Owner)", at); // R. Delacroix takes 1111
    if (!reissued.ok) throw new Error("setup");
    const back = reactivateUser(reissued.users, "u-1", "Y", "A. Beaulieu (Owner)", at);
    expect(back.ok).toBe(true);
    if (back.ok) {
      const y = back.users.find((x) => x.id === "u-1")!;
      expect(y.pin).toBeUndefined();
      expect(y.log[y.log.length - 1]!.text).toMatch(/PIN cleared on reactivation/);
    }
  });
});

describe("M-04 d22 — a name, initials and email can be corrected after creation", () => {
  it("corrects a misspelled name", () => {
    const r = correctUser(shop(), "u-3", { name: "E. Okafor-Smith" }, "Y", at);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-3")!.name).toBe("E. Okafor-Smith");
  });

  it("refuses initials an active user already holds at one of their Stores", () => {
    const r = correctUser(shop(), "u-3", { initials: "RD" }, "Y", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/R\. Delacroix/);
  });

  it("refuses to blank a Manager's email (d29 needs it)", () => {
    const r = correctUser(shop(), "u-2", { email: "" }, "Y", at);
    expect(r.ok).toBe(false);
  });

  it("is a no-op when nothing changed, rather than an error", () => {
    const r = correctUser(shop(), "u-3", { name: "E. Okafor", initials: "EO" }, "Y", at);
    expect(r.ok).toBe(true);
  });
});

describe("M-04 d28 / E-01 d26 — a Manager or Owner holds a four-digit PIN, set by an Owner or Manager, unique per Store, logged never as a value", () => {
  it("sets, changes and clears one, and the log carries three events and no digits", () => {
    const set = setUserPin(shop(), "u-o2", "4321", "A. Beaulieu (Owner)", at);
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const changed = setUserPin(set.users, "u-o2", "8765", "A. Beaulieu (Owner)", at);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const cleared = setUserPin(changed.users, "u-o2", "", "A. Beaulieu (Owner)", at);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    const log = cleared.users.find((x) => x.id === "u-o2")!.log.map((l) => l.text);
    expect(log).toEqual(["PIN set by A. Beaulieu (Owner)", "PIN changed by A. Beaulieu (Owner)", "PIN cleared by A. Beaulieu (Owner)"]);
    expect(log.join(" ")).not.toMatch(/4321|8765/);
  });

  it("is exactly four digits", () => {
    expect(PIN_LENGTH).toBe(4);
    expect(setUserPin(shop(), "u-1", "123", "AB", at).ok).toBe(false);
    expect(setUserPin(shop(), "u-1", "12345", "AB", at).ok).toBe(false);
    expect(setUserPin(shop(), "u-1", "12a4", "AB", at).ok).toBe(false);
  });

  it("refuses an Employee a PIN", () => {
    const r = setUserPin(shop(), "u-3", "1234", "AB", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Employee/);
  });

  it("is unique per Store among assigned Managers and Owners — the same PIN may exist at two Stores with no holder in common", () => {
    // Y. Nakamura (A) holds 1111. E. Ouellet is at B only, but is an Employee;
    // make a B-only Manager and give them 1111 — permitted.
    const m = addUser(shop(), emp({ name: "P. Plateau", initials: "PP", role: "Manager", email: "pp@example.test", assignments: [B] }), "AB", opts);
    if (!m.ok) throw new Error("setup");
    expect(setUserPin(m.users, "u-9", "1111", "AB", at).ok).toBe(true);
    expect(pinHeldBy(m.users, "1111", A)!.name).toBe("Y. Nakamura");
  });

  it("checks every Store of the holder's assignments (d28)", () => {
    // R. Delacroix covers A and B; 1111 is Y. Nakamura's at A.
    const r = setUserPin(shop(), "u-2", "1111", "AB", at);
    expect(r.ok).toBe(false);
  });

  it("a demotion to Employee clears the PIN and says so", () => {
    const r = changeUserRole(shop(), "u-1", "Employee", "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const y = r.users.find((x) => x.id === "u-1")!;
      expect(y.pin).toBeUndefined();
      expect(y.log[y.log.length - 1]!.text).toMatch(/PIN cleared/);
    }
  });
});

describe("M-04 d32 — a PIN clash names nobody", () => {
  it("refuses with 'in use at this Store' and no name, at Set PIN", () => {
    const r = setUserPin(shop(), "u-2", "1111", "AB", at);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(PIN_CLASH_REASON);
      expect(r.reason).not.toMatch(/Nakamura/);
    }
  });

  it("refuses the same way at assignment", () => {
    // A B-only Manager holding 1111 is assigned to A, where Y. Nakamura holds it.
    const m = addUser(shop(), emp({ name: "P. Plateau", initials: "PP", role: "Manager", email: "pp@example.test", assignments: [B], pin: "1111" }), "AB", opts);
    if (!m.ok) throw new Error("setup");
    const r = assignToStore(m.users, "u-9", A, "AB", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(PIN_CLASH_REASON);
  });

  it("but an initials clash still names the holder — initials are not secret", () => {
    const r = addUser(shop(), emp({ initials: "Y" }), "AB", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Y\. Nakamura/);
  });
});

describe("M-04 d29 — passwords are set by their holder through an emailed link; a Manager or Owner needs an email", () => {
  it("Add refuses a Manager without an email and sends an invite with one", () => {
    const no = addUser(shop(), emp({ name: "N. Mgr", initials: "NM", role: "Manager" }), "AB", opts);
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toMatch(/email/);
    const yes = addUser(shop(), emp({ name: "N. Mgr", initials: "NM", role: "Manager", email: "nm@example.test" }), "AB", opts);
    expect(yes.ok).toBe(true);
    if (yes.ok) expect(yes.users.find((x) => x.id === "u-9")!.log.map((l) => l.text)).toContain("Invite sent to nm@example.test");
  });

  it("an Employee is added with no email and no invite", () => {
    const r = addUser(shop(), emp(), "Y", opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-9")!.log.map((l) => l.text).join(" ")).not.toMatch(/Invite/);
  });

  it("a reset is logged as sent, never as a link; an Employee has none", () => {
    const r = requestPasswordReset(shop(), "u-2", "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-2")!.log[r.users.find((x) => x.id === "u-2")!.log.length - 1]!.text).toMatch(/reset link sent to rd@example\.test/);
    expect(requestPasswordReset(shop(), "u-3", "AB", at).ok).toBe(false);
  });

  it("the holder sets their own password; the log names nobody else and never the value", () => {
    const r = setOwnPassword(shop(), "u-2", "correct horse battery", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rd = r.users.find((x) => x.id === "u-2")!;
      expect(rd.password).toBe("correct horse battery");
      expect(rd.log[rd.log.length - 1]!.text).toBe("Password set by the user");
    }
    expect(setOwnPassword(shop(), "u-3", "correct horse battery", at).ok).toBe(false); // Employee: no personal session
    expect(setOwnPassword(shop(), "u-2", "short", at).ok).toBe(false);
  });

  it("promotion to Manager needs an email first", () => {
    const r = changeUserRole(shop(), "u-3", "Manager", "AB", at);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/email/);
  });
});

describe("M-04 d4 — both names are recorded", () => {
  it("logs the authorising Manager against the act", () => {
    const r = addUser(shop(), emp({ name: "N. Hire", initials: "NH" }), "Y. Nakamura (Manager)", opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.users.find((x) => x.id === "u-9")!.log[0].text).toMatch(/Y\. Nakamura \(Manager\)/);
  });

  it("logs a role change with both the old and the new role", () => {
    const r = changeUserRole(shop(), "u-1", "Owner", "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const entries = r.users.find((x) => x.id === "u-1")!.log;
      const log = entries[entries.length - 1].text;
      expect(log).toMatch(/Manager/);
      expect(log).toMatch(/Owner/);
    }
  });
});
