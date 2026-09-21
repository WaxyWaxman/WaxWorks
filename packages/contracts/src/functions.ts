// Every database function docs/architecture.md §6 names, read on 2026-09-20
// (lines 451–486), with the §6 domain that places it and its kind:
//   ""     any actor          "M" manager-only       "O" Owner-only
//   "S"    System Administrator's                    "pure" no actor — takes values
// This is the M0 skeleton's index (A-99). A reviewer checks it against §6; a
// name here §6 lacks is a contract nobody approved. The settings_* rows are a
// DERIVATION of "settings_* per configuration group" — see their source column.
export type Kind = "" | "M" | "O" | "S" | "pure";
export type Domain =
  | "helpers" | "identity" | "catalog" | "receiving" | "selling" | "stock"
  | "close" | "ledger" | "governance" | "settings" | "payables" | "claims";

export interface FunctionEntry {
  readonly domain: Domain;
  readonly name: string;
  readonly kind: Kind;
  /** Where §6 names it, and the decisions that shape it. */
  readonly source: string;
}

export const FUNCTIONS: readonly FunctionEntry[] = [
  { domain: "helpers", name: "round_to_ending", kind: "pure", source: "§6 pure helpers; A-47, A-49" },
  { domain: "helpers", name: "suggested_retail", kind: "pure", source: "§6 pure helpers; E-02 d49" },
  { domain: "helpers", name: "tax_rate_at", kind: "pure", source: "§6 pure helpers; A-58" },
  { domain: "helpers", name: "upc_a_check_digit", kind: "pure", source: "§6 pure helpers" },
  { domain: "helpers", name: "invoice_is_paid", kind: "pure", source: "§6; A-33b, A-41 — M3 ships it returning false" },
  { domain: "helpers", name: "period_is_sealed", kind: "pure", source: "§6; A-80 — M5 ships it returning false" },
  { domain: "catalog", name: "resolve_scan", kind: "", source: "§6 scan resolution — read-only" },
  { domain: "identity", name: "terminal_register", kind: "", source: "§6 Identity; A-87" },
  { domain: "identity", name: "actor_resolve", kind: "", source: "§6 Identity; §5.3, M-04 d15" },
  { domain: "identity", name: "manager_authorize_pin", kind: "", source: "§6 Identity; E-01 d26" },
  { domain: "identity", name: "session_select_store", kind: "", source: "§6 Identity; E-01 d27" },
  { domain: "identity", name: "user_add", kind: "M", source: "§6 Identity — M, O for a Manager or Owner" },
  { domain: "identity", name: "user_change_role", kind: "O", source: "§6 Identity" },
  { domain: "identity", name: "user_deactivate", kind: "M", source: "§6 Identity — M, O for a Manager or Owner" },
  { domain: "identity", name: "user_reactivate", kind: "M", source: "§6 Identity — M, O for a Manager or Owner" },
  { domain: "identity", name: "user_assign", kind: "M", source: "§6 Identity — M, O for a Manager or Owner" },
  { domain: "identity", name: "user_unassign", kind: "M", source: "§6 Identity — M, O for a Manager or Owner" },
  { domain: "identity", name: "user_correct", kind: "M", source: "§6 Identity" },
  { domain: "identity", name: "user_set_pin", kind: "M", source: "§6 Identity; M-04 d28, d30" },
  { domain: "identity", name: "store_create", kind: "O", source: "§6 Identity; M-06 d70, O-01 d2–d3" },
  { domain: "identity", name: "store_account_reset", kind: "O", source: "§6 Identity; M-06 d70, O-01 d3" },
  { domain: "identity", name: "organization_create", kind: "S", source: "§6 Identity; S-01 d2–d3" },
  { domain: "identity", name: "owner_recover", kind: "S", source: "§6 Identity; S-01 d2–d3" },
  { domain: "identity", name: "owner_reset_request", kind: "S", source: "§6 Identity; S-01 d2–d3" },
  { domain: "catalog", name: "record_upsert_from_provider", kind: "", source: "§6 Catalog" },
  { domain: "catalog", name: "mint_internal_barcode", kind: "", source: "§6 Catalog" },
  { domain: "catalog", name: "catalog_genre_map_add", kind: "", source: "§6 Catalog; A-59 — not M" },
  { domain: "catalog", name: "catalog_genre_map_update", kind: "M", source: "§6 Catalog; A-59" },
  { domain: "catalog", name: "catalog_genre_map_remove", kind: "M", source: "§6 Catalog; A-59" },
  { domain: "receiving", name: "receiving_worklist", kind: "", source: "§6 Receiving" },
  { domain: "receiving", name: "receiving_history", kind: "", source: "§6 Receiving" },
  { domain: "receiving", name: "invoice_lookup", kind: "", source: "§6 Receiving" },
  { domain: "receiving", name: "invoice_open", kind: "", source: "§6 Receiving" },
  { domain: "receiving", name: "invoice_add_line", kind: "", source: "§6 Receiving" },
  { domain: "receiving", name: "invoice_finalize", kind: "", source: "§6 Receiving; A-67" },
  { domain: "receiving", name: "invoice_void", kind: "M", source: "§6 Receiving" },
  { domain: "selling", name: "sale_open", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_add_line", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_update_line", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_hold", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_reopen", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_force_unlock", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_tender", kind: "", source: "§6 Selling — the heaviest function" },
  { domain: "selling", name: "sale_void", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "sale_edit", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "hold_create", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "hold_cancel", kind: "", source: "§6 Selling" },
  { domain: "selling", name: "return_add_line", kind: "", source: "§6 Selling" },
  { domain: "stock", name: "inventory_adjust", kind: "M", source: "§6 Stock; A-67" },
  { domain: "stock", name: "return_route_stock", kind: "M", source: "§6 Stock — M where the route is written off; A-81" },
  { domain: "close", name: "close_preview", kind: "", source: "§6 Close" },
  { domain: "close", name: "close_run", kind: "", source: "§6 Close; A-67, A-83" },
  { domain: "close", name: "close_undo", kind: "M", source: "§6 Close; A-66, A-84" },
  { domain: "ledger", name: "gl_account_upsert", kind: "M", source: "§6 Ledger" },
  { domain: "ledger", name: "gl_mapping_set", kind: "M", source: "§6 Ledger" },
  { domain: "ledger", name: "bank_deposit_record", kind: "M", source: "§6 Ledger" },
  { domain: "ledger", name: "bank_deposit_void", kind: "M", source: "§6 Ledger" },
  { domain: "ledger", name: "journal_export", kind: "M", source: "§6 Ledger" },
  { domain: "ledger", name: "ledger_posting_create", kind: "M", source: "§6 Ledger; A-74" },
  { domain: "ledger", name: "ledger_posting_edit", kind: "M", source: "§6 Ledger; A-74, A-52" },
  { domain: "ledger", name: "ledger_opening_position_save", kind: "M", source: "§6 Ledger; A-74, A-78" },
  { domain: "ledger", name: "ledger_opening_position_seal", kind: "M", source: "§6 Ledger; A-74, A-78" },
  { domain: "ledger", name: "period_seal", kind: "M", source: "§6 Ledger; A-74, A-75" },
  { domain: "ledger", name: "period_unseal", kind: "M", source: "§6 Ledger; A-74, A-75, A-76" },
  { domain: "ledger", name: "year_mark_filed", kind: "M", source: "§6 Ledger; A-74, A-77" },
  { domain: "ledger", name: "statement_issue", kind: "M", source: "§6 Ledger; A-74, A-77" },
  { domain: "ledger", name: "reconciliation_create", kind: "M", source: "§6 Ledger; A-74" },
  { domain: "governance", name: "review_flag_acknowledge", kind: "M", source: "§6 Governance" },
  { domain: "settings", name: "settings_store", kind: "M", source: "§6 Settings — derived group: store_settings" },
  { domain: "settings", name: "settings_tax_types", kind: "M", source: "§6 Settings — derived group: tax_types" },
  { domain: "settings", name: "settings_product_tax_codes", kind: "M", source: "§6 Settings — derived group: product_tax_codes" },
  { domain: "settings", name: "settings_tax_groups", kind: "M", source: "§6 Settings — derived group: tax_groups and tax_group_cells" },
  { domain: "settings", name: "settings_tender_types", kind: "M", source: "§6 Settings — derived group: tender_types" },
  { domain: "settings", name: "settings_currencies", kind: "M", source: "§6 Settings — derived group: currencies" },
  { domain: "settings", name: "settings_sections", kind: "M", source: "§6 Settings — derived group: sections" },
  { domain: "settings", name: "settings_genres", kind: "M", source: "§6 Settings — derived group: genres" },
  { domain: "settings", name: "settings_genre_merge", kind: "M", source: "§6 Settings; A-60" },
  { domain: "payables", name: "ap_settle", kind: "M", source: "§6 Payables; A-38" },
  { domain: "payables", name: "ap_batch_void", kind: "M", source: "§6 Payables; A-38, A-42" },
  { domain: "payables", name: "ap_entry_create", kind: "M", source: "§6 Payables; A-38" },
  { domain: "payables", name: "ap_clearing_create", kind: "M", source: "§6 Payables; A-38" },
  { domain: "payables", name: "claim_create", kind: "", source: "§6 Payables" },
  { domain: "payables", name: "claim_mark_credited", kind: "M", source: "§6 Payables; A-38" },
  { domain: "claims", name: "claim_send", kind: "", source: "§6 Claims; E-04 d22, d23, d26" },
  { domain: "claims", name: "claim_abandon", kind: "M", source: "§6 Claims; E-04 d24" },
  { domain: "claims", name: "claim_void", kind: "M", source: "§6 Claims; A-46, E-04 d27, d29" },
];
