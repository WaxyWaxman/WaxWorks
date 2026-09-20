import { describe, expect, it } from "vitest";
import { addStore, nextPosition, nextStoreId, setStoreAccountPassword } from "./stores";
import type { Store } from "../data/types";

const at = () => "2026-09-20T12:00:00";
const ORG = "org-1";
const stores: Store[] = [
  { id: "0041982", orgId: ORG, position: 1, accountEmail: "till@example.test", accountPassword: "waxworks-till", active: true, log: [] },
  { id: "0041983", orgId: ORG, position: 2, accountEmail: "plateau@example.test", accountPassword: "waxworks-plateau", active: true, log: [] },
];
const input = { orgId: ORG, tradingName: "Wax Works — Mile End", accountEmail: "MileEnd@example.test", accountPassword: "waxworks-mile-end" };

describe("M-06 d47, d70 / O-01 d2 — an Owner creates a Store; the system mints its ID and position, never editable", () => {
  it("mints the next seven-digit Store ID and the next position", () => {
    expect(nextStoreId(stores)).toBe("0041984");
    expect(nextPosition(stores, ORG)).toBe(3);
    const r = addStore(stores, input, "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = r.stores.find((x) => x.id === "0041984")!;
      expect(s.position).toBe(3);
      expect(s.orgId).toBe(ORG);
      expect(s.active).toBe(true);
    }
  });

  it("positions count within the Organization", () => {
    const other: Store = { ...stores[0], id: "0050000", orgId: "org-2", position: 7 };
    expect(nextPosition([...stores, other], ORG)).toBe(3);
    expect(nextPosition([...stores, other], "org-2")).toBe(8);
  });

  it("the identifiers are read-only on the type — nothing edits them afterwards", () => {
    const r = addStore(stores, input, "AB", at);
    if (!r.ok) throw new Error("setup");
    const s = r.stores[2];
    // A compile-time guarantee, asserted at runtime for the record: the fields
    // exist and are what was minted.
    expect(Object.isFrozen(s)).toBe(false); // plain object; `readonly` is the type's promise
    expect(s.id).toBe("0041984");
    expect(s.position).toBe(3);
  });

  it("refuses a duplicate store account email, a bad email, a missing name, a short password", () => {
    expect(addStore(stores, { ...input, accountEmail: "till@example.test" }, "AB", at).ok).toBe(false);
    expect(addStore(stores, { ...input, accountEmail: "not-an-email" }, "AB", at).ok).toBe(false);
    expect(addStore(stores, { ...input, tradingName: "  " }, "AB", at).ok).toBe(false);
    expect(addStore(stores, { ...input, accountPassword: "short" }, "AB", at).ok).toBe(false);
  });

  it("normalises the account email and logs the creation with the Owner, never the password", () => {
    const r = addStore(stores, input, "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = r.stores[2];
      expect(s.accountEmail).toBe("mileend@example.test");
      const log = s.log.map((l) => l.text).join(" ");
      expect(log).toMatch(/Created as "Wax Works — Mile End" by A\. Beaulieu \(Owner\)/);
      expect(log).toMatch(/Store ID 0041984, position 3/);
      expect(log).not.toMatch(/waxworks-mile-end/);
    }
  });
});

describe("O-01 d3 / E-01 d24 — the store account password is set by an Owner, logged as changed never as a value, and signs every terminal out", () => {
  it("changes the password and logs the change without the value", () => {
    const r = setStoreAccountPassword(stores, "0041982", "a-new-till-password", "A. Beaulieu (Owner)", at);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = r.stores.find((x) => x.id === "0041982")!;
      expect(s.accountPassword).toBe("a-new-till-password");
      const last = s.log[s.log.length - 1]!.text;
      expect(last).toMatch(/Store account password changed by A\. Beaulieu \(Owner\)/);
      expect(last).toMatch(/every terminal signed out/);
      expect(last).not.toMatch(/a-new-till-password/);
    }
  });

  it("refuses a short password and an unknown Store", () => {
    expect(setStoreAccountPassword(stores, "0041982", "short", "AB", at).ok).toBe(false);
    expect(setStoreAccountPassword(stores, "9999999", "long-enough-password", "AB", at).ok).toBe(false);
  });
});
