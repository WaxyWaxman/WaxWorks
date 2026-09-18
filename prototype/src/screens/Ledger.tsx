import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store/AppStore";
import { ManagerAuthorize } from "../components/ManagerAuthorize";
import { accountType } from "../lib/chart";
import {
  fiscalYearEndFor,
  isYearEnd,
  markFiledRefusal,
  mostRecentlySealed,
  oldestUnsealed,
  periodOf,
  sealRefusal,
  sealReport,
  sealedPeriods,
  unsealRefusal,
} from "../lib/ledgerPeriods";
import {
  exceptionReport,
  offerableAccounts,
  OVERRIDABLE_ROLES,
  postingBalance,
  postingRefusals,
  type PostingContext,
  type PostingOverride,
  type TypedPostingLine,
} from "../lib/ledgerPostings";
import {
  equityReadBack,
  openableAccounts,
  openingBalance,
  openingDateOf,
  openingSealRefusal,
  openingUnsealRefusal,
  type OpeningPositionDraft,
} from "../lib/ledgerOpeningPosition";
import { accountEnquiry } from "../lib/ledgerBalances";
import {
  balanceSheet,
  exportLines,
  exportOverlaps,
  isProvisional,
  issueBalanceSheet,
  issueExport,
  issueProfitAndLoss,
  profitAndLoss,
  reopenIssuance,
  type LedgerIssuance,
} from "../lib/ledgerStatements";
import {
  markedTotal,
  reconcile,
  reconciliationRefusal,
  unreconciled,
  type ReconcilableEntry,
  type ReconciliationKind,
} from "../lib/ledgerReconciliation";

/**
 * M-08 — Keep the general ledger.
 *
 * The books. M-07 owns the **chart** and the journals artifacts write for
 * themselves; this screen owns everything that turns those into a set of books
 * — an opening position, postings a Manager types, a seal, balances,
 * statements and reconciliation. *"M-07 records what happened; M-08 says what
 * it means."*
 *
 * **Every rule on this screen lives in `lib/ledger*.ts` and none of it lives
 * here.** A-74 moves M-08's invariants into the definer function on A-4 and
 * A-48's terms — *a bound enforced in the client is not a bound* — so what this
 * file does is collect input, call a `*Refusal()`, and render what comes back.
 * A rule written in this file would be a rule the tests cannot see.
 *
 * d4 — the word is **seal**, never *close*. *Close* is the end of the day
 * (M-03), and d4's accepted consequence is that every screen has to teach the
 * difference.
 */

const MANAGER_REASON =
  "Every act in the general ledger is manager-only (architecture A-74). A-28a's list named no ledger act, and M-04 d2 makes anything unlisted an Employee action — so read literally, an Employee could type a journal posting and seal a period. There is no state that makes typing into the general ledger harmless.";

type Phase = "opening" | "post" | "seal" | "read" | "reconcile";

const PHASES: { key: Phase; label: string; sub: string }[] = [
  { key: "opening", label: "Opening position", sub: "Phase 1 — once, at migration" },
  { key: "post", label: "Postings", sub: "Phase 2 — what a Manager types" },
  { key: "seal", label: "Seal a period", sub: "Phase 3 — never *close*" },
  { key: "read", label: "Read the books", sub: "Phase 4 — balances and statements" },
  { key: "reconcile", label: "Reconcile", sub: "Phase 4 — evidence, never a gate" },
];

const money = (n: number) =>
  n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

export function Ledger() {
  const app = useApp();
  const nav = useNavigate();
  const [authorisedBy, setAuthorisedBy] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("opening");

  if (!authorisedBy)
    return (
      <ManagerAuthorize
        title="The general ledger — manager only"
        reason={MANAGER_REASON}
        onConfirm={setAuthorisedBy}
        onCancel={() => nav(-1)}
      />
    );

  const sealed = sealedPeriods(app.ledgerSeals, app.ledgerUnseals);

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Keep the general ledger</h1>
        <p className="small muted">
          Authorised by {authorisedBy} ·{" "}
          {app.ledgerOpeningSealed ? (
            <>
              books open from <strong>{app.ledgerOpening?.firstDay}</strong>
            </>
          ) : (
            <strong>no opening position yet</strong>
          )}{" "}
          · <strong>{sealed.length}</strong> sealed period{sealed.length === 1 ? "" : "s"}
        </p>
        <p className="small muted">
          M-07 holds the <strong>chart</strong> and the journals each artifact writes for itself. This flow holds the{" "}
          <strong>books</strong>: what those journals mean. A period is <strong>sealed</strong>, never closed — <em>close</em>{" "}
          is the end of the day (M-03 · d4).
        </p>
      </header>

      <div className="btn-row" style={{ marginBottom: "var(--sp-4)" }}>
        {PHASES.map((p) => (
          <button
            key={p.key}
            className={`btn ${phase === p.key ? "primary" : "ghost"}`}
            onClick={() => setPhase(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: "-8px" }}>
        {PHASES.find((p) => p.key === phase)?.sub}
      </p>

      {phase === "opening" && <OpeningPhase by={authorisedBy} />}
      {phase === "post" && <PostPhase by={authorisedBy} />}
      {phase === "seal" && <SealPhase by={authorisedBy} />}
      {phase === "read" && <ReadPhase by={authorisedBy} />}
      {phase === "reconcile" && <ReconcilePhase by={authorisedBy} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 1 — the opening position
// ---------------------------------------------------------------------------

function OpeningPhase({ by }: { by: string }) {
  const app = useApp();
  const existing = app.ledgerOpening;
  const [draft, setDraft] = useState<OpeningPositionDraft>(
    existing ?? { firstDay: today(), inventory: 0, typed: {} },
  );

  const openable = openableAccounts(app.glAccounts);
  const balance = openingBalance(draft, app.glAccounts);
  const readBack = equityReadBack(draft, app.glAccounts);
  const ctx = { accounts: app.glAccounts, seals: app.ledgerSeals, unseals: app.ledgerUnseals, today: today() };
  const sealWhy = openingSealRefusal(draft, ctx);
  const lockWhy = openingUnsealRefusal(app.ledgerSeals, app.ledgerUnseals);
  const locked = app.ledgerOpeningSealed && lockWhy !== undefined;

  // Step 3 — supplied, never typed. The figure is whatever receiving has
  // populated, which is why the system knows it at all.
  // "sellable" and "held" are both on the shelf; "sold" has moved to cost of
  // goods already (M-07 d2's perpetual inventory), so only those two are stock.
  const onHandCost = app.inventory
    .filter((i) => i.status === "sellable" || i.status === "held")
    .reduce((sum, i) => sum + (i.cost ?? 0), 0);

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-head">The figures, from the accountant&rsquo;s statements</div>
        <div className="card-body stack">
          <p className="small muted">
            <strong>The least defended surface in this system, and the most consequential.</strong> These figures come
            from paper, nothing validates them against the world, and an error is carried forward by every period
            afterwards without ever disagreeing with anything. d6&rsquo;s window — retypeable until the first seal — and
            d28&rsquo;s read-back below are the only defences there are.
          </p>

          <label className="field">
            <span>First day the books start (d35 — any day)</span>
            <input
              type="date"
              value={draft.firstDay}
              disabled={locked}
              onChange={(e) => setDraft({ ...draft, firstDay: e.target.value })}
            />
          </label>
          <p className="small muted">
            The opening position is dated <strong>{openingDateOf(draft)}</strong> — the day before (step 2). A-73 refuses
            any posting dated on or before it.
          </p>

          <table className="data">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Figure</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Inventory <span className="badge">supplied</span>
                  <br />
                  <span className="small muted">
                    On hand &times; cost — step 3. Not typed, because receiving populated it.
                  </span>
                </td>
                <td className="num">
                  {money(draft.inventory || onHandCost)}
                  {draft.inventory === 0 && onHandCost > 0 && (
                    <>
                      <br />
                      <button
                        className="btn ghost sm"
                        onClick={() => setDraft({ ...draft, inventory: onHandCost })}
                        disabled={locked}
                      >
                        use {money(onHandCost)}
                      </button>
                    </>
                  )}
                </td>
              </tr>
              {openable.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.number} {a.name}
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: "10ch", textAlign: "right" }}
                      disabled={locked}
                      value={draft.typed[a.id] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          typed: { ...draft.typed, [a.id]: Number(e.target.value || 0) },
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="small muted">
            Not offered, and each for its own reason: <strong>equity</strong> is the figure that balances (d26),{" "}
            <strong>Accounts payable</strong> is M-05&rsquo;s balance exactly so the paper-era lump goes to the opening
            account instead (d7), the <strong>customer side opens empty</strong> (d8), <strong>gift cards</strong> are
            E-05&rsquo;s (d33), <strong>revenue and expense</strong> are out because the opening position carries the
            balance sheet only (d9), and <strong>Suspense</strong> has no paper figure to copy.
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">Equity, shown rather than entered</div>
          <div className="card-body stack">
            <table className="data">
              <tbody>
                <tr>
                  <td>Assets</td>
                  <td className="num">{money(balance.assets)}</td>
                </tr>
                <tr>
                  <td>Liabilities</td>
                  <td className="num">{money(balance.liabilities)}</td>
                </tr>
                <tr className="group-row">
                  <td>Equity (d26)</td>
                  <td className="num">{money(balance.equity)}</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">
              It <strong>cannot fail to balance</strong>, because equity is not a fourth number to reconcile — it is
              assets less liabilities, definitionally. The cost moved rather than vanished:{" "}
              <strong>a typo in an asset becomes equity in silence.</strong>
            </p>

            <label className="field">
              <span>The accountant&rsquo;s equity figure (d28 — never stored)</span>
              <input
                type="number"
                step="0.01"
                disabled={locked}
                value={draft.accountantsEquity ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    accountantsEquity: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </label>

            {readBack.typed !== undefined && !readBack.agrees && (
              <p className="wo-caveat warn">
                <strong>Out by {money(Math.abs(readBack.difference))}.</strong> The books work out to{" "}
                {money(readBack.derived)} and the accountant says {money(readBack.typed)}. This is the only mechanical
                detector there is — it does not need to be right, it needs to disagree.
                <br />
                <label className="row" style={{ marginTop: "var(--sp-2)" }}>
                  <input
                    type="checkbox"
                    checked={draft.differenceAcknowledged ?? false}
                    disabled={locked}
                    onChange={(e) => setDraft({ ...draft, differenceAcknowledged: e.target.checked })}
                  />
                  <span className="small">
                    I have read the difference and want to proceed. The paper sometimes genuinely does not balance
                    (A-28a).
                  </span>
                </label>
              </p>
            )}
            {readBack.agrees && <p className="small">Agrees with the accountant&rsquo;s figure.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Seal it</div>
          <div className="card-body stack">
            {locked ? (
              <p className="wo-caveat warn">{lockWhy}</p>
            ) : (
              <>
                {sealWhy && <p className="small muted">{sealWhy}</p>}
                <div className="btn-row">
                  <button className="btn" onClick={() => app.ledgerSaveOpening(draft)}>
                    Save draft
                  </button>
                  <button
                    className="btn primary"
                    disabled={sealWhy !== undefined}
                    onClick={() => {
                      app.ledgerSaveOpening(draft);
                      app.ledgerSealOpening(by);
                    }}
                  >
                    Seal the opening position
                  </button>
                </div>
                <p className="small muted">
                  A-78 — sealing <strong>materialises equity as a journal line</strong>. Until then this is a draft
                  carrying assets and liabilities only, and nothing may read it as though it were a journal. It stays
                  retypeable until the first real period is sealed, and never after (d6).
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 2 — postings a Manager types
// ---------------------------------------------------------------------------

const blankLine = (): TypedPostingLine => ({ accountId: "", location: "0", amount: 0, memo: "" });

function PostPhase({ by }: { by: string }) {
  const app = useApp();
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<TypedPostingLine[]>([blankLine(), blankLine()]);
  // d39 — one override per locked account this posting reaches. No blanket
  // unlock: the reason differs per account, so the override does too.
  const [overrides, setOverrides] = useState<PostingOverride[]>([]);

  const ctx: PostingContext = useMemo(
    () => ({
      accounts: app.glAccounts,
      openingDate: app.ledgerOpeningSealed && app.ledgerOpening ? openingDateOf(app.ledgerOpening) : undefined,
      seals: app.ledgerSeals,
      unseals: app.ledgerUnseals,
      locations: ["0"],
      sections: app.sections.map((x) => x.code),
    }),
    [app.glAccounts, app.ledgerOpening, app.ledgerOpeningSealed, app.ledgerSeals, app.ledgerUnseals, app.sections],
  );

  const draft = { businessDate: date, lines, overrides };
  const balance = postingBalance(lines);
  const refusals = postingRefusals(draft, ctx);
  const offered = offerableAccounts(app.glAccounts);

  const setLine = (i: number, patch: Partial<TypedPostingLine>) =>
    setLines(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-head">New posting</div>
        <div className="card-body stack">
          <label className="field">
            <span>Transaction date — when it happened, not when the paper arrived</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <table className="data">
            <thead>
              <tr>
                <th>Account</th>
                <th>Section</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
                      <option value="">—</option>
                      {offered.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.number} {a.name}
                        </option>
                      ))}
                      {/* d39 — the locked accounts an override can open are
                          shown, so a Manager can find the route rather than
                          discovering the lock and stopping. Choosing one
                          refuses until the override beside it carries a
                          reason. */}
                      <optgroup label="Needs an override (d39)">
                        {app.glAccounts
                          .filter((a) => a.active && a.role && OVERRIDABLE_ROLES.includes(a.role))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.number} {a.name}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </td>
                  <td>
                    <select value={l.section ?? ""} onChange={(e) => setLine(i, { section: e.target.value || undefined })}>
                      <option value="">not applicable</option>
                      {app.sections.map((sec) => (
                        <option key={sec.code} value={sec.code}>
                          {sec.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: "9ch", textAlign: "right" }}
                      value={l.amount > 0 ? l.amount : ""}
                      onChange={(e) => setLine(i, { amount: Number(e.target.value || 0) })}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: "9ch", textAlign: "right" }}
                      value={l.amount < 0 ? -l.amount : ""}
                      onChange={(e) => setLine(i, { amount: -Number(e.target.value || 0) })}
                    />
                  </td>
                  <td>
                    <input value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="btn-row">
            <button className="btn ghost sm" onClick={() => setLines([...lines, blankLine()])}>
              Add a line
            </button>
          </div>

          {(() => {
            // Every locked-and-openable account this posting actually touches.
            const needing = app.glAccounts.filter(
              (a) =>
                a.role &&
                OVERRIDABLE_ROLES.includes(a.role) &&
                lines.some((l) => l.accountId === a.id),
            );
            if (needing.length === 0) return null;
            return (
              <div className="card">
                <div className="card-head">Override — one account, one reason (d39)</div>
                <div className="card-body stack">
                  <p className="small muted">
                    Standard practice gives an exception four controls around an{" "}
                    <strong>ordinary</strong> entry: a restricted account, elevated permission, a{" "}
                    <strong>required narration</strong>, and an <strong>exception report</strong>{" "}
                    reviewed at close. This is the narration. There is{" "}
                    <strong>no blanket unlock</strong> — each account needs its own, because{" "}
                    <em>why</em> differs per account.
                  </p>
                  {needing.map((a) => {
                    const existing = overrides.find((o) => o.accountId === a.id);
                    return (
                      <label className="field" key={a.id}>
                        <span>
                          {a.number} {a.name} — why
                        </span>
                        <input
                          value={existing?.reason ?? ""}
                          onChange={(e) =>
                            setOverrides([
                              ...overrides.filter((o) => o.accountId !== a.id),
                              { accountId: a.id, reason: e.target.value },
                            ])
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <p className="small muted">
            A <strong>location</strong> is required and defaults from the Store; a <strong>section</strong> is optional
            and its blank means <em>not applicable</em> rather than <em>not bothered</em> (d12). Not offered:{" "}
            <strong>retained earnings</strong> and <strong>Accounts payable</strong> (d13), the{" "}
            <strong>gift card liability</strong> (d33) and <strong>Suspense</strong> (d14, not ratified).{" "}
            <strong>Inventory is offered</strong>, because a dead-stock write-down is exactly where book value should
            diverge from the shelf — and so are the <strong>tax accounts</strong>, because nothing in this system remits
            tax (d34).
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">{balance.balanced ? "Balanced" : "Still needed"}</div>
          <div className="card-body stack">
            <table className="data">
              <tbody>
                <tr>
                  <td>Debits</td>
                  <td className="num">{money(balance.debits)}</td>
                </tr>
                <tr>
                  <td>Credits</td>
                  <td className="num">{money(balance.credits)}</td>
                </tr>
                <tr className="group-row">
                  <td>{balance.balanced ? "Balanced" : `Needed on the ${balance.side} side`}</td>
                  <td className="num">{money(balance.needed)}</td>
                </tr>
              </tbody>
            </table>

            {refusals.length > 0 && (
              <div className="wo-caveat warn">
                <strong>Refused:</strong>
                <ul>
                  {refusals.map((r, i) => (
                    <li key={i} className="small">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              className="btn primary"
              disabled={refusals.length > 0}
              onClick={() => {
                app.ledgerPost(
                  {
                    id: `post-${Date.now()}`,
                    businessDate: date,
                    lines,
                    ...(overrides.length > 0 ? { overrides } : {}),
                    actorInitials: by,
                    authorizedByInitials: by,
                  },
                  by,
                );
                setLines([blankLine(), blankLine()]);
                setOverrides([]);
              }}
            >
              Save the posting
            </button>

            <p className="small muted">
              d10 — an unbalanced posting is <strong>refused</strong>, and the difference never goes to Suspense. This is
              the one place in this system that <strong>blocks</strong> rather than proceeding and recording (A-28a), so
              the refusal names the amount and the side rather than merely saying no.
            </p>
          </div>
        </div>

        {exceptionReport(app.ledgerPostings).length > 0 && (
          <div className="card">
            <div className="card-head">
              Exception report ({exceptionReport(app.ledgerPostings).length})
            </div>
            <div className="card-body stack">
              <p className="small muted">
                d39 — every posting that used an override, with the reason it carried.{" "}
                <strong>A read, not a queue</strong>: an override is a Manager acting deliberately
                with both names recorded, so it wants reading at close rather than acknowledging
                (A-71).
              </p>
              <table className="data">
                <tbody>
                  {exceptionReport(app.ledgerPostings).map((p) =>
                    (p.overrides ?? []).map((o) => (
                      <tr key={`${p.id}-${o.accountId}`}>
                        <td>{p.businessDate}</td>
                        <td>{app.glAccounts.find((a) => a.id === o.accountId)?.name ?? o.accountId}</td>
                        <td className="small">{o.reason}</td>
                        <td>{p.authorizedByInitials}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">Typed so far ({app.ledgerPostings.length})</div>
          <div className="card-body">
            {app.ledgerPostings.length === 0 ? (
              <p className="small muted">Nothing typed yet.</p>
            ) : (
              <table className="data">
                <tbody>
                  {app.ledgerPostings.slice(0, 8).map((p) => (
                    <tr key={p.id}>
                      <td>{p.businessDate}</td>
                      <td className="small muted">{p.lines[0]?.memo}</td>
                      <td className="num">{money(postingBalance(p.lines).debits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3 — sealing
// ---------------------------------------------------------------------------

function SealPhase({ by }: { by: string }) {
  const app = useApp();
  const [reason, setReason] = useState("");

  const yearEndMonth = 12; // M-06 d64 — defaults to 31 December.
  const firstPeriod = app.ledgerOpening ? periodOf(openingDateOf(app.ledgerOpening)) : undefined;
  const offered = oldestUnsealed(firstPeriod, periodOf(today()), app.ledgerSeals, app.ledgerUnseals);
  const latest = mostRecentlySealed(app.ledgerSeals, app.ledgerUnseals);

  // Step 17 — every failure, reported together. An unbalanced posting cannot
  // reach the journal (d10 refuses it at write time), so the blockers this
  // prototype can produce are invalid codes, and the list is where they land.
  // d40 — the Suspense gross is computed from the journal and REFUSES the seal
  // where it is non-zero. d15 let it through; d14's ratification removed d15's
  // premise, because a Manager can clear one now.
  const report = offered
    ? sealReport(offered, yearEndMonth, [], app.ledgerSuspenseGross(offered))
    : undefined;
  const sealWhy = offered ? sealRefusal(offered, app.ledgerSeals, app.ledgerUnseals, report?.blocking ?? []) : undefined;
  const unsealWhy = latest
    ? unsealRefusal(latest, app.ledgerSeals, app.ledgerUnseals, app.ledgerYearFilings, yearEndMonth, reason)
    : "Nothing is sealed.";
  const filedWhy = latest
    ? markFiledRefusal(fiscalYearEndFor(latest, yearEndMonth), app.ledgerSeals, app.ledgerUnseals, app.ledgerYearFilings)
    : undefined;

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-head">Seal a period</div>
        <div className="card-body stack">
          {!offered ? (
            <p className="small muted">
              Nothing to seal. {firstPeriod ? "Every month to date is sealed." : "Seal the opening position first."}
            </p>
          ) : (
            <>
              <p>
                Oldest unsealed month: <strong>{offered}</strong>
              </p>
              {report?.sealsFiscalYear && (
                <p className="wo-caveat warn">
                  <strong>This seal also seals the fiscal year.</strong> It will write visible closing postings zeroing
                  revenue and expense into retained earnings, dated the last day of the year (d17). The system knows
                  which period this is and says so before it happens, rather than asking (d5).
                </p>
              )}
              {sealWhy && <p className="wo-caveat warn">{sealWhy}</p>}
              <button
                className="btn primary"
                disabled={sealWhy !== undefined}
                onClick={() => app.ledgerSeal(offered, report?.suspenseGross ?? 0, by)}
              >
                Seal {offered}
              </button>
              <p className="small muted">
                The seal writes a <strong>closing transaction</strong> carrying balance-forwards — computed by the
                same recomputation that validates it, so <em>stored</em> is by definition the last{" "}
                <em>recomputed</em> (A-76). A <strong>non-zero Suspense balance refuses it</strong> (d40,
                superseding d15): a period does not seal over a defect in this system, and d14&rsquo;s override is
                the route past it. <strong>The day close is unaffected</strong> — M-07 d10 keeps the shop able to end
                its day, and d4 made <em>seal</em> and <em>close</em> two words precisely so this rule about one is
                never read as a rule about the other.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">Unseal</div>
          <div className="card-body stack">
            <p className="small muted">
              Only the <strong>most recently sealed</strong> period, and the act repeats to walk backwards (d29). The
              friction is the guard.
            </p>
            {latest && (
              <p>
                Most recently sealed: <strong>{latest}</strong>
                {isYearEnd(latest, yearEndMonth) && <> — a fiscal year end</>}
              </p>
            )}
            <label className="field">
              <span>Reason (d18 — required, and recorded)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {unsealWhy && <p className="wo-caveat warn">{unsealWhy}</p>}
            <button
              className="btn"
              disabled={unsealWhy !== undefined}
              onClick={() => {
                if (latest) app.ledgerUnseal(latest, reason, by);
                setReason("");
              }}
            >
              Unseal {latest}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">Mark a year filed</div>
          <div className="card-body stack">
            <p className="small muted">
              Once the return has gone in. A filed year <strong>refuses the unseal, and so does every month inside
              it</strong> — the only permanently irreversible state in this system, and the only one that depends on a
              Manager arming it (d22).
            </p>
            {latest && (
              <>
                {filedWhy && <p className="wo-caveat warn">{filedWhy}</p>}
                <button
                  className="btn danger"
                  disabled={filedWhy !== undefined}
                  onClick={() => app.ledgerMarkYearFiled(fiscalYearEndFor(latest, yearEndMonth), by)}
                >
                  Mark {fiscalYearEndFor(latest, yearEndMonth)} filed
                </button>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Unseals so far</div>
          <div className="card-body">
            {app.ledgerUnseals.length === 0 ? (
              <p className="small muted">None.</p>
            ) : (
              <table className="data">
                <tbody>
                  {app.ledgerUnseals.map((u) => (
                    <tr key={u.id}>
                      <td>{u.unsealedAt.slice(0, 10)}</td>
                      <td>{u.authorizedByInitials}</td>
                      <td className="small">{u.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 4 — reading the books
// ---------------------------------------------------------------------------

function ReadPhase({ by }: { by: string }) {
  const app = useApp();
  const [accountId, setAccountId] = useState(app.glAccounts[0]?.id ?? "");
  const [period, setPeriod] = useState(periodOf(today()));
  const [section, setSection] = useState("");
  const [exportFrom, setExportFrom] = useState(`${periodOf(today())}-01`);
  const [exportTo, setExportTo] = useState(`${periodOf(today())}-01`);
  // d31 — re-opening shows WHAT WAS ISSUED, never a recomputation, so this
  // holds the issuance itself and the panel renders `reopenIssuance` of it.
  const [reopened, setReopened] = useState<LedgerIssuance | null>(null);

  const yearEndMonth = 12;
  const enquiry = accountEnquiry(
    period,
    app.journals,
    app.ledgerClosings,
    app.ledgerSeals,
    app.ledgerUnseals,
    { accountId, ...(section ? { section } : {}) },
  );

  const from = `${period}-01`;
  const to = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).toISOString().slice(0, 10);
  const pl = profitAndLoss(from, to, app.glAccounts, app.journals, app.ledgerSeals, app.ledgerUnseals);
  // E-07 d21 — each Customer's SIGNED balance, so the sheet can classify by
  // sign and never net across Customers. The ledger alone cannot do this: the
  // chart holds one `customer-credit` account carrying exactly the net d21
  // forbids, so the customer ledger is a second input to a balance sheet.
  const customerBalances = app.customers.map((c) => c.balance);
  const bs = balanceSheet(
    to,
    app.glAccounts,
    app.journals,
    app.ledgerSeals,
    app.ledgerUnseals,
    yearEndMonth,
    customerBalances,
  );

  const issuedBy = { issuedAt: new Date().toISOString(), actorInitials: by, authorizedByInitials: by };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">An account, over a period</div>
        <div className="card-body stack">
          <div className="row wrap">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {app.glAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number} {a.name}
                </option>
              ))}
            </select>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">every section</option>
              {app.sections.map((sec) => (
                <option key={sec.code} value={sec.code}>
                  {sec.code}
                </option>
              ))}
            </select>
          </div>

          <table className="data">
            <tbody>
              <tr>
                <td>Balance forward</td>
                <td className="num">
                  {enquiry.balanceForward === undefined ? "—" : money(enquiry.balanceForward)}
                </td>
              </tr>
              <tr>
                <td>Activity in {period}</td>
                <td className="num">{money(enquiry.activity)}</td>
              </tr>
              <tr className="group-row">
                <td>New balance forward</td>
                <td className="num">
                  {enquiry.newBalanceForward === undefined ? "—" : money(enquiry.newBalanceForward)}
                </td>
              </tr>
            </tbody>
          </table>

          {enquiry.unavailable && <p className="small muted">{enquiry.unavailable}</p>}

          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Section</th>
                <th>Note</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {enquiry.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.businessDate}</td>
                  <td>{l.section ?? "—"}</td>
                  <td className="small">{l.memo}</td>
                  <td className="num">{l.debit ? money(l.debit) : ""}</td>
                  <td className="num">{l.credit ? money(l.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            Profit &amp; Loss — {from} to {to}
            {isProvisional(pl) && <span className="badge">provisional</span>}
          </div>
          <div className="card-body stack">
            <table className="data">
              <tbody>
                {pl.revenue.map((l) => (
                  <tr key={l.accountId}>
                    <td>{l.name}</td>
                    <td className="num">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr className="group-row">
                  <td>Revenue</td>
                  <td className="num">{money(pl.totalRevenue)}</td>
                </tr>
                <tr>
                  <td>Cost of goods</td>
                  <td className="num">{money(pl.totalCostOfGoods)}</td>
                </tr>
                <tr>
                  <td>Expenses</td>
                  <td className="num">{money(pl.totalExpenses)}</td>
                </tr>
                <tr className="group-row">
                  <td>
                    <strong>Profit</strong>
                  </td>
                  <td className="num">
                    <strong>{money(pl.profit)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            {pl.later.count > 0 && (
              <p className="small muted">
                {pl.later.count} line{pl.later.count === 1 ? "" : "s"} dated after {to} — the first on{" "}
                {pl.later.firstDate} — are <strong>not</strong> in this (d30).
              </p>
            )}
            <button
              className="btn"
              onClick={() =>
                app.ledgerIssue(
                  issueProfitAndLoss(
                    `iss-${Date.now()}`,
                    { kind: "range", from, toExclusive: `${period}-01` },
                    pl,
                    issuedBy,
                  ),
                )
              }
            >
              Issue
            </button>
            <p className="small muted">
              d23 — it has a bottom line and it is called a <strong>profit</strong>. M-07 d27 retired the prohibition,
              and Phase 2 is what earned it: the rent whose absence made the figure wrong is now in the ledger.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            Balance Sheet — as at {to}
            {isProvisional(bs) && <span className="badge">provisional</span>}
          </div>
          <div className="card-body stack">
            <table className="data">
              <tbody>
                <tr className="group-row">
                  <td>Assets</td>
                  <td className="num">{money(bs.totalAssets)}</td>
                </tr>
                <tr className="group-row">
                  <td>Liabilities</td>
                  <td className="num">{money(bs.totalLiabilities)}</td>
                </tr>
                {bs.equity.map((l) => (
                  <tr key={l.accountId}>
                    <td>{l.name}</td>
                    <td className="num">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    Current earnings <span className="badge">derived</span>
                  </td>
                  <td className="num">{money(bs.currentEarnings)}</td>
                </tr>
                <tr className="group-row">
                  <td>Equity</td>
                  <td className="num">{money(bs.totalEquity)}</td>
                </tr>
              </tbody>
            </table>
            {bs.outOfBalance !== 0 && (
              <p className="wo-caveat warn">
                <strong>Out of balance by {money(bs.outOfBalance)}.</strong>
                {bs.customerLedgerDivergence !== undefined && bs.customerLedgerDivergence !== 0 && (
                  <>
                    {" "}
                    The customer ledger and the <em>Customer account credit</em> account disagree by{" "}
                    {money(bs.customerLedgerDivergence)}. E-07 d5 derives a Customer&rsquo;s balance from
                    movements and the journal is written by the artifacts those movements cause —{" "}
                    <strong>two paths to one figure</strong>, which nothing has yet settled the way
                    A-76 settled it for balance-forwards. Recorded as an open question rather than
                    reconciled here.
                  </>
                )}
              </p>
            )}
            <button className="btn" onClick={() => app.ledgerIssue(issueBalanceSheet(`iss-${Date.now()}`, bs, issuedBy))}>
              Issue
            </button>
            <p className="small muted">
              d24 — <strong>current earnings is derived at the moment this is drawn</strong>, never posted, and named as
              its own line rather than folded into a total. Between year-end seals, equity as <em>posted</em> and equity
              as <em>shown</em> differ by the year to date, which is correct accounting and reads as a discrepancy to
              anyone comparing this against the chart.
            </p>
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">Export the journal (M-07 d15, d16)</div>
          <div className="card-body stack">
            <p className="small muted">
              M-07 keeps what the file <strong>is</strong>; this flow owns the surface it is obtained from
              (d31). The range is <strong>half-open</strong> — the second date is excluded — so two adjacent
              exports cannot both claim the boundary day.
            </p>
            <div className="row wrap">
              <label className="field">
                <span>From</span>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
              </label>
              <label className="field">
                <span>Up to, excluded</span>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
              </label>
            </div>

            {(() => {
              const lines = exportLines(app.journals, exportFrom, exportTo);
              const clash = exportOverlaps({ from: exportFrom, toExclusive: exportTo }, app.ledgerIssuances);
              return (
                <>
                  <p className="small">
                    <strong>{lines.length}</strong> line{lines.length === 1 ? "" : "s"} in this range.
                  </p>
                  {clash.length > 0 && (
                    <p className="wo-caveat warn">
                      <strong>
                        {clash.length} earlier export{clash.length === 1 ? "" : "s"} already covered part of
                        this range.
                      </strong>{" "}
                      M-07 d16: <em>importing the same journal twice silently doubles the books.</em> This
                      <strong> warns and never refuses</strong> (A-28a) — a second export of a range is
                      sometimes exactly what an accountant asked for. Only earlier <strong>exports</strong>
                      count: duplicating a statement corrupts nothing (A-77).
                    </p>
                  )}
                  <button
                    className="btn"
                    disabled={lines.length === 0}
                    onClick={() =>
                      app.ledgerIssue(
                        issueExport(
                          `iss-${Date.now()}`,
                          exportFrom,
                          exportTo,
                          lines,
                          app.ledgerSeals,
                          app.ledgerUnseals,
                          issuedBy,
                        ),
                      )
                    }
                  >
                    Export
                  </button>
                </>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-head">What has left the building ({app.ledgerIssuances.length})</div>
          <div className="card-body stack">
            <p className="small muted">
              d31 — issuing stores the <strong>figures</strong>, not a rendered file, and re-opening one shows{" "}
              <strong>what was issued</strong> rather than a recomputation. A-77 makes this the record M-07
              d16&rsquo;s overlap warning and d29&rsquo;s unseal both wanted and neither had.
            </p>
            {app.ledgerIssuances.length === 0 ? (
              <p className="small muted">Nothing issued yet.</p>
            ) : (
              <table className="data">
                <tbody>
                  {app.ledgerIssuances.map((i) => (
                    <tr key={i.id} className="row-click" onClick={() => setReopened(i)}>
                      <td>{i.kind}</td>
                      <td>
                        {i.scope.kind === "as-at"
                          ? `as at ${i.scope.at}`
                          : `${i.scope.from} → ${i.scope.toExclusive}`}
                      </td>
                      <td>{i.provisional ? <span className="badge">provisional</span> : ""}</td>
                      <td>{i.authorizedByInitials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reopened && (
              <div className="card">
                <div className="card-head">
                  Re-opened — {reopened.kind}
                  <button className="btn ghost sm" onClick={() => setReopened(null)}>
                    close
                  </button>
                </div>
                <div className="card-body stack">
                  <p className="small muted">
                    <strong>The figures as issued, never a recomputation</strong> (d31). Issued{" "}
                    {reopened.issuedAt.slice(0, 10)} by {reopened.authorizedByInitials}
                    {reopened.provisional && (
                      <>
                        {" "}
                        and marked <strong>provisional</strong> — a mark it keeps even once its period
                        seals, because it says what was true when it left (d36)
                      </>
                    )}
                    .
                  </p>
                  <IssuedFigures issuance={reopened} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 4 — reconciliation
// ---------------------------------------------------------------------------

function ReconcilePhase({ by }: { by: string }) {
  const app = useApp();
  const banky = app.glAccounts.filter(
    (a) => a.role === "bank" || a.role === "undeposited" || accountType(a) === "asset",
  );
  const [accountId, setAccountId] = useState(banky[0]?.id ?? "");
  const [document, setDocument] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // d37's accepted consequence, made structural: "a Manager has to know which
  // they are doing before they start, because ticking the same entries under
  // the other kind means something different — and the screen therefore cannot
  // offer one list of entries and one button."
  const [kind, setKind] = useState<ReconciliationKind>("matched");

  const open = unreconciled(app.journals, accountId, app.ledgerReconciliations);
  const key = (e: ReconcilableEntry) => `${e.batchId}#${e.lineIndex}`;
  const selected = open.filter((e) => ticked.has(key(e)));
  const marked = markedTotal(selected);
  const why = reconciliationRefusal(selected, document, app.ledgerReconciliations, kind);

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-head">Mark entries until the difference is zero</div>
        <div className="card-body stack">
          <div className="btn-row">
            <button
              className={`btn ${kind === "matched" ? "primary" : "ghost"}`}
              onClick={() => {
                setKind("matched");
                setTicked(new Set());
              }}
            >
              Matched — nets to zero
            </button>
            <button
              className={`btn ${kind === "cleared" ? "primary" : "ghost"}`}
              onClick={() => {
                setKind("cleared");
                setTicked(new Set());
              }}
            >
              Cleared — against a statement
            </button>
          </div>
          <p className="small muted">
            {kind === "matched" ? (
              <>
                <strong>Matched</strong> — offsetting entries that net to zero, so the mark is
                balance-neutral <strong>by construction</strong>. The two halves of an
                undeposited-funds movement (d25).
              </>
            ) : (
              <>
                <strong>Cleared</strong> — the entries that appear on the statement. What is left over
                is outstanding cheques and deposits in transit, and{" "}
                <strong>that remainder is the point</strong>, not a failure (d37). Balance-neutral by{" "}
                <em>convention</em>: nothing but your attention stands behind a cleared mark.
              </>
            )}
          </p>

          <div className="row wrap">
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setTicked(new Set());
              }}
            >
              {banky.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number} {a.name}
                </option>
              ))}
            </select>
          </div>

          {open.length === 0 ? (
            <p className="small muted">Nothing unreconciled in this account.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Date</th>
                  <th>Note</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {open.map((e) => (
                  <tr key={key(e)}>
                    <td>
                      <input
                        type="checkbox"
                        checked={ticked.has(key(e))}
                        onChange={(ev) => {
                          const next = new Set(ticked);
                          if (ev.target.checked) next.add(key(e));
                          else next.delete(key(e));
                          setTicked(next);
                        }}
                      />
                    </td>
                    <td>{e.line.businessDate}</td>
                    <td className="small">{e.line.memo || "—"}</td>
                    <td className="num">{money(e.line.debit - e.line.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            {kind === "cleared"
              ? "Marked as cleared"
              : marked.balanced && marked.count > 0
                ? "Nets to zero"
                : "Difference"}
          </div>
          <div className="card-body stack">
            <p className="num" style={{ fontSize: "1.4rem" }}>
              {money(marked.difference)}
            </p>
            <label className="field">
              <span>The outside document this was checked against</span>
              <input value={document} onChange={(e) => setDocument(e.target.value)} />
            </label>
            {selected.length > 0 && why && <p className="wo-caveat warn">{why}</p>}
            <button
              className="btn primary"
              disabled={why !== undefined}
              onClick={() => {
                app.ledgerReconcile(
                  reconcile(
                    `rec-${Date.now()}`,
                    selected,
                    document,
                    {
                      reconciledAt: new Date().toISOString(),
                      actorInitials: by,
                      authorizedByInitials: by,
                    },
                    kind,
                  ),
                );
                setTicked(new Set());
                setDocument("");
              }}
            >
              Stamp the set as reconciled together
            </button>
            <p className="small muted">
              A reconciled set is entries <strong>within one account</strong>, marked together against an
              outside document (d25).{" "}
              {kind === "matched" ? (
                <>
                  A <strong>matched</strong> set nets to zero, so it is balance-neutral{" "}
                  <strong>by construction</strong>.
                </>
              ) : (
                <>
                  A <strong>cleared</strong> set does not net, and is not asked to (d37).
                </>
              )}{" "}
              Either way <strong>it moves no money</strong>, and{" "}
              <strong>nothing downstream requires it</strong>: an unreconciled account seals exactly as a
              reconciled one does. The mark is evidence, never a gate.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">Reconciled sets ({app.ledgerReconciliations.length})</div>
          <div className="card-body">
            {app.ledgerReconciliations.length === 0 ? (
              <p className="small muted">None yet.</p>
            ) : (
              <table className="data">
                <tbody>
                  {app.ledgerReconciliations.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="badge">{r.kind}</span> {r.members.length} entries
                      </td>
                      <td className="small">{r.document}</td>
                      <td>{r.authorizedByInitials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Why there are two kinds</div>
          <div className="card-body">
            <p className="small muted">
              d25 gave one rule — <em>entries within one account that net to zero</em> — and named two
              cases under it. <strong>It served one.</strong> Building this refused a complete and
              correct September bank reconciliation, <strong>out by 18,800</strong>, which is what
              turned the question from arguable into visible. <strong>d37</strong> answers it: a{" "}
              <strong>matched</strong> set nets to zero and is neutral by construction; a{" "}
              <strong>cleared</strong> set marks what the document shows and carries the remainder as
              its point. Both move no money and gate nothing — an unreconciled account seals exactly
              as a reconciled one does.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * d31 — renders a stored issuance's figures and **recomputes nothing**.
 *
 * Every number here comes from `reopenIssuance`, which returns what was stored
 * and never re-derives it. That is the whole reason an issuance keeps figures
 * rather than a rendered file: *"otherwise the record of what the accountant
 * holds could quietly change."*
 */
function IssuedFigures({ issuance }: { issuance: LedgerIssuance }) {
  const figures = reopenIssuance(issuance);

  if (issuance.kind === "journal-export") {
    const lines = figures as ReturnType<typeof exportLines>;
    return (
      <table className="data">
        <tbody>
          {lines.slice(0, 12).map((l, i) => (
            <tr key={i}>
              <td>{l.businessDate}</td>
              <td className="small">{l.memo}</td>
              <td className="num">{l.debit ? money(l.debit) : ""}</td>
              <td className="num">{l.credit ? money(l.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (issuance.kind === "profit-and-loss") {
    const pl = figures as { totalRevenue: number; totalCostOfGoods: number; totalExpenses: number; profit: number };
    return (
      <table className="data">
        <tbody>
          <tr>
            <td>Revenue</td>
            <td className="num">{money(pl.totalRevenue)}</td>
          </tr>
          <tr>
            <td>Cost of goods</td>
            <td className="num">{money(pl.totalCostOfGoods)}</td>
          </tr>
          <tr>
            <td>Expenses</td>
            <td className="num">{money(pl.totalExpenses)}</td>
          </tr>
          <tr className="group-row">
            <td>
              <strong>Profit</strong>
            </td>
            <td className="num">
              <strong>{money(pl.profit)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  const bs = figures as { totalAssets: number; totalLiabilities: number; currentEarnings: number; totalEquity: number };
  return (
    <table className="data">
      <tbody>
        <tr>
          <td>Assets</td>
          <td className="num">{money(bs.totalAssets)}</td>
        </tr>
        <tr>
          <td>Liabilities</td>
          <td className="num">{money(bs.totalLiabilities)}</td>
        </tr>
        <tr>
          <td>Current earnings</td>
          <td className="num">{money(bs.currentEarnings)}</td>
        </tr>
        <tr className="group-row">
          <td>Equity</td>
          <td className="num">{money(bs.totalEquity)}</td>
        </tr>
      </tbody>
    </table>
  );
}
