/**
 * A month of trading, generated at load.
 *
 * WHY THIS EXISTS. The seed in `seed.ts` is master data — a catalog, four
 * Suppliers, a chart of accounts — and until now the shop opened having never
 * sold anything. Several screens could only be reviewed against an empty set:
 * the Ledger had no activity because nothing had written a journal, the
 * Suppliers ledger's *Received* and *A/P* figures coincided because every
 * seeded Invoice carried no tax and no freight (`docs/prototype.md`), and
 * Accounts payable had one settled bill and nothing aged.
 *
 * WHAT IT IS NOT. It is not a fixture the tests assert against, and it is not
 * a requirement. Volumes, titles, prices and the shop's opening pattern are
 * illustrative — invented to make the screens legible, not derived from any
 * decision. `seed.ts` is deliberately untouched: everything here is ADDITIVE,
 * so the pure-function tests that import the master data keep seeing exactly
 * what they saw before.
 *
 * TWO RULES IT DOES FOLLOW, because breaking either would make the prototype
 * lie rather than merely simplify:
 *
 *   1. **Every artifact carries its own journal** (M-07 d12, architecture
 *      A-67) — and the journal is built by the same `buildInvoiceJournal`,
 *      `buildPaymentJournal` and `buildCloseJournal` the app calls, never
 *      hand-written here. A generated month cannot disagree with the books,
 *      because the books are computed from it by the shipping code.
 *
 *   2. **Stock is received before it is sold.** A Sale consumes an
 *      InventoryItem minted by an Invoice finalized on an earlier day, so
 *      on-hand counts, cost of goods and provenance all resolve.
 *
 * DATES ARE RELATIVE. The window ends yesterday and moves with the calendar,
 * so the shop is never a museum piece and today is always an empty day waiting
 * to be traded and closed. The consequence, and it is a real one: the same
 * click gives different figures next week. Nothing asserts against these
 * numbers, which is what makes that affordable.
 */

import {
  buildInvoiceJournal,
  buildPaymentJournal,
} from "../lib/artifactJournals";
import { buildCloseJournal } from "../lib/closeJournal";
import { computeDayBreakdown, SUMMARY_SCHEMA_VERSION } from "../lib/dayBreakdown";
import { lineTaxComponents, round2, saleTotals, type TaxContext } from "../lib/totals";
import { CUSTOMERS, GENRES, NON_TRACKED, RECORDS, SUPPLIERS, USERS } from "./seed";
import type {
  CloseBatch,
  Customer,
  GLAccount,
  GLMapping,
  Genre,
  InventoryItem,
  Invoice,
  InvoiceLine,
  JournalBatch,
  PayableEntry,
  PaymentBatch,
  RecordEntry,
  Sale,
  SaleLine,
  SectionRow,
  Supplier,
  TaxGroupCell,
  TaxType,
  TenderRow,
} from "./types";

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/**
 * Seeded from the anchor date, so a given day generates the same shop every
 * time it is loaded. Without this a refresh reshuffles the figures under
 * whoever is mid-review, and "the number moved" becomes impossible to tell
 * apart from "I clicked something".
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stampOf = (d: Date, h: number, m: number) => `${isoOf(d)} ${pad(h)}:${pad(m)}:00`;

/** Midnight local, `back` days before the anchor. */
const dayBefore = (anchor: Date, back: number): Date => {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  d.setDate(d.getDate() - back);
  return d;
};

// ---------------------------------------------------------------------------
// What the generator needs from the store's own configuration
// ---------------------------------------------------------------------------

export interface HistoryInput {
  accounts: GLAccount[];
  mappings: GLMapping[];
  sections: SectionRow[];
  tenders: TenderRow[];
  taxTypes: TaxType[];
  taxGroupCells: TaxGroupCell[];
  defaultTaxGroup: string;
  homeCurrency: string;
  storeId: string;
  /** How many days back the window reaches. The last day is yesterday. */
  days?: number;
  /** Overridable so a test can pin the window; defaults to now. */
  anchor?: Date;
  /**
   * Artifacts `seed.ts` already held, which were written before anything in
   * this prototype wrote journals at all — three Finalized Invoices and a
   * settlement, all with no journal behind them.
   *
   * They have to be journalled HERE rather than left alone, and the reason is
   * an invariant rather than tidiness: [M-05](../../../docs/flows/M-05-accounts-payable.md)
   * commits that the ledger's *Accounts payable* account **is** that flow's
   * balance, "exactly and permanently — a divergence is a defect, never a
   * leftover". Journalling the generated month and not these would put the
   * shop's own seeded debt outside the books and make that invariant false on
   * the first screen anyone opened.
   *
   * The three legacy **Sales** are deliberately NOT closed or journalled — see
   * `docs/prototype.md`.
   */
  legacy?: { invoices: Invoice[]; paymentBatches: PaymentBatch[] };
}

export interface GeneratedHistory {
  records: RecordEntry[];
  customers: Customer[];
  suppliers: Supplier[];
  inventory: InventoryItem[];
  invoices: Invoice[];
  sales: Sale[];
  closeBatches: CloseBatch[];
  paymentBatches: PaymentBatch[];
  payableEntries: PayableEntry[];
  journals: JournalBatch[];
  nextSaleNumber: number;
  nextInternalBarcode: number;
  /** Diagnostics: anything a journal builder could not resolve. Empty is the
   *  expected state, and the test asserts it. */
  unresolved: string[];
}

// ---------------------------------------------------------------------------
// The floor — titles the shop carries beyond the eight `seed.ts` holds
// ---------------------------------------------------------------------------

interface TitleSpec {
  id: string;
  artist: string;
  title: string;
  label: string;
  catalogNo: string;
  year: number;
  genreId: string;
  art: string;
  price: number;
  /**
   * Roughly how often this one sells, relative to the others. **Zero means the
   * random picker never reaches it** — it moves only through a scripted sale
   * below, which is how a title is made to sell out on a chosen day.
   */
  weight: number;
  /**
   * The Record already exists in `seed.ts`; this entry only makes it
   * TRADEABLE. No RecordEntry is generated for it, or the catalog would carry
   * the same title twice.
   */
  existing?: true;
}

const TITLES: TitleSpec[] = [
  { id: "r-h-whatsgoing", artist: "Marvin Gaye", title: "What's Going On", label: "Tamla", catalogNo: "TS 310", year: 1971, genreId: "gn-funk-pop", art: "🕊️", price: 32.99, weight: 5 },
  { id: "r-h-ramones", artist: "Ramones", title: "Ramones", label: "Sire", catalogNo: "SASD-7520", year: 1976, genreId: "gn-art-punk", art: "🧱", price: 27.99, weight: 4 },
  { id: "r-h-lauryn", artist: "Lauryn Hill", title: "The Miseducation of Lauryn Hill", label: "Ruffhouse", catalogNo: "C2 69035", year: 1998, genreId: "gn-hip-hop", art: "🪷", price: 39.99, weight: 6 },
  { id: "r-h-bluetrain", artist: "John Coltrane", title: "Blue Train", label: "Blue Note", catalogNo: "BLP 1577", year: 1958, genreId: "gn-modal-jazz", art: "🚂", price: 36.99, weight: 4 },
  { id: "r-h-hounds", artist: "Kate Bush", title: "Hounds of Love", label: "EMI", catalogNo: "KAB 1", year: 1985, genreId: "gn-pop-rock", art: "🐕", price: 31.99, weight: 5 },
  { id: "r-h-remain", artist: "Talking Heads", title: "Remain in Light", label: "Sire", catalogNo: "SRK 6095", year: 1980, genreId: "gn-art-punk", art: "🎭", price: 29.99, weight: 4 },
  { id: "r-h-harvest", artist: "Neil Young", title: "Harvest", label: "Reprise", catalogNo: "MS 2032", year: 1972, genreId: "gn-folk-rock", art: "🌾", price: 28.99, weight: 4 },
  { id: "r-h-voodoo", artist: "D'Angelo", title: "Voodoo", label: "Virgin", catalogNo: "7243 8 48499", year: 2000, genreId: "gn-funk-pop", art: "🕯️", price: 42.99, weight: 3 },
  { id: "r-h-unknown", artist: "Joy Division", title: "Unknown Pleasures", label: "Factory", catalogNo: "FACT 10", year: 1979, genreId: "gn-art-punk", art: "📈", price: 30.99, weight: 5 },
  { id: "r-h-graceland", artist: "Paul Simon", title: "Graceland", label: "Warner Bros.", catalogNo: "25447-1", year: 1986, genreId: "gn-pop-rock", art: "🏰", price: 26.99, weight: 3 },
  { id: "r-h-ahum", artist: "Charles Mingus", title: "Mingus Ah Um", label: "Columbia", catalogNo: "CL 1370", year: 1959, genreId: "gn-modal-jazz", art: "🎺", price: 34.99, weight: 3 },
  { id: "r-h-lowend", artist: "A Tribe Called Quest", title: "The Low End Theory", label: "Jive", catalogNo: "1418-1-J", year: 1991, genreId: "gn-hip-hop", art: "🟥", price: 35.99, weight: 5 },
  { id: "r-h-dummy", artist: "Portishead", title: "Dummy", label: "Go! Beat", catalogNo: "828 522-1", year: 1994, genreId: "gn-alt-rock", art: "🌫️", price: 33.99, weight: 4 },
  { id: "r-h-blonde", artist: "Frank Ocean", title: "Blonde", label: "Boys Don't Cry", catalogNo: "BDC 001", year: 2016, genreId: "gn-alt-rock", art: "🍋", price: 44.99, weight: 6 },

  // Two titles `seed.ts` already carries, made tradeable so they can be
  // received and then SOLD OUT — which is what gives E-03's *Had before* band
  // something to describe. Both at weight 0: they move only through the
  // scripted sales in SELL_OUTS, because a title that sells out on a day the
  // random picker chose is not a fixture, it is a coincidence.
  { id: "r-madvillainy", artist: "Madvillain", title: "Madvillainy", label: "Stones Throw", catalogNo: "STH2065", year: 2004, genreId: "gn-hip-hop", art: "🎭", price: 32.99, weight: 0, existing: true },
  { id: "r-astral", artist: "Van Morrison", title: "Astral Weeks", label: "Warner Bros.", catalogNo: "WS 1768", year: 1968, genreId: "gn-folk-rock", art: "🌌", price: 27.5, weight: 0, existing: true },
];

/**
 * A title the shop received, sold every copy of, and now holds none of.
 *
 * E-03's four stock states put such a Record in *Had before* (`stockState.ts`),
 * and `seed.ts` used to reach that band with two hand-written Sales carrying no
 * copy at all — which meant revenue with no cost behind it the moment anything
 * journalled them. Received and sold properly, the same two titles reach the
 * same band with provenance, a cost of goods and a close behind each copy.
 *
 * The two dates are far apart on purpose, which was the seed's intent too: the
 * recency stamp has both a recent sell-out and a long-cold one to render.
 */
interface SellOutSpec {
  recordId: string;
  /** Days before the anchor each copy left, one entry per copy. */
  soldBacks: number[];
  customerId?: string;
}

const SELL_OUTS: SellOutSpec[] = [
  // Recent: received inside the window on invoice 55241, gone within the month.
  { recordId: "r-madvillainy", soldBacks: [24, 22], customerId: "c-ramona" },
  // Long cold: received and sold out roughly six months ago, well before the
  // trading window opens, so the stamp reads as a month and a year.
  { recordId: "r-astral", soldBacks: [187, 186] },
];

const HISTORY_RECORDS: RecordEntry[] = TITLES.filter((t) => !t.existing).map((t) => ({
  id: t.id,
  artist: t.artist,
  title: t.title,
  label: t.label,
  catalogNo: t.catalogNo,
  format: "LP, Album",
  year: t.year,
  country: "US",
  genreId: t.genreId,
  art: t.art,
  stickyPrice: t.price,
  minOnHand: 1,
}));

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

interface CustomerSpec {
  id: string;
  name: string;
  phone: string;
  email: string;
  discount: number;
  type: Customer["accountType"];
}

const CUSTOMER_SPECS: CustomerSpec[] = [
  { id: "c-h-abena", name: "Abena Mensah", phone: "514-555-0210", email: "abena.mensah@example.com", discount: 0, type: "Regular" },
  { id: "c-h-jules", name: "Jules Barrette", phone: "514-555-0233", email: "jules.b@example.com", discount: 10, type: "Staff" },
  { id: "c-h-priya", name: "Priya Raghunathan", phone: "438-555-0188", email: "priya.r@example.com", discount: 0, type: "Regular" },
  { id: "c-h-dmitri", name: "Dmitri Sokolov", phone: "514-555-0144", email: "d.sokolov@example.com", discount: 0, type: "Regular" },
  { id: "c-h-cafe", name: "Café Ruelle (wholesale)", phone: "514-555-0301", email: "orders@caferuelle.example", discount: 15, type: "Business" },
  { id: "c-h-noor", name: "Noor Haddad", phone: "438-555-0266", email: "noor.haddad@example.com", discount: 0, type: "Regular" },
  { id: "c-h-esteban", name: "Esteban Rivas", phone: "514-555-0119", email: "e.rivas@example.com", discount: 0, type: "Regular" },
  { id: "c-h-margot", name: "Margot Lefèvre", phone: "514-555-0175", email: "margot.l@example.com", discount: 0, type: "Regular" },
  { id: "c-h-kenji", name: "Kenji Watanabe", phone: "438-555-0222", email: "k.watanabe@example.com", discount: 0, type: "Regular" },
  { id: "c-h-thandi", name: "Thandiwe Moyo", phone: "514-555-0290", email: "t.moyo@example.com", discount: 0, type: "Regular" },
];

const HISTORY_CUSTOMERS: Customer[] = CUSTOMER_SPECS.map((c, i) => ({
  id: c.id,
  primaryId: CUSTOMERS.length + 1 + i,
  accountNumber: `WW-${2200 + i}`,
  accountType: c.type,
  name: c.name,
  phone: c.phone,
  email: c.email,
  contactPreference: i % 3 === 0 ? "Phone" : "Email",
  globalDiscountPct: c.discount,
  balance: 0,
}));

/**
 * A fifth Supplier, so Accounts payable has more than one shape of bill to
 * show and the aging buckets are reachable from more than one card.
 */
const HISTORY_SUPPLIERS: Supplier[] = [
  {
    id: "sup-north",
    shortName: "NPCO",
    name: "Northern Pressing Co.",
    accountNumber: "NP-3308",
    orderVia: "Email",
    minOrderQty: 12,
    minOrderAmount: 0,
    minOrderAmountBasis: "Net",
    discountPct: 45,
    cancelByDays: 30,
    currency: "CAD",
    paymentTerms: "Net 30",
    defaultPaymentMethod: "Cheque",
    type: "New",
    notes: "Canadian pressing plant — direct, no rep.",
    email: "accounts@northernpressing.example",
    backordersAllowed: true,
    mainPhone: "416-555-0138",
    billing: { line1: "19 Bathurst St", city: "Toronto", provinceState: "ON", country: "Canada" },
    shipSameAsBilling: true,
    log: [],
  },
];

// ---------------------------------------------------------------------------
// The receiving schedule
// ---------------------------------------------------------------------------

interface IntakeSpec {
  /** Days before the anchor the Invoice was finalized. */
  back: number;
  supplierId: string;
  invoiceNumber: string;
  discountPct: number;
  /** Which titles came in, and how many of each. */
  lines: { titleId: string; qty: number }[];
  freight: number;
  /** Labelled tax charges — E-02 d53, the split M-07 d5 needs. */
  taxed: boolean;
  exchangeRate?: number;
  /** A settlement recorded against it, `back` days before the anchor. */
  paidBack?: number;
}

/**
 * Deliberately uneven. Two Invoices land before the sales window so the shop
 * opens the month with stock already on the floor, and the unpaid ones are
 * spread so Accounts payable shows something in more than one aging bucket:
 * the FAB one at -52 days on Net 30 is properly overdue, and the Prepaid
 * Crate Digger bill is outstanding while ageing nowhere at all (M-05 d35).
 */
const INTAKES: IntakeSpec[] = [
  // Deep history — roughly seven months back, long settled, and the only
  // reason it exists is to put copies behind the long-cold sell-out below.
  // Its journal lands in its own month, which is correct: nothing is sealed,
  // and M-08 d11 only refuses a date inside a SEALED period.
  {
    back: 215,
    supplierId: "sup-fab",
    invoiceNumber: "54402",
    discountPct: 60,
    freight: 9.5,
    taxed: true,
    paidBack: 201,
    lines: [{ titleId: "r-astral", qty: 2 }],
  },
  {
    back: 52,
    supplierId: "sup-fab",
    invoiceNumber: "55198",
    discountPct: 60,
    freight: 22.5,
    taxed: true,
    lines: [
      { titleId: "r-h-whatsgoing", qty: 27 },
      { titleId: "r-h-ramones", qty: 22 },
      { titleId: "r-h-hounds", qty: 27 },
      { titleId: "r-h-unknown", qty: 27 },
      { titleId: "r-h-harvest", qty: 22 },
    ],
  },
  {
    back: 44,
    supplierId: "sup-north",
    invoiceNumber: "NP-11204",
    discountPct: 45,
    freight: 18.0,
    taxed: true,
    paidBack: 16,
    lines: [
      { titleId: "r-h-lauryn", qty: 27 },
      { titleId: "r-h-lowend", qty: 27 },
      { titleId: "r-h-blonde", qty: 32 },
    ],
  },
  {
    back: 33,
    supplierId: "sup-indie",
    invoiceNumber: "3471",
    discountPct: 50,
    freight: 26.0,
    taxed: false,
    exchangeRate: 1.42,
    lines: [
      { titleId: "r-h-dummy", qty: 22 },
      { titleId: "r-h-remain", qty: 22 },
      { titleId: "r-h-voodoo", qty: 18 },
    ],
  },
  {
    back: 26,
    supplierId: "sup-fab",
    invoiceNumber: "55241",
    discountPct: 60,
    freight: 19.75,
    taxed: true,
    paidBack: 9,
    lines: [
      { titleId: "r-h-bluetrain", qty: 22 },
      { titleId: "r-h-ahum", qty: 18 },
      { titleId: "r-h-graceland", qty: 22 },
      { titleId: "r-h-whatsgoing", qty: 18 },
      // SELL_OUTS takes both copies back off the floor inside the window.
      { titleId: "r-madvillainy", qty: 2 },
    ],
  },
  {
    back: 18,
    supplierId: "sup-crate",
    invoiceNumber: "CD-7719",
    discountPct: 40,
    freight: 0,
    taxed: true,
    lines: [
      { titleId: "r-h-unknown", qty: 18 },
      { titleId: "r-h-ramones", qty: 18 },
      { titleId: "r-h-dummy", qty: 14 },
    ],
  },
  {
    back: 11,
    supplierId: "sup-north",
    invoiceNumber: "NP-11377",
    discountPct: 45,
    freight: 21.0,
    taxed: true,
    lines: [
      { titleId: "r-h-blonde", qty: 27 },
      { titleId: "r-h-lauryn", qty: 22 },
      { titleId: "r-h-hounds", qty: 18 },
    ],
  },
  {
    back: 4,
    supplierId: "sup-fab",
    invoiceNumber: "55310",
    discountPct: 60,
    freight: 17.25,
    taxed: true,
    lines: [
      { titleId: "r-h-lowend", qty: 22 },
      { titleId: "r-h-harvest", qty: 18 },
      { titleId: "r-h-voodoo", qty: 14 },
    ],
  },
];

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export function buildHistory(input: HistoryInput): GeneratedHistory {
  const anchor = input.anchor ?? new Date();
  const days = input.days ?? 30;
  const rand = rng(Number(isoOf(anchor).replace(/-/g, "")));
  const unresolved: string[] = [];

  const genreById = new Map<string, Genre>(GENRES.map((g) => [g.id, g]));
  const titleById = new Map<string, TitleSpec>(TITLES.map((t) => [t.id, t]));
  const allRecords = [...RECORDS, ...HISTORY_RECORDS];

  const allCustomers = [...CUSTOMERS, ...HISTORY_CUSTOMERS];
  // E-01 d25 — only people ASSIGNED to this Store work its counter.
  const staff = USERS.filter((u) => u.active && u.assignments.includes(input.storeId));
  const clerks = staff.filter((u) => u.role === "Employee").map((u) => `${u.name} (${u.role})`);
  const managers = staff.filter((u) => u.role === "Manager").map((u) => `${u.name} (${u.role})`);
  const anyClerk = () => clerks[Math.floor(rand() * clerks.length)] ?? managers[0] ?? "Unknown";
  const aManager = managers[0] ?? "Unknown";

  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

  // -- Receiving ------------------------------------------------------------

  const inventory: InventoryItem[] = [];
  const invoices: Invoice[] = [];
  const journals: JournalBatch[] = [];
  const paymentBatches: PaymentBatch[] = [];
  // PRD §4.3 — an internal barcode is UPC-A under GS1 number system 2: TWELVE
  // digits, `2` then eleven. `resolve_scan` keys on exactly that shape
  // (architecture §6), so a bare counter mints a code that resolves nowhere —
  // not at the till, not on a Return. This started at 20001 and minted
  // "20276", which is why every copy the seeded month of trading created was
  // unscannable while the hand-written seed's copies scanned fine.
  //
  // Offset well clear of seed.ts's block (2000000012xx-2000000xxxx) so the two
  // cannot collide; §6 resolves an internal barcode to exactly ONE item.
  let barcode = 900001;

  for (const [n, intake] of INTAKES.entries()) {
    const day = dayBefore(anchor, intake.back);
    const invoiceDate = isoOf(dayBefore(anchor, intake.back + 1));
    const finalizedAt = stampOf(day, 10, 15);
    const invoiceId = `inv-h-${n}`;

    const lines: InvoiceLine[] = intake.lines.map((l, i) => {
      const spec = titleById.get(l.titleId)!;
      // The supplier bills off a list price; the shop's cost is that less the
      // Supplier's discount, which is E-02 d49's suggested-retail input read
      // backwards. Rounded to the cent, because that is what a line is.
      const listPrice = round2(spec.price * 0.62);
      const cost = round2(listPrice * (1 - intake.discountPct / 100));
      const itemIds: string[] = [];
      for (let c = 0; c < l.qty; c++) {
        const itemId = `i-h-${n}-${i}-${c}`;
        itemIds.push(itemId);
        inventory.push({
          id: itemId,
          recordId: spec.id,
          grade: "M",
          price: spec.price,
          cost,
          internalBarcode: `2${String(barcode++).padStart(11, "0")}`,
          status: "sellable",
          invoiceLineId: `invline-h-${n}-${i}`,
        });
      }
      return {
        id: `invline-h-${n}-${i}`,
        recordId: spec.id,
        listPrice,
        discountPct: intake.discountPct,
        cost,
        acceptedPrice: spec.price,
        grade: "M",
        qty: l.qty,
        itemIds,
      };
    });

    const goods = round2(lines.reduce((sum, l) => sum + l.cost * l.qty, 0));
    // E-02 d53 — each charge labelled, because the label is what picks the
    // account. GST and QST are separate registrations and cannot share a row.
    const charges = intake.taxed
      ? [
          { id: `chg-h-${n}-a`, kind: "tax" as const, taxCode: "a", amount: round2((goods + intake.freight) * 0.05) },
          { id: `chg-h-${n}-b`, kind: "tax" as const, taxCode: "b", amount: round2((goods + intake.freight) * 0.09975) },
        ]
      : [];

    const invoice: Invoice = {
      id: invoiceId,
      supplierId: intake.supplierId,
      invoiceNumber: intake.invoiceNumber,
      intakeMode: "New",
      invoiceDate,
      receivedDate: isoOf(day),
      statedSubtotal: goods,
      freight: intake.freight,
      charges,
      status: "Finalized",
      lines,
      exchangeRate: intake.exchangeRate,
      createdBy: anyClerk(),
      createdAt: stampOf(day, 9, 40),
      finalizedAt,
      log: [
        { at: stampOf(day, 9, 40), text: `Invoice opened — New intake, invoice ${intake.invoiceNumber}` },
        { at: finalizedAt, text: `Finalized — ${lines.reduce((s, l) => s + l.qty, 0)} copies now sellable` },
      ],
    };
    invoices.push(invoice);

    // M-07 d12 / A-67 — the Invoice writes its own journal, at finalize, and
    // A-71 dates it by the finalize rather than by the supplier's paperwork.
    const jr = buildInvoiceJournal({
      location: input.storeId,
      invoice,
      writtenAt: finalizedAt,
      accounts: input.accounts,
      mappings: input.mappings,
      currency: intake.exchangeRate ? "USD" : input.homeCurrency,
      homeCurrency: input.homeCurrency,
      rate: intake.exchangeRate ?? 1,
    });
    journals.push(jr.batch);
    unresolved.push(...jr.unresolved);
  }

  // -- Settlements ----------------------------------------------------------

  for (const [n, intake] of INTAKES.entries()) {
    if (intake.paidBack === undefined) continue;
    const invoice = invoices[n];
    const day = dayBefore(anchor, intake.paidBack);
    const rate = intake.exchangeRate ?? 1;
    const owed = round2(
      (round2(invoice.lines.reduce((s, l) => s + l.cost * l.qty, 0)) +
        invoice.freight +
        invoice.charges.reduce((s, c) => s + c.amount, 0)) *
        rate,
    );
    const batch: PaymentBatch = {
      id: `batch-h-${n}`,
      supplierId: intake.supplierId,
      method: "Cheque",
      reference: `Cheque ${1400 + n}`,
      date: isoOf(day),
      recordedBy: aManager,
      createdAt: stampOf(day, 15, 20),
      targets: [{ kind: "invoice", id: invoice.id, amount: owed, settleKind: "money" }],
      credits: [],
    };
    paymentBatches.push(batch);

    const jr = buildPaymentJournal({
      location: input.storeId,
      batch,
      writtenAt: batch.createdAt,
      accounts: input.accounts,
      currency: input.homeCurrency,
      bookedRateFor: () => rate,
    });
    journals.push(jr.batch);
    unresolved.push(...jr.unresolved);
  }

  // A bill typed straight into the ledger rather than received — M-05 d12's
  // Create-new, ageing on the Supplier's own terms per d53.
  const utilityDay = dayBefore(anchor, 21);
  const payableEntries: PayableEntry[] = [
    {
      id: "pe-h-1",
      supplierId: "sup-north",
      type: "Invoice",
      reference: "Display racking — typed, not received",
      date: isoOf(utilityDay),
      subtotal: 340.0,
      tax: 50.9,
      freight: 0,
      misc: 0,
      createdBy: aManager,
      createdAt: stampOf(utilityDay, 11, 5),
      log: [{ at: stampOf(utilityDay, 11, 5), text: "Entry created — Invoice, 390.90" }],
    },
  ];

  // -- What the seed already held (see `legacy` above) -----------------------

  for (const iv of input.legacy?.invoices ?? []) {
    const supplier = SUPPLIERS.find((sup) => sup.id === iv.supplierId);
    const jr = buildInvoiceJournal({
      location: input.storeId,
      invoice: iv,
      // A-71 dates the lines by the finalize. Where a seeded Invoice never
      // recorded one, its creation is the closest honest stand-in.
      writtenAt: iv.finalizedAt ?? iv.createdAt,
      accounts: input.accounts,
      mappings: input.mappings,
      currency: supplier?.currency ?? input.homeCurrency,
      homeCurrency: input.homeCurrency,
      rate: iv.exchangeRate ?? 1,
    });
    journals.push(jr.batch);
    unresolved.push(...jr.unresolved);
  }

  for (const batch of input.legacy?.paymentBatches ?? []) {
    const jr = buildPaymentJournal({
      location: input.storeId,
      batch,
      writtenAt: batch.createdAt,
      accounts: input.accounts,
      currency: input.homeCurrency,
      bookedRateFor: (targetId) =>
        (input.legacy?.invoices ?? []).find((iv) => iv.id === targetId)?.exchangeRate ?? 1,
    });
    journals.push(jr.batch);
    unresolved.push(...jr.unresolved);
  }

  // -- The trading days -----------------------------------------------------

  const sales: Sale[] = [];
  const closeBatches: CloseBatch[] = [];
  // Nothing constrains where this starts any more: `seed.ts` no longer carries
  // a numbered Sale, so every number in the prototype is issued here, in
  // chronological order, and the inversion the hand-written Sales caused is
  // gone rather than documented.
  let saleNumber = 100150;

  const sellable = (recordId: string, onOrBefore: string) =>
    inventory.filter(
      (i) =>
        i.recordId === recordId &&
        i.status === "sellable" &&
        // The copy has to have been received already. This is the invariant
        // that keeps on-hand, cost of goods and provenance all honest.
        (invoices.find((iv) => iv.lines.some((l) => l.id === i.invoiceLineId))?.finalizedAt ?? "9999") <= onOrBefore,
    );

  const weighted: string[] = TITLES.flatMap((t) => Array<string>(t.weight).fill(t.id));

  /** M-06 d14's order, minus the Sale's own snapshot: the Customer's group, else the store's. */
  const ctxFor = (customer: Customer | undefined, businessDate: string): TaxContext => ({
    types: input.taxTypes,
    cells: input.taxGroupCells,
    groupId: customer?.taxGroupId ?? input.defaultTaxGroup,
    at: businessDate,
  });

  const lineTitle = (recordId: string) => {
    const r = allRecords.find((x) => x.id === recordId);
    return r ? `${r.artist} — ${r.title}` : recordId;
  };

  /** Take a specific copy off the floor and put it on a line. */
  const itemLine = (copy: InventoryItem, lineId: string, discountPct: number): SaleLine => {
    copy.status = "sold";
    const genreId = allRecords.find((r) => r.id === copy.recordId)?.genreId;
    return {
      id: lineId,
      kind: "item",
      recordId: copy.recordId,
      inventoryItemId: copy.id,
      title: lineTitle(copy.recordId),
      grade: copy.grade,
      qty: 1,
      price: copy.price,
      discountPct,
      productTaxCode: genreById.get(genreId ?? "")?.productTaxCode ?? "1",
    };
  };

  /**
   * Finish a Sale the way the till does: snapshot the tax at tender (A-57),
   * snapshot the group with it (M-06 d14), then tender it for exactly what it
   * came to.
   */
  const tender = (
    saleId: string,
    day: Date,
    hour: number,
    minute: number,
    lines: SaleLine[],
    customer: Customer | undefined,
  ): Sale => {
    const businessDate = isoOf(day);
    const tenderedAt = stampOf(day, hour, minute);
    const ctx = ctxFor(customer, businessDate);
    const sale: Sale = {
      id: saleId,
      state: "Closed",
      saleNumber: saleNumber++,
      customerId: customer?.id,
      taxGroupId: ctx.groupId,
      lines: lines.map((l) => ({ ...l, tax: lineTaxComponents(l, ctx) })),
      tenders: [],
      createdBy: anyClerk(),
      createdAt: stampOf(day, hour, Math.max(0, minute - 3)),
      tenderedAt,
      log: [{ at: tenderedAt, text: `Tendered — Sale number ${saleNumber - 1} assigned` }],
    };
    // M-07 d21 — WHICH configured row, not merely which behaviour: Visa,
    // Mastercard and Debit settle as separate deposits and want separate
    // accounts, which is the whole reason the field exists.
    const roll = rand();
    const row = roll < 0.28 ? "tn-cash" : roll < 0.62 ? "tn-visa" : roll < 0.82 ? "tn-debit" : "tn-mc";
    sale.tenders = [
      {
        id: `${saleId}-t`,
        type: row === "tn-cash" ? "Cash" : "Credit Card",
        tenderRowId: row,
        amount: saleTotals(sale, ctx).grand,
      },
    ];
    sales.push(sale);
    return sale;
  };

  /**
   * M-03 — the close is a state transition, and M-07 d7 has it write a journal
   * batch beside the summary. Built by the same function the till calls, so a
   * seeded day and a clicked one cannot disagree.
   */
  const closeTheDay = (day: Date, daySaleIds: string[]) => {
    if (daySaleIds.length === 0) return;
    const businessDate = isoOf(day);
    const batchId = `batch-close-${businessDate}`;
    const closedAt = stampOf(day, 19, 30);
    // M-03 d13 / A-83 — the summary is stored ON the batch, and it is what a
    // date-range report (d27) sums. Computed by the same function the till
    // calls, so a seeded day and a clicked one cannot disagree — and stored
    // here rather than left off, because a seeded month whose batches carry no
    // summary would make the range report demonstrate nothing but A-83's
    // short-batch count.
    //
    // The day's sales are built already `Closed` (they are history), so the
    // breakdown is taken over a view of them as they stood AT the close, which
    // is the only moment a close ever computes.
    const daySales = sales
      .filter((x) => daySaleIds.includes(x.id))
      .map((x) => ({ ...x, state: "Current" as const }));
    const summary = computeDayBreakdown(daySales, allRecords, ctxFor(undefined, businessDate), inventory, GENRES, input.sections, {
      customers: allCustomers,
      tenderRows: input.tenders,
      accounts: input.accounts,
      mappings: input.mappings,
      createdAt: closedAt,
    });
    closeBatches.push({
      id: batchId,
      at: closedAt,
      by: aManager,
      saleIds: daySaleIds,
      summary: summary as unknown as CloseBatch["summary"],
      summaryVersion: SUMMARY_SCHEMA_VERSION,
    });
    for (const id of daySaleIds) {
      const sale = sales.find((x) => x.id === id)!;
      sale.batchId = batchId;
      sale.log.push({ at: closedAt, text: `Closed in batch ${batchId} by ${aManager}` });
    }
    const jr = buildCloseJournal({
      location: input.storeId,
      batchId,
      writtenAt: closedAt,
      sales: sales.filter((x) => daySaleIds.includes(x.id)),
      records: allRecords,
      inventory,
      genres: GENRES,
      sections: input.sections,
      tenders: input.tenders,
      // The close reads the store's own coordinate; each Sale's lines already
      // carry the snapshot they were tendered under, and `lineTaxComponents`
      // returns that snapshot ahead of anything computed here (A-57).
      taxCtx: ctxFor(undefined, businessDate),
      accounts: input.accounts,
      mappings: input.mappings,
      currency: input.homeCurrency,
    });
    journals.push(jr.batch);
    unresolved.push(...jr.unresolved);
  };

  /** The scripted sell-outs, keyed by how many days back each copy left. */
  const scripted = new Map<number, SellOutSpec[]>();
  for (const spec of SELL_OUTS) {
    for (const back of spec.soldBacks) {
      scripted.set(back, [...(scripted.get(back) ?? []), spec]);
    }
  }

  const sellOutSale = (back: number, spec: SellOutSpec, seq: number): string | undefined => {
    const day = dayBefore(anchor, back);
    const hour = between(12, 17);
    const minute = between(0, 59);
    const copy = sellable(spec.recordId, stampOf(day, hour, minute))[0];
    // No copy means the intake meant to supply it did not, which is a defect
    // in the specs above rather than something to paper over. The test asserts
    // the band these produce, so it fails loudly rather than thinning out.
    if (!copy) return undefined;
    const customer = spec.customerId ? allCustomers.find((c) => c.id === spec.customerId) : undefined;
    const saleId = `sale-h-out-${spec.recordId}-${back}-${seq}`;
    const line = itemLine(copy, `${saleId}-l0`, customer?.globalDiscountPct ?? 0);
    return tender(saleId, day, hour, minute, [line], customer).id;
  };

  // Anything scripted BEFORE the trading window gets its own day and its own
  // close, and runs first so Sale numbers stay in chronological order.
  const deepBacks = [...scripted.keys()].filter((b) => b > days).sort((a, b) => b - a);
  for (const back of deepBacks) {
    const ids = (scripted.get(back) ?? [])
      .map((spec, i) => sellOutSale(back, spec, i))
      .filter((id): id is string => !!id);
    closeTheDay(dayBefore(anchor, back), ids);
  }

  for (let back = days; back >= 1; back--) {
    const day = dayBefore(anchor, back);
    const businessDate = isoOf(day);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = weekend ? between(8, 13) : between(4, 9);
    const daySaleIds: string[] = [];

    for (let s = 0; s < count; s++) {
      const hour = between(11, 18);
      const minute = between(0, 59);
      const tenderedAt = stampOf(day, hour, minute);
      const saleId = `sale-h-${businessDate}-${s}`;
      // Both the shop's existing Customers and the generated ones, so the
      // cards `seed.ts` already carries have a history to show — including the
      // wholesale account, whose tax group has every cell blank (M-06 d15), so
      // the month exercises an out-of-scope Sale end to end.
      const customer = rand() < 0.4 ? pick(allCustomers) : undefined;
      const lines: SaleLine[] = [];

      const lineCount = rand() < 0.65 ? 1 : between(2, 3);
      for (let l = 0; l < lineCount; l++) {
        // Roughly one line in twelve is something with no stock behind it.
        if (rand() < 0.08) {
          const nt = pick(NON_TRACKED.filter((x) => x.price > 0));
          lines.push({
            id: `${saleId}-l${l}`,
            kind: "nontracked",
            title: `${nt.label} (${nt.code})`,
            qty: 1,
            price: nt.price,
            discountPct: 0,
            productTaxCode: genreById.get(nt.genreId)?.productTaxCode ?? "1",
            genreId: nt.genreId,
            note: "Non-tracked — no stock count",
          });
          continue;
        }
        // Try a few titles before giving up. Without this, a sold-out title
        // silently shortens the Sale — and since the shop sells its most
        // popular titles out first, the back half of the month quietly thins
        // out instead of the browsing customer simply buying something else.
        let copy: InventoryItem | undefined;
        for (let attempt = 0; attempt < 6 && !copy; attempt++) {
          copy = sellable(pick(weighted), tenderedAt)[0];
        }
        if (!copy) continue;
        lines.push(itemLine(copy, `${saleId}-l${l}`, customer?.globalDiscountPct ?? 0));
      }

      if (lines.length === 0) continue;
      daySaleIds.push(tender(saleId, day, hour, minute, lines, customer).id);
    }

    // The scripted sell-outs for this day join the day's own trade and are
    // closed with it — they are ordinary Sales, not a parallel mechanism.
    for (const [i, spec] of (scripted.get(back) ?? []).entries()) {
      const id = sellOutSale(back, spec, i);
      if (id) daySaleIds.push(id);
    }

    closeTheDay(day, daySaleIds);
  }

  return {
    records: HISTORY_RECORDS,
    customers: HISTORY_CUSTOMERS,
    suppliers: HISTORY_SUPPLIERS,
    inventory,
    invoices,
    sales,
    closeBatches,
    paymentBatches,
    payableEntries,
    journals,
    nextSaleNumber: saleNumber,
    nextInternalBarcode: barcode,
    unresolved: [...new Set(unresolved)],
  };
}
