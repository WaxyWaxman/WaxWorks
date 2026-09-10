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
}

// Suppliers are modeled only as far as Supplier Claims and Receiving need
// them — margin is a fixed seeded value here since M-01 (setting/changing
// it) is still not in this pass.
export interface Supplier {
  id: string;
  shortName: string;
  name: string;
  email: string;
  marginPct: number; // E-02 decision 8 — read-only in this pass, M-01 sets it
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

export interface Customer {
  id: string;
  accountNumber: string;
  accountType: "Regular" | "Staff" | "Business";
  name: string;
  phone: string;
  email: string;
  contactPreference: "Phone" | "Email";
  globalDiscountPct: number;
  defaultTaxLineId?: string;
  note?: string;
  balance: number; // + store owes customer (store credit); - customer owes store
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
  log: { at: string; text: string }[];
}

// ---- Supplier Claims (E-04 §"Supplier claims") ----
// Distinct from a customer Return (E-06) — this is claiming credit from a
// supplier for stock that arrived short, damaged, or not at all.
export const CLAIM_REASONS = [
  "Billed / not shipped",
  "Received damaged",
  "Short shipped",
  "Wrong item",
  "Other",
] as const;
export type ClaimReason = (typeof CLAIM_REASONS)[number];

export type ClaimStatus = "Draft" | "Pending" | "Credited";

export interface ClaimLine {
  id: string;
  recordId: string;
  itemId?: string;
  invoiceNumber?: string;
  reason: ClaimReason;
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

// A supplier order not yet received — thin scaffold for the Orders lookup in
// Receiving. Not M-02 (no PO creation, no reorder suggestions, no backorder
// lifecycle) — just enough to look one up and receive against it.
export interface PendingOrderLine {
  id: string;
  supplierId: string;
  poNumber?: string;
  recordId: string;
  scannedCode?: string;
  qty: number;
  expectedListPrice?: number;
  expectedDiscountPct?: number;
  customerId?: string;
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
