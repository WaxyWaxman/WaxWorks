// The real WaxClient: supabase-js rpc (architecture §3 — writes go through a
// typed wrapper to a database function, never a table). Constructed at the
// composition root with an already-configured SupabaseClient; this file reads
// no environment (A-98).
//
// A-105: every function is `app.<name>`, and `rpc` resolves in the schemas
// `config.toml`'s [api].schemas exposes. Calling it on the default schema
// answers PGRST202, so the call is routed through `.schema("app")` here and
// `app` is exposed there — the two halves of A-105 that must agree.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ContractError, type WaxClient } from "./client";

export function createSupabaseWaxClient(supabase: SupabaseClient): WaxClient {
  return {
    async rpc(fn, args) {
      const { data, error } = await supabase.schema("app").rpc(fn, args);
      if (error) throw new ContractError(fn, error.code ?? "rpc_error", error.message, error);
      return data;
    },
  };
}
