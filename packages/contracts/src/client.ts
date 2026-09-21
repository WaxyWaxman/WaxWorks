// WaxClient — the one seam every wrapper calls through (A-98). Exactly two
// implementations exist: the real one over supabase-js rpc (./supabase.ts) and
// the in-memory fake (./fake). Which one a program uses is decided where that
// program is composed, by constructing it — never by a flag a wrapper reads.
export interface WaxClient {
  /** Call a database function by name with its named arguments. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Every refusal or failure a wrapper surfaces. `code` is the database's errcode or one of ours. */
export class ContractError extends Error {
  constructor(
    readonly fn: string,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(`${fn}: ${message}`);
    this.name = "ContractError";
  }
}

/** The M0 skeleton's only behaviour (A-99): the function has a signature and no body yet. */
export class NotImplementedError extends ContractError {
  constructor(fn: string) {
    super(fn, "not_implemented", "no contract body yet — it lands with the milestone that builds the function (A-99)");
    this.name = "NotImplementedError";
  }
}
