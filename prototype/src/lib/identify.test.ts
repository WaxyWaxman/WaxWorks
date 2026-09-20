import { describe, expect, it } from "vitest";
import { resolveInitials, resolutionHint } from "./identify";
import type { User } from "../data/types";

const A = "0000001";
const B = "0000002";
const u = (over: Partial<User>): User =>
  ({ id: "u-1", orgId: "org-1", name: "Y. Nakamura", initials: "Y", role: "Manager", active: true, assignments: [A], log: [], ...over }) as User;

const users: User[] = [
  u({}),
  u({ id: "u-2", name: "E. Okafor", initials: "EO", role: "Employee", assignments: [A] }),
  u({ id: "u-3", name: "E. Ouellet", initials: "EO", role: "Employee", assignments: [B] }),
  u({ id: "u-4", name: "R. Delacroix", initials: "RD", assignments: [A, B] }),
  u({ id: "u-5", name: "T. Oyelaran", initials: "TO", role: "Employee", active: false, assignments: [A] }),
];

describe("E-01 d19, d22 — identification resolves as you type, on an exact match", () => {
  it("resolves the instant the typed string IS somebody's initials, with no Enter", () => {
    const r = resolveInitials(users, "rd", A);
    expect(r.kind).toBe("one");
    if (r.kind === "one") expect(r.user.name).toBe("R. Delacroix");
  });

  it("matches exactly, never by prefix — R is nobody even where R. Delacroix is the only R", () => {
    const r = resolveInitials(users, "R", A);
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.partial).toBe(true);
    expect(resolutionHint(r)).toBe("Keep typing.");
  });

  it("a one-character initial resolves (d22)", () => {
    expect(resolveInitials(users, "y", A).kind).toBe("one");
  });

  it("never resolves a deactivated User (M-04 d15, d18)", () => {
    expect(resolveInitials(users, "TO", A).kind).toBe("none");
  });
});

describe("E-01 d25 / M-04 d27 — initials resolve among the people ASSIGNED to the Store in session", () => {
  it("an active User assigned only to another Store does not exist here", () => {
    const r = resolveInitials(users, "EO", B);
    expect(r.kind).toBe("one");
    if (r.kind === "one") expect(r.user.name).toBe("E. Ouellet");
    const r2 = resolveInitials(users, "EO", A);
    expect(r2.kind).toBe("one");
    if (r2.kind === "one") expect(r2.user.name).toBe("E. Okafor");
  });

  it("a User assigned to both Stores resolves at either", () => {
    expect(resolveInitials(users, "RD", A).kind).toBe("one");
    expect(resolveInitials(users, "RD", B).kind).toBe("one");
  });

  it("a User assigned elsewhere is not even a partial — the hint does not leak them", () => {
    const r = resolveInitials(users, "Y", B);
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.partial).toBe(false);
    expect(resolutionHint(r)).toMatch(/Nobody at this Store/);
  });

  it("with no Store given it resolves across the Organization (a caller with no store session)", () => {
    expect(resolveInitials(users, "Y").kind).toBe("one");
  });
});
