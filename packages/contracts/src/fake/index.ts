// The in-memory fake (architecture §7, A-98) — a WaxClient the screens track
// builds against until the database track lands. Imported ONLY at a composition
// root, from "@waxworks/contracts/fake", so the choice is visible in a diff.
//
// It knows who is signed in the way the database does — from the session, never
// from an argument (conventions §5, *How the fake knows who is signed in*):
// `createFakeClient({ session })`, and `withSession(session)` for another
// principal over the same state. It refuses as the function would, with the
// key and SQLSTATE of conventions §5's table, by throwing an RpcRefusal.
//
// M1: the Identity set (./identity.ts). Every other function is not_implemented.
import { RpcRefusal, type WaxClient } from "../client";
import { identityHandlers } from "./identity";
import { emptyState, snapshot, type FakeSnapshot, type FakeState, type Handler } from "./state";

export type { FakeSnapshot } from "./state";

/** §5.4's claim shape, which the fake reads where the database reads the JWT (A-87). */
export interface FakeSession {
  /**
   * `enrolment` is A-117's: a person signed in by an invitation or re-enrolment
   * link, with a null org_id and store_id, so it reaches no function. `service`
   * stands for the Postgres role service_role, which A-113 has auth_user_link
   * assert — it is not a claim the access-token hook mints.
   */
  principal: "store" | "person" | "sysadmin" | "service" | "enrolment";
  org_id: string | null;
  store_id: string | null;
  /** users.id on a personal session; null otherwise. */
  user_id: string | null;
  terminal_id: string | null;
  /**
   * The JWT `sub` — auth.uid(). Only an S function reads it: it asserts
   * p_actor_user_id = auth.uid() and an active system_administrators row (A-113).
   */
  auth_uid?: string | null;
}

export interface FakeOptions {
  session?: FakeSession | null;
  /** The system_administrators rows — written by hand in production (A-110), so seeded here. */
  sysadmins?: readonly { auth_user_id: string; name: string; active?: boolean }[];
  /** The clock; the PIN throttle (E-01 d31) is fifteen minutes of it. */
  now?: () => Date;
}

export interface FakeClient extends WaxClient {
  readonly session: FakeSession | null;
  /** Another principal over the same in-memory state. */
  withSession(session: FakeSession | null): FakeClient;
  /** A copy of what the fake holds, for a test to assert on. No PIN is in it (A-93). */
  inspect(): FakeSnapshot;
}

const handlers: Record<string, Handler> = { ...identityHandlers };

export function createFakeClient(options: FakeOptions = {}): FakeClient {
  const state = emptyState(options.sysadmins ?? []);
  const now = options.now ?? (() => new Date());
  return bind(state, now, options.session ?? null);
}

function bind(state: FakeState, now: () => Date, session: FakeSession | null): FakeClient {
  return {
    session,
    withSession: (next) => bind(state, now, next),
    inspect: () => snapshot(state),
    async rpc(fn, args) {
      const handler = handlers[fn];
      if (!handler) throw new RpcRefusal(fn, "not_implemented", "not_implemented");
      // One call is one transaction: a refusal rolls back everything but the
      // records E-01 d31 and M-04 d32 require of a refused attempt.
      const saved = structuredClone(state.tx);
      try {
        return structuredClone(handler({ fn, args, session, now: now(), state }));
      } catch (e) {
        state.tx = saved;
        throw e;
      }
    },
  };
}
