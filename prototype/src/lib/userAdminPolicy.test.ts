import { describe, expect, it } from "vitest";
import { adminRefusal } from "./userAdminPolicy";
import type { User } from "../data/types";

const A = "0000001";
const B = "0000002";
const u = (over: Partial<User>): User =>
  ({ id: "u-1", orgId: "org-1", name: "Y. Nakamura", initials: "Y", role: "Manager", active: true, assignments: [A], log: [], ...over }) as User;

const manager = u({});
const owner = u({ id: "u-o", name: "A. Beaulieu", role: "Owner", assignments: [] });
const employee = u({ id: "u-e", name: "E. Okafor", role: "Employee" });

describe("M-04 d30 — what a Manager may do to Users: Employees at their own Stores; anything touching a Manager or Owner is Owner-only", () => {
  it("a Manager adds an Employee at their own Store", () => {
    expect(adminRefusal(manager, { kind: "add", role: "Employee", assignments: [A] })).toBeUndefined();
  });

  it("a Manager may not add an Employee at a Store they are not assigned to", () => {
    expect(adminRefusal(manager, { kind: "add", role: "Employee", assignments: [B] })).toMatch(/own Stores/);
    expect(adminRefusal(manager, { kind: "add", role: "Employee", assignments: [A, B] })).toMatch(/own Stores/);
  });

  it("a Manager may not add a Manager or an Owner — refused by role, not merely absent from the screen", () => {
    expect(adminRefusal(manager, { kind: "add", role: "Manager", assignments: [A] })).toMatch(/Owner-only/);
    expect(adminRefusal(manager, { kind: "add", role: "Owner", assignments: [] })).toMatch(/Owner-only/);
  });

  it("any role change touching Manager or Owner is Owner-only — including promoting an Employee", () => {
    expect(adminRefusal(manager, { kind: "changeRole", from: "Employee", to: "Manager", assignments: [A] })).toMatch(/Owner-only/);
    expect(adminRefusal(manager, { kind: "changeRole", from: "Manager", to: "Employee", assignments: [A] })).toMatch(/Owner-only/);
  });

  it("a Manager deactivates, reactivates and corrects Employees at their own Stores only", () => {
    expect(adminRefusal(manager, { kind: "deactivate", role: "Employee", assignments: [A] })).toBeUndefined();
    expect(adminRefusal(manager, { kind: "deactivate", role: "Employee", assignments: [B] })).toMatch(/own Stores/);
    expect(adminRefusal(manager, { kind: "deactivate", role: "Manager", assignments: [A] })).toMatch(/Owner-only/);
    expect(adminRefusal(manager, { kind: "correct", role: "Owner", assignments: [] })).toMatch(/Owner-only/);
  });

  it("a Manager assigns Employees to their own Stores and not to others", () => {
    expect(adminRefusal(manager, { kind: "assign", role: "Employee", storeId: A })).toBeUndefined();
    expect(adminRefusal(manager, { kind: "assign", role: "Employee", storeId: B })).toMatch(/own Stores/);
    expect(adminRefusal(manager, { kind: "assign", role: "Manager", storeId: A })).toMatch(/Owner-only/);
  });

  it("a Manager sets a PIN for a Manager or Owner at their own Stores — the one thing about a Manager a Manager may touch (d28)", () => {
    expect(adminRefusal(manager, { kind: "setPin", role: "Manager", assignments: [A, B] })).toBeUndefined();
    expect(adminRefusal(manager, { kind: "setPin", role: "Owner", assignments: [A] })).toBeUndefined();
    expect(adminRefusal(manager, { kind: "setPin", role: "Manager", assignments: [B] })).toMatch(/own Stores/);
    expect(adminRefusal(manager, { kind: "setPin", role: "Employee", assignments: [A] })).toMatch(/no PIN/);
  });

  it("an Owner is bounded by nothing here", () => {
    expect(adminRefusal(owner, { kind: "add", role: "Owner", assignments: [] })).toBeUndefined();
    expect(adminRefusal(owner, { kind: "changeRole", from: "Employee", to: "Owner", assignments: [B] })).toBeUndefined();
    expect(adminRefusal(owner, { kind: "deactivate", role: "Manager", assignments: [B] })).toBeUndefined();
    expect(adminRefusal(owner, { kind: "assign", role: "Manager", storeId: B })).toBeUndefined();
  });

  it("an Employee, or a deactivated Manager, administers nobody (A-28a)", () => {
    expect(adminRefusal(employee, { kind: "add", role: "Employee", assignments: [A] })).toMatch(/Manager or Owner/);
    expect(adminRefusal(u({ active: false }), { kind: "add", role: "Employee", assignments: [A] })).toMatch(/Manager or Owner/);
  });
});
