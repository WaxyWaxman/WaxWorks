import { describe, expect, it } from "vitest";
import {
  OTP_CODE,
  SIGN_IN_REFUSAL,
  otpAccepted,
  selectableStores,
  signInPersonal,
  signInStoreAccount,
  signInSysadmin,
} from "./signIn";
import type { Store, Sysadmin, User } from "../data/types";

const ORG = "org-1";
const A = "0041982";
const B = "0041983";
const stores: Store[] = [
  { id: A, orgId: ORG, position: 1, accountEmail: "till@example.test", accountPassword: "waxworks-till", active: true, log: [] },
  { id: B, orgId: ORG, position: 2, accountEmail: "plateau@example.test", accountPassword: "waxworks-plateau", active: true, log: [] },
  { id: "0041984", orgId: ORG, position: 3, accountEmail: "closed@example.test", accountPassword: "waxworks-closed", active: false, log: [] },
  { id: "0050000", orgId: "org-2", position: 1, accountEmail: "other@example.test", accountPassword: "other-org", active: true, log: [] },
];
const u = (over: Partial<User>): User =>
  ({ id: "u-1", orgId: ORG, name: "Y. Nakamura", initials: "Y", role: "Manager", active: true, assignments: [A], email: "y@example.test", password: "waxworks-y", log: [], ...over }) as User;
const users: User[] = [
  u({}),
  u({ id: "u-2", name: "E. Okafor", initials: "EO", role: "Employee", email: "eo@example.test", password: "waxworks-eo" }),
  u({ id: "u-3", name: "T. Oyelaran", initials: "TO", active: false, email: "to@example.test", password: "waxworks-to" }),
  u({ id: "u-4", name: "A. Beaulieu", initials: "AB", role: "Owner", assignments: [], email: "owner@example.test", password: "waxworks-owner" }),
  u({ id: "u-5", name: "N. Invited", initials: "NI", email: "ni@example.test", password: undefined }),
];
const sysadmins: Sysadmin[] = [{ id: "sa-1", name: "WaxWorks Support", email: "support@waxworks.app", log: [] }];

describe("E-01 d24 — a terminal signs in with the Store's store account", () => {
  it("opens a store session for the Store whose account it is", () => {
    const r = signInStoreAccount(stores, "Till@Example.test", "waxworks-till");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.storeId).toBe(A);
  });

  it("refuses a wrong password, an unknown email and an inactive Store with ONE wording", () => {
    const wrong = signInStoreAccount(stores, "till@example.test", "nope");
    const unknown = signInStoreAccount(stores, "nobody@example.test", "waxworks-till");
    const closed = signInStoreAccount(stores, "closed@example.test", "waxworks-closed");
    for (const r of [wrong, unknown, closed]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refusal).toBe(SIGN_IN_REFUSAL);
    }
  });
});

describe("E-01 d27 — a Manager or Owner signs in as themselves; an Employee has no personal session", () => {
  it("opens for a Manager and for an Owner", () => {
    const m = signInPersonal(users, "y@example.test", "waxworks-y");
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.value.userId).toBe("u-1");
    expect(signInPersonal(users, "owner@example.test", "waxworks-owner").ok).toBe(true);
  });

  it("refuses an Employee, an inactive Manager, an uninvited Manager and a wrong password — all with the same wording", () => {
    const cases = [
      signInPersonal(users, "eo@example.test", "waxworks-eo"),
      signInPersonal(users, "to@example.test", "waxworks-to"),
      signInPersonal(users, "ni@example.test", "anything"),
      signInPersonal(users, "y@example.test", "wrong"),
      signInPersonal(users, "nobody@example.test", "wrong"),
    ];
    for (const r of cases) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refusal).toBe(SIGN_IN_REFUSAL);
    }
  });
});

describe("E-01 d28 — the second factor", () => {
  it("the personal session is not open until the code is entered", () => {
    expect(otpAccepted("123456")).toBe(false);
    expect(otpAccepted(` ${OTP_CODE} `)).toBe(true);
  });
});

describe("E-01 d27 — the Store pick on a personal session", () => {
  it("an Owner may pick any active Store of their Organization, and no other Organization's", () => {
    const ids = selectableStores(stores, users[3]).map((s) => s.id);
    expect(ids).toEqual([A, B]);
  });

  it("a Manager may pick only the Stores they are assigned to", () => {
    expect(selectableStores(stores, users[0]).map((s) => s.id)).toEqual([A]);
  });
});

describe("S-01 d1, d4 — a System Administrator signs in with a passkey and is never a User", () => {
  it("resolves from the System Administrators, never from the Organization's people", () => {
    const sa = signInSysadmin(sysadmins, "Support@WaxWorks.app");
    expect(sa.ok).toBe(true);
    if (sa.ok) expect(sa.value.sysadminId).toBe("sa-1");
    // The Owner's email is not a System Administrator's, however senior the Owner.
    expect(signInSysadmin(sysadmins, "owner@example.test").ok).toBe(false);
  });
});
