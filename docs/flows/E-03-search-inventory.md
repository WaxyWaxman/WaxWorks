# E-03 — Search the inventory

**Actor:** Employee
**Status:** Specified
**Related:** [E-04 Manage the inventory](E-04-manage-inventory.md) · [E-05 Point of Sale](E-05-sell-a-record.md) · [M-02 Re-order inventory](M-02-reorder-inventory.md)

**Job:** As an employee, I need to find a record quickly — usually while a customer is standing at the counter asking "do you have this?"

---

## Flow

1. Employee enters a search term, or scans a barcode.
2. System queries the **local catalog as the Employee types**; the **catalog provider is queried only on Enter** (decision 21). Local-first either way: anything already in the local catalog is presented as *our* Record, never re-fetched or duplicated from the catalog provider.
3. Results are grouped **one row per Record**, with our copies nested beneath it. Each nested row is an InventoryItem or group of identically-priced copies showing condition grade, price, and count.
4. Records we hold are sorted first — on hand, then on order, then everything else — with catalog-only matches below them.
5. A provider match we do not hold is shown as a **catalog row**, visibly marked as not in stock, so the answer "no, but we can order it" is one glance rather than a second search.
6. Employee selects a row — ours or a catalog row — to open the **titlecard**. Opening one **writes nothing** (decision 18): a provider match is browsable, and is shown with its provider tags and **no genre**, because there is no Record for a genre to sit on until it is adopted. This is the same titlecard — the view of one Record with all its copies, quantities, and order state ([E-04](E-04-manage-inventory.md)).
7. Acting on a catalog-only row — ordering it, stocking it, editing it — **pulls it into the local catalog**, auto-filling every field the catalog provider provides and prompting for the ones it cannot supply. **Genre is the only one it insists on** (decision 19); supplier is offered, and a **selling price** may be set here and becomes the sticky price (decision 20). Putting the row on a **sale line** is a fourth such act ([E-05](E-05-sell-a-record.md) d34). **Section is not among them** — it is derived from the genre's required parent ([M-06](M-06-settings.md) d31, d32), so it is never prompted for and never stored beside the genre. A row that has not been pulled in yet therefore shows **tags and no genre**, which is what distinguishes it from a Record the shop adopted and never stocked (decision 17).

---

## Search dimensions

Artist · album title · track title · label · catalog number · manufacturer UPC · internal barcode · Section · genre.

A scanned barcode short-circuits to resolution rather than keyword search: a manufacturer UPC resolves to a Record, an internal barcode to a single InventoryItem. **Typed**, both are ordinary keyword dimensions and list their match among the results (decision 15) — decision 9 is about the scanner, not about the string.

---

## What search covers

| Included | Notes |
|---|---|
| Sellable stock on hand | Including copies held for a customer, shown as held rather than available |
| Stock in the backroom | Counted in on hand |
| On order and pending order | So "it's coming" is answerable without leaving the screen |
| Catalog Records with no stock | Titles we've held before, or provider matches |
| Sold history | Reachable from the titlecard, not mixed into search results |

---

## Requirements

- Search must return usefully when **the catalog provider is unreachable or rate-limited**. Local inventory search and every till function continue to work; only catalog-only rows are unavailable, and the degradation is visible rather than silent.
- A Record we hold must never appear twice — once from local and once from the catalog provider — in the same result set.
- Grouping is by Record, so four differently-graded copies of one pressing occupy one row with four copies nested, not four top-level results.
- Pulling a catalog row into local inventory must not silently invent store-specific values; it prompts.

---

## Inherited from other flows

**From [E-06](E-06-process-a-return.md) decision 17:**

- **A re-graded returned copy restarts decision 16's dead-stock clock.** Re-grading mints
  a **new** InventoryItem ([E-06](E-06-process-a-return.md) decision 15) dated at the
  moment of re-grade, so a copy that sat unsold for a year reads as stock that arrived
  today once it has been sold and taken back. E-06 accepts this knowingly — a returned
  copy is, for reorder purposes, a fresh proposition — but anything here that reasons
  from *how long has this sat* is reading a clock that a return resets.

- **The three-track frame is [E-05](E-05-sell-a-record.md) d29's**, adopted here by decision 14. The result slab retracts to a strip, the Record and its copies hold the middle, and the stock answer is a sticky right-hand track — the same shape [E-02](E-02-receive-inventory.md) d38, [E-06](E-06-process-a-return.md) d9, [E-07](E-07-manage-customers.md) d17 and [M-01](M-01-supplier-margin.md) d12 take. Find does not own it and should not diverge from it.

**From [M-06](M-06-settings.md):**

- **A catalog-only row shows its provider tags and no genre** ([M-06](M-06-settings.md) d53). There is no Record yet for a genre to sit on, so the genre map is not consulted for a pressing the shop has not adopted. **Genre presence is the tell** that a row is locally adopted rather than a provider match — no separate badge carries it.
- **Step 7's "prompting for the ones it cannot supply" includes genre, and genre cannot be skipped** ([M-06](M-06-settings.md) d53, d17). At adoption the map resolves by priority then by the provider's vote count ([architecture](../architecture.md) A-61); a hit auto-fills, a miss prompts, and the prompt fires once per distinct unmapped tag rather than once per Record. This holds **even when the Record will never be stocked** — adoption without ordering is already permitted by decision 6's third verb, *editing it*.

**From [E-02](E-02-receive-inventory.md):**

- Catalog lookup is **local-first with the provider as fallback** (E-02 decision 5). Metadata is bulk-prefetched at PurchaseOrder time ([M-02](M-02-reorder-inventory.md)), so most lookups hit locally.
- Where the catalog provider returns multiple matches, the Employee is presented a **picker** rather than an automatic choice.

**From [M-06](M-06-settings.md):**

- **The dead-stock threshold is a store setting defaulting to 180 days, and a Section may override it** ([M-06](M-06-settings.md) d40). This completes decision 16, which named the setting and left *"and plausibly by Section"* undecided. It is resolved live rather than copied onto a Record (M-06 d31), so changing it re-reads every Record beneath it at once.

---

## Resolved decisions

| # | Decision |
|---|---|
| 1 | Search queries local inventory and the catalog provider simultaneously and presents both in one result set |
| 2 | Local always wins — a Record we already hold is shown as ours, never re-fetched or duplicated |
| 3 | Results group **one row per Record**, with our copies nested beneath showing grade, price, and count |
| 4 | Stock we hold sorts above catalog-only matches |
| 5 | Catalog-only matches are shown and visibly marked not-in-stock, so "we can order it" is answerable in place |
| 6 | Acting on a catalog-only row pulls it into the local catalog, auto-filling from the catalog provider and prompting for store-specific fields |
| 7 | Search covers on-hand, held, backroom, on-order, and pending-order state |
| 8 | Search degrades gracefully and visibly when the catalog provider is unavailable; local search and the till are unaffected |
| 9 | A scanned barcode resolves directly rather than running a keyword search |
| 10 | **The catalog provider is MusicBrainz**, behind an adapter — not Discogs. Every "Discogs" in this flow now reads as "the catalog provider"; decision 8's graceful degradation is unchanged and provider-agnostic ([architecture](../architecture.md) A-12) |
| 11 | **A result carries one of four stock states** — *here now*, *on the way*, *had before*, *never stocked* — and results are banded and sorted in that order. Extends decision 4 from a two-way split (ours / catalog-only) to the four cases decision 7 already put in scope. The state is **derived**, never stored: on hand and held come from copies, *on the way* from outstanding order lines, *had before* from a Record with no copies that has completed Sales behind it, *never stocked* from a catalog-only match. Each state carries a colour **and** words — colour is never the only carrier |
| 12 | **Each result shows a recency stamp** alongside its state — how long since a copy last sold. Answers the reorder question decision 7 left open: a title stocked three times and sold out of reads differently from one that sat. Derived from completed Sales (Current or Closed, excluding Returns), so no new field is stored |
| 13 | **Amends decision 11: *on the way* means PLACED, not raised.** [M-02](M-02-reorder-inventory.md) splits a pending order line's life in two — raised into a supplier stream (no PO number), which is still Order Processing's job and which the supplier has never been told about, and placed (PO number set), which is a real order. Only placed units count toward *on the way*; raised units are reported separately and never change a Record's state. Counting raised units would have an Employee promise a customer a record nobody has ordered — the exact false answer this flow exists to prevent |
| 14 | **Find is laid out as the till's three tracks, and our copies move to the work track. Amends decision 3.** The frame is [E-05](E-05-sell-a-record.md) d29, adopted here as [E-02](E-02-receive-inventory.md) d38, [E-06](E-06-process-a-return.md) d9, [E-07](E-07-manage-customers.md) d17 and [M-01](M-01-supplier-margin.md) d12 each adopt it: a retractable result slab, the Record and its copies in the middle, the stock answer in a sticky right-hand track. **Decision 3 nested our copies under the result row**, and a 320px slab row has no room for per-copy grade and price. They are **moved, not dropped** — the work track shows grade, cost, price and barcode per copy, which is more than decision 3 asked for. The row keeps what comparing a *list* needs: one figure and what it counts (available / all held / on order / pending), and decision 12's recency stamp beside it. *This was built before it was written down, and the reason survived only in a CSS comment.* That is the gap this row closes; the layout itself is unchanged. *Accepted consequence:* comparing two Records' grades or prices now takes two selections. The row answers *do we have it, and how cold is it*; the copies answer *which one do I sell you* — and only the first is a question worth asking of a whole list |
| 15 | **Internal barcode and manufacturer UPC are typed keyword dimensions, not only scan targets.** The **Search dimensions** list has always named both, and **decision 9 governs what a *scan* does** — short-circuit to resolution — not what a typed string matches. The code matched neither by keyword, so a number read off a sleeve by hand returned *nothing found* while the same number under the scanner resolved instantly. Typing one now matches it like any other dimension and lists the Record among the results; it does **not** short-circuit the way decision 9's scan does. *Accepted consequence:* a typed full barcode returns a one-row list rather than jumping straight to the copy, which is a click more than scanning. That is the right asymmetry — a scan is unambiguous by construction and a typed string is not, so the typed path keeps the confirmation step |
| 16 | **A held Record that has never sold reads *never sold* once its oldest copy has been on hand 180 days — a store setting — and the recency buckets stop being a stand-in.** **Resolves the *Recency thresholds* open question** and completes decision 12, which said a stamp is shown without saying what counts as stale. Before the threshold the stamp stays **silent**, and that silence is correct: new stock has no recency to report, and a flag that fires on every arrival is noise rather than signal. After it, *never sold* is arguably the loudest reorder signal there is — the shop bought it and nobody wanted it. **180 days is a store setting** ([M-06](M-06-settings.md)), defaulting to 180. What counts as dead differs by shop and by section, and this is the first figure in this flow that belongs in configuration rather than in code. **The clock runs from when the copy was received** — the `receivedDate` of the Invoice its oldest present copy arrived on, reached through the provenance reference [architecture](../architecture.md) A-45 added. A copy with no Invoice behind it has no arrival date and therefore no stamp, which is the honest answer rather than a guessed one. **The display buckets are ratified as the prototype already draws them** rather than left standing in for a real rule: *today*, *yesterday*, days out to three weeks, weeks out to two months, months out to a year, then month-and-year. *Accepted consequence, and it is the one to watch:* **two different clocks now feed one stamp** — time since the last sale for a Record that has sold, time since arrival for one that has not. They are not comparable figures. The stamp says which it means in words (*sold 6mo ago* versus *never sold*), and anyone reading the two as one measure will be wrong |
| 17 | **_Never stocked_ is derived from holding no copies and having no history, not from being a catalog-only match. Corrects decision 11's derivation clause.** Decision 11 lists the four states and derives three of them exactly right; the fourth it derives from *"a catalog-only match"*, which was true while the only Records with no stock were provider matches. [M-06](M-06-settings.md) d53 makes **adoption a deliberate act** — decision 6's third verb is *editing it*, so a Record may be pulled into the local catalog and never ordered, on purpose — and such a Record is **never stocked** while having nothing to do with the provider at all. The state is therefore derived from **no copies on hand or held, none on order, and no completed Sale behind it**, which is what decision 11's own *"derived, never stored"* rule already requires. **This is a correction, not a new state:** the four bands are unchanged and nothing re-sorts. *Consequence, and it is why this earns a row rather than a silent fix:* **a deliberately adopted title and a provider match the shop has never touched now read identically** in the results, and that is correct — both are things the shop does not hold. What separates them is **genre**: a Record carries one and a provider match cannot, because there is no Record for a genre to sit on until adoption ([M-06](M-06-settings.md) d53). That tell is free and wants no badge of its own |
| 18 | **A provider match is browsable. Adoption is triggered by the first act that changes something, never by looking.** Decision 5 exists so *"we can order it" is answerable in place* — which means a catalog row has to be readable by somebody standing at the counter with a customer, and **reading it must not write it into the catalog**. Adopting on view would put every title anyone ever asked about into the shop's own catalog, permanently and silently. Decision 6's three verbs are already the right list and they are all modifications: *ordering it, stocking it, editing it* — **viewing is not one of them**, and [E-05](E-05-sell-a-record.md) d34 adds the fourth, putting it on a sale line. **What an unadopted match shows:** everything the provider supplies, its **tags**, and **no genre** — because there is no Record for a genre to sit on until adoption ([M-06](M-06-settings.md) d53). *Accepted consequence:* **genre presence is the tell** that a row is ours, and nothing else marks it. That is deliberate — decision 17 already makes a deliberately adopted title and an untouched provider match read identically as *never stocked*, so a badge would be a second way of saying what one field already says |
| 19 | **Genre is the only field that can still be blank when adoption is asked for, and so the only one it insists on.** *Required* here means **not blank on the resulting Record** — a rule about the catalog entry, enforced where it is written — rather than a dialog somebody has to answer. [architecture](../architecture.md) A-48 is the precedent: a bound enforced in the screen is not a bound. **That is also why the prompt is usually invisible:** it appears only for what is actually empty. Artist and title arrive from the provider and are never blank; **genre has no provider source at all** — the provider supplies *tags*, and our genre is a different thing ([M-06](M-06-settings.md) d6) — so it is blank unless the map resolves it or somebody chooses. Everything else the provider supplies is pre-filled and editable afterwards, and the two that looked mandatory are not. **Preferred supplier is offered, not required**: [M-02](M-02-reorder-inventory.md) d2 records the supplier on the **order line**, and a Record's supplier is only a default, so a Record adopted without one is complete. **Artist and title come from the provider**, and correcting them is itself one of decision 6's modifying acts — so they cannot be a precondition of the act that they trigger. **Genre is mandatory because nothing downstream survives its absence:** [M-06](M-06-settings.md) d17 makes it mandatory on every sellable thing and d18 routes all tax through it, so a genre-less Record has no shelf, no Section (d31) and no tax path. *Accepted consequence:* adoption is usually **one click**, because the map resolves the genre and nothing else is empty (d53); the prompt is the exception rather than the shape of the act. *And one edge this framing exposes rather than creates:* a provider release arriving with **no title or no artist** cannot be adopted, since those cannot be blank either. That is self-resolving — **editing it** is already one of decision 6's acts, so correcting the field and adopting it are the same gesture |
| 20 | **An Employee may set a selling price at adoption. Optional, suggested, and it becomes the sticky price.** A title brought in with no stock has nothing to price it from — no cost, no supplier invoice — so the shop's own intended shelf price is the only figure that exists, and capturing it is better than leaving the Record priceless until the first receipt. Offered rather than required, because a title adopted purely to answer a question or to be ordered later needs no price: [M-02](M-02-reorder-inventory.md) captures the selling price when the **order** is placed, and [E-02](E-02-receive-inventory.md) captures it at the **receipt**. *Accepted consequences, both of them precedence rules that already exist and now have a second input:* **the first New-mode receipt overwrites it** ([E-02](E-02-receive-inventory.md) d12 — the accepted price becomes the sticky price), which is correct, because a real receipt beats a guess made before anything was bought. And **it is ignored for a title later taken in second-hand**, since d11 keeps sticky pricing to New stock only and second-hand is priced per copy. Neither is a special case for adoption; both are d11 and d12 applying as written |
| 21 | **The local catalog searches as you type; the catalog provider is queried only on Enter.** The common question at the counter is *where is this in the shop*, asked with a customer standing there, and it is answered entirely from local stock — so that path must be instant and must never wait on, or spend, a provider request. Pressing **Enter** is what says *and look outside*. **This is a usability decision that happens to solve a rate limit**, not the other way round: the provider allows roughly **one request per second** ([PRD](../PRD.md) §5) and [architecture](../architecture.md) A-12a batches at purchase-order time for that reason, so a per-keystroke provider search was never viable, but a debounce timer would have been the answer to that and this is better than a debounce timer — it is **predictable**, and the operator knows which kind of search they asked for. *Consequence, and it is an improvement rather than a cost:* **decision 8's graceful degradation gets sharper.** An outage currently means some rows are quietly not there; under this it surfaces **at the moment you asked for them**, which is when knowing is useful |
| 22 | **Adoption from search always confirms; adoption at the receiving desk does not.** The act is identical either way — the map resolves, the genre is settled once, nothing is re-resolved later ([M-06](M-06-settings.md) d53). What differs is whether a form is shown first, and that follows the operator's intent. **At the desk they are scanning a box**, the map resolving without asking is the entire point of having a map, and a form between every scan and the next is the thing d53's once-per-tag rule exists to avoid. **From search they are deliberately cataloguing one title**, having already chosen to browse it, so a confirm costs nothing and is where decision 20's optional selling price lives — there is nowhere else to offer it, since a title adopted this way may never be scanned at all. **This does not weaken decision 19.** The form asks for nothing that is already filled: where the map resolved a genre it arrives **pre-filled**, and confirming is not the same as being asked. *Accepted consequence:* one act has two front doors, and somebody comparing them will notice. The alternative — one ceremony for both — is worse in either direction: a form at the receiving desk slows the case that most needs to be fast, and no form from search leaves the price with nowhere to be set |

---

## Open questions

- **Cost is masked on this screen by an affordance no decision authorises.** The prototype hides the copies
  table's cost behind a 🔓/🔒 control defaulting to hidden (`prototype/src/screens/Search.tsx:46`,
  `prototype/src/components/FindSelection.tsx:90`), on the stated grounds that *a customer standing at the counter
  can read this screen too* — but **no decision in this flow, in [E-04](E-04-manage-inventory.md) which owns the
  copies table, in [M-06](M-06-settings.md), or in the [architecture](../architecture.md) says cost is ever
  hidden**, and [M-04](M-04-manage-users.md) d2 makes anything off the manager-gated list plainly Employee-visible.
  Three things need settling together: whether the masking is ratified at all; if so, whether it is per-screen
  session state as built, a stored per-User or per-Store setting, or a gate; and what to do about
  `prototype/src/screens/Receiving.tsx:803`, which hardcodes cost **shown** and wires the button to a no-op, so the
  receiving desk carries a control that does nothing. Raised by [E-07](E-07-manage-customers.md) d25, which was
  asked to follow this flow's precedent and found there was none. Nothing in `docs/qa/e2e-register.md` covers the
  masking either way.
- **Bin location.** Section tells you which part of the shop a Record lives in, but not where in the racks. Whether a finer-grained location is needed depends on shop size and is currently unanswered.
- **Ranking within relevance.** **Partly answered** by decision 11: results band by stock state, and within a band sort by quantity on hand, then artist. What is still unspecified is ranking *inside* a band on a broad search — release year, provider-supplied popularity, and local sales velocity are all candidates. Note that popularity signals are provider-specific and may not survive the move off Discogs (decision 10).
- ~~**Recency thresholds.**~~ — **Resolved by decision 16**: the buckets are ratified as drawn, and *never sold* appears once a held Record's oldest copy has been on hand past a store-configured threshold defaulting to **180 days**. What remains is [M-06](M-06-settings.md)'s job, not this flow's — the setting itself, and whether it should vary by Section rather than by store.
- **Multi-store search.** The system is multi-store and the schema carries a Store scope, but v1 does not expose cross-store results. When it does, PRD §6's question stands: does an Employee see a sister store's stock, and at what granularity?
- **Result volume.** A broad artist search against the catalog provider can return hundreds of catalog rows. Paging, capping, or collapsing them is undecided.
