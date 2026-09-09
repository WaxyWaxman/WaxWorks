# E-07 — Manage customers

**Actor:** Employee (deletion manager-only)
**Status:** Specified
**Related:** [E-05 Sell a record](E-05-sell-a-record.md) · [E-06 Process a return](E-06-process-a-return.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md)

**Job:** As an employee, I need to look someone up so I can attach them to a sale, hold something for them, give them their discount, or settle what's owed between us.

**Scope note:** this flow answers PRD §6's open question — **there is a Customer record.** It exists because holds, special orders, store credit, discounts, and receipt-less returns all need somewhere to hang.

---

## Flow

1. Employee searches by name, phone number, email address, or account number.
2. Matches are listed for selection; no match offers to create a Customer.
3. The customer card shows their details, balance, and history.
4. From the card, or from a Sale, the Employee can attach the Customer to the transaction in hand.

A Customer is never required. Most Sales are walk-in and anonymous ([E-05](E-05-sell-a-record.md) d20).

---

## Fields

| Field | Notes |
|---|---|
| **Customer ID** | Internal, permanent, ascending. Never reused, never edited. |
| **Account number** | Store-facing reference. Employee-editable, must stay unique. |
| **Account type** | Configured list ([M-06](M-06-settings.md)) — e.g. Regular, Staff, Business. |
| **Name** | |
| **Phone**, **Email** | |
| **Contact preference** | Which channel to use when their order arrives — consumed by the hold timeline in [E-05](E-05-sell-a-record.md). |
| **Mailing address** | Line 1, line 2, city, province/state, country. |
| **Global discount** | Percentage, pre-filling the line discount on their Sales; overridable per line ([E-05](E-05-sell-a-record.md)). |
| **Default tax line** | Optional override pointing at a line in the tax table, including an exempt line. Covers wholesale buyers, other stores, and out-of-province shipping. Overrides the item's tax line at the till. |
| **Note** | Free-form, visible to every Employee. |
| **Account balance** | See below. |
| **History** | Their Sales, most recent first: title, Sale number, date, and whether it was a Return. |

---

## Account balance

A Customer's balance is a **single signed figure**, because money can run in either direction:

| Sign | Meaning | Arises from |
|---|---|---|
| **Positive** | The store owes the Customer — store credit | A `Used Credit` counter buy settled to credit, a Return refunded to credit, gift value assigned to their name |
| **Negative** | The Customer owes the store | An outbound customer invoice issued to a business account and not yet paid |

Store credit is drawn down by the **Store Credit** tender at the till ([E-05](E-05-sell-a-record.md)).

> **Terminology.** Store credit is a *liability* — the store owes it — so calling the whole field "accounts receivable" would be backwards. A single signed balance handles both directions without needing two fields that can never both be non-zero.

---

## Business customers and outbound invoices

Some Sales go to other businesses rather than over the counter, and those need an **invoice**, not a till receipt. An outbound **customer invoice** is a Sale rendered as a business document — addressed to the Customer, carrying their account number and terms — and settled later against their account balance rather than tendered on the spot.

This is distinct from a supplier **Invoice** ([E-02](E-02-receive-inventory.md)), which is inbound. Both are invoices in the ordinary business sense; the lexicon qualifies which is meant.

---

## Requirements

- A Customer's identity must survive edits to their account number — history hangs off the permanent Customer ID.
- Deleting a Customer is manager-only and must not orphan their Sales; past Sales retain the name they were made under.
- A Customer's balance is derived from the movements against it, not typed in directly.
- Contact preference must be reachable from a hold, so the Employee chasing it knows how to make contact.

---

## Inherited from other flows

**From [E-05](E-05-sell-a-record.md):**

- Attaching a Customer pre-fills their global discount and default tax line onto Sale lines.
- The **Store Credit** tender draws against the account balance and requires a Customer.
- A `Used Credit` counter buy may settle to store credit rather than cash.

**From [E-06](E-06-process-a-return.md):**

- A refund may be settled to store credit instead of cash.

**From [M-02](M-02-reorder-inventory.md):**

- A Customer may be attached to an order line; on receipt this becomes a **Held** Sale in their name.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | **There is a Customer record**, settling PRD §6 open question 1 |
| 2 | A Customer is optional on every Sale; anonymous walk-in is the default case |
| 3 | Customer ID is permanent and internal; the account number is editable but unique |
| 4 | The account balance is a **single signed figure** — positive is store credit owed to them, negative is owed to the store |
| 5 | The balance is derived from movements, never entered directly |
| 6 | A Customer carries a global discount that pre-fills line discounts and is overridable per line |
| 7 | A Customer may carry a **default tax line** that overrides the item's at the till |
| 8 | Contact preference is a field, consumed by the hold timeline when an order arrives |
| 9 | Deletion is manager-only and never orphans history |
| 10 | **Outbound customer invoices** exist for business accounts and are settled against the account balance rather than tendered |

---

## Open questions

- **Terms on outbound invoices.** Net 30, due dates, and whether anything chases an overdue business account is unspecified — this is the receivables side of the same problem [M-05](M-05-accounts-payable.md) solves for payables.
- **Duplicate customers.** Two records for the same person is inevitable at a counter. Merging them — as suppliers can be merged — isn't specified.
- **Data protection.** The record holds name, address, email, phone, and purchase history. Retention, export, and deletion-on-request obligations are unaddressed.
- **Want lists.** PRD §6 mentions want-lists as a reason a customer record might exist; nothing here implements one.
- **Credit limit.** A business account can currently run an unbounded negative balance.
