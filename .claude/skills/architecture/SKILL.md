---
name: architecture
description: Derive or update WaxWorks system architecture documents and ADRs from the specified flows, including security and reliability review. Use when the user asks about system design, data model, tech stack, deployment, integrations, offline behaviour, authorisation, tenant isolation, audit trails, or wants to record an architecture decision.
---

# Architecture

Architecture here is **derived**, not invented. Every structural claim must trace to
a decision in a flow, the PRD, or an explicit statement from the user. Where it
cannot, it is a proposal and must be labelled one.

## Order of work

1. Read `docs/PRD.md` §4 (domain model), §5 (non-functional requirements) and §6
   (cross-cutting concerns).
2. Read every flow at `Specified`. Stubs constrain nothing — note which parts of the
   architecture are unconstrained because the relevant flow is still a stub, and say
   so explicitly rather than filling the gap.
3. Read `docs/decisions/` for ADRs already in force.
4. Only then write.

## What goes where

| Artifact | Path | Holds |
|---|---|---|
| Architecture overview | `docs/architecture/overview.md` | Components, boundaries, and how a flow traverses them |
| Data model | `docs/architecture/data-model.md` | Entities, keys, relationships, scoping — grown from PRD §4 |
| Integrations | `docs/architecture/integrations.md` | Discogs, payment terminals, printers, scanners |
| ADR | `docs/decisions/NNNN-<slug>.md` | One cross-cutting decision, with its alternatives |

Flow-local decisions stay in the flow's decision table. An ADR is for a decision
that **binds flows that have not been written yet** — persistence, tenancy model,
offline strategy, auth mechanism, barcode symbology. If you cannot name at least two
flows it constrains, it is not an ADR.

## Writing an ADR

Copy `docs/templates/adr-template.md`. Number sequentially from `0001`; numbers are
permanent, like flow IDs. Status is `Proposed` until the user ratifies it — then
`Accepted`. A reversal is a **new ADR** that supersedes the old one; the old one's
status becomes `Superseded by ADR-NNNN` and its body is left intact.

### The ratification gate

**You propose; the user ratifies.** Write the ADR at `Status: Proposed` and say
plainly that it is not yet binding. Do not move an ADR to `Accepted` yourself, and
do not cite a `Proposed` ADR elsewhere as though it were settled.

This is deliberate, and it is the main defence against a confident wrong turn: an
architecture decision binds flows that have not been written, so a hallucinated one
propagates silently for weeks. A `Proposed` ADR that turns out wrong costs one
conversation. Ratification is cheap for the user and expensive to reverse.

An ADR that lists no alternatives is not finished. The value is in the roads not
taken and why — see the internal barcode scheme in `docs/PRD.md` §4.3 for the house
standard: the recommendation, the structural reason it wins, the alternatives, and
the ratification status.

## Security and reliability

Architecture and security are one job here, because in this system they are the same
decisions: where the permission boundary is enforced, where the tenant boundary sits,
and what is immutable. Treat these as part of every design pass, not a later review.

- **Enforce authorisation at the boundary that holds.** Manager override gates
  below-cost pricing, adjustments beyond ±2%, and voiding a finalised invoice. A
  gate that lives only in the till UI is not a gate.
- **Store is the tenant boundary.** Every entity is store-scoped or explicitly
  shared, and which one must be stated. The scoping questions in PRD §6 are open —
  raise them, do not silently answer them.
- **Immutability is structural.** Finalised invoices cannot be mutated; corrections
  are appended artifacts (E-02 decisions 4, 23). This constrains the persistence
  design, not just the interface.
- **Every consequential action is attributable.** Overrides and discrepancy
  dismissals need an actor and a timestamp, or the audit trail has a hole exactly
  where it matters.
- **External input is untrusted** — Discogs responses, scanned barcodes, and invoice
  photo extraction, which is assistive only (E-02 decision 15).
- **Degrade deliberately.** Discogs down or rate-limited (~60 req/min), printer
  offline, network lost mid-sale. Say what happens; "it won't happen" is not a design.

For a read-heavy sweep, delegate to the `architect` subagent — read-only, cites
`path:line` for every finding, and hands back draft ADR text without writing or
ratifying anything.

## Constraints already in force

Carry these into any design; they are decided, not open.

- **Multi-store.** Store is the tenant boundary. Every entity is either store-scoped
  or explicitly shared, and which one it is must be stated. PRD §6 lists the
  scoping questions still open — do not silently pick answers for them.
- **Immutability with appended corrections.** Finalized invoices are immutable;
  amendments are separate artifacts against the original (E-02 decisions 4 and 23).
  This is a persistence constraint, not a UI one.
- **Negative inventory is legal** (E-02 decision 21). Stock levels are signed.
- **Catalog is local-first, Discogs is fallback** (E-02 decision 5), with a bulk
  prefetch at purchase-order time and a rate limit around 60 req/min authenticated.
- **Cover art is a one-time snapshot** (E-02 decision 6) — stored, not proxied.
- **Catalog record vs. physical copy** are distinct entities (PRD §4.1).

## Open questions you will hit immediately

These are unresolved in the PRD and change the architecture materially. Surface them
rather than assuming; if the user answers one, record it as an ADR in the same session.

- **Offline behaviour at the till.** Whether the register must keep selling without
  network is the single biggest structural fork — it decides local-first sync versus
  a plain client/server app. PRD §5 lists it as TBD.
- **Platform and hardware** at the counter and the receiving desk.
- **Catalog sharing across stores** — shared catalog saves Discogs calls; per-store
  catalog allows per-market pricing. PRD §6.
- **Whether a customer entity exists at all.** PRD §6.

## Diagrams

Use mermaid in fenced ```mermaid blocks — it renders on GitHub and needs no tooling.
Keep each diagram to one question: component boundaries, or an entity relationship,
or one flow's path. A diagram that answers three questions answers none.
