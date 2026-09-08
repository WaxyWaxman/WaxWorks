# E-05 — Sell a record

**Actor:** Employee
**Status:** Stub — awaiting flow
**Related:** [E-06 Process a return](E-06-process-a-return.md)

**Job:** As an employee, I need to ring up a sale and take payment.

---

## Flow

_TBD_

## Requirements

_TBD_

## Inherited from E-02

- **Negative inventory must be supported.** Stock only becomes sellable when its invoice is finalized, so a physical copy can be on the counter before it exists in the system. The till must complete that sale and let inventory go negative rather than blocking it. Reconciliation happens in E-04.

## Open questions

- Payment methods: cash, card, split payment, store credit, gift card?
- Card processing — integrate a provider (Stripe/Square) or record-only and settle on a separate terminal?
- Multi-item carts, discounts, tax handling?
- Non-record items (turntables, sleeves, merch, tickets)?
- Receipt: printed, emailed, or both?
- How does the till distinguish two used copies of the same pressing at different prices? (See the internal barcode scheme in the PRD.)
