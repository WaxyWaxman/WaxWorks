import { useMemo, useState } from "react";
import type { ManagerAuth } from "../lib/managerAuth";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store/AppStore";
import { ManagerAuthorize } from "../components/ManagerAuthorize";
import { ROLE_PURPOSE, TYPE_LABEL, accountType, seamsFor, unmappedSeams, type Seams } from "../lib/chart";
import type { GLAccountType } from "../data/types";

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

// d22 — grouped by an account's TYPE, derived from its role, and NOT by its
// number: d3 makes the number the store's, and renumbering to match an
// accountant's chart is the first thing a Manager is invited to do. Grouping on
// the number would scramble the moment they did.
const TYPES: GLAccountType[] = ["asset", "liability", "equity", "income", "cogs", "expense"];

export function ChartOfAccounts() {
  const app = useApp();
  const nav = useNavigate();
  const [authorisedBy, setAuthorisedBy] = useState<ManagerAuth | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ number: string; name: string; type: GLAccountType }>({
    number: "",
    name: "",
    type: "expense",
  });

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

  const sorted = [...app.glAccounts].sort((a, b) => Number(a.number) - Number(b.number));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Chart of accounts</h1>
        <p className="small muted">
          Authorised by {authorisedBy.name} · <strong>{app.glAccounts.length} accounts</strong>, every seam resolving
        </p>
        <p className="small muted">
          A chart and a journal export — <strong>this flow</strong> holds no balances (d1, still true of M-07). The
          books themselves live in <strong>Keep the general ledger</strong> (M-08), which d27 reversed d1 to allow:
          Wax Works now runs a period close, states a profit, and keeps the accounts this chart names. Set the chart
          up once here, and read the books there (d9, as amended by M-08 d31).
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

      {TYPES.map((kind) => {
        const rows = sorted.filter((a) => accountType(a) === kind);
        return (
          <section key={kind}>
            <h2>{TYPE_LABEL[kind]}</h2>
            {rows.length === 0 ? (
              <p className="small muted">
                {kind === "equity" ? (
                  <>
                    <strong>Nothing here yet</strong>, which should not happen — d31 seeds{" "}
                    <em>Owner's equity</em> and <em>Retained earnings</em>, and M-08 d17's year-end seal posts into
                    the second. <em>Net Profit</em> and <em>Current Profits</em> are absent on purpose and always
                    will be: M-08 d24 derives both when a statement is drawn and posts neither.
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
            {/* d22 — asked HERE and nowhere else. Every other account derives
                its type from its role; this one has none, so nothing but the
                Manager knows what kind it is. */}
            <select
              aria-label="Account type"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as GLAccountType })}
            >
              {TYPES.map((k) => (
                <option key={k} value={k}>
                  {TYPE_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              className="btn ink primary"
              disabled={!draft.number.trim() || !draft.name.trim()}
              onClick={() => {
                app.addGLAccount(draft.number.trim(), draft.name.trim(), draft.type);
                setDraft({ number: "", name: "", type: "expense" });
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
              be pointed at. Which is also why it is the <em>only</em> account asked for a type: every other one
              derives its type from its role (d22), and this one has no role to derive from.
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
        The starting chart mirrors this system rather than an accountant's habits (d11) — plus the ordinary expense
        accounts d32 seeds, so the first rent posting has somewhere to go. One <strong>Sales</strong> account for all
        revenue (d28), with the Section riding on the line as a dimension rather than as an account of its own; a{" "}
        <em>tender</em> each rather than a card type (M-06 d22), and <strong>two</strong> accounts per tax — collected
        is a liability, paid is an Input Tax Credit (d5, E-02 d34). An account's <em>type</em> is
        <strong>derived from its role</strong> (d22), never from its number — so renumbering the chart cannot scramble
        the grouping above.
      </p>
    </div>
  );
}
