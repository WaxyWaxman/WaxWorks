import { useState, type ReactNode } from "react";
import { money } from "../lib/money";
import type { DayBreakdown, SalesFigures, SalesFooter } from "../lib/dayBreakdown";
import type { RangeReport } from "../lib/rangeReport";

// M-03 d17 — the close's breakdown as EIGHT NAMED SECTIONS in a fixed order.
// The order is the argument: File info first (a report with no stated bounds
// is a figure with no claim attached), then the money in the order it is asked
// about, then the counter. Sections 2 and 5 deliberately share one arithmetic,
// so a reader who has learned to read one has learned to read both.

const time = (iso: string | null): string =>
  // d18 — an em dash where there is no record at all, never a substituted
  // timestamp: an empty batch has no first Sale, and saying so is the point.
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const pct = (n: number | null): string => (n === null ? "—" : `${n.toFixed(1)}%`);

/**
 * d28 — sections 5 through 8 arrive COLLAPSED, being the ones that answer a
 * question rather than report the day, and the state is deliberately **not
 * remembered**: a report is read fresh each time and an Employee should not
 * inherit whoever last opened it.
 *
 * File info and the Sales footer carry no fold control at all — the first
 * because a report with its bounds folded away is the misreading d18 exists to
 * prevent, the second because it is the answer to the question the report was
 * opened for.
 */
function Section({
  n,
  title,
  note,
  collapsed,
  children,
}: {
  n: number;
  title: string;
  note?: ReactNode;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="card">
      <button
        type="button"
        className="card-head"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: 0 }}
        aria-expanded={open}
      >
        <span className="muted">{n}.</span> {title} <span className="muted xsmall">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="card-body" style={{ padding: 0 }}>
          {note && (
            <p className="xsmall muted" style={{ padding: "var(--sp-2)", margin: 0 }}>
              {note}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/** §2 and §5 share this, which is the whole reason they are comparable (d17). */
function SalesRows({
  rows,
  firstHeading,
}: {
  rows: (SalesFigures & { key: string; code?: string; label: string })[];
  firstHeading: string;
}) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>{firstHeading}</th>
          <th className="num">Items</th>
          <th className="num">Retail</th>
          <th className="num">Discount</th>
          <th className="num">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              {r.code && <span className="muted xsmall">{r.code} </span>}
              {r.label}
            </td>
            <td className="num">{r.items}</td>
            <td className="num">{money(r.retail)}</td>
            <td className="num">{money(r.discount)}</td>
            <td className="num">{money(r.net)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td className="small muted">Nothing sold.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Footer({ f }: { f: SalesFooter }) {
  return (
    <table className="data">
      <tbody>
        <tr>
          <td className="muted">Total items / retail / net</td>
          <td className="num">
            {f.items} · {money(f.retail)} · <strong>{money(f.net)}</strong>
          </td>
        </tr>
        <tr>
          {/* d19 — the one number that says whether the counter is giving the
              shop away, over RETAIL: what would have been charged. */}
          <td className="muted">Discount given</td>
          <td className="num">
            {money(f.discount)} <span className="muted xsmall">({pct(f.discountPctOfSales)} of sales)</span>
          </td>
        </tr>
        <tr>
          <td className="muted">Transactions</td>
          <td className="num">{f.transactions}</td>
        </tr>
        <tr>
          {/* d19 — a $0.00 counter buy counts as a transaction, so a day of
              many trade-ins drags this down. That is correct: they are
              transactions the counter worked. */}
          <td className="muted">Average sale</td>
          <td className="num">{f.averageSale === null ? "—" : money(f.averageSale)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** E-07 d22 — during the paper-credit-note changeover this reads high. */
const DISCOUNT_CAVEAT =
  "A pre-migration paper credit note is rung as a discount (E-07 d22), so this figure and its percentage both read high during the changeover.";

export function DayReport({ data }: { data: DayBreakdown }) {
  return (
    <div className="stack">
      {/* §1 — never collapses (d28). */}
      <div className="card">
        <div className="card-head">
          <span className="muted">1.</span> File info
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <tbody>
              <tr>
                <td className="muted">Start (first record)</td>
                <td className="num">{time(data.fileInfo.start)}</td>
              </tr>
              <tr>
                <td className="muted">End (last record)</td>
                <td className="num">{time(data.fileInfo.end)}</td>
              </tr>
              <tr>
                {/* d18 — the one of the three that moves between a subtotal
                    and a close, and between two subtotals over one batch. */}
                <td className="muted">Created</td>
                <td className="num">{time(data.fileInfo.createdAt)}</td>
              </tr>
            </tbody>
          </table>
          <p className="xsmall muted" style={{ padding: "var(--sp-2)", margin: 0 }}>
            Bounds this <strong>batch</strong>, not the calendar day (d18) — a Sale rung after a close belongs to the
            next batch even when the date has not changed.
          </p>
        </div>
      </div>

      <Section
        n={2}
        title="Sales"
        note={
          <>
            Per Section code (M-06 d28). A matched Return <strong>nets into its own Section</strong>, so these rows sum
            to net sales. A gift-card load and an unmatched Return are in neither (M-06 d20, E-06 d26).
          </>
        }
      >
        <SalesRows
          firstHeading="Section"
          rows={data.bySection.map((s) => ({ ...s, key: s.label }))}
        />
        <div style={{ borderTop: "1px solid var(--line)" }}>
          <Footer f={data.salesFooter} />
          <p className="xsmall muted" style={{ padding: "var(--sp-2)", margin: 0 }}>
            {DISCOUNT_CAVEAT}
          </p>
        </div>
      </Section>

      <Section
        n={3}
        title="Taxes"
        note={
          <>
            Each tax carries <strong>its own base</strong> — under M-06 d16's <code>ab+</code>, <code>b</code> is
            charged on the subtotal plus <code>a</code>, and the two are remitted to different authorities. Split by
            rate within a type where the period spans a rate change (d15).
          </>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th>Tax</th>
              <th className="num">Times</th>
              <th className="num">Rate</th>
              <th className="num">Taxable base</th>
              <th className="num">Tax</th>
            </tr>
          </thead>
          <tbody>
            {data.byTaxLine.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td className="num">{t.count}</td>
                <td className="num">{(t.ratePpm / 10000).toFixed(3)}%</td>
                <td className="num">{money(t.base)}</td>
                <td className="num">{money(t.amount)}</td>
              </tr>
            ))}
            {data.byTaxLine.length === 0 && (
              <tr>
                <td className="small muted">No tax collected.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        n={4}
        title="Tenders / Misc"
        note={
          <>
            Values <strong>include tax</strong> — a tender is money that moved. The account each posts to is M-07 d21's,
            resolved by behaviour, so this block and the close's own journal can never name two different accounts for
            one tender.
          </>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th>Tender</th>
              <th>GL account</th>
              <th className="num">Times</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.byTender
              .filter((t) => t.undeposited)
              .map((t) => (
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td className="small muted">{t.account ?? "—"}</td>
                  <td className="num">{t.count}</td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              ))}
            {data.undepositedTotal !== null && (
              <tr>
                {/* d21 — NOT a bank total. M-07 d21 lands cash and card in
                    undeposited funds, and money reaches a bank account only
                    through a BankDeposit (A-66). */}
                <td colSpan={3}>
                  <strong>Undeposited funds total</strong>
                </td>
                <td className="num">
                  <strong>{money(data.undepositedTotal)}</strong>
                </td>
              </tr>
            )}
            {/* d16 — Cash, net sits BESIDE the movements rather than replacing
                them, and is a subtotal rather than a row, so nothing summing
                this column double-counts it. */}
            {data.cashNet !== null && (
              <tr>
                <td colSpan={3} className="small muted">
                  Cash, net — what moved, not what is in the drawer
                </td>
                <td className="num small">{money(data.cashNet)}</td>
              </tr>
            )}
            {data.byTender
              .filter((t) => !t.undeposited)
              .map((t) => (
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td className="small muted">{t.account ?? "—"}</td>
                  <td className="num">{t.count}</td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              ))}
            {/* Money through a tender that was not a sale, so this column can
                be reconciled against net sales rather than quietly exceeding
                it (M-03 d14, E-06 d26). */}
            {data.giftCardsLoaded !== 0 && (
              <tr>
                <td className="small muted">— of which gift cards loaded</td>
                <td className="small muted">Gift card liability</td>
                <td className="num small" />
                <td className="num small">{money(data.giftCardsLoaded)}</td>
              </tr>
            )}
            {data.unmatchedReturns !== 0 && (
              <tr>
                <td className="small muted">— of which unmatched Returns (a purchase, not a reversal)</td>
                <td className="small muted">Second-hand purchases</td>
                <td className="num small" />
                <td className="num small">{money(data.unmatchedReturns)}</td>
              </tr>
            )}
            {data.byTender.length === 0 && (
              <tr>
                <td className="small muted">Nothing tendered.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        n={5}
        title="Sales by customer type"
        collapsed
        note={
          <>
            The Customer's <strong>Account type</strong> (E-07), plus <strong>Walk-in</strong> for a Sale carrying no
            Customer (E-05 d30). Same figures as section 2 — <strong>Staff</strong> as its own row is the one that
            earns the split.
          </>
        }
      >
        <SalesRows
          firstHeading="Customer type"
          rows={data.byCustomerType.map((r) => ({ ...r, key: r.label }))}
        />
      </Section>

      <Section
        n={6}
        title="Sales per hour"
        collapsed
        note={
          <>
            The hour of the <strong>tender</strong> (A-73). An hour that rang nothing carries no line — so a dead hour
            and a closed hour look alike, which is the accepted trade (d23). A void is <strong>counted, never
            valued</strong> (d26).
          </>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th>Hour</th>
              <th className="num">Transactions</th>
              <th className="num">Value</th>
              <th className="num">Voids</th>
            </tr>
          </thead>
          <tbody>
            {data.perHour.map((h) => (
              <tr key={h.hour}>
                <td>{String(h.hour).padStart(2, "0")}:00</td>
                <td className="num">{h.transactions}</td>
                <td className="num">{money(h.value)}</td>
                <td className="num">{h.voids || ""}</td>
              </tr>
            ))}
            {data.perHour.length === 0 && (
              <tr>
                <td className="small muted">Nothing rang.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        n={7}
        title="Sales by Employee"
        collapsed
        note={
          <>
            Attributed to whoever held the lock at tender (E-05 d23). <strong>Average discount</strong> is over the
            items that took one, so it is comparable between a busy shift and a quiet one (d24). This is the one
            surface here that compares Employees to each other, and a figure high for an honest reason — the person
            working the trade-in counter — has nothing here to say so.
          </>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">Txns</th>
              <th className="num">Items</th>
              <th className="num">Value</th>
              <th className="num">Avg disc.</th>
              <th className="num">Returns</th>
              <th className="num">Voids</th>
            </tr>
          </thead>
          <tbody>
            {data.byEmployee.map((e) => (
              <tr key={e.employee}>
                <td>{e.employee}</td>
                <td className="num">{e.transactions}</td>
                <td className="num">{e.items}</td>
                <td className="num">{money(e.value)}</td>
                <td className="num">{e.avgDiscount === null ? "—" : money(e.avgDiscount)}</td>
                <td className="num">
                  {e.returns || ""}
                  {e.returns ? <span className="muted xsmall"> {money(e.returnsValue)}</span> : null}
                </td>
                <td className="num">{e.voids || ""}</td>
              </tr>
            ))}
            {data.byEmployee.length === 0 && (
              <tr>
                <td className="small muted">Nobody rang anything.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        n={8}
        title="Tendering details"
        collapsed
        note={
          <>
            Every transaction in the period, grouped by tender. A <strong>split tender appears once per tender</strong>,
            both lines carrying the same transaction number — so each group sums to its own total in section 4 and no
            line here is a Sale total (d25).
          </>
        }
      >
        {data.tenderingDetails.map((g) => (
          <table className="data" key={g.label}>
            <thead>
              <tr>
                <th colSpan={4}>{g.label}</th>
              </tr>
              <tr>
                <th>Employee</th>
                <th>Txn</th>
                <th>Customer</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i}>
                  <td className="small">{r.employee}</td>
                  <td className="small">{r.saleNumber}</td>
                  <td className="small">{r.customer}</td>
                  <td className="num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {data.tenderingDetails.length === 0 && <p className="small muted">Nothing tendered.</p>}
      </Section>

      {/* Not one of the eight — the one block that is not about the period. */}
      <div className="card">
        <div className="card-head">Movements and stock position</div>
        <div className="card-body small stack">
          <div>
            Voids: {data.voidCount} · Holds created: {data.holdsCreatedCount} · Holds cancelled:{" "}
            {data.holdsCancelledCount}
          </div>
          {data.payouts.map((p, i) => (
            <div key={i} className="xsmall muted">
              Pay-out {p.saleLabel} — {money(p.amount)} — {p.note}
            </div>
          ))}
          {data.belowMin.length > 0 && (
            <table className="data">
              <thead>
                <tr>
                  <th>Below minimum on hand</th>
                  <th className="num">On hand / min</th>
                </tr>
              </thead>
              <tbody>
                {data.belowMin.map((r) => (
                  <tr key={r.recordId}>
                    <td className="small">{r.label}</td>
                    <td className="num small">
                      {r.onHand} / {r.minOnHand}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * d27 — the same report over a date range, carrying SEVEN of the eight
 * sections. *Tendering details* is absent: it is a per-transaction listing and
 * does not sum out of a stored aggregate.
 */
export function RangeReportView({ data }: { data: RangeReport }) {
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <span className="muted">1.</span> File info
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data">
            <tbody>
              <tr>
                <td className="muted">Range</td>
                <td className="num">
                  {data.from} → {data.to}
                </td>
              </tr>
              <tr>
                <td className="muted">First / last record</td>
                <td className="num">
                  {time(data.start)} → {time(data.end)}
                </td>
              </tr>
              <tr>
                <td className="muted">Created</td>
                <td className="num">{time(data.createdAt)}</td>
              </tr>
              <tr>
                {/* d27 — printed rather than tucked away: a range containing a
                    day nobody closed is a range whose figures are short, and
                    this is the only place that shows. */}
                <td className="muted">Closes summed</td>
                <td className="num">
                  <strong>{data.batchCount}</strong>
                </td>
              </tr>
              {data.shortBatchCount > 0 && (
                <tr>
                  {/* A-83 — never zero-filled. A zero a reader cannot tell
                      from an absence is an invented number. */}
                  <td className="muted">— of which cannot answer every section</td>
                  <td className="num">{data.shortBatchCount}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="xsmall muted" style={{ padding: "var(--sp-2)", margin: 0 }}>
            This sums <strong>closed batches</strong> (d27), so Sales in a batch nobody has closed are invisible to it —
            including today's, until the close runs. <strong>View Subtotal</strong> is the only way to see the day you
            are standing in.
          </p>
        </div>
      </div>

      <Section n={2} title="Sales">
        <SalesRows firstHeading="Section" rows={data.bySection.map((s) => ({ ...s, key: s.label }))} />
        <div style={{ borderTop: "1px solid var(--line)" }}>
          <Footer f={data.salesFooter} />
          <p className="xsmall muted" style={{ padding: "var(--sp-2)", margin: 0 }}>
            {DISCOUNT_CAVEAT}
          </p>
        </div>
      </Section>

      <Section n={3} title="Taxes">
        <table className="data">
          <thead>
            <tr>
              <th>Tax</th>
              <th className="num">Times</th>
              <th className="num">Taxable base</th>
              <th className="num">Tax</th>
            </tr>
          </thead>
          <tbody>
            {data.byTaxLine.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td className="num">{t.count}</td>
                <td className="num">{money(t.base)}</td>
                <td className="num">{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section n={4} title="Tenders / Misc">
        <table className="data">
          <thead>
            <tr>
              <th>Tender</th>
              <th>GL account</th>
              <th className="num">Times</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.byTender.map((t) => (
              <tr key={t.label}>
                <td>{t.label}</td>
                <td className="small muted">{t.account ?? "—"}</td>
                <td className="num">{t.count}</td>
                <td className="num">{money(t.amount)}</td>
              </tr>
            ))}
            {data.undepositedTotal !== null && (
              <tr>
                <td colSpan={3}>
                  <strong>Undeposited funds total</strong>
                </td>
                <td className="num">
                  <strong>{money(data.undepositedTotal)}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section n={5} title="Sales by customer type" collapsed>
        <SalesRows firstHeading="Customer type" rows={data.byCustomerType.map((r) => ({ ...r, key: r.label }))} />
      </Section>

      <Section
        n={6}
        title="Sales per hour"
        collapsed
        note={<>An average per hour of the day across the range (d27), so a month reads as 24 rows at most.</>}
      >
        <table className="data">
          <thead>
            <tr>
              <th>Hour</th>
              <th className="num">Avg txns</th>
              <th className="num">Avg value</th>
              <th className="num">Days</th>
            </tr>
          </thead>
          <tbody>
            {data.perHourOfDay.map((h) => (
              <tr key={h.hour}>
                <td>{String(h.hour).padStart(2, "0")}:00</td>
                <td className="num">{h.transactions}</td>
                <td className="num">{money(h.value)}</td>
                <td className="num muted">{h.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section n={7} title="Sales by Employee" collapsed>
        <table className="data">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">Txns</th>
              <th className="num">Items</th>
              <th className="num">Value</th>
              <th className="num">Returns</th>
              <th className="num">Voids</th>
            </tr>
          </thead>
          <tbody>
            {data.byEmployee.map((e) => (
              <tr key={e.employee}>
                <td>{e.employee}</td>
                <td className="num">{e.transactions}</td>
                <td className="num">{e.items}</td>
                <td className="num">{money(e.value)}</td>
                <td className="num">{e.returns || ""}</td>
                <td className="num">{e.voids || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <p className="xsmall muted">
        <strong>Tendering details is absent by design</strong> (d27) — a per-transaction listing does not sum out of a
        stored aggregate, and a year of tender lines is tens of thousands of rows. It is on the close's own report.
      </p>
    </div>
  );
}
