import {
  useEffect,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  computeDayBreakdown,
  SUMMARY_SCHEMA_VERSION,
  type BreakdownExtras,
  type DayBreakdown,
} from "../lib/dayBreakdown";
import { checkGenreDelete, checkGenreMerge, checkGenreWrite } from "../lib/taxonomy";
import {
  checkMapRowAdd,
  normaliseTag,
  resolveGenreFromTags,
  unmappedTags,
  type GenreMatch,
} from "../lib/genreMap";
import { invoiceForItem, supplierIdForItem } from "../lib/provenance";
import { money } from "../lib/money";
import { parseCell, taxTypeWrite } from "../lib/tax";
import { lineTaxComponents, type TaxContext } from "../lib/totals";
import * as usersLib from "../lib/users";
import {
  customerBalanceDelta,
  invoiceIsFrozen,
  isPresent,
  payableEntrySignedAmount,
  payableEntryTotal,
  round2,
  tenderedTotal,
  invoiceChargesTotal,
} from "../lib/totals";
import { clearedAgainst, entryIsCleared, unclearRefusal, unretireOnVoid } from "../lib/payables";
import { giftCardRedeemRefusal } from "../lib/giftCards";
import {
  finishReturnRefusal,
  unrouteRefusal,
  regradeCostRefusal,
  regradeShortfall,
  routeDocumentRefusal,
  routeStockRefusal,
  statusAfterRoute,
} from "../lib/returnRouting";
import {
  authorizeByPin as authorizeByPinLib,
  authorizeManager,
  requireManager,
  requireOwner,
  type ManagerAuth,
} from "../lib/managerAuth";
import { adminRefusal, type AdminAction } from "../lib/userAdminPolicy";
import * as storesLib from "../lib/stores";
import { otpAccepted, selectableStores as selectableStoresLib, signInPersonal as signInPersonalLib, signInStoreAccount as signInStoreAccountLib, signInSysadmin as signInSysadminLib } from "../lib/signIn";
import { buildChart } from "../lib/chart";
import { buildCloseJournal } from "../lib/closeJournal";
import { retireCloseBatch, undoLogText, type UndoRecord } from "../lib/closeBatch";
import { buildAdjustmentJournal, buildInvoiceJournal, buildPaymentJournal } from "../lib/artifactJournals";
import { isImbalanced } from "../lib/journal";
import { readStored, writeStored } from "../lib/tillMemory";
// M-08 — the books. Every rule these enforce lives in the lib, never in a
// screen and never here (A-74, A-4, A-48: a bound enforced in the client is
// not a bound). The store calls the refusal and stores the result.
import { postingJournal, type LedgerPosting } from "../lib/ledgerPostings";
import {
  sealOpeningPosition,
  type OpeningPositionDraft,
} from "../lib/ledgerOpeningPosition";
import { closingTransactionFor, divergenceFlag, suspenseGrossFor } from "../lib/ledgerBalances";
import { closeUndoRefusal } from "../lib/ledgerPeriods";
import { yearEndClosingBatch, type LedgerIssuance } from "../lib/ledgerStatements";
import type { LedgerReconciliation } from "../lib/ledgerReconciliation";
import { toCalendarDate } from "../lib/calendarDate";
import {
  CURRENT_USER,
  CUSTOMERS,
  GENRE_MAP,
  RELEASE_CACHE,
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
  HOME_ORG_ID,
  HOME_STORE_ID,
  PLATEAU_STORE_ID,
  ORGANIZATIONS,
  STORES,
  TERMINALS,
  SYSADMINS,
  TAX_TYPES,
  PRODUCT_TAX_CODES,
  TAX_GROUPS,
  TAX_GROUP_CELLS,
  GENRES,
  DEFAULT_TAX_GROUP,
} from "../data/seed";
import { buildHistory } from "../data/history";
import type {
  ClaimLineAgainst,
  CloseBatch,
  Customer,
  LedgerClosingTransaction,
  LedgerPeriodSeal,
  LedgerPeriodUnseal,
  LedgerYearFiling,
  GiftCard,
  Grade,
  IntakeMode,
  InventoryItem,
  Invoice,
  InvoiceCharge,
  InvoiceLine,
  JournalBatch,
  AdjustmentReason,
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
  Organization,
  Store,
  Terminal,
  Sysadmin,
  Principal,
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
  GenreMapRow,
  ProviderTag,
  ReleaseCacheEntry,
  ClaimVoid,
  Clearing,
  GLAccount,
  GLAccountType,
  GLMapping,
  GLSeamKind,
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
    // A-51 — no clamp. The balance is the sum of what moved, and the only
    // reason it can never go below zero is that addTender refuses the tender
    // that would take it there. Math.max(0, …) here was the silent loss A-51
    // names, and what issue #16 reported.
    gc = gc.map((g) => (g.code === tender.reference ? { ...g, balance: round2(g.balance - sign * tender.amount) } : g));
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
// paperwork. Takes the received date as one calendar day; anything
// unparseable falls back to today, because a reference that exists beats a
// blank one.
function mintSecondHandRef(receivedDate: string, invoices: Invoice[]): string {
  const iso = toCalendarDate(receivedDate) || new Date().toLocaleDateString("en-CA");
  const [y, m, d] = iso.split("-");
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
  genreMap: GenreMapRow[];
  releaseCache: ReleaseCacheEntry[];
  defaultTaxGroup: string;
  // E-01. The STAFF session is CLIENT state and can be nothing else (A-3 as
  // superseded by A-87, A-50 as revisited by A-88): what the database trusts
  // is the store session's own token, initials are attribution on top.
  // Modelled here for the same reason. The lapse it obeys is the Store's
  // setting (`storeSettings.sessionLapseSeconds`, M-06 d45) and nothing else.
  sessionUserId: string | null;
  sessionLastActivity: number;
  // M-04 §Managing users — a role change takes effect on the NEXT session:
  // the role the staff session opened with is what it keeps until it ends.
  sessionRole: UserRole | null;
  // WHO SIGNED IN (A-87): a store account, a person, or a System
  // Administrator. Null before any door is opened. See `Principal`.
  principal: Principal | null;
  // The Organization and its Stores (A-86). Identity only — what a Store HOLDS
  // is the per-Store slice, below.
  organizations: Organization[];
  stores: Store[];
  terminals: Terminal[];
  sysadmins: Sysadmin[];
  // THE PARTITION (A-86), as this in-memory prototype carries it. The Store
  // whose slice is currently loaded flat into this state is `activeStoreId`;
  // every other Store's slice is parked here, keyed by Store ID, and swapped
  // in when the principal's Store changes (`loadStore`). Every per-Store read
  // and write in this file therefore stays exactly as it was — E-01 d27's
  // "one Store at a time" is the shape of the state, not a filter on it.
  activeStoreId: string;
  parkedStores: Record<string, StoreSlice>;
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
  clearings: Clearing[]; // M-05 d46 — a clearing is an act with members, addressable like a batch
  // M-07 — the chart and its mappings. d1: no account carries a balance;
  // this is a chart and a journal export, not an internal ledger.
  glAccounts: GLAccount[];
  glMappings: GLMapping[];
  /**
   * M-07 d7, d12 — every journal this system has written, stored rather than
   * derived. d7: "storing rather than recomputing means a past day can never
   * quietly restate itself" — a journal derived at export time would let two
   * exports of the same week disagree, with the accountant holding one of them
   * and no way to tell which.
   *
   * One batch per CloseBatch, and one per artifact for everything else (d12).
   * Nothing sweeps this, nothing posts it, and there is no month-end routine.
   */
  journals: JournalBatch[];
  /**
   * M-08 — the books. Everything below is what M-07 d1 declined and d27
   * reversed: a period close, held balances, and a stated profit.
   *
   * A period's state is DERIVED from the seal and unseal rows and is never
   * stored (A-75) — there is deliberately no `sealed` flag here to forget.
   */
  ledgerSeals: LedgerPeriodSeal[];
  ledgerUnseals: LedgerPeriodUnseal[];
  ledgerYearFilings: LedgerYearFiling[];
  ledgerPostings: LedgerPosting[];
  /** A-78 — a draft until it is sealed, and the one place unbalanced figures
   *  legitimately exist. Null before the shop has migrated. */
  ledgerOpening: OpeningPositionDraft | null;
  ledgerOpeningSealed: boolean;
  /** d20, A-76 — the materialised recomputations. */
  ledgerClosings: LedgerClosingTransaction[];
  ledgerReconciliations: LedgerReconciliation[];
  /** A-77 — what has left the building. */
  ledgerIssuances: LedgerIssuance[];
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
  providerUp: boolean;
}

// ---------------------------------------------------------------------------
// The per-Store slice (A-86)
//
// What carries a Store: the physical and operational tables, every M-06
// setting table, and — for now — the catalog (A-86 keeps records, genres and
// the genre map per Store until a genre's Section and tax code can live at
// the Organization; §11). What does NOT carry a Store and stays flat for
// every Store of the Organization: users, customers, suppliers, gift cards,
// payables, the chart and the ledger.
// ---------------------------------------------------------------------------

const SLICE_KEYS = [
  "records",
  "inventory",
  "sections",
  "tenders",
  "currencies",
  "homeCurrency",
  "storeSettings",
  "storeDetails",
  "settingsLog",
  "taxTypes",
  "productTaxCodes",
  "taxGroups",
  "taxGroupCells",
  "genres",
  "genreMap",
  "defaultTaxGroup",
  "taxLines",
  "nonTracked",
  "sales",
  "closeBatches",
  "claims",
  "claimVoids",
  "invoices",
  "pendingOrders",
  "reviewFlags",
  "activeSaleId",
  "nextSaleNumber",
  "nextHold",
  "nextClaimNumber",
  "nextPoNumber",
  "nextInternalBarcode",
  "nextInvoiceRef",
] as const;

type SliceKey = (typeof SLICE_KEYS)[number];
export type StoreSlice = Pick<AppState, SliceKey>;

const sliceOf = (state: AppState): StoreSlice =>
  Object.fromEntries(SLICE_KEYS.map((k) => [k, state[k]])) as unknown as StoreSlice;

// Swap the flat slice for another Store's. The staff session goes with it —
// initials resolve among a Store's assigned people (E-01 d25), so a session
// opened at one counter means nothing at another.
function loadStore(prev: AppState, storeId: string): AppState {
  if (prev.activeStoreId === storeId) return prev;
  const incoming = prev.parkedStores[storeId];
  if (!incoming) return prev; // no slice for this Store — the caller should have made one
  const parked = { ...prev.parkedStores, [prev.activeStoreId]: sliceOf(prev) };
  delete parked[storeId];
  return { ...prev, ...incoming, activeStoreId: storeId, parkedStores: parked, sessionUserId: null, sessionRole: null };
}

// A Store opened in-product starts from M-06's defaults with nothing sold,
// held or owed (O-01 d2). The catalog is seeded from the same base as the home
// Store so the second Store is walkable in review; a real second Store
// adopts its own (A-6, A-86).
function freshStoreSlice(details: StoreDetails): StoreSlice {
  return {
    records: RECORDS,
    inventory: [],
    sections: SECTIONS,
    tenders: TENDERS,
    currencies: CURRENCIES,
    homeCurrency: HOME_CURRENCY,
    storeSettings: STORE_SETTINGS,
    storeDetails: details,
    settingsLog: [],
    taxTypes: TAX_TYPES,
    productTaxCodes: PRODUCT_TAX_CODES,
    taxGroups: TAX_GROUPS,
    taxGroupCells: TAX_GROUP_CELLS,
    genres: GENRES,
    genreMap: GENRE_MAP,
    defaultTaxGroup: DEFAULT_TAX_GROUP,
    taxLines: [],
    nonTracked: NON_TRACKED,
    sales: [],
    closeBatches: [],
    claims: [],
    claimVoids: [],
    invoices: [],
    pendingOrders: [],
    reviewFlags: [],
    activeSaleId: null,
    nextSaleNumber: 1,
    nextHold: 1,
    nextClaimNumber: 1,
    nextPoNumber: 0,
    nextInternalBarcode: 1,
    nextInvoiceRef: 1,
  };
}

const PLATEAU_DETAILS: StoreDetails = {
  ...STORE_DETAILS,
  tradingName: "Wax Works — Plateau",
  address: { line1: "5122 Boulevard Saint-Laurent", city: "Montreal", provinceState: "QC", country: "Canada" },
  phone: "514-555-0200",
  email: "plateau@waxworks.example",
  storeId: PLATEAU_STORE_ID,
  position: 2,
};

// M-06 d64 - the fiscal year end defaults to 31 December, and M-08 d5 has this
// flow READ it and never ask. One constant until M-06's settings screens land.
const FISCAL_YEAR_END_MONTH = 12;

// Hoisted out of the seed literal below so the history generator can be
// handed them: they are artifacts this prototype wrote before anything in
// it wrote journals, and `data/history.ts` explains why they need one.
const SEED_INVOICES: Invoice[] = [
  {
    id: "inv-seed-fab",
    supplierId: "sup-fab",
    invoiceNumber: "55021",
    intakeMode: "New",
    invoiceDate: "2026-08-27",
    receivedDate: "2026-08-28",
    statedSubtotal: 68.65,
    freight: 0,
    charges: [],
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
    // M-06 d59 — this supplier bills in USD, so the Invoice carries the rate
    // it was booked at. Seeded because the fallback for an Invoice with no
    // recorded rate is 1, which is correct for an artifact written before the
    // field existed and makes the prototype demonstrate the opposite of what
    // it now does: a USD invoice settling at par, which is the defect d59
    // closed. 1.42 matches the seeded USD rate in CURRENCIES.
    exchangeRate: 1.42,
    statedSubtotal: 17.25,
    freight: 0,
    charges: [],
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
    freight: 0,
    charges: [],
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
];

const SEED_PAYMENT_BATCHES: PaymentBatch[] = [
  {
    id: "batch-seed-1",
    supplierId: "sup-crate",
    method: "EFT",
    reference: "EFT-88214",
    date: "2026-08-20",
    recordedBy: MANAGER_NAME,
    createdAt: "2026-08-20 14:00:00",
    targets: [{ kind: "invoice", id: "inv-seed-crate-paid", amount: 20.0, settleKind: "money" }],
    credits: [], // A-69 — money only, so no credit funded it
  },
];

const SEEDED_CHART = buildChart({ sections: SECTIONS, tenders: TENDERS, taxTypes: TAX_TYPES });

/**
 * A month of trading, generated at load against the real calendar — see
 * `data/history.ts` for what it is and, more importantly, what it is not.
 *
 * It is built HERE rather than in `seed.ts` because it needs the chart above:
 * every artifact it makes writes its own journal (M-07 d12, A-67) through the
 * same builders the app calls, and a journal needs accounts to resolve into.
 *
 * `SEED_JOURNALLED` hands it the artifacts `seed.ts` already held so those get
 * journals too — without which the ledger's Accounts payable would exclude the
 * shop's own seeded debt.
 */
const SEED_JOURNALLED_INVOICES = SEED_INVOICES.filter((iv) => iv.status === "Finalized");

const HISTORY = buildHistory({
  accounts: SEEDED_CHART.accounts,
  mappings: SEEDED_CHART.mappings,
  sections: SECTIONS,
  tenders: TENDERS,
  taxTypes: TAX_TYPES,
  taxGroupCells: TAX_GROUP_CELLS,
  defaultTaxGroup: DEFAULT_TAX_GROUP,
  homeCurrency: HOME_CURRENCY,
  storeId: STORE_DETAILS.storeId,
  legacy: { invoices: SEED_JOURNALLED_INVOICES, paymentBatches: SEED_PAYMENT_BATCHES },
});

const seed: AppState = {
  records: [...RECORDS, ...HISTORY.records],
  inventory: [...INVENTORY, ...HISTORY.inventory],
  customers: [...CUSTOMERS, ...HISTORY.customers],
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
  genreMap: GENRE_MAP,
  releaseCache: RELEASE_CACHE,
  defaultTaxGroup: DEFAULT_TAX_GROUP,
  sessionUserId: null,
  sessionLastActivity: Date.now(),
  sessionRole: null,
  principal: null,
  organizations: ORGANIZATIONS,
  stores: STORES,
  terminals: TERMINALS,
  sysadmins: SYSADMINS,
  activeStoreId: HOME_STORE_ID,
  parkedStores: { [PLATEAU_STORE_ID]: freshStoreSlice(PLATEAU_DETAILS) },
  suppliers: [...SUPPLIERS, ...HISTORY.suppliers],
  giftCards: GIFT_CARDS,
  taxLines: TAX_LINES,
  nonTracked: NON_TRACKED,
  sales: [
    // ONE hand-written Sale, and it is Held: a hold is a live document that
    // belongs to no CloseBatch and writes no journal, so it is the one shape
    // that can be authored here without lying about the books. E-05's
    // "select an existing Held sale" needs it, and it carries no Sale number,
    // so it cannot collide with the numbering the generated month issues.
    //
    // The three Closed Sales that used to sit above it are gone. Two of them
    // carried no InventoryItem at all, so `costPostings` (lib/closeJournal.ts)
    // returned nothing for their lines and a journal over them would have
    // balanced while reporting revenue with NO cost of goods behind it. What
    // they were fixtures for — E-03's *Had before* band, at both ends of the
    // recency stamp, and a prior Sale for E-06 to link a Return against — the
    // generated month now supplies with copies, an Invoice, a close and a
    // journal behind each one (see SELL_OUTS in data/history.ts).
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
    // The month of trading — see `data/history.ts`. Appended rather than
    // replacing the four above: those exist to give E-06's return-linking and
    // Search's "had before" state something specific to match, and the
    // generator does not know about either.
    ...HISTORY.sales,
  ],
  closeBatches: HISTORY.closeBatches,
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
  invoices: [...SEED_INVOICES, ...HISTORY.invoices],
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
    ...HISTORY.payableEntries,
  ],
  paymentBatches: [...SEED_PAYMENT_BATCHES, ...HISTORY.paymentBatches],
  batchVoids: [],
  clearings: [],
  // M-07 d11 — created and mapped before anyone sees the screen, so nothing
  // can be left unmapped and d10's Suspense stays a defect rather than a hole.
  glAccounts: SEEDED_CHART.accounts,
  glMappings: SEEDED_CHART.mappings,
  ledgerSeals: [],
  ledgerUnseals: [],
  ledgerYearFilings: [],
  ledgerPostings: [],
  ledgerOpening: null,
  ledgerOpeningSealed: false,
  ledgerClosings: [],
  ledgerReconciliations: [],
  ledgerIssuances: [],
  journals: HISTORY.journals,
  pendingOrders: PENDING_ORDERS,
  reviewFlags: [],
  activeSaleId: null,
  lastViewedSupplierId: null,
  lastViewedCustomerId: null,
  nextSaleNumber: HISTORY.nextSaleNumber,
  nextHold: 2,
  nextClaimNumber: 42, // d26 — 36, 40 and 41 are spent; gaps are expected
  nextPoNumber: 0,
  nextInternalBarcode: HISTORY.nextInternalBarcode,
  nextInvoiceRef: 1,
  nextCustomerPrimaryId: CUSTOMERS.length + HISTORY.customers.length + 1,
  providerUp: true,
};

interface AppContextValue extends AppState {
  activeSale: Sale | null;
  sessionUser: User | null;
  actorName: string;
  identify: (userId: string) => void;
  endSession: () => void;
  touchSession: () => void;
  sessionLastActivity: number;
  // ---- The principals (A-87) ----
  // The Store whose slice is loaded — the store session's Store, or the Store
  // a personal session picked. Null only for a System Administrator or before
  // sign-in, neither of which reaches a Store screen.
  currentStoreId: string | null;
  currentStore: Store | null;
  // A Store's details whether or not its slice is the one loaded — the picker
  // and the Organization screen name Stores that are not in session.
  storeDetailsFor: (storeId: string) => StoreDetails;
  terminalName: string;
  isPersonalSession: boolean;
  // E-01 d24 — a terminal signs in with the Store's store account.
  signInStoreAccount: (email: string, password: string, terminalId: string) => { ok: true } | { ok: false; refusal: string };
  // E-01 d27, d28 — a Manager or Owner signs in as themselves; the store
  // checks the password AND the second factor, never the screen alone.
  signInPersonal: (email: string, password: string, otp: string) => { ok: true } | { ok: false; refusal: string };
  // S-01 d4 — passkey only; the prototype's passkey is a button.
  signInSysadmin: (email: string) => { ok: true } | { ok: false; refusal: string };
  signOut: () => void;
  // E-01 d27 — the Store pick on a personal session, refused where not
  // assigned unless Owner (A-87: the pick is a write).
  selectStore: (storeId: string) => { ok: true } | { ok: false; refusal: string };
  selectableStores: () => Store[];
  // E-01 d26 / A-89 — the store-session door to the manager-only line. A miss
  // names nobody.
  authorizeByPin: (pin: string) => ReturnType<typeof authorizeByPinLib>;
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
  genreMap: GenreMapRow[];
  releaseCache: ReleaseCacheEntry[];
  defaultTaxGroup: string;
  taxCtxFor: (sale?: Sale | null) => TaxContext;
  productTaxCodeForRecord: (recordId?: string) => string;
  upsertTaxType: (row: TaxType, by: ManagerAuth) => SettingsWriteResult;
  setTaxCell: (groupId: string, productTaxCode: string, spec: string, by: ManagerAuth) => SettingsWriteResult;
  upsertTaxGroup: (row: TaxGroup, by: ManagerAuth) => SettingsWriteResult;
  setDefaultTaxGroup: (groupId: string, by: ManagerAuth) => void;
  setStoreSetting: <K extends keyof StoreSettings>(key: K, value: StoreSettings[K], by: ManagerAuth) => void;
  setStoreDetail: (key: keyof Omit<StoreDetails, "storeId" | "position">, value: string | boolean | PostalAddress, by: ManagerAuth) => void;
  upsertSection: (row: SectionRow, by: ManagerAuth) => SettingsWriteResult;
  upsertGenre: (row: Genre, by: ManagerAuth) => SettingsWriteResult;
  adoptRelease: (releaseId: string, genreId: string, price?: number) => RecordEntry | null;
  resolveAdoptionGenre: (releaseId: string) => {
    release: ReleaseCacheEntry | undefined;
    match: GenreMatch | undefined;
    unmapped: ProviderTag[];
  };
  // A-59 — NOT manager-only: adding a row for a tag that has none cannot
  // change where anything already goes. Update and remove below stay M.
  addMapRow: (tag: string, genreId: string, by: string) => SettingsWriteResult;
  updateMapRow: (tag: string, patch: Partial<GenreMapRow>, by: ManagerAuth) => SettingsWriteResult;
  removeMapRow: (tag: string, by: ManagerAuth) => SettingsWriteResult;
  mergeGenres: (fromId: string, toId: string, by: ManagerAuth) => SettingsWriteResult;
  deleteGenre: (genreId: string, by: ManagerAuth) => SettingsWriteResult;
  genreUseCount: (genreId: string) => number;
  upsertTender: (row: TenderRow, by: ManagerAuth) => SettingsWriteResult;
  upsertCurrency: (row: CurrencyRow, by: ManagerAuth) => SettingsWriteResult;
  setHomeCurrency: (code: string, by: ManagerAuth) => void;
  userFor: (id?: string) => User | undefined;
  activeManagerCount: () => number;
  // Every one of these is manager-only (A-55) and every one returns a reason
  // rather than throwing, because M-04 d13 and A-54 both require the refusal
  // to say WHICH thing blocked it - a refusal that does not name its cause
  // reads as the system simply saying no.
  // M-04 d27: a User is assigned to Stores. Until the shell carries the store
  // session, an omitted assignment means the home Store.
  addUser: (
    input: { name: string; initials: string; role: UserRole; assignments?: string[]; email?: string; pin?: string },
    by: ManagerAuth,
  ) => UserWriteResult;
  changeUserRole: (userId: string, role: UserRole, by: ManagerAuth) => UserWriteResult;
  deactivateUser: (userId: string, by: ManagerAuth) => UserWriteResult;
  reactivateUser: (userId: string, initials: string, by: ManagerAuth) => UserWriteResult;
  correctUser: (userId: string, patch: { name?: string; initials?: string; email?: string }, by: ManagerAuth) => UserWriteResult;
  // M-04 d28, d32 — a PIN is set by an Owner or Manager; a clash names nobody
  // and is logged.
  setUserPin: (userId: string, pin: string, by: ManagerAuth) => UserWriteResult;
  // M-04 d27 — assignment is where initials and PINs collide.
  assignToStore: (userId: string, storeId: string, by: ManagerAuth) => UserWriteResult;
  unassignFromStore: (userId: string, storeId: string, by: ManagerAuth) => UserWriteResult;
  // M-04 d29 — an emailed link; the log records that it was sent.
  requestPasswordReset: (userId: string, by: ManagerAuth) => UserWriteResult;
  // M-04 d29 — the landing of that link. No `by`: the person set it themselves.
  setOwnPassword: (userId: string, password: string) => UserWriteResult;
  // ---- O-01 — the Organization (Owner-only, d1) ----
  // d2 / M-06 d70 — the system mints the Store ID and position; the Store
  // starts from M-06 defaults with nobody assigned.
  addStore: (
    input: { tradingName: string; accountEmail: string; accountPassword: string },
    by: ManagerAuth,
  ) => { ok: true; id: string } | { ok: false; reason: string };
  // d3 — typed by the Owner, logged never as a value; signs every terminal of
  // the Store out (E-01 d24).
  setStoreAccountPassword: (storeId: string, password: string, by: ManagerAuth) => { ok: true; id: string } | { ok: false; reason: string };
  // ---- S-01 — the System Administrator's three functions (A-90) ----
  // Each asserts the principal is a System Administrator and logs into the
  // Organization it touched, where its Owners read it (S-01 d3, O-01 d5).
  // S-01 d5 — name and email only; the Owner takes initials at their first
  // assignment (M-04 d34).
  createOrganization: (input: { name: string; ownerName: string; ownerEmail: string }) => { ok: true; id: string } | { ok: false; reason: string };
  sysadminRequestOwnerReset: (userId: string) => { ok: true } | { ok: false; reason: string };
  sysadminRecoverOwner: (
    orgId: string,
    how: { reactivate: string } | { invite: { name: string; email: string } },
  ) => { ok: true } | { ok: false; reason: string };
  // The people and Stores of the Organization in session — a Store screen
  // never lists another Organization's (A-86).
  orgUsers: User[];

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
  /**
   * M-03's close, which M-07 d7 makes produce a SECOND artifact: the journal.
   * Returned alongside the breakdown so the close screen can tell the Manager
   * what was written, and tell them loudly when it did not balance (d10).
   */
  // A-28a gates **Undo End of Day**, not the close itself, and M-04 d2 makes
  // anything unlisted an Employee action. This takes the acting actor.
  totalTodaysSales: (by: string) => {
    batchId: string;
    breakdown: DayBreakdown;
    journal: JournalBatch;
    unresolved: string[];
    ambiguousTenders: string[];
  };
  /**
   * M-04 d4 — records both names. `actor` is whoever holds the session; omit
   * it when nobody does and the authorizing Manager stands in, since they are
   * then the person at the terminal. The till therefore asks **once**.
   */
  undoEndOfDay: (batchId: string, by: ManagerAuth, actor?: string) => void;
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
  // A-51 — returns the refusal when a Gift Card tender would overdraw its
  // card, and writes nothing. Every other tender returns null.
  addTender: (saleId: string, t: Omit<Tender, "id">) => string | null;
  removeTender: (saleId: string, tenderId: string) => void;
  completeSale: (saleId: string) => number;
  /**
   * E-06 d29 — record the stock disposition on a returned line, on the draft.
   * Validates the write-off gate (A-28a) and the re-grade cap (A-82) here, at
   * the moment of choosing, and mints nothing.
   */
  chooseReturnRoute: (
    saleId: string,
    lineId: string,
    to: "sellable" | "regrade" | "writeoff",
    opts?: {
      grade?: Grade;
      price?: number;
      reason?: AdjustmentReason;
      assessedCost?: number;
      byAuth?: ManagerAuth;  // the live authorization, checked now
    },
  ) => { chosen: boolean; refusal?: string };
  /**
   * E-06 d29 — finish a Return: refuse while any returned line is undecided,
   * otherwise carry out every chosen disposition and tender the document as
   * one act. Returns the Sale number, or the refusal.
   */
  finishReturn: (saleId: string) => { saleNumber?: number; refusal?: string };
  /** E-06 d29 — why this Return cannot be finished yet, for the screen to show. */
  finishReturnBlocked: (saleId: string) => string | undefined;
  /** E-06 d30 — why the stock refuses a void, naming the copy. A pure read. */
  voidStockRefusal: (saleId: string) => string | undefined;
  holdSale: (saleId: string) => string;
  // E-05 d31 — refuses unless the tenders net zero, returning how much is
  // still on the Sale so the caller can offer to refund it, move it onto the
  // Customer's account, or remove the line. E-06 d10 — also refuses while a
  // Return has routed stock, since putting that back is its own job.
  voidSale: (saleId: string) => {
    voided: boolean;
    outstanding: number;
    routedCopies: number;
    /** E-06 d30 — why the stock refuses the void, naming the copy. */
    refusal?: string;
  };
  cancelHold: (saleId: string) => void;
  releaseHoldLine: (itemId: string) => { holdRef: string; holdClosed: boolean } | null;
  forceUnlockSale: (saleId: string) => void;
  acknowledgeReviewFlag: (id: string, by: ManagerAuth) => void;

  // ---- M-08, the books ----------------------------------------------------
  // Every one is MANAGER-ONLY (A-74), so every one takes the authorising
  // Manager's initials. None of them decides anything: the refusal functions in
  // lib/ledger*.ts are the rules, and these store whatever those permit.
  ledgerSaveOpening: (draft: OpeningPositionDraft) => void;
  ledgerSealOpening: (by: ManagerAuth) => void;
  ledgerPost: (posting: Omit<LedgerPosting, "writtenAt">, by: ManagerAuth) => void;
  ledgerSeal: (period: string, suspenseGross: number, by: ManagerAuth) => void;
  ledgerUnseal: (period: string, reason: string, by: ManagerAuth) => void;
  ledgerMarkYearFiled: (fiscalYearEnd: string, by: ManagerAuth) => void;
  ledgerReconcile: (reconciliation: LedgerReconciliation) => void;
  ledgerIssue: (issuance: LedgerIssuance) => void;
  /** d40, M-07 d25 — a period's Suspense total, gross. What the seal refuses on. */
  ledgerSuspenseGross: (period: string) => number;
  /** M-08 d11 - why an Undo End of Day is refused, or undefined. */
  closeUndoRefusalFor: (batchId: string) => string | undefined;
  reconcileOversold: (recordId: string, by: ManagerAuth) => number;
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
    /**
     * E-04's reason code, required by `writeoff` and meaningless otherwise.
     *
     * The screen has said *"reason-coded adjustment (E-04)"* since it was
     * written and never asked which code, so the write-off had no reason on it
     * — which is the one thing E-04's six codes exist for. M-07 d6 is what
     * made the omission cost something: without a code there is no account to
     * post to, and *"collapsing them in the ledger throws away the only thing
     * that choice was for."*
     */
    reason?: AdjustmentReason,
    /**
     * The authorizing Manager, for the `writeoff` route only — architecture
     * §6 gates `return_route_stock` **M** where the route is *written off*.
     *
     * REQUIRED BY THE WRITE PATH, not by the screen. A-4 and A-48: a bound
     * enforced in the client is not a bound. The screen presenting
     * `ManagerAuthorize` is how a Manager is asked; this parameter is what
     * makes the absence of one a refusal rather than a convention, so a second
     * caller cannot route a write-off by forgetting to ask.
     */
    by?: ManagerAuth,
    /**
     * The re-grade route only — what the copy is assessed at now that it has
     * come back in a different condition. **Capped at the cost the sold copy
     * carried** (A-82, E-06 d19); the write path refuses above it, because the
     * excess would be income the store did not earn. Defaults to the sold
     * copy's cost when the Employee does not move it, which is the ordinary
     * case: most discs come back fine.
     */
    assessedCost?: number,
  ) => { routed: boolean; refusal?: string };
  toggleProvider: () => void;

  invoiceFor: (id?: string) => Invoice | undefined;
  startInvoice: (input: {
    supplierId: string;
    intakeMode: IntakeMode;
    invoiceNumber: string;
    invoiceDate: string;
    receivedDate: string;
    statedSubtotal: number;
    freight: number;
    /** E-02 d53 — the labelled charges, pre-seeded per configured tax type. */
    charges: InvoiceCharge[];
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
    patch: Partial<Pick<Invoice, "statedSubtotal" | "freight" | "charges" | "invoiceDate" | "paymentTerms" | "paymentMethod">>,
  ) => void;
  setInvoiceTotalOverride: (invoiceId: string, value?: number) => void;
  /**
   * E-02 step 22, and M-07 d13's journal alongside it. The journal comes back
   * so Receiving can tell the Employee what was written and, where it did not
   * balance, say so in d10's terms rather than leaving it to the review queue.
   */
  finalizeInvoice: (
    invoiceId: string,
  ) => { itemCount: number; journal: JournalBatch; unresolved: string[] } | null;
  markInvoicePaid: (invoiceId: string, by: ManagerAuth) => void;

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
      /**
       * architecture A-65 — the account this payment drew on, defaulted from
       * the Method and overridable. Absent falls back to the reserved bank
       * account, which is what every settlement assumed before A-65 was built.
       */
      drawnOnAccountId?: string;
      /**
       * M-06 d60 — what actually LEFT THE BANK, in the home currency. Only ever
       * sent for a Supplier whose currency is not the home currency; absent
       * reads as "no rate movement", which for a domestic payment is a fact
       * rather than an assumption.
       */
      paidAmount?: number;
      // A-69 — a debit carries what it is being settled with, not which credit
      // funded it. The credits are named on the batch.
      debits: { kind: PayableTargetKind; id: string; credit?: number; money?: number; balance: number; reference: string }[];
      credits: { id: string; amount: number; label: string }[];
      placeholderIds: string[];
    },
    by: ManagerAuth,
  ) => void;
  // M-05 d22/d30 — appended, never edited; never refuses.
  voidPaymentBatch: (batchId: string, by: ManagerAuth) => void;

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
  clearPayableEntries: (entryIds: string[], by: ManagerAuth) => { cleared: boolean };
  // M-05 d39 — a clearing is a REVERSIBLE MARK, not a terminal state.
  // d46 — addressed by the CLEARING, the way a void addresses a batch.
  unclearPayableEntries: (clearingId: string, by: ManagerAuth) => { uncleared: boolean; reason?: string };
  // M-07 — the chart. d3: the number and name are the store's; the ROLE is not
  // editable, because the software resolves by it.
  updateGLAccount: (id: string, patch: { number?: string; name?: string; active?: boolean }) => void;
  // d22 — a type is asked for HERE and nowhere else: this is the only account
  // with no role to derive one from.
  addGLAccount: (number: string, name: string, type: GLAccountType) => void;
  setGLMapping: (seamKind: GLSeamKind, seamId: string, accountId: string) => void;

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
    by?: ManagerAuth,
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
  const [s, setS] = useState<AppState>(() => {
    // A-87 — the store session is the terminal's and does not lapse; in the
    // product its token outlives a reload. This is what the terminal remembers
    // between page loads. The STAFF session (initials) is deliberately not
    // remembered: it is a timer in the browser and starts over (A-88).
    const remembered = readStored<Principal | null>("ww.principal", null);
    if (!remembered) return seed;
    const storeId =
      remembered.kind === "store" ? remembered.storeId : remembered.kind === "personal" ? remembered.selectedStoreId : null;
    const base = storeId && (storeId === seed.activeStoreId || seed.parkedStores[storeId]) ? loadStore(seed, storeId) : seed;
    return { ...base, principal: remembered };
  });
  useEffect(() => writeStored("ww.principal", s.principal), [s.principal]);

  // -------------------------------------------------------------------------
  // The staff session (E-01)
  //
  // An actor and a timer, in the browser. A-3 and A-50 are explicit that it
  // can be nothing else — the lapse "is a client-side timer and can be
  // nothing else" — so the prototype models it in exactly the place the real
  // thing will live, rather than pretending there is a session row.
  // -------------------------------------------------------------------------

  const principal = s.principal;
  const currentStoreId: string | null =
    principal?.kind === "store" ? principal.storeId : principal?.kind === "personal" ? principal.selectedStoreId : null;
  const currentStore = s.stores.find((x) => x.id === currentStoreId) ?? null;
  const terminalName =
    (principal?.kind === "store" ? s.terminals.find((t) => t.id === principal.terminalId)?.name : undefined) ?? "—";
  const isPersonalSession = principal?.kind === "personal";
  const storeDetailsFor: AppContextValue["storeDetailsFor"] = (storeId) =>
    storeId === s.activeStoreId ? s.storeDetails : (s.parkedStores[storeId]?.storeDetails ?? s.storeDetails);

  // Who is acting. On a store session it is the staff session — initials,
  // resolved among the people ASSIGNED to this Store (E-01 d25). On a
  // personal session it is the person: the session IS the actor and cannot
  // change (E-01 d27), which is why nothing prompts and nothing lapses.
  const sessionUser: User | null = (() => {
    if (principal?.kind === "personal") return s.users.find((u) => u.id === principal.userId && u.active) ?? null;
    if (principal?.kind === "store") {
      const u = s.users.find((x) => x.id === s.sessionUserId && x.active && x.assignments.includes(principal.storeId)) ?? null;
      // The role the session opened with (M-04: a role change takes effect on
      // the next session). What a manager-only write trusts is still resolved
      // live from the row (A-55, A-89) — this is only what the session is.
      return u && s.sessionRole ? { ...u, role: s.sessionRole } : u;
    }
    return null;
  })();

  // The Organization in session (A-86): the Store's, or the person's.
  const currentOrgId = currentStore?.orgId ?? sessionUser?.orgId ?? HOME_ORG_ID;
  const orgUsers = s.users.filter((u) => u.orgId === currentOrgId);

  // What every attributed write stamps. With no staff session open the actions
  // that reach the store have all prompted for initials first (d5, d12, d15),
  // so the fallback names the PRINCIPAL rather than a constant — it is honest
  // (that is who is signed in) and it makes any write that skipped the prompt
  // visible in a log.
  // E-01 d26 / M-04 d4, d31 — BOTH NAMES. On a store session a manager-only
  // act carries the Manager whose PIN it was AND the Employee whose session it
  // was; on a personal session the one name is both. Applied wherever a gated
  // write derives the name it records, so no write can forget the second.
  const recorded = (managerName: string, managerUserId: string): string =>
    principal?.kind === "store" && sessionUser && sessionUser.id !== managerUserId
      ? `${managerName}, for ${sessionUser.name} (${sessionUser.role})`
      : managerName;

  const actorName: string = sessionUser
    ? `${sessionUser.name} (${sessionUser.role})`
    : principal?.kind === "store"
      ? `Store account · ${currentStore?.id === s.activeStoreId ? s.storeDetails.tradingName : currentStore?.id}`
      : principal?.kind === "sysadmin"
        ? `${s.sysadmins.find((x) => x.id === principal.sysadminId)?.name ?? "System Administrator"} (System Administrator)`
        : CURRENT_USER;

  const identify: AppContextValue["identify"] = (userId) =>
    setS((prev) => ({
      ...prev,
      sessionUserId: userId,
      sessionRole: prev.users.find((u) => u.id === userId)?.role ?? null,
      sessionLastActivity: Date.now(),
    }));

  const endSession: AppContextValue["endSession"] = () =>
    setS((prev) => ({ ...prev, sessionUserId: null, sessionRole: null }));

  const touchSession: AppContextValue["touchSession"] = () =>
    setS((prev) => (prev.sessionUserId ? { ...prev, sessionLastActivity: Date.now() } : prev));

  // -------------------------------------------------------------------------
  // The principals (A-87) — the three doors of E-01 and S-01
  // -------------------------------------------------------------------------

  const signInStoreAccount: AppContextValue["signInStoreAccount"] = (email, password, terminalId) => {
    const r = signInStoreAccountLib(s.stores, email, password);
    if (!r.ok) return r;
    const storeId = r.value.storeId;
    const terminal = s.terminals.find((t) => t.id === terminalId && t.storeId === storeId) ?? s.terminals.find((t) => t.storeId === storeId);
    setS((prev) => ({
      ...loadStore(prev, storeId),
      principal: { kind: "store", storeId, terminalId: terminal?.id ?? terminalId },
      sessionUserId: null,
    }));
    return { ok: true };
  };

  const signInPersonal: AppContextValue["signInPersonal"] = (email, password, otp) => {
    const r = signInPersonalLib(s.users, email, password);
    if (!r.ok) return r;
    // E-01 d28 — not open until the second factor is entered. Checked here,
    // where the session is minted, and not only on the screen.
    if (!otpAccepted(otp)) return { ok: false, refusal: "That code was not accepted." };
    setS((prev) => ({ ...prev, principal: { kind: "personal", userId: r.value.userId, selectedStoreId: null }, sessionUserId: null }));
    return { ok: true };
  };

  const signInSysadmin: AppContextValue["signInSysadmin"] = (email) => {
    const r = signInSysadminLib(s.sysadmins, email);
    if (!r.ok) return r;
    setS((prev) => ({ ...prev, principal: { kind: "sysadmin", sysadminId: r.value.sysadminId }, sessionUserId: null }));
    return { ok: true };
  };

  const signOut: AppContextValue["signOut"] = () => setS((prev) => ({ ...prev, principal: null, sessionUserId: null }));

  const selectableStores: AppContextValue["selectableStores"] = () => {
    if (!sessionUser || principal?.kind !== "personal") return [];
    return selectableStoresLib(s.stores, sessionUser);
  };

  const selectStore: AppContextValue["selectStore"] = (storeId) => {
    if (principal?.kind !== "personal" || !sessionUser) return { ok: false, refusal: "Only a personal session picks a Store (E-01 d27)." };
    if (!selectableStoresLib(s.stores, sessionUser).some((x) => x.id === storeId))
      return { ok: false, refusal: `${sessionUser.name} is not assigned to that Store (E-01 d27).` };
    setS((prev) => {
      const next = loadStore(prev, storeId);
      return { ...next, principal: { kind: "personal", userId: sessionUser.id, selectedStoreId: storeId } };
    });
    return { ok: true };
  };

  const authorizeByPin: AppContextValue["authorizeByPin"] = (pin) => {
    if (principal?.kind !== "store")
      return { ok: false, refusal: "A PIN is asked only on a store session (E-01 d26)." };
    return authorizeByPinLib(s.users, principal.storeId, pin);
  };


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

  /**
   * architecture A-68 — a flag with NO ACTOR, because the system raised it.
   * `actor_user_id` is nullable and null means the system; the review queue
   * stops meaning *what the staff did* and starts meaning *what wants a look*,
   * which is the loosening A-68 accepted on purpose.
   *
   * Separate from `raiseReviewFlag` rather than a nullable argument to it: the
   * two have different truth conditions, and a single function taking an
   * optional actor is how a missing one becomes a bug instead of a statement.
   */
  const raiseSystemReviewFlag = (kind: ReviewFlagKind, summary: string) =>
    setS((prev) => ({
      ...prev,
      reviewFlags: [
        { id: uid("flag"), kind, summary, recordedBy: undefined, at: now(), acknowledged: false },
        ...prev.reviewFlags,
      ],
    }));

  /**
   * The same telling, for a journal written inside a `setS` updater.
   *
   * A-67 puts a journal in the same transaction as its artifact, so an artifact
   * journal is built and stored inside the updater that writes the artifact —
   * and `raiseSystemReviewFlag` cannot be called from in there without nesting
   * one state update inside another. This returns the new queue instead, so the
   * flag and the journal land in the same commit, which is the point.
   *
   * d10's rule is unchanged: Suspense keeps the journal balanced by
   * construction, and this is what stops a balanced-but-wrong one going quiet.
   */
  const journalFlags = (
    result: { batch: JournalBatch; unresolved: string[] },
    what: string,
    existing: ReviewFlag[],
  ): ReviewFlag[] => {
    if (!isImbalanced(result.batch)) return existing;
    return [
      {
        id: uid("flag"),
        kind: "journal-imbalance",
        summary:
          `The journal for ${what} did not balance by ${money(result.batch.suspense ?? 0)}, and the difference was posted to Suspense so the work could proceed. ` +
          `This is a defect in this software, not something anyone did — there is nothing for you to correct. ` +
          (result.unresolved.length ? `Unresolved: ${result.unresolved.join("; ")}.` : `The cause is not visible from here; report it.`),
        // A-68 — null actor. The system raised it.
        recordedBy: undefined,
        at: now(),
        acknowledged: false,
      },
      ...existing,
    ];
  };

  const acknowledgeReviewFlag: AppContextValue["acknowledgeReviewFlag"] = (id, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => ({
      ...prev,
      reviewFlags: prev.reviewFlags.map((f) =>
        f.id === id ? { ...f, acknowledged: true, acknowledgedBy: by, acknowledgedAt: now() } : f,
      ),
    }));
  };

  // -------------------------------------------------------------------------
  // M-08 - the books
  // -------------------------------------------------------------------------
  //
  // Thin on purpose. A-74 moves M-08's invariants into the definer function and
  // out of the screen, and in the prototype the lib modules ARE that function:
  // every refusal is a *Refusal() in lib/ledger*.ts, tested there, and called by
  // the screen before it calls any of these. A second copy of a rule here would
  // be the divergence A-48 warns about wearing a different hat.

  const ledgerSaveOpening: AppContextValue["ledgerSaveOpening"] = (draft) =>
    setS((prev) => ({ ...prev, ledgerOpening: draft }));

  // A-78 - sealing MATERIALISES equity as a journal line. Until this runs the
  // opening position is a draft carrying assets and liabilities only, and
  // nothing may read it as though it were a journal.
  const ledgerSealOpening: AppContextValue["ledgerSealOpening"] = (byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    setS((prev) => {
      if (!prev.ledgerOpening || prev.ledgerOpeningSealed) return prev;
      const equity = prev.glAccounts.find((a) => a.role === "owners-equity");
      const suspense = prev.glAccounts.find((a) => a.role === "suspense");
      if (!equity || !suspense) return prev;
      const sealed = sealOpeningPosition(
        prev.ledgerOpening,
        prev.glAccounts,
        equity.id,
        suspense.id,
        now(),
      );
      return {
        ...prev,
        ledgerOpeningSealed: true,
        journals: [sealed.batch, ...prev.journals],
        // d28's typed figure is DISCARDED; only the acknowledgement survives,
        // carried on the sealed artifact.
        ledgerOpening: { ...prev.ledgerOpening, accountantsEquity: undefined },
      };
    });
  };

  // Step 15 - the posting joins the journal beside everything artifacts wrote.
  const ledgerPost: AppContextValue["ledgerPost"] = (posting, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => {
      const suspense = prev.glAccounts.find((a) => a.role === "suspense");
      if (!suspense) return prev;
      const full: LedgerPosting = { ...posting, writtenAt: now(), authorizedByInitials: by };
      // Throws rather than writing a Suspense line if it does not balance - the
      // screen has already called postingRefusal, so reaching that throw means
      // the screen skipped its own gate.
      const batch = postingJournal(full, suspense.id, prev.homeCurrency);
      return {
        ...prev,
        ledgerPostings: [full, ...prev.ledgerPostings],
        journals: [batch, ...prev.journals],
      };
    });
  };

  // A-75 - a seal APPENDS a row, and d20/A-76 write the closing transaction as
  // the result of the recomputation. The two happen together because A-76's
  // "stored is by definition the last recomputed" is only true if nothing can
  // seal without recomputing.
  const ledgerSeal: AppContextValue["ledgerSeal"] = (period, suspenseGross, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => {
      const seal: LedgerPeriodSeal = {
        id: "seal-" + period + "-" + (prev.ledgerSeals.length + 1),
        period,
        sealedAt: now(),
        actorInitials: by,
        authorizedByInitials: by,
      };

      // d17 - where this seal ends a fiscal year it writes VISIBLE closing
      // postings first. The ORDER is the substance: the zeroing is dated the
      // last day of the year, which is inside the period being sealed, so the
      // closing transaction must be computed from journals that already carry
      // it. Recompute first and the seal stores balance-forwards the zeroing
      // never reached, which is A-76's divergence arriving by our own hand.
      const retained = prev.glAccounts.find((a) => a.role === "retained-earnings");
      const suspense = prev.glAccounts.find((a) => a.role === "suspense");
      const yearEnd =
        retained && suspense
          ? yearEndClosingBatch(
              period,
              FISCAL_YEAR_END_MONTH,
              prev.glAccounts,
              prev.journals,
              retained.id,
              suspense.id,
              now(),
            )
          : undefined;

      const journals = yearEnd ? [yearEnd, ...prev.journals] : prev.journals;

      return {
        ...prev,
        journals,
        ledgerSeals: [...prev.ledgerSeals, seal],
        ledgerClosings: [
          ...prev.ledgerClosings,
          closingTransactionFor(period, seal.id, journals, suspenseGross, now()),
        ],
      };
    });
  };

  // d18 - an unseal is an artifact: who, when, a required reason, and which
  // period it reopened. A-76 has a divergence against what was stored raise a
  // system flag with a null actor.
  const ledgerUnseal: AppContextValue["ledgerUnseal"] = (period, reason, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => {
      const live = prev.ledgerSeals
        .filter((x) => x.period === period)
        .find((x) => !prev.ledgerUnseals.some((u) => u.sealId === x.id));
      if (!live) return prev;

      const stored = prev.ledgerClosings.find((c) => c.sealId === live.id);
      const flag = stored
        ? divergenceFlag(stored, prev.journals, prev.ledgerSeals, prev.ledgerUnseals, now())
        : undefined;

      return {
        ...prev,
        ledgerUnseals: [
          ...prev.ledgerUnseals,
          {
            id: "unseal-" + period + "-" + (prev.ledgerUnseals.length + 1),
            sealId: live.id,
            unsealedAt: now(),
            actorInitials: by,
            authorizedByInitials: by,
            reason,
          },
        ],
        ...(flag ? { reviewFlags: [flag, ...prev.reviewFlags] } : {}),
      };
    });
  };

  // d22 - the only permanently irreversible state in this system.
  const ledgerMarkYearFiled: AppContextValue["ledgerMarkYearFiled"] = (fiscalYearEnd, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => ({
      ...prev,
      ledgerYearFilings: [
        ...prev.ledgerYearFilings,
        {
          id: "filed-" + fiscalYearEnd,
          fiscalYearEnd,
          filedAt: now(),
          actorInitials: by,
          authorizedByInitials: by,
        },
      ],
    }));
  };

  // d25 - a mark that moves no money. No journal is written here, ever.
  const ledgerReconcile: AppContextValue["ledgerReconcile"] = (reconciliation) =>
    setS((prev) => ({
      ...prev,
      ledgerReconciliations: [...prev.ledgerReconciliations, reconciliation],
    }));

  // d31, A-77 - what left the building, with its figures frozen.
  const ledgerSuspenseGross: AppContextValue["ledgerSuspenseGross"] = (period) => {
    const suspense = s.glAccounts.find((a) => a.role === "suspense");
    return suspense ? suspenseGrossFor(period, s.journals, suspense.id) : 0;
  };

  const ledgerIssue: AppContextValue["ledgerIssue"] = (issuance) =>
    setS((prev) => ({ ...prev, ledgerIssuances: [issuance, ...prev.ledgerIssuances] }));

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

  const upsertTaxType: AppContextValue["upsertTaxType"] = (row, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    const code = row.code.trim().toLowerCase();
    if (code.length !== 1) return { ok: false, reason: "A tax type code is a single letter." };
    if (!row.name.trim()) return { ok: false, reason: "A name is required." };
    if (row.ratePpm < 0) return { ok: false, reason: "A rate cannot be negative." };
    if ((row.pendingRatePpm === undefined) !== (row.pendingFrom === undefined))
      return { ok: false, reason: "A pending change needs both a rate and the date it starts (d52)." };
    const existing = s.taxTypes.find((x) => x.code === code);
    // d52 — an elapsed pending change is PROMOTED before a new one is
    // accepted. The rule lives in lib/tax.ts because the promotion used to be
    // computed here and then undone by the spread that followed it, which is
    // exactly the silent drop d52 forbids.
    const today = new Date().toISOString().slice(0, 10);
    const next: TaxType = {
      ...taxTypeWrite(existing, row, today),
      code,
      name: row.name.trim(),
    };
    setS((prev) => ({
      ...prev,
      taxTypes: existing ? prev.taxTypes.map((x) => (x.code === code ? next : x)) : [...prev.taxTypes, next],
    }));
    logSetting("Tax types", next.name, existing ?? "(none)", next, by);
    return { ok: true };
  };

  const setTaxCell: AppContextValue["setTaxCell"] = (groupId, productTaxCode, spec, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

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

  const upsertTaxGroup: AppContextValue["upsertTaxGroup"] = (row, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

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

  const setDefaultTaxGroup: AppContextValue["setDefaultTaxGroup"] = (groupId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);

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

  const setStoreSetting: AppContextValue["setStoreSetting"] = (key, value, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);

    const before = s.storeSettings[key];
    if (before === value) return;
    setS((prev) => ({ ...prev, storeSettings: { ...prev.storeSettings, [key]: value } }));
    logSetting("Store settings", String(key), before, value, by);
  };

  const setStoreDetail: AppContextValue["setStoreDetail"] = (key, value, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);

    const before = (s.storeDetails as unknown as Record<string, unknown>)[key];
    if (before === value) return;
    setS((prev) => ({ ...prev, storeDetails: { ...prev.storeDetails, [key]: value } }));
    logSetting("Store details", String(key), before, value, by);
  };

  // -------------------------------------------------------------------------
  // Genres (M-06 d12, d19, d32; architecture A-59)
  // -------------------------------------------------------------------------
  //
  // Manager-only, like every settings write (A-28a), and logged with the
  // actor and the values before and after (A-52). CREATING a Genre stays
  // manager-only even though adding a genre-map row will not (A-59): a Genre
  // carries a parent Section and a product tax code, both policy, where a map
  // row carries neither.

  // What references a genre. Derived rather than stored, so it cannot
  // disagree with the catalog, and it is what makes the delete refusal legible
  // rather than a flat "no".
  const genreUseCount: AppContextValue["genreUseCount"] = (genreId) =>
    s.records.filter((r) => r.genreId === genreId).length +
    s.nonTracked.filter((n) => n.genreId === genreId).length;

  // -------------------------------------------------------------------------
  // The genre map (M-06 d6, d32; architecture A-59, A-60, A-61)
  // -------------------------------------------------------------------------
  //
  // A-59 splits this surface in two, and the split IS the decision. Adding a
  // row for a tag that has none is an ungated EMPLOYEE action, logged with the
  // Employee as actor: it is purely additive and cannot change where anything
  // already goes. Changing a row, removing one, or setting its priority is
  // manager-only, because each re-routes every future adoption of that tag.
  //
  // The editor below is the Manager's door. The Employee's door is the
  // adoption prompt (d53), which calls addMapRow and nothing else.

  const addMapRow: AppContextValue["addMapRow"] = (tag, genreId, by) => {
    const check = checkMapRowAdd(tag, genreId, s.genreMap);
    if (!check.ok) return check;
    const row: GenreMapRow = { tag: normaliseTag(tag), genreId, priority: 0 };
    setS((prev) => ({ ...prev, genreMap: [...prev.genreMap, row] }));
    logSetting("Genre map", row.tag, "(none)", row, by);
    return { ok: true };
  };

  const updateMapRow: AppContextValue["updateMapRow"] = (tag, patch, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    const key = normaliseTag(tag);
    const existing = s.genreMap.find((r) => normaliseTag(r.tag) === key);
    if (!existing) return { ok: false, reason: `No map row for "${tag}".` };
    const next = { ...existing, ...patch };
    setS((prev) => ({
      ...prev,
      genreMap: prev.genreMap.map((r) => (normaliseTag(r.tag) === key ? next : r)),
    }));
    logSetting("Genre map", key, existing, next, by);
    return { ok: true };
  };

  const removeMapRow: AppContextValue["removeMapRow"] = (tag, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    const key = normaliseTag(tag);
    const existing = s.genreMap.find((r) => normaliseTag(r.tag) === key);
    if (!existing) return { ok: false, reason: `No map row for "${tag}".` };
    // d9's deactivate-never-delete does NOT extend to map rows (A-59): a row
    // is referenced by no history and is read only at adoption, so removing
    // one removes nothing. Records already adopted under it keep their genre.
    setS((prev) => ({ ...prev, genreMap: prev.genreMap.filter((r) => normaliseTag(r.tag) !== key) }));
    logSetting("Genre map", key, existing, "(removed)", by);
    return { ok: true };
  };

  // A-60 - merge repoints every dependent pointer rather than rewriting
  // history, following M-01 d9's shape, and it is manager-only on d11's.
  //
  // THE MAP ROWS ARE THE HALF EASILY MISSED AND THE HALF THAT MATTERS: a merge
  // that leaves them behind has the next adoption recreate the genre under the
  // old tag, which is the problem returning by the door it came in.
  const mergeGenres: AppContextValue["mergeGenres"] = (fromId, toId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    const from = s.genres.find((g) => g.id === fromId);
    const to = s.genres.find((g) => g.id === toId);
    const check = checkGenreMerge(from, to);
    if (!check.ok) return check;

    const records = s.records.filter((r) => r.genreId === fromId).length;
    const nonTracked = s.nonTracked.filter((n) => n.genreId === fromId).length;
    const mapRows = s.genreMap.filter((r) => r.genreId === fromId).length;

    setS((prev) => ({
      ...prev,
      records: prev.records.map((r) => (r.genreId === fromId ? { ...r, genreId: toId } : r)),
      nonTracked: prev.nonTracked.map((n) => (n.genreId === fromId ? { ...n, genreId: toId } : n)),
      genreMap: prev.genreMap.map((r) => (r.genreId === fromId ? { ...r, genreId: toId } : r)),
    }));

    // One log row naming both genres and the COUNTS repointed, because the
    // repointing is otherwise invisible and the count is the only thing that
    // says how far the act reached (A-60).
    logSetting(
      "Genres",
      `${from!.name} -> ${to!.name}`,
      { genre: from!.name, records, nonTracked, mapRows },
      { genre: to!.name, note: "merged; the emptied genre is now unreferenced and may be deleted" },
      by,
    );
    return { ok: true };
  };

  // -------------------------------------------------------------------------
  // Adoption (M-06 d53; E-03 d6; architecture A-6, A-61)
  // -------------------------------------------------------------------------
  //
  // Pulling a provider match into the LOCAL CATALOG. This is the moment a
  // Record comes into existence, and therefore the moment its genre is
  // resolved (d53) — before it there is no Record for a genre to sit on,
  // which is why an unadopted release shows its tags and no genre.
  //
  // Resolved ONCE. A search that hits an adopted Record re-resolves nothing,
  // and a later map edit never reaches back (d53, and the map's own "editable
  // without touching Records already imported under it").

  const adoptRelease: AppContextValue["adoptRelease"] = (releaseId, genreId, price) => {
    const rel = s.releaseCache.find((r) => r.id === releaseId);
    if (!rel) return null;
    const id = uid("rec");
    const match = resolveGenreFromTags(rel.tags, s.genreMap);
    const rec: RecordEntry = {
      id,
      artist: rel.artist,
      title: rel.title,
      label: rel.label,
      catalogNo: rel.catalogNo,
      format: rel.format,
      year: rel.year,
      country: rel.country,
      genreId,
      art: rel.art,
      manufacturerUpc: rel.manufacturerUpc,
      minOnHand: 0,
      // E-03 d20 — an optional selling price set at adoption becomes the
      // sticky price. E-02 d12's first New-mode receipt overwrites it (a
      // real receipt beats a guess) and d11 ignores it for second-hand.
      ...(price ? { stickyPrice: price } : {}),
      // A-61 — the tags AS OF ADOPTION, with the one that matched marked.
      // A snapshot, never re-resolved: the cache is shared and refreshable, so
      // it holds what the provider says NOW where this has to hold what it
      // said THEN. Undefined where the release carried none (d53).
      //
      // `matched` marks the tag the MAP used, not the operator's choice: where
      // the map resolved nothing, nothing is marked, and the titlecard shows
      // tags with none of them credited — which is the honest picture.
      providerTags: rel.tags?.map((t) => ({
        ...t,
        ...(match && t.tag === match.matchedTag ? { matched: true } : {}),
      })),
    };
    setS((prev) => ({ ...prev, records: [...prev.records, rec] }));
    return rec;
  };

  // What the adoption prompt needs to decide whether to ask at all.
  const resolveAdoptionGenre: AppContextValue["resolveAdoptionGenre"] = (releaseId) => {
    const rel = s.releaseCache.find((r) => r.id === releaseId);
    if (!rel) return { release: undefined, match: undefined, unmapped: [] };
    return {
      release: rel,
      match: resolveGenreFromTags(rel.tags, s.genreMap),
      unmapped: unmappedTags(rel.tags, s.genreMap),
    };
  };

  const upsertGenre: AppContextValue["upsertGenre"] = (row, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    // The rules live in lib/taxonomy so they can be exercised without a screen.
    const check = checkGenreWrite(row, {
      genres: s.genres,
      sections: s.sections,
      productTaxCodes: s.productTaxCodes,
    });
    if (!check.ok) return check;

    const existing = s.genres.find((x) => x.id === row.id);
    const next: Genre = { ...row, name: row.name.trim() };
    setS((prev) => ({
      ...prev,
      genres: existing ? prev.genres.map((x) => (x.id === row.id ? next : x)) : [...prev.genres, next],
    }));
    logSetting("Genres", row.id, existing ?? "(none)", next, by);
    return { ok: true };
  };

  // A-54 - deletion is gated by STATE, not by role: refused while live
  // references exist, and it never removes a historical row. d9's deactivation
  // is the alternative, and it is always available.
  //
  // The refusal names its cause, because M-04 d13 and A-54 both require that -
  // a refusal that does not say what blocked it sends someone hunting.
  const deleteGenre: AppContextValue["deleteGenre"] = (genreId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    const genre = s.genres.find((x) => x.id === genreId);
    const check = checkGenreDelete(genre, genreUseCount(genreId));
    if (!check.ok) return check;
    setS((prev) => ({ ...prev, genres: prev.genres.filter((x) => x.id !== genreId) }));
    logSetting("Genres", genreId, genre!, "(deleted)", by);
    return { ok: true };
  };

  const upsertSection: AppContextValue["upsertSection"] = (row, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

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

  const upsertTender: AppContextValue["upsertTender"] = (row, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

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

  const upsertCurrency: AppContextValue["upsertCurrency"] = (row, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

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

  const setHomeCurrency: AppContextValue["setHomeCurrency"] = (code, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);

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

  // M-04 d30 / A-89 — WHO MAY DO WHAT TO WHOM, applied in the write path after
  // the actor has been re-resolved. A Manager reaches Employees at their own
  // Stores; anything that touches a Manager or Owner is Owner-only. The
  // screen mirrors this in what it offers; the refusal is the rule.
  const gate = (byAuth: ManagerAuth, action: AdminAction): { ok: true; by: string } | { ok: false; reason: string } => {
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { ok: false, reason: mgr.refusal };
    const actor = s.users.find((u) => u.id === byAuth.userId)!;
    const refused = adminRefusal(actor, action);
    if (refused) return { ok: false, reason: refused };
    return { ok: true, by: recorded(mgr.name, byAuth.userId) };
  };
  const subject = (userId: string) => s.users.find((u) => u.id === userId);

  const addUser: AppContextValue["addUser"] = (input, byAuth) => {
    const assignments = input.assignments ?? (currentStoreId ? [currentStoreId] : [HOME_STORE_ID]);
    const g = gate(byAuth, { kind: "add", role: input.role, assignments });
    if (!g.ok) return g;
    return commit(usersLib.addUser(s.users, { ...input, assignments }, g.by, { id: uid("user"), orgId: HOME_ORG_ID }));
  };

  const changeUserRole: AppContextValue["changeUserRole"] = (userId, role, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "changeRole", from: u.role, to: role, assignments: u.assignments });
    if (!g.ok) return g;
    return commit(usersLib.changeUserRole(s.users, userId, role, g.by));
  };

  // M-04 d15 as corrected by d18: a deactivation stops new work under those
  // initials AT ONCE. There is no server-side session to end, so what
  // "immediately" means here is that the actor no longer resolves — the same
  // shape as actor_resolve refusing (A-55). An Open Sale is untouched and
  // stays finishable; only the session goes.
  const deactivateUser: AppContextValue["deactivateUser"] = (userId, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "deactivate", role: u.role, assignments: u.assignments });
    if (!g.ok) return g;

    const r = commit(usersLib.deactivateUser(s.users, userId, g.by));
    if (r.ok && s.sessionUserId === userId) endSession();
    // E-01 d30 (5): a personal session IS a login to revoke, and deactivation
    // revokes it.
    if (r.ok && s.principal?.kind === "personal" && s.principal.userId === userId) signOut();
    return r;
  };

  const reactivateUser: AppContextValue["reactivateUser"] = (userId, initials, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "reactivate", role: u.role, assignments: u.assignments });
    if (!g.ok) return g;
    return commit(usersLib.reactivateUser(s.users, userId, initials, g.by));
  };

  const correctUser: AppContextValue["correctUser"] = (userId, patch, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "correct", role: u.role, assignments: u.assignments });
    if (!g.ok) return g;
    return commit(usersLib.correctUser(s.users, userId, patch, g.by));
  };

  const setUserPin: AppContextValue["setUserPin"] = (userId, pin, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "setPin", role: u.role, assignments: u.assignments });
    if (!g.ok) return g;
    const r = usersLib.setUserPin(s.users, userId, pin, g.by);
    // M-04 d32 — a refused clash leaves a trace against the person it was
    // tried for, so a run of them is visible to an Owner.
    if (!r.ok && r.reason === usersLib.PIN_CLASH_REASON)
      setS((prev) => ({ ...prev, users: usersLib.logPinClash(prev.users, userId, g.by) }));
    return commit(r);
  };

  const assignToStore: AppContextValue["assignToStore"] = (userId, storeId, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "assign", role: u.role, storeId });
    if (!g.ok) return g;
    const r = usersLib.assignToStore(s.users, userId, storeId, g.by);
    if (!r.ok && r.reason === usersLib.PIN_CLASH_REASON)
      setS((prev) => ({ ...prev, users: usersLib.logPinClash(prev.users, userId, g.by) }));
    return commit(r);
  };

  const unassignFromStore: AppContextValue["unassignFromStore"] = (userId, storeId, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "unassign", role: u.role, storeId });
    if (!g.ok) return g;
    return commit(usersLib.unassignFromStore(s.users, userId, storeId, g.by));
  };

  const requestPasswordReset: AppContextValue["requestPasswordReset"] = (userId, byAuth) => {
    const u = subject(userId);
    if (!u) return { ok: false, reason: "No such user." };
    const g = gate(byAuth, { kind: "requestReset", role: u.role, assignments: u.assignments });
    if (!g.ok) return g;
    return commit(usersLib.requestPasswordReset(s.users, userId, g.by));
  };

  const setOwnPassword: AppContextValue["setOwnPassword"] = (userId, password) =>
    commit(usersLib.setOwnPassword(s.users, userId, password));

  // -------------------------------------------------------------------------
  // O-01 — the Organization. Owner-only in its entirety (d1): `requireOwner`
  // is the second question after the manager-only line, refused by name.
  // -------------------------------------------------------------------------

  const addStore: AppContextValue["addStore"] = (input, byAuth) => {
    const owner = requireOwner(s.users, byAuth);
    if (!owner.ok) return { ok: false, reason: owner.refusal };
    const r = storesLib.addStore(s.stores, { ...input, orgId: HOME_ORG_ID }, owner.name);
    if (!r.ok) return r;
    // d2 — M-06 defaults, nothing sold or held; the details block carries the
    // trading name and the minted identifiers (M-06 d46, d47).
    const created = r.stores.find((x) => x.id === r.id)!;
    const details: StoreDetails = {
      ...STORE_DETAILS,
      tradingName: input.tradingName.trim(),
      email: created.accountEmail,
      storeId: created.id,
      position: created.position,
    };
    setS((prev) => ({
      ...prev,
      stores: r.stores,
      parkedStores: { ...prev.parkedStores, [created.id]: freshStoreSlice(details) },
      organizations: prev.organizations.map((o) =>
        o.id === HOME_ORG_ID
          ? { ...o, log: [...o.log, { at: new Date().toISOString().slice(0, 19), text: `Store ${created.id} "${details.tradingName}" created by ${owner.name}` }] }
          : o,
      ),
    }));
    return { ok: true, id: r.id };
  };

  const setStoreAccountPassword: AppContextValue["setStoreAccountPassword"] = (storeId, password, byAuth) => {
    const owner = requireOwner(s.users, byAuth);
    if (!owner.ok) return { ok: false, reason: owner.refusal };
    const r = storesLib.setStoreAccountPassword(s.stores, storeId, password, owner.name);
    if (!r.ok) return r;
    // E-01 d24 / O-01 d3 — every terminal of that Store is signed out at
    // once. This browser is one terminal; if it holds that Store's store
    // session, it goes too.
    const thisTerminalGoes = s.principal?.kind === "store" && s.principal.storeId === storeId;
    setS((prev) => ({
      ...prev,
      stores: r.stores,
      ...(thisTerminalGoes ? { principal: null, sessionUserId: null } : {}),
    }));
    return { ok: true, id: r.id };
  };

  // -------------------------------------------------------------------------
  // S-01 — the System Administrator (A-90). The boundary is re-asserted in
  // every function: an S function refuses any other principal, and — in the
  // product — every other function refuses a null Organization. Here the
  // sysadmin never reaches a Store screen, so the second half is the Gate's.
  // -------------------------------------------------------------------------

  const sysadminActor = (): { ok: true; name: string } | { ok: false; reason: string } => {
    if (s.principal?.kind !== "sysadmin") return { ok: false, reason: "This is a System Administrator's act (S-01, A-90)." };
    const sa = s.sysadmins.find((x) => x.id === (s.principal as { sysadminId: string }).sysadminId);
    if (!sa) return { ok: false, reason: "That System Administrator does not resolve." };
    return { ok: true, name: `${sa.name} (System Administrator)` };
  };
  const stampNow = () => new Date().toISOString().slice(0, 19);
  const orgLog = (orgs: Organization[], orgId: string, text: string) =>
    orgs.map((o) => (o.id === orgId ? { ...o, log: [...o.log, { at: stampNow(), text }] } : o));

  // S-01 d2 — an Organization with its name and its first Owner; the Owner is
  // invited (M-04 d29) and has no Store yet (M-04 d27). No public sign-up.
  const createOrganization: AppContextValue["createOrganization"] = (input) => {
    const sa = sysadminActor();
    if (!sa.ok) return sa;
    if (!input.name.trim()) return { ok: false, reason: "An Organization needs a name." };
    if (!input.ownerName.trim() || !input.ownerEmail.trim()) return { ok: false, reason: "The first Owner needs a name and an email address (S-01 d2, M-04 d29)." };
    const orgId = uid("org");
    const org: Organization = { id: orgId, name: input.name.trim(), active: true, log: [] };
    const added = usersLib.addUser(
      s.users,
      { name: input.ownerName, initials: "", role: "Owner", assignments: [], email: input.ownerEmail },
      sa.name,
      { id: uid("user"), orgId },
    );
    if (!added.ok) return added;
    setS((prev) => ({
      ...prev,
      organizations: orgLog([...prev.organizations, org], orgId, `Created by ${sa.name} — first Owner ${input.ownerName.trim()} invited at ${input.ownerEmail.trim()}`),
      users: added.users,
    }));
    return { ok: true, id: orgId };
  };

  // S-01 d3 — a reset link for an Owner; logged on the person and on the
  // Organization, where its Owners read what was done from outside.
  const sysadminRequestOwnerReset: AppContextValue["sysadminRequestOwnerReset"] = (userId) => {
    const sa = sysadminActor();
    if (!sa.ok) return sa;
    const u = s.users.find((x) => x.id === userId);
    if (!u) return { ok: false, reason: "No such user." };
    if (u.role !== "Owner") return { ok: false, reason: `${u.name} is a ${u.role}. A System Administrator resets an Owner's access; an Owner resets everyone else's (S-01 d3).` };
    const r = usersLib.requestPasswordReset(s.users, userId, sa.name);
    if (!r.ok) return r;
    setS((prev) => ({ ...prev, users: r.users, organizations: orgLog(prev.organizations, u.orgId, `Password reset link sent to Owner ${u.name} by ${sa.name}`) }));
    return { ok: true };
  };

  // S-01 d3 / A-90 — restore an Owner, never act as one; refused while the
  // Organization has an active Owner, because an Owner who exists is the one
  // to act.
  const sysadminRecoverOwner: AppContextValue["sysadminRecoverOwner"] = (orgId, how) => {
    const sa = sysadminActor();
    if (!sa.ok) return sa;
    const org = s.organizations.find((o) => o.id === orgId);
    if (!org) return { ok: false, reason: "No such Organization." };
    const living = s.users.find((u) => u.orgId === orgId && u.active && u.role === "Owner");
    if (living) return { ok: false, reason: `${org.name} has an active Owner (${living.name}); recovery is for an Organization that has none (S-01 d3, A-90).` };
    let r: usersLib.UserWrite;
    let what: string;
    if ("reactivate" in how) {
      const u = s.users.find((x) => x.id === how.reactivate && x.orgId === orgId && x.role === "Owner");
      if (!u) return { ok: false, reason: "That is not a deactivated Owner of this Organization." };
      r = usersLib.reactivateUser(s.users, u.id, u.initials, sa.name);
      what = `Owner ${u.name} reactivated by ${sa.name}`;
    } else {
      r = usersLib.addUser(s.users, { name: how.invite.name, initials: "", role: "Owner", assignments: [], email: how.invite.email }, sa.name, { id: uid("user"), orgId });
      what = `New Owner ${how.invite.name.trim()} invited at ${how.invite.email.trim()} by ${sa.name}`;
    }
    if (!r.ok) return r;
    const users = r.users;
    setS((prev) => ({ ...prev, users, organizations: orgLog(prev.organizations, orgId, what) }));
    return { ok: true };
  };

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
        // d25, d26, d27 — is this a disc the shop has no sold record for?
        // Judged HERE, when the Employee picks the copy, because routing
        // changes that copy's status and the posting must not change with it
        // (A-57's shape). A copy that is `sellable`, `held` or `written_off` is
        // demonstrably not the one the customer is holding — d24's point — and
        // there is no sale of it to reverse.
        unmatchedReturn: item.status !== "sold",
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

  const addTender: AppContextValue["addTender"] = (saleId, t) => {
    // A-51 — `sale_tender` is the only enforcement point for Σ movements ≥ 0,
    // so this is where the prototype refuses rather than the pad alone: the
    // pad disables its button, but a refusal that only lives in a screen is
    // one more screen away from being forgotten.
    const target = s.sales.find((x) => x.id === saleId);
    if (target && t.type === "Gift Card" && t.amount > 0) {
      const refusal = giftCardRedeemRefusal(s.giftCards, target, t.reference, t.amount);
      if (refusal) return refusal;
    }
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
    return null;
  };

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

  /**
   * E-06 d29 — how a returned line is described in a refusal. The Record as
   * the counter reads it, because "line 3" means nothing across the counter.
   */
  const describeReturnLine = (l: { inventoryItemId?: string }) => {
    const item = s.inventory.find((i) => i.id === l.inventoryItemId);
    const rec = item && s.records.find((r) => r.id === item.recordId);
    return rec ? `${rec.artist} — ${rec.title}` : "A returned copy";
  };

  /** E-06 d29 — the finish gate, as the lib states it. */
  const returnFinishRefusal = (sale: Sale | undefined) =>
    sale
      ? finishReturnRefusal(
          sale.lines.map((l) => ({
            qty: l.qty,
            inventoryItemId: l.inventoryItemId,
            routedTo: l.routedTo,
            describe: describeReturnLine(l),
          })),
        )
      : undefined;

  const finishReturnBlocked: AppContextValue["finishReturnBlocked"] = (saleId) =>
    returnFinishRefusal(s.sales.find((x) => x.id === saleId));

  // E-06 d30 — the same test `voidSale` applies, asked without writing. One
  // definition, two callers: the modal shows it and the write path enforces it.
  const voidStockRefusal: AppContextValue["voidStockRefusal"] = (saleId) =>
    (s.sales.find((x) => x.id === saleId)?.lines ?? [])
      .filter((l) => l.stockRouted && l.routedTo)
      .map((l) =>
        unrouteRefusal(
          l.routedTo!,
          s.inventory.find((i) => i.id === (l.routedItemId ?? l.inventoryItemId)),
        ),
      )
      .find(Boolean);

  const chooseReturnRoute: AppContextValue["chooseReturnRoute"] = (saleId, lineId, to, opts) => {
    const doc = s.sales.find((x) => x.id === saleId);
    // d29, d22 — the DOCUMENT first. Refused here and not merely by hiding the
    // control (A-4, A-48): a second caller reaches this whatever the screen
    // renders, which is how the voided-Return hole was found the first time.
    const docRefusal = doc
      ? routeDocumentRefusal(doc)
      : "That Return no longer exists.";
    if (docRefusal) return { chosen: false, refusal: docRefusal };

    // A-81, A-28a — the write-off route is manager-only, and it is gated at
    // the moment of CHOOSING because that is now the moment the Employee
    // performs it. Re-checked again at finish, when the effect actually runs.
    const mgr = opts?.byAuth ? requireManager(s.users, opts.byAuth) : undefined;
    const by = mgr?.ok && opts?.byAuth ? recorded(mgr.name, opts.byAuth.userId) : undefined;
    const stockRefusal = routeStockRefusal(
      to,
      mgr?.ok ? { role: "Manager", active: true, name: by! } : undefined,
    );
    if (stockRefusal) return { chosen: false, refusal: stockRefusal };

    const line = doc!.lines.find((l) => l.id === lineId);
    const soldCopy = s.inventory.find((i) => i.id === line?.inventoryItemId);
    // A-82 / d19 — the cap is applied when the figure is entered, which under
    // d29 is on the draft. d26 — an UNMATCHED copy has no prior cost to cap
    // against and is booked at the refund paid, so the cap does not reach it.
    if (to === "regrade" && !line?.unmatchedReturn) {
      const costRefusal = regradeCostRefusal(
        opts?.assessedCost ?? soldCopy?.cost ?? 0,
        soldCopy?.cost ?? 0,
      );
      if (costRefusal) return { chosen: false, refusal: costRefusal };
    }

    setS((prev) => ({
      ...prev,
      sales: prev.sales.map((x) =>
        x.id === saleId
          ? {
              ...x,
              lines: x.lines.map((l) =>
                l.id === lineId
                  ? {
                      ...l,
                      // THE CHOICE ONLY. No mint, no status change, no journal
                      // — those are the finish act's (d29). An abandoned draft
                      // therefore leaves no copy behind, which is the loss
                      // retired d20 existed to close.
                      routedTo: to,
                      routeChoice: {
                        grade: opts?.grade,
                        price: opts?.price,
                        reason: opts?.reason,
                        assessedCost: opts?.assessedCost,
                        authorizedByUserId: mgr?.ok ? opts?.byAuth?.userId : undefined,
                      },
                    }
                  : l,
              ),
              log: [
                ...x.log,
                {
                  at: now(),
                  text: by
                    ? `Stock disposition chosen → ${to} (${opts?.reason ?? ""}) — authorized by ${by}`
                    : `Stock disposition chosen → ${to}`,
                },
              ],
            }
          : x,
      ),
    }));
    return { chosen: true };
  };

  /** A-28a — turn a stored User id back into a live authorization, or nothing. */
  const reauthorize = (userId?: string) => {
    if (!userId) return undefined;
    const res = authorizeManager(s.users, userId);
    return res.ok ? res.auth : undefined;
  };

  const finishReturn: AppContextValue["finishReturn"] = (saleId) => {
    const sale = s.sales.find((x) => x.id === saleId);
    // d29 — THE GATE. On the write path, not on a disabled button: E-06-T22
    // asserts exactly this, for the reason A-82 gives about the re-grade cap.
    const refusal = returnFinishRefusal(sale);
    if (refusal) return { refusal };

    // d29 — the effects run inside the finish act. They are applied here,
    // immediately before the document takes its number, rather than strictly
    // after the tenders settle: from the counter it is one press, and the
    // guarantee that matters holds either way — nothing exists on a draft, and
    // everything exists once the Return is finished. Applying them while the
    // document is still a draft is also what `routeDocumentRefusal` now
    // permits, so the write path stays honest about what it is doing.
    for (const l of sale?.lines ?? []) {
      if (l.qty < 0 && l.inventoryItemId && l.routedTo && !l.stockRouted) {
        routeReturnLine(
          saleId,
          l.id,
          l.inventoryItemId,
          l.routedTo,
          l.routeChoice?.grade,
          l.routeChoice?.price,
          l.routeChoice?.reason,
          // A-28a — RE-AUTHORIZE from the id rather than replaying a brand the
          // draft carried. A Manager deactivated between choosing and
          // finishing is refused here, which is the check §6 puts at the
          // moment of the write.
          reauthorize(l.routeChoice?.authorizedByUserId),
          l.routeChoice?.assessedCost,
        );
      }
    }
    return { saleNumber: completeSale(saleId) };
  };

  const completeSale: AppContextValue["completeSale"] = (saleId) => {
    const num = s.nextSaleNumber;
    const sale = s.sales.find((x) => x.id === saleId);
    // E-06 d29 — a Return cannot be finished with a returned line undecided.
    // Guarded HERE as well as in `finishReturn`, because this is the function
    // the till calls and a gate only one caller respects is not a gate
    // (A-4, A-48). Returns 0, which is not a Sale number.
    if (sale?.isReturn && returnFinishRefusal(sale)) return 0;
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
                // M-07 d19 — the Sale's BUSINESS DATE is fixed here, at the
                // tender, for the same reason the tax snapshot is (A-57): this
                // is the moment the money moved. d14 groups journal lines by
                // it, so a close nobody ran on Monday still files Monday's
                // revenue on Monday.
                tenderedAt: now(),
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
    // E-06 d30 SUPERSEDES d10's blanket refusal. d10 refused while any copy
    // was routed, which was nearly harmless while routing was optional and
    // TOTAL once d29 makes every finished Return a routed one — it would have
    // forbidden every void, and with it every Edit (E-05 d31). So a void now
    // UN-ROUTES, and refuses only while the copy the routing produced is no
    // longer as the routing left it. The test and the sentence live in
    // lib/returnRouting.ts (A-4, A-48).
    const routedLines = sale.lines.filter((l) => l.stockRouted && l.routedTo);
    const stockRefusal = routedLines
      .map((l) =>
        unrouteRefusal(
          l.routedTo!,
          s.inventory.find((i) => i.id === (l.routedItemId ?? l.inventoryItemId)),
        ),
      )
      .find(Boolean);
    if (stockRefusal) {
      return { voided: false, outstanding, routedCopies: routedLines.length, refusal: stockRefusal };
    }
    if (Math.abs(outstanding) > 0.005) return { voided: false, outstanding, routedCopies: 0 };
    setS((prev) => {
      // E-06 d30 — undo each routing as the mirror of how it was done. A
      // MINTED copy (a re-grade, or d24's unmatched arrival) is removed and
      // the pointer on the copy it came from cleared; a copy that went back to
      // the shelf or was written off returns to `sold`, which is where the
      // Return found it.
      const mintedToDrop = new Set(
        routedLines
          .filter((l) => l.routedItemId && l.routedItemId !== l.inventoryItemId)
          .map((l) => l.routedItemId!),
      );
      const restoreToSold = new Set(
        routedLines
          .filter((l) => !l.routedItemId || l.routedItemId === l.inventoryItemId)
          .map((l) => l.inventoryItemId!)
          .filter(Boolean),
      );
      // M-07 d8 — a write-off's reason-coded adjustment is reversed by POSTING
      // FORWARD, dated the void, never by editing the original journal.
      const writeOffReversals = routedLines
        .filter((l) => l.routedTo === "writeoff" && l.routeChoice?.reason)
        .map((l) => {
          const copy = prev.inventory.find((i) => i.id === l.inventoryItemId);
          if (!copy?.cost) return null;
          const built = buildAdjustmentJournal({
            id: uid("adj"),
            reason: l.routeChoice!.reason!,
            cost: copy.cost,
            businessDate: now(),
            writtenAt: now(),
            memo: `Void of return — write-off reversed (${l.routeChoice!.reason})`,
            accounts: prev.glAccounts,
            mappings: prev.glMappings,
            currency: prev.homeCurrency,
            location: prev.storeDetails.storeId,
          });
          // The reversal is the same journal with its sides swapped. Built
          // fresh rather than looked up, so it cannot be thrown by an original
          // that was written under a mapping since repointed (M-07 step 5).
          return {
            ...built.batch,
            lines: built.batch.lines.map((jl) => ({ ...jl, debit: jl.credit, credit: jl.debit })),
          };
        })
        .filter(Boolean);

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
        journals: [...(writeOffReversals as JournalBatch[]), ...prev.journals],
        inventory: prev.inventory
          // E-06 d30 — a copy minted by the routing is removed outright. It
          // exists only because the Return happened, and the void says it did
          // not.
          .filter((i) => !mintedToDrop.has(i.id))
          .map((i) =>
            restoreToSold.has(i.id)
              ? { ...i, status: "sold" as const, heldByCustomerId: undefined }
              : mintedToDrop.has(i.regradedIntoItemId ?? "")
                ? { ...i, regradedIntoItemId: undefined }
                : i,
          )
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
            (routedLines.length
              ? ` — ${routedLines.length} returned cop${routedLines.length === 1 ? "y" : "ies"} un-routed`
              : "") +
            (x.saleNumber ? `${returned ? "," : " —"} Sale number ${x.saleNumber} retained` : "");
          return {
            ...x,
            state: "Void",
            // E-06 d30 — the routing is undone, so the lines stop claiming it.
            // E-06 d22 then refuses any attempt to route again, which is what
            // E-06-T26 holds.
            lines: x.lines.map((l) =>
              l.stockRouted
                ? { ...l, stockRouted: false, routedItemId: undefined }
                : l,
            ),
            log: [...x.log, { at: now(), text }],
          };
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
  // d21, d22, d25 — the eight sections need the customer list (Account type),
  // the configured tenders and the chart, so the report can name the GL account
  // each tender posts to. Gathered once rather than at two call sites, because
  // View Subtotal and the close must never compute different reports.
  const breakdownExtras = (): BreakdownExtras => ({
    customers: s.customers,
    tenderRows: s.tenders,
    accounts: s.glAccounts,
    mappings: s.glMappings,
    createdAt: now(),
    // The void count's period. See `BreakdownExtras.sinceClosedAt` — this is
    // an approximation the decision table has not ratified, not an answer.
    // A-84: only a LIVE batch counts, a retired one being history.
    sinceClosedAt: s.closeBatches.filter((b) => !b.undoneAt).map((b) => b.at).sort().slice(-1)[0],
  });

  const viewSubtotal: AppContextValue["viewSubtotal"] = () =>
    computeDayBreakdown(s.sales, s.records, taxCtxFor(null), s.inventory, s.genres, s.sections, breakdownExtras());

  // Total Today's Sales — the close is a real state transition (M-03
  // decision 1): every Current Sale becomes Closed and stops being
  // editable, batched under one identifier so it can be undone as a unit.
  const totalTodaysSales: AppContextValue["totalTodaysSales"] = (by) => {
    const breakdown = computeDayBreakdown(s.sales, s.records, taxCtxFor(null), s.inventory, s.genres, s.sections, breakdownExtras());
    // EVERY Current Sale, Returns included. This read `&& !sale.isReturn`,
    // which contradicted three things at once: M-03 d1 and this function's own
    // comment above ("every Current Sale becomes Closed"), E-06 d8's returns
    // flowing into the close, and M-07 d7 as E-06 inherits it — "a Return
    // produces journal lines like any Sale, through the close it lands in".
    //
    // The consequences were not cosmetic. A Return produced NO journal at all,
    // so M-07 d2's perpetual inventory never ran backwards for a returned copy
    // and A-82's arithmetic could not close: the write-off route posted
    // `Dr Damaged / Cr Inventory` against a cost that had never come back out
    // of cost of goods. And a Return never reached `Closed`, so it stayed
    // `Current` for ever and E-06 d23's after-the-close routing was
    // unobservable.
    //
    // `buildCloseJournal` was always ready for this — `costPostings` says "a
    // RETURN always reverses it, whatever E-06 step 6 then does with the copy"
    // — it was simply never handed one.
    const saleIds = s.sales.filter((sale) => sale.state === "Current").map((sale) => sale.id);
    const batchId = uid("batch");
    // M-03 d13 / A-30 — the summary is STORED on the batch, not recomputed
    // when someone asks for it again. A-83 stamps the schema version beside
    // it, so a date-range report summing these knows which sections this batch
    // can answer for and prints the count of those it cannot rather than
    // zero-filling them.
    //
    // A-84 — a new batch id every close, so this summary is written once and
    // never rewritten. An undo retires the batch below and keeps its summary
    // exactly as computed here.
    const batch: CloseBatch = {
      id: batchId,
      at: now(),
      by,
      saleIds,
      summary: breakdown as unknown as CloseBatch["summary"],
      summaryVersion: SUMMARY_SCHEMA_VERSION,
    };

    // M-07 d7 — the journal is a SECOND thing the close produces, written onto
    // the CloseBatch beside the summary M-03 d13 already stores there. A-67
    // puts it inside the same transaction, so a batch and its journal can never
    // disagree; here that is the same setS call below.
    //
    // d10 — and it is written whether or not it balances. The close is a real
    // state transition other flows depend on (M-03 d1), and a bookkeeping
    // defect must never be able to stop the shop ending its day.
    const journal = buildCloseJournal({
      batchId,
      writtenAt: now(),
      sales: s.sales.filter((sale) => saleIds.includes(sale.id)),
      records: s.records,
      inventory: s.inventory,
      genres: s.genres,
      sections: s.sections,
      tenders: s.tenders,
      taxCtx: taxCtxFor(null),
      accounts: s.glAccounts,
      mappings: s.glMappings,
      currency: s.homeCurrency,
      location: s.storeDetails.storeId, // M-08 d12, d27 / A-72 — the line's own Store
    });

    setS((prev) => ({
      ...prev,
      closeBatches: [batch, ...prev.closeBatches],
      journals: [journal.batch, ...prev.journals],
      sales: prev.sales.map((sale) =>
        saleIds.includes(sale.id)
          ? { ...sale, state: "Closed", batchId, log: [...sale.log, { at: now(), text: `Closed in batch ${batchId} by ${by}` }] }
          : sale,
      ),
    }));

    // d10's second mechanism. Suspense keeps the journal balanced BY
    // CONSTRUCTION so the export is always a valid document; telling the
    // Manager is what stops a balanced-but-wrong journal going quiet, which is
    // the failure Suspense would otherwise introduce.
    //
    // A-68 — raised by the SYSTEM, with no actor. A journal imbalance is not an
    // action and nobody took it: d10 records that no Manager can cause one and
    // none can clear one, so the flag has to say so in those terms rather than
    // inviting them to fix it.
    if (isImbalanced(journal.batch)) {
      raiseSystemReviewFlag(
        "journal-imbalance",
        `The journal for close ${batchId} did not balance by ${money(journal.batch.suspense ?? 0)}, and the difference was posted to Suspense so the close could proceed. ` +
          `This is a defect in this software, not something anyone at the till did — there is nothing for you to correct. ` +
          (journal.unresolved.length
            ? `Unresolved: ${journal.unresolved.join("; ")}.`
            : `The cause is not visible from here; report it.`),
      );
    }

    return {
      batchId,
      breakdown,
      journal: journal.batch,
      unresolved: journal.unresolved,
      ambiguousTenders: journal.ambiguousTenders,
    };
  };

  // Undo End of Day — Admin (M-03 decision 4). Restores every Sale in the
  // batch to Current, Sale numbers included; the batch itself stays in
  // history, marked undone, rather than disappearing.
  /**
   * M-08 d11 - why this batch may not be undone, or undefined if it may.
   *
   * Exposed so the till can DISABLE and EXPLAIN rather than letting a Manager
   * press a button that quietly does nothing. The same predicate also guards
   * the write below, because A-48 is explicit that a bound enforced in the
   * client is not a bound - the screen reads it to be helpful, the act reads it
   * to be correct.
   */
  const closeUndoRefusalFor: AppContextValue["closeUndoRefusalFor"] = (batchId) => {
    const batch = s.closeBatches.find((b) => b.id === batchId);
    if (!batch) return "That batch no longer exists.";
    return closeUndoRefusal(batch.at.slice(0, 10), s.ledgerSeals, s.ledgerUnseals);
  };

  const undoEndOfDay: AppContextValue["undoEndOfDay"] = (batchId, byAuth, actor) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);

    const batch = s.closeBatches.find((b) => b.id === batchId);
    if (!batch || batch.undoneAt) return;
    // d11 - "nothing may write into a sealed period, BY ANY ROUTE, including
    // M-03's Undo End of Day, which is the one reversal in this system that
    // does not post forward."
    if (closeUndoRefusal(batch.at.slice(0, 10), s.ledgerSeals, s.ledgerUnseals)) return;
    // M-04 d4 — BOTH names. `by` is the Manager who authorized; the actor is
    // whoever was at the terminal. This recorded only `by`, so the one surface
    // that could say who reopened the day named the person who merely allowed
    // it — while the dialog's own copy promised both were being kept.
    //
    // **The Manager stands in as actor when nobody is signed in**, rather than
    // the till asking twice. §6 puts `p_actor_user_id` on every function and
    // `p_manager_user_id` only on the manager-only ones, so the actor is the
    // baseline and the Manager doing this alone is genuinely both. Defaulted
    // HERE rather than on the screen: `by` is the name re-resolved at the
    // write, so the stand-in can never be a label the prompt merely displayed.
    const rec: UndoRecord = { manager: by, actor: actor ?? by, at: now() };
    setS((prev) => ({
      ...prev,
      // A-84 — RETIRED, not deleted and not recomputed. The batch keeps its
      // id, timestamp, closing User and the summary it computed, and gains the
      // undo's actor; re-closing writes a new batch rather than rewriting this
      // one, so a past day's figures can never move.
      closeBatches: prev.closeBatches.map((b) => (b.id === batchId ? retireCloseBatch(b, rec) : b)),
      sales: prev.sales.map((sale) =>
        batch.saleIds.includes(sale.id)
          ? { ...sale, state: "Current", batchId: undefined, log: [...sale.log, { at: rec.at, text: undoLogText(batchId, rec) }] }
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
    reason,
    byAuth,
    assessedCost,
  ) => {
    // A-81, A-28a — the write-off route is manager-only, because routing a
    // returned copy to *written off* IS adjusting on hand. The rule and its
    // reasoning live in lib/returnRouting.ts, never here and never in the
    // screen (A-4, A-48); the store calls the refusal and stores the result.
    // Resolved here, at the moment of the write, through the same door every
    // other gated function uses (§6). The write-off route is the only one that
    // needs it; `routeStockRefusal` decides that, not this line.
    const mgr = byAuth ? requireManager(s.users, byAuth) : undefined;
    const by = mgr?.ok ? recorded(mgr.name, byAuth!.userId) : undefined;
    const refusal = routeStockRefusal(to, mgr?.ok ? { role: "Manager", active: true, name: by! } : undefined);
    if (refusal) return { routed: false, refusal };

    // d20, d22 — the DOCUMENT has to allow routing before anything else is
    // asked. Refused here and not only by hiding the control (A-4, A-48): the
    // walk that found this reached it on a voided Return through the screen,
    // and a second caller would reach it whatever the screen renders.
    const doc = s.sales.find((x) => x.id === saleId);
    const docRefusal = doc ? routeDocumentRefusal(doc) : "That Return no longer exists.";
    if (docRefusal) return { routed: false, refusal: docRefusal };

    const soldCopy = s.inventory.find((i) => i.id === itemId);
    // d24, d27 — was this a disc the shop has no sold record for? The fact was
    // stamped on the line when it was added and is read back here, never
    // re-derived: the picked copy's status may since have moved.
    const returnLine = doc?.lines.find((l) => l.id === lineId);
    const unmatched = !!returnLine?.unmatchedReturn;
    // A-82 / E-06 d19 — the re-graded copy's cost is capped at the cost the
    // sold copy carried. Refused HERE, not by the screen declining to offer a
    // higher figure, which A-82 says in terms is not a cap.
    // d26 — an UNMATCHED copy is booked at the REFUND PAID. Nothing ever paid
    // for it, so there is no cost to inherit, and A-82 does not reach it:
    // A-82 caps against the cost the SOLD copy carried and here there is no
    // sold copy. Which is also why the cap is not applied below — there is no
    // prior figure to cap against, and that is the accepted consequence d26
    // names as the widest such door in the system.
    const refundOnLine = Math.abs(returnLine?.price ?? 0);
    const bookedCost = unmatched
      ? refundOnLine
      : to === "regrade"
        ? (assessedCost ?? soldCopy?.cost ?? 0)
        : (soldCopy?.cost ?? 0);
    if (to === "regrade" && !unmatched) {
      const costRefusal = regradeCostRefusal(bookedCost, soldCopy?.cost ?? 0);
      if (costRefusal) return { routed: false, refusal: costRefusal };
    }

    const note =
      to === "regrade"
        ? "Re-graded on return — own grade and price (E-06 step 6)"
        : to === "sellable"
          ? "Returned, back to sellable at original grade"
          : `Returned, written off via reason-coded adjustment (E-04) — ${reason}`;

    // M-07 d12 — routing a returned copy to `writeoff` IS an on-hand
    // adjustment, so it writes its own journal here, when it is made, to the
    // account its reason code maps to (d6). It does not wait for a close, and
    // there is nothing to sweep it (A-67).
    //
    // The close has already put the copy's cost back into Inventory, because
    // the copy came back over the counter (d2 run backwards). This is what
    // takes it out again, into the reason-coded account rather than leaving it
    // in cost of goods where nobody chose to put it.
    const item = soldCopy;
    const adjustment =
      to === "writeoff" && reason && item?.cost
        ? buildAdjustmentJournal({
            id: uid("adj"),
            reason,
            cost: item.cost,
            businessDate: now(),
            writtenAt: now(),
            memo: `Written off on return — ${reason}`,
            accounts: s.glAccounts,
            mappings: s.glMappings,
            currency: s.homeCurrency,
            location: s.storeDetails.storeId, // M-08 d12, d27 / A-72 — the line's own Store
          })
        : null;

    // E-06 d19 / A-82 — where the copy is assessed BELOW what the sold copy
    // carried, the shortfall is a period cost and posts to its E-04 reason
    // code. `Damaged` is where M-07 d6 already sends condition losses, and a
    // re-grade is a condition loss by definition. Assessed at or above the
    // cap, nothing is stranded and no journal is written.
    // Nothing to strand on an unmatched line: the shortfall is the difference
    // between a copy's old cost and its new one, and this copy had no old cost.
    const shortfall =
      to === "regrade" && !unmatched ? regradeShortfall(bookedCost, soldCopy?.cost ?? 0) : 0;
    const regradeAdjustment =
      to === "regrade" && shortfall > 0
        ? buildAdjustmentJournal({
            id: uid("adj"),
            reason: "Damaged",
            cost: shortfall,
            businessDate: now(),
            writtenAt: now(),
            memo: `Re-graded on return — booked at ${money(bookedCost)}, down from ${money(soldCopy?.cost ?? 0)}`,
            accounts: s.glAccounts,
            mappings: s.glMappings,
            currency: s.homeCurrency,
            location: s.storeDetails.storeId,
          })
        : null;

    // E-06 d15 — the re-grade MINTS. The copy that sold stays sold, at the
    // grade it sold at, so "what did this copy sell as" stays answerable; the
    // disc that came back enters as its own copy. Deliberately not E-04's
    // *Edit copy*, which edits a grade in place and is still right for a copy
    // that never left the shelf.
    // d24 — an UNMATCHED return mints on every route, not just the re-grade.
    // The copy the Employee picked is a different physical object from the one
    // on the counter, so it is never mutated: the disc that came in gets its
    // own InventoryItem, in whatever state step 6 routed it to. d27 puts the
    // mint here rather than at line-add, so an unassessed copy simply does not
    // exist yet and the Requirements stay literally true.
    const mintsForReturn = to === "regrade" || unmatched;
    const mintedId = mintsForReturn ? uid("item") : "";
    const minted: InventoryItem | null =
      mintsForReturn && soldCopy
        ? {
            id: mintedId,
            recordId: soldCopy.recordId,
            grade: grade ?? soldCopy.grade,
            price: price ?? soldCopy.price,
            cost: bookedCost,
            // d18 — the barcode is minted NOW, because a copy with no code is
            // unscannable and therefore unsellable, and architecture §6
            // resolves a scan to exactly one InventoryItem. The STICKER is a
            // separate act: E-02 puts the label printer at the receiving desk,
            // and this flow does not get to commit one to every till.
            internalBarcode: `29${String(s.nextInternalBarcode).padStart(10, "0")}`,
            labelPending: true,
            // Whatever step 6 decided. A re-grade puts it on the shelf; an
            // unmatched copy written off arrives already off the books, which
            // is the honest record that a disc came in and was discarded.
            status: statusAfterRoute(to),
            // d17 — it arrives now. As a distinct copy at a distinct grade it
            // did not exist before, so A-81's chain reads cleanly: the sold
            // copy departed, this one arrived. Accepted consequence: E-03 d16's
            // dead-stock clock restarts.
            receivedAt: now(),
            regradedFromItemId: soldCopy.id,
            conditionNote: note,
          }
        : null;

    setS((prev) => ({
      ...prev,
      nextInternalBarcode: prev.nextInternalBarcode + (minted ? 1 : 0),
      ...(adjustment
        ? {
            journals: [adjustment.batch, ...prev.journals],
            reviewFlags: journalFlags(adjustment, `the write-off of a returned copy`, prev.reviewFlags),
          }
        : {}),
      ...(regradeAdjustment
        ? {
            journals: [regradeAdjustment.batch, ...prev.journals],
            reviewFlags: journalFlags(regradeAdjustment, `the re-grade of a returned copy`, prev.reviewFlags),
          }
        : {}),
      inventory: [
        ...prev.inventory.map((i) =>
          i.id === itemId
            ? mintsForReturn
              ? // d15, d24 — untouched but for a pointer at what replaced it.
                // For a re-grade its status, grade and cost are the record of
                // what actually sold; for an unmatched line it was never the
                // customer's copy at all, so touching it would be the
                // mis-identification d24 exists to end.
                { ...i, regradedIntoItemId: mintedId }
              : {
                  ...i,
                  // A-81 — a written-off copy gets its OWN status,
                  // `written_off`. See lib/returnRouting.ts.
                  status: statusAfterRoute(to),
                  conditionNote: note,
                }
            : i,
        ),
        ...(minted ? [minted] : []),
      ],
      sales: prev.sales.map((sale) =>
        sale.id === saleId
          ? {
              ...sale,
              lines: sale.lines.map((l) =>
                l.id === lineId
                  ? {
                      ...l,
                      stockRouted: true,
                      routedTo: to,
                      // E-06 d30 — the copy this routing PRODUCED, so a void
                      // can ask whether it is still as the routing left it.
                      // For a re-grade or d24's unmatched arrival that is the
                      // MINTED copy; otherwise the copy on the line.
                      routedItemId: mintsForReturn ? mintedId : itemId,
                    }
                  : l,
              ),
              log: [
                ...sale.log,
                {
                  at: now(),
                  // Both names, per A-28a: the Employee holds the Sale, the
                  // Manager authorized the disposition.
                  text: by
                    ? `Returned copy routed → ${to} (${reason}) — authorized by ${by}`
                    : `Returned copy routed → ${to}`,
                },
              ],
            }
          : sale,
      ),
    }));

    // E-06 d21 / E-04 d16 — the mint is the ONE place an Employee can create a
    // sellable copy at a price of their own choosing, and it was escaping the
    // guardrail on a technicality: d16's flag fires when a price is EDITED
    // below cost, and a mint is not an edit. Raised after the write, because
    // d16 flags rather than blocks — nothing slows at the counter, and what
    // this restores is the compensating record a permissive design rests on.
    if (minted && minted.price < minted.cost) {
      const rec = s.records.find((r) => r.id === minted.recordId);
      raiseReviewFlag(
        "below-cost",
        `Re-graded on return: shelf price ${money(minted.price)} below assessed cost ${money(minted.cost)} for ${rec ? `${rec.artist} — ${rec.title}` : minted.recordId} (${minted.internalBarcode}).`,
      );
    }

    return { routed: true };
  };

  const toggleProvider = () => setS((prev) => ({ ...prev, providerUp: !prev.providerUp }));

  const invoiceFor = (id?: string) => s.invoices.find((iv) => iv.id === id);

  const startInvoice: AppContextValue["startInvoice"] = (input) => {
    const id = uid("inv");
    // Both dates are pinned to one calendar day here, not just at the field
    // that collects them. A date in any other shape compares against nothing
    // else in the system — the due date derived from it (E-02 d45) comes out
    // `NaN-NaN-NaN`, and anything filed by date is filed outside every range
    // rather than in the wrong one.
    const invoiceDate = toCalendarDate(input.invoiceDate);
    const receivedDate = toCalendarDate(input.receivedDate);
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
        ? mintSecondHandRef(receivedDate, s.invoices)
        : `REF${String(s.nextInvoiceRef).padStart(4, "0")}`);
    const invoice: Invoice = {
      id,
      ...input,
      invoiceDate,
      receivedDate,
      invoiceNumber,
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
  const reconcileOversold: AppContextValue["reconcileOversold"] = (recordId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return 0;
    const by = recorded(mgr.name, byAuth.userId);

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
    if (!invoice || invoiceIsFrozen(invoice, s.paymentBatches, s.batchVoids)) return;
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
    if (!invoice || invoiceIsFrozen(invoice, s.paymentBatches, s.batchVoids) || !existing) return;
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
    if (!invoice || invoiceIsFrozen(invoice, s.paymentBatches, s.batchVoids) || !line) return { blocked: true };
    const itemIds = line.itemIds ?? [];
    // A line cannot be removed once any copy it minted has LEFT — removing it
    // deletes those copies, and a departed copy has already been accounted
    // for somewhere. Asked positively (§5.1, A-81): written off is a
    // departure exactly as sold is, so a test for `=== "sold"` alone would
    // have let the line be removed out from under a written-off copy and
    // deleted the only record of the shrinkage.
    const anyGone = itemIds.some((id) => {
      const copy = s.inventory.find((i) => i.id === id);
      return !!copy && !isPresent(copy);
    });
    if (anyGone) return { blocked: true };

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
        iv.id === invoiceId && !invoiceIsFrozen(iv, prev.paymentBatches, prev.batchVoids) ? { ...iv, ...patch } : iv,
      ),
    }));

  const setInvoiceTotalOverride: AppContextValue["setInvoiceTotalOverride"] = (invoiceId, value) => {
    const invoice = s.invoices.find((iv) => iv.id === invoiceId);
    if (!invoice || invoiceIsFrozen(invoice, s.paymentBatches, s.batchVoids)) return;
    setS((prev) => ({
      ...prev,
      invoices: prev.invoices.map((iv) => (iv.id === invoiceId ? { ...iv, totalOverride: value } : iv)),
    }));
    if (value == null) return;
    const derivedSubtotal = round2(invoice.lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
    const computedTotal = round2(derivedSubtotal + invoice.freight + invoiceChargesTotal(invoice));
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

    // M-07 d13 — the Invoice writes its journal HERE, at finalize, not at paid.
    // Finalize is when the money becomes real: the lines just became sellable
    // inventory (E-02 step 22) and the debt to the supplier exists. Waiting for
    // paid would leave stock on the shelf for the length of the supplier's
    // terms with no Inventory and no Accounts Payable behind it.
    //
    // M-06 d59 — the ledger is kept in the HOME currency, and the rate the
    // conversion used is recorded on the Invoice. This amends M-07 d17, whose
    // "nothing is ever converted" was right for a system that only exported:
    // a set of journal lines has to balance in one currency to be double entry,
    // and a USD payable settled from a CAD bank balances in neither.
    //
    // d61 — the rate is a property of the CURRENCY (d33), not of the Supplier.
    const invoiceCurrency = supplier.currency || s.homeCurrency;
    const exchangeRate =
      invoiceCurrency === s.homeCurrency
        ? 1
        : (s.currencies.find((c) => c.code === invoiceCurrency)?.rate ?? 1);
    const finalized = { ...invoice, lines: updatedLines, exchangeRate };
    const journal = buildInvoiceJournal({
      invoice: finalized,
      writtenAt: now(),
      accounts: s.glAccounts,
      mappings: s.glMappings,
      currency: invoiceCurrency,
      homeCurrency: s.homeCurrency,
      rate: exchangeRate,
      location: s.storeDetails.storeId, // M-08 d12, d27 / A-72 — the line's own Store
    });

    setS((prev) => ({
      ...prev,
      journals: [journal.batch, ...prev.journals],
      reviewFlags: journalFlags(journal, `invoice ${invoice.invoiceNumber}`, prev.reviewFlags),
      nextInternalBarcode: barcodeSeq,
      inventory: [...(reconciledInventory ?? prev.inventory), ...allNewItems],
      invoices: prev.invoices.map((iv) =>
        iv.id === invoiceId
          ? {
              ...iv,
              status: "Finalized",
              lines: updatedLines,
              // M-06 d59 — the rate rides on the ARTIFACT. Stored here so a
              // void reverses the figures this Invoice used (A-33a's "reverse
              // as recorded") and a later rate move cannot leak into it.
              exchangeRate,
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

    return { itemCount: allNewItems.length, journal: journal.batch, unresolved: journal.unresolved };
  };

  // Only this locks an Invoice (decision — finalize alone no longer does).
  // Manager-only, per M-05: Accounts Payable settling the balance is what
  // makes the paperwork official.
  const markInvoicePaid: AppContextValue["markInvoicePaid"] = (invoiceId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
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
  };

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
  const settlePayables: AppContextValue["settlePayables"] = (input, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction, so a demotion between the prompt and the write bites
    // (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => {
      const at = now();
      const targets: PaymentTarget[] = [];

      // M-05 d42 / A-69 — a target names the Invoice, the amount and the kind,
      // and NOT which credit funded it. The credits are named on the batch
      // instead (`batch.credits`), which is where A-37's `consumed` now reads
      // from. d18 is untouched: it was always about which INVOICES a credit
      // lands on, which stays the Manager's.
      //
      // The drawdown is still ordered, because d43 needs one — whichever credit
      // it straddles is the one that emits the remainder. The order used is the
      // order given; making that TICK order is d43's own work.
      const pool = input.credits.map((c) => ({ ...c, left: round2(c.amount) }));

      const overpayments: { ref: string; amount: number }[] = [];
      for (const d of input.debits) {
        let credit = round2(d.credit ?? 0);
        let creditApplied = 0;
        while (credit > 0.005) {
          const src = pool.find((p) => p.left > 0.005);
          if (!src) break;
          const take = round2(Math.min(credit, src.left));
          src.left = round2(src.left - take);
          credit = round2(credit - take);
          creditApplied = round2(creditApplied + take);
          targets.push({ kind: d.kind, id: d.id, amount: take, settleKind: "credit" });
        }
        // d38 — money over and above what this debit owes is NOT refused and is
        // NOT written onto the target: the target takes what the debit owed,
        // and the excess becomes a remainder Credit below. That keeps the
        // Invoice's derived balance at zero rather than negative (d8 — balances
        // are derived, never edited), while the money that actually left the
        // bank is still the sum of the target and the artifact.
        const moneyPart = round2(d.money ?? 0);
        const room = round2(Math.max(0, round2(d.balance) - creditApplied));
        const applied = round2(Math.min(moneyPart, room));
        if (applied > 0.005) {
          targets.push({ kind: d.kind, id: d.id, amount: applied, settleKind: "money" });
        }
        const excess = round2(moneyPart - applied);
        if (excess > 0.005) overpayments.push({ ref: d.reference ?? d.id, amount: excess });
      }
      if (targets.length === 0 && input.placeholderIds.length === 0) return prev;

      const batch: PaymentBatch = {
        id: uid("batch"),
        supplierId: input.supplierId,
        method: input.method,
        reference: input.reference,
        drawnOnAccountId: input.drawnOnAccountId,
        // M-06 d60 — recorded, never derived. The bank statement is the fact;
        // a stored rate is only an estimate of it (M-05 d5).
        ...(input.paidAmount != null ? { paidAmount: input.paidAmount } : {}),
        date: input.date,
        recordedBy: by,
        createdAt: at,
        targets,
        // A-69 — the credits that funded this batch, each with what it applied.
        // d27: only a credit the drawdown reached is named, so one ticked but
        // never drawn stays as it was and is not consumed by this settlement.
        credits: pool
          .filter((c) => round2(c.amount) - c.left > 0.005)
          .map((c) => ({ creditId: c.id, amount: round2(round2(c.amount) - c.left) })),
      };

      // d28 — every credit CONSUMED BY a settlement is consumed whole, claim or
      // entry alike, so nothing carries a partial state. d25 — what could not
      // attach comes back as its own artifact, ONE PER SOURCE CREDIT (A-36),
      // carrying provenance.
      //
      // d27 — "whatever cannot attach STAYS AS IT WAS". A credit the drawdown
      // never reached is not consumed by this settlement and emits nothing. It
      // used to emit a remainder for its full value while staying un-consumed,
      // so the credit and its remainder both reduced the balance — a move with
      // no money and no agreement behind it, which d26 forbids, and it left the
      // credit on the list to be spent again at full value (A-37's hazard).
      const remainders: PayableEntry[] = [];
      for (const c of pool) {
        const left = c.left;
        const touched = left < round2(c.amount) - 0.005;
        if (touched && left > 0.005) {
          remainders.push({
            id: uid("rem"),
            supplierId: input.supplierId,
            type: "Credit",
            source: "remainder",
            fromBatchId: batch.id,
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

      // d38's first door — money paid over and above what a debit owed. Same
      // artifact as a credit's remainder, because it is the same fact: money
      // that ended up in the store's favour. It carries no `fromCreditId`, no
      // credit having produced it, and the supplier balance goes negative by
      // this much until it is spent (d25).
      for (const o of overpayments) {
        remainders.push({
          id: uid("rem"),
          supplierId: input.supplierId,
          type: "Credit",
          source: "remainder",
          fromBatchId: batch.id,
          reference: `Overpayment on ${o.ref}`,
          date: input.date,
          subtotal: o.amount,
          tax: 0,
          freight: 0,
          misc: 0,
          createdBy: by,
          createdAt: at,
          log: [
            {
              at,
              text: `${money(o.amount)} paid over the balance of ${o.ref} — recorded as paid and returned as a Credit (d38, d25)`,
            },
          ],
        });
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
              // The discriminator d39 needs: this was a SETTLEMENT's disposal,
              // not a Manager's d15 clearing, so un-clear must not touch it.
              clearedInBatchId: batch.id,
              log: [...e.log, { at, text: `Retired in a settlement by ${by} — contributed nothing (d27)` }],
            };
          }
          return e;
        })
        .concat(remainders);

      // M-07 d12 — the PaymentBatch writes its own journal at record (M-05
      // d16), inside this same transaction (A-67). It does not wait for a
      // close and there is no month-end routine: the batch already IS a batch,
      // one immutable dated artifact whose journal is a fixed function of it.
      const journal = buildPaymentJournal({
        batch,
        writtenAt: at,
        accounts: prev.glAccounts,
        currency: prev.homeCurrency,
        location: prev.storeDetails.storeId, // M-08 d12, d27 / A-72 — the line's own Store
        // M-06 d59 — clear the payable at the rate the INVOICE recorded, not
        // at today's. Without this a USD 1,000 Invoice booked at 1.35 credits
        // A/P CAD 1,350 and a payment clearing "1,000" debits CAD 1,000,
        // leaving 350 of residue that nothing ever clears.
        bookedRateFor: (targetId) => prev.invoices.find((iv) => iv.id === targetId)?.exchangeRate ?? 1,
      });

      return {
        ...prev,
        paymentBatches,
        invoices,
        payableEntries,
        journals: [journal.batch, ...prev.journals],
        reviewFlags: journalFlags(journal, `payment ${batch.reference || batch.id}`, prev.reviewFlags),
      };
    });
  };

  // M-05 d22 / d30 — void a PaymentBatch. Whole or not at all, appended never
  // edited, and it NEVER REFUSES: where the settlement emitted a remainder, the
  // void appends a reversing Adjustment of equal and opposite amount rather
  // than reclaiming it. So it does not matter what became of that remainder
  // since, and void legality is not order-dependent along a chain (d30).
  //
  // Nothing un-consumes a credit by writing to it — a credit is consumed by the
  // PRESENCE of a live target (A-37), so voiding the batch releases it with
  // nothing to flip. The same is true of the Invoice's immutability (A-33a).
  const voidPaymentBatch: AppContextValue["voidPaymentBatch"] = (batchId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return;
    const by = recorded(mgr.name, byAuth.userId);
    setS((prev) => {
      const batch = prev.paymentBatches.find((b) => b.id === batchId);
      if (!batch || prev.batchVoids.some((v) => v.batchId === batchId)) return prev;

      const at = now();
      const voidRow: PaymentBatchVoid = { id: uid("void"), batchId, voidedAt: at, voidedBy: by };

      // d30 — one reversing Adjustment per remainder this batch emitted.
      const reversals: PayableEntry[] = prev.payableEntries
        .filter((e) => e.source === "remainder" && e.fromBatchId === batch.id)
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

      // d49 — where the money returns to an entry sitting in a CLEARING, it
      // lands on a row the ledger hides. The void still proceeds (d30 — it
      // never refuses) and the clearing is left alone, because d15's
      // sum-to-zero runs on FACE and a void does not change face: the clearing
      // is still true. What is wrong is only that the money is invisible, so
      // the system says so. A-68 is what allows a flag with no actor.
      // M-07 d8 — **a correction posts forward. The original entry always
      // stands.** A PaymentBatch voided under M-05 d22 produces a reversing
      // entry dated WHEN SOMEONE ACTUALLY DID IT, never an edit to the day it
      // concerns. This is A-33a's "reverse as recorded" applied to the ledger,
      // and it is what keeps a period that has been exported, imported and
      // filed from moving under the person who filed it.
      const journal = buildPaymentJournal({
        batch,
        writtenAt: at,
        accounts: prev.glAccounts,
        currency: prev.homeCurrency,
        location: prev.storeDetails.storeId, // M-08 d12, d27 / A-72 — the line's own Store
        // M-06 d59 — clear the payable at the rate the INVOICE recorded, not
        // at today's. Without this a USD 1,000 Invoice booked at 1.35 credits
        // A/P CAD 1,350 and a payment clearing "1,000" debits CAD 1,000,
        // leaving 350 of residue that nothing ever clears.
        bookedRateFor: (targetId) => prev.invoices.find((iv) => iv.id === targetId)?.exchangeRate ?? 1,
        reversalOf: { voidId: voidRow.id, voidedAt: at },
      });

      return {
        ...prev,
        batchVoids: [voidRow, ...prev.batchVoids],
        // d54 — a void un-retires the Claim placeholders THIS batch disposed of.
        // d22 reverses every target; d27 makes a placeholder not a target and
        // calls its retirement a real disposal. Neither said what a void does to
        // one, and the answer follows what clearedInBatchId already models: the
        // disposal belongs to the BATCH. Without this the row had no exit at all,
        // since unclearRefusal refuses on a settlement's disposal by design.
        payableEntries: [
          ...prev.payableEntries.map((e) => unretireOnVoid(e, batch.id, at, by)),
          ...reversals,
        ],
        invoices,
        journals: [journal.batch, ...prev.journals],
        reviewFlags: journalFlags(journal, `the void of ${batch.reference || batch.id}`, prev.reviewFlags),
      };
    });
  };

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
  const clearPayableEntries: AppContextValue["clearPayableEntries"] = (entryIds, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { cleared: false };
    const by = recorded(mgr.name, byAuth.userId);

    const entries = entryIds.map((id) => s.payableEntries.find((e) => e.id === id)).filter((e): e is PayableEntry => !!e);
    if (entries.length < 2 || entries.length !== entryIds.length) return { cleared: false };
    // d46 — cleared is now DERIVED from a clearing naming the entry, so the
    // check is "is it already in one", not "does it carry a mark".
    if (entries.some((e) => entryIsCleared(e.id, s.clearings) || e.clearedAt)) return { cleared: false };
    if (new Set(entries.map((e) => e.supplierId)).size > 1) return { cleared: false };
    const net = round2(entries.reduce((sum, e) => sum + payableEntrySignedAmount(e), 0));
    if (Math.abs(net) > 0.005) return { cleared: false };

    const at = now();
    const clearing: Clearing = {
      id: uid("clr"),
      supplierId: entries[0].supplierId,
      memberIds: [...entryIds],
      clearedAt: at,
      clearedBy: by,
    };
    setS((prev) => ({
      ...prev,
      clearings: [clearing, ...prev.clearings],
      payableEntries: prev.payableEntries.map((e) =>
        entryIds.includes(e.id)
          ? {
              ...e,
              // A-70 — the log NAMES the siblings. Deleting the clearing (d48)
              // destroys the grouping, and "cleared against 2 others" does not
              // say which two; this is what makes the act survive the row.
              log: [
                ...e.log,
                {
                  at,
                  text: `Cleared against ${clearedAgainst(e.id, entries)} by ${by} — net ${money(net)} (d15)`,
                },
              ],
            }
          : e,
      ),
    }));
    return { cleared: true };
  };

  /**
   * M-05 d39 — un-clear. A clearing moves no money and writes no journal lines
   * ([M-07] d12 has nothing to post), so reversing one reverses nothing real:
   * the mark comes off and both rows return to the outstanding list. No void
   * artifact is built, and architecture A-36 already agreed — it gives
   * `ap_payment_batch_voids` and `supplier_claim_voids` and no clearing
   * equivalent.
   *
   * REFUSES on a row a SETTLEMENT retired (d27's placeholder disposal), which
   * `clearedInBatchId` is what distinguishes. d39 makes a CLEARING reversible
   * and says nothing about a settlement's disposal — reversing that is its
   * batch's void (d22), which d54 settles: the void un-retires it. This still
   * refuses, because the void is now the route — not a hole this had to patch.
   */
  const unclearPayableEntries: AppContextValue["unclearPayableEntries"] = (clearingId, byAuth) => {
    // §6 — an M function resolves the Manager ITSELF, in the same
    // transaction. The brand proves the check passed when the id was
    // minted; this proves it still holds now, so a demotion between the
    // prompt and the write bites (A-28a, A-4, A-48).
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok) return { uncleared: false, reason: mgr.refusal };
    const by = recorded(mgr.name, byAuth.userId);

    const clearing = s.clearings.find((c) => c.id === clearingId);
    const refusal = unclearRefusal(clearing);
    if (refusal || !clearing) return { uncleared: false, reason: refusal };

    const at = now();
    const members = clearing.memberIds
      .map((id) => s.payableEntries.find((e) => e.id === id))
      .filter((e): e is PayableEntry => !!e);
    setS((prev) => ({
      ...prev,
      // d48 / A-70 — the clearing is REMOVED, not marked. Its members are
      // un-cleared by the absence of the row, with nothing to flip, exactly as
      // A-33a releases an Invoice and A-37 releases a credit.
      clearings: prev.clearings.filter((c) => c.id !== clearingId),
      payableEntries: prev.payableEntries.map((e) =>
        clearing.memberIds.includes(e.id)
          ? {
              ...e,
              log: [
                ...e.log,
                {
                  at,
                  text: `Un-cleared by ${by} — was cleared against ${clearedAgainst(e.id, members)}; back on the outstanding list (d39, d48)`,
                },
              ],
            }
          : e,
      ),
    }));
    return { uncleared: true };
  };

  /**
   * M-07 d3 — the Manager edits an account's NUMBER and NAME to match the chart
   * their accountant already keeps. The role is absent from the patch on
   * purpose: it is what the software resolves by, and is not theirs to change.
   *
   * M-06 d9 (inherited) — an account is deactivated, never deleted.
   */
  const updateGLAccount: AppContextValue["updateGLAccount"] = (id, patch) =>
    setS((prev) => ({
      ...prev,
      glAccounts: prev.glAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  /** Step 3 — an added account carries NO role, so nothing posts to it by itself. */
  const addGLAccount: AppContextValue["addGLAccount"] = (number, name, type) =>
    setS((prev) => ({
      ...prev,
      glAccounts: [...prev.glAccounts, { id: uid("gl"), number, name, type, active: true }],
    }));

  /**
   * Step 5 — repoint a seam. Two seams may share one account, which is how a
   * shop collapses a breakdown it does not want; the mapping is replaced rather
   * than added, so a seam always resolves to exactly one account (d11).
   */
  const setGLMapping: AppContextValue["setGLMapping"] = (seamKind, seamId, accountId) =>
    setS((prev) => ({
      ...prev,
      glMappings: [
        ...prev.glMappings.filter((m) => !(m.seamKind === seamKind && m.seamId === seamId)),
        { seamKind, seamId, accountId },
      ],
    }));

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
  const voidPurchaseOrder: AppContextValue["voidPurchaseOrder"] = (poNumber, byAuth) => {
    // A-54 gates voiding a PurchaseOrder, and §6 has the function resolve the
    // Manager itself rather than trust the caller.
    const mgr = requireManager(s.users, byAuth);
    if (!mgr.ok || !byAuth) return { returned: 0, split: 0, untouched: 0 };
    const by = recorded(mgr.name, byAuth.userId);
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
      ledgerSaveOpening,
      ledgerSealOpening,
      ledgerPost,
      ledgerSeal,
      ledgerUnseal,
      ledgerMarkYearFiled,
      ledgerReconcile,
      ledgerIssue,
      ledgerSuspenseGross,
      closeUndoRefusalFor,
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
      chooseReturnRoute,
      finishReturn,
      finishReturnBlocked,
      voidStockRefusal,
      toggleProvider,
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
      unclearPayableEntries,
      updateGLAccount,
      addGLAccount,
      setGLMapping,
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
      identify,
      endSession,
      touchSession,
      sessionLastActivity: s.sessionLastActivity,
      currentStoreId,
      currentStore,
      storeDetailsFor,
      terminalName,
      isPersonalSession,
      signInStoreAccount,
      signInPersonal,
      signInSysadmin,
      signOut,
      selectStore,
      selectableStores,
      authorizeByPin,
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
      upsertGenre,
      releaseCache: s.releaseCache,
      adoptRelease,
      resolveAdoptionGenre,
      addMapRow,
      updateMapRow,
      removeMapRow,
      mergeGenres,
      deleteGenre,
      genreUseCount,
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
      setUserPin,
      assignToStore,
      unassignFromStore,
      requestPasswordReset,
      setOwnPassword,
      addStore,
      setStoreAccountPassword,
      createOrganization,
      sysadminRequestOwnerReset,
      sysadminRecoverOwner,
      orgUsers,
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
