import type {
  Customer,
  GiftCard,
  InventoryItem,
  NonTrackedItem,
  PendingOrderLine,
  RecordEntry,
  Supplier,
  TaxLine,
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
    genre: "Folk Rock",
    section: "VINYL",
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
    genre: "Pop Rock",
    section: "VINYL",
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
    genre: "Modal Jazz",
    section: "VINYL",
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
    genre: "Funk / Pop",
    section: "VINYL",
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
    genre: "Hip Hop",
    section: "VINYL",
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
    genre: "Merch",
    section: "MERCH",
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
    genre: "Hip Hop",
    section: "VINYL",
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
    genre: "Folk Rock",
    section: "VINYL",
    art: "🌌",
    manufacturerUpc: "075992745215",
    discogsId: "1425988",
    stickyPrice: 27.5,
    minOnHand: 0,
  },

  // Catalog-only (a catalog match we do not hold) — E-03 decision 5
  {
    id: "r-horses",
    artist: "Patti Smith",
    title: "Horses",
    label: "Arista",
    catalogNo: "AL 4066",
    format: "LP, Album",
    year: 1975,
    country: "US",
    genre: "Art Punk",
    section: "VINYL",
    art: "🐎",
    manufacturerUpc: "060758004321",
    discogsId: "377464",
    minOnHand: 0,
    catalogOnly: true,
  },
  {
    id: "r-ok",
    artist: "Radiohead",
    title: "OK Computer",
    label: "Parlophone",
    catalogNo: "NODATA 01",
    format: "LP, Album",
    year: 1997,
    country: "UK",
    genre: "Alt Rock",
    section: "VINYL",
    art: "💻",
    discogsId: "1092149",
    minOnHand: 0,
    catalogOnly: true,
  },
];

// ---- Inventory items (physical copies) ----
export const INVENTORY: InventoryItem[] = [
  // Blue — one new-ish copy + two used at different grades (UPC picker case)
  { id: "i-blue-1", recordId: "r-blue", grade: "NM", price: 28.99, cost: 12.4, internalBarcode: "200000001236", status: "sellable", arrivedOnInvoice: "F.A.B. 55021", supplierId: "sup-fab" },
  { id: "i-blue-2", recordId: "r-blue", grade: "VG+", price: 21.5, cost: 6.0, internalBarcode: "200000001243", status: "sellable" },
  { id: "i-blue-3", recordId: "r-blue", grade: "VG", price: 16.99, cost: 4.0, internalBarcode: "200000001250", status: "sellable", conditionNote: "Light seam wear, plays clean" },

  // Rumours — New stock, sticky price; 3 sealed copies share condition/price
  { id: "i-rum-1", recordId: "r-rumours", grade: "M", price: 34.99, cost: 18.75, internalBarcode: "200000002234", status: "sellable", arrivedOnInvoice: "F.A.B. 55021", supplierId: "sup-fab" },
  { id: "i-rum-2", recordId: "r-rumours", grade: "M", price: 34.99, cost: 18.75, internalBarcode: "200000002241", status: "sellable", arrivedOnInvoice: "F.A.B. 55021", supplierId: "sup-fab" },
  { id: "i-rum-3", recordId: "r-rumours", grade: "M", price: 34.99, cost: 18.75, internalBarcode: "200000002258", status: "held", heldByCustomerId: "c-ramona", arrivedOnInvoice: "F.A.B. 55021", supplierId: "sup-fab" },

  // Kind of Blue — single used copy (resolves with no picker)
  { id: "i-kob-1", recordId: "r-kind", grade: "VG+", price: 24.0, cost: 9.5, internalBarcode: "200000003231", status: "sellable" },

  // Purple Rain — New stock, 1 on hand, below min
  { id: "i-pr-1", recordId: "r-purple", grade: "M", price: 32.99, cost: 17.25, internalBarcode: "200000004238", status: "sellable", arrivedOnInvoice: "INDI-3390", supplierId: "sup-indie" },

  // Illmatic — used, backroom
  { id: "i-ill-1", recordId: "r-illmatic", grade: "VG", price: 45.0, cost: 20.0, internalBarcode: "200000005235", status: "sellable", backroom: true, conditionNote: "Backroom — sought after, keep behind counter" },

  // Tote bag — new merch
  { id: "i-tote-1", recordId: "r-tote", grade: "M", price: 18.0, cost: 6.5, internalBarcode: "200000006232", status: "sellable" },
  { id: "i-tote-2", recordId: "r-tote", grade: "M", price: 18.0, cost: 6.5, internalBarcode: "200000006249", status: "sellable" },
];

// ---- Non-tracked catalog items (E-05) ----
export const NON_TRACKED: NonTrackedItem[] = [
  { code: "FREIGHT", label: "Shipping / freight", price: 0, section: "MERCH" },
  { code: "STICKER", label: "Wax Works sticker", price: 2, section: "MERCH" },
  { code: "SERVICE-CLEAN", label: "Record cleaning (per disc)", price: 5, section: "MERCH" },
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
    defaultTaxLineId: "tx-exempt",
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

export const CURRENT_USER = "E. Okafor (Employee)";
export const MANAGER_NAME = "R. Delacroix (Manager)";
