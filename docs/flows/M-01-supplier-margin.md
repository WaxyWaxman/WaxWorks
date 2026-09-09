# M-01 — Set a supplier margin

**Actor:** Manager
**Status:** Stub — awaiting flow
**Related:** [E-02 Receive inventory](E-02-receive-inventory.md)

**Job:** As a manager, I need to control the markup applied to stock from a given supplier so pricing stays consistent and profitable.

---

## Flow

_TBD_

## Requirements

_TBD_

## Inherited from E-02

- Margin drives the suggested retail price at receiving: `suggested_retail = round_up(list_price x (1 + supplier_margin))`. Note it is applied to the supplier's **pre-discount list price**, so supplier discounts are captured as margin.
- **Employees can create suppliers but never set margins.** A supplier created during receiving therefore arrives with no margin — the system needs a defined behavior for that state.

## Open questions

- What happens at receiving when a supplier has no margin set yet? Fall back to a system default, block pricing, or prompt a manager?
- Is margin set per supplier, per category, per item — or a cascade with overrides?
- Does changing a margin reprice existing stock, or only apply to future intake?
- Percentage markup, fixed uplift, or target margin?
- Is there a floor/ceiling or MAP (minimum advertised price) constraint?
- **Multi-store:** are suppliers and their margins shared across stores or per-store?
