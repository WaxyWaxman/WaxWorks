import type {
  CurrencyRow,
  Customer,
  Genre,
  GenreMapRow,
  GiftCard,
  InventoryItem,
  NonTrackedItem,
  Organization,
  PendingOrderLine,
  ProductTaxCode,
  RecordEntry,
  ReleaseCacheEntry,
  SectionRow,
  Store,
  StoreDetails,
  StoreSettings,
  Supplier,
  Sysadmin,
  TaxGroup,
  TaxGroupCell,
  TaxLine,
  TaxType,
  TenderRow,
  Terminal,
  User,
} from "./types";

// ---- Tax table (M-06) ----
export const TAX_LINES: TaxLine[] = [
  { id: "tx-std", name: "Standard (QC 14.975%)", rate: 0.14975 },
  { id: "tx-gst", name: "GST only (5%)", rate: 0.05 },
  { id: "tx-exempt", name: "Exempt (0%)", rate: 0 },
];
export const DEFAULT_TAX_LINE = "tx-std";

// ---- Suppliers (M-01) ----
export const SUPPLIERS: Supplier[] = [
  {
    id: "sup-fab",
    shortName: "FAB1",
    name: "F.A.B. Distribution",
    accountNumber: "WW-4471",
    orderVia: "Rep",
    minOrderQty: 25,
    minOrderAmount: 0,
    minOrderAmountBasis: "Net",
    discountPct: 60,
    cancelByDays: 45,
    currency: "CAD",
    paymentTerms: "Net 30",
    defaultPaymentMethod: "EFT",
    type: "New",
    notes: "Rep visits monthly, will hold new releases on request.",
    email: "claims@fabdist.example",
    backordersAllowed: true,
    repName: "Dana Cho",
    repPhone: "514-555-0142",
    mainPhone: "514-555-0100",
    // The reason M-01 d13 splits the two: cheques go to a Toronto lockbox,
    // cartons come from the Montreal warehouse.
    billing: { line1: "PO Box 4471, Station A", city: "Toronto", provinceState: "ON", country: "Canada" },
    shipping: { line1: "2250 Rue Guy", line2: "Unit 400", city: "Montréal", provinceState: "QC", country: "Canada" },
    shipSameAsBilling: false,
    log: [{ at: "2026-01-06 09:00:00", text: "Discount set to 60% by RD" }],
  },
  {
    id: "sup-indie",
    shortName: "INDI",
    name: "Indie Direct Supply",
    accountNumber: "9927-A",
    orderVia: "Their Website",
    minOrderQty: 0,
    minOrderAmount: 250,
    minOrderAmountBasis: "Retail",
    discountPct: 50,
    currency: "USD",
    paymentTerms: "Net 60",
    defaultPaymentMethod: "Credit Card",
    type: "New",
    email: "returns@indiedirect.example",
    backordersAllowed: false,
    mainPhone: "212-555-0199",
    billing: { line1: "118 W 22nd St", city: "New York", provinceState: "NY", country: "United States" },
    shipSameAsBilling: true,
    log: [{ at: "2026-01-06 09:00:00", text: "Discount set to 50% by RD" }],
  },
  {
    id: "sup-crate",
    shortName: "CRAT",
    name: "Crate Digger Wholesale",
    accountNumber: "CD-118",
    orderVia: "Email",
    minOrderQty: 10,
    minOrderAmount: 0,
    minOrderAmountBasis: "Net",
    discountPct: 40,
    cancelByDays: 30,
    currency: "CAD",
    paymentTerms: "Prepaid",
    defaultPaymentMethod: "e-Transfer",
    type: "New",
    notes: "Email-only ordering — no rep, no phone line.",
    email: "orders@cratedigger.example",
    backordersAllowed: true,
    mainPhone: "438-555-0177",
    billing: { line1: "77 Avenue Mozart Est", city: "Montréal", provinceState: "QC", country: "Canada" },
    shipSameAsBilling: true,
    log: [{ at: "2026-01-06 09:00:00", text: "Discount set to 40% by RD" }],
  },
  // A real Supplier record, not a special case — second-hand walk-ins just
  // suggest this one first (E-02 decision 27). discountPct is unused for
  // it: second-hand copies are priced per copy, never off a supplier
  // discount.
  {
    id: "sup-walkin",
    shortName: "WALK",
    name: "Walk-in / trade-in",
    orderVia: "Phone",
    minOrderQty: 0,
    minOrderAmount: 0,
    minOrderAmountBasis: "Net",
    discountPct: 0,
    currency: "CAD",
    paymentTerms: "Prepaid",
    defaultPaymentMethod: "e-Transfer",
    type: "Used",
    email: "-",
    backordersAllowed: false,
    defaultForSecondHand: true,
    shipSameAsBilling: true,
    log: [{ at: "2026-01-06 09:00:00", text: "Marked default for second-hand by RD" }],
  },
];

// ---- Pending orders (M-02) — Phase 1 raising isn't built yet (no titlecard
// "Order" button in this pass), so these are seeded as if raised already.
// poNumber + placedAt unset means still pending, i.e. Order Processing's
// job; set means already placed, which is also what backs Receiving's
// Orders lookup. No reorder suggestions, no backorder lifecycle (Phase 3). ----
export const PENDING_ORDERS: PendingOrderLine[] = [
  // sup-fab — one already-placed PO (PO-1042, two lines) plus one pending line.
  // A 5-day follow-up flag set when placed (09/02) is overdue by today's demo
  // date; the other line's 14-day flag hasn't come due yet — What's on Order
  // (Phase 3) shows one red, one not.
  { id: "po-line-1", supplierId: "sup-fab", poNumber: "PO-1042", placedAt: "2026-09-02 11:00:00", recordId: "r-kind", scannedCode: "888751545519", qty: 2, sellPrice: 24.0, expectedListPrice: 22.0, expectedDiscountPct: 15, followUpDays: 5, followUpSetAt: "2026-09-02 11:00:00", createdAt: "2026-09-02 10:15:00" },
  { id: "po-line-2", supplierId: "sup-fab", poNumber: "PO-1042", placedAt: "2026-09-02 11:00:00", recordId: "r-purple", scannedCode: "075992511018", qty: 3, sellPrice: 32.99, expectedListPrice: 24.0, expectedDiscountPct: 10, followUpDays: 14, followUpSetAt: "2026-09-02 11:00:00", createdAt: "2026-09-02 10:15:00" },
  { id: "po-line-3", supplierId: "sup-fab", recordId: "r-blue", scannedCode: "081227971609", qty: 2, sellPrice: 28.99, expectedListPrice: 27.99, expectedDiscountPct: 10, createdAt: "2026-09-05 14:30:00" },

  // sup-indie — one already-placed PO (PO-77, customer-attached, overdue
  // 3-day flag — Theo is waiting) plus one pending line
  { id: "po-line-4", supplierId: "sup-indie", poNumber: "PO-77", placedAt: "2026-09-06 09:30:00", recordId: "r-horses", scannedCode: "060758004321", qty: 1, sellPrice: 24.99, expectedListPrice: 20.0, expectedDiscountPct: 0, customerId: "c-theo", followUpDays: 3, followUpSetAt: "2026-09-06 09:30:00", createdAt: "2026-09-06 09:00:00" },
  { id: "po-line-5", supplierId: "sup-indie", recordId: "r-purple", qty: 1, sellPrice: 32.99, createdAt: "2026-09-08 16:00:00" },

  // sup-crate (Email order-via) — two pending lines on the regular stream, one customer-attached, plus a "R" (rush) stream that alone already meets the 10-unit minimum
  { id: "po-line-6", supplierId: "sup-crate", recordId: "r-illmatic", qty: 4, sellPrice: 45.0, createdAt: "2026-09-07 10:00:00" },
  { id: "po-line-7", supplierId: "sup-crate", recordId: "r-ok", qty: 2, sellPrice: 36.99, customerId: "c-ramona", createdAt: "2026-09-08 09:00:00" },
  { id: "po-line-8", supplierId: "sup-crate", separator: "R", recordId: "r-tote", qty: 10, sellPrice: 18.0, createdAt: "2026-09-09 08:00:00" },
];

// ---- Records ----
export const RECORDS: RecordEntry[] = [
  {
    id: "r-blue",
    artist: "Joni Mitchell",
    title: "Blue",
    label: "Reprise",
    catalogNo: "MS 2038",
    format: "LP, Album",
    year: 1971,
    country: "US",
    genreId: "gn-folk-rock",
    // A-61 — the tags this Record was adopted under, the one the MAP
    // matched marked. A snapshot, never re-resolved.
    providerTags: [
      { tag: "Folk", votes: 71, matched: true },
      { tag: "Singer-Songwriter", votes: 34 },
    ],
    art: "🔵",
    manufacturerUpc: "081227971609",
    discogsId: "155632",
    minOnHand: 1,
  },
  {
    id: "r-rumours",
    artist: "Fleetwood Mac",
    title: "Rumours",
    label: "Warner Bros.",
    catalogNo: "BSK 3010",
    format: "LP, Album, RE",
    year: 1977,
    country: "US",
    genreId: "gn-pop-rock",
    art: "🌗",
    manufacturerUpc: "075992751612",
    discogsId: "13756011",
    stickyPrice: 34.99,
    minOnHand: 2,
  },
  {
    id: "r-kind",
    artist: "Miles Davis",
    title: "Kind of Blue",
    label: "Columbia",
    catalogNo: "CL 1355",
    format: "LP, Album, Mono",
    year: 1959,
    country: "US",
    genreId: "gn-modal-jazz",
    // A-61 — the tags this Record was adopted under, the one the MAP
    // matched marked. A snapshot, never re-resolved.
    providerTags: [
      { tag: "Jazz", votes: 96, matched: true },
      { tag: "Modal Jazz", votes: 41 },
      { tag: "Hard Bop", votes: 22 },
    ],
    art: "🎺",
    manufacturerUpc: "888751545519",
    discogsId: "281822",
    minOnHand: 1,
  },
  {
    id: "r-purple",
    artist: "Prince",
    title: "Purple Rain",
    label: "Warner Bros.",
    catalogNo: "25110-1",
    format: "LP, Album",
    year: 1984,
    country: "US",
    genreId: "gn-funk-pop",
    art: "🟣",
    manufacturerUpc: "075992511018",
    discogsId: "384169",
    stickyPrice: 32.99,
    minOnHand: 2,
  },
  {
    id: "r-illmatic",
    artist: "Nas",
    title: "Illmatic",
    label: "Columbia",
    catalogNo: "C 57684",
    format: "LP, Album",
    year: 1994,
    country: "US",
    genreId: "gn-hip-hop",
    // A-61 — the tags this Record was adopted under, the one the MAP
    // matched marked. A snapshot, never re-resolved.
    providerTags: [
      { tag: "Hip Hop", votes: 88, matched: true },
      { tag: "Boom Bap", votes: 29 },
    ],
    art: "🏙️",
    manufacturerUpc: "889854250515",
    discogsId: "63643",
    minOnHand: 1,
  },
  {
    id: "r-tote",
    artist: "Wax Works",
    title: "Shop Tote Bag",
    label: "—",
    catalogNo: "MERCH-TOTE",
    format: "Canvas",
    year: 2026,
    country: "CA",
    genreId: "gn-merch",
    art: "👜",
    manufacturerUpc: "200000000017",
    minOnHand: 5,
  },
  // Stocked before, none on hand right now — E-03 lists "titles we've held
  // before" as in scope for search, and the stock states in lib/stockState
  // need a Record in that condition to be reviewable at all. Both have a
  // completed Sale behind them (see AppStore's seeded sales) and no copies.
  {
    id: "r-madvillainy",
    artist: "Madvillain",
    title: "Madvillainy",
    label: "Stones Throw",
    catalogNo: "STH2065",
    format: "LP, Album",
    year: 2004,
    country: "US",
    genreId: "gn-hip-hop",
    // A-61 — the tags this Record was adopted under, the one the MAP
    // matched marked. A snapshot, never re-resolved.
    providerTags: [
      { tag: "Hip Hop", votes: 64, matched: true },
      { tag: "Boom Bap", votes: 18 },
    ],
    art: "🎭",
    manufacturerUpc: "659457206512",
    discogsId: "213144",
    stickyPrice: 32.99,
    minOnHand: 2,
    preferredSupplierId: "sup-fab",
  },
  {
    id: "r-astral",
    artist: "Van Morrison",
    title: "Astral Weeks",
    label: "Warner Bros.",
    catalogNo: "WS 1768",
    format: "LP, Album",
    year: 1968,
    country: "US",
    genreId: "gn-folk-rock",
    art: "🌌",
    manufacturerUpc: "075992745215",
    discogsId: "1425988",
    stickyPrice: 27.5,
    minOnHand: 0,
  },

  // Catalog-only (a catalog match we do not hold) — E-03 decision 5
];

// ---- Inventory items (physical copies) ----
export const INVENTORY: InventoryItem[] = [
  // Blue — one new-ish copy + two used at different grades (UPC picker case)
  { id: "i-blue-1", recordId: "r-blue", grade: "NM", price: 28.99, cost: 12.4, internalBarcode: "200000001236", status: "sellable", invoiceLineId: "invline-seed-1" },
  { id: "i-blue-2", recordId: "r-blue", grade: "VG+", price: 21.5, cost: 6.0, internalBarcode: "200000001243", status: "sellable" },
  { id: "i-blue-3", recordId: "r-blue", grade: "VG", price: 16.99, cost: 4.0, internalBarcode: "200000001250", status: "sellable", conditionNote: "Light seam wear, plays clean" },

  // Rumours — New stock, sticky price; 3 sealed copies share condition/price
  { id: "i-rum-1", recordId: "r-rumours", grade: "M", price: 34.99, cost: 18.75, internalBarcode: "200000002234", status: "sellable", invoiceLineId: "invline-seed-2" },
  { id: "i-rum-2", recordId: "r-rumours", grade: "M", price: 34.99, cost: 18.75, internalBarcode: "200000002241", status: "sellable", invoiceLineId: "invline-seed-2" },
  { id: "i-rum-3", recordId: "r-rumours", grade: "M", price: 34.99, cost: 18.75, internalBarcode: "200000002258", status: "held", heldByCustomerId: "c-ramona", invoiceLineId: "invline-seed-2" },

  // Kind of Blue — single used copy (resolves with no picker)
  { id: "i-kob-1", recordId: "r-kind", grade: "VG+", price: 24.0, cost: 9.5, internalBarcode: "200000003231", status: "sellable" },

  // Purple Rain — New stock, 1 on hand, below min
  { id: "i-pr-1", recordId: "r-purple", grade: "M", price: 32.99, cost: 17.25, internalBarcode: "200000004238", status: "sellable", invoiceLineId: "invline-seed-4" },

  // Illmatic — used, backroom
  { id: "i-ill-1", recordId: "r-illmatic", grade: "VG", price: 45.0, cost: 20.0, internalBarcode: "200000005235", status: "sellable", backroom: true, conditionNote: "Backroom — sought after, keep behind counter" },

  // Tote bag — new merch
  { id: "i-tote-1", recordId: "r-tote", grade: "M", price: 18.0, cost: 6.5, internalBarcode: "200000006232", status: "sellable" },
  { id: "i-tote-2", recordId: "r-tote", grade: "M", price: 18.0, cost: 6.5, internalBarcode: "200000006249", status: "sellable" },
];

// ---- Non-tracked catalog items (E-05) ----
// d18 — the gift card load's catalog entry is SYSTEM-OWNED: its genre and
// code are not editable and it is not deletable. Named here so the seed and
// the money path cannot disagree about which genre a load resolves through.
// A-6 — the provider cache. Seeded to carry the four cases d53 and A-61
// describe, because a map nobody can watch resolve is furniture:
//
//   rc-satchidananda  every tag mapped   -> auto-fills, no prompt
//   rc-loveless       rock + shoegaze    -> PRIORITY beats the heavier vote
//   rc-neu            one unmapped tag   -> prompts, and CAN offer a map row
//   rc-shaggs         no tags at all     -> prompts, and CANNOT offer one
export const RELEASE_CACHE: ReleaseCacheEntry[] = [
  // Moved out of RECORDS: these were `catalogOnly` Records, which was one
  // type standing in for two things. A provider match is not a Record — it
  // has no genre, no Section and no stock, and there is nothing for those to
  // sit on until adoption (E-03 d18, architecture A-6).
  {
    id: "rc-horses",
    artist: "Patti Smith",
    title: "Horses",
    label: "Arista",
    catalogNo: "AL 4066",
    format: "LP, Album",
    year: 1975,
    country: "US",
    art: "🐎",
    manufacturerUpc: "060758004321",
    tags: [
      { tag: "Art Punk", votes: 52 },
    ],
  },
  {
    id: "rc-ok",
    artist: "Radiohead",
    title: "OK Computer",
    label: "Parlophone",
    catalogNo: "NODATA 01",
    format: "LP, Album",
    year: 1997,
    country: "UK",
    art: "💻",
    // No tags: the provider carries no genre for this pressing.
  },
  {
    id: "rc-satchidananda",
    artist: "Alice Coltrane",
    title: "Journey in Satchidananda",
    label: "Impulse!",
    catalogNo: "AS-9203",
    format: "LP, Album",
    year: 1971,
    country: "US",
    art: "🎷",
    musicbrainzId: "mb-0001",
    tags: [
      { tag: "Jazz", votes: 62 },
      { tag: "Modal Jazz", votes: 18 },
    ],
  },
  {
    id: "rc-loveless",
    artist: "My Bloody Valentine",
    title: "Loveless",
    label: "Creation",
    catalogNo: "CRELP 060",
    format: "LP, Album",
    year: 1991,
    country: "UK",
    art: "🌊",
    musicbrainzId: "mb-0002",
    // The worked case for A-61: `rock` is mapped and heavily voted,
    // `shoegaze` is mapped and barely voted. Votes alone file this under
    // Alt Rock; the priority on `shoegaze` is how a shop says otherwise.
    tags: [
      { tag: "Rock", votes: 140 },
      { tag: "Shoegaze", votes: 11 },
    ],
  },
  {
    id: "rc-neu",
    artist: "Neu!",
    title: "Neu! 75",
    label: "Brain",
    catalogNo: "1060 063",
    format: "LP, Album",
    year: 1975,
    country: "DE",
    art: "🛤",
    musicbrainzId: "mb-0003",
    tags: [{ tag: "Krautrock", votes: 44 }],
  },
  {
    id: "rc-shaggs",
    artist: "The Shaggs",
    title: "Philosophy of the World",
    label: "Third World",
    catalogNo: "TW-LP-001",
    format: "LP, Album",
    year: 1969,
    country: "US",
    art: "🎸",
    musicbrainzId: "mb-0004",
    // No tags at all. MusicBrainz genre tags are user-submitted and often
    // absent on obscure pressings, which is precisely a record shop's stock
    // (architecture §10 carries that coverage risk).
  },
];

// M-06 d6, d32 / A-53 — the starter genre map, shipped in the seed because
// A-53 lands `genre_map` with the migration. Without it a shop's first receive
// is hundreds of prompts rather than a handful, which is the whole reason the
// cost curve d53 assumes actually decays.
//
// Provider tag -> shop genre, and nothing else. Shop-internal genres carry NO
// rows (d17): nothing MusicBrainz returns should ever map onto `Gift cards`.
//
// Priority is manager-only (A-59) and defaults to 0, which means "fall back to
// the provider's vote order". `shoegaze` carries one deliberately, as the
// worked case: a release tagged both `rock` (heavily voted, mapped to Alt
// Rock) and `shoegaze` (barely voted) lands in Alt Rock on votes alone, and
// priority is how a shop that shelves shoegaze separately says otherwise.
export const GENRE_MAP: GenreMapRow[] = [
  { tag: "rock", genreId: "gn-alt-rock", priority: 0 },
  { tag: "alternative rock", genreId: "gn-alt-rock", priority: 0 },
  { tag: "art punk", genreId: "gn-art-punk", priority: 0 },
  { tag: "post-punk", genreId: "gn-art-punk", priority: 0 },
  { tag: "folk rock", genreId: "gn-folk-rock", priority: 0 },
  { tag: "folk", genreId: "gn-folk-rock", priority: 0 },
  { tag: "funk", genreId: "gn-funk-pop", priority: 0 },
  { tag: "pop", genreId: "gn-funk-pop", priority: 0 },
  { tag: "hip hop", genreId: "gn-hip-hop", priority: 0 },
  { tag: "jazz", genreId: "gn-modal-jazz", priority: 0 },
  { tag: "modal jazz", genreId: "gn-modal-jazz", priority: 0 },
  { tag: "pop rock", genreId: "gn-pop-rock", priority: 0 },
  { tag: "shoegaze", genreId: "gn-art-punk", priority: 10 },
];

export const GIFT_CARD_GENRE_ID = "gn-gift-card";

export const NON_TRACKED: NonTrackedItem[] = [
  // d17 — each carries a genre, and its Section follows from that genre's
  // required parent (d32). Freight and services roll up into FREIGHT, which
  // d20 makes a REVENUE Section; only gift cards are a liability.
  { code: "FREIGHT", label: "Shipping / freight", price: 0, genreId: "gn-freight" },
  { code: "STICKER", label: "Wax Works sticker", price: 2, genreId: "gn-merch" },
  { code: "SERVICE-CLEAN", label: "Record cleaning (per disc)", price: 5, genreId: "gn-services" },
];

// ---- Gift cards ----
export const GIFT_CARDS: GiftCard[] = [
  { code: "GC-4417", balance: 25, customerId: "c-ramona" },
  { code: "GC-8890", balance: 0 }, // not yet loaded
];

// ---- Customers (E-07) ----
export const CUSTOMERS: Customer[] = [
  {
    id: "c-ramona",
    primaryId: 1,
    accountNumber: "A-1042",
    accountType: "Regular",
    name: "Ramona Vasquez",
    phone: "514-555-0142",
    email: "ramona.v@example.com",
    contactPreference: "Email",
    address: { line1: "128 Rue Saint-Denis", city: "Montreal", provinceState: "QC", country: "Canada" },
    globalDiscountPct: 10,
    balance: 25,
    note: "Collector — jazz and folk. Holds are common.",
  },
  {
    id: "c-lp",
    primaryId: 2,
    accountNumber: "A-2008",
    accountType: "Business",
    name: "Left Bank Cafe (wholesale)",
    phone: "514-555-0199",
    email: "orders@leftbank.example",
    contactPreference: "Email",
    address: { line1: "44 Avenue du Parc", city: "Montreal", provinceState: "QC", country: "Canada" },
    globalDiscountPct: 0,
    // A wholesale account: its group has every cell blank, so nothing it
    // buys is in scope (d15 — blank is out of scope, not zero-rated).
    taxGroupId: "tg-whl",
    balance: -120.5,
    note: "Wholesale — exempt tax line. Settles on account, not at till.",
  },
  {
    id: "c-theo",
    primaryId: 3,
    accountNumber: "A-3311",
    accountType: "Staff",
    name: "Theo Nakamura",
    phone: "438-555-0170",
    email: "theo@waxworks.example",
    contactPreference: "Phone",
    globalDiscountPct: 20,
    balance: 0,
  },
];

// ---- The Organization, its Stores, its terminals (A-86, A-87) ----
// One Organization. v1 deploys one Store; a second is seeded so the store
// picker, multi-store assignment, per-Store initials and PINs, and the
// Organization screen can be exercised in review (O-01, S-01). It has default
// settings and no trading history.
export const HOME_ORG_ID = "org-waxworks";
export const HOME_STORE_ID = "0041982"; // M-06 d47 — the same value STORE_DETAILS carries
export const PLATEAU_STORE_ID = "0041983";

export const ORGANIZATIONS: Organization[] = [
  {
    id: HOME_ORG_ID,
    name: "Wax Works",
    active: true,
    log: [{ at: "2025-11-03T09:00:00", text: "Created by WaxWorks Support — first Owner A. Beaulieu invited" }],
  },
];

export const STORES: Store[] = [
  {
    id: HOME_STORE_ID,
    orgId: HOME_ORG_ID,
    position: 1,
    accountEmail: "till@waxworks.example",
    // Plain text in the mock (E-01 d24; A-87 puts it in Supabase Auth).
    accountPassword: "waxworks-till",
    active: true,
    log: [{ at: "2025-11-03T09:05:00", text: 'Created as "Wax Works" by A. Beaulieu (Owner) — Store ID 0041982, position 1' }],
  },
  {
    id: PLATEAU_STORE_ID,
    orgId: HOME_ORG_ID,
    position: 2,
    accountEmail: "plateau@waxworks.example",
    accountPassword: "waxworks-plateau",
    active: true,
    log: [{ at: "2026-08-01T09:00:00", text: 'Created as "Wax Works — Plateau" by A. Beaulieu (Owner) — Store ID 0041983, position 2' }],
  },
];

export const TERMINALS: Terminal[] = [
  { id: "till-1", name: "Till 1", storeId: HOME_STORE_ID },
  { id: "till-2", name: "Till 2", storeId: HOME_STORE_ID },
  { id: "plateau-till-1", name: "Till 1", storeId: PLATEAU_STORE_ID },
];

// S-01. Outside every Organization; reaches identity data only (d1).
export const SYSADMINS: Sysadmin[] = [
  { id: "sa-1", name: "WaxWorks Support", email: "support@waxworks.app", log: [] },
];

// M-04. Initials are stored trimmed and upper-cased (d20) and are unique among
// ACTIVE users ASSIGNED TO A STORE (d13 as amended by d16 and d27) - T. Okonkwo
// below holds TO because the departed T. Oyelaran released it, which is exactly
// the case d16 accepts and why every audit surface shows a name rather than
// stopping at the letters.
//
// PINs (d28) and personal passwords (E-01 d27) are plain text here; the real
// thing hashes one (A-89) and never sees the other (A-91). Every credential in
// this file is a review convenience and is shown on the sign-in screen.
export const USERS: User[] = [
  {
    id: "user-eo",
    orgId: HOME_ORG_ID,
    name: "E. Okafor",
    initials: "EO",
    role: "Employee",
    active: true,
    assignments: [HOME_STORE_ID],
    log: [{ at: "2026-01-12T09:00:00", text: "Added as Employee by R. Delacroix" }],
  },
  {
    id: "user-rd",
    orgId: HOME_ORG_ID,
    name: "R. Delacroix",
    initials: "RD",
    role: "Manager",
    active: true,
    // Covers both Stores (d27) — the case per-Store uniqueness exists for.
    assignments: [HOME_STORE_ID, PLATEAU_STORE_ID],
    email: "rd@waxworks.example",
    pin: "1234",
    password: "waxworks-rd",
    log: [
      { at: "2025-11-03T09:00:00", text: "Added as Manager by seed migration" },
      { at: "2025-11-03T09:00:00", text: "Invite sent to rd@waxworks.example" },
      { at: "2025-11-03T09:00:00", text: "PIN set by A. Beaulieu (Owner)" },
      { at: "2026-08-01T09:10:00", text: "Assigned to Store 0041983 by A. Beaulieu (Owner)" },
    ],
  },
  {
    id: "user-jm",
    orgId: HOME_ORG_ID,
    name: "J. Mbeki",
    initials: "JM",
    role: "Manager",
    active: true,
    assignments: [HOME_STORE_ID],
    email: "jm@waxworks.example",
    pin: "2345",
    password: "waxworks-jm",
    log: [
      { at: "2026-02-02T10:15:00", text: "Added as Employee by R. Delacroix" },
      { at: "2026-06-18T16:40:00", text: "Role: Employee -> Manager (by A. Beaulieu (Owner))" },
      { at: "2026-06-18T16:41:00", text: "PIN set by A. Beaulieu (Owner)" },
    ],
  },
  {
    // Kept deliberately: a Manager reachable with ONE keystroke of initials and
    // a PIN of four of the same digit, so the manager-only space is always
    // openable in review without hunting for a credential.
    id: "user-y",
    orgId: HOME_ORG_ID,
    name: "Y. Nakamura",
    initials: "Y",
    role: "Manager",
    active: true,
    assignments: [HOME_STORE_ID],
    email: "y@waxworks.example",
    pin: "1111",
    password: "waxworks-y",
    log: [{ at: "2025-11-03T09:00:00", text: "Added as Manager by seed migration" }],
  },
  {
    // The Owner (M-04 d25). Assigned to both Stores so their initials and PIN
    // work at either counter; on a personal session they may pick any Store
    // regardless (E-01 d27).
    id: "user-ab",
    orgId: HOME_ORG_ID,
    name: "A. Beaulieu",
    initials: "AB",
    role: "Owner",
    active: true,
    assignments: [HOME_STORE_ID, PLATEAU_STORE_ID],
    email: "owner@waxworks.example",
    pin: "9999",
    password: "waxworks-owner",
    log: [
      { at: "2025-11-03T09:00:00", text: "Added as Owner by WaxWorks Support (System Administrator)" },
      { at: "2025-11-03T09:00:00", text: "Invite sent to owner@waxworks.example" },
      { at: "2025-11-03T09:30:00", text: "Password set by the user" },
    ],
  },
  {
    id: "user-to-old",
    orgId: HOME_ORG_ID,
    name: "T. Oyelaran",
    initials: "TO",
    role: "Employee",
    active: false,
    assignments: [HOME_STORE_ID],
    log: [
      { at: "2025-09-01T09:00:00", text: "Added as Employee by R. Delacroix" },
      { at: "2026-04-30T17:05:00", text: "Deactivated by R. Delacroix - initials TO released" },
    ],
  },
  {
    id: "user-to-new",
    orgId: HOME_ORG_ID,
    name: "T. Okonkwo",
    initials: "TO",
    role: "Employee",
    active: true,
    assignments: [HOME_STORE_ID],
    log: [{ at: "2026-05-11T09:30:00", text: "Added as Employee by J. Mbeki - initials TO, released by T. Oyelaran" }],
  },
  {
    // Plateau's own Employee — shares E. Okafor's initials at a Store E. Okafor
    // is not assigned to, which E-01 d25 permits and which is why initials
    // resolve per Store.
    id: "user-eo-plateau",
    orgId: HOME_ORG_ID,
    name: "E. Ouellet",
    initials: "EO",
    role: "Employee",
    active: true,
    assignments: [PLATEAU_STORE_ID],
    log: [{ at: "2026-08-02T09:00:00", text: "Added as Employee by R. Delacroix (Manager)" }],
  },
];

// Kept as strings because 68 call sites across seven files read them, and
// E-01's session (below, in the store) is what actually decides who is acting.
// Derived rather than typed out so they cannot drift from USERS.
const seedActor = USERS.find((u) => u.id === "user-eo")!;
const seedManager = USERS.find((u) => u.id === "user-rd")!;
export const CURRENT_USER = `${seedActor.name} (${seedActor.role})`;
export const MANAGER_NAME = `${seedManager.name} (${seedManager.role})`;

// ---- M-06 settings ----
// Pre-loaded rather than empty, because §7's seed.sql carries the
// configuration rows and A-53 lands the tables in M1/M2 — a shop never starts
// with no Sections and no tenders.

export const SECTIONS: SectionRow[] = [
  { code: "VI", name: "VINYL", countsAsRevenue: true, tracksStockDefault: true, discountable: true, returnable: true, active: true },
  { code: "ME", name: "MERCH", countsAsRevenue: true, tracksStockDefault: true, discountable: true, returnable: true, active: true },
  // d20 — one Section each for freight and gift cards, split because one is
  // revenue and the other a liability. d30 makes the gift card Section
  // discountable:false and returnable:false — a load discounted 10% is a
  // straight loss, and one returned is a cash-out dressed as a refund.
  { code: "FR", name: "FREIGHT", countsAsRevenue: true, tracksStockDefault: false, discountable: true, returnable: false, active: true, systemOwned: true },
  { code: "GC", name: "GIFT CARDS", countsAsRevenue: false, tracksStockDefault: false, discountable: false, returnable: false, active: true, systemOwned: true },
];

export const TENDERS: TenderRow[] = [
  { id: "tn-cash", name: "Cash", behavior: "Cash", active: true },
  // d22 — many tenders, one behaviour. Both of these settle as a card.
  { id: "tn-visa", name: "Visa", behavior: "Credit Card", active: true },
  { id: "tn-mc", name: "Mastercard", behavior: "Credit Card", active: true },
  { id: "tn-debit", name: "Debit", behavior: "Credit Card", active: true },
  { id: "tn-acct", name: "On account", behavior: "Account Balance", active: true },
  { id: "tn-gift", name: "Gift card", behavior: "Gift Card", active: true },
  { id: "tn-payout", name: "Pay-out", behavior: "Pay-out", active: true },
  { id: "tn-used", name: "Used credit", behavior: "Used Credit", active: true },
  // d26 — cash rounding is its own tender, written by the system and never
  // offered at the till, so it is shown here and cannot be edited away.
  { id: "tn-round", name: "Cash rounding", behavior: "Cash", active: true, systemOwned: true },
];

export const CURRENCIES: CurrencyRow[] = [
  { code: "CAD", name: "Canadian dollar", rate: 1, rateSetOn: "2026-01-01", active: true },
  // d38 — a PLANNING rate the shop sets conservatively; there is no separate
  // buffer. d33 — it carries the date it was last set, and the screen shows it.
  { code: "USD", name: "US dollar", rate: 1.42, rateSetOn: "2026-08-02", active: true },
];

export const HOME_CURRENCY = "CAD"; // d34 — set once, everything denominated against it

export const STORE_SETTINGS: StoreSettings = {
  sessionLapseSeconds: 300,
  priceEndingMinor: 99,
  deadStockDays: 180,
  streamAgingDays: 14,
  drawerPolicy: "cash",
  receiptWidth: "80mm",
};

export const STORE_DETAILS: StoreDetails = {
  legalName: "9302145 Canada Inc.",
  tradingName: "Wax Works",
  address: { line1: "4271 Rue Saint-Denis", city: "Montreal", provinceState: "QC", country: "Canada" },
  phone: "514-555-0100",
  email: "hello@waxworks.example",
  website: "waxworks.example",
  receiptFooter: "Returns accepted any time, in any condition, with or without a receipt.",
  receiptFooterOn: true,
  storeId: "0041982",
  position: 1,
};

// ---- M-06 tax (d11-d17, d48, d52) ----
// Real GST and QST as SEPARATE types, not the blended 14.975% the flat model
// carried. The blend was the thing two tables exist to stop: it cannot be
// reported per type (M-03 d13), cannot carry a registration number per type
// (d48), and cannot be split by rate when a period spans a change (M-03 d15).

export const TAX_TYPES: TaxType[] = [
  { code: "a", name: "GST", ratePpm: 50_000, registrationNumber: "R123456789" },
  { code: "b", name: "QST", ratePpm: 99_750, registrationNumber: "1234567890TQ0001" },
  // Each HST rate is its OWN tax type, and that is the model working rather
  // than a workaround: a tax type is "one tax that exists" carrying one rate
  // (d11), and Ontario's 13% and New Brunswick's 15% are remitted separately
  // at different rates. One "HST" row could not hold both.
  { code: "f", name: "HST (ON)", ratePpm: 130_000 },
  { code: "g", name: "HST (NB/NL/PE)", ratePpm: 150_000 },
  { code: "h", name: "HST (NS)", ratePpm: 140_000 },
  { code: "c", name: "PST (BC)", ratePpm: 70_000 },
  { code: "d", name: "PST (SK)", ratePpm: 60_000 },
  { code: "e", name: "RST (MB)", ratePpm: 70_000 },
  // d15 — taxable at 0% and REPORTABLE, which a blank cell is not.
  { code: "z", name: "Zero-rated", ratePpm: 0 },
];

export const PRODUCT_TAX_CODES: ProductTaxCode[] = [
  { code: "1", description: "Standard — full tax", active: true },
  { code: "B", description: "Books and magazines — GST only", active: true },
  { code: "2", description: "Non-taxable — gift card loads", active: true },
  { code: "3", description: "Zero-rated — taxable at 0%, reportable", active: true },
];

// Every province and territory. The point of seeding all of them is that the
// two-table model is the thing being reviewed: thirteen jurisdictions sharing
// ONE GST row is exactly what d11 replaced d1 to make possible, and a single
// blended rate per jurisdiction could not do it.
//
// RATES ARE ILLUSTRATIVE AND WANT CHECKING AGAINST CURRENT LEGISLATION before
// anybody trades on them. They are seed data for a prototype, not tax advice.
export const TAX_GROUPS: TaxGroup[] = [
  { id: "tg-ab", description: "Alberta", shortName: "AB", active: true },
  { id: "tg-bc", description: "British Columbia", shortName: "BC", active: true },
  { id: "tg-mb", description: "Manitoba", shortName: "MB", active: true },
  { id: "tg-nb", description: "New Brunswick", shortName: "NB", active: true },
  { id: "tg-nl", description: "Newfoundland and Labrador", shortName: "NL", active: true },
  { id: "tg-ns", description: "Nova Scotia", shortName: "NS", active: true },
  { id: "tg-nt", description: "Northwest Territories", shortName: "NT", active: true },
  { id: "tg-nu", description: "Nunavut", shortName: "NU", active: true },
  { id: "tg-on", description: "Ontario", shortName: "ON", active: true },
  { id: "tg-pe", description: "Prince Edward Island", shortName: "PE", active: true },
  { id: "tg-qc", description: "Quebec", shortName: "QC", active: true },
  { id: "tg-sk", description: "Saskatchewan", shortName: "SK", active: true },
  { id: "tg-yt", description: "Yukon", shortName: "YT", active: true },
  { id: "tg-whl", description: "Wholesale", shortName: "WHL", active: true },
];

// d13 — stored as rows, drawn as a grid.
//
// Two things to read here. FIRST, the GST-only jurisdictions (AB, NT, NU, YT)
// and the HST ones each name a single tax, while QC, BC, SK and MB name two —
// the same grid expresses both with no special case. SECOND, Quebec is `ab`
// and NOT `ab+`: QST has been calculated on the price EXCLUDING GST since
// 2013, so it does not compound. The `+` exists for jurisdictions that do
// compound, and M-06's worked example uses it to show the fifteen cents it
// would cost if Quebec did.
const gstOnly = ["tg-ab", "tg-nt", "tg-nu", "tg-yt"];
const hst15 = ["tg-nb", "tg-nl", "tg-pe"];

export const TAX_GROUP_CELLS: TaxGroupCell[] = [
  ...gstOnly.flatMap((g) => [
    { groupId: g, productTaxCode: "1", spec: "a" },
    { groupId: g, productTaxCode: "B", spec: "a" },
    { groupId: g, productTaxCode: "2", spec: "" },
    { groupId: g, productTaxCode: "3", spec: "z" },
  ]),
  ...hst15.flatMap((g) => [
    { groupId: g, productTaxCode: "1", spec: "g" },
    // Books carry a point-of-sale rebate of the provincial portion in the HST
    // provinces, so they land at the federal 5%. Modelled as GST here, which
    // is the right ANSWER by a route a tax accountant would want to check.
    { groupId: g, productTaxCode: "B", spec: "a" },
    { groupId: g, productTaxCode: "2", spec: "" },
    { groupId: g, productTaxCode: "3", spec: "z" },
  ]),
  { groupId: "tg-ns", productTaxCode: "1", spec: "h" },
  { groupId: "tg-ns", productTaxCode: "B", spec: "a" },
  { groupId: "tg-ns", productTaxCode: "2", spec: "" },
  { groupId: "tg-ns", productTaxCode: "3", spec: "z" },
  { groupId: "tg-on", productTaxCode: "1", spec: "f" },
  { groupId: "tg-on", productTaxCode: "B", spec: "a" },
  { groupId: "tg-on", productTaxCode: "2", spec: "" },
  { groupId: "tg-on", productTaxCode: "3", spec: "z" },
  // GST + a provincial tax, side by side on the subtotal.
  { groupId: "tg-bc", productTaxCode: "1", spec: "ac" },
  { groupId: "tg-bc", productTaxCode: "B", spec: "a" },
  { groupId: "tg-bc", productTaxCode: "2", spec: "" },
  { groupId: "tg-bc", productTaxCode: "3", spec: "z" },
  { groupId: "tg-sk", productTaxCode: "1", spec: "ad" },
  { groupId: "tg-sk", productTaxCode: "B", spec: "a" },
  { groupId: "tg-sk", productTaxCode: "2", spec: "" },
  { groupId: "tg-sk", productTaxCode: "3", spec: "z" },
  { groupId: "tg-mb", productTaxCode: "1", spec: "ae" },
  { groupId: "tg-mb", productTaxCode: "B", spec: "a" },
  { groupId: "tg-mb", productTaxCode: "2", spec: "" },
  { groupId: "tg-mb", productTaxCode: "3", spec: "z" },
  { groupId: "tg-qc", productTaxCode: "1", spec: "ab" },
  { groupId: "tg-qc", productTaxCode: "B", spec: "a" },
  { groupId: "tg-qc", productTaxCode: "2", spec: "" },
  { groupId: "tg-qc", productTaxCode: "3", spec: "z" },
  // Every cell blank: out of scope, not zero-rated (d15).
  { groupId: "tg-whl", productTaxCode: "1", spec: "" },
  { groupId: "tg-whl", productTaxCode: "B", spec: "" },
  { groupId: "tg-whl", productTaxCode: "2", spec: "" },
  { groupId: "tg-whl", productTaxCode: "3", spec: "" },
];

export const DEFAULT_TAX_GROUP = "tg-qc"; // d14 — the store's default

// d32 — a Genre carries a mandatory parent Section and a product tax code.
// d17 makes genre mandatory on every sellable thing, which is how freight and
// gift cards resolve tax with no special case at all.
export const GENRES: Genre[] = [
  // The genres the seeded Records actually carry. They read like catalog
  // provider genres — "Modal Jazz", "Art Punk" — because that is what they
  // are, and d6's genre map is what translates a provider's genre to a shop
  // one. The map itself is not modelled here (see docs/prototype.md); every
  // genre in the seed is simply a shop genre, so every Record resolves.
  { id: "gn-alt-rock", name: "Alt Rock", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-art-punk", name: "Art Punk", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-folk-rock", name: "Folk Rock", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-funk-pop", name: "Funk / Pop", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-hip-hop", name: "Hip Hop", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-modal-jazz", name: "Modal Jazz", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-pop-rock", name: "Pop Rock", section: "VI", productTaxCode: "1", active: true },
  { id: "gn-merch", name: "Merch", section: "ME", productTaxCode: "1", active: true },
  { id: "gn-books", name: "Books", section: "ME", productTaxCode: "B", active: true },
  // d17, d19 — shop-internal genres are omitted from the picker rather than
  // gated, so a Record can never be set to one by accident.
  { id: "gn-freight", name: "Freight", section: "FR", productTaxCode: "1", active: true, internal: true },
  { id: "gn-services", name: "Services", section: "FR", productTaxCode: "1", active: true, internal: true },
  {
    id: "gn-gift-card",
    name: "Gift card",
    section: "GC",
    productTaxCode: "2",
    active: true,
    internal: true,
    systemOwned: true,
  },
];
