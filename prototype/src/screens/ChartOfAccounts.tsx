import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store/AppStore";
import { ManagerAuthorize } from "../components/ManagerAuthorize";
import { ROLE_PURPOSE, seamsFor, unmappedSeams, type Seams } from "../lib/chart";
import type { GLAccount } from "../data/types";

/**
 * M-07 — Chart of accounts.
 *
 * d9: this flow is configured once and then exported from. There is no
 * dashboard and no balances, because d1 holds none — so this screen is the
 * chart and its mappings, and nothing else.
 *
 * d11 makes it a REVIEW rather than data entry: every seam already has an
 * account and a mapping before the Manager arrives. What they do here is
 * rename and renumber (d3), not build.
 */

const BANDS: { band: number; label: string }[] = [
  { band: 1, label: "Assets" },
  { band: 2, label: "Liabilities" },
  { band: 3, label: "Equity" },
  { band: 4, label: "Revenue" },
  { band: 5, label: "Cost of goods" },
  { band: 6, label: "Expenses" },
  { band: 9, label: "Suspense" },
];

export function ChartOfAccounts() {
  const app = useApp();
  const nav = useNavigate();
  const [authorisedBy, setAuthorisedBy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ number: "", name: "" });

  const seams: Seams = useMemo(
    () => ({ sections: app.sections, tenders: app.tenders, taxTypes: app.taxTypes }),
    [app.sections, app.tenders, app.taxTypes],
  );
  const missing = unmappedSeams(seams, app.glMappings);

  if (!authorisedBy)
    return (
      <ManagerAuthorize
        title="Chart of accounts — manager only"
        reason="The chart is manager-only like every other configuration surface (architecture A-28a). It decides where every movement of money lands, and M-07 d3 makes the numbers and names this shop's own."
        onConfirm={(by) => setAuthorisedBy(by)}
        onCancel={() => nav(-1)}
      />
    );

  const bandOf = (a: GLAccount) => Math.floor(Number(a.number) / 1000);
  const sorted = [...app.glAccounts].sort((a, b) => Number(a.number) - Number(b.number));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Chart of accounts</h1>
        <p className="small muted">
          Authorised by {authorisedBy} · <strong>{app.glAccounts.length} accounts</strong>, every seam mapped
        </p>
        <p className="small muted">
          A chart and a journal export, <strong>not a ledger</strong> (d1). No account here carries a balance, and
          nothing in this system can tell you a profit — the books live with your accountant. Set it up once, then
          export (d9).
        </p>
      </header>

      {/* d11's invariant, checked rather than asserted. An unmapped seam would
          otherwise be discovered at the close, which is the worst moment. */}
      {missing.length > 0 && (
        <p className="wo-caveat warn">
          <strong>{missing.length} seam{missing.length === 1 ? "" : "s"} with no account:</strong>{" "}
          {missing.join(", ")}. Every seam must resolve (d11) — this is what makes a Suspense balance a defect rather
          than a configuration hole.
        </p>
      )}

      {BANDS.map(({ band, label }) => {
        const rows = sorted.filter((a) => bandOf(a) === band);
        return (
          <section key={band}>
            <h2>
              {band}000s · {label}
            </h2>
            {rows.length === 0 ? (
              <p className="small muted">
                {band === 3 ? (
                  <>
                    <strong>Empty on purpose.</strong> d1 runs no period close and holds no equity, so there is no
                    Retained Earnings and no Net Profit here. An accountant seeing no 3000s knows at once that this
                    file does not carry them — renumbering to close the gap would hide the fact.
                  </>
                ) : (
                  "Nothing here yet."
                )}
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Name</th>
                    <th>What the software puts here</th>
                    <th>Posts from</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const posts = seamsFor(a.id, app.glMappings, seams);
                    return (
                      <tr key={a.id}>
                        <td>
                          <input
                            className="mini mono"
                            value={a.number}
                            onChange={(e) => app.updateGLAccount(a.id, { number: e.target.value })}
                          />
                        </td>
                        <td>
                          <input value={a.name} onChange={(e) => app.updateGLAccount(a.id, { name: e.target.value })} />
                        </td>
                        <td className="muted small">
                          {a.role ? ROLE_PURPOSE[a.role] : <em>Yours — nothing posts here by itself (step 3)</em>}
                        </td>
                        <td className="small">
                          {posts.length ? posts.join(", ") : <span className="muted">—</span>}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={a.active}
                            aria-label={`${a.name} active`}
                            onChange={(e) => app.updateGLAccount(a.id, { active: e.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <section>
        {adding ? (
          <div className="wo-sec">
            <span className="lab">New account</span>
            <input
              className="mini mono"
              placeholder="6300"
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
            />
            <input
              placeholder="Rent"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <button
              className="btn ink primary"
              disabled={!draft.number.trim() || !draft.name.trim()}
              onClick={() => {
                app.addGLAccount(draft.number.trim(), draft.name.trim());
                setDraft({ number: "", name: "" });
                setAdding(false);
              }}
            >
              Add
            </button>
            <button className="btn ink" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <p className="small muted">
              An added account carries <strong>no role</strong> (step 3) — nothing posts to it by itself. It exists to
              be pointed at.
            </p>
          </div>
        ) : (
          <button className="btn ink primary" onClick={() => setAdding(true)}>
            ＋ New account
          </button>
        )}
      </section>

      <p className="small muted">
        <strong>The numbers and names are yours</strong> (d3). Nothing in this system resolves an account by its
        number — the reserved ones resolve by role, the rest through a mapping — so renumber the whole chart to match
        what your accountant already keeps and nothing here breaks.
      </p>
      <p className="small muted">
        The starting chart mirrors this system rather than an accountant's habits (d11): a Section each, a{" "}
        <em>tender</em> each rather than a card type (M-06 d22), and <strong>two</strong> accounts per tax — collected
        is a liability, paid is an Input Tax Credit (d5, E-02 d34). <strong>Not yet decided:</strong> whether an
        account carries an explicit <em>type</em>, which the export will need.
      </p>
    </div>
  );
}
