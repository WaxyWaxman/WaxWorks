import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { computeDayBreakdown, type DayBreakdown } from "../lib/dayBreakdown";
import { invoiceForItem, supplierIdForItem } from "../lib/provenance";
import { money } from "../lib/money";
import { parseCell } from "../lib/tax";
import { lineTaxComponents, type TaxContext } from "../lib/totals";
import * as usersLib from "../lib/users";
import {
  customerBalanceDelta,
  invoiceIsPaid,
  payableEntrySignedAmount,
  payableEntryTotal,
  round2,
  tenderedTotal,
} from "../lib/totals";
import {
  CURRENT_USER,
  CUSTOMERS,
  GIFT_CARD_GENRE_ID,
  GIFT_CARDS,
  INVENTORY,
  MANAGER_NAME,
  NON_TRACKED,
  PENDING_ORDERS,
  RECORDS,
  SUPPLIERS,
  TAX_LINES,
  USERS,
  SECTIONS,
  TENDERS,
  CURRENCIES,
  HOME_CURRENCY,
  STORE_SETTINGS,
  STORE_DETAILS,
  TAX_TYPES,
  PRODUCT_TAX_CODES,
  TAX_GROUPS,
  TAX_GROUP_CELLS,
  GENRES,
  DEFAULT_TAX_GROUP,
} from "../data/seed";
import type {
  ClaimLineAgainst,
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
  PaymentBatchVoid,
  PaymentMethod,
  PaymentTarget,
  OrderLineStatus,
  PendingOrderLine,
  RecordEntry,
  ReviewFlag,
  ReviewFlagKind,
  Sale,
  SaleLine,
  Supplier,
  User,
  UserRole,
  SectionRow,
  TenderRow,
  CurrencyRow,
  StoreSettings,
  StoreDetails,
  SettingsLogEntry,
  PostalAddress,
  TaxType,
  ProductTaxCode,
  TaxGroup,
  TaxGroupCell,
  Genre,
  ClaimVoid,
  SupplierClaim,
  TaxLine,
  Tender,
  AbandonReason,
  VoidReason,
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
    // The rule itself lives in lib/totals so E-07's account track can list the
    // movements it produced without keeping a second copy of it.
    const delta = customerBalanceDelta(tender);
    cs = cs.map((c) => (c.id === customerId ? { ...c, balance: round2(c.balance + sign * delta) } : c));
  }
  return { giftCards: gc, customers: cs };
}

// en-CA formats as "YYYY-MM-DD, HH:MM:SS" (with a comma) — every parse site
// (daysAgo, the follow-up-flag math, PointOfSale's age calc) assumes the
// plain space-separated form seed data uses, so strip the comma here rather
// than patch every `.replace(" ", "T")` call site.
const now = () => new Date().toLocaleString("en-CA", { hour12: false }).replace(",", "");

// E-02 d39 — `SH-YYMMDD-n` for a second-hand intake with no supplier
// paperwork. Accepts the received date in either the ISO form the seed uses
// or DD/MM/YYYY as typed at the desk; anything unparseable falls back to
// today, because a reference that exists beats a blank one.
function mintSecondHandRef(receivedDate: string, invoices: Invoice[]): string {
  const raw = (receivedDate ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  let y: string, m: string, d: string;
  if (iso) [, y, m, d] = iso;
  else if (dmy) [, d, m, y] = dmy;
  else {
    const t = new Date();
    y = String(t.getFullYear());
    m = String(t.getMonth() + 1).padStart(2, "0");
    d = String(t.getDate()).padStart(2, "0");
  }
  const stem = `SH-${y.slice(2)}${m}${d}`;
  // Sequence against what already exists for that day rather than a counter,
  // so the number cannot drift from the references actually on file.
  const taken = invoices.filter((iv) => iv.invoiceNumber.startsWith(stem + "-")).length;
  return `${stem}-${taken + 1}`;
}


interface AppState {
  records: RecordEntry[];
  inventory: InventoryItem[];
  customers: Customer[];
  users: User[];
  sections: SectionRow[];
  tenders: TenderRow[];
  currencies: CurrencyRow[];
  homeCurrency: string;
  storeSettings: StoreSettings;
  storeDetails: StoreDetails;
  settingsLog: SettingsLogEntry[];
  taxTypes: TaxType[];
  productTaxCodes: ProductTaxCode[];
  taxGroups: TaxGroup[];
  taxGroupCells: TaxGroupCell[];
  genres: Genre[];
  defaultTaxGroup: string;
  // E-01. The session is CLIENT state and can be nothing else (A-3, A-50):
  // what the database trusts is the terminal's enrollment, initials are
  // attribution on top. Modelled here for the same reason.
  sessionUserId: string | null;
  sessionLastActivity: number;
  // Store setting, default 300s (M-06 d45, A-50), and NO maximum (E-01 d13).
  sessionLapseSeconds: number;
  suppliers: Supplier[];
  giftCards: GiftCard[];
  taxLines: TaxLine[];
  nonTracked: NonTrackedItem[];
  sales: Sale[];
  closeBatches: CloseBatch[]; // M-03 — Total Today's Sales / Undo End of Day
  claims: SupplierClaim[];
  // E-04 d27, architecture A-44 — a void is a row, never a column, so it
  // lives apart from the claim it retires rather than as a field on it.
  claimVoids: ClaimVoid[];
  invoices: Invoice[];
  payableEntries: PayableEntry[]; // M-05 — manual ledger entries: Invoice/Claim/Credit/Adjustment/Consignment, not sourced from Receiving or Supplier Claims
  paymentBatches: PaymentBatch[]; // M-05 d16 — one row per settlement, across Invoices, entries and credits
  batchVoids: PaymentBatchVoid[]; // M-05 d22 / A-33a — a void is an appended artifact, never a column on the batch
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
  users: USERS,
  sections: SECTIONS,
  tenders: TENDERS,
  currencies: CURRENCIES,
  homeCurrency: HOME_CURRENCY,
  storeSettings: STORE_SETTINGS,
  storeDetails: STORE_DETAILS,
  settingsLog: [],
  taxTypes: TAX_TYPES,
  productTaxCodes: PRODUCT_TAX_CODES,
  taxGroups: TAX_GROUPS,
  taxGroupCells: TAX_GROUP_CELLS,
  genres: GENRES,
  defaultTaxGroup: DEFAULT_TAX_GROUP,
  sessionUserId: null,
  sessionLastActivity: Date.now(),
  sessionLapseSeconds: 300,
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
          productTaxCode: "1",
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
          productTaxCode: "1",
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
          productTaxCode: "1",
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
          productTaxCode: "1",
        },
      ],
    },
  ],
  closeBatches: [],
  // Seeded Finalized so Accounts Payable (M-05) has real outstanding balances
  // without first walking a Receiving session — lines mirror the InventoryItems
  // INVENTORY already seeds as "arrived on" these same invoice numbers.
  claims: [
    // E-04 d22 — two STANDING batches for the same supplier, kept apart by
    // the separator chosen as each line was raised. Neither has a sent date,
    // which is the whole of what "unsent" means (d25).
    {
      id: "claim-fab-base",
      supplierId: "sup-fab",
      status: "Pending",
      lines: [
        {
          id: "cl-fab-base-1",
          recordId: "r-purple",
          against: { kind: "invoice", invoiceId: "inv-seed-fab" },
          reason: "Received damaged",
          note: "Seam split on both copies",
          cost: 11,
          qty: 2,
        },
      ],
      createdBy: CURRENT_USER,
      createdAt: "2026-09-11 10:20:00",
      log: [{ at: "2026-09-11 10:20:00", text: "Claim opened — Received damaged (qty 2)" }],
    },
    {
      id: "claim-fab-weekly",
      supplierId: "sup-fab",
      separator: "W",
      status: "Pending",
      lines: [
        {
          id: "cl-fab-weekly-1",
          recordId: "r-illmatic",
          against: { kind: "invoice", invoiceId: "inv-seed-fab" },
          reason: "Billed / not shipped",
          note: "Billed 1, none in the carton",
          cost: 12,
          qty: 1,
        },
        {
          // E-04 d28's other shape: deliberately not about a shipment. Not a
          // blank someone forgot, and not E-02 d1's REF#### case either —
          // that is an Invoice whose supplier gave no number, which is a
          // different thing entirely.
          id: "cl-fab-weekly-2",
          recordId: "r-tote",
          against: { kind: "none" },
          reason: "Short shipped",
          note: "Promo tote bundle they invoice separately and never sent paperwork for",
          cost: 4.5,
          qty: 2,
        },
      ],
      createdBy: MANAGER_NAME,
      createdAt: "2026-09-12 14:05:00",
      log: [{ at: "2026-09-12 14:05:00", text: "Claim opened — Billed / not shipped (qty 1)" }],
    },

    // Sent and unanswered. d23's days-waiting figure is what makes this row
    // ask a question rather than just sit there.
    {
      id: "claim-fab-41",
      claimNumber: 41,
      supplierId: "sup-fab",
      status: "Pending",
      sentAt: "2026-07-28 09:40:00",
      lines: [
        {
          id: "cl-41-1",
          recordId: "r-rumours",
          against: { kind: "invoice", invoiceId: "inv-seed-fab" },
          reason: "Short shipped",
          cost: 14.4,
          qty: 1,
        },
        {
          id: "cl-41-2",
          recordId: "r-blue",
          against: { kind: "invoice", invoiceId: "inv-seed-fab" },
          reason: "Received damaged",
          cost: 10,
          qty: 1,
        },
      ],
      createdBy: MANAGER_NAME,
      createdAt: "2026-07-27 16:00:00",
      log: [
        { at: "2026-07-27 16:00:00", text: "Claim opened — Short shipped (qty 1)" },
        { at: "2026-07-28 09:40:00", text: "Claim 41 sent to claims@fabdist.example" },
      ],
    },

    // E-04 d20 — claimed 12.40, the memo granted 10.90. The gap is a real
    // cost the store absorbed and both figures are kept.
    {
      id: "claim-seed-1",
      claimNumber: 9,
      supplierId: "sup-fab",
      status: "Credited",
      sentAt: "2026-09-02 09:15:00",
      creditMemo: "CM-2201",
      creditedAmount: 10.9,
      lines: [
        {
          id: "cl-seed-1",
          recordId: "r-blue",
          itemId: "i-blue-1",
          against: { kind: "invoice", invoiceId: "inv-seed-fab" },
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
        { at: "2026-09-03 11:30:00", text: "Marked Credited — supplier credit memo CM-2201 granting 10.90" },
      ],
    },

    // d24 — the claim was right and no money came.
    {
      id: "claim-indie-40",
      claimNumber: 40,
      supplierId: "sup-indie",
      status: "Abandoned",
      sentAt: "2026-06-15 11:00:00",
      abandonment: {
        reason: "Declined by supplier",
        note: "They say the carton was sealed at their end. Not worth the argument over $21.",
        at: "2026-08-03 15:20:00",
        by: MANAGER_NAME,
      },
      lines: [
        {
          id: "cl-40-1",
          recordId: "r-illmatic",
          against: { kind: "invoice", invoiceId: "inv-seed-indie" },
          reason: "Short shipped",
          cost: 21,
          qty: 1,
        },
      ],
      createdBy: CURRENT_USER,
      createdAt: "2026-06-14 09:00:00",
      log: [
        { at: "2026-06-14 09:00:00", text: "Claim opened — Short shipped (qty 1)" },
        { at: "2026-06-15 11:00:00", text: "Claim 40 sent to orders@indiedirect.example" },
        { at: "2026-08-03 15:20:00", text: "Abandoned — Declined by supplier · They say the carton was sealed at their end." },
      ],
    },

    // d27 — the claim itself was wrong. Number 36 is retired with it (d26).
    {
      // d29 — sent as 36, voided, and back in its unsent batch ready to be
      // corrected. The number is spent; sending again will take a new one.
      id: "claim-crate-36",
      supplierId: "sup-crate",
      status: "Pending",
      lines: [
        {
          id: "cl-36-1",
          recordId: "r-illmatic",
          against: { kind: "invoice", invoiceId: "inv-seed-crate-paid" },
          reason: "Wrong item",
          cost: 18,
          qty: 1,
        },
      ],
      createdBy: CURRENT_USER,
      createdAt: "2026-08-19 13:00:00",
      log: [
        { at: "2026-08-19 13:00:00", text: "Claim opened — Wrong item (qty 1)" },
        { at: "2026-08-20 10:00:00", text: "Claim 36 sent to hello@cratedigger.example" },
        {
          at: "2026-08-22 09:10:00",
          text: "Voided — Raised against the wrong copy · The Illmatic that came short was on the other invoice. Number 36 retired; returned to its unsent batch.",
        },
      ],
    },
  ],

  // E-04 d27, architecture A-44 — one row per voided claim, never a column.
  claimVoids: [
    {
      id: "claimvoid-seed-1",
      claimId: "claim-crate-36",
      claimNumber: 36,
      reason: "Raised against the wrong copy",
      note: "The Illmatic that came short was on the other invoice.",
      at: "2026-08-22 09:10:00",
      by: MANAGER_NAME,
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
      status: "Finalized",
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
      targets: [{ kind: "invoice", id: "inv-seed-crate-paid", amount: 20.0, settleKind: "money" }],
    },
  ],
  batchVoids: [],
  pendingOrders: PENDING_ORDERS,
  reviewFlags: [],
  activeSaleId: null,
  lastViewedSupplierId: null,
  lastViewedCustomerId: null,
  nextSaleNumber: 100241,
  nextHold: 2,
  nextClaimNumber: 42, // d26 — 36, 40 and 41 are spent; gaps are expected
  nextPoNumber: 0,
  nextInternalBarcode: 9000,
  nextInvoiceRef: 1,
  nextCustomerPrimaryId: CUSTOMERS.length + 1,
  discogsUp: true,
};

interface AppContextValue extends AppState {
  activeSale: Sale | null;
  sessionUser: User | null;
  actorName: string;
  sessionLapseSeconds: number;
  setSessionLapseSeconds: (n: number) => void;
  identify: (userId: string) => void;
  endSession: () => void;
  touchSession: () => void;
  sessionLastActivity: number;
  // M-06 settings. Every one of these is manager-only (A-28a) and every one
  // appends a settingsLog row carrying the actor and the values BEFORE and
  // AFTER (A-52) — the value is what makes the log worth keeping, since d8's
  // never-retroactive rule means the old one is the only record of what
  // yesterday's Sales were computed against.
  // M-06 d14 — the two coordinates for a given Sale, gathered in one place so
  // no screen invents its own lookup order.
  taxTypes: TaxType[];
  productTaxCodes: ProductTaxCode[];
  taxGroups: TaxGroup[];
  taxGroupCells: TaxGroupCell[];
  genres: Genre[];
  defaultTaxGroup: string;
  taxCtxFor: (sale?: Sale | null) => TaxContext;
  productTaxCodeForRecord: (recordId?: string) => string;
  upsertTaxType: (row: TaxType, by: string) => SettingsWriteResult;
  setTaxCell: (groupId: string, productTaxCode: string, spec: string, by: string) => SettingsWriteResult;
  upsertTaxGroup: (row: TaxGroup, by: string) => SettingsWriteResult;
  setDefaultTaxGroup: (groupId: string, by: string) => void;
  setStoreSetting: <K extends keyof StoreSettings>(key: K, value: StoreSettings[K], by: string) => void;
  setStoreDetail: (key: keyof Omit<StoreDetails, "storeId" | "position">, value: string | boolean | PostalAddress, by: string) => void;
  upsertSection: (row: SectionRow, by: string) => SettingsWriteResult;
  upsertTender: (row: TenderRow, by: string) => SettingsWriteResult;
  upsertCurrency: (row: CurrencyRow, by: string) => SettingsWriteResult;
  setHomeCurrency: (code: string, by: string) => void;
  userFor: (id?: string) => User | undefined;
  activeManagerCount: () => number;
  // Every one of these is manager-only (A-55) and every one returns a reason
  // rather than throwing, because M-04 d13 and A-54 both require the refusal
  // to say WHICH thing blocked it - a refusal that does not name its cause
  // reads as the system simply saying no.
  addUser: (input: { name: string; initials: string; role: UserRole }, by: string) => UserWriteResult;
  changeUserRole: (userId: string, role: UserRole, by: string) => UserWriteResult;
  deactivateUser: (userId: string, by: string) => UserWriteResult;
  reactivateUser: (userId: string, initials: string, by: string) => UserWriteResult;
  correctUser: (userId: string, patch: { name?: string; initials?: string }, by: string) => UserWriteResult;
  setUserPassword: (userId: string, password: string, by: string) => UserWriteResult;
  // E-01 d21 — a password holder's session is capped at the 5-minute default
  // however long the shop set the lapse to.
  effectiveLapseSeconds: number;

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
    // E-04 d28 — chosen from that Supplier's received Invoices, or explicitly
    // none. Defaults to the Invoice the copy arrived on.
    against?: ClaimLineAgainst,
  ) => { claimId: string; supplierName: string } | null;
  sendClaim: (claimId: string, claimNumber?: number) => { claimNumber: number } | null;
  markClaimCredited: (claimId: string, creditMemo: string, creditedAmount?: number) => void;
  abandonClaim: (claimId: string, reason: AbandonReason, note?: string) => void;
  voidClaim: (claimId: string, reason: VoidReason, note?: string) => void;

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
    genreId: string;
    catalogNo: string;
    label: string;
  }) => string;
  addSupplier: (input: Omit<Supplier, "id" | "log">) => string;
  updateSupplier: (supplierId: string, patch: Partial<Omit<Supplier, "id" | "log">>) => void;
  copySupplier: (supplierId: string) => string | null;
  deleteSupplier: (supplierId: string) => void;
  mergeSuppliers: (keepId: string, mergeId: string) => void;
  setDefaultForSecondHand: (supplierId: string) => void;
  /** Append one line to a Supplier's log without editing a field (M-01 d4). */
  logSupplier: (supplierId: string, text: string) => void;
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
      poNumber?: string;
    },
  ) => void;
  updateInvoiceLine: (
    invoiceId: string,
    lineId: string,
    patch: Partial<Pick<InvoiceLine, "listPrice" | "discountPct" | "acceptedPrice" | "grade" | "qty">>,
  ) => void;
  removeInvoiceLine: (invoiceId: string, lineId: string) => { blocked: boolean };
  // E-02 d45/d47 — terms and method ride with the paperwork figures: all of
  // them are things read off the supplier's invoice and corrected until paid.
  updateInvoiceTotals: (
    invoiceId: string,
    patch: Partial<Pick<Invoice, "statedSubtotal" | "tax" | "freight" | "misc" | "paymentTerms" | "paymentMethod">>,
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
  // M-05 d27 — one selection, one act. Credits attach to the debits beside
  // them; placeholders retire contributing nothing; money covers the rest.
  settlePayables: (
    input: {
      supplierId: string;
      method: PaymentMethod;
      reference: string;
      date: string;
      debits: { kind: PayableTargetKind; id: string; credit?: number; money?: number; creditId?: string }[];
      credits: { id: string; amount: number; label: string }[];
      placeholderIds: string[];
    },
    by: string,
  ) => void;
  // M-05 d22/d30 — appended, never edited; never refuses.
  voidPaymentBatch: (batchId: string, by: string) => void;

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
  /** Logs the receipt on the line; the line SURVIVES (M-02 d21). `qty` is
   *  what this Invoice took in, for the log entry. */
  receivePendingOrderLine: (id: string, qty?: number) => PendingOrderLine | null;
  /**
   * Reverse our own paperwork for a PurchaseOrder (M-02 d11, d24). Never
   * touches the supplier — somebody still has to tell them (d10).
   */
  voidPurchaseOrder: (
    poNumber: string,
    by?: string,
  ) => { returned: number; split: number; untouched: number };
  /** Set or clear one of the statuses a person sets (M-02 d12, d22). */
  setPendingOrderLineStatus: (
    id: string,
    status?: OrderLineStatus,
    expectedDate?: string,
  ) => void;

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

  // M-02 d25 — an order placed OUTSIDE the system, recorded afterwards. The
  // lines are born placed: they never pass through Phase 1, they carry the
  // supplier's own reference as the PO number (d16 permits free-text), and
  // they take no separator, because d3's streams are a property of the
  // pending pile and these were never in one.
  //
  // `placedOn` is the date the order ACTUALLY went out, not today (d26): the
  // follow-up window, the age column and d19's overdue grouping all read from
  // it, so a nine-day-old order must not render as new. A line recorded this
  // way can therefore be overdue the moment it exists, which is correct.
  //
  // NOT honoured here: d27's catalog metadata prefetch. The prototype models
  // no prefetch at all, so there is nothing to queue — see docs/prototype.md.
  recordPlacedOrder: (input: {
    supplierId: string;
    poNumber?: string;
    placedOn: string;
    followUpDays?: number;
    lines: { recordId: string; qty: number; sellPrice: number; customerId?: string }[];
  }) => { poNumber: string; lineCount: number; unitCount: number } | null;

  processOrderStream: (
    supplierId: string,
    separator: string | undefined,
    poNumber?: string,
  ) => { poNumber: string; lineCount: number; unitCount: number; emailed: boolean } | null;
}

// Every user write answers with a reason rather than a boolean: M-04 d13 has
// the Manager resolve a clash on the spot, and A-54's rule that a refusal must
// name what blocked it applies here too.
export type UserWriteResult = { ok: true; id: string } | { ok: false; reason: string };
export type SettingsWriteResult = { ok: true } | { ok: false; reason: string };

// What the log records a value AS. A row is rendered rather than stringified
// so "before" reads as something a person can compare, which is the only
// reason A-52 asks for it.
function describe(v: unknown): string {
  if (v === undefined || v === null) return "(none)";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.entries(o)
      .filter(([k]) => k !== "id" && k !== "systemOwned")
      .map(([k, val]) => `${k}: ${describe(val)}`)
      .join(", ");
  }
  return String(v);
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(seed);

  // -------------------------------------------------------------------------
  // The staff session (E-01)
  //
  // An actor and a timer, in the browser. A-3 and A-50 are explicit that it
  // can be nothing else — the lapse "is a client-side timer and can be
  // nothing else" — so the prototype models it in exactly the place the real
  // thing will live, rather than pretending there is a session row.
  // -------------------------------------------------------------------------

  const sessionUser = s.users.find((u) => u.id === s.sessionUserId && u.active) ?? null;

  // What every attributed write stamps. With no session open the actions that
  // reach the store have all prompted for initials first (d5, d12, d15), so
  // this is the fallback for the ones that have not been wired through the
  // prompt yet rather than a state anyone should reach.
  const effectiveLapseSeconds = usersLib.effectiveLapseSeconds(sessionUser, s.sessionLapseSeconds);

  const actorName: string = sessionUser ? `${sessionUser.name} (${sessionUser.role})` : CURRENT_USER;

  const identify: AppContextValue["identify"] = (userId) =>
    setS((prev) => ({ ...prev, sessionUserId: userId, sessionLastActivity: Date.now() }));

  const endSession: AppContextValue["endSession"] = () =>
    setS((prev) => ({ ...prev, sessionUserId: null }));

  const touchSession: AppContextValue["touchSession"] = () =>
    setS((prev) => (prev.sessionUserId ? { ...prev, sessionLastActivity: Date.now() } : prev));

  const setSessionLapseSeconds: AppContextValue["setSessionLapseSeconds"] = (n) =>
    setS((prev) => ({ ...prev, sessionLapseSeconds: Math.max(30, n) }));


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
      recordedBy: actorName,
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

  // A Customer supplies a DISCOUNT per line and a TAX GROUP per Sale — never a
  // tax line. M-06 d14 resolves tax from two axes that never compete, so a
  // customer-level tax override is exactly the shape two tables replaced.
  const applyCustomerDefaults = (
    customerId: string | undefined,
    base: { discountPct: number },
  ) => {
    const c = s.customers.find((x) => x.id === customerId);
    if (!c) return base;
    return {
      discountPct: c.globalDiscountPct || base.discountPct,
    };
  };

  const newSale: AppContextValue["newSale"] = (opts) => {
    const id = uid("sale");
    const sale: Sale = {
      id,
      state: "Open",
      customerId: undefined,
      createdBy: actorName,
      createdAt: now(),
      isReturn: opts?.isReturn,
      lockedBy: actorName,
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
      createdBy: actorName,
      createdAt: now(),
      lockedBy: actorName,
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
      createdBy: actorName,
      createdAt: now(),
      lockedBy: actorName,
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
  // -------------------------------------------------------------------------
  // M-06 tax resolution (d11-d17)
  // -------------------------------------------------------------------------

  // d12, d17 — the product tax code comes from the Genre, and genre is
  // mandatory on every sellable thing. A Record whose genre is not in the
  // table resolves to the standard code rather than to nothing: an unmapped
  // genre is a data problem (d6's map is what fixes it), and silently
  // charging no tax would be the worse failure.
  // d12, d17 — one resolver, because every sellable thing reaches tax the
  // same way. An unresolvable genre falls back to the standard code rather
  // than to nothing: charging no tax is a worse failure than charging the
  // wrong tax, which is the opposite call from Section (see lib/taxonomy).
  const productTaxCodeForGenre = (genreId: string | undefined): string => {
    // No `active` filter: d9's deactivation stops a Genre being offered,
    // not resolved.
    return s.genres.find((x) => x.id === genreId)?.productTaxCode ?? "1";
  };

  const productTaxCodeForRecord: AppContextValue["productTaxCodeForRecord"] = (recordId) => {
    const rec = s.records.find((r) => r.id === recordId);
    // By id, and with no `active` filter: d9's deactivation stops a Genre
    // being offered, not being resolved. A Record under a retired genre
    // must keep its product tax code, or retiring a genre silently changes
    // what its stock is taxed at.
    const g = s.genres.find((x) => x.id === rec?.genreId);
    return g?.productTaxCode ?? "1";
  };

  const taxCtxFor: AppContextValue["taxCtxFor"] = (sale) => ({
    types: s.taxTypes,
    cells: s.taxGroupCells,
    // d14's order: the Sale's snapshot if it has one, else the Customer's
    // group, else the store's default.
    groupId:
      sale?.taxGroupId ??
      s.customers.find((c) => c.id === sale?.customerId)?.taxGroupId ??
      s.defaultTaxGroup,
    // A-57 — the rate in force when the money moves. A completed Sale carries
    // its own snapshot, so `at` only decides anything for one still open.
    at: new Date().toISOString().slice(0, 10),
  });

  const upsertTaxType: AppContextValue["upsertTaxType"] = (row, by) => {
    const code = row.code.trim().toLowerCase();
    if (code.length !== 1) return { ok: false, reason: "A tax type code is a single letter." };
    if (!row.name.trim()) return { ok: false, reason: "A name is required." };
    if (row.ratePpm < 0) return { ok: false, reason: "A rate cannot be negative." };
    if ((row.pendingRatePpm === undefined) !== (row.pendingFrom === undefined))
      return { ok: false, reason: "A pending change needs both a rate and the date it starts (d52)." };
    const existing = s.taxTypes.find((x) => x.code === code);
    // d52 — a pending change that has already taken effect is PROMOTED before
    // a new one is accepted, so an elapsed change is never silently dropped.
    const today = new Date().toISOString().slice(0, 10);
    const promoted =
      existing?.pendingFrom && existing.pendingRatePpm !== undefined && today >= existing.pendingFrom
        ? { ...existing, ratePpm: existing.pendingRatePpm, pendingRatePpm: undefined, pendingFrom: undefined }
        : existing;
    const next: TaxType = { ...promoted, ...row, code, name: row.name.trim() };
    setS((prev) => ({
      ...prev,
      taxTypes: existing ? prev.taxTypes.map((x) => (x.code === code ? next : x)) : [...prev.taxTypes, next],
    }));
    logSetting("Tax types", next.name, existing ?? "(none)", next, by);
    return { ok: true };
  };

  const setTaxCell: AppContextValue["setTaxCell"] = (groupId, productTaxCode, spec, by) => {
    const clean = spec.trim().toLowerCase();
    const { codes } = parseCell(clean);
    // d16 — two maximum, and every letter has to name a type that exists.
    if (clean.replace("+", "").length > 2) return { ok: false, reason: "Two taxes maximum per cell (d16)." };
    const unknown = codes.find((c) => !s.taxTypes.some((t) => t.code === c));
    if (unknown) return { ok: false, reason: `There is no tax type "${unknown}".` };
    if (clean.endsWith("+") && codes.length < 2)
      return { ok: false, reason: "A trailing + compounds the SECOND tax on the first, so it needs two." };
    const before = s.taxGroupCells.find((c) => c.groupId === groupId && c.productTaxCode === productTaxCode);
    setS((prev) => ({
      ...prev,
      taxGroupCells: before
        ? prev.taxGroupCells.map((c) =>
            c.groupId === groupId && c.productTaxCode === productTaxCode ? { ...c, spec: clean } : c,
          )
        : [...prev.taxGroupCells, { groupId, productTaxCode, spec: clean }],
    }));
    const g = s.taxGroups.find((x) => x.id === groupId);
    logSetting("Tax groups", `${g?.shortName ?? groupId} \u00d7 ${productTaxCode}`, before?.spec ?? "(blank)", clean || "(blank)", by);
    return { ok: true };
  };

  const upsertTaxGroup: AppContextValue["upsertTaxGroup"] = (row, by) => {
    if (!row.description.trim()) return { ok: false, reason: "A description is required." };
    const shortName = row.shortName.trim().toUpperCase();
    if (!shortName || shortName.length > 4)
      return { ok: false, reason: "A ShortName is one to four characters \u2014 it is what appears on a Customer." };
    const existing = s.taxGroups.find((x) => x.id === row.id);
    const next = { ...row, shortName, description: row.description.trim() };
    setS((prev) => ({
      ...prev,
      taxGroups: existing ? prev.taxGroups.map((x) => (x.id === row.id ? next : x)) : [...prev.taxGroups, next],
    }));
    logSetting("Tax groups", next.shortName, existing ?? "(none)", next, by);
    return { ok: true };
  };

  const setDefaultTaxGroup: AppContextValue["setDefaultTaxGroup"] = (groupId, by) => {
    if (groupId === s.defaultTaxGroup) return;
    const before = s.taxGroups.find((g) => g.id === s.defaultTaxGroup)?.shortName ?? s.defaultTaxGroup;
    const after = s.taxGroups.find((g) => g.id === groupId)?.shortName ?? groupId;
    setS((prev) => ({ ...prev, defaultTaxGroup: groupId }));
    logSetting("Tax groups", "store default", before, after, by);
  };

  // -------------------------------------------------------------------------
  // M-06 settings
  //
  // A-52: a settings write is a definer function like any other write, and it
  // is logged with its actor. The prototype models the log rather than the
  // function, because the log is the part a reviewer can see is missing —
  // before this, changing a tax rate or a Section flag left no recorded actor
  // anywhere, while M-01 d4 logged every edit to a Supplier's card.
  //
  // d9 runs through all of it: referenced settings are DEACTIVATED, never
  // deleted, so nothing here offers a delete.
  // -------------------------------------------------------------------------

  const logSetting = (group: string, key: string, before: unknown, after: unknown, by: string) =>
    setS((prev) => ({
      ...prev,
      settingsLog: [
        ...prev.settingsLog,
        {
          at: new Date().toISOString().slice(0, 19),
          actor: by,
          group,
          key,
          before: describe(before),
          after: describe(after),
        },
      ],
    }));

  const setStoreSetting: AppContextValue["setStoreSetting"] = (key, value, by) => {
    const before = s.storeSettings[key];
    if (before === value) return;
    setS((prev) => ({ ...prev, storeSettings: { ...prev.storeSettings, [key]: value } }));
    logSetting("Store settings", String(key), before, value, by);
  };

  const setStoreDetail: AppContextValue["setStoreDetail"] = (key, value, by) => {
    const before = (s.storeDetails as unknown as Record<string, unknown>)[key];
    if (before === value) return;
    setS((prev) => ({ ...prev, storeDetails: { ...prev.storeDetails, [key]: value } }));
    logSetting("Store details", String(key), before, value, by);
  };

  const upsertSection: AppContextValue["upsertSection"] = (row, by) => {
    const code = row.code.trim().toUpperCase();
    if (code.length !== 2) return { ok: false, reason: "A Section code is two characters (d28)." };
    if (!row.name.trim()) return { ok: false, reason: "A name is required." };
    const existing = s.sections.find((x) => x.code === code);
    const clash = s.sections.find((x) => x.code !== code && x.name.toLowerCase() === row.name.trim().toLowerCase());
    if (clash) return { ok: false, reason: `${clash.name} already uses that name (${clash.code}).` };
    const next = { ...row, code, name: row.name.trim() };
    setS((prev) => ({
      ...prev,
      sections: existing
        ? prev.sections.map((x) => (x.code === code ? next : x))
        : [...prev.sections, next],
    }));
    logSetting("Sections", code, existing ?? "(none)", next, by);
    return { ok: true };
  };

  const upsertTender: AppContextValue["upsertTender"] = (row, by) => {
    if (!row.name.trim()) return { ok: false, reason: "A name is required." };
    const existing = s.tenders.find((x) => x.id === row.id);
    if (existing?.systemOwned && (row.name !== existing.name || !row.active))
      return {
        ok: false,
        reason: `${existing.name} is written by the system (d26) — it cannot be renamed or switched off.`,
      };
    const next = { ...row, name: row.name.trim() };
    setS((prev) => ({
      ...prev,
      tenders: existing ? prev.tenders.map((x) => (x.id === row.id ? next : x)) : [...prev.tenders, next],
    }));
    logSetting("Tenders", next.name, existing ?? "(none)", next, by);
    return { ok: true };
  };

  const upsertCurrency: AppContextValue["upsertCurrency"] = (row, by) => {
    const code = row.code.trim().toUpperCase();
    if (code.length !== 3) return { ok: false, reason: "A currency code is three letters." };
    if (!(row.rate > 0)) return { ok: false, reason: "A rate has to be greater than zero." };
    const existing = s.currencies.find((x) => x.code === code);
    // d33 — the rate carries the date it was last set, and the shop does not
    // type that date: setting a rate stamps today, which is the whole of how
    // the staleness risk is answered.
    const next = {
      ...row,
      code,
      rateSetOn: existing && existing.rate === row.rate ? existing.rateSetOn : new Date().toLocaleDateString("en-CA"),
    };
    setS((prev) => ({
      ...prev,
      currencies: existing ? prev.currencies.map((x) => (x.code === code ? next : x)) : [...prev.currencies, next],
    }));
    logSetting("Currencies", code, existing ?? "(none)", next, by);
    return { ok: true };
  };

  const setHomeCurrency: AppContextValue["setHomeCurrency"] = (code, by) => {
    if (code === s.homeCurrency) return;
    const before = s.homeCurrency;
    setS((prev) => ({ ...prev, homeCurrency: code }));
    logSetting("Currencies", "home currency", before, code, by);
  };

  // -------------------------------------------------------------------------
  // Users (M-04, architecture A-55)
  //
  // Thin wrapper only. The rules live in lib/users.ts as pure functions,
  // because A-55 puts both invariants in the write path and a rule that can
  // only be exercised by clicking a button is a rule nothing can test.
  // -------------------------------------------------------------------------

  const userFor: AppContextValue["userFor"] = (id) => s.users.find((u) => u.id === id);

  const activeManagerCount: AppContextValue["activeManagerCount"] = () =>
    usersLib.activeManagerCount(s.users);

  // Each of these applies the pure reducer and commits only on success, so a
  // refusal leaves state untouched and hands the caller the reason to show.
  const commit = (r: usersLib.UserWrite): UserWriteResult => {
    if (!r.ok) return r;
    setS((prev) => ({ ...prev, users: r.users }));
    return { ok: true, id: r.id };
  };

  const addUser: AppContextValue["addUser"] = (input, by) =>
    commit(usersLib.addUser(s.users, input, by, { id: uid("user") }));

  const changeUserRole: AppContextValue["changeUserRole"] = (userId, role, by) =>
    commit(usersLib.changeUserRole(s.users, userId, role, by));

  // M-04 d15 as corrected by d18: a deactivation stops new work under those
  // initials AT ONCE. There is no server-side session to end, so what
  // "immediately" means here is that the actor no longer resolves — the same
  // shape as actor_resolve refusing (A-55). An Open Sale is untouched and
  // stays finishable; only the session goes.
  const deactivateUser: AppContextValue["deactivateUser"] = (userId, by) => {
    const r = commit(usersLib.deactivateUser(s.users, userId, by));
    if (r.ok && s.sessionUserId === userId) endSession();
    return r;
  };

  const reactivateUser: AppContextValue["reactivateUser"] = (userId, initials, by) =>
    commit(usersLib.reactivateUser(s.users, userId, initials, by));

  const correctUser: AppContextValue["correctUser"] = (userId, patch, by) =>
    commit(usersLib.correctUser(s.users, userId, patch, by));

  const setUserPassword: AppContextValue["setUserPassword"] = (userId, password, by) =>
    commit(usersLib.setUserPassword(s.users, userId, password, by));

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
      const d = applyCustomerDefaults(sale.customerId, { discountPct: 0 });
      const line: SaleLine = {
        id: uid("line"),
        kind: "item",
        // d12 — what the PRODUCT is, copied from the Record's genre at the
        // moment it goes in the basket (A-57: that half is fixed at line-add).
        productTaxCode: productTaxCodeForRecord(rec.id),
        recordId: rec.id,
        inventoryItemId: item.id,
        title: `${rec.artist} — ${rec.title}`,
        grade: item.grade,
        qty: 1,
        price: item.price,
        discountPct: d.discountPct,
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
      const d = applyCustomerDefaults(sale.customerId, { discountPct: 0 });
      const line: SaleLine = {
        id: uid("line"),
        kind: "item",
        productTaxCode: productTaxCodeForRecord(record.id),
        recordId: record.id,
        inventoryItemId: itemId,
        title: `${record.artist} — ${record.title}`,
        qty: 1,
        price,
        discountPct: d.discountPct,
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
      const line: SaleLine = {
        id: uid("line"),
        kind: "nontracked",
        // d17 — genre is mandatory on every sellable thing INCLUDING
        // non-tracked ones, which is how freight and services resolve tax
        // with no special case. Resolved through the entry's genre like
        // any other line; there is no longer a hardcoded code here.
        productTaxCode: productTaxCodeForGenre(nt.genreId),
        genreId: nt.genreId,
        title: `${nt.label} (${nt.code})`,
        qty: 1,
        price,
        discountPct: 0,
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
          // d18 — a gift card load is a system-owned non-tracked catalog
          // entry, so it resolves through the `Gift card` genre like every
          // other line. That genre carries product tax code `2`, which is
          // out of scope in every group (d15) — a load was being taxed at
          // the standard rate while this said `1`.
          productTaxCode: productTaxCodeForGenre(GIFT_CARD_GENRE_ID),
          genreId: GIFT_CARD_GENRE_ID,
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
      // No applyCustomerDefaults here on purpose: a refund does not take the
      // Customer's global discount, which is why discountPct is 0 below.
      const line: SaleLine = {
        id: uid("line"),
        kind: "item",
        productTaxCode: productTaxCodeForRecord(rec.id),
        recordId: rec.id,
        inventoryItemId: item.id,
        title: `${rec.artist} — ${rec.title}`,
        grade: item.grade,
        qty: -1,
        price: refund,
        discountPct: 0,
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
                // A-57 — THE TAX SNAPSHOT IS TAKEN HERE, at tender, because
                // tax describes what was COLLECTED and nothing is collected
                // until something is collected. From this moment the Sale
                // reports the types and rates it actually charged, whatever
                // the configuration does afterwards — which is the whole
                // reason no rate-history table is needed (A-58, M-06 d52).
                //
                // The group is snapshotted with it (d14): a Sale records the
                // coordinate it resolved through rather than re-deriving it
                // later from a Customer who may since have moved groups.
                taxGroupId: taxCtxFor(x).groupId,
                lines: x.lines.map((l) => ({
                  ...l,
                  tax: lineTaxComponents(l, taxCtxFor(x)),
                })),
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
              lockedBy: actorName,
              log: [...x.log, { at: now(), text: `Lock forced from ${was} to ${actorName}` }],
            }
          : x,
      ),
    }));
    raiseReviewFlag("sale-lock-broken", `Sale lock broken — ${was} to ${actorName} on an open Sale.`);
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
    computeDayBreakdown(s.sales, s.records, taxCtxFor(null), s.inventory, s.genres, s.sections);

  // Total Today's Sales — the close is a real state transition (M-03
  // decision 1): every Current Sale becomes Closed and stops being
  // editable, batched under one identifier so it can be undone as a unit.
  const totalTodaysSales: AppContextValue["totalTodaysSales"] = (by) => {
    const breakdown = computeDayBreakdown(s.sales, s.records, taxCtxFor(null), s.inventory, s.genres, s.sections);
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
  // Where a claim line points when nobody chooses (E-04 d28). A copy records
  // the Invoice it arrived on as a DISPLAY STRING — `arrivedOnInvoice` is
  // "FAB1 55021", not a reference — so this resolves it back to the Invoice by
  // supplier and number. That string is the same weakness d28 removed from the
  // claim line and it is still here, one layer down; see the open question.
  // E-04 d28 — where a claim line points when nobody chooses: the Invoice the
  // copy actually arrived on, which A-45 makes a lookup rather than the string
  // match this used to be.
  const defaultAgainst = (item: InventoryItem): ClaimLineAgainst => {
    const iv = invoiceForItem(item, s.invoices);
    return iv ? { kind: "invoice", invoiceId: iv.id } : { kind: "none" };
  };

  const raiseClaim: AppContextValue["raiseClaim"] = (itemId, reason, qty, separator, note, against) => {
    const item = s.inventory.find((i) => i.id === itemId);
    if (!item) return null;
    const supplierId = supplierIdForItem(item, s.invoices);
    const supplier = s.suppliers.find((sup) => sup.id === supplierId);
    if (!supplier) return null;
    const sepKey = (separator ?? "").trim();
    const line = {
      id: uid("claimline"),
      // d28 — the reference is EVIDENCE of what is being argued, not where
      // the credit lands (M-05 d27 decides that by ticking). Defaults to
      // where the copy came from; the caller may point it elsewhere among
      // that Supplier's received Invoices, or at nothing.
      against: against ?? defaultAgainst(item),
      recordId: item.recordId,
      itemId: item.id,
      reason,
      note,
      cost: item.cost,
      qty,
    };

    const existing = s.claims.find(
      (c) =>
        !c.sentAt &&
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
      // E-04 d22 — a raised line joins the standing batch for its supplier
      // and separator, or opens one. It is Pending from birth and unsent
      // until it has a sent date (d25); there is no Draft status.
      status: "Pending",
      lines: [line],
      createdBy: actorName,
      createdAt: now(),
      log: [{ at: now(), text: `Claim opened — ${reason} (qty ${qty})` }],
    };
    setS((prev) => ({ ...prev, claims: [claim, ...prev.claims] }));
    return { claimId: id, supplierName: supplier.name };
  };

  const sendClaim: AppContextValue["sendClaim"] = (claimId, claimNumber) => {
    const claim = s.claims.find((c) => c.id === claimId);
    // E-04 d25 — "already sent" is the presence of a sent date, not a status
    // value and not the claim number (architecture A-43).
    if (!claim || claim.sentAt) return null;
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
              // d23 — the number and the sent date are written in the same
              // act. The date is the one anything derives from (d25).
              claimNumber: num,
              sentAt: now(),
              log: [...c.log, { at: now(), text: `Claim ${num} sent to ${supplier.email}` }],
            }
          : c,
      ),
    }));
    return { claimNumber: num };
  };

  // E-04 d20 — the memo is the point of truth, and what it GRANTS may differ
  // from what was claimed. Both figures are kept: the claim total stays
  // readable as what was asked for. M-05 d26 counts the granted figure.
  const markClaimCredited: AppContextValue["markClaimCredited"] = (claimId, creditMemo, creditedAmount) =>
    setS((prev) => ({
      ...prev,
      claims: prev.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              status: "Credited",
              creditMemo,
              creditedAmount,
              log: [
                ...c.log,
                {
                  at: now(),
                  text:
                    `Marked Credited — supplier credit memo ${creditMemo}` +
                    (creditedAmount != null ? ` granting ${creditedAmount.toFixed(2)}` : ""),
                },
              ],
            }
          : c,
      ),
    }));

  // E-04 d24 — the claim was right and no money is coming. Manager-only
  // (following d3: writing off money owed is the same standing as a hard
  // on-hand adjustment), reason-coded, and appended rather than deleted. The
  // claim keeps its lines. Stock is untouched — the copies left on hand when
  // they were adjusted out, and this only stops the store expecting payment.
  const abandonClaim: AppContextValue["abandonClaim"] = (claimId, reason, note) =>
    setS((prev) => ({
      ...prev,
      claims: prev.claims.map((c) =>
        c.id === claimId
          ? {
              ...c,
              status: "Abandoned",
              abandonment: { reason, note, at: now(), by: MANAGER_NAME },
              log: [
                ...c.log,
                { at: now(), text: `Abandoned — ${reason}${note ? ` · ${note}` : ""}` },
              ],
            }
          : c,
      ),
    }));

  // E-04 d27 — the claim itself was wrong and should never have been sent.
  // A different act from abandoning, and built differently: architecture A-44
  // makes the void a ROW, so nothing on the claim is updated. Its number is
  // retired with it (d26) — re-raising means a new claim with a new number.
  // E-04 d27, d29 — the claim was wrong, not unpaid. Voiding RETURNS it to
  // unsent rather than closing it: the number is retired (d26 — never reused)
  // and the claim keeps its lines, its notes and its separator, so it drops
  // back into the standing batch it came from (d22) ready to be corrected and
  // sent again. The shape M-05 d22 uses for a payment, and its reason — a void
  // restores the prior state, it disposes of nothing.
  //
  // Only a SENT claim can be voided; there is nothing to retire otherwise, and
  // an unsent batch is edited rather than voided.
  const voidClaim: AppContextValue["voidClaim"] = (claimId, reason, note) =>
    setS((prev) => {
      const claim = prev.claims.find((c) => c.id === claimId);
      if (!claim || !claim.sentAt || claim.claimNumber == null) return prev;
      return {
        ...prev,
        claimVoids: [
          {
            id: uid("claimvoid"),
            claimId,
            claimNumber: claim.claimNumber,
            reason,
            note,
            at: now(),
            by: MANAGER_NAME,
          },
          ...prev.claimVoids,
        ],
        claims: prev.claims.map((c) =>
          c.id === claimId
            ? {
                ...c,
                // Back to unsent (d25 — sent-ness IS the sent date), and the
                // number goes with it. Separator and lines are untouched.
                sentAt: undefined,
                claimNumber: undefined,
                log: [
                  ...c.log,
                  {
                    at: now(),
                    text:
                      `Voided — ${reason}${note ? ` · ${note}` : ""}. ` +
                      `Number ${claim.claimNumber} retired; returned to its unsent batch.`,
                  },
                ],
              }
            : c,
        ),
      };
    });


  const reserve: AppContextValue["reserve"] = (recordId, itemId, customerId, qty, po) => {
    const rec = s.records.find((r) => r.id === recordId)!;
    const item = s.inventory.find((i) => i.id === itemId)!;
    const cust = s.customers.find((c) => c.id === customerId);
    const poKey = (po ?? "").trim();
    const line: SaleLine = {
      id: uid("line"),
      kind: "item",
      productTaxCode: productTaxCodeForRecord(recordId),
      recordId,
      inventoryItemId: itemId,
      title: `${rec.artist} — ${rec.title}`,
      grade: item.grade,
      qty,
      price: item.price,
      discountPct: cust?.globalDiscountPct ?? 0,
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
      createdBy: actorName,
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
    //
    // A second-hand intake mints from the RECEIVED DATE rather than a store
    // counter (E-02 d39, A-32): the day the stock arrived is the one fact a
    // walk-in trade-in reliably has, and a counter value tells you nothing
    // when you find the reference again six months later. `-n` sequences a
    // second intake the same day, counted against the references already
    // minted for that date rather than a global counter — so the sequence is
    // per-day and reads as one.
    const invoiceNumber =
      input.invoiceNumber.trim() ||
      (input.intakeMode === "Second-hand"
        ? mintSecondHandRef(input.receivedDate, s.invoices)
        : `REF${String(s.nextInvoiceRef).padStart(4, "0")}`);
    const invoice: Invoice = {
      id,
      ...input,
      invoiceNumber,
      misc: 0,
      status: "Draft",
      lines: [],
      createdBy: actorName,
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
      nextInvoiceRef:
        input.invoiceNumber.trim() || input.intakeMode === "Second-hand"
          ? prev.nextInvoiceRef
          : prev.nextInvoiceRef + 1,
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
      genreId: input.genreId,
      art: "💿",
      minOnHand: 0,
    };
    setS((prev) => ({ ...prev, records: [...prev.records, rec] }));
    return id;
  };

  // M-01 — nothing here is gated. Any Employee can New/Edit/Copy a Supplier.
  const addSupplier: AppContextValue["addSupplier"] = (input) => {
    const id = uid("sup");
    const supplier: Supplier = { id, ...input, log: [{ at: now(), text: `Added by ${actorName}` }] };
    setS((prev) => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
    return id;
  };

  const updateSupplier: AppContextValue["updateSupplier"] = (supplierId, patch) =>
    setS((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId
          ? { ...s, ...patch, log: [...s.log, { at: now(), text: `Edited by ${actorName}` }] }
          : s,
      ),
    }));

  // M-01 d4 wants every change logged, but not every change is a field edit:
  // a Manager authorising a Discount change is itself worth a row, and
  // routing it through updateSupplier would file it as "Edited by".
  const logSupplier: AppContextValue["logSupplier"] = (supplierId, text) =>
    setS((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId ? { ...s, log: [...s.log, { at: now(), text }] } : s,
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
      log: [{ at: now(), text: `Copied from ${src.name} by ${actorName}` }],
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
                log: [...x.log, ...merge.log, { at: now(), text: `Merged with ${merge.name} by ${actorName}` }],
              }
            : x,
        ),
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
          ? { ...s, defaultForSecondHand: true, log: [...s.log, { at: now(), text: `Marked default for second-hand by ${actorName}` }] }
          : s.defaultForSecondHand
            ? { ...s, defaultForSecondHand: false, log: [...s.log, { at: now(), text: `Unmarked default for second-hand by ${actorName}` }] }
            : s,
      ),
    }));

  // Shared by finalize (every line at once) and addInvoiceLine (one line, when
  // the Invoice is already Finalized — the "becomes sellable" moment already
  // happened for this Invoice, so a line added afterward mints immediately
  // rather than waiting for a Finalize that has already occurred).
  // A-45 removed two parameters from this function: it took a Supplier and an
  // invoice number purely to render `arrivedOnInvoice`. Minting now records
  // the line the copy came from and nothing else, which is the whole fact.
  const mintItemsForLine = (
    line: { id: string; recordId: string; grade: Grade; acceptedPrice: number; cost: number; qty: number },
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
        // A-45 — a reference, not a rendered caption. The supplier's short
        // name and the invoice number are read from the rows that own them.
        invoiceLineId: line.id,
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
    invoiceLineId: string,
  ): InventoryItem[] =>
    reconciledIds.length === 0
      ? inventory
      : inventory.map((i) =>
          reconciledIds.includes(i.id)
            ? {
                ...i,
                cost,
                // A-45 — reconciling gives the copy the paperwork it was sold
                // without. Before this it had none, and said so.
                invoiceLineId,
                oversoldReconciledAt: now(),
                oversoldReconciledBy: actorName,
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
    if (!invoice || invoiceIsPaid(invoice, s.paymentBatches, s.batchVoids)) return;
    const cost = round2(line.listPrice * (1 - line.discountPct / 100));
    let newLine: InvoiceLine = { id: uid("invline"), ...line, cost };

    let mintedItems: InventoryItem[] = [];
    let nextBarcodeSeq = s.nextInternalBarcode;
    let reconciledIds: string[] = [];
    if (invoice.status === "Finalized") {
      const minted = mintItemsForLine(newLine, nextBarcodeSeq);
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
        newLine.id,
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
    if (!invoice || invoiceIsPaid(invoice, s.paymentBatches, s.batchVoids) || !existing) return;
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
    if (!invoice || invoiceIsPaid(invoice, s.paymentBatches, s.batchVoids) || !line) return { blocked: true };
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
        iv.id === invoiceId && !invoiceIsPaid(iv, prev.paymentBatches, prev.batchVoids) ? { ...iv, ...patch } : iv,
      ),
    }));

  const setInvoiceTotalOverride: AppContextValue["setInvoiceTotalOverride"] = (invoiceId, value) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    if (!invoice || invoiceIsPaid(invoice, s.paymentBatches, s.batchVoids)) return;
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
        line.id,
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
              paidAt: now(),
              paidBy: by,
              log: [...iv.log, { at: now(), text: `Marked paid by ${by} — now immutable` }],
            }
          : iv,
      ),
    }));

  // M-05 d27 — THE settlement. One selection, one act, one PaymentBatch.
  //
  // Credits in the selection attach to the debits in the selection; whatever
  // cannot attach comes back as a remainder (d25, d28); Claim placeholders
  // retire contributing nothing; money covers the shortfall. A selection with
  // no debit is a clearing and goes to clearPayableEntries instead.
  //
  // Attaching a credit does NOT move the Supplier's balance (d26) — the credit
  // already counted, and attaching only changes what it is attached to. The
  // balance moves by exactly the money that left.
  const settlePayables: AppContextValue["settlePayables"] = (input, by) =>
    setS((prev) => {
      const at = now();
      const targets: PaymentTarget[] = [];

      // WHICH credit funds a given target is not something d18 governs — d18 is
      // about which INVOICES a credit lands on, and that stays the Manager's.
      // The drawdown here is deterministic, in the order they were ticked, and
      // one target is written per (debit, credit) pair so provenance is exact:
      // d22's void has to put each credit back, and a pool with no provenance
      // cannot be reversed. (M-05 records the open question of whether the
      // Manager should get to choose this too.)
      const pool = input.credits.map((c) => ({ ...c, left: round2(c.amount) }));

      for (const d of input.debits) {
        let credit = round2(d.credit ?? 0);
        while (credit > 0.005) {
          const src = pool.find((p) => p.left > 0.005);
          if (!src) break;
          const take = round2(Math.min(credit, src.left));
          src.left = round2(src.left - take);
          credit = round2(credit - take);
          targets.push({ kind: d.kind, id: d.id, amount: take, settleKind: "credit", creditId: src.id });
        }
        const moneyPart = round2(d.money ?? 0);
        if (moneyPart > 0.005) {
          targets.push({ kind: d.kind, id: d.id, amount: moneyPart, settleKind: "money" });
        }
      }
      if (targets.length === 0 && input.placeholderIds.length === 0) return prev;

      const batch: PaymentBatch = {
        id: uid("batch"),
        supplierId: input.supplierId,
        method: input.method,
        reference: input.reference,
        date: input.date,
        recordedBy: by,
        createdAt: at,
        targets,
      };

      // d28 — every credit ticked is consumed WHOLE, claim or entry alike, so
      // nothing carries a partial state. d25 — what could not attach comes back
      // as its own artifact, ONE PER SOURCE CREDIT (A-36), carrying provenance.
      const remainders: PayableEntry[] = [];
      for (const c of pool) {
        const left = c.left;
        if (left > 0.005) {
          remainders.push({
            id: uid("rem"),
            supplierId: input.supplierId,
            type: "Credit",
            source: "remainder",
            fromCreditId: c.id,
            reference: `Remainder of ${c.label}`,
            date: input.date,
            subtotal: left,
            tax: 0,
            freight: 0,
            misc: 0,
            createdBy: by,
            createdAt: at,
            log: [{ at, text: `Remainder of ${money(left)} from ${c.label} — nothing left to attach it to (d25)` }],
          });
        }
      }

      const paymentBatches = [batch, ...prev.paymentBatches];
      const amountFor = (kind: PayableTargetKind, id: string) =>
        round2(targets.filter((tg) => tg.kind === kind && tg.id === id).reduce((s, tg) => s + tg.amount, 0));

      const invoices = prev.invoices.map((iv) => {
        const amount = amountFor("invoice", iv.id);
        if (amount <= 0.005) return iv;
        return {
          ...iv,
          log: [...iv.log, { at, text: `Settled ${money(amount)} — ${input.reference || "credit only"} by ${by}` }],
        };
      });

      const payableEntries = prev.payableEntries
        .map((e) => {
          const amount = amountFor("entry", e.id);
          if (amount > 0.005) {
            return { ...e, log: [...e.log, { at, text: `Settled ${money(amount)} by ${by}` }] };
          }
          // d27 — a ticked placeholder retires, contributing nothing to the money.
          if (input.placeholderIds.includes(e.id)) {
            return {
              ...e,
              clearedAt: at,
              clearedBy: by,
              log: [...e.log, { at, text: `Retired in a settlement by ${by} — contributed nothing (d27)` }],
            };
          }
          return e;
        })
        .concat(remainders);

      return { ...prev, paymentBatches, invoices, payableEntries };
    });

  // M-05 d22 / d30 — void a PaymentBatch. Whole or not at all, appended never
  // edited, and it NEVER REFUSES: where the settlement emitted a remainder, the
  // void appends a reversing Adjustment of equal and opposite amount rather
  // than reclaiming it. So it does not matter what became of that remainder
  // since, and void legality is not order-dependent along a chain (d30).
  //
  // Nothing un-consumes a credit by writing to it — a credit is consumed by the
  // PRESENCE of a live target (A-37), so voiding the batch releases it with
  // nothing to flip. The same is true of the Invoice's immutability (A-33a).
  const voidPaymentBatch: AppContextValue["voidPaymentBatch"] = (batchId, by) =>
    setS((prev) => {
      const batch = prev.paymentBatches.find((b) => b.id === batchId);
      if (!batch || prev.batchVoids.some((v) => v.batchId === batchId)) return prev;

      const at = now();
      const voidRow: PaymentBatchVoid = { id: uid("void"), batchId, voidedAt: at, voidedBy: by };

      // d30 — one reversing Adjustment per remainder this batch emitted.
      const reversals: PayableEntry[] = prev.payableEntries
        .filter((e) => e.source === "remainder" && e.createdAt === batch.createdAt && e.supplierId === batch.supplierId)
        .map((rem) => ({
          id: uid("rev"),
          supplierId: rem.supplierId,
          type: "Adjustment" as const,
          source: "reversal" as const,
          adjustmentDirection: "increase" as const,
          fromVoidId: voidRow.id,
          reversalOfId: rem.id,
          reference: `Reversal of ${rem.reference}`,
          date: at.slice(0, 10),
          subtotal: payableEntryTotal(rem),
          tax: 0,
          freight: 0,
          misc: 0,
          createdBy: by,
          createdAt: at,
          log: [{ at, text: `Posted by a void of ${batch.reference || "a credit-only settlement"} — the remainder is not deleted (d30)` }],
        }));

      const touched = new Set(batch.targets.filter((tg) => tg.kind === "invoice").map((tg) => tg.id));
      const invoices = prev.invoices.map((iv) =>
        touched.has(iv.id)
          ? { ...iv, log: [...iv.log, { at, text: `Settlement voided by ${by} — balance restored` }] }
          : iv,
      );

      return {
        ...prev,
        batchVoids: [voidRow, ...prev.batchVoids],
        payableEntries: [...prev.payableEntries, ...reversals],
        invoices,
      };
    });

  const payableEntryFor: AppContextValue["payableEntryFor"] = (id) =>
    id ? s.payableEntries.find((e) => e.id === id) : undefined;

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
      createdBy: actorName,
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
  // A received line SURVIVES (M-02 d21). Deleting it was what made E-02 d30
  // uncomputable — "ordered minus received across every Invoice" has nothing
  // to subtract from once the row is gone — and it left a received copy with
  // no recoverable link to the PO it arrived against. What is outstanding is
  // derived from the Invoice lines pointing back here; all this does now is
  // write the receipt into the line's own history.
  const receivePendingOrderLine: AppContextValue["receivePendingOrderLine"] = (id, qty) => {
    const order = s.pendingOrders.find((o) => o.id === id);
    if (!order) return null;
    const text =
      qty == null
        ? "Received"
        : `Received ${qty} of ${order.qty}${qty < order.qty ? " — remainder still outstanding" : ""}`;
    setS((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.map((o) =>
        o.id === id ? { ...o, log: [...(o.log ?? []), { at: now(), text: `${text} by ${actorName}` }] } : o,
      ),
    }));
    return order;
  };

  // M-02 d11 + d24 — voiding reverses OUR paperwork, never the supplier's
  // (d10). Three things can happen to a line on the voided PO, and which one
  // depends on how much of it actually arrived:
  //
  //   nothing received  → returns to pending whole, as d11 always said
  //   some received     → the line keeps what arrived (its quantity drops to
  //                       that) and the remainder is raised as a NEW pending
  //                       line. Neither half can simply go: the received
  //                       copies are on the shelf and their link to the
  //                       Invoice is what E-02 d30 counts, and the remainder
  //                       is still wanted.
  //   fully received    → untouched. There is nothing to reverse.
  const voidPurchaseOrder: AppContextValue["voidPurchaseOrder"] = (poNumber, by) => {
    const onPo = s.pendingOrders.filter((o) => o.poNumber === poNumber);
    if (onPo.length === 0) return { returned: 0, split: 0, untouched: 0 };

    const stamp = now();
    const who = `${actorName}${by ? ` (manager ${by})` : ""}`;
    let returned = 0;
    let split = 0;
    let untouched = 0;
    const raised: PendingOrderLine[] = [];

    const next = s.pendingOrders.map((o) => {
      if (o.poNumber !== poNumber) return o;
      const received = s.invoices.reduce(
        (n, iv) => n + iv.lines.filter((l) => l.fromOrderId === o.id).reduce((m, l) => m + l.qty, 0),
        0,
      );

      if (received >= o.qty) {
        untouched += 1;
        return {
          ...o,
          poVoidedAt: stamp,
          log: [...(o.log ?? []), { at: stamp, text: `PO ${poNumber} voided — already received in full, unchanged. By ${who}` }],
        };
      }

      if (received === 0) {
        returned += 1;
        return {
          ...o,
          poNumber: undefined,
          placedAt: undefined,
          // A status the supplier reported about an order that no longer
          // exists is not information, it is a leftover.
          status: undefined,
          expectedDate: undefined,
          log: [...(o.log ?? []), { at: stamp, text: `PO ${poNumber} voided — returned to pending. By ${who}` }],
        };
      }

      // Part received: split (d24).
      split += 1;
      const remainder = o.qty - received;
      const newId = uid("po-line");
      raised.push({
        ...o,
        id: newId,
        qty: remainder,
        poNumber: undefined,
        placedAt: undefined,
        status: undefined,
        expectedDate: undefined,
        createdAt: stamp,
        createdBy: actorName,
        log: [
          {
            at: stamp,
            text: `Raised from the void of PO ${poNumber} — ${remainder} of ${o.qty} never arrived. By ${who}`,
          },
        ],
      });
      return {
        ...o,
        qty: received,
        poVoidedAt: stamp,
        log: [
          ...(o.log ?? []),
          {
            at: stamp,
            text: `PO ${poNumber} voided — kept the ${received} received; ${remainder} returned to pending as a new line. By ${who}`,
          },
        ],
      };
    });

    setS((prev) => ({ ...prev, pendingOrders: [...raised, ...next] }));
    return { returned, split, untouched };
  };

  // M-02 d12, d22, d23 — the statuses a person sets, each one logged.
  const setPendingOrderLineStatus: AppContextValue["setPendingOrderLineStatus"] = (
    id,
    status,
    expectedDate,
  ) => {
    setS((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.map((o) => {
        if (o.id !== id) return o;
        const from = o.status ?? (o.poNumber ? "Ordered" : "Pending");
        const to = status ?? (o.poNumber ? "Ordered" : "Pending");
        const when = status === "Shipped" && expectedDate ? `, due ${expectedDate}` : "";
        return {
          ...o,
          status,
          // The date belongs to Shipped; clearing the status clears it too,
          // rather than leaving a due date on a cancelled line.
          expectedDate: status === "Shipped" ? expectedDate : undefined,
          log: [...(o.log ?? []), { at: now(), text: `${from} → ${to}${when} by ${actorName}` }],
        };
      }),
    }));
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
      createdBy: actorName,
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

  const recordPlacedOrder: AppContextValue["recordPlacedOrder"] = (input) => {
    const supplier = s.suppliers.find((sup) => sup.id === input.supplierId);
    if (!supplier || input.lines.length === 0) return null;

    // Same numbering rule as processOrderStream: a typed reference must be
    // free, and auto-minting skips anything already in use (d16).
    const used = new Set(s.pendingOrders.map((o) => o.poNumber).filter((n): n is string => !!n));
    let num = input.poNumber?.trim();
    if (num) {
      if (used.has(num)) return null;
    } else {
      let n = s.nextPoNumber;
      while (used.has(String(n))) n++;
      num = String(n);
    }

    // The whole point of d26: createdAt, placedAt and the follow-up window all
    // hang off the day it really went out. `daysAgo` and `followUpDueAt` parse
    // "YYYY-MM-DD hh:mm:ss", so the date is given a time rather than left bare.
    const placedStamp = `${input.placedOn} 00:00:00`;
    const at = now();
    const unitCount = input.lines.reduce((sum, l) => sum + l.qty, 0);
    const sellTotal = input.lines.reduce((sum, l) => sum + l.sellPrice * l.qty, 0);
    const how = input.poNumber?.trim() ? `their reference ${num}` : `our PO ${num}`;

    const lines: PendingOrderLine[] = input.lines.map((l) => ({
      id: uid("po-line"),
      supplierId: input.supplierId,
      poNumber: num,
      placedAt: placedStamp,
      recordId: l.recordId,
      qty: l.qty,
      sellPrice: l.sellPrice,
      customerId: l.customerId,
      followUpDays: input.followUpDays,
      followUpSetAt: placedStamp,
      createdBy: actorName,
      createdAt: placedStamp,
      recordedAt: at,
      // d23 — the line's own history says where it came from, so "why is this
      // on a PO nobody here raised" has an answer a week later.
      log: [
        {
          at,
          text: `Recorded as already placed on ${num} — ordered ${input.placedOn} via ${supplier.orderVia}. Entered by ${actorName}; nothing was sent from here.`,
        },
      ],
    }));

    setS((prev) => ({
      ...prev,
      nextPoNumber: /^\d+$/.test(num!) ? Math.max(prev.nextPoNumber, Number(num) + 1) : prev.nextPoNumber,
      pendingOrders: [...prev.pendingOrders, ...lines],
      suppliers: prev.suppliers.map((sup) =>
        sup.id === input.supplierId
          ? {
              ...sup,
              log: [
                ...sup.log,
                {
                  at,
                  text: `Order recorded as already placed under ${how} — ${lines.length} line${lines.length === 1 ? "" : "s"}, ${unitCount} units, sell ${money(sellTotal)}, ordered ${input.placedOn} via ${supplier.orderVia}. Nothing was sent from here (d25).`,
                },
              ],
            }
          : sup,
      ),
    }));

    return { poNumber: num!, lineCount: lines.length, unitCount };
  };

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
      abandonClaim,
      voidClaim,
      reserve,
      setCopyPrice,
      routeReturnLine,
      toggleDiscogs,
      invoiceFor,
      startInvoice,
      createRecordManual,
      addSupplier,
      updateSupplier,
      logSupplier,
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
      settlePayables,
      voidPaymentBatch,
      payableEntryFor,
      addPayableEntry,
      clearPayableEntries,
      pendingOrderFor,
      receivePendingOrderLine,
      setPendingOrderLineStatus,
      voidPurchaseOrder,
      raisePendingOrderLine,
      updatePendingOrderLine,
      deletePendingOrderLine,
      reflagPendingOrderLine,
      retargetStreamSeparator,
      poNumberTaken,
      recordPlacedOrder,
      processOrderStream,
      sessionUser,
      actorName,
      sessionLapseSeconds: s.sessionLapseSeconds,
      setSessionLapseSeconds,
      identify,
      endSession,
      touchSession,
      sessionLastActivity: s.sessionLastActivity,
      sections: s.sections,
      tenders: s.tenders,
      currencies: s.currencies,
      homeCurrency: s.homeCurrency,
      storeSettings: s.storeSettings,
      storeDetails: s.storeDetails,
      settingsLog: s.settingsLog,
      taxTypes: s.taxTypes,
      productTaxCodes: s.productTaxCodes,
      taxGroups: s.taxGroups,
      taxGroupCells: s.taxGroupCells,
      genres: s.genres,
      defaultTaxGroup: s.defaultTaxGroup,
      taxCtxFor,
      productTaxCodeForRecord,
      upsertTaxType,
      setTaxCell,
      upsertTaxGroup,
      setDefaultTaxGroup,
      setStoreSetting,
      setStoreDetail,
      upsertSection,
      upsertTender,
      upsertCurrency,
      setHomeCurrency,
      userFor,
      activeManagerCount,
      addUser,
      changeUserRole,
      deactivateUser,
      reactivateUser,
      correctUser,
      setUserPassword,
      effectiveLapseSeconds,
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
