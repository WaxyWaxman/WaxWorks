// Domain types — a deliberately thin slice of PRD §4, enough to make the
// counter-core flows (E-03..E-07) clickable. Not the real schema.

export type Grade = "M" | "NM" | "VG+" | "VG" | "G+" | "G" | "F" | "P";
export const GRADES: Grade[] = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];

// M-06 d28 — Sections are an EDITABLE TABLE, not a fixed list, so the type is
// the code rather than a closed union. The attributes live on SectionRow
// below; a Record carries only the code, because d31 says a catalog entry
// stores nothing its configuration already implies.
export type Section = string;

export interface RecordEntry {
  id: string;
  artist: string;
  title: string;
  label: string;
  catalogNo: string;
  format: string;
  year: number;
  country: string;
  // The genre's stable id, never its name (see Genre below).
  genreId: string;
  // A-61 — the provider tags this Record was adopted under, the matched one
  // marked. Undefined where the release carried none at all, which d53 keeps
  // distinct from an unmapped tag: both prompt, but only one can write a map
  // row. Display-only and never read by the money path, which resolves
  // through the genre's product tax code (d12).
  providerTags?: AdoptedTag[];
  // M-06 d31, d32 — the Record stores its GENRE and NOT its Section. Section
  // is derived through the genre's required parent (see lib/taxonomy.ts);
  // storing both was the same fact at two removes, and it drifted the moment
  // a genre was remapped.
  art: string; // emoji stand-in for cover art
  manufacturerUpc?: string;
  discogsId?: string;
  stickyPrice?: number; // New stock only
  minOnHand: number;
  catalogOnly?: boolean; // a Discogs match we do not hold
  // A default only — the Supplier actually used is recorded on each order
  // line (M-02), so the same title can be bought from different Suppliers
  // over time without rewriting history.
  preferredSupplierId?: string;
}

export type ItemStatus = "sellable" | "held" | "sold";

export interface InventoryItem {
  id: string;
  recordId: string;
  grade: Grade;
  price: number;
  cost: number;
  internalBarcode: string;
  backroom?: boolean;
  conditionNote?: string;
  status: ItemStatus;
  heldByCustomerId?: string;
  // architecture A-45, E-02 d48 — the InvoiceLine this copy was minted from,
  // and the ONLY link back to its paperwork. The Invoice is one lookup away
  // and the Supplier two; neither is stored here. Absent = not received on
  // any Invoice, which is an oversold copy until E-04 d19 reconciles it.
  // Resolve it through lib/provenance.ts, never by parsing a label.
  invoiceLineId?: string;
  // "Oversold" (lexicon) — minted straight from a Sale, before any Invoice
  // line ever backed it (E-05 decision 21 allows selling into negative
  // inventory). It's real from the moment it's sold — status is "sold" from
  // birth, cost is unknown until reconciled. Clears when matching stock is
  // later received (oldest oversold item first, ahead of minting new sellable
  // copies) or a manager force-clears it as a hand adjustment.
  oversold?: boolean;
  oversoldAt?: string;
  oversoldReconciledAt?: string;
  oversoldReconciledBy?: string;
  oversoldReconciledVia?: "received" | "adjustment";
}

export type SupplierOrderVia = "Phone" | "Email" | "FTP" | "Their Website" | "Fax" | "Rep";
export type SupplierMinBasis = "Retail" | "Net";
export type SupplierType = "Used" | "Bargain" | "New";

// Suppliers (M-01) — no field here is gated; any Employee can New/Edit/Copy.
export interface Supplier {
  id: string;
  shortName: string; // 4-letter code, used on Invoices (e.g. "FAB1")
  name: string;
  accountNumber?: string;
  orderVia: SupplierOrderVia;
  // An order is "ready to place" once it hits minOrderQty. If that's 0,
  // readiness falls back to minOrderAmount instead, priced at whichever
  // basis minOrderAmountBasis names.
  minOrderQty: number;
  minOrderAmount: number;
  minOrderAmountBasis: SupplierMinBasis;
  discountPct: number; // % off retail this supplier offers — also drives suggested retail at receiving (E-02 decision 8)
  cancelByDays?: number; // default days from order-placed to auto-cancel if unfulfilled; unset = not supported by this supplier, overridable per order
  currency: string;
  paymentTerms?: PaymentTerms; // M-01 d19, d20 — the DEFAULT for Invoices received from them
  defaultPaymentMethod?: PaymentMethod; // M-01 d20 — how they are normally paid; a default, never a rule
  type: SupplierType;
  notes?: string;
  email: string;
  backordersAllowed: boolean;
  repName?: string;
  repPhone?: string;
  mainPhone?: string;
  defaultForSecondHand?: boolean; // E-02 decision 27 — pre-fills the Supplier field
  // when Second-hand intake is chosen; there's no dedicated single supplier,
  // any Supplier can carry second-hand invoices, this just picks which one
  // to suggest first.
  consignment?: boolean; // M-05 — a real Receiving Invoice from this Supplier displays as "Consignment" rather than "Invoice" in Accounts Payable
  // M-01 d13. Billing is where payment is remitted; shipping is where stock
  // ships from — the address a claim is argued against. When
  // shipSameAsBilling is true (the default, and true of most Suppliers) the
  // card mirrors billing into the locked shipping fields and `shipping` is
  // not read: the mirror is derived at render, never a second copy that can
  // drift. Nothing consumes either yet — billing is captured for M-05,
  // shipping for E-04 claim correspondence.
  billing?: PostalAddress;
  shipping?: PostalAddress;
  shipSameAsBilling?: boolean;
  log: { at: string; text: string }[];
}

// M-06 d17 — freight, services and bulk goods are REAL CATALOG ENTRIES
// carrying a genre, not a separate type with a Section. That is what makes
// tax resolution have no special case: every sellable thing reaches the
// till through catalog entry → genre → product tax code → taxes, one path.
// Section is derived from the genre's parent like anything else (d31).
export interface NonTrackedItem {
  code: string; // e.g. FREIGHT
  label: string;
  price: number; // 0 => prompt at till
  genreId: string;
}

export interface GiftCard {
  code: string; // GC-prefixed
  balance: number; // 0 => not yet loaded
  customerId?: string;
}

export interface TaxLine {
  id: string;
  name: string;
  rate: number; // 0.0 - 1.0
}

export type TenderType =
  | "Cash"
  | "Credit Card"
  | "Account Balance"
  | "Gift Card"
  | "Pay-out"
  | "Used Credit";

// One address shape, used by both a Customer and a Supplier (M-01 d13) —
// two shapes would mean two renderers and two validation rules for the same
// five fields.
export interface PostalAddress {
  line1?: string;
  line2?: string;
  city?: string;
  provinceState?: string; // 2-letter
  country?: string;
}

/** @deprecated Kept as the name E-07 already uses. Same shape. */
export type CustomerAddress = PostalAddress;

export interface Customer {
  id: string; // internal key, never shown
  primaryId: number; // incremental, permanent — shown, never edited
  accountNumber: string; // staff-editable, must stay unique
  accountType: "Regular" | "Staff" | "Business";
  name: string;
  phone: string;
  email: string;
  contactPreference: "Phone" | "Email";
  address?: CustomerAddress;
  globalDiscountPct: number;
  // M-06 d14, E-07 — the Customer supplies ONE of the two coordinates: their
  // tax group. It is the group's ShortName that appears on the card. Absent
  // means the store's default group applies; it is not an override and never
  // competes with the product's axis.
  taxGroupId?: string;
  note?: string;
  balance: number; // A/R balance — + store owes customer (store credit); - customer owes store
}

// "Open" (being rung up, no Sale number, locked to whoever opened it) is
// distinct from "Current" (tendered, awaiting the day's close) — architecture
// spine decision, E-05 d21.
export type SaleState = "Open" | "Current" | "Held" | "Closed" | "Void";
export type SaleLineKind = "item" | "giftcard-load" | "nontracked";

export interface SaleLine {
  id: string;
  kind: SaleLineKind;
  recordId?: string;
  inventoryItemId?: string;
  title: string;
  grade?: Grade;
  qty: number; // negative => Return
  price: number;
  discountPct: number;
  // M-06 d12 — what the PRODUCT is: the Genre's product tax code, copied onto
  // the line when it is added, because that is a fact about what was sold and
  // is fixed the moment it goes in the basket (A-57).
  productTaxCode: string;
  // The genre the line resolved through, kept as a POINTER rather than a
  // copy. It is what M-03's *By Section* reads, and it must stay live:
  // architecture A-60 has merging a genre re-bucket every Record under it
  // at once, which a snapshotted Section could not do. Contrast
  // `productTaxCode` directly above, which is deliberately a snapshot —
  // what was charged is a fact, where which shelf it belongs on is not.
  // Item lines carry it via `recordId`; non-tracked and gift-card lines
  // carry it here, since they have no Record in this prototype.
  genreId?: string;
  // A-57 — the tax SNAPSHOT: the tax types resolved and the rates applied,
  // never a reference to a configuration row. Taken at TENDER, not at line-add,
  // because what was collected is not a fact until something is collected.
  // Undefined while the Sale is open; the screen computes live until then.
  tax?: TaxComponent[];
  note?: string;
  linkedSaleNumber?: number; // E-06 link to original Sale
  stockRouted?: boolean; // E-06 step 6 — returned copy has been dispositioned
  routedTo?: "sellable" | "regrade" | "writeoff";
}

export interface Tender {
  id: string;
  type: TenderType;
  amount: number;
  note?: string;
  reference?: string;
  // Account Balance only — which way it moves the Customer's balance.
  // Undefined behaves as "draw" (the original, draw-down-only behavior),
  // so nothing else that sets a Tender needs to know this field exists.
  accountDirection?: "add" | "draw";
}

export interface Sale {
  id: string;
  state: SaleState;
  saleNumber?: number;
  holdRef?: string;
  po?: string;
  customerId?: string;
  // M-06 d14 — who the CUSTOMER is: their tax group, else the store's default.
  // Snapshotted at tender alongside the line tax, so a Sale records the
  // coordinate it actually resolved through rather than re-deriving it later.
  taxGroupId?: string;
  lines: SaleLine[];
  tenders: Tender[];
  createdBy: string;
  createdAt: string;
  isReturn?: boolean;
  lockedBy?: string; // set while Open; cleared on Hold/tender/void — E-05 locking
  replacesSaleId?: string; // Edit (Current) voids the original and duplicates it — this points back, for the audit trail
  batchId?: string; // set once a Current Sale is closed by Total Today's Sales (M-03)
  log: { at: string; text: string }[];
}

// ---- M-03 — closing the day is a state transition, not just a report ----
export interface CloseBatch {
  id: string;
  at: string;
  by: string;
  saleIds: string[];
  undoneAt?: string;
  undoneBy?: string;
}

// ---- Supplier Claims (E-04 §"Supplier claims") ----
// Distinct from a customer Return (E-06) — this is claiming credit from a
// supplier for stock that arrived short, damaged, or not at all.
export const CLAIM_REASONS = [
  "Billed / not shipped",
  "Received damaged",
  "Short shipped",
  "Wrong item",
] as const;
export type ClaimReason = (typeof CLAIM_REASONS)[number];

// E-04 d11, d24. There is no `Draft`: the prototype carried one the record
// never admitted, and d21 retired it. **Unsent is derived from `sentAt`**
// (d25) — never from the absent claim number, which d10 lets a person type
// and which a derived state must therefore not key on (architecture A-43).
// So an unsent claim is an ordinary `Pending` one that has no sent date.
export type ClaimStatus = "Pending" | "Credited" | "Abandoned";

// E-04 d24 — why the store stopped expecting the money. Same shape as the
// adjustment reason codes in d4: visible rather than gated.
export const ABANDON_REASONS = [
  "Declined by supplier",
  "No response",
  "Not worth chasing",
  "Other",
] as const;
export type AbandonReason = (typeof ABANDON_REASONS)[number];

// E-04 d27 — why the claim itself was wrong. A different question from
// ABANDON_REASONS: those say no money is coming, these say the claim should
// never have been sent.
export const VOID_REASONS = [
  "Raised against the wrong copy",
  "Wrong Invoice",
  "Wrong reason or amount",
  "Duplicate of another claim",
  "Other",
] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

/**
 * E-04 d27 and d29, architecture A-44 as amended by A-46 — a claim void is a
 * ROW, never a column. A `voidedAt` on the claim would be an update to the row
 * the void exists to leave alone (the rule A-36 sets for payment batches).
 *
 * A void is a REVERSAL, not a terminal state (d29): it retires the number and
 * returns the claim to unsent, keeping its lines and separator, so it can be
 * corrected and sent again. Only `Credited` and `Abandoned` end a claim, and
 * both are statuses — which is why nothing here needs consulting to ask
 * whether a claim is finished.
 *
 * Keyed by `claimNumber`, not by claim: a claim may be sent, voided and sent
 * again without limit, so one claim can retire several numbers (A-46). The
 * number is unique and never reused (d26), so it is the natural key.
 */
export interface ClaimVoid {
  id: string;
  claimId: string;
  claimNumber: number; // the number this void retired
  reason: VoidReason;
  note?: string;
  at: string;
  by: string;
}

/**
 * E-04 d28 — what a claim line is arguing about.
 *
 * A union rather than an optional id, because "names Invoice X" and "is
 * deliberately about no Invoice" are different facts and a nullable field
 * cannot tell either of them from "somebody forgot". The `none` case is an
 * explicit choice a person makes, per line.
 *
 * NOT to be confused with an Invoice that has no supplier reference: E-02 d1
 * auto-generates `REF####` for those, so every Invoice in the system has a
 * number. `none` means *not about a particular shipment*.
 *
 * And it is EVIDENCE, never routing. A claim credit settles the supplier
 * balance (M-05 d6, d26); what it attaches to is decided by ticking at
 * settlement (M-05 d27, d33). A line naming 55021 may settle against 54880.
 */
export type ClaimLineAgainst =
  | { kind: "invoice"; invoiceId: string }
  | { kind: "none" };

export interface ClaimLine {
  id: string;
  recordId: string;
  itemId?: string;
  against: ClaimLineAgainst;
  reason: string; // one of CLAIM_REASONS, or free text (E-04 §"Supplier claims")
  note?: string;
  cost: number;
  qty: number;
}

export interface SupplierClaim {
  id: string;
  claimNumber?: number; // assigned on send — E-04 decision 10
  supplierId: string;
  separator?: string; // same batching key as pending orders (M-02)
  status: ClaimStatus;
  creditMemo?: string; // the supplier's own reference, captured on Credited
  lines: ClaimLine[];
  // E-04 d20 — the supplier's credit memo is the point of truth. What they
  // GRANT may differ from what was claimed: a few dollars deducted for the
  // cost of the return is routine. `creditedAmount` is the memo's figure and
  // is what M-05 d26 counts, d27 attaches and d28 consumes; the claim's own
  // total stays readable as what was asked for. Absent = they granted it all.
  creditedAmount?: number;
  // NOT stored: whether the credit has been consumed. Architecture A-37
  // derives it from the presence of a live credit target naming this claim,
  // for the reason A-33b refuses a stored `paid` — a flag has a release path
  // (d22's void) that someone has to remember, and a derivation has none.
  // E-04 d23 — stamped in the same act that assigns the number. Two jobs:
  // it is the figure "days waiting" is measured from, and it is what d25
  // derives sent-ness from. Absent = unsent.
  sentAt?: string;
  // E-04 d24 — set with status `Abandoned`. The status is the authority
  // (architecture A-44); this is the detail behind it.
  abandonment?: { reason: AbandonReason; note?: string; at: string; by: string };
  createdBy: string;
  createdAt: string;
  log: { at: string; text: string }[];
}

// ---- Receiving (E-02) ----
// A supplier Invoice — the inbound receiving document. Distinct from a
// customer's receipt (E-05) and from a customer invoice (E-07).
//
// Finalize is about STOCK, not the paperwork: it's the moment lines become
// sellable InventoryItems (decision 20). It is deliberately NOT the point an
// Invoice locks — costs move, a missed carton turns up, and the paperwork
// isn't really "official" until the store has paid it. Locking is what
// Paid does: only Accounts Payable settling the balance (M-05) makes an
// Invoice immutable. A Finalized-but-unpaid Invoice can be reopened to
// correct costs or add lines; corrections propagate to any InventoryItems
// already minted, and a newly added line mints its own immediately, the
// same as finalizing always has.
export type IntakeMode = "New" | "Second-hand";
// A-33b: **paid is DERIVED, never stored.** The stored states are the two a
// person sets. Ask `invoiceIsPaid()` (lib/totals) whether it is paid — that
// function is A-41's single seam, and every write path against a finalized
// Invoice calls it and refuses while it is true.
export type InvoiceStatus = "Draft" | "Finalized";

export interface InvoiceLine {
  id: string;
  recordId: string;
  scannedCode?: string; // what was scanned/matched to identify this line
  listPrice: number; // "Cost" in the UI — pre-discount, what's on the paperwork
  discountPct: number; // % off list the supplier gave us
  cost: number; // derived: listPrice x (1 - discountPct/100) — Ext. Price, decision 7
  acceptedPrice: number; // "Sell price" in the UI
  grade: Grade;
  qty: number; // one InventoryItem is minted per unit on finalize
  itemIds?: string[]; // populated on finalize — not sellable before then
  fromOrderId?: string; // the PendingOrderLine this was received against, if any
  poNumber?: string; // snapshot of that line's PO at receipt — the PendingOrderLine is consumed when received, so this is the only surviving link (E-02 d43)
}

// A supplier order line (M-02). `poNumber` unset means the line has been
// raised but not yet sent anywhere (Phase 1); Processing a stream (Phase 2)
// assigns a PO number and `placedAt` to every line in it at once. Also backs
// the Orders lookup in Receiving — a line stops being pending once received
// against (E-02). Reorder suggestions and the backorder lifecycle beyond the
// follow-up flag are not modelled. Status (Backordered/Cancelled) and voiding
// a PO — the rest of Phase 3 — aren't modelled either; only tracking and
// re-flagging are.
export interface PendingOrderLine {
  id: string;
  supplierId: string; // recorded on the line, not the Record — M-02 decision 2
  separator?: string; // single optional letter splitting one supplier's pending lines into independent streams — decision 3
  poNumber?: string;
  placedAt?: string; // set alongside poNumber when the stream is Processed
  recordId: string;
  scannedCode?: string;
  qty: number;
  sellPrice: number; // selling price for this line, defaults to shelf price when raised — step 2
  expectedListPrice?: number; // cost estimate consumed by Receiving's line pre-fill only
  expectedDiscountPct?: number;
  customerId?: string; // customer-attached line
  followUpDays?: number; // days after which to chase it if still unfulfilled — decision 8
  followUpSetAt?: string; // when the follow-up window last started — createdAt if unset; updated by Re-flag (Phase 3, What's on Order)
  createdBy?: string;
  createdAt: string;
  /**
   * Only the statuses a PERSON sets (M-02 d12, d22). Pending vs Ordered is
   * derived from whether `poNumber` is set, and received vs outstanding is
   * counted off the Invoice lines that point back here (E-02 d30) — storing
   * either would be a second copy of a fact the data already answers, and two
   * copies drift. Undefined means nobody has said anything about this line.
   */
  status?: OrderLineStatus;
  /** The supplier's own expected date, set with `shipped` (d22). Nothing
   *  verifies it — a date that passes is a prompt to chase, not a state. */
  expectedDate?: string;
  /** Every status change, and receipt (d23). Same shape the Invoice and the
   *  Supplier already carry, so a line's history reads as one sequence. */
  log?: { at: string; text: string }[];
  /**
   * Stamped on the lines a void LEAVES on their PO — the ones already
   * received, which keep their link to the Invoice that took them in (d24).
   * The prototype has no PurchaseOrder entity to hold the fact, so the surviving
   * lines carry it and the PO row derives "voided" from them; without it a
   * voided PO reads as live in Previously placed.
   */
  poVoidedAt?: string;
  /**
   * Stamped on lines created by the record-an-order-placed-elsewhere route
   * (M-02 d25) — when the order was ENTERED, as against `placedAt`, which is
   * when it actually went out (d26). The two differ by however long it took
   * somebody to get round to typing it in.
   *
   * Same justification as `poVoidedAt` above: the prototype has no
   * PurchaseOrder entity to hold the fact, so the lines carry it. Without it a
   * recorded order is indistinguishable from one this system sent, and the
   * screen cannot say whose reference the PO number is.
   */
  recordedAt?: string;
}

/** A placed line is never deleted — it is Cancelled, or it is received (d21). */
export type OrderLineStatus = "Shipped" | "Backordered" | "Cancelled";
export const ORDER_LINE_STATUSES: OrderLineStatus[] = ["Shipped", "Backordered", "Cancelled"];

// ---- Payment terms (M-01 d19, E-02 d45) ----
// When a bill falls due. NOT Supplier.cancelByDays, which is an ORDERING
// figure — days from order-placed to auto-cancel. Before these, nothing in
// the system recorded when money was owed, which is why M-05's aging question
// could not be answered: the field was missing, not the report.
export type PaymentTerms =
  | "Net 15"
  | "Net 30"
  | "Net 45"
  | "Net 60"
  | "Net 90"
  | "End of Month"
  | "On receipt"
  | "COD"
  | "Prepaid";
export const PAYMENT_TERMS: PaymentTerms[] = [
  "Net 15", "Net 30", "Net 45", "Net 60", "Net 90", "End of Month", "On receipt", "COD", "Prepaid",
];

/**
 * How a term turns into a due date (E-02 d45 — always from the INVOICE date).
 * Three shapes, not one, because "End of Month" is not a number of days:
 *   days  — invoice date + n.
 *   eom   — the last day of the month the invoice is dated in (M-01 d20), so
 *           3 Sep and 28 Sep are both due 30 Sep. A late-month invoice on
 *           these terms is due almost at once; that is the term, not a bug.
 *   none  — COD and Prepaid produce no due date and so age nowhere.
 */
export type TermRule = { kind: "days"; days: number } | { kind: "eom" } | { kind: "none" };
export const TERM_RULE: Record<PaymentTerms, TermRule> = {
  "Net 15": { kind: "days", days: 15 },
  "Net 30": { kind: "days", days: 30 },
  "Net 45": { kind: "days", days: 45 },
  "Net 60": { kind: "days", days: 60 },
  "Net 90": { kind: "days", days: 90 },
  "End of Month": { kind: "eom" },
  "On receipt": { kind: "days", days: 0 },
  COD: { kind: "none" },
  Prepaid: { kind: "none" },
};

// ---- Accounts payable (M-05) ----
// M-01 d20. EFT and e-Transfer are deliberately separate: different rails that
// appear differently on a bank statement, and M-05 d5 makes that statement the
// reconciliation surface. "Other" reconciles against nothing and exists only so
// an unusual method has somewhere to go.
export type PaymentMethod = "Cheque" | "Credit Card" | "EFT" | "e-Transfer" | "Cash" | "Other";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cheque", "Credit Card", "EFT", "e-Transfer", "Cash", "Other"];

// One thing a settlement went against — a real Invoice (E-02) or a
// manually-entered PayableEntry. "kind" plus "id" together address it, since
// the two live in different arrays.
//
// `settleKind` is M-05 d19: one batch carries both money and claim credit,
// and a target records which it was. A credit target also names the credit
// that funded it, because d22's void has to put it back exactly and a pool
// with no provenance cannot be reversed.
export type PayableTargetKind = "invoice" | "entry";
export type SettleKind = "money" | "credit";
export interface PaymentTarget {
  kind: PayableTargetKind;
  id: string;
  amount: number;
  settleKind: SettleKind;
  creditId?: string; // set iff settleKind === "credit" — the claim or entry it came from
}

// M-05 d22 / architecture A-33a: a void is a NEW ARTIFACT appended against
// the batch, never a column on it and never a deletion. Modelled as its own
// array so "never edited" is structural rather than a convention someone
// remembers. One per batch — a second is impossible by construction.
export interface PaymentBatchVoid {
  id: string;
  batchId: string;
  voidedAt: string;
  voidedBy: string;
}

// One Record-Payment action — paying several Invoices/Entries with one
// cheque is one PaymentBatch with several targets, not several payment
// records that merely share a reference (M-05 open question "Payment
// batches", resolved this way). Browsed as one row per batch, oldest/newest
// first, opened to see its targets — not nested per-Invoice.
export interface PaymentBatch {
  id: string;
  supplierId: string;
  method: PaymentMethod;
  reference: string; // free text — "Cheque 101", "Credit card 1278" — what reconciles against the bank statement
  date: string;
  recordedBy: string;
  createdAt: string;
  targets: PaymentTarget[];
}

export interface Invoice {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  intakeMode: IntakeMode;
  invoiceDate: string;
  receivedDate: string;
  // E-02 d45 — defaulted from the Supplier, overridable here, because the
  // paperwork in hand is the agreement. Net-N runs from the INVOICE date.
  paymentTerms?: PaymentTerms;
  // E-02 d47 — same shape, and an EXPECTATION rather than a record: what
  // actually happened is on the PaymentBatch (M-05 d34). Reading one for the
  // other is the mistake this comment exists to prevent.
  paymentMethod?: PaymentMethod;
  statedSubtotal: number; // from the invoice photo/manual entry — decision 15
  tax: number;
  freight: number;
  misc: number;
  totalOverride?: number; // reconciling to the paper total — beyond ±2% raises a ReviewFlag
  status: InvoiceStatus;
  lines: InvoiceLine[];
  createdBy: string;
  createdAt: string;
  finalizedAt?: string;
  paidAt?: string;
  paidBy?: string;
  log: { at: string; text: string }[];
}

// A manually-entered Accounts Payable line — not sourced from Receiving
// (E-02) or Supplier Claims (E-04), and not tied to any InventoryItem: a
// lump total/tax/freight/misc only, "the remaining balance just being
// inventory unlinked to items for now." Covers things those two flows don't:
// a supplier bill entered without itemizing it through Receiving, a
// bookkeeping correction, a standalone credit memo, or a claim logged before
// it's worth raising through the full titlecard-based Supplier Claims flow.
//
// Sign convention (entered as a plain positive dollar figure — the type
// decides the direction, so nobody types a negative number): Invoice and
// Consignment always increase what's owed; Credit always decreases it;
// Adjustment goes whichever way `adjustmentDirection` says; Claim is a
// placeholder that does NOT count toward the balance at all until it's
// cleared against a matching Credit (see `clearedWith`) — same as a Pending
// Supplier Claim not yet counting until it's actually Credited.
export type PayableEntryType = "Invoice" | "Claim" | "Credit" | "Adjustment" | "Consignment";
export const PAYABLE_ENTRY_TYPES: PayableEntryType[] = ["Invoice", "Claim", "Credit", "Adjustment", "Consignment"];

// Where an entry came from. `manual` is decision 12's Create-new. The other
// two are NOT manual ledger entries — d12's defining characteristic is that a
// manual entry is not sourced from Receiving or Supplier Claims, and these are
// sourced from a settlement and a void respectively:
//   remainder — d25: the part of a credit that could not attach to anything.
//   reversal  — d30: what a void appends against a remainder, instead of
//               deleting it. Equal and opposite, so the pair nets to zero.
export type PayableEntrySource = "manual" | "remainder" | "reversal";

export interface PayableEntry {
  id: string;
  supplierId: string;
  type: PayableEntryType;
  source?: PayableEntrySource;   // absent = "manual"
  fromCreditId?: string;         // remainder: the credit it is left over from
  fromVoidId?: string;           // reversal: the void that posted it
  reversalOfId?: string;         // reversal: the remainder it cancels
  reference: string; // free text — a bill #, a memo #, a note on what the adjustment is for
  date: string;
  subtotal: number;
  tax: number;
  freight: number;
  misc: number;
  adjustmentDirection?: "increase" | "decrease"; // Adjustment only — which way it moves the balance
  // Manual reconciliation (not automatic): when a set of entries' signed
  // amounts sum to zero — a placeholder Claim matched against the Credit
  // that eventually replaced it, say — a Manager can mark them Cleared
  // against each other. Cleared entries stay in the ledger (never deleted)
  // but drop out of what still needs attention.
  clearedWith?: string[]; // ids of the other PayableEntry rows cleared alongside this one
  clearedAt?: string;
  clearedBy?: string;
  createdBy: string;
  createdAt: string;
  log: { at: string; text: string }[];
}

// ---- Review queue (M-04 d8) ----
// The manager override is retired: below-cost pricing, a >±2% invoice
// adjustment, and an accepted discrepancy no longer block on a manager's
// initials — they proceed immediately and leave a flag a manager reviews
// afterward. Flags are acknowledged, never deleted.
export type ReviewFlagKind =
  | "below-cost"
  | "total-adjustment"
  | "discrepancy-accepted"
  | "negative-stock"
  | "sale-lock-broken";

export interface ReviewFlag {
  id: string;
  kind: ReviewFlagKind;
  summary: string;
  recordedBy: string;
  at: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

// ---------------------------------------------------------------------------
// Users (M-04) and the staff session (E-01)
// ---------------------------------------------------------------------------

// Two roles, Manager a strict superset of Employee (M-04 d1). There is no tier
// above Manager: M-04 d11 puts the Store's assigned identifiers outside the
// role model, and d14 protects the last Manager with a floor rule rather than
// with a role that outranks them.
export type UserRole = "Employee" | "Manager";

export interface User {
  id: string;
  name: string;
  // Stored NORMALISED - trimmed and upper-cased on write (M-04 d20), so the
  // uniqueness check is a plain comparison and no shift key can mint a
  // near-duplicate at the counter.
  initials: string;
  role: UserRole;
  // Deactivated, never deleted (M-04 d5): every Sale, adjustment and
  // authorisation stays attributed to whoever performed it, so the row has to
  // outlive their leaving. Uniqueness of initials is among ACTIVE users only
  // (d13 as amended by d16) - a departed user's initials are released.
  active: boolean;
  // E-01 d21. OPTIONAL, for anyone, up to 8 characters. It is a barrier and
  // not authentication — a shop may well use a single letter — so nothing in
  // the model treats it as proof of identity. Absent means no second step.
  //
  // Plain text here because this is an in-memory mock with no server; the
  // real thing hashes it and never logs the value (see the decision).
  password?: string;
  // Before-and-after, per A-55: without it, who promoted whom exists nowhere
  // after the second change, and this is the privilege boundary.
  log: { at: string; text: string }[];
}

// ---------------------------------------------------------------------------
// M-06 settings — the configuration other flows resolve against
//
// Two of these open up types that used to be closed unions. The union values
// were never wrong; they were the *behaviour*, and M-06 separates behaviour
// from the row a shop configures:
//
//   - d22/d23: many tenders may share one behaviour — `Visa` and `Mastercard`
//     both settle as a card — so the behaviour stays an enum and the tender
//     becomes a row.
//   - d28: a Section is an editable table with real attributes, so the code
//     stays a string and the attributes move to a row.
//
// Nothing on the money path changes shape as a result, which is the point.
// ---------------------------------------------------------------------------

export interface SectionRow {
  code: string; // two characters (d28)
  name: string;
  // d20 — whether a Section enters revenue reporting is a property of the
  // Section. Freight is not revenue; a gift card load is a liability.
  countsAsRevenue: boolean;
  // d29 — the Section supplies the DEFAULT; whether a thing tracks stock
  // stays a property of the catalog entry.
  tracksStockDefault: boolean;
  // d30 — both default true, both false on the gift card Section. Not gates:
  // a property of what is being sold, not of who is selling it.
  discountable: boolean;
  returnable: boolean;
  // d40 — a Section may override the store's dead-stock threshold.
  deadStockDays?: number;
  // d9 — referenced settings are deactivated, never deleted.
  active: boolean;
  // Pre-loaded and not removable: d20 gives freight and gift cards one each.
  systemOwned?: boolean;
}

export interface TenderRow {
  id: string;
  name: string; // d4 — the display name is configurable
  behavior: TenderType; // d4 — the behaviour is not
  active: boolean;
  glCode?: string; // d23 — reserved for a future general ledger
  // `rounding` is written by the system, never offered (d26).
  systemOwned?: boolean;
}

export interface CurrencyRow {
  code: string; // ISO — CAD, USD
  name: string;
  // d38 — ONE rate per currency, and it is a PLANNING rate the shop sets
  // conservatively. There is no separate buffer (it supersedes d36's).
  rate: number;
  // d33 — each rate carries the date it was last set, because the staleness
  // risk is answered by showing the date rather than by hiding it.
  rateSetOn: string;
  active: boolean;
}

export type DrawerPolicy = "every" | "cash" | "never"; // d25
export type ReceiptWidth = "80mm" | "58mm" | "letter"; // d50

// The scalars. Every one of these is a figure another flow reads, which is
// why they are a store setting rather than a constant (A-5 scopes to a Store).
export interface StoreSettings {
  sessionLapseSeconds: number; // d45, A-50 — default 300, no maximum (E-01 d13)
  priceEndingMinor: number; // d44, A-49 — 99, 95 or 0, an integer of minor units
  deadStockDays: number; // d40 — default 180, a Section may override
  streamAgingDays: number; // d41 — default 14
  drawerPolicy: DrawerPolicy; // d25 — does nothing in v1; the hardware is not there
  receiptWidth: ReceiptWidth; // d50
}

export interface StoreDetails {
  legalName: string; // the entity, on outbound customer invoices
  tradingName: string; // the name on the door, on receipts
  address: PostalAddress;
  phone: string;
  email: string;
  website: string;
  receiptFooter: string;
  receiptFooterOn: boolean; // d46 — free text with its own on/off flag
  logoPath?: string; // d51, A-56 — an uploaded image, never a URL
  // d47 — assigned, never editable, and writable by nobody who works in the
  // shop. M-04 d11 settled who assigns them: we do, at setup.
  readonly storeId: string; // seven digits
  readonly position: number;
}

// A-52 — every settings write is logged with its actor and the values BEFORE
// and AFTER, because the question asked afterwards is always "what did this
// used to be", and d8's never-retroactive rule makes the old value the only
// record of what yesterday's Sales were computed against.
export interface SettingsLogEntry {
  at: string;
  actor: string;
  group: string;
  key: string;
  before: string;
  after: string;
}

// ---------------------------------------------------------------------------
// M-06 tax — two tables, not one (d11)
//
// A TAX TYPE is one tax that EXISTS, shared by every group that charges it, so
// a legislated rate change is edited once. A TAX GROUP is a jurisdiction or
// customer class, carrying one cell per product tax code. The cell names the
// taxes. d1's single table could not express a rate shared across
// jurisdictions without repeating it, and repeated rates drift.
// ---------------------------------------------------------------------------

// The shape lib/tax.ts produces. Declared here rather than imported so the
// data model does not depend on the library that computes it.
export interface TaxComponent {
  code: string;
  name: string;
  ratePpm: number;
  amount: number;
}

export interface TaxType {
  code: string; // a single letter — a, b, c — used to compose the cells
  name: string; // GST, QST, PST, HST
  ratePpm: number; // A-47 — parts per million, because QST is 9.975%
  // A-58 / d52 — ONE pending change: the new rate and the date it starts.
  // Never read ratePpm directly; resolve through taxRateAt().
  pendingRatePpm?: number;
  pendingFrom?: string;
  // d48 — the registration number belongs on the TYPE, not in store details:
  // GST and QST are separate registrations and a receipt carries each beside
  // its own tax.
  registrationNumber?: string;
  // Reserved and not drawn — there is no chart of accounts yet. The field
  // exists so one needs no migration, the move A-14 makes for cover_art_path.
  glAccount?: string;
  // NO `active` FLAG, and its absence is the decision (M-06 d57,
  // architecture A-63). A tax type is the one piece of configuration here
  // with no assignments — nothing is filed under `b`, and a completed Sale
  // line snapshots the rate rather than referencing the row (A-57) — so a
  // cell naming it is the only reference, and liveness is DERIVED from the
  // cells rather than stored beside them. `ab+` -> `a` is how `b` stops
  // being charged. A stored flag let a housekeeping toggle silently charge
  // less tax, which is the defect A-63 closes by making it unrepresentable.
}

export interface ProductTaxCode {
  code: string; // 1, 2, B, 3
  // d12 — a description beside it, because a bare letter sitting on a genre is
  // tribal knowledge and the next person to read it has nothing to go on.
  description: string;
  active: boolean;
}

export interface TaxGroup {
  id: string;
  description: string; // Quebec, Ontario, Wholesale
  shortName: string; // up to four characters — this is what appears on a Customer
  active: boolean;
}

// d13 — stored as ROWS, drawn as a grid. Storage shape and screen shape are
// decoupled deliberately: the grid is how a person reads it, and rows are how
// it stays addable-to without a migration per product tax code.
export interface TaxGroupCell {
  groupId: string;
  productTaxCode: string;
  spec: string; // "", "a", "ab", "ab+"
}

// A-61 — what the catalog provider says about a release. MusicBrainz genre
// tags are user-submitted and carry a VOTE COUNT, which is the provider's own
// answer to "this release has three tags, which one is meant".
export interface ProviderTag {
  tag: string;
  votes: number;
}

// A-61 — the tags a Record was ADOPTED under, with the one the map matched
// marked. A snapshot, never re-resolved: `release_cache` is shared and
// refreshable (A-6), so it holds what the provider says NOW, where the
// question a mis-shelved Record raises is what it said THEN. Same shape as
// A-57's rates on a Sale line, for the same reason.
export interface AdoptedTag extends ProviderTag {
  matched?: boolean;
}

// architecture A-6 — what the catalog provider knows about a pressing,
// held in a cache that sits UNDERNEATH the per-Store catalog. This is NOT a
// Record: there is no Record until adoption (d53), which is why a release
// carries tags and no genre. A Store owns its Records; the cache is shared
// across Stores, so nothing store-specific may ever be written into it.
export interface ReleaseCacheEntry {
  id: string;
  artist: string;
  title: string;
  label: string;
  catalogNo: string;
  format: string;
  year: number;
  country: string;
  art: string;
  manufacturerUpc?: string;
  musicbrainzId?: string;
  // Undefined where the provider carries no genre tags at all — d53's
  // second state, which prompts exactly like an unmapped tag and differs
  // only in having nothing to key a map row on.
  tags?: ProviderTag[];
}

// M-06 d6, d32 — the genre map: provider tag to genre and NOTHING ELSE. The
// Section follows from the genre's required parent and is never guessed.
export interface GenreMapRow {
  tag: string;
  genreId: string;
  // A-61 — manager-only (A-59), defaulting to zero so a shop that sets
  // nothing gets the provider's vote order. It exists because votes measure
  // consensus rather than specificity.
  priority: number;
}

// d12, d32 — a Genre carries a MANDATORY parent Section and the product tax
// code. d17 makes genre mandatory on every sellable thing, including
// non-tracked ones, which is what closes the "what tax does freight pay"
// question without a special case.
export interface Genre {
  // A STABLE KEY, not the name. A Record points at this; the name is a label a
  // Manager may correct. Joining by name meant renaming `Metal` orphaned every
  // Record under it at once — Section fell to the em dash and, worse, the tax
  // code fell back to the standard one silently (d12 puts the product tax code
  // on the genre). It also made architecture A-60's merge unrepresentable:
  // merge is specified as REPOINTING every dependent pointer, and a name join
  // has no pointer to repoint. Architecture §5 models genres as rows with
  // id-shaped references, so this is the prototype catching up.
  id: string;
  name: string;
  section: string; // Section code — mandatory (d32)
  productTaxCode: string; // mandatory (d12, d17)
  // d9 — a referenced Genre is deactivated, never deleted. Off stops it being
  // OFFERED; it does not stop it RESOLVING, or a Record under a retired genre
  // would silently change what tax it attracts.
  active: boolean;
  // d17 — shop-internal genres are omitted from the picker rather than gated,
  // so setting a Record's genre to Freight is unrepresentable (d19).
  internal?: boolean;
  // d18 — the gift card load resolves through THIS genre, from the money
  // path rather than from a catalog entry, so nothing in the catalog holds a
  // reference A-54 could see. System-owned on d9's terms: not deletable, and
  // its product tax code is not editable, because changing either silently
  // starts taxing money the shop has merely received.
  systemOwned?: boolean;
}
