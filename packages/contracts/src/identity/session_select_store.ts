// session_select_store — §6 Identity; A-87; E-01 d27, d36
// Any actor; personal session only. The pick is a write: it records
// users.selected_store_id, and the access-token hook copies it into the next
// token. Refused where the person is not assigned, unless an active Owner.
// p_store_id null changes nothing and reports — an Owner whose Organization
// has no Store has nothing to pick (E-01 d36).
import { z } from "zod";
import { contract, header } from "../wrapper";

export const SessionSelectStoreInput = header.extend({
  p_store_id: z.string().uuid().nullable(),
}).strict();
export type SessionSelectStoreInput = z.infer<typeof SessionSelectStoreInput>;

export const SessionSelectStoreOutput = z.object({
  selected_store_id: z.string().uuid().nullable(),
  /** The Stores this person may pick: an Owner any active Store, anyone else their own (E-01 d27). */
  stores: z.array(z.object({ store_id: z.string().uuid(), trading_name: z.string() })),
});
export type SessionSelectStoreOutput = z.infer<typeof SessionSelectStoreOutput>;

export const session_select_store = contract("session_select_store", SessionSelectStoreInput, SessionSelectStoreOutput);
