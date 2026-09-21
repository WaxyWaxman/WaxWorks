// The real WaxClient: supabase-js rpc (architecture §3 — writes go through a
// typed wrapper to a database function, never a table). Constructed at the
// composition root with an already-configured SupabaseClient; this file reads
// no environment (A-98).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ContractError, type WaxClient } from "./client";

export function createSupabaseWaxClient(supabase: SupabaseClient): WaxClient {
  return {
    async rpc(fn, args) {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw new ContractError(fn, error.code ?? "rpc_error", error.message, error);
      return data;
    },
  };
}
