// Domain types — a deliberately thin slice of PRD §4, enough to make the
// counter-core flows (E-03..E-07) clickable. Not the real schema.

export type Grade = "M" | "NM" | "VG+" | "VG" | "G+" | "G" | "F" | "P";
export const GRADES: Grade[] = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];

export type Section = "VINYL" | "MERCH";

export interface RecordEntry {
  id: string;
  artist: string;
  title: string;
  label: string;
  catalogNo: string;
  format: string;
  year: number;
  country: string;
  genre: string;
  section: Section;
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
  arrivedOnInvoice?: string;
  supplierId?: string; // set when arrivedOnInvoice traces to a Supplier — claimable
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
  log: { at: string; text: string }[];
}

export interface NonTrackedItem {
  code: string; // e.g. FREIGHT
  label: string;
  price: number; // 0 => prompt at till
  section: Section;
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

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  provinceState?: string; // 2-letter
  country?: string;
}

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
  defaultTaxLineId?: string;
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
  taxLineId: string;
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

export type ClaimStatus = "Draft" | "Pending" | "Credited";

export interface ClaimLine {
  id: string;
  recordId: string;
  itemId?: string;
  invoiceNumber?: string;
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
export type InvoiceStatus = "Draft" | "Finalized" | "Paid";

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
}

// A supplier order line (M-02). `poNumber` unset means the line has been
// raised but not yet sent anywhere (Phase 1); Processing a stream (Phase 2)
// assigns a PO number and `placedAt` to every line in it at once. Also backs
// the Orders lookup in Receiving — a line stops being pending once received
// against (E-02). Reorder suggestions and the backorder lifecycle (Phase 3)
// are not modelled.
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
  followUpDays?: number; // days after which to chase it if still unfulfilled — decision 8; not yet consumed (Phase 3)
  createdBy?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  intakeMode: IntakeMode;
  invoiceDate: string;
  receivedDate: string;
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
