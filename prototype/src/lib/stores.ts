import type { Store } from "../data/types";

// O-01's writes on a Store's IDENTITY, as pure functions — the same reasons
// `users.ts` gives. What a Store holds (settings, details, stock, Sales) is
// the per-Store slice of state and is not touched here.

export type StoreWrite =
  | { ok: true; stores: Store[]; id: string }
  | { ok: false; reason: string };

const stamp = (text: string, now: () => string) => ({ at: now(), text });
const defaultNow = () => new Date().toISOString().slice(0, 19);

// M-06 d47 / d70, O-01 d2 — the seven-digit Store ID is minted by the system
// as the next value, and the position as the next integer, in the function so
// two Owners creating two Stores at once cannot collide (A-89). Neither is
// ever editable afterwards.
export function nextStoreId(stores: Store[]): string {
  const max = stores.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0);
  return String(max + 1).padStart(7, "0");
}

export function nextPosition(stores: Store[], orgId: string): number {
  return stores.filter((s) => s.orgId === orgId).reduce((m, s) => Math.max(m, s.position), 0) + 1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// O-01 d2 — an Owner gives a trading name and a store account; the system
// assigns the identifiers. The trading name lives in the Store's details
// slice; it is taken here only to be logged and handed back for the slice to
// seed from (M-06 d46 keeps legal and trading names on the details block).
export function addStore(
  stores: Store[],
  input: { orgId: string; tradingName: string; accountEmail: string; accountPassword: string },
  by: string,
  now: () => string = defaultNow,
): StoreWrite {
  if (!input.tradingName.trim()) return { ok: false, reason: "A trading name is required." };
  const email = input.accountEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "The store account needs a valid email address (E-01 d24)." };
  if (stores.some((s) => s.accountEmail === email))
    return { ok: false, reason: `${email} is already another Store's store account.` };
  if (input.accountPassword.length < 8) return { ok: false, reason: "The store account password is at least 8 characters." };
  const id = nextStoreId(stores);
  const store: Store = {
    id,
    orgId: input.orgId,
    position: nextPosition(stores, input.orgId),
    accountEmail: email,
    accountPassword: input.accountPassword,
    active: true,
    log: [
      stamp(`Created as "${input.tradingName.trim()}" by ${by} — Store ID ${id}, position ${nextPosition(stores, input.orgId)}`, now),
      stamp(`Store account ${email} set by ${by}`, now),
    ],
  };
  return { ok: true, stores: [...stores, store], id };
}

// O-01 d3 — the one credential an administrator types, because it is a
// Store's and not a person's. Logged as changed, never as a value. The caller
// (the store) is what signs every terminal of the Store out — that is a
// session fact, not a row fact, and E-01 d24 says it happens at once.
export function setStoreAccountPassword(
  stores: Store[],
  storeId: string,
  password: string,
  by: string,
  now: () => string = defaultNow,
): StoreWrite {
  const s = stores.find((x) => x.id === storeId);
  if (!s) return { ok: false, reason: "No such Store." };
  if (password.length < 8) return { ok: false, reason: "The store account password is at least 8 characters." };
  return {
    ok: true,
    id: storeId,
    stores: stores.map((x) =>
      x.id === storeId
        ? { ...x, accountPassword: password, log: [...x.log, stamp(`Store account password changed by ${by} — every terminal signed out`, now)] }
        : x,
    ),
  };
}
