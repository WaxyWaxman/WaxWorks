import { useEffect, useMemo, useState } from "react";
import { ManagerAuthorize } from "../components/ManagerAuthorize";
import { Modal } from "../components/Modal";
import { SeparatorSelect } from "../components/SeparatorSelect";
import {
  StreamSlab,
  type PlacedRow,
  type StreamChip,
  type StreamRow,
  type StreamSort,
} from "../components/StreamSlab";
import {
  LineTrack,
  PileTrack,
  PlacedDossier,
  ProcessTrack,
  StreamDossier,
  type WaitingPerson,
} from "../components/StreamTrack";
import type { PendingOrderLine, Supplier } from "../data/types";
import { money } from "../lib/money";
import { isOpenOrderLine, receivedAgainst } from "../lib/orderLines";
import { readStored, writeStored } from "../lib/tillMemory";
import { daysAgo, orderReady, separatorCounts } from "../lib/totals";
import { useApp } from "../store/AppStore";
import { useActor } from "../components/Identify";

// Order Processing (M-02 Phase 2), laid out as the till's three tracks — the
// same frame as Sell, Find, Receive, Customers, Suppliers and What's on Order
// (E-05 d29 by way of E-02 d38, E-07 d17, M-01 d17, M-02 Phase 3). A Manager
// turns Employee-raised pending lines into PurchaseOrders; once placed, a line
// moves to What's on Order.
//
// What used to be two stacked tables and four modals — one of which opened
// two more on top of itself — is now three tracks with faces. Track 2 shows
// step 4's table as rows, or one stream's lines editable in place (step 5's
// View, no longer a modal), or a placed PO. Track 3 shows what that scope
// amounts to and carries the verb on its floor. Highlighting a line swaps
// track 3 to its titlecard, which is what step 5 asked for all along.
//
// Two dialogs survive, and should: voiding a PO and merging two separators
// are both one-way, and both need a plan read before they are agreed to
// (d17, d24).

const SLAB_KEY = "waxworks.orderproc.slab";

/** A pending stream's identity: supplier + separator (d3, d4). */
const streamKey = (supplierId: string, separator: string | undefined) =>
  `${supplierId}::${separator ?? ""}`;

/**
 * Aging threshold for the slab's Aging chip (d34). The chip is recorded; this
 * NUMBER is not — it is a placeholder, and M-02's "aging threshold" open
 * question is where it gets settled. Cheap to get wrong on purpose: d31 says a
 * stream waiting is ordinary, so this is a prompt to glance, never a deadline.
 */
const AGING_DAYS = 14;

function streamMath(lines: PendingOrderLine[], supplier: Supplier) {
  const unitCount = lines.reduce((n, l) => n + l.qty, 0);
  const sellTotal = lines.reduce((n, l) => n + l.sellPrice * l.qty, 0);
  // "Estimated cost | Sell total less the supplier's discount" — step 4's table.
  const estCost = sellTotal * (1 - supplier.discountPct / 100);
  const customerCount = lines.filter((l) => l.customerId).length;
  const oldestAt = lines.length
    ? lines.reduce((min, l) => (l.createdAt < min ? l.createdAt : min), lines[0].createdAt)
    : "";
  const ready = orderReady(supplier, unitCount, sellTotal, estCost);
  return { unitCount, sellTotal, estCost, customerCount, oldestAt, ready };
}

/** How far off the minimum, phrased for a slab caption. */
function shortByLabel(supplier: Supplier, unitCount: number, sellTotal: number, estCost: number) {
  if (supplier.minOrderQty > 0) {
    return `${Math.max(0, supplier.minOrderQty - unitCount)} units short`;
  }
  if (supplier.minOrderAmount > 0) {
    const basis = supplier.minOrderAmountBasis === "Net" ? estCost : sellTotal;
    return `${money(Math.max(0, supplier.minOrderAmount - basis))} short`;
  }
  return "no minimum";
}

// A voided PO keeps the lines already received (d24), so it stays listed — but
// it must not read as live. Derived rather than stored, because the prototype
// has no PurchaseOrder entity: the lines a void left behind carry the stamp.
function voidedPo(lines: PendingOrderLine[]): boolean {
  return lines.some((l) => Boolean(l.poVoidedAt));
}

export function OrderProcessing() {
  const app = useApp();
  const withActor = useActor();

  const [slabOpen, setSlabOpen] = useState(() => readStored(SLAB_KEY, true));
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<StreamChip>("all");
  const [sort, setSort] = useState<StreamSort>("ready");
  const [scope, setScope] = useState("all");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showCost, setShowCost] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [poDraft, setPoDraft] = useState("");

  const [voiding, setVoiding] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PendingOrderLine | null>(null);
  const [lineMerge, setLineMerge] = useState<{
    line: PendingOrderLine;
    next: string | undefined;
  } | null>(null);
  const [streamMerge, setStreamMerge] = useState<{
    stream: StreamRow;
    next: string | undefined;
    targetCount: number;
  } | null>(null);

  const saveSlab = (open: boolean) => {
    setSlabOpen(open);
    writeStored(SLAB_KEY, open);
  };

  const q = query.trim().toLowerCase();

  // A line matches the search by its own title, so searching an artist filters
  // to the streams that contain it — how you answer "is that going on the next
  // order?" without opening every stream to look.
  const lineMatches = (l: PendingOrderLine) => {
    const rec = app.recordFor(l.recordId);
    return [rec?.artist, rec?.title, rec && `${rec.artist} — ${rec.title}`, rec?.catalogNo]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q));
  };
  const supplierMatches = (s?: Supplier) =>
    !!s && (s.name.toLowerCase().includes(q) || s.shortName.toLowerCase().includes(q));

  // ---- Pending streams (step 4) ----
  const allStreams = useMemo(() => {
    const map = new Map<string, StreamRow>();
    for (const line of app.pendingOrders) {
      // A line survives being received now (d21), so existence is no longer
      // the same question as "still waiting to be sent".
      if (line.poNumber || !isOpenOrderLine(line, app.invoices)) continue;
      const supplier = app.supplierFor(line.supplierId);
      if (!supplier) continue;
      const key = streamKey(line.supplierId, line.separator);
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          supplier,
          separator: line.separator,
          lines: [],
          unitCount: 0,
          sellTotal: 0,
          estCost: 0,
          customerCount: 0,
          oldestAt: "",
          ready: false,
          shortBy: "",
          matched: false,
        };
        map.set(key, row);
      }
      row.lines.push(line);
    }
    for (const row of map.values()) {
      Object.assign(row, streamMath(row.lines, row.supplier));
      row.shortBy = shortByLabel(row.supplier, row.unitCount, row.sellTotal, row.estCost);
      row.matched = !q || supplierMatches(row.supplier) || row.lines.some(lineMatches);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.pendingOrders, app.invoices, app.suppliers, app.records, q]);

  const searchedStreams = useMemo(
    () => allStreams.filter((s) => s.matched),
    [allStreams],
  );

  // Chip counts are of what the SEARCH left, not of the current chip —
  // otherwise a chip reading 3 filters to nothing. Same rule Customers uses.
  const counts = useMemo(() => {
    const c: Record<StreamChip, number> = { all: searchedStreams.length, ready: 0, waiting: 0, aging: 0, email: 0 };
    for (const s of searchedStreams) {
      if (s.ready) c.ready += 1;
      if (s.customerCount > 0) c.waiting += 1;
      if (!s.ready && daysAgo(s.oldestAt) >= AGING_DAYS) c.aging += 1;
      if (s.supplier.orderVia === "Email") c.email += 1;
    }
    return c;
  }, [searchedStreams]);

  const chippedStreams = useMemo(() => {
    switch (chip) {
      case "ready":
        return searchedStreams.filter((s) => s.ready);
      case "waiting":
        return searchedStreams.filter((s) => s.customerCount > 0);
      case "aging":
        return searchedStreams.filter((s) => !s.ready && daysAgo(s.oldestAt) >= AGING_DAYS);
      case "email":
        return searchedStreams.filter((s) => s.supplier.orderVia === "Email");
      default:
        return searchedStreams;
    }
  }, [searchedStreams, chip]);

  const sortedStreams = useMemo(() => {
    const rows = [...chippedStreams];
    rows.sort((a, b) => {
      if (sort === "ready") {
        // Sendable first, then the oldest of what is still short — the order
        // a manager works the pile in.
        if (a.ready !== b.ready) return a.ready ? -1 : 1;
        return a.oldestAt.localeCompare(b.oldestAt);
      }
      if (sort === "age") return a.oldestAt.localeCompare(b.oldestAt);
      if (sort === "cost") return b.estCost - a.estCost;
      return (
        a.supplier.name.localeCompare(b.supplier.name) ||
        (a.separator ?? "").localeCompare(b.separator ?? "")
      );
    });
    return rows;
  }, [chippedStreams, sort]);

  // ---- Placed PurchaseOrders (step 4, most recent first) ----
  const placedRows = useMemo(() => {
    const map = new Map<string, PlacedRow>();
    for (const line of app.pendingOrders) {
      // Cancelled lines drop out; received ones stay on their PO, because
      // "what did this PO consist of" is a question about the past.
      if (!line.poNumber || line.status === "Cancelled") continue;
      let row = map.get(line.poNumber);
      if (!row) {
        row = {
          poNumber: line.poNumber,
          supplier: app.supplierFor(line.supplierId),
          separator: line.separator,
          lines: [],
          placedAt: (line.placedAt ?? line.createdAt).slice(0, 10),
          voided: false,
          external: false,
          matched: false,
        };
        map.set(line.poNumber, row);
      }
      row.lines.push(line);
      if (line.recordedAt) row.external = true;
    }
    for (const row of map.values()) {
      row.voided = voidedPo(row.lines);
      row.matched =
        !q ||
        supplierMatches(row.supplier) ||
        row.poNumber.toLowerCase().includes(q) ||
        row.lines.some(lineMatches);
    }
    return [...map.values()]
      .filter((r) => r.matched)
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.pendingOrders, app.invoices, app.suppliers, app.records, q]);

  // ---- What the scope resolves to ----
  const scopedStream = scope.startsWith("po:")
    ? undefined
    : allStreams.find((s) => s.key === scope);
  const scopedPo = scope.startsWith("po:")
    ? placedRows.find((p) => p.poNumber === scope.slice(3))
    : undefined;

  // A stream emptied by a delete, a merge or a placement stops existing, so
  // the scope falls back rather than leaving the middle track blank.
  useEffect(() => {
    if (scope === "all") return;
    if (scope.startsWith("po:")) {
      if (!placedRows.some((p) => p.poNumber === scope.slice(3))) setScope("all");
      return;
    }
    if (!allStreams.some((s) => s.key === scope)) {
      setScope("all");
      setProcessing(false);
    }
  }, [scope, allStreams, placedRows]);

  const selectedLine =
    selectedLineId && scopedStream
      ? scopedStream.lines.find((l) => l.id === selectedLineId) ?? null
      : null;

  // Clear a highlight that no longer points at anything.
  useEffect(() => {
    if (selectedLineId && !selectedLine) setSelectedLineId(null);
  }, [selectedLineId, selectedLine]);

  const waitingFor = (lines: PendingOrderLine[]): WaitingPerson[] =>
    lines
      .filter((l) => l.customerId)
      .map((l) => ({
        id: l.id,
        name: app.customerFor(l.customerId)?.name ?? "A customer",
        title: app.recordFor(l.recordId)?.title ?? l.recordId,
      }));

  const poTrimmed = poDraft.trim();
  const poTaken = poTrimmed !== "" && app.poNumberTaken(poTrimmed);
  const nextPo = String(app.nextPoNumber);

  const scopeTo = (next: string) => {
    setScope(next);
    setSelectedLineId(null);
    setProcessing(false);
    setStatusMsg(null);
  };

  // Tier 2 (d5). Committing money to a supplier (M-02).
  const commitProcess = () =>
    withActor("Process orders", () => {
    if (!scopedStream) return;
    const res = app.processOrderStream(
      scopedStream.supplier.id,
      scopedStream.separator,
      poTrimmed || undefined,
    );
    if (!res) return;
    setProcessing(false);
    setPoDraft("");
    setSelectedLineId(null);
    setScope(`po:${res.poNumber}`);
    setStatusMsg(
      res.emailed
        ? `PO ${res.poNumber} emailed to ${scopedStream.supplier.email} — ${res.lineCount} line${res.lineCount === 1 ? "" : "s"}, ${res.unitCount} units.`
        : `PO ${res.poNumber} marked placed via ${scopedStream.supplier.orderVia} — a printable order document was produced; a person still has to send it.`,
    );
  });;

  // Same merge-on-conflict rule as retargeting one line (d17), applied to a
  // whole stream at once.
  const askStreamSeparator = (stream: StreamRow, nextRaw: string | undefined) => {
    const nextKey = nextRaw ?? "";
    if (nextKey === (stream.separator ?? "")) return;
    const existing =
      separatorCounts(app.pendingOrders, stream.supplier.id, app.invoices).get(nextKey) ?? 0;
    if (existing > 0) {
      setStreamMerge({ stream, next: nextRaw, targetCount: existing });
      return;
    }
    const res = app.retargetStreamSeparator(stream.supplier.id, stream.separator, nextRaw);
    if (res) {
      setScope(streamKey(stream.supplier.id, nextRaw));
      setStatusMsg(
        `Moved ${res.movedCount} line${res.movedCount === 1 ? "" : "s"} to ${nextRaw ? `separator ${nextRaw}` : "the no-separator pile"} for ${stream.supplier.name}.`,
      );
    }
  };

  const askLineSeparator = (line: PendingOrderLine, nextRaw: string | undefined) => {
    const nextKey = nextRaw ?? "";
    if (nextKey === (line.separator ?? "")) return;
    const existing =
      separatorCounts(app.pendingOrders, line.supplierId, app.invoices).get(nextKey) ?? 0;
    if (existing > 0) {
      setLineMerge({ line, next: nextRaw });
      return;
    }
    app.updatePendingOrderLine(line.id, { separator: nextRaw });
    setStatusMsg(`Moved to a new stream (sep ${nextRaw ?? "none"}) — nothing else there yet.`);
  };

  const knownSeparators = (supplierId: string) =>
    [...separatorCounts(app.pendingOrders, supplierId, app.invoices).keys()]
      .filter((k) => k !== "")
      .sort();

  const totalPendingLines = allStreams.reduce((n, s) => n + s.lines.length, 0);

  return (
    <div className={"op-frame" + (slabOpen ? "" : " slab-shut")}>
      <StreamSlab
        open={slabOpen}
        onOpenChange={saveSlab}
        query={query}
        onQueryChange={(v) => {
          setQuery(v);
          setSelectedLineId(null);
        }}
        chip={chip}
        onChipChange={(c) => setChip(c)}
        counts={counts}
        sort={sort}
        onSortChange={setSort}
        streams={sortedStreams}
        placed={placedRows}
        totalLines={totalPendingLines}
        totalReady={allStreams.filter((s) => s.ready).length}
        scope={scope}
        onScopeChange={scopeTo}
      />

      {/* ---------------- Track 2 ---------------- */}
      <section className="op-main">
        {processing && scopedStream ? (
          <ProcessFace stream={scopedStream} onBack={() => setProcessing(false)} />
        ) : scopedPo ? (
          <PlacedFace row={scopedPo} statusMsg={statusMsg} />
        ) : scopedStream ? (
          <StreamFace
            stream={scopedStream}
            statusMsg={statusMsg}
            selectedId={selectedLineId}
            onSelect={(id) => setSelectedLineId(selectedLineId === id ? null : id)}
            onQty={(l, qty) => app.updatePendingOrderLine(l.id, { qty })}
            onPrice={(l, sellPrice) => app.updatePendingOrderLine(l.id, { sellPrice })}
            onSeparator={askLineSeparator}
            onStreamSeparator={askStreamSeparator}
            onDelete={setDeleteTarget}
            knownSeparators={knownSeparators(scopedStream.supplier.id)}
          />
        ) : (
          <PileFace
            streams={sortedStreams}
            allCount={allStreams.length}
            statusMsg={statusMsg}
            chip={chip}
            onPick={scopeTo}
          />
        )}
      </section>

      {/* ---------------- Track 3 ---------------- */}
      {processing && scopedStream ? (
        <ProcessTrack
          stream={scopedStream}
          poNumber={poDraft}
          onPoNumberChange={setPoDraft}
          poTaken={poTaken}
          nextPo={nextPo}
          onSend={commitProcess}
          onCancel={() => setProcessing(false)}
        />
      ) : scopedPo ? (
        <PlacedDossier
          row={scopedPo}
          waiting={waitingFor(scopedPo.lines)}
          onVoid={() => setVoiding(scopedPo.poNumber)}
        />
      ) : scopedStream && selectedLine ? (
        <LineTrack
          key={selectedLine.id}
          line={selectedLine}
          stream={scopedStream}
          showCost={showCost}
          onToggleShowCost={() => setShowCost((v) => !v)}
          onBack={() => setSelectedLineId(null)}
        />
      ) : scopedStream ? (
        <StreamDossier
          stream={scopedStream}
          waiting={waitingFor(scopedStream.lines)}
          poNumber={poDraft}
          onPoNumberChange={setPoDraft}
          poTaken={poTaken}
          nextPo={nextPo}
          onProcess={() => setProcessing(true)}
        />
      ) : (
        <PileTrack
          streams={sortedStreams}
          waiting={waitingFor(sortedStreams.flatMap((s) => s.lines))}
        />
      )}

      {/* ---------------- The two dialogs that survive ---------------- */}
      {voiding && (
        <VoidPoModal
          poNumber={voiding}
          onClose={() => setVoiding(null)}
          onDone={(msg) => {
            setStatusMsg(msg);
            setScope("all");
          }}
        />
      )}

      {streamMerge && (
        <Modal
          title="Merge streams?"
          onClose={() => setStreamMerge(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setStreamMerge(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const res = app.retargetStreamSeparator(
                    streamMerge.stream.supplier.id,
                    streamMerge.stream.separator,
                    streamMerge.next,
                  );
                  const target = streamKey(streamMerge.stream.supplier.id, streamMerge.next);
                  setStreamMerge(null);
                  if (res) {
                    setScope(target);
                    setStatusMsg(
                      `Merged ${res.movedCount} line${res.movedCount === 1 ? "" : "s"} into ${streamMerge.next ? `separator ${streamMerge.next}` : "the no-separator pile"} for ${streamMerge.stream.supplier.name}.`,
                    );
                  }
                }}
              >
                Merge
              </button>
            </>
          }
        >
          <div className="callout danger">
            {streamMerge.next ? `Separator ${streamMerge.next}` : "The no-separator pile"} already
            has {streamMerge.targetCount} pending line
            {streamMerge.targetCount === 1 ? "" : "s"} for {streamMerge.stream.supplier.name}. Moving
            these {streamMerge.stream.lines.length} line
            {streamMerge.stream.lines.length === 1 ? "" : "s"} there merges the two streams —{" "}
            <strong>this can't be undone.</strong>
          </div>
        </Modal>
      )}

      {lineMerge && (
        <Modal
          title="Merge into existing stream?"
          onClose={() => setLineMerge(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setLineMerge(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  app.updatePendingOrderLine(lineMerge.line.id, { separator: lineMerge.next });
                  setStatusMsg(
                    `Merged into ${lineMerge.next ? `separator ${lineMerge.next}` : "the no-separator pile"}.`,
                  );
                  setLineMerge(null);
                }}
              >
                Merge
              </button>
            </>
          }
        >
          <div className="callout danger">
            {lineMerge.next ? `Separator ${lineMerge.next}` : "The no-separator pile"} already has
            pending lines for this supplier. Moving this line there merges it into that stream —{" "}
            <strong>this can't be undone.</strong>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete pending order line?"
          onClose={() => setDeleteTarget(null)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const rec = app.recordFor(deleteTarget.recordId);
                  const res = app.deletePendingOrderLine(deleteTarget.id);
                  setDeleteTarget(null);
                  if (res) {
                    setStatusMsg(
                      `Deleted ${rec ? `${rec.artist} — ${rec.title}` : "the line"} from the order.`,
                    );
                  }
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <div className="callout danger">
            Removes {deleteTarget.qty}×{" "}
            {app.recordFor(deleteTarget.recordId)?.title ?? deleteTarget.recordId} from this order —
            a plain confirmation, per decision 9.
            {deleteTarget.customerId && (
              <>
                {" "}
                <strong>
                  {app.customerFor(deleteTarget.customerId)?.name ?? "A customer"} is attached to
                  this line — they'll need to be told.
                </strong>{" "}
                If they have simply cancelled and the copy is still wanted, detach rather than delete
                (d32).
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Track 2, face A: every pending stream ----------------
function PileFace({
  streams,
  allCount,
  statusMsg,
  chip,
  onPick,
}: {
  streams: StreamRow[];
  allCount: number;
  statusMsg: string | null;
  chip: StreamChip;
  onPick: (key: string) => void;
}) {
  const ready = streams.filter((s) => s.ready);
  const short = streams.filter((s) => !s.ready);
  const lines = streams.reduce((n, s) => n + s.lines.length, 0);
  const units = streams.reduce((n, s) => n + s.unitCount, 0);
  const waiting = streams.reduce((n, s) => n + s.customerCount, 0);

  return (
    <>
      <div className="op-main-head">
        <div style={{ minWidth: 0 }}>
          <h2>Everything pending</h2>
          <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
            <span className="badge mono">
              {lines} line{lines === 1 ? "" : "s"}
            </span>
            <span className="badge">{units} units</span>
            {ready.length > 0 && (
              <span className="badge ok">
                {ready.length} stream{ready.length === 1 ? "" : "s"} ready
              </span>
            )}
            {waiting > 0 && <span className="badge accent">{waiting} waiting on a customer</span>}
            {chip !== "all" && <span className="badge accent">filtered</span>}
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="callout ok" style={{ margin: "var(--sp-3) var(--sp-4) 0" }}>
          {statusMsg}
        </div>
      )}

      <div className="op-list">
        {streams.length === 0 && (
          <div className="slab-empty" style={{ paddingTop: "var(--sp-6)" }}>
            {allCount === 0
              ? "Nothing is waiting to be sent."
              : "No pending stream matches this filter."}
          </div>
        )}

        {ready.length > 0 && (
          <div className="op-grp">
            <span className="lab">Over the supplier's minimum</span>
            <span className="xsmall mono">{ready.length}</span>
          </div>
        )}
        {ready.map((s) => (
          <StreamRowButton key={s.key} stream={s} onPick={onPick} />
        ))}

        {short.length > 0 && (
          <div className="op-grp">
            <span className="lab">{ready.length ? "Still short" : "Under the minimum"}</span>
            <span className="xsmall mono">{short.length}</span>
          </div>
        )}
        {short.map((s) => (
          <StreamRowButton key={s.key} stream={s} onPick={onPick} />
        ))}
      </div>
    </>
  );
}

function StreamRowButton({ stream, onPick }: { stream: StreamRow; onPick: (key: string) => void }) {
  const qtyBased = stream.supplier.minOrderQty > 0;
  const amountBased = !qtyBased && stream.supplier.minOrderAmount > 0;
  const basis =
    stream.supplier.minOrderAmountBasis === "Net" ? stream.estCost : stream.sellTotal;

  return (
    <button type="button" className="op-row" onClick={() => onPick(stream.key)}>
      <span className="age">
        {daysAgo(stream.oldestAt)}
        <em>days</em>
      </span>
      <span className="t">
        <span className="nm">{stream.supplier.name}</span>
        {stream.separator && <span className="badge">sep {stream.separator}</span>}
      </span>
      <span className="m">
        {stream.supplier.orderVia} · {stream.lines.length} line
        {stream.lines.length === 1 ? "" : "s"} · {stream.unitCount} unit
        {stream.unitCount === 1 ? "" : "s"}
        {stream.customerCount > 0 && (
          <span className="who"> · {stream.customerCount} waiting</span>
        )}
      </span>
      <span className="q">
        <span className="v">{amountBased ? money(basis) : stream.unitCount}</span>
        <span className="k">
          {qtyBased
            ? `of ${stream.supplier.minOrderQty} min`
            : amountBased
              ? `of ${money(stream.supplier.minOrderAmount)} ${stream.supplier.minOrderAmountBasis.toLowerCase()}`
              : "no minimum"}
        </span>
      </span>
      <span className="s">
        {stream.ready ? (
          <span className="badge ok">Ready</span>
        ) : (
          <span className="badge warn">{stream.shortBy}</span>
        )}
      </span>
      <span className="p">
        {money(stream.estCost)}
        <em>est. cost</em>
      </span>
    </button>
  );
}

// ---------------- Track 2, face B: one stream's lines (step 5) ----------------
function StreamFace({
  stream,
  statusMsg,
  selectedId,
  onSelect,
  onQty,
  onPrice,
  onSeparator,
  onStreamSeparator,
  onDelete,
  knownSeparators,
}: {
  stream: StreamRow;
  statusMsg: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onQty: (line: PendingOrderLine, qty: number) => void;
  onPrice: (line: PendingOrderLine, price: number) => void;
  onSeparator: (line: PendingOrderLine, next: string | undefined) => void;
  onStreamSeparator: (stream: StreamRow, next: string | undefined) => void;
  onDelete: (line: PendingOrderLine) => void;
  knownSeparators: string[];
}) {
  const app = useApp();
  const lines = [...stream.lines].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <div className="op-main-head">
        <div style={{ minWidth: 0 }}>
          <h2>{stream.supplier.name}</h2>
          <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
            {stream.separator ? (
              <span className="badge ink">separator {stream.separator}</span>
            ) : (
              <span className="badge">no separator</span>
            )}
            <span className="badge mono">
              {stream.lines.length} line{stream.lines.length === 1 ? "" : "s"} · {stream.unitCount}{" "}
              units
            </span>
            {stream.ready ? (
              <span className="badge ok">Ready</span>
            ) : (
              <span className="badge warn">{stream.shortBy}</span>
            )}
            {stream.customerCount > 0 && (
              <span className="badge accent">{stream.customerCount} waiting</span>
            )}
          </div>
        </div>
        <div className="op-head-acts">
          <span className="lab">Move stream to</span>
          <SeparatorSelect
            value={stream.separator ?? ""}
            knownSeparators={knownSeparators}
            onChange={(next) => onStreamSeparator(stream, next)}
          />
        </div>
      </div>

      {statusMsg && (
        <div className="callout ok" style={{ margin: "var(--sp-3) var(--sp-4) 0" }}>
          {statusMsg}
        </div>
      )}

      <div className="op-list">
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Sell</th>
              <th>Sep</th>
              <th className="num">Age</th>
              <th>Customer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rec = app.recordFor(l.recordId);
              const cust = app.customerFor(l.customerId);
              const twin = stream.lines.some(
                (o) => o.recordId === l.recordId && o.id !== l.id,
              );
              return (
                <tr
                  key={l.id}
                  className={"row-click" + (l.id === selectedId ? " selected" : "")}
                  onClick={() => onSelect(l.id)}
                >
                  <td>
                    {rec ? `${rec.artist} — ${rec.title}` : l.recordId}{" "}
                    <span className="xsmall muted mono">{rec?.catalogNo}</span>
                    {/* Two lines for one title is deliberate, not a fault
                        (step 3, d32) — so it is noted, never flagged. */}
                    {twin && <span className="xsmall muted"> · also on another line</span>}
                  </td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="inline-num"
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => onQty(l, Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 56 }}
                    />
                  </td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="inline-num"
                      type="number"
                      step="0.01"
                      min={0}
                      value={l.sellPrice}
                      onChange={(e) => onPrice(l, Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 72 }}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <SeparatorSelect
                      value={l.separator ?? ""}
                      knownSeparators={knownSeparators}
                      onChange={(next) => onSeparator(l, next)}
                    />
                  </td>
                  <td className="num">{daysAgo(l.createdAt)}d</td>
                  <td className="small">{cust ? cust.name : "—"}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm danger" onClick={() => onDelete(l)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="small muted">
                  No lines left in this stream.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="op-caveat" style={{ margin: "var(--sp-3) var(--sp-4)" }}>
          Highlight a line to open its titlecard in the right-hand track — step 5's reason for View,
          so a wrong supplier is caught before the order goes out.
        </div>
      </div>
    </>
  );
}

// ---------------- Track 2, face C: a placed PurchaseOrder ----------------
function PlacedFace({ row, statusMsg }: { row: PlacedRow; statusMsg: string | null }) {
  const app = useApp();

  return (
    <>
      <div className="op-main-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="mono">{row.poNumber}</h2>
          <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
            <span className="badge ink">{row.supplier?.name ?? "—"}</span>
            <span className="badge">placed {row.placedAt}</span>
            <span className="badge mono">
              {row.lines.length} line{row.lines.length === 1 ? "" : "s"}
            </span>
            {row.external && <span className="badge accent">recorded — placed elsewhere</span>}
            {row.voided && <span className="badge danger">voided</span>}
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="callout ok" style={{ margin: "var(--sp-3) var(--sp-4) 0" }}>
          {statusMsg}
        </div>
      )}

      <div className="op-list">
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Rec'd</th>
              <th className="num">Sell</th>
              <th>Customer</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {row.lines.map((l) => {
              const rec = app.recordFor(l.recordId);
              const cust = app.customerFor(l.customerId);
              const got = receivedAgainst(l.id, app.invoices);
              return (
                <tr key={l.id}>
                  <td>
                    {rec ? `${rec.artist} — ${rec.title}` : l.recordId}{" "}
                    <span className="xsmall muted mono">{rec?.catalogNo}</span>
                  </td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{got}</td>
                  <td className="num mono">{money(l.sellPrice)}</td>
                  <td className="small">{cust ? cust.name : "—"}</td>
                  <td>
                    <span
                      className={
                        "badge" +
                        (got >= l.qty ? " ok" : got > 0 || l.status === "Backordered" ? " warn" : "")
                      }
                    >
                      {got >= l.qty
                        ? "Received"
                        : got > 0
                          ? "Part received"
                          : (l.status ?? "Ordered")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="op-caveat" style={{ margin: "var(--sp-3) var(--sp-4)" }}>
          Read-only. A placed line is never deleted — it is Cancelled, or it is received (d21), and
          what is outstanding is counted across every Invoice (d15, E-02 d30).
        </div>
      </div>
    </>
  );
}

// ---------------- Track 2, face D: the order about to go out (step 6) ----------------
function ProcessFace({ stream, onBack }: { stream: StreamRow; onBack: () => void }) {
  const app = useApp();
  const emailed = stream.supplier.orderVia === "Email";
  const cancelBy = stream.supplier.cancelByDays
    ? new Date(Date.now() + stream.supplier.cancelByDays * 86400000).toLocaleDateString("en-CA")
    : undefined;

  return (
    <>
      <div className="op-main-head entry">
        <div style={{ minWidth: 0 }}>
          <h2>
            {emailed ? "Send to " : "Order document for "}
            {stream.supplier.name}
          </h2>
          <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
            {stream.separator && <span className="badge ink">separator {stream.separator}</span>}
            <span className="badge accent">
              {stream.supplier.orderVia}
              {emailed && stream.supplier.email ? ` · ${stream.supplier.email}` : ""}
            </span>
            <span className="badge mono">
              {stream.lines.length} line{stream.lines.length === 1 ? "" : "s"} · {stream.unitCount}{" "}
              units
            </span>
          </div>
        </div>
        <div className="op-head-acts">
          <button className="btn ghost" onClick={onBack}>
            Back to the stream
          </button>
        </div>
      </div>

      <div className="op-scroll">
        <div className="callout">
          <strong>This is what will be sent.</strong> Email orders are composed and sent by the
          system; every other method produces a printable document and is marked placed by hand
          (step 6, d6).
        </div>

        <div style={{ border: "1px solid var(--c-ink)", background: "var(--c-surface-2)" }}>
          <div
            className="lab"
            style={{
              padding: "var(--sp-2) var(--sp-3)",
              borderBottom: "1px solid var(--c-border-strong)",
            }}
          >
            {emailed ? "Email preview" : "Order document"}
          </div>
          <div className="stack" style={{ padding: "var(--sp-3)" }}>
            <div>
              <div className="totals-row">
                <span>{emailed ? "To" : "Supplier"}</span>
                <span className="mono">
                  {emailed ? stream.supplier.email : stream.supplier.name}
                </span>
              </div>
              {stream.supplier.accountNumber && (
                <div className="totals-row">
                  <span>Account</span>
                  <span className="mono">{stream.supplier.accountNumber}</span>
                </div>
              )}
              <div className="totals-row">
                <span>Cancel by</span>
                <span>
                  {cancelBy ?? "— no default configured for this supplier"}
                  {cancelBy && (
                    <span className="xsmall muted"> ({stream.supplier.cancelByDays} days)</span>
                  )}
                </span>
              </div>
              <div className="totals-row">
                <span>Backorders</span>
                <span>{stream.supplier.backordersAllowed ? "Allowed" : "Not allowed"}</span>
              </div>
            </div>

            <table className="data">
              <thead>
                <tr>
                  <th className="num">Qty</th>
                  <th>Item</th>
                  <th>Cat no.</th>
                  <th className="num">Sell</th>
                </tr>
              </thead>
              <tbody>
                {stream.lines.map((l) => {
                  const rec = app.recordFor(l.recordId);
                  const cust = app.customerFor(l.customerId);
                  return (
                    <tr key={l.id}>
                      <td className="num mono">{l.qty}</td>
                      <td>
                        {rec ? `${rec.artist} — ${rec.title}` : l.recordId}
                        {cust && <span className="xsmall muted"> · for {cust.name}</span>}
                      </td>
                      <td className="mono xsmall">{rec?.catalogNo}</td>
                      <td className="num mono">{money(l.sellPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {stream.customerCount > 0 && (
          <div className="callout warn">
            {stream.customerCount} line{stream.customerCount === 1 ? " is" : "s are"} attached to a
            customer. Receiving one creates a Held Sale for them automatically (d13) — nothing to do
            now, but that is who gets phoned if this order comes up short.
          </div>
        )}
      </div>
    </>
  );
}

// ---------------- Voiding, which stays a dialog ----------------
//
// Voiding reverses OUR paperwork and nothing else (d10) — so the dialog leads
// with that, then says line by line what it is about to do, because d24 makes
// the answer different for each one depending on how much arrived.
function VoidPoModal({
  poNumber,
  onClose,
  onDone,
}: {
  poNumber: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const app = useApp();
  const [authorising, setAuthorising] = useState(false);

  const lines = app.pendingOrders.filter((o) => o.poNumber === poNumber);
  const plan = lines.map((o) => {
    const received = receivedAgainst(o.id, app.invoices);
    const rec = app.recordFor(o.recordId);
    return {
      id: o.id,
      title: rec ? `${rec.artist} — ${rec.title}` : o.recordId,
      qty: o.qty,
      received,
      customer: o.customerId ? app.customerFor(o.customerId)?.name : undefined,
      fate:
        received >= o.qty
          ? ("untouched" as const)
          : received === 0
            ? ("returned" as const)
            : ("split" as const),
    };
  });
  const counts = {
    returned: plan.filter((l) => l.fate === "returned").length,
    split: plan.filter((l) => l.fate === "split").length,
    untouched: plan.filter((l) => l.fate === "untouched").length,
  };
  const attached = plan.filter((l) => l.customer && l.fate !== "untouched");

  const doVoid = (by: string) => {
    const res = app.voidPurchaseOrder(poNumber, by);
    const parts = [
      res.returned ? `${res.returned} returned to pending` : "",
      res.split ? `${res.split} part-received, remainder returned` : "",
      res.untouched ? `${res.untouched} already received and left alone` : "",
    ].filter(Boolean);
    onDone(`${poNumber} voided — ${parts.join(", ")}. The supplier has not been told.`);
    setAuthorising(false);
    onClose();
  };

  if (authorising) {
    return (
      <ManagerAuthorize
        reason={`Void ${poNumber} — ${counts.returned + counts.split} line${counts.returned + counts.split === 1 ? "" : "s"} affected`}
        onConfirm={doVoid}
        onCancel={() => setAuthorising(false)}
      />
    );
  }

  return (
    <Modal
      title={`Void ${poNumber}?`}
      wide
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={counts.returned + counts.split === 0}
            onClick={() => setAuthorising(true)}
          >
            Void this PO
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="callout">
          <strong>This does not cancel anything with the supplier.</strong> It reverses our own
          paperwork only — a person still has to contact them (decision 10).
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>Line</th>
              <th className="num">Ordered</th>
              <th className="num">Received</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.title}
                  {l.customer && (
                    <span className="badge warn" style={{ marginLeft: 6 }}>
                      for {l.customer}
                    </span>
                  )}
                </td>
                <td className="num">{l.qty}</td>
                <td className="num">{l.received}</td>
                <td className="small">
                  {l.fate === "returned" && "Returns to pending, whole"}
                  {l.fate === "split" && (
                    <>
                      Keeps the {l.received} received; <strong>{l.qty - l.received}</strong> returns
                      to pending as a new line <em>(decision 24)</em>
                    </>
                  )}
                  {l.fate === "untouched" && (
                    <span className="muted">Already received — untouched</span>
                  )}
                </td>
              </tr>
            ))}
            {plan.length === 0 && (
              <tr>
                <td colSpan={4} className="small muted">
                  Nothing left on this PO to void.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {attached.length > 0 && (
          <div className="callout warn">
            {attached.length} line{attached.length === 1 ? "" : "s"} on this PO{" "}
            {attached.length === 1 ? "is" : "are"} attached to a customer. The line goes back to
            pending with the attachment intact, but somebody will need to be told the order was
            reversed (decision 9).
          </div>
        )}
      </div>
    </Modal>
  );
}
