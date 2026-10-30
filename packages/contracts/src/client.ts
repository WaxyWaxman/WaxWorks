// WaxClient — the one seam every wrapper calls through (A-98). Exactly two
// implementations exist: the real one over supabase-js rpc (./supabase.ts) and
// the in-memory fake (./fake). Which one a program uses is decided where that
// program is composed, by constructing it — never by a flag a wrapper reads.
export interface WaxClient {
  /** Call a database function by name with its named arguments. Refuses by throwing an RpcRefusal. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
}

// One SQLSTATE and one stable message key per kind of refusal — conventions §5's
// table (M1 contracts order, row 30), raised by the function as
// `raise exception '<key>' using errcode = '<SQLSTATE>'` and mimicked by the fake.
// Screens branch on the key, never on human text. The keys, kinds and SQLSTATE
// values are decided — the values ratified 2026-10-29 by sr-talbot (conventions
// §5's status line).
export const REFUSALS = {
  no_tenant: "28000",
  actor_mismatch: "28000",
  terminal_mismatch: "28000",
  role_refused: "42501",
  pin_refused: "28P01",
  pin_line_closed: "WX429",
  initials_clash: "23505",
  pin_clash: "23505",
  not_found: "WX404",
  owner_floor: "23514",
  pin_required: "23502",
  email_required: "23502",
  initials_required: "23502",
  invalid_state: "WX409",
  pin_pepper_missing: "XX000",
} as const;
export type RefusalKey = keyof typeof REFUSALS;

/**
 * A designed refusal is told apart from a real Postgres error by the pair: the
 * message is a key of the table AND the code is that key's. A genuine 23505 or
 * 23502 shares a refusal's code but not its message; a refusal raised without
 * `using errcode` shares the key but answers P0001. Either is a failure, so a
 * real error's message and DETAIL never pose as a refusal's (A-93; M1 contracts
 * order, finding 1).
 */
export function isRefusal(key: string, code: string | undefined): key is RefusalKey {
  return Object.hasOwn(REFUSALS, key) && REFUSALS[key as RefusalKey] === code;
}

/**
 * The refusals whose row in conventions §5's table names a detail. Any other
 * refusal's DETAIL is dropped by the real client, so a body that names a PIN's
 * holder in `pin_clash` cannot reach the screen (M-04 d32, A-93).
 */
export const REFUSAL_DETAIL: ReadonlySet<RefusalKey> = new Set<RefusalKey>(["role_refused", "pin_line_closed", "initials_clash", "invalid_state"]);

/**
 * What a WaxClient throws when the database (or the fake) refuses or fails: the
 * errcode, the message — a refusal key for a refusal — and its `detail`. The
 * wrapper turns it into a ContractError carrying the call's request_id.
 */
export class RpcRefusal extends Error {
  constructor(
    readonly fn: string,
    readonly code: string,
    readonly key: string,
    readonly detail?: string,
    readonly details?: unknown,
  ) {
    super(`${fn}: ${key}`);
    this.name = "RpcRefusal";
  }
}

/**
 * What the real WaxClient throws for an error that is not a refusal: the raw
 * PostgREST error, which the wrapper keeps in `details` only — never as a key,
 * a message or a detail. Its `code` (a SQLSTATE or `PGRST…`) is the error
 * class A-93 permits, kept so a screen can tell an expired session (PGRST301)
 * from a fault.
 */
export class RpcFailure extends Error {
  constructor(readonly fn: string, readonly error: unknown, readonly code?: string) {
    super(`${fn}: the call did not complete`);
    this.name = "RpcFailure";
  }
}

export interface ContractErrorInit {
  /** The database's errcode, or one of ours: invalid_input, invalid_output, not_implemented, rpc_failed. */
  code: string;
  /** The stable message key (conventions §5); for our own codes, the code itself. */
  key?: string;
  /** Minted by the wrapper for every call before it validates (A-108). */
  request_id: string;
  message?: string;
  /**
   * The refusal's structured detail — a reopening time, a holder's name, a role
   * required. A holder's name is identity data, so A-106's allowlist drops it,
   * and `message`, along with `details`: an error event is built from `fn`,
   * `key`, `code` and `request_id` (A-93, A-108; M1 contracts order, finding 5).
   */
  detail?: string | undefined;
  /** Raw diagnostics: Zod issues or the PostgREST error. A-106's allowlist drops this field (A-108). */
  details?: unknown;
}

/** Every refusal or failure a wrapper surfaces. Every one carries a request_id (A-108). */
export class ContractError extends Error {
  readonly code: string;
  readonly key: string;
  readonly request_id: string;
  readonly detail?: string;
  readonly details?: unknown;

  constructor(readonly fn: string, init: ContractErrorInit) {
    super(`${fn}: ${init.message ?? init.key ?? init.code}`);
    this.name = "ContractError";
    this.code = init.code;
    this.key = init.key ?? init.code;
    this.request_id = init.request_id;
    if (init.detail !== undefined) this.detail = init.detail;
    if (init.details !== undefined) this.details = init.details;
  }
}

/** The M0 skeleton's only behaviour (A-99): the function has a signature and no body yet. */
export class NotImplementedError extends ContractError {
  constructor(fn: string, request_id: string) {
    super(fn, {
      code: "not_implemented",
      request_id,
      message: "no contract body yet — it lands with the milestone that builds the function (A-99)",
    });
    this.name = "NotImplementedError";
  }
}
