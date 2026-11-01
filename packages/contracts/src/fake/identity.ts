// The fake's Identity set (M1). Each handler asserts what the definer function
// would, in A-103's order — tenant, then principal and actor, then the terminal,
// then the M / O PIN resolution, then the body — and refuses with conventions
// §5's key and SQLSTATE. Rows the call writes go to `tx`, which a refusal rolls
// back.
//
// Where a check here is not settled by the specification, the comment says so
// and the M1 contracts order's Needs a human names it: those are the fake's
// placeholders, not decisions for the database to copy.
import { REFUSALS, RpcRefusal, type RefusalKey } from "../client";
import type { Call, Handler, LogRow, Role, StoreRow, StoreSettings, UserRow } from "./state";

const FIFTEEN_MINUTES = 15 * 60_000;

/** A-112's defaults, at the first shop's values (architecture §11): Alberta, CAD, March 31, 80mm; M-06 d45's lapse. */
const FIRST_SHOP_SETTINGS: StoreSettings = {
  province: "AB",
  currency: "CAD",
  fiscal_year_end: "03-31",
  receipt_width: "80mm",
  session_lapse_minutes: 5,
};

class Ctx {
  constructor(readonly call: Call) {}

  get s() { return this.call.session; }
  get tx() { return this.call.state.tx; }
  get args() { return this.call.args; }
  get request_id() { return (this.args.p_request_id as string | undefined) ?? null; }
  get at() { return this.call.now.toISOString(); }

  refuse(key: RefusalKey, detail?: string): never {
    throw new RpcRefusal(this.call.fn, REFUSALS[key], key, detail);
  }

  // ── Header assertions (A-103's order) ──────────────────────────────────────

  /** A-40, A-90: every function that is not S refuses a null authz.org_id(). */
  tenant(): string {
    const org = this.s?.org_id;
    if (!org) this.refuse("no_tenant");
    return org;
  }

  /** The actor: on a personal session the session holder (§6); on a store session the person the initials name at this Store. */
  actor(): UserRow {
    const org = this.tenant();
    const s = this.s!;
    const id = this.args.p_actor_user_id as string;
    const u = this.tx.users.find((x) => x.user_id === id && x.org_id === org && x.active);
    if (s.principal === "person") {
      // A-113: an actor argument is verified or absent. The session holder is the
      // actor here, so initials are never read — and so must not be given.
      if (id !== s.user_id || !u || u.role === "employee" || this.args.p_actor_initials != null) this.refuse("actor_mismatch");
      return u;
    }
    if (s.principal === "store") {
      const typed = norm(this.args.p_actor_initials as string | null);
      if (!u || !u.store_ids.includes(s.store_id!) || u.initials !== typed) this.refuse("actor_mismatch");
      return u;
    }
    return this.refuse("role_refused", "person");
  }

  /** A-94: on a store session the terminal belongs to authz.store_id(). */
  terminal(): string | null {
    if (this.s?.principal !== "store") return null;
    const t = this.args.p_terminal_id as string | null;
    if (!t || !this.tx.terminals.some((x) => x.terminal_id === t && x.store_id === this.s!.store_id)) this.refuse("terminal_mismatch");
    return t;
  }

  /** M / O: the PIN on a store session, the session itself on a personal one (A-89, E-01 d26, d27). */
  authorize(owner: boolean): { actor: UserRow; by: UserRow; terminal: string | null } {
    const actor = this.actor();
    const terminal = this.terminal();
    const by = this.s!.principal === "store"
      ? this.pin(this.args.p_manager_pin as string | null, terminal!, actor.user_id)
      : actor;
    if (owner) this.owner(by);
    return { actor, by, terminal };
  }

  /** O: is this an Owner — refused by name, the person being known (O-01 d1). */
  owner(by: UserRow): void {
    if (by.role !== "owner") this.refuse("role_refused", "owner");
  }

  /**
   * The one active Manager or Owner assigned to the Store holding this PIN, or
   * nobody (E-01 d26). Refusals count per Store across its terminals; five in
   * fifteen minutes close the line for fifteen and raise a flag (E-01 d31), and
   * the count is of digits tried while the line is open (E-01 d38).
   */
  pin(pin: string | null, terminal: string, staff_user_id: string | null): UserRow {
    const st = this.call.state;
    const store_id = this.s!.store_id!;
    const t = this.call.now.getTime();
    // E-01 d38: a missing PIN tried no digits — refused, neither recorded nor counted.
    if (pin === null) this.refuse("pin_refused");
    const record = (counted: boolean, closure_id: string | null) => st.pinRefusals.push({
      store_id, terminal_id: terminal, at: this.at, staff_user_id, counted, closure_id, request_id: this.request_id, principal: this.s!.principal,
    });
    const line = st.pinLines.get(store_id);
    if (line && t < line.reopens_at) {
      // E-01 d31, d38: while closed every PIN is refused with the reopening
      // time, and the attempt is recorded against the closure, not counted.
      record(false, line.closure_id);
      this.refuse("pin_line_closed", new Date(line.reopens_at).toISOString());
    }
    const holder = this.tx.users.find((u) =>
      u.org_id === this.s!.org_id && u.active && u.role !== "employee" && u.store_ids.includes(store_id) && this.tx.pins.get(u.user_id) === pin);
    // E-01 d38: a correct PIN clears nothing — the window is the last fifteen minutes' refusals.
    if (holder) return holder;

    record(true, null);
    const window = st.pinRefusals.filter((r) =>
      r.store_id === store_id && r.counted && r.closure_id === null && Date.parse(r.at) > t - FIFTEEN_MINUTES);
    if (window.length >= 5) {
      const closure_id = uid();
      st.pinLines.set(store_id, { closure_id, reopens_at: t + FIFTEEN_MINUTES });
      // E-01 d38: the closure spends the five, so the line reopens with an empty count.
      for (const r of window) r.closure_id = closure_id;
      // E-01 d39: the system's flag, no actor (A-68); its subject is the closure,
      // whose refusals each name their own terminal and staff session (A-123).
      st.flags.push({
        kind: "pin_line_closed", store_id, terminal_id: terminal, actor_user_id: null,
        subject_type: "pin_line_closure", subject_id: closure_id, context: { refusals: window.length },
        at: this.at, request_id: this.request_id, principal: this.s!.principal,
      });
    }
    return this.refuse("pin_refused");
  }

  /** S: authz.principal() = 'sysadmin' and an active system_administrators row for p_actor_user_id = auth.uid() (A-110, A-113). */
  sysadmin(): string {
    const s = this.s;
    if (s?.principal !== "sysadmin") this.refuse("role_refused", "sysadmin");
    const id = this.args.p_actor_user_id as string;
    if (id !== s.auth_uid) this.refuse("actor_mismatch");
    if (!this.call.state.sysadmins.some((x) => x.auth_user_id === id && x.active)) this.refuse("role_refused", "sysadmin");
    return id;
  }

  // ── Lookups ─────────────────────────────────────────────────────────────────

  user(id: string, org: string): UserRow {
    return this.tx.users.find((u) => u.user_id === id && u.org_id === org) ?? this.refuse("not_found");
  }

  store(id: string, org: string): StoreRow {
    return this.tx.stores.find((x) => x.store_id === id && x.org_id === org) ?? this.refuse("not_found");
  }

  activeOwners(org: string): UserRow[] {
    return this.tx.users.filter((u) => u.org_id === org && u.role === "owner" && u.active);
  }

  // ── Scope (M-04 d30, d37) ───────────────────────────────────────────────────

  /** Touching a Manager or an Owner is Owner-only (M-04 d30). */
  subjectInReach(by: UserRow, subject: UserRow, rule: "shares" | "none"): void {
    if (subject.role !== "employee") return this.owner(by);
    if (by.role === "owner" || rule === "none") return;
    // M-04 d37: one shared Store is enough for deactivate, reactivate and correct.
    if (!subject.store_ids.some((x) => by.store_ids.includes(x))) this.refuse("role_refused", "owner");
  }

  /** A Manager assigns, unassigns and adds at their own Stores only (M-04 d30). */
  ownStore(by: UserRow, store_id: string): void {
    if (by.role !== "owner" && !by.store_ids.includes(store_id)) this.refuse("role_refused", "owner");
  }

  // ── Uniqueness (M-04 d13, d27, d32; E-01 d25, d26) ─────────────────────────

  initialsClash(store_id: string, initials: string, except: string | null): void {
    const holder = this.tx.users.find((u) => u.active && u.user_id !== except && u.store_ids.includes(store_id) && u.initials === initials);
    if (holder) this.refuse("initials_clash", holder.display_name);
  }

  /** Whether another active Manager or Owner at this Store holds this PIN (E-01 d26). */
  pinTaken(store_id: string, pin: string, except: string | null): boolean {
    return this.tx.users.some((u) =>
      u.active && u.user_id !== except && u.role !== "employee" && u.store_ids.includes(store_id) && this.tx.pins.get(u.user_id) === pin);
  }

  /**
   * A PIN clash names nobody; at Set PIN, Assign, a promotion or a reactivation it
   * is logged — actor, Store, time, no digits (M-04 d32, d40; A-119, A-121).
   */
  pinClash(store_id: string, pin: string, except: string | null, log: { by: UserRow; actor: UserRow; terminal: string | null } | null): void {
    if (!this.pinTaken(store_id, pin, except)) return;
    if (log && except) {
      this.call.state.durableLog.push(this.row("users.log", except, "pin_clash_refused", log.actor.user_id, log.by.user_id, log.terminal, { store_id }));
    }
    this.refuse("pin_clash");
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  row(table: LogRow["table"], subject_id: string, action: string, actor: string | null, manager: string | null, terminal: string | null, extra: Partial<LogRow> = {}): LogRow {
    return {
      seq: ++this.call.state.seq, table, subject_id, action,
      actor_user_id: actor, manager_user_id: manager,
      principal: this.s?.principal ?? null, terminal_id: terminal,
      request_id: this.request_id, at: this.at, ...extra,
    };
  }

  log(table: LogRow["table"], subject_id: string, action: string, who: { actor: UserRow; by: UserRow; terminal: string | null }, extra: Partial<LogRow> = {}): void {
    this.tx.log.push(this.row(table, subject_id, action, who.actor.user_id, who.by.user_id, who.terminal, extra));
  }
}

/** Promotion is upward in M-04 d25's strict supersets: Employee, Manager, Owner. */
const RANK: Record<Role, number> = { employee: 0, manager: 1, owner: 2 };

const norm = (initials: string | null | undefined) => (initials == null ? null : initials.trim().toUpperCase());

const uid = () => crypto.randomUUID();

const handle = (fn: (x: Ctx) => unknown): Handler => (call) => fn(new Ctx(call));

/** Resolution among the active Users assigned to this Store, by exact normalised initials (E-01 d19, d25). */
function resolveAt(x: Ctx, store_id: string, typed: string): UserRow {
  const initials = norm(typed);
  return x.tx.users.find((u) => u.org_id === x.s!.org_id && u.active && u.store_ids.includes(store_id) && u.initials === initials)
    ?? x.refuse("not_found");
}

function storeSessionOnly(x: Ctx): void {
  x.tenant();
  if (x.s!.principal !== "store") x.refuse("role_refused", "store");
}

const asPerson = (u: UserRow) => ({ user_id: u.user_id, display_name: u.display_name, role: u.role });

export const identityHandlers: Record<string, Handler> = {
  terminal_register: handle((x) => {
    storeSessionOnly(x);
    const who = resolveAt(x, x.s!.store_id!, x.args.p_actor_initials as string);
    const terminal_id = uid();
    x.tx.terminals.push({ terminal_id, store_id: x.s!.store_id!, name: x.args.p_name as string, registered_by_user_id: who.user_id });
    x.tx.log.push(x.row("terminals", terminal_id, "terminal_registered", who.user_id, null, terminal_id));
    return { terminal_id, registered_by_user_id: who.user_id };
  }),

  actor_resolve: handle((x) => {
    storeSessionOnly(x);
    x.terminal();
    return asPerson(resolveAt(x, x.s!.store_id!, x.args.p_initials as string));
  }),

  manager_authorize_pin: handle((x) => {
    storeSessionOnly(x);
    // A-120: the staff session's actor, verified as the header verifies it —
    // before the PIN, so a pair that does not verify neither counts nor is
    // recorded. It attributes the attempt; the PIN alone decides whom it names.
    const staff = x.args.p_actor_user_id == null ? null : x.actor().user_id;
    const terminal = x.terminal()!;
    return asPerson(x.pin(x.args.p_pin as string, terminal, staff));
  }),

  session_select_store: handle((x) => {
    x.tenant();
    if (x.s!.principal !== "person") x.refuse("role_refused", "person");
    const me = x.actor();
    const org = me.org_id;
    const pickable = x.tx.stores
      .filter((st) => st.org_id === org && st.active && (me.role === "owner" || me.store_ids.includes(st.store_id)))
      .sort((a, b) => a.position - b.position);
    const want = x.args.p_store_id as string | null;
    if (want !== null) {
      x.store(want, org);
      if (!pickable.some((st) => st.store_id === want)) x.refuse("role_refused", "owner");
      me.selected_store_id = want;
      x.log("users.log", me.user_id, "store_selected", { actor: me, by: me, terminal: null }, { after: want });
    }
    return { selected_store_id: me.selected_store_id, stores: pickable.map((st) => ({ store_id: st.store_id, trading_name: st.trading_name })) };
  }),

  user_add: handle((x) => {
    const who = x.authorize(false);
    const { by } = who;
    const org = by.org_id;
    const role = x.args.p_role as Role;
    const stores = x.args.p_store_ids as string[];
    if (role !== "employee") x.owner(by);
    for (const st of stores) { x.store(st, org); x.ownStore(by, st); }
    // M-04 d27: an Employee or Manager holds at least one Store. The key is a placeholder (invalid_state).
    if (role !== "owner" && stores.length === 0) x.refuse("invalid_state", "no_store");
    const initials = norm(x.args.p_initials as string | null);
    const pin = x.args.p_pin as string | null;
    const email = x.args.p_email as string | null;
    if (stores.length > 0 && !initials) x.refuse("initials_required");
    // M-04 d28: Employees have no PIN. The key is a placeholder (invalid_state).
    if (role === "employee" && pin !== null) x.refuse("invalid_state", "employee_has_no_pin");
    if (role !== "employee" && stores.length > 0 && pin === null) x.refuse("pin_required");
    if (role !== "employee" && !email) x.refuse("email_required");
    for (const st of stores) {
      if (initials) x.initialsClash(st, initials, null);
      // M-04 d32's note: a clash at Add is refused and not logged — there is no row to log against.
      if (pin) x.pinClash(st, pin, null, null);
    }
    const user: UserRow = {
      user_id: uid(), org_id: org, display_name: x.args.p_display_name as string, initials, role, email,
      active: true, store_ids: [...stores], selected_store_id: null, auth_user_id: null, passkey_enrolled_at: null,
    };
    x.tx.users.push(user);
    if (pin) x.tx.pins.set(user.user_id, pin);
    const invite = role !== "employee";
    x.log("users.log", user.user_id, "user_added", who, { after: { role, initials, store_ids: stores, email } });
    if (pin) x.log("users.log", user.user_id, "pin_set", who);
    if (invite) x.log("users.log", user.user_id, "invite_sent", who);
    return { user_id: user.user_id, invite };
  }),

  user_change_role: handle((x) => {
    const who = x.authorize(true);
    const org = who.by.org_id;
    const u = x.user(x.args.p_user_id as string, org);
    const to = x.args.p_role as Role;
    const from = u.role;
    if (to === from) return { user_id: u.user_id, invite: false, email: null };
    const promotion = RANK[to] > RANK[from];
    // M-04 d44, d46: no role change — promotion or demotion, any role — for a
    // deactivated person; reactivate first. The key is the table's
    // wrong-state-for-the-act (invalid_state).
    if (!u.active) x.refuse("invalid_state", "inactive");
    if (from === "owner" && u.active && x.activeOwners(org).length === 1) x.refuse("owner_floor");
    // M-04 d27: an Employee or a Manager holds at least one Store — an Owner may
    // hold none, so a demotion is the third door to that state. The key is a placeholder (invalid_state).
    if (to !== "owner" && u.store_ids.length === 0) x.refuse("invalid_state", "no_store");
    const email = (x.args.p_email as string | null) ?? u.email;
    const pin = x.args.p_pin as string | null;
    // Employees have no PIN (M-04 d28): refused as user_add refuses it. The key is a placeholder (invalid_state).
    if (to === "employee" && pin !== null) x.refuse("invalid_state", "employee_has_no_pin");
    if (to !== "employee") {
      if (!email) x.refuse("email_required");
      const holdsPin = x.tx.pins.has(u.user_id);
      if (!holdsPin && pin === null && (to === "manager" || u.store_ids.length > 0)) x.refuse("pin_required");
      if (pin !== null) for (const st of u.store_ids) x.pinClash(st, pin, u.user_id, who);
    }
    // M-04 d43 (A-117): any promotion into Manager or Owner — Manager to Owner
    // included — invites while the person has never enrolled a passkey.
    const invite = promotion && u.passkey_enrolled_at === null;
    // M-04 d42: a changed email is logged before and after, and the invite row
    // names where it went (identity data, A-93).
    const emailChanged = email !== u.email;
    const before = emailChanged ? { role: from, email: u.email } : { role: from };
    const after = emailChanged ? { role: to, email } : { role: to };
    u.role = to;
    u.email = email;
    if (pin !== null && to !== "employee") { x.tx.pins.set(u.user_id, pin); x.log("users.log", u.user_id, "pin_set", who); }
    // M-04 d39: a demotion to Employee clears the PIN, so a promotion back sets a
    // fresh one, clash-checked (E-01 d26).
    if (to === "employee" && x.tx.pins.delete(u.user_id)) x.log("users.log", u.user_id, "pin_cleared", who);
    x.log("users.log", u.user_id, "role_changed", who, { before, after });
    if (invite) x.log("users.log", u.user_id, "invite_sent", who, { after: { email } });
    // A-118: the Server Action sends the invite to the address returned here.
    return { user_id: u.user_id, invite, email: invite ? email : null };
  }),

  user_deactivate: handle((x) => {
    const who = x.authorize(false);
    const org = who.by.org_id;
    const u = x.user(x.args.p_user_id as string, org);
    x.subjectInReach(who.by, u, "shares");
    if (u.role === "owner" && u.active && x.activeOwners(org).length === 1) x.refuse("owner_floor");
    u.active = false;
    x.log("users.log", u.user_id, "deactivated", who, { before: { active: true }, after: { active: false } });
    return { user_id: u.user_id };
  }),

  user_reactivate: handle((x) => {
    const who = x.authorize(false);
    const u = x.user(x.args.p_user_id as string, who.by.org_id);
    x.subjectInReach(who.by, u, "shares");
    // M-04 d47: nothing to restore for someone already active.
    if (u.active) x.refuse("invalid_state", "active");
    const initials = norm(x.args.p_initials as string | null) ?? u.initials;
    if (initials) for (const st of u.store_ids) x.initialsClash(st, initials, u.user_id);
    // M-04 d40: the PIN stays unique at the Store (E-01 d26). Without a new one, a
    // PIN given to someone else meanwhile refuses pin_clash — unnamed, and logged
    // as every refused PIN clash on an existing row is (M-04 d32) — and the
    // screen asks for one; with one, it is clash-checked and set in the same act.
    const fresh = x.args.p_pin as string | null;
    if (u.role === "employee" && fresh !== null) x.refuse("invalid_state", "employee_has_no_pin");
    // M-04 d47: a new PIN only where the old one clashes; otherwise Set PIN changes it.
    const old = x.tx.pins.get(u.user_id);
    if (fresh !== null && !(old && u.store_ids.some((st) => x.pinTaken(st, old, u.user_id)))) x.refuse("invalid_state", "pin_not_needed");
    const pin = fresh ?? old;
    if (u.role !== "employee" && pin) for (const st of u.store_ids) x.pinClash(st, pin, u.user_id, who);
    const before = { active: u.active, initials: u.initials };
    u.active = true;
    u.initials = initials;
    // Logged as changed, never as a value (M-04 d28).
    if (fresh !== null) { x.tx.pins.set(u.user_id, fresh); x.log("users.log", u.user_id, "pin_set", who); }
    x.log("users.log", u.user_id, "reactivated", who, { before, after: { active: true, initials } });
    return { user_id: u.user_id };
  }),

  user_assign: handle((x) => {
    const who = x.authorize(false);
    const org = who.by.org_id;
    const u = x.user(x.args.p_user_id as string, org);
    const st = x.store(x.args.p_store_id as string, org).store_id;
    x.subjectInReach(who.by, u, "none");
    x.ownStore(who.by, st);
    if (u.store_ids.includes(st)) return { user_id: u.user_id };
    const initials = u.initials ?? x.refuse("initials_required");
    const pin = x.tx.pins.get(u.user_id);
    if (u.role !== "employee" && !pin) x.refuse("pin_required");
    x.initialsClash(st, initials, u.user_id);
    if (u.role !== "employee" && pin) x.pinClash(st, pin, u.user_id, who);
    u.store_ids.push(st);
    x.log("users.log", u.user_id, "assigned", who, { store_id: st });
    return { user_id: u.user_id };
  }),

  user_unassign: handle((x) => {
    const who = x.authorize(false);
    const org = who.by.org_id;
    const u = x.user(x.args.p_user_id as string, org);
    const st = x.store(x.args.p_store_id as string, org).store_id;
    x.subjectInReach(who.by, u, "none");
    x.ownStore(who.by, st);
    if (!u.store_ids.includes(st)) x.refuse("not_found");
    // M-04 d27: an Employee's or Manager's last Store. The key is a placeholder (invalid_state).
    if (u.role !== "owner" && u.store_ids.length === 1) x.refuse("invalid_state", "last_store");
    u.store_ids = u.store_ids.filter((s) => s !== st);
    if (u.selected_store_id === st) u.selected_store_id = null;
    x.log("users.log", u.user_id, "unassigned", who, { store_id: st });
    return { user_id: u.user_id };
  }),

  user_correct: handle((x) => {
    const who = x.authorize(false);
    const u = x.user(x.args.p_user_id as string, who.by.org_id);
    x.subjectInReach(who.by, u, "shares");
    const before = { initials: u.initials, display_name: u.display_name, email: u.email };
    if (x.args.p_initials !== undefined) {
      const initials = norm(x.args.p_initials as string);
      for (const st of u.store_ids) x.initialsClash(st, initials!, u.user_id);
      u.initials = initials;
    }
    if (x.args.p_display_name !== undefined) u.display_name = x.args.p_display_name as string;
    if (x.args.p_email !== undefined) {
      // A Manager's or Owner's invite and re-enrolment need the address (M-04 d29). The refusal is a placeholder.
      if (x.args.p_email === null && u.role !== "employee") x.refuse("email_required");
      u.email = x.args.p_email as string | null;
    }
    x.log("users.log", u.user_id, "corrected", who, { before, after: { initials: u.initials, display_name: u.display_name, email: u.email } });
    return { user_id: u.user_id };
  }),

  user_set_pin: handle((x) => {
    const who = x.authorize(false);
    const u = x.user(x.args.p_user_id as string, who.by.org_id);
    // M-04 d28: Employees have no PIN. The key is a placeholder (invalid_state).
    if (u.role === "employee") x.refuse("invalid_state", "employee_has_no_pin");
    // M-04 d41: "at their own Stores" (M-04 d28) is one shared Store — a Manager
    // may set the PIN of anyone who shares any one of theirs.
    if (who.by.role !== "owner" && !u.store_ids.some((st) => who.by.store_ids.includes(st))) x.refuse("role_refused", "owner");
    // M-04 d48: nothing is done to a deactivated person's standing; reactivate first.
    if (!u.active) x.refuse("invalid_state", "inactive");
    const pin = x.args.p_pin as string | null;
    if (pin === null) {
      if (u.store_ids.length > 0) x.refuse("pin_required");
      x.tx.pins.delete(u.user_id);
      x.log("users.log", u.user_id, "pin_cleared", who);
      return { user_id: u.user_id };
    }
    for (const st of u.store_ids) x.pinClash(st, pin, u.user_id, who);
    x.tx.pins.set(u.user_id, pin);
    // Logged as changed, never as a value (M-04 d28, A-93).
    x.log("users.log", u.user_id, "pin_set", who);
    return { user_id: u.user_id };
  }),

  user_reset_request: handle((x) => linkSent(x, "reset_link_sent")),
  user_invite_resend: handle((x) => linkSent(x, "invite_sent")),

  store_create: handle((x) => {
    const who = x.authorize(true);
    const org = who.by.org_id;
    const position = x.tx.stores.filter((s) => s.org_id === org).length + 1;
    // Placeholder, not specified: where the seven-digit sequence starts, and whether it is global.
    const store_number = String(++x.tx.storeNumber);
    const store: StoreRow = {
      store_id: uid(), org_id: org, trading_name: x.args.p_trading_name as string, store_number, position,
      store_account_email: x.args.p_store_account_email as string, auth_user_id: null, active: true,
      settings: { ...FIRST_SHOP_SETTINGS },
    };
    x.tx.stores.push(store);
    x.log("stores.log", store.store_id, "store_created", who, { after: { trading_name: store.trading_name, store_number, position, store_account_email: store.store_account_email } });
    x.log("settings_log", store.store_id, "defaults_written", who, { after: store.settings });
    // E-01 d36: the Store an Owner creates becomes their pick.
    if (x.s!.principal === "person") who.actor.selected_store_id = store.store_id;
    return { store_id: store.store_id, store_number, position, settings: store.settings };
  }),

  store_account_reset: handle((x) => {
    const who = x.authorize(true);
    const store = x.store(x.args.p_store_id as string, who.by.org_id);
    // O-01 d3: logged as changed, never as a value.
    x.log("stores.log", store.store_id, "store_account_reset", who);
    return { store_id: store.store_id, store_account_email: store.store_account_email, auth_user_id: store.auth_user_id };
  }),

  organization_create: handle((x) => {
    const sys = x.sysadmin();
    const org_id = uid();
    x.tx.orgs.push({ org_id, name: x.args.p_name as string });
    const owner: UserRow = {
      user_id: uid(), org_id, display_name: x.args.p_owner_name as string, initials: null, role: "owner",
      email: x.args.p_owner_email as string, active: true, store_ids: [], selected_store_id: null, auth_user_id: null, passkey_enrolled_at: null,
    };
    x.tx.users.push(owner);
    x.tx.log.push(x.row("organizations.log", org_id, "organization_created", sys, null, null, { after: { name: x.args.p_name, owner_user_id: owner.user_id } }));
    x.tx.log.push(x.row("users.log", owner.user_id, "invite_sent", sys, null, null));
    return { org_id, owner_user_id: owner.user_id };
  }),

  owner_recover: handle((x) => {
    const sys = x.sysadmin();
    const org = x.tx.orgs.find((o) => o.org_id === x.args.p_org_id) ?? x.refuse("not_found");
    if (x.activeOwners(org.org_id).length > 0) x.refuse("invalid_state", "active_owner");
    const id = x.args.p_user_id as string | null;
    let owner: UserRow;
    let invite: boolean;
    if (id !== null) {
      owner = x.user(id, org.org_id);
      if (owner.role !== "owner") x.refuse("not_found");
      owner.active = true;
      invite = owner.passkey_enrolled_at === null;
    } else {
      owner = {
        user_id: uid(), org_id: org.org_id, display_name: x.args.p_owner_name as string, initials: null, role: "owner",
        email: x.args.p_owner_email as string, active: true, store_ids: [], selected_store_id: null, auth_user_id: null, passkey_enrolled_at: null,
      };
      x.tx.users.push(owner);
      invite = true;
    }
    x.tx.log.push(x.row("organizations.log", org.org_id, id ? "owner_reactivated" : "owner_invited", sys, null, null, { after: { user_id: owner.user_id } }));
    // A-118: the address the Server Action sends the invite to.
    return { user_id: owner.user_id, invite, email: invite ? owner.email : null };
  }),

  owner_reset_request: handle((x) => {
    const sys = x.sysadmin();
    const org = x.tx.orgs.find((o) => o.org_id === x.args.p_org_id) ?? x.refuse("not_found");
    const owner = x.user(x.args.p_user_id as string, org.org_id);
    if (owner.role !== "owner" || !owner.email) x.refuse("not_found");
    // S-01 d3, O-01 d5: logged where the Organization's Owners read it; never the link (A-93).
    x.tx.log.push(x.row("organizations.log", org.org_id, "reset_link_sent", sys, null, null, { after: { user_id: owner.user_id } }));
    x.tx.log.push(x.row("users.log", owner.user_id, "reset_link_sent", sys, null, null));
    return { user_id: owner.user_id, email: owner.email };
  }),

  auth_user_link: handle((x) => {
    // A-113, A-114: in place of tenant and actor, the caller is the service role.
    if (x.s?.principal !== "service") x.refuse("role_refused", "service");
    // The arguments the database itself rejects, in its order, naming the argument
    // (conventions §5). The wrapper refuses these first; a raw rpc reaches them.
    const kind = x.args.p_kind as "user" | "store" | "passkey" | null;
    if (kind !== "user" && kind !== "store" && kind !== "passkey") x.refuse("invalid_input", "p_kind");
    const id = (x.args.p_row_id as string | null) ?? x.refuse("invalid_input", "p_row_id");
    const auth = (x.args.p_auth_user_id as string | null) ?? x.refuse("invalid_input", "p_auth_user_id");
    if (kind === "passkey") {
      // A-117: the row's Auth user IS p_auth_user_id; passkey_enrolled_at set where
      // null; every enrolment logged, never a credential (A-93).
      const u = x.tx.users.find((r) => r.user_id === id) ?? x.refuse("not_found");
      if (u.auth_user_id !== auth) x.refuse("invalid_state", "auth_user_mismatch");
      u.passkey_enrolled_at ??= x.at;
      x.tx.log.push(x.row("users.log", id, "passkey_enrolled", null, null, null));
      return { kind, row_id: id };
    }
    const target = kind === "user"
      ? x.tx.users.find((u) => u.user_id === id)
      : x.tx.stores.find((s) => s.store_id === id);
    if (!target) return x.refuse("not_found");
    // A-128: a link is made once; nothing repoints a row at another Auth user.
    if (target.auth_user_id !== null) x.refuse("invalid_state", "linked");
    // A-87: Employees have no Auth user.
    if ("role" in target && target.role === "employee") x.refuse("invalid_state", "employee");
    // A-132: one Auth user, one row, across users, stores and system_administrators.
    // The database checks under an advisory lock on the id; the fake runs one call at a time.
    if (x.tx.users.some((u) => u.auth_user_id === auth) || x.tx.stores.some((s) => s.auth_user_id === auth)
      || x.call.state.sysadmins.some((a) => a.auth_user_id === auth)) x.refuse("invalid_state", "auth_user_in_use");
    target.auth_user_id = auth;
    x.tx.log.push(x.row(kind === "user" ? "users.log" : "stores.log", id, "auth_user_linked", null, null, null));
    return { kind, row_id: id };
  }),
};

/** user_reset_request and user_invite_resend — O, to a Manager or Owner; logged as sent, never the link (A-114). */
function linkSent(x: Ctx, action: "reset_link_sent" | "invite_sent") {
  const who = x.authorize(true);
  const u = x.user(x.args.p_user_id as string, who.by.org_id);
  // A-114: to a Manager or Owner. `employee` means an Employee only (conventions
  // §5); a Manager or Owner always has an email (M-04 d33, d35).
  if (u.role === "employee") x.refuse("invalid_state", "employee");
  // M-04 d44: no link reaches a deactivated person; reactivate first.
  if (!u.active) x.refuse("invalid_state", "inactive");
  // A-117: Re-send invite is for someone who never accepted.
  if (action === "invite_sent" && u.passkey_enrolled_at !== null) x.refuse("invalid_state", "enrolled");
  x.log("users.log", u.user_id, action, who);
  return { user_id: u.user_id, email: u.email };
}
