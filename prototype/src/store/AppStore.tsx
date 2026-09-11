import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { computeDayBreakdown, type DayBreakdown } from "../lib/dayBreakdown";
import { money } from "../lib/money";
import { claimTotal, invoiceBalance, payableEntrySignedAmount, round2, tenderedTotal } from "../lib/totals";
import {
  CURRENT_USER,
  CUSTOMERS,
  DEFAULT_TAX_LINE,
  GIFT_CARDS,
  INVENTORY,
  MANAGER_NAME,
  NON_TRACKED,
  PENDING_ORDERS,
  RECORDS,
  SUPPLIERS,
  TAX_LINES,
} from "../data/seed";
import type {
  CloseBatch,
  Customer,
  GiftCard,
  Grade,
  IntakeMode,
  InventoryItem,
  Invoice,
  InvoiceLine,
  NonTrackedItem,
  PayableEntry,
  PayableEntryType,
  PayableTargetKind,
  PaymentBatch,
  PaymentMethod,
  PaymentTarget,
  PendingOrderLine,
  RecordEntry,
  ReviewFlag,
  ReviewFlagKind,
  Sale,
  SaleLine,
  Section,
  Supplier,
  SupplierClaim,
  TaxLine,
  Tender,
} from "../data/types";

let seq = 100;
const uid = (p: string) => `${p}-${++seq}`;

// The money a Tender actually moves — a gift card's balance, a Customer's
// A/R — as opposed to the number printed on the Sale. `sign` is +1 to apply
// it and -1 to put it back, so one description of each tender type serves
// both tendering and reversing; nothing else in the store knows what a type
// does to a balance. E-05 d32: Void requires the tenders to net zero, which
// is only honest if reversing one really does return the money.
function applyTenderEffect(
  giftCards: GiftCard[],
  customers: Customer[],
  tender: Tender,
  customerId: string | undefined,
  sign: 1 | -1,
): { giftCards: GiftCard[]; customers: Customer[] } {
  let gc = giftCards;
  let cs = customers;
  if (tender.type === "Gift Card" && tender.reference) {
    gc = gc.map((g) =>
      g.code === tender.reference ? { ...g, balance: Math.max(0, round2(g.balance - sign * tender.amount)) } : g,
    );
  }
  if ((tender.type === "Account Balance" || tender.type === "Used Credit") && customerId) {
    const delta =
      tender.type === "Used Credit"
        ? Math.abs(tender.amount)
        : tender.accountDirection === "add"
          ? Math.abs(tender.amount)
          : -tender.amount;
    cs = cs.map((c) => (c.id === customerId ? { ...c, balance: round2(c.balance + sign * delta) } : c));
  }
  return { giftCards: gc, customers: cs };
}

// en-CA formats as "YYYY-MM-DD, HH:MM:SS" (with a comma) — every parse site
// (daysAgo, the follow-up-flag math, PointOfSale's age calc) assumes the
// plain space-separated form seed data uses, so strip the comma here rather
// than patch every `.replace(" ", "T")` call site.
const now = () => new Date().toLocaleString("en-CA", { hour12: false }).replace(",", "");

interface AppState {
  records: RecordEntry[];
  inventory: InventoryItem[];
  customers: Customer[];
  suppliers: Supplier[];
  giftCards: GiftCard[];
  taxLines: TaxLine[];
  nonTracked: NonTrackedItem[];
  sales: Sale[];
  closeBatches: CloseBatch[]; // M-03 — Total Today's Sales / Undo End of Day
  claims: SupplierClaim[];
  invoices: Invoice[];
  payableEntries: PayableEntry[]; // M-05 — manual ledger entries: Invoice/Claim/Credit/Adjustment/Consignment, not sourced from Receiving or Supplier Claims
  paymentBatches: PaymentBatch[]; // M-05 — one row per Record-Payment action, across both Invoices and PayableEntries
  pendingOrders: PendingOrderLine[];
  reviewFlags: ReviewFlag[];
  activeSaleId: string | null;
  lastViewedSupplierId: string | null; // M-01 — Suppliers opens on this card
  lastViewedCustomerId: string | null; // E-07 — Customers opens on this card
  nextSaleNumber: number;
  nextHold: number;
  nextClaimNumber: number;
  nextPoNumber: number; // M-02 decision 16 — ascending from 0
  nextInternalBarcode: number;
  nextInvoiceRef: number;
  nextCustomerPrimaryId: number;
  /** E-03 decision 8 — toggle to demo graceful degradation when the catalog provider (MusicBrainz) is down */
  discogsUp: boolean;
}

const seed: AppState = {
  records: RECORDS,
  inventory: INVENTORY,
  customers: CUSTOMERS,
  suppliers: SUPPLIERS,
  giftCards: GIFT_CARDS,
  taxLines: TAX_LINES,
  nonTracked: NON_TRACKED,
  sales: [
    // a prior tendered Sale, so E-06 return-linking has something to match
    {
      id: "sale-hist-1",
      state: "Closed",
      saleNumber: 100238,
      customerId: "c-ramona",
      createdBy: CURRENT_USER,
      createdAt: "2026-09-05 11:04:00",
      tenders: [{ id: "t-hist-1", type: "Credit Card", amount: 25.11 }],
      log: [{ at: "2026-09-05 11:04:00", text: "Tendered — Sale number 100238 assigned" }],
      lines: [
        {
          id: "l-hist-1",
          kind: "item",
          recordId: "r-kind",
          inventoryItemId: "i-kob-1",
          title: "Miles Davis — Kind of Blue",
          grade: "VG+",
          qty: 1,
          price: 24.0,
          discountPct: 10,
          taxLineId: DEFAULT_TAX_LINE,
        },
      ],
    },
    // Two older Sales of titles we no longer hold a copy of. Without these,
    // the "had before" stock state in Search has nothing to describe — every
    // seeded Record is either on the floor, on order, or catalog-only. The
    // dates are deliberately far apart so the recency stamp shows both a
    // recent sell-out and a long-cold one.
    {
      id: "sale-hist-2",
      state: "Closed",
      saleNumber: 100241,
      createdBy: CURRENT_USER,
      createdAt: "2026-08-21 16:40:00",
      tenders: [{ id: "t-hist-2", type: "Cash", amount: 69.28 }],
      log: [{ at: "2026-08-21 16:40:00", text: "Tendered — Sale number 100241 assigned" }],
      lines: [
        {
          id: "l-hist-2",
          kind: "item",
          recordId: "r-madvillainy",
          title: "Madvillain — Madvillainy",
          grade: "M",
          qty: 2,
          price: 32.99,
          discountPct: 0,
          taxLineId: DEFAULT_TAX_LINE,
        },
      ],
    },
    {
      id: "sale-hist-3",
      state: "Closed",
      saleNumber: 100177,
      createdBy: CURRENT_USER,
      createdAt: "2026-03-14 12:12:00",
      tenders: [{ id: "t-hist-3", type: "Credit Card", amount: 28.87 }],
      log: [{ at: "2026-03-14 12:12:00", text: "Tendered — Sale number 100177 assigned" }],
      lines: [
        {
          id: "l-hist-3",
          kind: "item",
          recordId: "r-astral",
          title: "Van Morrison — Astral Weeks",
          grade: "VG+",
          qty: 1,
          price: 27.5,
          discountPct: 0,
          taxLineId: DEFAULT_TAX_LINE,
        },
      ],
    },
    // one pre-existing Held sale so E-05's "select an existing Held sale" is real
    {
      id: "sale-held-1",
      state: "Held",
      holdRef: "H1",
      customerId: "c-ramona",
      createdBy: CURRENT_USER,
      createdAt: "2026-09-08 15:22:04",
      log: [
        { at: "2026-09-08 15:22:04", text: "Hold created — 1 copy reserved from titlecard" },
        { at: "2026-09-08 16:00:00", text: "Customer contacted by email" },
      ],
      tenders: [],
      lines: [
        {
          id: "l-held-1",
          kind: "item",
          recordId: "r-rumours",
          inventoryItemId: "i-rum-3",
          title: "Fleetwood Mac — Rumours",
          grade: "M",
          qty: 1,
          price: 34.99,
          discountPct: 10,
          taxLineId: DEFAULT_TAX_LINE,
        },
      ],
    },
  ],
  closeBatches: [],
  // Seeded Finalized so Accounts Payable (M-05) has real outstanding balances
  // without first walking a Receiving session — lines mirror the InventoryItems
  // INVENTORY already seeds as "arrived on" these same invoice numbers.
  claims: [
    {
      id: "claim-seed-1",
      claimNumber: 9,
      supplierId: "sup-fab",
      status: "Credited",
      creditMemo: "CM-2201",
      lines: [
        {
          id: "cl-seed-1",
          recordId: "r-blue",
          itemId: "i-blue-1",
          invoiceNumber: "55021",
          reason: "Received damaged",
          note: "Corner ding on jacket, sleeve only",
          cost: 12.4,
          qty: 1,
        },
      ],
      createdBy: MANAGER_NAME,
      createdAt: "2026-09-01 09:00:00",
      log: [
        { at: "2026-09-01 09:00:00", text: "Claim opened — Received damaged (qty 1)" },
        { at: "2026-09-02 09:15:00", text: "Claim 9 sent to claims@fabdist.example" },
        { at: "2026-09-03 11:30:00", text: "Marked Credited — supplier credit memo CM-2201" },
      ],
    },
  ],
  invoices: [
    {
      id: "inv-seed-fab",
      supplierId: "sup-fab",
      invoiceNumber: "55021",
      intakeMode: "New",
      invoiceDate: "2026-08-27",
      receivedDate: "2026-08-28",
      statedSubtotal: 68.65,
      tax: 0,
      freight: 0,
      misc: 0,
      status: "Finalized",
      lines: [
        {
          id: "invline-seed-1",
          recordId: "r-blue",
          listPrice: 15.5,
          discountPct: 20,
          cost: 12.4,
          acceptedPrice: 28.99,
          grade: "NM",
          qty: 1,
          itemIds: ["i-blue-1"],
        },
        {
          id: "invline-seed-2",
          recordId: "r-rumours",
          listPrice: 25.0,
          discountPct: 25,
          cost: 18.75,
          acceptedPrice: 34.99,
          grade: "M",
          qty: 3,
          itemIds: ["i-rum-1", "i-rum-2", "i-rum-3"],
        },
      ],
      creditsApplied: [],
      createdBy: CURRENT_USER,
      createdAt: "2026-08-28 09:00:00",
      finalizedAt: "2026-08-28 10:00:00",
      log: [
        { at: "2026-08-28 09:00:00", text: "Invoice opened — New intake, invoice 55021" },
        { at: "2026-08-28 10:00:00", text: "Finalized — 4 copies now sellable" },
      ],
    },
    {
      id: "inv-seed-indie",
      supplierId: "sup-indie",
      invoiceNumber: "3390",
      intakeMode: "New",
      invoiceDate: "2026-08-30",
      receivedDate: "2026-08-31",
      statedSubtotal: 17.25,
      tax: 0,
      freight: 0,
      misc: 0,
      status: "Finalized",
      lines: [
        {
          id: "invline-seed-3",
          recordId: "r-purple",
          listPrice: 34.5,
          discountPct: 50,
          cost: 17.25,
          acceptedPrice: 32.99,
          grade: "M",
          qty: 1,
          itemIds: ["i-pr-1"],
        },
      ],
      creditsApplied: [],
      createdBy: CURRENT_USER,
      createdAt: "2026-08-31 09:00:00",
      finalizedAt: "2026-08-31 09:30:00",
      log: [
        { at: "2026-08-31 09:00:00", text: "Invoice opened — New intake, invoice 3390" },
        { at: "2026-08-31 09:30:00", text: "Finalized — 1 copy now sellable" },
      ],
    },
    // Already settled — gives Accounts Payable's payment history something to show.
    {
      id: "inv-seed-crate-paid",
      supplierId: "sup-crate",
      invoiceNumber: "CD-777",
      intakeMode: "Second-hand",
      invoiceDate: "2026-08-18",
      receivedDate: "2026-08-19",
      statedSubtotal: 20.0,
      tax: 0,
      freight: 0,
      misc: 0,
      status: "Paid",
      lines: [
        {
          id: "invline-seed-4",
          recordId: "r-illmatic",
          listPrice: 25.0,
          discountPct: 20,
          cost: 20.0,
          acceptedPrice: 45.0,
          grade: "VG",
          qty: 1,
          itemIds: [],
        },
      ],
      creditsApplied: [],
      createdBy: CURRENT_USER,
      createdAt: "2026-08-19 09:00:00",
      finalizedAt: "2026-08-19 09:30:00",
      paidAt: "2026-08-20 14:00:00",
      paidBy: MANAGER_NAME,
      log: [
        { at: "2026-08-19 09:00:00", text: "Invoice opened — Second-hand intake, invoice CD-777" },
        { at: "2026-08-19 09:30:00", text: "Finalized — 1 copy now sellable" },
        { at: "2026-08-20 14:00:00", text: `Payment recorded — EFT EFT-88214 ${money(20)} by ${MANAGER_NAME}` },
        { at: "2026-08-20 14:00:00", text: `Balance settled — marked paid by ${MANAGER_NAME}` },
      ],
    },
  ],
  payableEntries: [
    // A manual Adjustment — a freight correction Indie Direct Supply billed
    // separately from the Invoice, demonstrating a ledger entry that isn't
    // sourced from Receiving or Supplier Claims.
    {
      id: "entry-seed-adj",
      supplierId: "sup-indie",
      type: "Adjustment",
      reference: "Freight correction — INDI-3390",
      date: "2026-09-02",
      subtotal: 6.5,
      tax: 0,
      freight: 0,
      misc: 0,
      adjustmentDirection: "increase",
      createdBy: MANAGER_NAME,
      createdAt: "2026-09-02 10:00:00",
      log: [{ at: "2026-09-02 10:00:00", text: "Adjustment entered — Freight correction — INDI-3390" }],
    },
  ],
  paymentBatches: [
    {
      id: "batch-seed-1",
      supplierId: "sup-crate",
      method: "EFT",
      reference: "EFT-88214",
      date: "2026-08-20",
      recordedBy: MANAGER_NAME,
      createdAt: "2026-08-20 14:00:00",
      targets: [{ kind: "invoice", id: "inv-seed-crate-paid", amount: 20.0 }],
    },
  ],
  pendingOrders: PENDING_ORDERS,
  reviewFlags: [],
  activeSaleId: null,
  lastViewedSupplierId: null,
  lastViewedCustomerId: null,
  nextSaleNumber: 100241,
  nextHold: 2,
  nextClaimNumber: 12,
  nextPoNumber: 0,
  nextInternalBarcode: 9000,
  nextInvoiceRef: 1,
  nextCustomerPrimaryId: CUSTOMERS.length + 1,
  discogsUp: true,
};

interface AppContextValue extends AppState {
  activeSale: Sale | null;
  recordFor: (id?: string) => RecordEntry | undefined;
  customerFor: (id?: string) => Customer | undefined;
  itemFor: (id?: string) => InventoryItem | undefined;
  supplierFor: (id?: string) => Supplier | undefined;

  newSale: (opts?: { isReturn?: boolean }) => string;
  setActiveSale: (id: string | null) => void;
  setSalePo: (saleId: string, po: string) => void;
  editSale: (saleId: string) => string | null;
  copySale: (saleId: string) => string | null;
  viewSubtotal: () => DayBreakdown;
  totalTodaysSales: (by: string) => { batchId: string; breakdown: DayBreakdown };
  undoEndOfDay: (batchId: string, by: string) => void;
  attachCustomer: (saleId: string, customerId: string | null) => void;
  addCustomer: (input: Omit<Customer, "id" | "primaryId" | "balance">) => string;
  updateCustomer: (customerId: string, patch: Partial<Omit<Customer, "id" | "primaryId">>) => void;
  deleteCustomer: (customerId: string) => void;
  viewCustomer: (customerId: string) => void;
  addItemLine: (saleId: string, item: InventoryItem) => void;
  addNegInventoryLine: (saleId: string, record: RecordEntry, price: number) => void;
  addNonTrackedLine: (saleId: string, nt: NonTrackedItem, price: number) => void;
  addGiftCardLoadLine: (saleId: string, code: string, value: number) => void;
  addReturnLine: (
    saleId: string,
    item: InventoryItem,
    refund: number,
    linkedSaleNumber?: number,
  ) => void;
  updateLine: (saleId: string, lineId: string, patch: Partial<SaleLine>) => void;
  removeLine: (saleId: string, lineId: string) => void;
  addTender: (saleId: string, t: Omit<Tender, "id">) => void;
  removeTender: (saleId: string, tenderId: string) => void;
  completeSale: (saleId: string) => number;
  holdSale: (saleId: string) => string;
  // E-05 d31 — refuses unless the tenders net zero, returning how much is
  // still on the Sale so the caller can offer to refund it, move it onto the
  // Customer's account, or remove the line. E-06 d10 — also refuses while a
  // Return has routed stock, since putting that back is its own job.
  voidSale: (saleId: string) => { voided: boolean; outstanding: number; routedCopies: number };
  cancelHold: (saleId: string) => void;
  releaseHoldLine: (itemId: string) => { holdRef: string; holdClosed: boolean } | null;
  forceUnlockSale: (saleId: string) => void;
  acknowledgeReviewFlag: (id: string, by: string) => void;
  reconcileOversold: (recordId: string, by: string) => number;
  addLog: (saleId: string, text: string) => void;

  raiseClaim: (
    itemId: string,
    reason: string,
    qty: number,
    separator?: string,
    note?: string,
  ) => { claimId: string; supplierName: string } | null;
  sendClaim: (claimId: string, claimNumber?: number) => { claimNumber: number } | null;
  markClaimCredited: (claimId: string, creditMemo: string) => void;

  reserve: (
    recordId: string,
    itemId: string,
    customerId: string,
    qty: number,
    po?: string,
  ) => { id: string; holdRef: string };
  setCopyPrice: (itemId: string, price: number) => void;
  routeReturnLine: (
    saleId: string,
    lineId: string,
    itemId: string,
    to: "sellable" | "regrade" | "writeoff",
    grade?: Grade,
    price?: number,
  ) => void;
  toggleDiscogs: () => void;

  invoiceFor: (id?: string) => Invoice | undefined;
  startInvoice: (input: {
    supplierId: string;
    intakeMode: IntakeMode;
    invoiceNumber: string;
    invoiceDate: string;
    receivedDate: string;
    statedSubtotal: number;
    tax: number;
    freight: number;
  }) => string;
  createRecordManual: (input: {
    artist: string;
    title: string;
    genre: string;
    catalogNo: string;
    label: string;
    section: Section;
  }) => string;
  addSupplier: (input: Omit<Supplier, "id" | "log">) => string;
  updateSupplier: (supplierId: string, patch: Partial<Omit<Supplier, "id" | "log">>) => void;
  copySupplier: (supplierId: string) => string | null;
  deleteSupplier: (supplierId: string) => void;
  mergeSuppliers: (keepId: string, mergeId: string) => void;
  setDefaultForSecondHand: (supplierId: string) => void;
  setRecordPreferredSupplier: (recordId: string, supplierId: string | undefined) => void;
  viewSupplier: (supplierId: string) => void;
  addInvoiceLine: (
    invoiceId: string,
    line: {
      recordId: string;
      scannedCode?: string;
      listPrice: number;
      discountPct: number;
      acceptedPrice: number;
      grade: Grade;
      qty: number;
      fromOrderId?: string;
    },
  ) => void;
  updateInvoiceLine: (
    invoiceId: string,
    lineId: string,
    patch: Partial<Pick<InvoiceLine, "listPrice" | "discountPct" | "acceptedPrice" | "grade" | "qty">>,
  ) => void;
  removeInvoiceLine: (invoiceId: string, lineId: string) => { blocked: boolean };
  updateInvoiceTotals: (
    invoiceId: string,
    patch: Partial<Pick<Invoice, "statedSubtotal" | "tax" | "freight" | "misc">>,
  ) => void;
  setInvoiceTotalOverride: (invoiceId: string, value?: number) => void;
  finalizeInvoice: (invoiceId: string) => { itemCount: number } | null;
  markInvoicePaid: (invoiceId: string, by: string) => void;

  // M-05 — Accounts Payable. One PaymentBatch per Record-Payment action,
  // covering whatever mix of Invoices and PayableEntries it was paying,
  // sharing one method/reference/date (the "Record payment" modal's
  // multi-select). An Invoice whose balance reaches zero is marked Paid the
  // same way markInvoicePaid does — that's the "manager settles the
  // balance" moment that locks it (E-02 §Inherited).
  recordPayment: (
    targets: { kind: PayableTargetKind; id: string }[],
    input: { supplierId: string; method: PaymentMethod; reference: string; date: string; amounts: Record<string, number> },
    by: string,
  ) => void;
  // Applies a Credited, not-yet-applied claim's full amount against its
  // Supplier's whole outstanding balance (decision 11) — not one Invoice the
  // Manager picks. Returns null if the claim isn't eligible or the Supplier
  // has nothing outstanding to apply it against.
  applyClaimCredit: (claimId: string, by: string) => { applied: boolean } | null;

  payableEntryFor: (id?: string) => PayableEntry | undefined;
  // M-05 "Create new" — a manual ledger line unlinked to any InventoryItem.
  // Defaults to Consignment instead of Invoice when the Supplier carries
  // that flag.
  addPayableEntry: (input: {
    supplierId: string;
    type: PayableEntryType;
    reference: string;
    date: string;
    subtotal: number;
    tax: number;
    freight: number;
    misc: number;
    adjustmentDirection?: "increase" | "decrease";
  }) => string;
  // Manual reconciliation: marks a set of same-Supplier entries (2+, none
  // already cleared) as cleared against each other — only if their signed
  // amounts sum to zero. Returns { cleared: false } and changes nothing
  // otherwise (mismatched sum, wrong supplier, already cleared, etc).
  clearPayableEntries: (entryIds: string[], by: string) => { cleared: boolean };

  pendingOrderFor: (id?: string) => PendingOrderLine | undefined;
  receivePendingOrderLine: (id: string) => PendingOrderLine | null;

  // M-02 Phase 1 — an Employee raising a pending line from a titlecard's
  // Order button. Joins the Supplier's pending pile; carries no PO number
  // until a Manager Processes it (Phase 2).
  raisePendingOrderLine: (input: {
    recordId: string;
    supplierId: string;
    separator?: string;
    qty: number;
    sellPrice: number;
    customerId?: string;
    followUpDays?: number;
  }) => string;

  // Order Processing (M-02) — editing a still-pending line in place. Only
  // ever applies while poNumber is unset; a placed line goes through Cancel
  // / Void (Phase 3, not built) instead of a quiet edit.
  updatePendingOrderLine: (id: string, patch: Partial<Pick<PendingOrderLine, "qty" | "sellPrice" | "separator">>) => void;
  deletePendingOrderLine: (id: string) => { customerAttached: boolean; recordId: string } | null;

  // Phase 3 / What's on Order — push a placed line's follow-up window out
  // another `days` from now, restarting the clock rather than adding to the
  // old deadline. Used both to chase the Supplier and to warn a waiting
  // Customer (M-02 §"Tracking what's on order").
  reflagPendingOrderLine: (id: string, days: number) => void;

  // Mass-shift a whole pending stream (every unplaced line at
  // supplierId+fromSeparator) onto a different separator in one move — the
  // Order Processing pending table's own Sep dropdown, as opposed to
  // retargeting one line at a time from View.
  retargetStreamSeparator: (
    supplierId: string,
    fromSeparator: string | undefined,
    toSeparator: string | undefined,
  ) => { movedCount: number } | null;

  // M-02 Phase 2 — processing a stream (one supplier + separator, all its
  // still-unplaced lines) into a PurchaseOrder. `poNumber` blank auto-mints
  // the next unused ascending number (decision 16); returns null if the
  // stream is empty or the requested number is already taken.
  poNumberTaken: (poNumber: string) => boolean;
  processOrderStream: (
    supplierId: string,
    separator: string | undefined,
    poNumber?: string,
  ) => { poNumber: string; lineCount: number; unitCount: number; emailed: boolean } | null;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(seed);

  const patchSale = (saleId: string, fn: (sale: Sale) => Sale) =>
    setS((prev) => ({
      ...prev,
      sales: prev.sales.map((sale) => (sale.id === saleId ? fn(sale) : sale)),
    }));

  // M-04 d8 — the manager override is retired; these actions proceed and
  // leave a flag a manager reviews afterward instead of blocking on one.
  const raiseReviewFlag = (kind: ReviewFlagKind, summary: string) => {
    const flag: ReviewFlag = {
      id: uid("flag"),
      kind,
      summary,
      recordedBy: CURRENT_USER,
      at: now(),
      acknowledged: false,
    };
    setS((prev) => ({ ...prev, reviewFlags: [flag, ...prev.reviewFlags] }));
  };

  const acknowledgeReviewFlag: AppContextValue["acknowledgeReviewFlag"] = (id, by) =>
    setS((prev) => ({
      ...prev,
      reviewFlags: prev.reviewFlags.map((f) =>
        f.id === id ? { ...f, acknowledged: true, acknowledgedBy: by, acknowledgedAt: now() } : f,
      ),
    }));

  const recordFor = (id?: string) => s.records.find((r) => r.id === id);
  const customerFor = (id?: string) => s.customers.find((c) => c.id === id);
  const itemFor = (id?: string) => s.inventory.find((i) => i.id === id);
  const supplierFor = (id?: string) => s.suppliers.find((sup) => sup.id === id);

  const applyCustomerDefaults = (
    customerId: string | undefined,
    base: { discountPct: number; taxLineId: string },
  ) => {
    const c = s.customers.find((x) => x.id === customerId);
    if (!c) return base;
    return {
      discountPct: c.globalDiscountPct || base.discountPct,
      taxLineId: c.defaultTaxLineId || base.taxLineId,
    };
  };

  const newSale: AppContextValue["newSale"] = (opts) => {
    const id = uid("sale");
    const sale: Sale = {
      id,
      state: "Open",
      customerId: undefined,
      createdBy: CURRENT_USER,
      createdAt: now(),
      isReturn: opts?.isReturn,
      lockedBy: CURRENT_USER,
      lines: [],
      tenders: [],
      log: [{ at: now(), text: opts?.isReturn ? "Return started" : "Sale started" }],
    };
    setS((prev) => ({ ...prev, sales: [sale, ...prev.sales], activeSaleId: id }));
    return id;
  };

  const setActiveSale = (id: string | null) =>
    setS((prev) => ({ ...prev, activeSaleId: id }));

  const setSalePo: AppContextValue["setSalePo"] = (saleId, po) =>
    patchSale(saleId, (sale) => ({ ...sale, po: po || undefined }));

  // Edit — Current: void the original (returns its stock) and open a new
  // Sale pre-populated with the same lines, same InventoryItems (they're
  // sellable again now), for the Employee to correct. Held: there's nothing
  // to duplicate, just open the existing hold to prep for tender.
  const editSale: AppContextValue["editSale"] = (saleId) => {
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale) return null;
    if (sale.state === "Held") return saleId;
    if (sale.state !== "Current") return null;
    // Edit is a Void plus a re-ring, so it faces the Void gate too (E-05
    // d31): if the money is still on the original, nothing happens here and
    // the caller sends the operator to settle it first. Without this the
    // original would stay Current while a duplicate of it appeared.
    if (!voidSale(saleId).voided) return null;
    const id = uid("sale");
    const dup: Sale = {
      id,
      state: "Open",
      customerId: sale.customerId,
      po: sale.po,
      createdBy: CURRENT_USER,
      createdAt: now(),
      lockedBy: CURRENT_USER,
      replacesSaleId: sale.id,
      lines: sale.lines.map((l) => ({ ...l, id: uid("line") })),
      tenders: [],
      log: [{ at: now(), text: `Editing Sale #${sale.saleNumber} — original voided, stock returned, lines carried over` }],
    };
    setS((prev) => ({ ...prev, sales: [dup, ...prev.sales], activeSaleId: id }));
    return id;
  };

  // Copy — a fresh Sale seeded with the same line template (record, price,
  // qty, discount, tax, grade). Unlike Edit, the source Sale is untouched
  // and its items may still be sold, so a copy never carries over the
  // specific InventoryItem — the Employee re-scans the physical copy being
  // sold now.
  const copySale: AppContextValue["copySale"] = (saleId) => {
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale) return null;
    const id = uid("sale");
    const dup: Sale = {
      id,
      state: "Open",
      customerId: sale.customerId,
      po: sale.po,
      createdBy: CURRENT_USER,
      createdAt: now(),
      lockedBy: CURRENT_USER,
      lines: sale.lines.map((l) => ({ ...l, id: uid("line"), inventoryItemId: undefined })),
      tenders: [],
      log: [{ at: now(), text: `Copied from Sale ${sale.saleNumber ?? sale.holdRef ?? "—"} — lines are a pricing template, re-scan each copy` }],
    };
    setS((prev) => ({ ...prev, sales: [dup, ...prev.sales], activeSaleId: id }));
    return id;
  };

  const attachCustomer: AppContextValue["attachCustomer"] = (saleId, customerId) =>
    patchSale(saleId, (sale) => {
      const cust = s.customers.find((c) => c.id === customerId);
      return {
        ...sale,
        customerId: customerId ?? undefined,
        // pre-fill defaults onto existing lines that still carry base values
        lines: sale.lines.map((l) =>
          cust
            ? {
                ...l,
                discountPct: l.discountPct || cust.globalDiscountPct,
                taxLineId: cust.defaultTaxLineId || l.taxLineId,
              }
            : l,
        ),
        log: [
          ...sale.log,
          {
            at: now(),
            text: cust ? `Customer attached — ${cust.name}` : "Customer detached",
          },
        ],
      };
    });

  // E-07 — Search/New/Delete. Every other field is edited in place on the
  // open card, not through a separate Edit flow.
  const addCustomer: AppContextValue["addCustomer"] = (input) => {
    const id = uid("cust");
    const customer: Customer = { id, primaryId: s.nextCustomerPrimaryId, ...input, balance: 0 };
    setS((prev) => ({
      ...prev,
      customers: [...prev.customers, customer],
      nextCustomerPrimaryId: prev.nextCustomerPrimaryId + 1,
      lastViewedCustomerId: id,
    }));
    return id;
  };

  const updateCustomer: AppContextValue["updateCustomer"] = (customerId, patch) =>
    setS((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => (c.id === customerId ? { ...c, ...patch } : c)),
    }));

  const deleteCustomer: AppContextValue["deleteCustomer"] = (customerId) =>
    setS((prev) => ({
      ...prev,
      customers: prev.customers.filter((c) => c.id !== customerId),
      lastViewedCustomerId: prev.lastViewedCustomerId === customerId ? null : prev.lastViewedCustomerId,
    }));

  const viewCustomer: AppContextValue["viewCustomer"] = (customerId) =>
    setS((prev) => ({ ...prev, lastViewedCustomerId: customerId }));

  const addItemLine: AppContextValue["addItemLine"] = (saleId, item) =>
    patchSale(saleId, (sale) => {
      const rec = s.records.find((r) => r.id === item.recordId)!;
      const d = applyCustomerDefaults(sale.customerId, {
        discountPct: 0,
        taxLineId: DEFAULT_TAX_LINE,
      });
      const line: SaleLine = {
        id: uid("line"),
        kind: "item",
        recordId: rec.id,
        inventoryItemId: item.id,
        title: `${rec.artist} — ${rec.title}`,
        grade: item.grade,
        qty: 1,
        price: item.price,
        discountPct: d.discountPct,
        taxLineId: d.taxLineId,
      };
      return { ...sale, lines: [...sale.lines, line] };
    });

  const addNegInventoryLine: AppContextValue["addNegInventoryLine"] = (
    saleId,
    record,
    price,
  ) => {
    // "Oversold" (lexicon) — mint the real InventoryItem now, sold from
    // birth. Grade is a placeholder (unknown at the till) and cost is
    // unknown until this is reconciled against a real Invoice line.
    const itemId = uid("item");
    const code = `29${String(s.nextInternalBarcode).padStart(10, "0")}`;
    const item: InventoryItem = {
      id: itemId,
      recordId: record.id,
      grade: "M",
      price,
      cost: 0,
      internalBarcode: code,
      status: "sold",
      oversold: true,
      oversoldAt: now(),
    };
    setS((prev) => ({
      ...prev,
      inventory: [...prev.inventory, item],
      nextInternalBarcode: prev.nextInternalBarcode + 1,
    }));
    patchSale(saleId, (sale) => {
      const d = applyCustomerDefaults(sale.customerId, {
        discountPct: 0,
        taxLineId: DEFAULT_TAX_LINE,
      });
      const line: SaleLine = {
        id: uid("line"),
        kind: "item",
        recordId: record.id,
        inventoryItemId: itemId,
        title: `${record.artist} — ${record.title}`,
        qty: 1,
        price,
        discountPct: d.discountPct,
        taxLineId: d.taxLineId,
        note: "No sellable copy on hand — sold against negative inventory",
      };
      return {
        ...sale,
        lines: [...sale.lines, line],
        log: [
          ...sale.log,
          { at: now(), text: `Negative inventory: ${record.title} sold with 0 on hand` },
        ],
      };
    });
    raiseReviewFlag(
      "negative-stock",
      `Sold ${record.artist} — ${record.title} at ${money(price)} with none on hand.`,
    );
  };

  const addNonTrackedLine: AppContextValue["addNonTrackedLine"] = (saleId, nt, price) =>
    patchSale(saleId, (sale) => {
      const d = applyCustomerDefaults(sale.customerId, {
        discountPct: 0,
        taxLineId: DEFAULT_TAX_LINE,
      });
      const line: SaleLine = {
        id: uid("line"),
        kind: "nontracked",
        title: `${nt.label} (${nt.code})`,
        qty: 1,
        price,
        discountPct: 0,
        taxLineId: d.taxLineId,
        note: "Non-tracked — no stock count",
      };
      return { ...sale, lines: [...sale.lines, line] };
    });

  const addGiftCardLoadLine: AppContextValue["addGiftCardLoadLine"] = (
    saleId,
    code,
    value,
  ) => {
    setS((prev) => ({
      ...prev,
      giftCards: prev.giftCards.some((g) => g.code === code)
        ? prev.giftCards.map((g) => (g.code === code ? { ...g, balance: g.balance + value } : g))
        : [...prev.giftCards, { code, balance: value }],
    }));
    patchSale(saleId, (sale) => ({
      ...sale,
      lines: [
        ...sale.lines,
        {
          id: uid("line"),
          kind: "giftcard-load",
          title: `Gift card load — ${code}`,
          qty: 1,
          price: value,
          discountPct: 0,
          taxLineId: "tx-exempt",
          note: "Loading a gift card is a line item (money in)",
        },
      ],
      log: [...sale.log, { at: now(), text: `Gift card ${code} loaded with $${value.toFixed(2)}` }],
    }));
  };

  const addReturnLine: AppContextValue["addReturnLine"] = (
    saleId,
    item,
    refund,
    linkedSaleNumber,
  ) =>
    patchSale(saleId, (sale) => {
      const rec = s.records.find((r) => r.id === item.recordId)!;
      const d = applyCustomerDefaults(sale.customerId, {
        discountPct: 0,
        taxLineId: DEFAULT_TAX_LINE,
      });
      const line: SaleLine = {
        id: uid("line"),
        kind: "item",
        recordId: rec.id,
        inventoryItemId: item.id,
        title: `${rec.artist} — ${rec.title}`,
        grade: item.grade,
        qty: -1,
        price: refund,
        discountPct: 0,
        taxLineId: d.taxLineId,
        linkedSaleNumber,
        note: linkedSaleNumber
          ? `Return — linked to Sale ${linkedSaleNumber}`
          : "Return — no linked Sale (no receipt / walk-in)",
      };
      return {
        ...sale,
        lines: [...sale.lines, line],
        log: [...sale.log, { at: now(), text: `Return line added — ${rec.title}` }],
      };
    });

  const updateLine: AppContextValue["updateLine"] = (saleId, lineId, patch) =>
    patchSale(saleId, (sale) => ({
      ...sale,
      lines: sale.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }));

  const removeLine: AppContextValue["removeLine"] = (saleId, lineId) =>
    patchSale(saleId, (sale) => ({
      ...sale,
      lines: sale.lines.filter((l) => l.id !== lineId),
    }));

  const tenderLogText = (t: Pick<Tender, "type" | "amount" | "accountDirection">) =>
    `${t.type}${
      // Account Balance moves money either way — same $ amount every
      // time — so the log needs to spell out the direction, or every
      // entry reads identically regardless of which one was picked.
      t.type === "Account Balance" ? ` (${t.accountDirection === "add" ? "add to balance" : "draw down"})` : ""
    } ${t.amount < 0 ? "-" : ""}$${Math.abs(t.amount).toFixed(2)}`;

  const addTender: AppContextValue["addTender"] = (saleId, t) =>
    setS((prev) => {
      const sale = prev.sales.find((x) => x.id === saleId);
      if (!sale) return prev;
      const tender: Tender = { ...t, id: uid("tndr") };
      // On an Open Sale the money hasn't moved yet — completeSale applies
      // every tender at once. On a Current one it already has, so a tender
      // added now (a reversal, on the way to voiding) has to move its money
      // immediately or the screen would show a balance the store never gave
      // back. E-05 d32.
      const settled = sale.state === "Current";
      const moved = settled
        ? applyTenderEffect(prev.giftCards, prev.customers, tender, sale.customerId, 1)
        : { giftCards: prev.giftCards, customers: prev.customers };
      return {
        ...prev,
        giftCards: moved.giftCards,
        customers: moved.customers,
        sales: prev.sales.map((x) =>
          x.id === saleId
            ? {
                ...x,
                tenders: [...x.tenders, tender],
                log: [...x.log, { at: now(), text: `Tender: ${tenderLogText(tender)}` }],
              }
            : x,
        ),
      };
    });

  const removeTender: AppContextValue["removeTender"] = (saleId, tenderId) =>
    setS((prev) => {
      const sale = prev.sales.find((x) => x.id === saleId);
      const tender = sale?.tenders.find((t) => t.id === tenderId);
      if (!sale || !tender) return prev;
      // Removing a tender from a Current Sale asserts the payment never
      // really happened, so whatever it moved has to move back: a gift card
      // drawn down returns to its balance, an account charge is undone.
      const settled = sale.state === "Current";
      const moved = settled
        ? applyTenderEffect(prev.giftCards, prev.customers, tender, sale.customerId, -1)
        : { giftCards: prev.giftCards, customers: prev.customers };
      return {
        ...prev,
        giftCards: moved.giftCards,
        customers: moved.customers,
        sales: prev.sales.map((x) =>
          x.id === saleId
            ? {
                ...x,
                tenders: x.tenders.filter((t) => t.id !== tenderId),
                log: settled
                  ? [...x.log, { at: now(), text: `Tender removed: ${tenderLogText(tender)} — reversed` }]
                  : x.log,
              }
            : x,
        ),
      };
    });

  const completeSale: AppContextValue["completeSale"] = (saleId) => {
    const num = s.nextSaleNumber;
    const sale = s.sales.find((x) => x.id === saleId);
    setS((prev) => {
      let giftCards = prev.giftCards;
      let customers = prev.customers;
      let inventory = prev.inventory;
      if (sale) {
        for (const t of sale.tenders) {
          const moved = applyTenderEffect(giftCards, customers, t, sale.customerId, 1);
          giftCards = moved.giftCards;
          customers = moved.customers;
        }
        // consume sold copies
        const soldItemIds = sale.lines
          .filter((l) => l.kind === "item" && l.inventoryItemId && l.qty > 0)
          .map((l) => l.inventoryItemId!);
        inventory = inventory.map((i) =>
          soldItemIds.includes(i.id) ? { ...i, status: "sold" } : i,
        );
      }
      return {
        ...prev,
        giftCards,
        customers,
        inventory,
        nextSaleNumber: prev.nextSaleNumber + 1,
        sales: prev.sales.map((x) =>
          x.id === saleId
            ? {
                ...x,
                state: "Current",
                saleNumber: num,
                // The Sale is attributed to whoever holds the lock at tender —
                // a Sale one Employee starts and another finishes belongs to
                // the one who finished it (E-05 locking).
                createdBy: x.lockedBy ?? x.createdBy,
                lockedBy: undefined,
                log: [...x.log, { at: now(), text: `Tendered — Sale number ${num} assigned` }],
              }
            : x,
        ),
      };
    });
    return num;
  };

  const holdSale: AppContextValue["holdSale"] = (saleId) => {
    const ref = `H${s.nextHold}`;
    setS((prev) => ({
      ...prev,
      nextHold: prev.nextHold + 1,
      inventory: prev.inventory.map((i) => {
        const held = prev.sales
          .find((x) => x.id === saleId)
          ?.lines.some((l) => l.inventoryItemId === i.id);
        return held ? { ...i, status: "held" } : i;
      }),
      sales: prev.sales.map((x) =>
        x.id === saleId
          ? {
              ...x,
              state: "Held",
              holdRef: ref,
              lockedBy: undefined, // Hold releases the lock — any Employee may re-open it
              log: [...x.log, { at: now(), text: `Placed on hold — ${ref}` }],
            }
          : x,
      ),
    }));
    return ref;
  };

  // A lock stranded by a closed browser is broken this way — it proceeds and
  // raises a review flag rather than requiring the original Employee (M-04 d8).
  const forceUnlockSale: AppContextValue["forceUnlockSale"] = (saleId) => {
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale?.lockedBy) return;
    const was = sale.lockedBy;
    setS((prev) => ({
      ...prev,
      sales: prev.sales.map((x) =>
        x.id === saleId
          ? {
              ...x,
              lockedBy: CURRENT_USER,
              log: [...x.log, { at: now(), text: `Lock forced from ${was} to ${CURRENT_USER}` }],
            }
          : x,
      ),
    }));
    raiseReviewFlag("sale-lock-broken", `Sale lock broken — ${was} to ${CURRENT_USER} on an open Sale.`);
  };

  // Void — Open or Current only (E-05 decision 5): a Held Sale uses Cancel
  // Hold instead, and a Closed Sale can't be voided at all — it's reopened
  // via Undo End of Day (M-03) or handled as a Return (E-06).
  //
  // E-05 d31 — and only ever at zero. Voiding used to revert the stock and
  // walk away from the money: a gift-card sale voided left the card drawn
  // down to nothing, and because the day breakdown only totals Current
  // Sales (M-03), the voided tenders left the report while the cash stayed
  // in the drawer. So the tenders have to net to zero first — refunded,
  // moved onto the Customer's account, or removed as never having happened
  // — and `outstanding` tells the caller how much is still unaccounted for.
  const voidSale: AppContextValue["voidSale"] = (saleId) => {
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale || sale.state === "Held" || sale.state === "Closed" || sale.state === "Void") {
      return { voided: false, outstanding: 0, routedCopies: 0 };
    }
    const outstanding = tenderedTotal(sale);
    // E-06 d10 — a routed copy is already back on the shelf (or re-graded, or
    // written off), and putting it back where it came from is a different
    // operation from voiding the paperwork. Void refuses while any line on a
    // Return is routed rather than quietly leaving stock in the wrong place.
    const routedCopies = sale.lines.filter((l) => l.stockRouted).length;
    if (routedCopies > 0) return { voided: false, outstanding, routedCopies };
    if (Math.abs(outstanding) > 0.005) return { voided: false, outstanding, routedCopies: 0 };
    setS((prev) => {
      // Only copies this Sale consumed come back. A Return's lines are
      // negative quantities against copies that are already sold — there is
      // nothing to give back, and marking them sellable would put stock on
      // the floor the store never took in (and free a held copy outright).
      // Same test completeSale uses to decide what a Sale consumed.
      const onSaleIds = new Set(
        prev.sales
          .find((x) => x.id === saleId)
          ?.lines.filter((l) => l.qty > 0)
          .map((l) => l.inventoryItemId)
          .filter((id): id is string => !!id),
      );
      return {
        ...prev,
        inventory: prev.inventory
          // An unreconciled oversold copy never became real stock — voiding
          // the Sale that invented it un-invents it, rather than leaving a
          // phantom debt a later receipt would wrongly pay down.
          .filter((i) => !(onSaleIds.has(i.id) && i.oversold && !i.oversoldReconciledAt))
          .map((i) => {
            if (!onSaleIds.has(i.id)) return i;
            if (i.oversold) {
              // Already reconciled against real received stock — that stock
              // is real, it just becomes an ordinary sellable copy again.
              return {
                ...i,
                status: "sellable" as const,
                heldByCustomerId: undefined,
                oversold: undefined,
                oversoldAt: undefined,
                oversoldReconciledAt: undefined,
                oversoldReconciledBy: undefined,
                oversoldReconciledVia: undefined,
              };
            }
            // Void only ever runs against a Current (not yet Closed) Sale, so
            // reverting a "sold" item here is safe — it can't undo settled
            // history, only same-day stock that hasn't been totalled off yet.
            return { ...i, status: "sellable" as const, heldByCustomerId: undefined };
          }),
        sales: prev.sales.map((x) => {
          if (x.id !== saleId) return x;
          // Say what actually happened rather than one fixed sentence: a
          // Return gives no copies back, and a draft has no number to retain.
          const returned = onSaleIds.size;
          const text =
            "Voided at zero" +
            (returned ? ` — ${returned} cop${returned === 1 ? "y" : "ies"} returned to stock` : "") +
            (x.saleNumber ? `${returned ? "," : " —"} Sale number ${x.saleNumber} retained` : "");
          return { ...x, state: "Void", log: [...x.log, { at: now(), text }] };
        }),
      };
    });
    return { voided: true, outstanding: 0, routedCopies: 0 };
  };

  const cancelHold: AppContextValue["cancelHold"] = (saleId) =>
    setS((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) => {
        const held = prev.sales
          .find((x) => x.id === saleId)
          ?.lines.some((l) => l.inventoryItemId === i.id);
        return held ? { ...i, status: "sellable", heldByCustomerId: undefined } : i;
      }),
      sales: prev.sales.map((x) =>
        x.id === saleId
          ? { ...x, state: "Void", log: [...x.log, { at: now(), text: "Hold cancelled — copies released to sellable stock" }] }
          : x,
      ),
    }));

  // M-03 — View Subtotal computes the same breakdown as a close without
  // touching anything; it's a pure read.
  const viewSubtotal: AppContextValue["viewSubtotal"] = () =>
    computeDayBreakdown(s.sales, s.records, s.taxLines, s.inventory);

  // Total Today's Sales — the close is a real state transition (M-03
  // decision 1): every Current Sale becomes Closed and stops being
  // editable, batched under one identifier so it can be undone as a unit.
  const totalTodaysSales: AppContextValue["totalTodaysSales"] = (by) => {
    const breakdown = computeDayBreakdown(s.sales, s.records, s.taxLines, s.inventory);
    const saleIds = s.sales.filter((sale) => sale.state === "Current" && !sale.isReturn).map((sale) => sale.id);
    const batchId = uid("batch");
    const batch: CloseBatch = { id: batchId, at: now(), by, saleIds };
    setS((prev) => ({
      ...prev,
      closeBatches: [batch, ...prev.closeBatches],
      sales: prev.sales.map((sale) =>
        saleIds.includes(sale.id)
          ? { ...sale, state: "Closed", batchId, log: [...sale.log, { at: now(), text: `Closed in batch ${batchId} by ${by}` }] }
          : sale,
      ),
    }));
    return { batchId, breakdown };
  };

  // Undo End of Day — Admin (M-03 decision 4). Restores every Sale in the
  // batch to Current, Sale numbers included; the batch itself stays in
  // history, marked undone, rather than disappearing.
  const undoEndOfDay: AppContextValue["undoEndOfDay"] = (batchId, by) => {
    const batch = s.closeBatches.find((b) => b.id === batchId);
    if (!batch || batch.undoneAt) return;
    setS((prev) => ({
      ...prev,
      closeBatches: prev.closeBatches.map((b) => (b.id === batchId ? { ...b, undoneAt: now(), undoneBy: by } : b)),
      sales: prev.sales.map((sale) =>
        batch.saleIds.includes(sale.id)
          ? { ...sale, state: "Current", batchId: undefined, log: [...sale.log, { at: now(), text: `Batch ${batchId} undone by ${by} — back to Current` }] }
          : sale,
      ),
    }));
  };

  // Removes one copy from whichever Held sale it's on — since a hold can now
  // carry several copies (same customer + PO), this is finer-grained than
  // cancelHold. If it was the last line, the hold closes the same way a full
  // cancelHold does; otherwise the sale stays Held with the remaining lines.
  const releaseHoldLine: AppContextValue["releaseHoldLine"] = (itemId) => {
    const sale = s.sales.find(
      (x) => x.state === "Held" && x.lines.some((l) => l.inventoryItemId === itemId),
    );
    if (!sale) return null;
    const holdRef = sale.holdRef!;
    const remaining = sale.lines.filter((l) => l.inventoryItemId !== itemId);
    const holdClosed = remaining.length === 0;
    setS((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        i.id === itemId ? { ...i, status: "sellable", heldByCustomerId: undefined } : i,
      ),
      sales: prev.sales.map((x) =>
        x.id === sale.id
          ? {
              ...x,
              lines: remaining,
              state: holdClosed ? "Void" : x.state,
              log: [
                ...x.log,
                {
                  at: now(),
                  text: holdClosed
                    ? "Hold cancelled — last copy released to sellable stock"
                    : "Copy released from hold — remaining items stay on hold",
                },
              ],
            }
          : x,
      ),
    }));
    return { holdRef, holdClosed };
  };

  const addLog: AppContextValue["addLog"] = (saleId, text) =>
    patchSale(saleId, (sale) => ({ ...sale, log: [...sale.log, { at: now(), text }] }));

  // Claims raised against the same supplier + separator merge onto one Draft
  // claim as extra lines — the same batching key pending orders use (M-02) —
  // rather than becoming N separate claims that all have to be sent one by
  // one. E-04 §"Supplier claims".
  const raiseClaim: AppContextValue["raiseClaim"] = (itemId, reason, qty, separator, note) => {
    const item = s.inventory.find((i) => i.id === itemId);
    if (!item?.supplierId) return null;
    const supplier = s.suppliers.find((sup) => sup.id === item.supplierId)!;
    const sepKey = (separator ?? "").trim();
    const line = {
      id: uid("claimline"),
      recordId: item.recordId,
      itemId: item.id,
      invoiceNumber: item.arrivedOnInvoice,
      reason,
      note,
      cost: item.cost,
      qty,
    };

    const existing = s.claims.find(
      (c) =>
        c.status === "Draft" &&
        c.supplierId === supplier.id &&
        (c.separator ?? "").trim() === sepKey,
    );

    if (existing) {
      setS((prev) => ({
        ...prev,
        claims: prev.claims.map((c) =>
          c.id === existing.id
            ? {
                ...c,
                lines: [...c.lines, line],
                log: [...c.log, { at: now(), text: `Line added — ${reason} (qty ${qty})` }],
              }
            : c,
        ),
      }));
      return { claimId: existing.id, supplierName: supplier.name };
    }

    const id = uid("claim");
    const claim: SupplierClaim = {
      id,
      supplierId: supplier.id,
      separator: sepKey || undefined,
      status: "Draft",
      lines: [line],
      createdBy: CURRENT_USER,
      createdAt: now(),
      log: [{ at: now(), text: `Claim opened — ${reason} (qty ${qty})` }],
    };
    setS((prev) => ({ ...prev, claims: [claim, ...prev.claims] }));
    return { claimId: id, supplierName: supplier.name };
  };

  const sendClaim: AppContextValue["sendClaim"] = (claimId, claimNumber) => {
    const claim = s.claims.find((c) => c.id === claimId);
    if (!claim || claim.status !== "Draft") return null;
    const supplier = s.suppliers.find((sup) => sup.id === claim.supplierId)!;
    const used = new Set(s.claims.map((c) => c.claimNumber).filter((n): n is number => n !== undefined));
    let num = claimNumber ?? s.nextClaimNumber;
    while (used.has(num)) num++;
    setS((prev) => ({
      ...prev,
      nextClaimNumber: Math.max(prev.nextClaimNumber, num + 1),
      claims: prev.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              status: "Pending",
              claimNumber: num,
              log: [...c.log, { at: now(), text: `Claim ${num} sent to ${supplier.email}` }],
            }
          : c,
      ),
    }));
    return { claimNumber: num };
  };

  const markClaimCredited: AppContextValue["markClaimCredited"] = (claimId, creditMemo) =>
    setS((prev) => ({
      ...prev,
      claims: prev.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              status: "Credited",
              creditMemo,
              log: [...c.log, { at: now(), text: `Marked Credited — supplier credit memo ${creditMemo}` }],
            }
          : c,
      ),
    }));

  const reserve: AppContextValue["reserve"] = (recordId, itemId, customerId, qty, po) => {
    const rec = s.records.find((r) => r.id === recordId)!;
    const item = s.inventory.find((i) => i.id === itemId)!;
    const cust = s.customers.find((c) => c.id === customerId);
    const poKey = (po ?? "").trim();
    const line: SaleLine = {
      id: uid("line"),
      kind: "item",
      recordId,
      inventoryItemId: itemId,
      title: `${rec.artist} — ${rec.title}`,
      grade: item.grade,
      qty,
      price: item.price,
      discountPct: cust?.globalDiscountPct ?? 0,
      taxLineId: cust?.defaultTaxLineId ?? DEFAULT_TAX_LINE,
    };

    // Repeat holds for the same customer under the same PO merge onto one Held
    // Sale as extra lines, rather than piling up separate hold tickets for what
    // is really one pickup. A blank PO is still a shared key — it just means
    // "this customer's holds with no PO given" instead of a named one.
    const existing = s.sales.find(
      (x) => x.state === "Held" && x.customerId === customerId && (x.po ?? "").trim() === poKey,
    );

    if (existing) {
      const holdRef = existing.holdRef!;
      setS((prev) => ({
        ...prev,
        sales: prev.sales.map((x) =>
          x.id === existing.id
            ? {
                ...x,
                lines: [...x.lines, line],
                log: [
                  ...x.log,
                  {
                    at: now(),
                    text: `Added to hold ${holdRef} — ${qty} copy of ${rec.title} for ${cust?.name ?? "customer"}`,
                  },
                ],
              }
            : x,
        ),
        inventory: prev.inventory.map((i) =>
          i.id === itemId ? { ...i, status: "held", heldByCustomerId: customerId } : i,
        ),
      }));
      return { id: existing.id, holdRef };
    }

    const id = uid("sale");
    const ref = `H${s.nextHold}`;
    const sale: Sale = {
      id,
      state: "Held",
      holdRef: ref,
      po: poKey || undefined,
      customerId,
      createdBy: CURRENT_USER,
      createdAt: now(),
      lines: [line],
      tenders: [],
      log: [
        {
          at: now(),
          text: `Hold created from titlecard — ${qty} copy reserved for ${cust?.name ?? "customer"}${poKey ? ` (PO ${poKey})` : ""}`,
        },
      ],
    };
    setS((prev) => ({
      ...prev,
      nextHold: prev.nextHold + 1,
      sales: [sale, ...prev.sales],
      inventory: prev.inventory.map((i) =>
        i.id === itemId ? { ...i, status: "held", heldByCustomerId: customerId } : i,
      ),
    }));
    return { id, holdRef: ref };
  };

  const setCopyPrice: AppContextValue["setCopyPrice"] = (itemId, price) => {
    const item = s.inventory.find((i) => i.id === itemId);
    setS((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) => (i.id === itemId ? { ...i, price } : i)),
    }));
    if (item && price < item.cost) {
      const rec = s.records.find((r) => r.id === item.recordId);
      raiseReviewFlag(
        "below-cost",
        `Shelf price ${money(price)} below cost ${money(item.cost)} for ${rec ? `${rec.artist} — ${rec.title}` : item.recordId} (${item.internalBarcode}).`,
      );
    }
  };

  const routeReturnLine: AppContextValue["routeReturnLine"] = (
    saleId,
    lineId,
    itemId,
    to,
    grade,
    price,
  ) => {
    const note =
      to === "regrade"
        ? "Re-graded on return — own grade and price (E-06 step 6)"
        : to === "sellable"
          ? "Returned, back to sellable at original grade"
          : "Returned, written off via reason-coded adjustment (E-04)";
    setS((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        i.id === itemId
          ? {
              ...i,
              status: to === "writeoff" ? "sold" : "sellable",
              grade: to === "regrade" && grade ? grade : i.grade,
              price: to === "regrade" && price != null ? price : i.price,
              conditionNote: note,
            }
          : i,
      ),
      sales: prev.sales.map((sale) =>
        sale.id === saleId
          ? {
              ...sale,
              lines: sale.lines.map((l) =>
                l.id === lineId ? { ...l, stockRouted: true, routedTo: to } : l,
              ),
              log: [...sale.log, { at: now(), text: `Returned copy routed → ${to}` }],
            }
          : sale,
      ),
    }));
  };

  const toggleDiscogs = () => setS((prev) => ({ ...prev, discogsUp: !prev.discogsUp }));

  const invoiceFor = (id?: string) => s.invoices.find((iv) => iv.id === id);

  const startInvoice: AppContextValue["startInvoice"] = (input) => {
    const id = uid("inv");
    // No supplier paperwork to key off — auto-generate our own reference
    // rather than block opening the invoice on a number that doesn't exist.
    const invoiceNumber = input.invoiceNumber.trim() || `REF${String(s.nextInvoiceRef).padStart(4, "0")}`;
    const invoice: Invoice = {
      id,
      ...input,
      invoiceNumber,
      misc: 0,
      status: "Draft",
      lines: [],
      creditsApplied: [],
      createdBy: CURRENT_USER,
      createdAt: now(),
      log: [
        {
          at: now(),
          text: `Invoice opened — ${input.intakeMode} intake, invoice ${invoiceNumber}`,
        },
      ],
    };
    setS((prev) => ({
      ...prev,
      invoices: [invoice, ...prev.invoices],
      nextInvoiceRef: input.invoiceNumber.trim() ? prev.nextInvoiceRef : prev.nextInvoiceRef + 1,
    }));
    return id;
  };

  // Manual catalog entry (E-02 decision 24) — only the fields decision 24
  // actually names. Format/year/country are placeholders: an employee
  // filling this in has no barcode and no catalog match, so genuinely
  // doesn't know them yet; editable later from the titlecard (E-04).
  const createRecordManual: AppContextValue["createRecordManual"] = (input) => {
    const id = uid("rec");
    const rec: RecordEntry = {
      id,
      artist: input.artist,
      title: input.title,
      label: input.label,
      catalogNo: input.catalogNo,
      format: "—",
      year: new Date().getFullYear(),
      country: "—",
      genre: input.genre,
      section: input.section,
      art: "💿",
      minOnHand: 0,
    };
    setS((prev) => ({ ...prev, records: [...prev.records, rec] }));
    return id;
  };

  // M-01 — nothing here is gated. Any Employee can New/Edit/Copy a Supplier.
  const addSupplier: AppContextValue["addSupplier"] = (input) => {
    const id = uid("sup");
    const supplier: Supplier = { id, ...input, log: [{ at: now(), text: `Added by ${CURRENT_USER}` }] };
    setS((prev) => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
    return id;
  };

  const updateSupplier: AppContextValue["updateSupplier"] = (supplierId, patch) =>
    setS((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId
          ? { ...s, ...patch, log: [...s.log, { at: now(), text: `Edited by ${CURRENT_USER}` }] }
          : s,
      ),
    }));

  const copySupplier: AppContextValue["copySupplier"] = (supplierId) => {
    const src = s.suppliers.find((x) => x.id === supplierId);
    if (!src) return null;
    const id = uid("sup");
    const copy: Supplier = {
      ...src,
      id,
      name: `${src.name} (copy)`,
      defaultForSecondHand: false,
      log: [{ at: now(), text: `Copied from ${src.name} by ${CURRENT_USER}` }],
    };
    setS((prev) => ({ ...prev, suppliers: [...prev.suppliers, copy] }));
    return id;
  };

  // Delete/Merge are Admin-only by convention (no enforced gate in this
  // pass, same as every other "(Admin)"/"(Mgr)" label still awaiting real
  // auth). Merge reassigns every pointer to the surviving record rather than
  // rewriting history.
  const deleteSupplier: AppContextValue["deleteSupplier"] = (supplierId) =>
    setS((prev) => ({ ...prev, suppliers: prev.suppliers.filter((s) => s.id !== supplierId) }));

  const mergeSuppliers: AppContextValue["mergeSuppliers"] = (keepId, mergeId) => {
    const keep = s.suppliers.find((x) => x.id === keepId);
    const merge = s.suppliers.find((x) => x.id === mergeId);
    if (!keep || !merge || keepId === mergeId) return;
    setS((prev) => ({
      ...prev,
      suppliers: prev.suppliers
        .filter((x) => x.id !== mergeId)
        .map((x) =>
          x.id === keepId
            ? {
                ...x,
                defaultForSecondHand: x.defaultForSecondHand || merge.defaultForSecondHand,
                log: [...x.log, ...merge.log, { at: now(), text: `Merged with ${merge.name} by ${CURRENT_USER}` }],
              }
            : x,
        ),
      inventory: prev.inventory.map((i) => (i.supplierId === mergeId ? { ...i, supplierId: keepId } : i)),
      pendingOrders: prev.pendingOrders.map((p) => (p.supplierId === mergeId ? { ...p, supplierId: keepId } : p)),
      claims: prev.claims.map((c) => (c.supplierId === mergeId ? { ...c, supplierId: keepId } : c)),
      invoices: prev.invoices.map((iv) => (iv.supplierId === mergeId ? { ...iv, supplierId: keepId } : iv)),
      records: prev.records.map((r) =>
        r.preferredSupplierId === mergeId ? { ...r, preferredSupplierId: keepId } : r,
      ),
    }));
  };

  const setRecordPreferredSupplier: AppContextValue["setRecordPreferredSupplier"] = (recordId, supplierId) =>
    setS((prev) => ({
      ...prev,
      records: prev.records.map((r) => (r.id === recordId ? { ...r, preferredSupplierId: supplierId } : r)),
    }));

  const viewSupplier: AppContextValue["viewSupplier"] = (supplierId) =>
    setS((prev) => ({ ...prev, lastViewedSupplierId: supplierId }));

  // Only one Supplier carries the second-hand default at a time — setting it
  // on one clears it from every other (E-02 decision 27).
  const setDefaultForSecondHand: AppContextValue["setDefaultForSecondHand"] = (supplierId) =>
    setS((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId
          ? { ...s, defaultForSecondHand: true, log: [...s.log, { at: now(), text: `Marked default for second-hand by ${CURRENT_USER}` }] }
          : s.defaultForSecondHand
            ? { ...s, defaultForSecondHand: false, log: [...s.log, { at: now(), text: `Unmarked default for second-hand by ${CURRENT_USER}` }] }
            : s,
      ),
    }));

  // Shared by finalize (every line at once) and addInvoiceLine (one line, when
  // the Invoice is already Finalized — the "becomes sellable" moment already
  // happened for this Invoice, so a line added afterward mints immediately
  // rather than waiting for a Finalize that has already occurred).
  const mintItemsForLine = (
    line: { recordId: string; grade: Grade; acceptedPrice: number; cost: number; qty: number },
    supplier: Supplier,
    invoiceNumber: string,
    startSeq: number,
    // Oversold items claimed by an earlier line in the same batch (finalize
    // can carry several lines for the same Record) — skip them so two lines
    // don't both try to reconcile the one outstanding copy.
    alreadyClaimed: Set<string> = new Set(),
  ) => {
    // Received stock pays down any outstanding "oversold" promise for this
    // Record first (oldest first) before minting brand-new sellable copies
    // for whatever's left — that's how an oversold sale gets reconciled
    // without a manager having to do anything.
    const outstanding = s.inventory
      .filter((i) => i.recordId === line.recordId && i.oversold && !i.oversoldReconciledAt && !alreadyClaimed.has(i.id))
      .sort((a, b) => (a.oversoldAt ?? "").localeCompare(b.oversoldAt ?? ""));
    const reconciledIds = outstanding.slice(0, line.qty).map((i) => i.id);

    const items: InventoryItem[] = [];
    const itemIds: string[] = [];
    let seq = startSeq;
    const toMint = line.qty - reconciledIds.length;
    for (let i = 0; i < toMint; i++) {
      const itemId = uid("item");
      const code = `29${String(seq).padStart(10, "0")}`;
      seq++;
      itemIds.push(itemId);
      items.push({
        id: itemId,
        recordId: line.recordId,
        grade: line.grade,
        price: line.acceptedPrice,
        cost: line.cost,
        internalBarcode: code,
        status: "sellable",
        arrivedOnInvoice: `${supplier.shortName} ${invoiceNumber}`,
        supplierId: supplier.id,
      });
    }
    return { items, itemIds, nextSeq: seq, reconciledIds };
  };

  // Applies mintItemsForLine's reconciledIds to already-existing oversold
  // items — backfilling the real cost/supplier now that receiving has
  // caught up, same as if they'd been minted normally in the first place.
  const applyOversoldReconciliation = (
    inventory: InventoryItem[],
    reconciledIds: string[],
    cost: number,
    arrivedOnInvoice: string,
    supplierId: string,
  ): InventoryItem[] =>
    reconciledIds.length === 0
      ? inventory
      : inventory.map((i) =>
          reconciledIds.includes(i.id)
            ? {
                ...i,
                cost,
                arrivedOnInvoice,
                supplierId,
                oversoldReconciledAt: now(),
                oversoldReconciledBy: CURRENT_USER,
                oversoldReconciledVia: "received" as const,
              }
            : i,
        );

  // Manager-only "adjust on hand" (E-04) for when an outstanding oversold
  // copy can't be explained by an incoming shipment and needs to be forced
  // back to zero for the count's own sanity, rather than waiting on receiving.
  const reconcileOversold: AppContextValue["reconcileOversold"] = (recordId, by) => {
    const outstanding = s.inventory.filter((i) => i.recordId === recordId && i.oversold && !i.oversoldReconciledAt);
    if (outstanding.length === 0) return 0;
    const ids = outstanding.map((i) => i.id);
    setS((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        ids.includes(i.id)
          ? { ...i, oversoldReconciledAt: now(), oversoldReconciledBy: by, oversoldReconciledVia: "adjustment" as const }
          : i,
      ),
    }));
    return ids.length;
  };

  const addInvoiceLine: AppContextValue["addInvoiceLine"] = (invoiceId, line) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    if (!invoice || invoice.status === "Paid") return;
    const supplier = s.suppliers.find((sup) => sup.id === invoice.supplierId)!;
    const cost = round2(line.listPrice * (1 - line.discountPct / 100));
    let newLine: InvoiceLine = { id: uid("invline"), ...line, cost };

    let mintedItems: InventoryItem[] = [];
    let nextBarcodeSeq = s.nextInternalBarcode;
    let reconciledIds: string[] = [];
    if (invoice.status === "Finalized") {
      const minted = mintItemsForLine(newLine, supplier, invoice.invoiceNumber, nextBarcodeSeq);
      mintedItems = minted.items;
      nextBarcodeSeq = minted.nextSeq;
      reconciledIds = minted.reconciledIds;
      newLine = { ...newLine, itemIds: minted.itemIds };
    }

    setS((prev) => ({
      ...prev,
      // E-03 decision 6 — receiving a catalog-only Record pulls it into local
      // stock. E-02 decision 12 — New mode sets the sticky retail price.
      records: prev.records.map((r) =>
        r.id === line.recordId
          ? {
              ...r,
              catalogOnly: false,
              ...(invoice.intakeMode === "New" ? { stickyPrice: line.acceptedPrice } : {}),
            }
          : r,
      ),
      inventory: applyOversoldReconciliation(
        mintedItems.length ? [...prev.inventory, ...mintedItems] : prev.inventory,
        reconciledIds,
        newLine.cost,
        `${supplier.shortName} ${invoice.invoiceNumber}`,
        supplier.id,
      ),
      nextInternalBarcode: nextBarcodeSeq,
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId
          ? {
              ...iv,
              lines: [...iv.lines, newLine],
              log: [
                ...iv.log,
                {
                  at: now(),
                  text:
                    `Line added — qty ${line.qty} at ${money(line.acceptedPrice)}` +
                    (mintedItems.length ? " (Invoice already Finalized — minted immediately)" : "") +
                    (reconciledIds.length
                      ? ` (${reconciledIds.length} reconciled an outstanding oversold sale)`
                      : ""),
                },
              ],
            }
          : iv,
      ),
    }));

    if (line.acceptedPrice < cost) {
      const rec = s.records.find((r) => r.id === line.recordId);
      raiseReviewFlag(
        "below-cost",
        `Accepted ${money(line.acceptedPrice)} below cost ${money(cost)} for ${rec ? `${rec.artist} — ${rec.title}` : line.recordId}.`,
      );
    }
  };

  const updateInvoiceLine: AppContextValue["updateInvoiceLine"] = (invoiceId, lineId, patch) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    const existing = invoice?.lines.find((l) => l.id === lineId);
    if (!invoice || invoice.status === "Paid" || !existing) return;
    const merged = { ...existing, ...patch };
    const newCost = round2(merged.listPrice * (1 - merged.discountPct / 100));
    const updatedLine: InvoiceLine = { ...merged, cost: newCost };

    setS((prev) => ({
      ...prev,
      // Correcting a line propagates to any InventoryItems already minted for
      // it — "fix costs to be correct" means the real stock record too, not
      // just the Invoice's own memory of itself.
      inventory: prev.inventory.map((i) =>
        existing.itemIds?.includes(i.id)
          ? { ...i, cost: newCost, price: updatedLine.acceptedPrice, grade: updatedLine.grade }
          : i,
      ),
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId
          ? {
              ...iv,
              lines: iv.lines.map((l) => (l.id === lineId ? updatedLine : l)),
              log: [...iv.log, { at: now(), text: "Line edited" }],
            }
          : iv,
      ),
    }));

    if (updatedLine.acceptedPrice < newCost) {
      const rec = s.records.find((r) => r.id === existing.recordId);
      raiseReviewFlag(
        "below-cost",
        `Corrected to ${money(updatedLine.acceptedPrice)} below cost ${money(newCost)} for ${rec ? `${rec.artist} — ${rec.title}` : existing.recordId}.`,
      );
    }
  };

  const removeInvoiceLine: AppContextValue["removeInvoiceLine"] = (invoiceId, lineId) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    const line = invoice?.lines.find((l) => l.id === lineId);
    if (!invoice || invoice.status === "Paid" || !line) return { blocked: true };
    const itemIds = line.itemIds ?? [];
    const anySold = itemIds.some((id) => s.inventory.find((i) => i.id === id)?.status === "sold");
    if (anySold) return { blocked: true };

    setS((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((i) => !itemIds.includes(i.id)),
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId
          ? {
              ...iv,
              lines: iv.lines.filter((l) => l.id !== lineId),
              log: [
                ...iv.log,
                {
                  at: now(),
                  text: itemIds.length
                    ? "Line removed — its copies withdrawn from stock"
                    : "Line removed before finalizing",
                },
              ],
            }
          : iv,
      ),
    }));
    return { blocked: false };
  };

  const updateInvoiceTotals: AppContextValue["updateInvoiceTotals"] = (invoiceId, patch) =>
    setS((prev) => ({
      ...prev,
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId && iv.status !== "Paid" ? { ...iv, ...patch } : iv,
      ),
    }));

  const setInvoiceTotalOverride: AppContextValue["setInvoiceTotalOverride"] = (invoiceId, value) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    if (!invoice || invoice.status === "Paid") return;
    setS((prev) => ({
      ...prev,
      invoices: prev.invoices.map((iv) => (iv.id === invoiceId ? { ...iv, totalOverride: value } : iv)),
    }));
    if (value == null) return;
    const derivedSubtotal = round2(invoice.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
    const computedTotal = round2(derivedSubtotal + invoice.tax + invoice.freight + invoice.misc);
    const delta = round2(value - computedTotal);
    const pct = computedTotal !== 0 ? Math.abs(delta) / computedTotal : Math.abs(delta) > 0 ? 1 : 0;
    if (Math.abs(delta) > 0.005 && pct > 0.02) {
      const supplier = s.suppliers.find((sup) => sup.id === invoice.supplierId);
      raiseReviewFlag(
        "total-adjustment",
        `${supplier?.shortName ?? ""} ${invoice.invoiceNumber} total adjusted ${money(delta)} (${(pct * 100).toFixed(1)}%) beyond ±2%.`,
      );
    }
  };

  // On finalize: every line's qty becomes that many sellable InventoryItems
  // (E-02 decision 20 — not sellable before this), each minted its own
  // internal barcode and traced back to this Invoice/Supplier so a Supplier
  // Claim can be raised against it later. Finalizing does NOT lock the
  // Invoice — only markInvoicePaid does (the paperwork isn't "official"
  // until the store has settled it); this just makes the stock real.
  const finalizeInvoice: AppContextValue["finalizeInvoice"] = (invoiceId) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    if (!invoice || invoice.status !== "Draft" || invoice.lines.length === 0) return null;
    const supplier = s.suppliers.find((sup) => sup.id === invoice.supplierId)!;
    const allNewItems: InventoryItem[] = [];
    const allReconciledIds: string[] = [];
    let reconciledInventory: InventoryItem[] | null = null;
    let barcodeSeq = s.nextInternalBarcode;
    const updatedLines = invoice.lines.map((line) => {
      const { items, itemIds, nextSeq, reconciledIds } = mintItemsForLine(
        line,
        supplier,
        invoice.invoiceNumber,
        barcodeSeq,
        new Set(allReconciledIds),
      );
      barcodeSeq = nextSeq;
      allNewItems.push(...items);
      allReconciledIds.push(...reconciledIds);
      // Each line reconciles with its own cost — an invoice with several
      // lines for different Records must not blend their costs together.
      reconciledInventory = applyOversoldReconciliation(
        reconciledInventory ?? s.inventory,
        reconciledIds,
        line.cost,
        `${supplier.shortName} ${invoice.invoiceNumber}`,
        supplier.id,
      );
      return { ...line, itemIds };
    });

    const derivedSubtotal = round2(invoice.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
    const mismatch = Math.abs(derivedSubtotal - invoice.statedSubtotal) > 0.01;

    setS((prev) => ({
      ...prev,
      nextInternalBarcode: barcodeSeq,
      inventory: [...(reconciledInventory ?? prev.inventory), ...allNewItems],
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId
          ? {
              ...iv,
              status: "Finalized",
              lines: updatedLines,
              finalizedAt: now(),
              log: [
                ...iv.log,
                {
                  at: now(),
                  text:
                    `Finalized — ${allNewItems.length} cop${allNewItems.length === 1 ? "y" : "ies"} now sellable` +
                    (allReconciledIds.length
                      ? `, ${allReconciledIds.length} reconciled an outstanding oversold sale`
                      : ""),
                },
              ],
            }
          : iv,
      ),
    }));

    if (mismatch) {
      raiseReviewFlag(
        "discrepancy-accepted",
        `${supplier.shortName} ${invoice.invoiceNumber} — derived subtotal ${money(derivedSubtotal)} vs. stated ${money(invoice.statedSubtotal)}.`,
      );
    }

    return { itemCount: allNewItems.length };
  };

  // Only this locks an Invoice (decision — finalize alone no longer does).
  // Manager-only, per M-05: Accounts Payable settling the balance is what
  // makes the paperwork official.
  const markInvoicePaid: AppContextValue["markInvoicePaid"] = (invoiceId, by) =>
    setS((prev) => ({
      ...prev,
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId
          ? {
              ...iv,
              status: "Paid",
              paidAt: now(),
              paidBy: by,
              log: [...iv.log, { at: now(), text: `Marked paid by ${by} — now immutable` }],
            }
          : iv,
      ),
    }));

  // M-05 — one PaymentBatch per Record-Payment action, whatever mix of
  // Invoices and PayableEntries it covers, sharing one method/reference/date
  // (the open question on payment batches, resolved this way rather than
  // scattering separate records that merely share a reference). Browsed as
  // one row per batch (AccountsPayable's Payment history), opened to see its
  // targets. An Invoice whose balance is settled (by this payment, together
  // with any credit already applied) flips to Paid, the same transition
  // markInvoicePaid makes — settling the balance is what locks it.
  const recordPayment: AppContextValue["recordPayment"] = (targets, input, by) =>
    setS((prev) => {
      const batchTargets: PaymentTarget[] = targets
        .map((t) => ({ kind: t.kind, id: t.id, amount: round2(input.amounts[t.id] ?? 0) }))
        .filter((t) => t.amount > 0);
      if (batchTargets.length === 0) return prev;

      const at = now();
      const batch: PaymentBatch = {
        id: uid("batch"),
        supplierId: input.supplierId,
        method: input.method,
        reference: input.reference,
        date: input.date,
        recordedBy: by,
        createdAt: at,
        targets: batchTargets,
      };
      const paymentBatches = [batch, ...prev.paymentBatches];
      const amountFor = (kind: PayableTargetKind, id: string) =>
        batchTargets.find((t) => t.kind === kind && t.id === id)?.amount ?? 0;

      const invoices = prev.invoices.map((iv) => {
        const amount = amountFor("invoice", iv.id);
        if (amount <= 0) return iv;
        const updated: Invoice = {
          ...iv,
          log: [
            ...iv.log,
            { at, text: `Payment recorded — ${input.method} ${input.reference} ${money(amount)} by ${by}` },
          ],
        };
        if (invoiceBalance(updated, paymentBatches) <= 0.005 && updated.status !== "Paid") {
          return { ...updated, status: "Paid" as const, paidAt: at, paidBy: by, log: [...updated.log, { at, text: `Balance settled — marked paid by ${by}` }] };
        }
        return updated;
      });

      const payableEntries = prev.payableEntries.map((e) => {
        const amount = amountFor("entry", e.id);
        if (amount <= 0) return e;
        return {
          ...e,
          log: [
            ...e.log,
            { at, text: `Payment recorded — ${input.method} ${input.reference} ${money(amount)} by ${by}` },
          ],
        };
      });

      return { ...prev, paymentBatches, invoices, payableEntries };
    });

  // M-05 decision 11 — a Credited claim's amount isn't earmarked to one
  // Invoice the Manager picks. It nets against the Supplier's whole balance:
  // distributed across their outstanding Invoices oldest-received-first,
  // each one absorbing as much as its own balance can take, with any
  // remainder (credit bigger than everything currently owed) dumped on the
  // last one touched — the same forgiving handling an overpaying credit note
  // gets in Record payment. Returns null if there's nothing outstanding for
  // this Supplier to apply it against at all.
  const applyClaimCredit: AppContextValue["applyClaimCredit"] = (claimId, by) => {
    const claim = s.claims.find((c) => c.id === claimId);
    if (!claim || claim.status !== "Credited" || claim.applied) return null;
    const hasOutstanding = s.invoices.some((iv) => iv.supplierId === claim.supplierId && iv.status === "Finalized");
    if (!hasOutstanding) return null;
    const amount = claimTotal(claim);

    // Everything below is computed fresh from `prev` on every call — no
    // variable captured from outside this updater is mutated by it — so a
    // React 18 StrictMode double-invoke (or any re-run with the same `prev`)
    // recomputes the identical result instead of silently double-applying.
    setS((prev) => {
      const outstanding = prev.invoices
        .filter((iv) => iv.supplierId === claim.supplierId && iv.status === "Finalized")
        .sort((a, b) => (a.receivedDate || a.invoiceDate).localeCompare(b.receivedDate || b.invoiceDate));
      if (outstanding.length === 0) return prev;

      const at = now();
      let remaining = amount;
      const touchedIds = new Set<string>();
      const byId = new Map(prev.invoices.map((iv) => [iv.id, iv]));

      for (const iv of outstanding) {
        if (remaining <= 0.005) break;
        const current = byId.get(iv.id)!;
        const balance = invoiceBalance(current, prev.paymentBatches);
        if (balance <= 0.005) continue;
        const portion = round2(Math.min(remaining, balance));
        remaining = round2(remaining - portion);
        touchedIds.add(iv.id);
        byId.set(iv.id, {
          ...current,
          creditsApplied: [...current.creditsApplied, { id: uid("credit"), claimId, amount: portion, appliedAt: at, appliedBy: by }],
          log: [...current.log, { at, text: `Claim ${claim.claimNumber ?? "—"} credit ${money(portion)} applied by ${by}` }],
        });
      }
      // Credit bigger than everything currently outstanding — the last
      // Invoice touched (or the last one in line, if none had any balance
      // left) absorbs the rest and goes negative, rather than losing it.
      if (remaining > 0.005) {
        const last = outstanding[outstanding.length - 1];
        const current = byId.get(last.id)!;
        touchedIds.add(last.id);
        byId.set(last.id, {
          ...current,
          creditsApplied: [...current.creditsApplied, { id: uid("credit"), claimId, amount: remaining, appliedAt: at, appliedBy: by }],
          log: [
            ...current.log,
            { at, text: `Claim ${claim.claimNumber ?? "—"} credit ${money(remaining)} applied by ${by} (exceeds what's currently owed)` },
          ],
        });
      }

      const invoices = prev.invoices.map((iv) => {
        if (!touchedIds.has(iv.id)) return iv;
        const updated = byId.get(iv.id)!;
        if (invoiceBalance(updated, prev.paymentBatches) <= 0.005 && updated.status !== "Paid") {
          return {
            ...updated,
            status: "Paid" as const,
            paidAt: at,
            paidBy: by,
            log: [...updated.log, { at, text: `Balance settled — marked paid by ${by}` }],
          };
        }
        return updated;
      });

      return {
        ...prev,
        invoices,
        claims: prev.claims.map((c) =>
          c.id === claimId
            ? {
                ...c,
                applied: true,
                appliedAt: at,
                appliedBy: by,
                log: [
                  ...c.log,
                  {
                    at,
                    text: `${money(amount)} credit applied against ${touchedIds.size} Invoice${touchedIds.size === 1 ? "" : "s"} by ${by}`,
                  },
                ],
              }
            : c,
        ),
      };
    });
    return { applied: true };
  };

  const payableEntryFor = (id?: string) => s.payableEntries.find((e) => e.id === id);

  // M-05 "Create new" — a manual ledger line, not sourced from Receiving or
  // Supplier Claims and not tied to any InventoryItem. Defaults to
  // Consignment instead of Invoice when the Supplier carries that flag, the
  // same default Receiving's own intake would apply.
  const addPayableEntry: AppContextValue["addPayableEntry"] = (input) => {
    const supplier = s.suppliers.find((sup) => sup.id === input.supplierId);
    const type: PayableEntryType = input.type === "Invoice" && supplier?.consignment ? "Consignment" : input.type;
    const id = uid("entry");
    const entry: PayableEntry = {
      id,
      supplierId: input.supplierId,
      type,
      reference: input.reference,
      date: input.date,
      subtotal: input.subtotal,
      tax: input.tax,
      freight: input.freight,
      misc: input.misc,
      adjustmentDirection: type === "Adjustment" ? input.adjustmentDirection ?? "increase" : undefined,
      createdBy: CURRENT_USER,
      createdAt: now(),
      log: [{ at: now(), text: `${type} entered — ${input.reference || "no reference given"}` }],
    };
    setS((prev) => ({ ...prev, payableEntries: [entry, ...prev.payableEntries] }));
    return id;
  };

  // Manual reconciliation only (never automatic): a Manager picks a set of
  // entries whose signed amounts sum to zero — a placeholder Claim matched
  // against the Credit that eventually replaced it, say — and clears them
  // against each other. Nothing is deleted or edited beyond the clearing
  // fields; both stay in the ledger as the record of what happened.
  const clearPayableEntries: AppContextValue["clearPayableEntries"] = (entryIds, by) => {
    const entries = entryIds.map((id) => s.payableEntries.find((e) => e.id === id)).filter((e): e is PayableEntry => !!e);
    if (entries.length < 2 || entries.length !== entryIds.length) return { cleared: false };
    if (entries.some((e) => e.clearedAt)) return { cleared: false };
    if (new Set(entries.map((e) => e.supplierId)).size > 1) return { cleared: false };
    const net = round2(entries.reduce((sum, e) => sum + payableEntrySignedAmount(e), 0));
    if (Math.abs(net) > 0.005) return { cleared: false };

    const at = now();
    setS((prev) => ({
      ...prev,
      payableEntries: prev.payableEntries.map((e) =>
        entryIds.includes(e.id)
          ? {
              ...e,
              clearedWith: entryIds.filter((id) => id !== e.id),
              clearedAt: at,
              clearedBy: by,
              log: [...e.log, { at, text: `Cleared against ${entryIds.length - 1} other entr${entryIds.length - 1 === 1 ? "y" : "ies"} by ${by} — net ${money(net)}` }],
            }
          : e,
      ),
    }));
    return { cleared: true };
  };

  const pendingOrderFor = (id?: string) => s.pendingOrders.find((o) => o.id === id);

  // Clicking an order in Receiving's Orders panel "moves" it into the current
  // invoice's lines — here that just means it stops being pending. The Invoice
  // side (adding the actual InvoiceLine) is the caller's job, since it needs
  // the invoiceId this function doesn't have.
  const receivePendingOrderLine: AppContextValue["receivePendingOrderLine"] = (id) => {
    const order = s.pendingOrders.find((o) => o.id === id);
    if (!order) return null;
    setS((prev) => ({ ...prev, pendingOrders: prev.pendingOrders.filter((o) => o.id !== id) }));
    return order;
  };

  const raisePendingOrderLine: AppContextValue["raisePendingOrderLine"] = (input) => {
    const id = uid("po-line");
    const line: PendingOrderLine = {
      id,
      supplierId: input.supplierId,
      separator: input.separator,
      recordId: input.recordId,
      qty: input.qty,
      sellPrice: input.sellPrice,
      customerId: input.customerId,
      followUpDays: input.followUpDays,
      createdBy: CURRENT_USER,
      createdAt: now(),
    };
    setS((prev) => ({ ...prev, pendingOrders: [...prev.pendingOrders, line] }));
    return id;
  };

  const updatePendingOrderLine: AppContextValue["updatePendingOrderLine"] = (id, patch) =>
    setS((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.map((o) => (o.id === id && !o.poNumber ? { ...o, ...patch } : o)),
    }));

  const deletePendingOrderLine: AppContextValue["deletePendingOrderLine"] = (id) => {
    const line = s.pendingOrders.find((o) => o.id === id && !o.poNumber);
    if (!line) return null;
    setS((prev) => ({ ...prev, pendingOrders: prev.pendingOrders.filter((o) => o.id !== id) }));
    return { customerAttached: !!line.customerId, recordId: line.recordId };
  };

  const reflagPendingOrderLine: AppContextValue["reflagPendingOrderLine"] = (id, days) =>
    setS((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.map((o) =>
        o.id === id ? { ...o, followUpDays: days, followUpSetAt: now() } : o,
      ),
    }));

  const retargetStreamSeparator: AppContextValue["retargetStreamSeparator"] = (supplierId, fromSeparator, toSeparator) => {
    const fromKey = fromSeparator ?? "";
    const ids = new Set(
      s.pendingOrders.filter((o) => o.supplierId === supplierId && !o.poNumber && (o.separator ?? "") === fromKey).map((o) => o.id),
    );
    if (ids.size === 0) return null;
    setS((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.map((o) => (ids.has(o.id) ? { ...o, separator: toSeparator } : o)),
    }));
    return { movedCount: ids.size };
  };

  const poNumberTaken: AppContextValue["poNumberTaken"] = (poNumber) =>
    s.pendingOrders.some((o) => o.poNumber === poNumber);

  const processOrderStream: AppContextValue["processOrderStream"] = (supplierId, separator, poNumber) => {
    const supplier = s.suppliers.find((sup) => sup.id === supplierId);
    if (!supplier) return null;
    const sep = separator || undefined;
    const lines = s.pendingOrders.filter((o) => o.supplierId === supplierId && (o.separator || undefined) === sep && !o.poNumber);
    if (lines.length === 0) return null;

    const used = new Set(s.pendingOrders.map((o) => o.poNumber).filter((n): n is string => !!n));
    let num = poNumber?.trim();
    if (num) {
      if (used.has(num)) return null; // caller should already have checked via poNumberTaken
    } else {
      let n = s.nextPoNumber;
      while (used.has(String(n))) n++;
      num = String(n);
    }

    const at = now();
    const lineIds = new Set(lines.map((l) => l.id));
    const unitCount = lines.reduce((sum, l) => sum + l.qty, 0);
    const sellTotal = lines.reduce((sum, l) => sum + l.sellPrice * l.qty, 0);
    const cancelBy = supplier.cancelByDays
      ? new Date(Date.now() + supplier.cancelByDays * 86400000).toLocaleDateString("en-CA")
      : undefined;
    const emailed = supplier.orderVia === "Email";
    const streamLabel = sep ? `separator ${sep}` : "no separator";
    const logText = emailed
      ? `PO ${num} emailed to ${supplier.email} (${streamLabel}) — ${lines.length} line${lines.length === 1 ? "" : "s"}, ${unitCount} units, sell ${money(sellTotal)}` +
        (cancelBy ? `, cancel by ${cancelBy}` : "") +
        `, backorders ${supplier.backordersAllowed ? "allowed" : "not allowed"}.`
      : `PO ${num} placed via ${supplier.orderVia} (${streamLabel}) — ${lines.length} line${lines.length === 1 ? "" : "s"}, ${unitCount} units, sell ${money(sellTotal)}. Printable order document produced; this does not confirm the supplier received it.`;

    setS((prev) => ({
      ...prev,
      nextPoNumber: /^\d+$/.test(num!) ? Math.max(prev.nextPoNumber, Number(num) + 1) : prev.nextPoNumber,
      pendingOrders: prev.pendingOrders.map((o) => (lineIds.has(o.id) ? { ...o, poNumber: num, placedAt: at } : o)),
      suppliers: prev.suppliers.map((sup) => (sup.id === supplierId ? { ...sup, log: [...sup.log, { at, text: logText }] } : sup)),
    }));

    return { poNumber: num!, lineCount: lines.length, unitCount, emailed };
  };

  const value = useMemo<AppContextValue>(
    () => ({
      ...s,
      activeSale: s.sales.find((x) => x.id === s.activeSaleId) ?? null,
      recordFor,
      customerFor,
      itemFor,
      supplierFor,
      newSale,
      setActiveSale,
      setSalePo,
      editSale,
      copySale,
      viewSubtotal,
      totalTodaysSales,
      undoEndOfDay,
      attachCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      viewCustomer,
      addItemLine,
      addNegInventoryLine,
      addNonTrackedLine,
      addGiftCardLoadLine,
      addReturnLine,
      updateLine,
      removeLine,
      addTender,
      removeTender,
      completeSale,
      holdSale,
      voidSale,
      cancelHold,
      releaseHoldLine,
      forceUnlockSale,
      acknowledgeReviewFlag,
      reconcileOversold,
      addLog,
      raiseClaim,
      sendClaim,
      markClaimCredited,
      reserve,
      setCopyPrice,
      routeReturnLine,
      toggleDiscogs,
      invoiceFor,
      startInvoice,
      createRecordManual,
      addSupplier,
      updateSupplier,
      copySupplier,
      deleteSupplier,
      mergeSuppliers,
      setDefaultForSecondHand,
      setRecordPreferredSupplier,
      viewSupplier,
      addInvoiceLine,
      updateInvoiceLine,
      removeInvoiceLine,
      updateInvoiceTotals,
      setInvoiceTotalOverride,
      finalizeInvoice,
      markInvoicePaid,
      recordPayment,
      applyClaimCredit,
      payableEntryFor,
      addPayableEntry,
      clearPayableEntries,
      pendingOrderFor,
      receivePendingOrderLine,
      raisePendingOrderLine,
      updatePendingOrderLine,
      deletePendingOrderLine,
      reflagPendingOrderLine,
      retargetStreamSeparator,
      poNumberTaken,
      processOrderStream,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppStoreProvider");
  return v;
}
