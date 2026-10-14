// store_create — §6 Identity — O (M-06 d70; O-01 d1–d3; A-111, A-112)
// Creates a Store with a trading name and its store account's email; mints the
// seven-digit Store ID and the next position (O-01 d2); writes the Store's
// settings rows from defaults in its own body (A-112) and logs them to
// settings_log; makes the new Store the caller's pick on a personal session
// (E-01 d36). Nobody is assigned (O-01 d2). The store account's password goes
// from the Owner's form to the Server Action's Auth call and never reaches this
// function (conventions §5, *What never reaches a definer function*).
import { z } from "zod";
import { contract, managerHeader } from "../wrapper";

export const StoreCreateInput = managerHeader.extend({
  p_trading_name: z.string().trim().min(1),
  p_store_account_email: z.string().email(),
}).strict();
export type StoreCreateInput = z.infer<typeof StoreCreateInput>;

export const StoreCreateOutput = z.object({
  store_id: z.string().uuid(),
  /** Seven digits, never editable (M-06 d47, d70). */
  store_number: z.string().regex(/^[0-9]{7}$/),
  position: z.number().int().positive(),
  /** The M1 settings rows A-112 writes — the first shop's values (§11). */
  settings: z.object({
    province: z.string(),
    currency: z.string().length(3),
    /** MM-DD (M-06 d64; A-112 answers March 31). */
    fiscal_year_end: z.string().regex(/^[0-9]{2}-[0-9]{2}$/),
    receipt_width: z.enum(["80mm", "58mm", "letter"]),
    session_lapse_minutes: z.number().int().positive(),
  }),
});
export type StoreCreateOutput = z.infer<typeof StoreCreateOutput>;

export const store_create = contract("store_create", StoreCreateInput, StoreCreateOutput);
