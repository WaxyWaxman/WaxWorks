import { useEffect, useMemo, useState } from "react";
import { ClaimsSlab, STALE_DAYS, type ClaimChip, type ClaimSort } from "../components/ClaimsSlab";
import { ABANDON_REASONS, VOID_REASONS } from "../data/types";
import type { AbandonReason, SupplierClaim, VoidReason } from "../data/types";
import {
  batchName,
  lineAgainstLabel,
  claimAbsorbed,
  claimCredited,
  claimPhase,
  claimTotal,
  retiredNumbers,
  daysWaiting,
  isSent,
} from "../lib/claims";
import { money } from "../lib/money";
import { useApp } from "../store/AppStore";
import { useActor } from "../components/Identify";

// Supplier Claims on three tracks — E-04 §"Supplier claims", decisions 9-12
// and 20-27. Claiming credit from a supplier for stock that arrived short,
// damaged, or not at all. NOT a customer Return (E-06), which lives at the
// till.
//
// Track 1 chooses a supplier, track 2 shows their claims banded by what the
// store has to do with them, track 3 is whatever act the selection implies.
// The one structure NOT carried over from Payable is its ledger table: a claim
// is a few lines with prose in them — a reason, a note — rather than six money
// columns that have to line up.
export function Claims() {
  const app = useApp();
  const withActor = useActor();
  const today = useMemo(() => new Date(), []);
  const [slabOpen, setSlabOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ClaimChip>("all");
  const [sort, setSort] = useState<ClaimSort>("name");
  const [selId, setSelId] = useState("");
  const [pick, setPick] = useState<string>(""); // the claim or batch the act track is for
  const [act, setAct] = useState<"send" | "credit" | "abandon" | "void">("send");
  const [showClosed, setShowClosed] = useState(false);
  const [msg, setMsg] = useState("");

  const claims = app.claims;
  const voids = app.claimVoids;

  const withClaims = app.suppliers.filter((s) => claims.some((c) => c.supplierId === s.id));
  const supplier = app.suppliers.find((s) => s.id === selId) ?? withClaims[0];
  useEffect(() => {
    if (!selId && withClaims[0]) setSelId(withClaims[0].id);
  }, [selId, withClaims]);

  const mine = claims.filter((c) => c.supplierId === supplier?.id);
  const unsent = mine.filter((c) => claimPhase(c) === "unsent");
  const waiting = mine.filter((c) => claimPhase(c) === "waiting");
  const closed = mine.filter((c) => ["credited", "abandoned"].includes(claimPhase(c)));

  const picked = mine.find((c) => c.id === pick);
  // The act track follows the selection; a selection that goes away takes its
  // act with it rather than leaving a form pointed at nothing.
  useEffect(() => {
    if (!picked) return;
    setAct(isSent(picked) ? (act === "send" ? "credit" : act) : "send");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);
  useEffect(() => {
    setPick("");
    setMsg("");
  }, [selId]);

  const oldest = Math.max(0, ...waiting.map((c) => daysWaiting(c, today) ?? 0));

  return (
    <div className={"claims-frame" + (slabOpen ? "" : " slab-shut")}>
      <ClaimsSlab
        open={slabOpen}
        onOpenChange={setSlabOpen}
        suppliers={app.suppliers}
        claims={claims}
        today={today}
        query={query}
        onQueryChange={setQuery}
        chip={chip}
        onChipChange={setChip}
        sort={sort}
        onSortChange={setSort}
        selectedId={supplier?.id ?? ""}
        onSelect={setSelId}
      />

      <section className="claims-main">
        <div className="claims-main-head">
          <div style={{ minWidth: 0 }}>
            <h2>{supplier?.name ?? "—"}</h2>
            <div className="row wrap" style={{ gap: "var(--sp-2)", marginTop: 6 }}>
              <span className="badge ink">
                {money(unsent.reduce((n, c) => n + claimTotal(c), 0))} unsent
              </span>
              <span className="badge mono">{supplier?.shortName}</span>
              {waiting.length > 0 && (
                <span className={"badge" + (oldest >= STALE_DAYS ? " danger" : "")}>
                  {waiting.length} waiting{oldest > 0 ? ` — ${oldest} days` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {msg && (
          <div className="callout ok" style={{ margin: "var(--sp-3) var(--sp-4) 0" }}>
            {msg}
          </div>
        )}

        <div className="claims-list">
          {mine.length === 0 ? (
            <div className="slab-empty" style={{ paddingTop: "var(--sp-6)" }}>
              Nothing claimed against {supplier?.name}. Claims are raised from a Record's titlecard.
            </div>
          ) : (
            <>
              <Band
                label="Not sent — one batch each"
                say="A raised line lands in the batch for its separator. Sending a batch is what turns it into a numbered claim (d22)."
                total={unsent.reduce((n, c) => n + claimTotal(c), 0)}
              >
                {unsent.length === 0 ? (
                  <div className="claims-quiet">Nothing waiting to go out.</div>
                ) : (
                  unsent.map((c) => (
                    <BatchCard
                      key={c.id}
                      claim={c}
                      retired={retiredNumbers(c, voids)}
                      on={pick === c.id}
                      onPick={() => {
                        setPick(c.id);
                        setAct("send");
                      }}
                    />
                  ))
                )}
                {unsent.length > 1 && (
                  <div className="wo-caveat" style={{ margin: "0 var(--sp-4) var(--sp-4)" }}>
                    <strong>The batch is the unit, not the tick.</strong> These travel separately because they sit under
                    different separators — the same key that batches orders in M-02. Neither has been sent, and that —
                    the absent sent date, never the absent number — is what <em>unsent</em> means (d25).
                  </div>
                )}
              </Band>

              <Band
                label="Sent — awaiting their answer"
                say="Outside the balance until Credited (M-05 d26), so nothing here is money A/P is counting on."
                total={waiting.reduce((n, c) => n + claimTotal(c), 0)}
              >
                {waiting.length === 0 ? (
                  <div className="claims-quiet">Nothing outstanding with them.</div>
                ) : (
                  waiting.map((c) => (
                    <SentCard
                      key={c.id}
                      claim={c}
                      days={daysWaiting(c, today)}
                      on={pick === c.id}
                      onAct={(a) => {
                        setPick(c.id);
                        setAct(a);
                      }}
                    />
                  ))
                )}
              </Band>

              {closed.length > 0 && (
                <Band
                  label="Closed"
                  say="Credited claims are A/P's business now; abandoned and voided ones are nobody's."
                  total={closed
                    .filter((c) => claimPhase(c) === "credited")
                    .reduce((n, c) => n + claimCredited(c), 0)}
                >
                  {!showClosed ? (
                    <div className="claims-quiet">
                      <button className="btn sm ghost" onClick={() => setShowClosed(true)}>
                        Show {closed.length} closed ▾
                      </button>
                      <span className="hint" style={{ margin: 0 }}>
                        Collapsed with a count — M-05 d21's treatment of settled Invoices, for its reason: it grows
                        without bound.
                      </span>
                    </div>
                  ) : (
                    <>
                      {closed.map((c) => (
                        <ClosedCard key={c.id} claim={c} />
                      ))}
                      <div className="claims-quiet">
                        <button className="btn sm ghost" onClick={() => setShowClosed(false)}>
                          Hide ▴
                        </button>
                      </div>
                    </>
                  )}
                </Band>
              )}
            </>
          )}
        </div>
      </section>

      <aside className="claims-act">
        {!picked ? (
          <>
            <div className="claims-act-head">
              <div className="t">Nothing selected</div>
              <div className="s">Pick a batch to send, or a sent claim to close</div>
            </div>
            <div className="claims-act-body">
              <p className="hint" style={{ margin: 0 }}>
                This track follows what track 2 has selected. A batch shows the send; a sent claim shows its three
                endings — <strong>credited</strong>, <strong>abandoned</strong>, <strong>voided</strong>.
              </p>
            </div>
          </>
        ) : act === "send" ? (
          <SendAct
            claim={picked}
            email={supplier?.email ?? ""}
            nextNumber={app.nextClaimNumber}
            onSend={(num) =>
              withActor("Send claim", () => {
              const r = app.sendClaim(picked.id, num);
              if (r) {
                setMsg(`Claim ${r.claimNumber} sent to ${supplier?.email}. The clock starts now (d23).`);
                setPick("");
              }
            })}
          />
        ) : act === "credit" ? (
          <CreditAct
            claim={picked}
            onCredit={(memo, amount) => {
              app.markClaimCredited(picked.id, memo, amount);
              setMsg(`Claim ${picked.claimNumber} credited at ${money(amount)} — now counting against the balance in A/P (M-05 d26).`);
              setPick("");
            }}
          />
        ) : act === "abandon" ? (
          <AbandonAct
            claim={picked}
            onAbandon={(reason, note) => {
              app.abandonClaim(picked.id, reason, note);
              setMsg(`Claim ${picked.claimNumber} abandoned — ${reason}. Stock is untouched.`);
              setPick("");
            }}
          />
        ) : (
          <VoidAct
            claim={picked}
            onVoid={(reason, note) => {
              app.voidClaim(picked.id, reason, note);
              setMsg(
                `Claim ${picked.claimNumber} voided — back in its ${batchName(picked).toLowerCase()} with its lines and separator, ` +
                  `ready to correct and send again. That number is retired (d26, d29).`,
              );
              setPick("");
            }}
          />
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ track 2 */

function Band({
  label,
  say,
  total,
  children,
}: {
  label: string;
  say: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="claims-sec">
      <div className="claims-sec-head">
        <span className="t">{label}</span>
        <span className="say">{say}</span>
        <span className="tot">{money(total)}</span>
      </div>
      {children}
    </div>
  );
}

function Lines({ claim }: { claim: SupplierClaim }) {
  const app = useApp();
  return (
    <table className="claims-ln">
      <thead>
        <tr>
          <th style={{ width: 84 }}>Invoice</th>
          <th style={{ width: 150 }}>Reason</th>
          <th>Record</th>
          <th style={{ width: 44, textAlign: "right" }}>Qty</th>
          <th style={{ width: 74, textAlign: "right" }}>Cost</th>
        </tr>
      </thead>
      <tbody>
        {claim.lines.map((l) => {
          const rec = app.records.find((r) => r.id === l.recordId);
          return (
            <tr key={l.id}>
              <td className={"mono" + (l.against.kind === "none" ? " claims-noinv" : "")}>
                {lineAgainstLabel(l, app.invoices)}
              </td>
              <td>
                <span className="claims-reason">{l.reason}</span>
              </td>
              <td>
                <strong>{rec?.artist ?? "—"}</strong> — {rec?.title ?? ""}
                {l.note && <div className="hint" style={{ margin: 0 }}>{l.note}</div>}
              </td>
              <td style={{ textAlign: "right" }} className="mono">
                {l.qty}
              </td>
              <td style={{ textAlign: "right" }} className="mono">
                {money(l.cost * l.qty)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BatchCard({
  claim,
  retired,
  on,
  onPick,
}: {
  claim: SupplierClaim;
  retired: number[];
  on: boolean;
  onPick: () => void;
}) {
  return (
    <div className={"claims-bucket" + (on ? " on" : "")} onClick={onPick}>
      <div className="claims-bucket-top">
        <span className="nm">
          {batchName(claim)}{" "}
          <span className="sep">{claim.separator ? `separator ${claim.separator}` : "no separator"}</span>
          {/* d29 — a batch that has been out and come back says so, and names
              the numbers it burned. Otherwise a returned claim is
              indistinguishable from one never sent. */}
          {retired.length > 0 && (
            <span className="claims-retired">
              back from {retired.length === 1 ? "claim" : "claims"} {retired.join(", ")} — voided
            </span>
          )}
        </span>
        {on && <span className="badge accent">selected</span>}
        <span className="fig mono">{money(claimTotal(claim))}</span>
      </div>
      <div className="claims-bucket-lines">
        <Lines claim={claim} />
      </div>
    </div>
  );
}

function SentCard({
  claim,
  days,
  on,
  onAct,
}: {
  claim: SupplierClaim;
  days?: number;
  on: boolean;
  onAct: (a: "credit" | "abandon" | "void") => void;
}) {
  return (
    <div className={"claims-card" + (on ? " on" : "")}>
      <div className="claims-card-top">
        <span style={{ minWidth: 0 }}>
          <span className="id">
            Claim <span className="mono">{claim.claimNumber}</span>
            {days !== undefined && (
              <span className={"badge" + (days >= STALE_DAYS ? " danger" : "")}>{days} days waiting</span>
            )}
          </span>
          <span className="meta">
            Sent {claim.sentAt?.slice(0, 10)} · {claim.lines.length} line{claim.lines.length === 1 ? "" : "s"} ·{" "}
            {batchName(claim).toLowerCase()}
          </span>
        </span>
        <span className="fig">
          <span className="mono">{money(claimTotal(claim))}</span>
          <span className="sub">claimed</span>
        </span>
      </div>
      <div className="claims-card-lines">
        <Lines claim={claim} />
        <div className="row" style={{ gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
          <button className="btn sm primary" onClick={() => onAct("credit")}>
            Record their answer
          </button>
          <button className="btn sm" onClick={() => onAct("abandon")}>
            Abandon…
          </button>
          <button className="btn sm" onClick={() => onAct("void")}>
            Void…
          </button>
        </div>
        {days !== undefined && days >= STALE_DAYS && (
          <div className="wo-caveat" style={{ marginTop: "var(--sp-3)" }}>
            <strong>
              {days} days and no answer.
            </strong>{" "}
            There is nothing here to press — E-04 has no chase and no escalation. What it has is the two ways to stop
            waiting, and d23's figure exists so that somebody actually decides between them.
          </div>
        )}
      </div>
    </div>
  );
}

function ClosedCard({ claim }: { claim: SupplierClaim }) {
  const phase = claimPhase(claim);
  const absorbed = claimAbsorbed(claim);
  return (
    <div className="claims-card closed">
      <div className="claims-card-top">
        <span style={{ minWidth: 0 }}>
          <span className="id">
            Claim <span className="mono">{claim.claimNumber ?? "—"}</span>
            <span className={"badge" + (phase === "credited" ? " ok" : "")}>
              {phase === "credited" ? "Credited" : "Abandoned"}
            </span>
          </span>
          <span className="meta">
            {phase === "credited" && `Memo ${claim.creditMemo} · counting in A/P`}
            {phase === "abandoned" && `${claim.abandonment?.reason}${claim.abandonment?.note ? ` · ${claim.abandonment.note}` : ""}`}
          </span>
        </span>
        <span className="fig">
          <span className="mono">
            {phase === "credited" ? money(claimCredited(claim)) : money(0)}
          </span>
          <span className="sub">{phase === "credited" ? "granted" : "nothing owed"}</span>
        </span>
      </div>
      {phase === "credited" && absorbed > 0.005 && (
        <div className="claims-card-lines">
          <div className="claims-delta">
            <div className="fig">
              <span>Absorbed</span>
              <span>{money(absorbed)}</span>
            </div>
            <p>
              Claimed <strong>{money(claimTotal(claim))}</strong>, granted <strong>{money(claimCredited(claim))}</strong>{" "}
              — typically the cost of the return. Both figures are kept: the memo governs what A/P counts, and the claim
              total stays readable as what was asked for (d20).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ track 3 */

function ActShell({
  title,
  sub,
  children,
  foot,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  foot: React.ReactNode;
}) {
  return (
    <>
      <div className="claims-act-head">
        <div className="t">{title}</div>
        <div className="s">{sub}</div>
      </div>
      <div className="claims-act-body">{children}</div>
      <div className="claims-act-foot">{foot}</div>
    </>
  );
}

function SendAct({
  claim,
  email,
  nextNumber,
  onSend,
}: {
  claim: SupplierClaim;
  email: string;
  nextNumber: number;
  onSend: (n: number) => void;
}) {
  const [num, setNum] = useState(String(nextNumber));
  useEffect(() => setNum(String(nextNumber)), [nextNumber, claim.id]);
  const total = claimTotal(claim);
  const app = useApp();

  return (
    <ActShell
      title="Send this batch"
      sub={`${batchName(claim)} · ${claim.lines.length} line${claim.lines.length === 1 ? "" : "s"}`}
      foot={
        <button className="btn primary block" onClick={() => onSend(Number(num) || nextNumber)}>
          Send claim {num} — {money(total)}
        </button>
      }
    >
      <label className="field">
        <span>Claim number</span>
        <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" />
        <span className="hint">
          Next ascending, checked unique (d10). Overwrite it now if a supplier insists on their own reference — after
          sending it is <strong>frozen</strong>, and a wrong one is fixed by voiding rather than editing (d26, d27).
        </span>
      </label>

      <label className="field">
        <span>Email to</span>
        <input value={email} readOnly />
        <span className="hint">The Supplier's one email, which M-01 records as where orders and claims both go.</span>
      </label>

      <div className="claims-mail">
        {`Claim ${num} — Wax Works\n\n`}
        {claim.lines
          .map((l) => {
            const r = app.records.find((x) => x.id === l.recordId);
            return `${l.against.kind === "none" ? "(no invoice)" : `Inv ${lineAgainstLabel(l, app.invoices)}`}  ${l.reason}  ${r?.artist ?? ""} / ${r?.title ?? ""}  ${l.qty} × ${money(l.cost)} = ${money(l.cost * l.qty)}`;
          })
          .join("\n")}
        {`\n\nTotal ${money(total)}`}
      </div>
      <span className="hint">
        Per line: the Invoice it arrived on, the reason code, artist, title, cost and quantity, plus a combined total —
        E-04 step 3, verbatim.
      </span>

      <div className="wo-caveat">
        Sending writes two things: the <strong>number</strong>, and the <strong>sent date</strong> that makes it sent.
        The date is the one anything derives from — the number is ours to quote and nothing reads it as state (d25, d26,
        architecture A-43).
      </div>
    </ActShell>
  );
}

function CreditAct({ claim, onCredit }: { claim: SupplierClaim; onCredit: (memo: string, amount: number) => void }) {
  const total = claimTotal(claim);
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState(total.toFixed(2));
  useEffect(() => {
    setMemo("");
    setAmount(total.toFixed(2));
  }, [claim.id, total]);

  const granted = Number(amount) || 0;
  const absorbed = Math.round((total - granted) * 100) / 100;

  return (
    <ActShell
      title="Record their answer"
      sub={`Claim ${claim.claimNumber} · claimed ${money(total)}`}
      foot={
        <button className="btn primary block" disabled={!memo.trim()} onClick={() => onCredit(memo.trim(), granted)}>
          Mark Credited — {money(granted)}
        </button>
      }
    >
      <label className="field">
        <span>Their credit memo</span>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="CM-2208" />
        <span className="hint">Their reference, not ours. This is the point of truth (d20).</span>
      </label>
      <label className="field">
        <span>Amount it grants</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <span className="hint">Pre-filled with what was claimed. Change it to whatever the memo says.</span>
      </label>

      {Math.abs(absorbed) > 0.005 && (
        <div className={"claims-delta" + (absorbed < 0 ? " over" : "")}>
          <div className="fig">
            <span>{absorbed > 0 ? "Absorbed" : "They granted more"}</span>
            <span>{money(Math.abs(absorbed))}</span>
          </div>
          <p>
            Claimed <strong>{money(total)}</strong>, granted <strong>{money(granted)}</strong>.{" "}
            {absorbed > 0
              ? "A real cost the store is accepting — typically the cost of the return. The claim's own total is recorded alongside the memo's figure rather than overwritten (d20), so it stays visible afterwards."
              : "More than was asked for. The memo still governs — it is the point of truth (d20) — but it is worth checking it is the right memo."}
          </p>
        </div>
      )}

      <div className="wo-caveat">
        Marking this Credited hands it to Accounts Payable: <strong>{money(granted)} counts against the balance</strong>{" "}
        from that moment, attached to an Invoice or not (M-05 d26). Applying it is a separate act that decides what it
        attaches to, not whether it counts.
      </div>
    </ActShell>
  );
}

function AbandonAct({
  claim,
  onAbandon,
}: {
  claim: SupplierClaim;
  onAbandon: (r: AbandonReason, note?: string) => void;
}) {
  const [reason, setReason] = useState<AbandonReason>("No response");
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [claim.id]);
  const needsNote = reason === "Other";

  return (
    <ActShell
      title="Abandon this claim"
      sub={`Claim ${claim.claimNumber} · claimed ${money(claimTotal(claim))}`}
      foot={
        <button
          className="btn block"
          disabled={needsNote && !note.trim()}
          onClick={() => onAbandon(reason, note.trim() || undefined)}
        >
          Abandon claim {claim.claimNumber}
        </button>
      }
    >
      <label className="field">
        <span>Why</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as AbandonReason)}>
          {ABANDON_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="hint">Manager-only, following d3 — writing off money owed is the same standing as a hard on-hand adjustment.</span>
      </label>
      <label className="field">
        <span>Note{needsNote ? " — required" : ""}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </label>

      <div className="claims-dead">
        <div className="fig">
          <span>Written off</span>
          <span>{money(claimTotal(claim))}</span>
        </div>
        <p>
          Nothing is expected from them now. <strong>The stock is unaffected</strong> — it left on hand when the copies
          were adjusted out, and abandoning only stops the store waiting for money (d24).
        </p>
      </div>

      <div className="wo-caveat">
        The claim is <strong>not deleted</strong>. It closes with its reason and keeps its lines, and if a memo turns up
        in three months it can still be marked Credited from there — abandoning is giving up, not forbidding.
      </div>
    </ActShell>
  );
}

function VoidAct({ claim, onVoid }: { claim: SupplierClaim; onVoid: (r: VoidReason, note?: string) => void }) {
  const [reason, setReason] = useState<VoidReason>("Raised against the wrong copy");
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [claim.id]);
  const needsNote = reason === "Other";

  return (
    <ActShell
      title="Void this claim"
      sub={`Claim ${claim.claimNumber} · claimed ${money(claimTotal(claim))}`}
      foot={
        <button
          className="btn block"
          disabled={needsNote && !note.trim()}
          onClick={() => onVoid(reason, note.trim() || undefined)}
        >
          Void claim {claim.claimNumber}
        </button>
      }
    >
      <label className="field">
        <span>Why it was wrong</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as VoidReason)}>
          {VOID_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Note{needsNote ? " — required" : ""}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </label>

      <div className="wo-caveat">
        <strong>Voiding is not abandoning.</strong> Abandon says <em>this claim was right and no money is coming</em>,
        and ends it. Void says <em>this claim was wrong and should never have been sent</em>, and hands it back to you
        to fix. Only abandoning is terminal (d27, d29).
      </div>

      <div className="claims-dead">
        <div className="fig">
          <span>Number {claim.claimNumber}</span>
          <span>retired</span>
        </div>
        <p>
          The claim <strong>returns to its unsent batch</strong> with its lines, notes and separator intact, ready to be
          corrected and sent again under a new number (d29). {claim.claimNumber} is never reused, so the sequence has
          gaps and is not a count of anything (d26). Nothing is lost — a void restores the prior state, the way
          M-05 d22 returns money to a balance rather than deleting what was owed.
        </p>
      </div>
    </ActShell>
  );
}
