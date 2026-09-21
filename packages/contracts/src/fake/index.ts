// The in-memory fake (architecture §7, A-98) — a WaxClient the screens track
// builds against until the database track lands. Imported ONLY at a composition
// root, from "@waxworks/contracts/fake", so the choice is visible in a diff.
//
// M0: empty. No function has behaviour, so every call is not_implemented. Each
// milestone's contract pull request adds the behaviour for its functions here.
import { NotImplementedError, type WaxClient } from "../client";

export function createFakeClient(): WaxClient {
  return {
    async rpc(fn) {
      throw new NotImplementedError(fn);
    },
  };
}
