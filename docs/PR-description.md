# Specify POS flows and reconcile them with the PRD

## What this is

A standalone POS/inventory scope document, decomposed into this repo's flow format and reconciled against the decisions already in the PRD. Nothing here is dropped in as a parallel document — it lands as flow specs, PRD amendments, and lexicon entries.

**Statuses moved:** E-03, E-04, E-05, E-06, M-02, M-03 → `Specified`. E-01, M-04 → `In clarification`.
**New flows:** E-07 (manage customers), M-05 (accounts payable), M-06 (configure the store).

## Conflicts resolved

The source document disagreed with ratified decisions in several places. Rather than paper over them, each was settled:

| # | Conflict | Resolution |
|---|---|---|
| 1 | Single-store vs. **multi-store** | **Conceded to multi-store.** Every entity carries a Store scope from the outset; v1 deploys one store with no cross-store UI. Retrofitting this later is the expensive version. |
| 2 | Internal barcode symbology | **Conceded to UPC-A under GS1 number system 2.** A competing Code 128 proposal was dropped — the PRD's reasoning holds, one symbology means the resolver never branches on format. §4.3 moves to *ratified*. |
| 3 | Per-copy `InventoryItem` vs. per-variant model | **Kept Record + InventoryItem.** On hand becomes a **derived count** of sellable copies rather than a stored integer, so a stock figure can't drift from the copies it describes. "Titlecard" survives only as the name of the *screen* showing a Record and its copies — it is not an entity. |
| 4 | Accounts payable out of scope (E-02 d25) | **Brought into scope** as M-05. Per the append-never-renumber convention, decision 25 stands as the record of what was decided and **decision 26** records the change. |
| 5 | Below-cost pricing | **Split by where the price is set.** E-02 decision 10's manager override still gates *shelf* prices, including when set outside receiving. A one-off *till* discount needs no override — that's a deliberate policy choice by the store owner, recorded as E-05 decision 12. |

### NG-4 was rewritten, not overturned

NG-4 previously read *"there is no money exchange on this platform,"* which taken literally makes E-05 unbuildable — a till that can't record how a sale was paid isn't a till, and M-03 already asks for payment mix. It now says what it meant: **no payment processor integration, no card details, no money moved.** Card tenders are recorded for reconciliation and settled on a separate terminal.

## Lexicon

Gains the whole selling-side vocabulary — Sale states, Sale number, hold reference, Tender, split tender, pay-out, store credit, account balance, Section, TaxLine, CloseBatch, non-tracked item, titlecard.

**"Invoice" now splits three ways**, because outbound invoices to business accounts are a real part of the trade and the previous inbound-only definition couldn't express them:

- **supplier Invoice** — inbound, the receiving document (the unqualified word still means this)
- **customer invoice** — outbound, a Sale rendered for a business account and settled on terms
- **receipt** — the till document

Also resolves two of §13's flagged inconsistencies: *till* vs *register* (→ **till**), and the stray *behaviour* in M-01 (→ **behavior**). Adds a fifth: "Administrators" in PRD goal G-2, left as-is pending a decision.

## Open questions raised, not answered

Each flow carries its own, but the ones worth flagging up front:

- **Offline behavior at the till.** PRD §5 now settles platform (web/PWA) and hardware, but a degraded offline mode is specified nowhere. For a shop whose card terminal is already independent, the real question is whether cash sales must survive an outage.
- **Accounts receivable.** E-07 lets a business account owe the store money, but nothing chases it — no terms, no due dates, no aging. M-05 solves this shape of problem for payables only.
- **Sleeve vs. vinyl grading** (PRD §4.2) now also touches E-06, where a returned copy may need re-grading.
- **Batch stock-take.** Reason-coded single adjustments are in; counting a Section against the shelf in one reconciling pass is not.
- **Per-employee sales attribution.** If one Employee rings a Sale and another tenders it, M-03 doesn't know whose it is.

## Review notes

- **E-02 was touched in two places only** — an `Inherited from other flows` section recording what M-02, E-05, and M-05 push into it, and appended decision 26. No existing decision was renumbered or rewritten.
- Every internal link resolves and the docs pass a spelling/lexicon check.
- The five conflict resolutions above are the parts most worth disagreeing with — they were product calls, not editorial ones.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
