import { useMemo, useState } from "react";
import {
  blankDraft,
  BulkOrderBatch,
  BulkOrderSheet,
  type BulkDraft,
} from "../components/BulkOrderSheet";
import { OrderLineTrack, OrderScopeTrack } from "../components/OrderLineTrack";
import { OrderSlab, type OrderChip, type OrderSort, type PoRow } from "../components/OrderSlab";
import type { PendingOrderLine } from "../data/types";
import { money } from "../lib/money";
import { isPlacedOrderLine, orderLineState, outstandingQty } from "../lib/orderLines";
import { readStored, writeStored } from "../lib/tillMemory";
import { daysAgo, followUpDueAt, isFollowUpOverdue } from "../lib/totals";
import { useApp } from "../store/AppStore";

// What's on Order (M-02 Phase 3), laid out as the till's three tracks — the
// same frame as Sell, Find, Receive, Customers and Suppliers (E-05 d29 by way
// of E-02 d38, E-07 d17, M-01 d17). The frame is pinned to the viewport and
// each track scrolls on its own, so the search box and the primary action are
// always where they were last time.
//
// "On order" is placed AND still expected. A line survives being received now
// (d21), so filtering on `poNumber` alone would keep listing copies already on
// the shelf — `isPlacedOrderLine` is the one place that question is answered.
//
// Both of Phase 3's modals moved into track 3, which is also where the line's
// log (d23) finally becomes readable without opening the thing that changes it.

const SLAB_KEY = "waxworks.onorder.slab";
const DRAFT_KEY = "waxworks.onorder.draft";

export function WhatsOnOrder() {
  const app = useApp();

  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<OrderChip>("all");
  const [sort, setSort] = useState<OrderSort>("age");
  const [scope, setScope] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // d30 — an unfinished batch is a draft: it persists immediately and is
  // resumable, the same shape E-02 d4 gives a draft Invoice, because a stack
  // half scanned at the counter is interrupted by whoever walks up next.
  // Held in till memory rather than in the store: it is not an entity anyone
  // else can see, and nothing downstream reads it.
  const [draft, setDraft] = useState<BulkDraft | null>(() =>
    readStored<BulkDraft | null>(DRAFT_KEY, null),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const saveSlab = (open: boolean) => {
    setSlabOpen(open);
    writeStored(SLAB_KEY, open);
  };
  const saveDraft = (next: BulkDraft | null) => {
    setDraft(next);
    writeStored(DRAFT_KEY, next);
  };

  const onOrder = useMemo(
    () => app.pendingOrders.filter((o) => isPlacedOrderLine(o, app.invoices)),
    [app.pendingOrders, app.invoices],
  );

  const matches = (o: PendingOrderLine, q: string) => {
    if (!q) return true;
    const rec = app.recordFor(o.recordId);
    const sup = app.supplierFor(o.supplierId);
    return [
      rec?.artist,
      rec?.title,
      rec && `${rec.artist} — ${rec.title}`, // matches what a scan fills the box with
      rec?.catalogNo,
      rec?.manufacturerUpc,
      o.poNumber,
      sup?.name,
      sup?.shortName,
    ]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q));
  };

  const searched = useMemo(
    () => onOrder.filter((o) => matches(o, query.trim().toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOrder, query, app.records, app.suppliers],
  );

  // Chip counts are of what the SEARCH left and not of the current scope —
  // otherwise a chip reading 3 filters to nothing. Same rule Customers uses.
  const counts = useMemo(() => {
    const c: Record<OrderChip, number> = {
      all: searched.length,
      late: 0,
      shipped: 0,
      backordered: 0,
      part: 0,
      waiting: 0,
    };
    for (const o of searched) {
      if (isFollowUpOverdue(o)) c.late += 1;
      if (o.status === "Shipped") c.shipped += 1;
      if (o.status === "Backordered") c.backordered += 1;
      if (orderLineState(o, app.invoices) === "Part received") c.part += 1;
      if (o.customerId) c.waiting += 1;
    }
    return c;
  }, [searched, app.invoices]);

  const chipped = useMemo(() => {
    switch (chip) {
      case "late":
        return searched.filter(isFollowUpOverdue);
      case "shipped":
        return searched.filter((o) => o.status === "Shipped");
      case "backordered":
        return searched.filter((o) => o.status === "Backordered");
      case "part":
        return searched.filter((o) => orderLineState(o, app.invoices) === "Part received");
      case "waiting":
        return searched.filter((o) => o.customerId);
      default:
        return searched;
    }
  }, [searched, chip, app.invoices]);

  const pos: PoRow[] = useMemo(() => {
    const by = new Map<string, PoRow>();
    for (const o of onOrder) {
      const po = o.poNumber!;
      if (!by.has(po)) {
        by.set(po, {
          poNumber: po,
          supplier: app.supplierFor(o.supplierId),
          lines: [],
          oldest: o.placedAt ?? o.createdAt,
          overdue: 0,
          external: false,
          matched: false,
        });
      }
      const row = by.get(po)!;
      row.lines.push(o);
      if (isFollowUpOverdue(o)) row.overdue += 1;
      if (o.recordedAt) row.external = true;
      if ((o.placedAt ?? o.createdAt) < row.oldest) row.oldest = o.placedAt ?? o.createdAt;
      if (searched.includes(o)) row.matched = true;
    }
    return [...by.values()].sort((a, b) => a.oldest.localeCompare(b.oldest));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOrder, searched, app.suppliers]);

  const cmp = useMemo(
    () => (a: PendingOrderLine, b: PendingOrderLine) => {
      if (sort === "age") {
        return (a.placedAt ?? a.createdAt).localeCompare(b.placedAt ?? b.createdAt);
      }
      const ra = app.recordFor(a.recordId);
      const rb = app.recordFor(b.recordId);
      return sort === "title"
        ? (ra?.title ?? "").localeCompare(rb?.title ?? "")
        : (ra?.artist ?? "").localeCompare(rb?.artist ?? "");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, app.records],
  );

  const scoped = useMemo(
    () => (scope === "all" ? chipped : chipped.filter((o) => o.poNumber === scope)),
    [chipped, scope],
  );

  // d19 — overdue is a fixed GROUPING and each group is sorted by whatever the
  // current sort is, rather than overdue being a sort mode of its own.
  const { late, rest } = useMemo(
    () => ({
      late: scoped.filter(isFollowUpOverdue).sort(cmp),
      rest: scoped.filter((o) => !isFollowUpOverdue(o)).sort(cmp),
    }),
    [scoped, cmp],
  );

  const selected = selectedId ? onOrder.find((o) => o.id === selectedId) ?? null : null;

  const doScan = (code: string) => {
    const rec = app.records.find((r) => r.manufacturerUpc === code.trim());
    if (rec) {
      setQuery(`${rec.artist} — ${rec.title}`);
      setStatusMsg(`Matched ${rec.artist} — ${rec.title} by UPC.`);
    } else {
      setQuery(code.trim());
      setStatusMsg(`No catalog UPC match for “${code}” — filtering as a keyword instead.`);
    }
    setSelectedId(null);
  };

  const poError =
    draft && draft.dest === "placed" && draft.poNumber.trim() && app.poNumberTaken(draft.poNumber.trim())
      ? `${draft.poNumber.trim()} is already in use — auto-numbering skips it (d16), but whether a collision merges or is refused is undecided.`
      : "";

  const openSheet = () => {
    if (!draft) saveDraft(blankDraft(app.suppliers[0]?.id ?? ""));
    setSheetOpen(true);
  };

  const commit = () => {
    if (!draft) return;
    if (draft.dest === "placed") {
      const res = app.recordPlacedOrder({
        supplierId: draft.supplierId,
        poNumber: draft.poNumber.trim() || undefined,
        placedOn: draft.placedOn,
        followUpDays: draft.followUpDays,
        lines: draft.lines,
      });
      if (!res) return;
      setStatusMsg(
        `${res.lineCount} line${res.lineCount === 1 ? "" : "s"} (${res.unitCount} units) recorded on ${res.poNumber}. Nothing was sent — the order already went out (d25).`,
      );
      setScope(res.poNumber);
    } else {
      for (const l of draft.lines) {
        app.raisePendingOrderLine({
          recordId: l.recordId,
          supplierId: draft.supplierId,
          separator: draft.separator.trim() || undefined,
          qty: l.qty,
          sellPrice: l.sellPrice,
          followUpDays: draft.followUpDays,
        });
      }
      const sup = app.supplierFor(draft.supplierId);
      setStatusMsg(
        `${draft.lines.length} pending line${draft.lines.length === 1 ? "" : "s"} raised against ${sup?.name}${draft.separator.trim() ? `, separator ${draft.separator.trim()}` : ""} — waiting on Order Processing, not on order yet.`,
      );
    }
    saveDraft(null);
    setSheetOpen(false);
    setSelectedId(null);
  };

  const waiting = scoped
    .filter((o) => o.customerId)
    .map((o) => ({
      line: o,
      name: app.customerFor(o.customerId)?.name ?? "A customer",
      late: isFollowUpOverdue(o),
      title: app.recordFor(o.recordId)?.title ?? o.recordId,
    }));

  return (
    <div className={"wo-frame" + (slabOpen ? "" : " slab-shut")}>
      <OrderSlab
        open={slabOpen}
        onOpenChange={saveSlab}
        query={query}
        onQueryChange={(q) => {
          setQuery(q);
          setSelectedId(null);
        }}
        onScan={doScan}
        chip={chip}
        onChipChange={(c) => {
          setChip(c);
          setSelectedId(null);
        }}
        counts={counts}
        sort={sort}
        onSortChange={setSort}
        pos={pos}
        totalLines={searched.length}
        totalOverdue={counts.late}
        scope={scope}
        onScopeChange={(s) => {
          setScope(s);
          setSelectedId(null);
        }}
        onNewBatch={openSheet}
        draftLineCount={sheetOpen ? 0 : (draft?.lines.length ?? 0)}
      />

      {sheetOpen && draft ? (
        <>
          <BulkOrderSheet
            draft={draft}
            onChange={(patch) => saveDraft({ ...draft, ...patch })}
            onLeave={() => setSheetOpen(false)}
            onDiscardAsk={() => (draft.lines.length ? setDiscarding(true) : setSheetOpen(false))}
            onDiscardCancel={() => setDiscarding(false)}
            onDiscard={() => {
              const n = draft.lines.length;
              setDiscarding(false);
              saveDraft(null);
              setSheetOpen(false);
              setStatusMsg(`Batch discarded — ${n} line${n === 1 ? "" : "s"} thrown away.`);
            }}
            poError={poError}
            discarding={discarding}
          />
          <BulkOrderBatch draft={draft} poError={poError} onCommit={commit} />
        </>
      ) : (
        <>
          <section className="wo-main">
            <div className="wo-main-head">
              <div style={{ minWidth: 0 }}>
                <h2>{scope === "all" ? "Everything on order" : scope}</h2>
                <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
                  {scope === "all" ? (
                    <>
                      <span className="badge mono">
                        {scoped.length} line{scoped.length === 1 ? "" : "s"}
                      </span>
                      <span className="badge">
                        {scoped.reduce((n, l) => n + outstandingQty(l, app.invoices), 0)} units
                        outstanding
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="badge ink">
                        {pos.find((p) => p.poNumber === scope)?.supplier?.name ?? "—"}
                      </span>
                      {pos.find((p) => p.poNumber === scope)?.external && (
                        <span className="badge accent">recorded — placed elsewhere</span>
                      )}
                    </>
                  )}
                  {late.length > 0 && (
                    <span className="badge danger">{late.length} overdue</span>
                  )}
                  {chip !== "all" && <span className="badge accent">filtered</span>}
                </div>
              </div>
            </div>

            {statusMsg && (
              <div className="callout ok" style={{ margin: "var(--sp-3) var(--sp-4) 0" }}>
                {statusMsg}
              </div>
            )}

            <div className="wo-list">
              {scoped.length === 0 && (
                <div className="slab-empty" style={{ paddingTop: "var(--sp-6)" }}>
                  Nothing on order matching this.
                </div>
              )}
              {late.length > 0 && (
                <div className="wo-grp late">
                  <span className="lab">Past their follow-up flag</span>
                  <span className="xsmall mono">{late.length}</span>
                </div>
              )}
              {late.map((o) => (
                <LineRow
                  key={o.id}
                  line={o}
                  selected={selectedId === o.id}
                  onSelect={() => setSelectedId(selectedId === o.id ? null : o.id)}
                />
              ))}
              {rest.length > 0 && (
                <div className="wo-grp">
                  <span className="lab">{late.length ? "Still within the flag" : "On order"}</span>
                  <span className="xsmall mono">{rest.length}</span>
                </div>
              )}
              {rest.map((o) => (
                <LineRow
                  key={o.id}
                  line={o}
                  selected={selectedId === o.id}
                  onSelect={() => setSelectedId(selectedId === o.id ? null : o.id)}
                />
              ))}
            </div>
          </section>

          {selected ? (
            <OrderLineTrack
              key={selected.id}
              line={selected}
              supplier={app.supplierFor(selected.supplierId)}
              onStatus={setStatusMsg}
            />
          ) : (
            <OrderScopeTrack
              scope={scope}
              po={pos.find((p) => p.poNumber === scope)}
              rows={scoped}
              waiting={waiting}
              onNewBatch={openSheet}
              onBulkStatus={() =>
                setStatusMsg(
                  `Bulk status update on ${scope} is not built yet — set each line's status from the right-hand track (d12).`,
                )
              }
              onVoid={() =>
                setStatusMsg(
                  `Voiding ${scope} is not built on this screen — it lives in Order Processing (d11, d24).`,
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function LineRow({
  line,
  selected,
  onSelect,
}: {
  line: PendingOrderLine;
  selected: boolean;
  onSelect: () => void;
}) {
  const app = useApp();
  const rec = app.recordFor(line.recordId);
  const sup = app.supplierFor(line.supplierId);
  const cust = app.customerFor(line.customerId);
  const state = orderLineState(line, app.invoices);
  const out = outstandingQty(line, app.invoices);
  const overdue = isFollowUpOverdue(line);
  const due = followUpDueAt(line);

  return (
    <button
      type="button"
      className={"wo-row" + (overdue ? " late" : "") + (selected ? " on" : "")}
      onClick={onSelect}
    >
      <span className="age">
        {daysAgo(line.placedAt ?? line.createdAt)}
        <em>days</em>
      </span>
      <span className="t">{rec ? `${rec.artist} — ${rec.title}` : line.recordId}</span>
      <span className="m">
        {sup?.shortName} · <span className="mono">{line.poNumber}</span>
        {rec?.catalogNo ? ` · ${rec.catalogNo}` : ""}
        {cust && <span className="who"> · {cust.name} waiting</span>}
        {line.expectedDate ? ` · due ${line.expectedDate}` : ""}
      </span>
      <span className="q">
        <span className="v">{out}</span>
        <span className="k">{out !== line.qty ? `of ${line.qty}` : "outst."}</span>
      </span>
      <span className="s">
        <span className={"badge " + tone(state)}>{state}</span>
        {overdue ? (
          <span className="badge danger">
            Overdue {Math.floor((Date.now() - due!) / 86400000)}d
          </span>
        ) : due == null ? (
          <span className="xsmall muted">no flag</span>
        ) : (
          <span className="xsmall muted">
            chase in {Math.ceil((due - Date.now()) / 86400000)}d
          </span>
        )}
      </span>
      <span className="p mono">{money(line.sellPrice)}</span>
    </button>
  );
}

function tone(state: string): string {
  if (state === "Backordered" || state === "Part received") return "warn";
  if (state === "Cancelled") return "danger";
  if (state === "Shipped") return "ok";
  return "";
}
