// The fake's in-memory tables. `tx` is what a call's transaction may write and a
// refusal rolls back; the rest is what survives a refusal — the record of a
// refused PIN and the line's count (E-01 d31), the flag raised at closure
// (A-28), and a refused PIN clash's log row (M-04 d32). The database must make
// those survive too, which a `raise` would not — see the order's Needs a human.
import type { FakeSession } from "./index";

export type Role = "employee" | "manager" | "owner";

export interface OrgRow { org_id: string; name: string }

export interface StoreSettings {
  province: string;
  currency: string;
  fiscal_year_end: string;
  receipt_width: "80mm" | "58mm" | "letter";
  session_lapse_minutes: number;
}

export interface StoreRow {
  store_id: string;
  org_id: string;
  trading_name: string;
  store_number: string;
  position: number;
  store_account_email: string;
  auth_user_id: string | null;
  active: boolean;
  settings: StoreSettings;
}

export interface UserRow {
  user_id: string;
  org_id: string;
  display_name: string;
  initials: string | null;
  role: Role;
  email: string | null;
  active: boolean;
  store_ids: string[];
  selected_store_id: string | null;
  auth_user_id: string | null;
  /** Holds a passkey (E-01 d33). Set only by FakeClient.enrolPasskey. */
  enrolled: boolean;
}

export interface TerminalRow { terminal_id: string; store_id: string; name: string; registered_by_user_id: string }

export interface LogRow {
  seq: number;
  table: "users.log" | "stores.log" | "organizations.log" | "settings_log" | "terminals";
  subject_id: string;
  action: string;
  /** The person who acted; on a store session, the Employee whose staff session it was. */
  actor_user_id: string | null;
  /** The Manager or Owner who authorized — by PIN on a store session, the session itself on a personal one (A-28a). */
  manager_user_id: string | null;
  principal: FakeSession["principal"] | null;
  terminal_id: string | null;
  request_id: string | null;
  at: string;
  store_id?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface FlagRow { kind: "pin_line_closed"; store_id: string; terminal_id: string; actor_user_id: string | null; at: string; request_id: string | null }

export interface PinRefusalRow { store_id: string; terminal_id: string; at: string; staff_user_id: string | null }

export interface FakeState {
  tx: {
    orgs: OrgRow[];
    stores: StoreRow[];
    users: UserRow[];
    /** user_pins — never copied out by snapshot() (A-89, A-93). */
    pins: Map<string, string>;
    terminals: TerminalRow[];
    log: LogRow[];
    storeNumber: number;
  };
  sysadmins: { auth_user_id: string; name: string; active: boolean }[];
  durableLog: LogRow[];
  pinRefusals: PinRefusalRow[];
  pinLines: Map<string, { closed_until: number | null; window: number[] }>;
  flags: FlagRow[];
  seq: number;
}

export interface Call {
  fn: string;
  args: Record<string, unknown>;
  session: FakeSession | null;
  now: Date;
  state: FakeState;
}

export type Handler = (call: Call) => unknown;

export function emptyState(sysadmins: readonly { auth_user_id: string; name: string; active?: boolean }[]): FakeState {
  return {
    tx: { orgs: [], stores: [], users: [], pins: new Map(), terminals: [], log: [], storeNumber: 1_000_000 },
    sysadmins: sysadmins.map((s) => ({ ...s, active: s.active ?? true })),
    durableLog: [],
    pinRefusals: [],
    pinLines: new Map(),
    flags: [],
    seq: 0,
  };
}

export interface FakeSnapshot {
  orgs: OrgRow[];
  stores: StoreRow[];
  users: UserRow[];
  terminals: TerminalRow[];
  log: LogRow[];
  flags: FlagRow[];
  pinRefusals: PinRefusalRow[];
}

export function snapshot(state: FakeState): FakeSnapshot {
  return structuredClone({
    orgs: state.tx.orgs,
    stores: state.tx.stores,
    users: state.tx.users,
    terminals: state.tx.terminals,
    log: [...state.tx.log, ...state.durableLog].sort((a, b) => a.seq - b.seq),
    flags: state.flags,
    pinRefusals: state.pinRefusals,
  });
}
