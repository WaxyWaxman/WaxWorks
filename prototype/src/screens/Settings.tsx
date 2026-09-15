import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ManagerAuthorize } from "../components/ManagerAuthorize";
import { SpecNote } from "../components/SpecNote";
import type {
  CurrencyRow,
  DrawerPolicy,
  Genre,
  ReceiptWidth,
  SectionRow,
  TenderRow,
} from "../data/types";
import { useApp, type SettingsWriteResult } from "../store/AppStore";
import { taxTypeUseCount, resolveLineTax } from "../lib/tax";
import { money } from "../lib/money";

// M-06 Settings, on the till's three tracks: the group you are in, the editor,
// and the LOG.
//
// The log is the right track rather than an afterthought because A-52 is the
// decision this screen exists to honour. Before it, changing a tax rate, a
// Section's returnable flag or the price ending left no recorded actor
// anywhere, while M-01 d4 logged every edit to a Supplier's card. Settings now
// hold the figures every Sale resolves through, so a money rule nobody is
// recorded as having changed is worse than a money rule in code — code has a
// commit and a reviewer.
//
// Manager-only in its entirety (architecture A-28a lists "Settings — all of
// it"), so the whole screen is gated on arrival like Users and Accounts
// Payable, and the authorising Manager's name is what every log row carries.
//
// Tax is here, and it is the group that carries the most decisions: two
// tables (d11), a grid of group x product-tax-code cells (d13), one or two
// taxes per cell with optional compounding (d16), and a pending rate change
// entered when it is announced (d52). The worked example at the foot is
// M-06's own, and it recomputes live — so the screen and the till can be seen
// to agree rather than asserted to.

type GroupKey = "sections" | "genres" | "tenders" | "currencies" | "store" | "details" | "tax";

// The tile is not decoration: .hit is a three-column skeleton (tile, two
// lines of name, optional figure) shared with Find, Customers and Suppliers,
// and a row without one collapses its own label.
const GROUPS: { key: GroupKey; tile: string; label: string; blurb: string }[] = [
  { key: "sections", tile: "SE", label: "Sections", blurb: "Reporting categories and what they imply" },
  { key: "genres", tile: "GE", label: "Genres", blurb: "The shelf axis, and what tax it attracts" },
  { key: "tenders", tile: "TE", label: "Tenders", blurb: "What the till can take money as" },
  { key: "currencies", tile: "CU", label: "Currencies", blurb: "Codes and the planning rate" },
  { key: "store", tile: "ST", label: "Store settings", blurb: "The figures other flows read" },
  { key: "details", tile: "SD", label: "Store details", blurb: "What appears on a receipt" },
  { key: "tax", tile: "TX", label: "Tax", blurb: "Types, product codes and the group grid" },
];

export function Settings() {
  const nav = useNavigate();
  const { group } = useParams();
  const [authorisedBy, setAuthorisedBy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const active = (GROUPS.find((g) => g.key === group)?.key ?? "sections") as GroupKey;

  const run = (r: SettingsWriteResult) => {
    setRefusal(r.ok ? null : r.reason);
    return r.ok;
  };

  if (!authorisedBy)
    return (
      <ManagerAuthorize
        title="Settings — manager only"
        reason="Settings are manager-only in their entirety (architecture A-28a). They hold the tax rates every Sale resolves through, the rounding that decides what the drawer takes, and discountability on instruments equivalent to cash — so every change here is recorded against the Manager who authorises."
        onConfirm={(by) => setAuthorisedBy(by)}
        onCancel={() => nav(-1)}
      />
    );

  return (
    <div className="cust-frame">
      <aside className="sup-slab">
        <div className="slab-head">
          <span className="lab">Settings</span>
        </div>
        <div className="slab-list">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={"hit" + (g.key === active ? " on" : "")}
              onClick={() => {
                setRefusal(null);
                nav(`/settings/${g.key}`);
              }}
            >
              <span className="ini">{g.tile}</span>
              <span style={{ minWidth: 0 }}>
                <span className="t" style={{ display: "block" }}>
                  {g.label}
                </span>
                <span className="m" style={{ display: "block" }}>
                  {g.blurb}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="cust-main">
        <div className="cust-head">
          <h2>{GROUPS.find((g) => g.key === active)?.label}</h2>
          <span className="small muted">Authorised by {authorisedBy}</span>
        </div>
        <div className="cust-scroll">
          <div className="stack">
            {refusal && <div className="callout danger">{refusal}</div>}
            {active === "sections" && <SectionsEditor by={authorisedBy} onRun={run} />}
            {active === "genres" && <GenresEditor by={authorisedBy} onRun={run} />}
            {active === "tenders" && <TendersEditor by={authorisedBy} onRun={run} />}
            {active === "currencies" && <CurrenciesEditor by={authorisedBy} onRun={run} />}
            {active === "store" && <StoreSettingsEditor by={authorisedBy} />}
            {active === "details" && <StoreDetailsEditor by={authorisedBy} />}
            {active === "tax" && <TaxEditor by={authorisedBy} onRun={run} />}
          </div>
        </div>
      </section>

      <SettingsLog />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionsEditor({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();
  const [draft, setDraft] = useState<SectionRow | null>(null);

  const save = (row: SectionRow) => onRun(app.upsertSection(row, by));

  return (
    <>
      <p className="small muted">
        The top-level reporting category; genres roll up into them (d5).{" "}
        <SpecNote cite="M-06 d28, d29, d30, d20">
          An editable table, not a fixed list. <strong>Counts as revenue</strong> is a property of
          the Section (d20) — freight is not revenue and a gift card load is a liability.{" "}
          <strong>Tracks stock</strong> is only the default; whether a thing tracks stock stays a
          property of the catalog entry (d29). <strong>Discountable</strong> and{" "}
          <strong>returnable</strong> are not gates (d30) — they are a property of what is being
          sold, not of who is selling it, which is why they live here and not in M-04.
        </SpecNote>
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Revenue</th>
            <th>Tracks stock</th>
            <th>Discountable</th>
            <th>Returnable</th>
            <th>Dead stock</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {app.sections.map((sec) => (
            <tr key={sec.code}>
              <td className="mono">{sec.code}</td>
              <td>
                {sec.name}
                {sec.systemOwned && <span className="badge"> system</span>}
              </td>
              <Flag on={sec.countsAsRevenue} onChange={(v) => save({ ...sec, countsAsRevenue: v })} />
              <Flag on={sec.tracksStockDefault} onChange={(v) => save({ ...sec, tracksStockDefault: v })} />
              <Flag on={sec.discountable} onChange={(v) => save({ ...sec, discountable: v })} />
              <Flag on={sec.returnable} onChange={(v) => save({ ...sec, returnable: v })} />
              <td>
                <input
                  className="mini"
                  value={sec.deadStockDays ?? ""}
                  placeholder={String(app.storeSettings.deadStockDays)}
                  onChange={(e) =>
                    save({ ...sec, deadStockDays: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </td>
              <Flag on={sec.active} onChange={(v) => save({ ...sec, active: v })} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Nothing is ever removed — a Section is deactivated and stops being offered (d9, d28). The
        dead-stock column is blank where the Section takes the store's {app.storeSettings.deadStockDays} days (d40).
      </p>
      {draft ? (
        <div className="stack callout">
          <label className="field">
            <span>Code — two characters</span>
            <input value={draft.code} maxLength={2} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </label>
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <div className="btn-row">
            <button
              className="btn primary sm"
              onClick={() => {
                if (save(draft)) setDraft(null);
              }}
            >
              Add Section
            </button>
            <button className="btn ghost sm" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn ghost sm"
          onClick={() =>
            setDraft({
              code: "",
              name: "",
              countsAsRevenue: true,
              tracksStockDefault: true,
              discountable: true,
              returnable: true,
              active: true,
            })
          }
        >
          ＋ New Section
        </button>
      )}
    </>
  );
}

function Flag({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <td>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </td>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

// M-06 d12, d19, d32 — the shop's own taxonomy. Finer than a Section, and the
// thing a Record actually stores: its Section is derived from the parent here
// (d31), and its product tax code is read from here at the scan (d12).
function GenresEditor({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();
  const [draft, setDraft] = useState<Genre | null>(null);

  const save = (row: Genre) => onRun(app.upsertGenre(row, by));

  return (
    <>
      <p className="small muted">
        Finer than a Section, and the axis a Record is actually filed on (d5, d12).{" "}
        <SpecNote cite="M-06 d12, d19, d32; A-59, A-60">
          <strong>The parent Section is required</strong> (d32), which is what lets a Record derive
          its Section instead of storing one (d31) — so changing it here moves every Record under
          this genre in <strong>M-03</strong>&rsquo;s <em>By Section</em> at once. The{" "}
          <strong>product tax code</strong> is carried here (d12), so it decides the tax on every
          line beneath it. <strong>Creating a genre is manager-only</strong> even though adding a
          genre-map row will not be (A-59): a genre carries policy, a map row carries none.
        </SpecNote>
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Parent Section</th>
            <th>Tax code</th>
            <th>In use</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {app.genres.map((g) => {
            const used = app.genreUseCount(g.id);
            return (
              <tr key={g.id}>
                <td>
                  <input
                    defaultValue={g.name}
                    onBlur={(e) => save({ ...g, name: e.target.value })}
                  />
                  {/* d17, d19 — omitted from the pickers rather than gated, so a
                      music Record cannot be filed under Freight at all. */}
                  {g.internal && <span className="badge"> shop-internal</span>}
                  {g.systemOwned && <span className="badge"> system</span>}
                </td>
                <td>
                  <select value={g.section} onChange={(e) => save({ ...g, section: e.target.value })}>
                    {app.sections.map((sec) => (
                      <option key={sec.code} value={sec.code}>
                        {sec.code} · {sec.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={g.productTaxCode}
                    onChange={(e) => save({ ...g, productTaxCode: e.target.value })}
                  >
                    {app.productTaxCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.description}
                      </option>
                    ))}
                  </select>
                </td>
                {/* Derived, not stored — it is what makes the delete refusal
                    legible rather than a flat no. */}
                <td className="small muted">{used > 0 ? `${used} entr${used === 1 ? "y" : "ies"}` : "unused"}</td>
                <Flag on={g.active} onChange={(v) => save({ ...g, active: v })} />
                <td>
                  <button
                    className="btn sm"
                    onClick={() => onRun(app.deleteGenre(g.id, by))}
                    disabled={used > 0 || !!g.systemOwned}
                    title={
                      g.systemOwned
                        ? "Written by the system — the gift card load resolves through it (d18)"
                        : used > 0
                          ? "Carried by catalog entries — deactivate instead (A-54)"
                          : "Delete"
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">
        A genre carried by any catalog entry <strong>cannot be deleted</strong> — deletion is
        gated by state, not by role (A-54). Switch it off instead and it stops being offered without
        moving anything (d9). <strong>Merge</strong>, which empties a genre by repointing everything
        under it, arrives with the genre map (A-60), because it has to repoint the map rows too.
      </p>
      {draft ? (
        <div className="stack callout">
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Parent Section — required (d32)</span>
            <select value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })}>
              {app.sections.map((sec) => (
                <option key={sec.code} value={sec.code}>
                  {sec.code} · {sec.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Product tax code — required (d12)</span>
            <select
              value={draft.productTaxCode}
              onChange={(e) => setDraft({ ...draft, productTaxCode: e.target.value })}
            >
              {app.productTaxCodes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.description}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button
              className="btn primary sm"
              onClick={() => {
                if (save(draft)) setDraft(null);
              }}
            >
              Add genre
            </button>
            <button className="btn sm" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn sm"
          onClick={() =>
            setDraft({
              // The id is the stable key a Record points at; the name is only
              // a label, so renaming later moves nothing beneath it.
              id: `gn-${Date.now().toString(36)}`,
              name: "",
              section: app.sections[0]?.code ?? "",
              productTaxCode: app.productTaxCodes[0]?.code ?? "",
              active: true,
            })
          }
        >
          + New genre
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function TendersEditor({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();
  const save = (row: TenderRow) => onRun(app.upsertTender(row, by));

  return (
    <>
      <p className="small muted">
        Display names are configurable; behaviours are not (d4).{" "}
        <SpecNote cite="M-06 d22, d23, d24, d26">
          <strong>Many tenders may share one behaviour</strong> — Visa and Mastercard both settle
          as a card — which is why the name is a row and the behaviour is a fixed list. A tender
          carries <strong>no reference field</strong> (d24): no cheque number, no authorisation
          code. <strong>Cash rounding</strong> is its own tender, written by the system and never
          offered at the till (d26), so it is shown here and cannot be renamed or switched off.
        </SpecNote>
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Behaviour</th>
            <th>GL code</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {app.tenders.map((t) => (
            <tr key={t.id}>
              <td>
                <input
                  value={t.name}
                  disabled={t.systemOwned}
                  onChange={(e) => save({ ...t, name: e.target.value })}
                />
                {t.systemOwned && <span className="badge"> system</span>}
              </td>
              <td className="muted">{t.behavior}</td>
              <td>
                <input
                  className="mini"
                  value={t.glCode ?? ""}
                  placeholder="—"
                  onChange={(e) => save({ ...t, glCode: e.target.value || undefined })}
                />
              </td>
              <Flag on={t.active} onChange={(v) => save({ ...t, active: v })} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        The GL code is reserved and unread — nothing in this system posts to a general ledger yet
        (d23).
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

function CurrenciesEditor({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();
  const save = (row: CurrencyRow) => onRun(app.upsertCurrency(row, by));

  return (
    <>
      <p className="small muted">
        One rate per currency, maintained by hand (d33, d38).{" "}
        <SpecNote cite="M-06 d33, d34, d37, d38">
          It is a <strong>planning rate the shop sets conservatively</strong> — there is no
          separate buffer (d38 supersedes d36's). Each rate carries{" "}
          <strong>the date it was last set</strong>, because the staleness risk is answered by
          showing the date rather than by hiding it (d33). A converted figure is{" "}
          <strong>presentation and never a stored amount</strong> (d37).
        </SpecNote>
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Rate</th>
            <th>Last set</th>
            <th>Home</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {app.currencies.map((c) => (
            <tr key={c.code}>
              <td className="mono">{c.code}</td>
              <td>{c.name}</td>
              <td>
                <input
                  className="mini"
                  value={c.rate}
                  disabled={c.code === app.homeCurrency}
                  onChange={(e) => save({ ...c, rate: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="muted mono">{c.code === app.homeCurrency ? "—" : c.rateSetOn}</td>
              <td>
                <input
                  type="radio"
                  name="home"
                  checked={c.code === app.homeCurrency}
                  onChange={() => app.setHomeCurrency(c.code, by)}
                />
              </td>
              <Flag on={c.active} onChange={(v) => save({ ...c, active: v })} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        The home currency is {app.homeCurrency} and every figure is denominated against it (d34).
        Its own rate is 1 by definition, so it is not editable. Changing a rate stamps today's date
        — the shop does not type it.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

function StoreSettingsEditor({ by }: { by: string }) {
  const app = useApp();
  const st = app.storeSettings;
  return (
    <>
      <p className="small muted">
        The figures other flows read. Each is a store setting rather than a constant because A-5
        scopes everything to a Store.
      </p>

      <label className="field">
        <span>
          Session lapse — minutes of inactivity{" "}
          <SpecNote cite="M-06 d45, E-01 d13, d21">
            Defaults to 5 minutes and takes <strong>no maximum</strong> (E-01 d13): in v1 it is
            ergonomics rather than security, because there are no required passwords and what it
            prevents is accidental misattribution. It measures <em>inactivity</em>, so an hour of
            continuous work never prompts. A user who <em>has</em> a password is capped at 5
            minutes whatever is set here (E-01 d21), and an Open Sale suppresses it entirely (d10).
          </SpecNote>
        </span>
        <input
          className="mini"
          value={Math.round(st.sessionLapseSeconds / 60)}
          onChange={(e) => app.setStoreSetting("sessionLapseSeconds", Math.max(1, Number(e.target.value) || 1) * 60, by)}
        />
      </label>

      <label className="field">
        <span>
          Price ending — minor units{" "}
          <SpecNote cite="M-06 d44, A-49">
            One ending, not a list: a shop prices at <code>.99</code> or <code>.95</code> or{" "}
            <code>.00</code>, and two endings is a habit rather than a rule. Rounding is to the{" "}
            <strong>nearest</strong> instance and is always <strong>advisory</strong> — no column,
            trigger or function rejects an unrounded amount.
          </SpecNote>
        </span>
        <select
          value={st.priceEndingMinor}
          onChange={(e) => app.setStoreSetting("priceEndingMinor", Number(e.target.value), by)}
        >
          <option value={99}>.99</option>
          <option value={95}>.95</option>
          <option value={0}>.00</option>
        </select>
      </label>

      <label className="field">
        <span>Dead-stock threshold — days (d40)</span>
        <input
          className="mini"
          value={st.deadStockDays}
          onChange={(e) => app.setStoreSetting("deadStockDays", Number(e.target.value) || 0, by)}
        />
      </label>

      <label className="field">
        <span>Stream aging threshold — days (d41)</span>
        <input
          className="mini"
          value={st.streamAgingDays}
          onChange={(e) => app.setStoreSetting("streamAgingDays", Number(e.target.value) || 0, by)}
        />
      </label>

      <label className="field">
        <span>
          Cash drawer{" "}
          <SpecNote cite="M-06 d25">
            <strong>This setting does nothing in v1 and must not read as though it does.</strong> A
            browser cannot kick a drawer — it is driven off a receipt printer's drawer port, which
            arrives with the print agent A-8 defers. The setting is recorded now and the prototype
            mocks the kick.
          </SpecNote>
        </span>
        <select
          value={st.drawerPolicy}
          onChange={(e) => app.setStoreSetting("drawerPolicy", e.target.value as DrawerPolicy, by)}
        >
          <option value="cash">Cash tenders only</option>
          <option value="every">Every Sale</option>
          <option value="never">Never</option>
        </select>
      </label>

      <label className="field">
        <span>
          Receipt width{" "}
          <SpecNote cite="M-06 d50">
            A fact about the hardware on that counter. 80mm is roughly 42–48 characters, which
            fits a title, a quantity and a price on one line. <em>Accepted consequence:</em> a
            width set wrong prints a receipt that is wrong in a way nothing can detect — there is
            no print agent, so no printer can report what it actually is.
          </SpecNote>
        </span>
        <select
          value={st.receiptWidth}
          onChange={(e) => app.setStoreSetting("receiptWidth", e.target.value as ReceiptWidth, by)}
        >
          <option value="80mm">80mm</option>
          <option value="58mm">58mm</option>
          <option value="letter">Letter</option>
        </select>
      </label>
    </>
  );
}

// ---------------------------------------------------------------------------

function StoreDetailsEditor({ by }: { by: string }) {
  const app = useApp();
  const d = app.storeDetails;
  const set = (k: Parameters<typeof app.setStoreDetail>[0], v: string | boolean) =>
    app.setStoreDetail(k, v, by);

  return (
    <>
      <label className="field">
        <span>Legal name — the entity, on outbound customer invoices</span>
        <input defaultValue={d.legalName} onBlur={(e) => set("legalName", e.target.value)} />
      </label>
      <label className="field">
        <span>Trading name — the name on the door, on receipts (d46)</span>
        <input defaultValue={d.tradingName} onBlur={(e) => set("tradingName", e.target.value)} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input defaultValue={d.phone} onBlur={(e) => set("phone", e.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input defaultValue={d.email} onBlur={(e) => set("email", e.target.value)} />
      </label>
      <label className="field">
        <span>Website</span>
        <input defaultValue={d.website} onBlur={(e) => set("website", e.target.value)} />
      </label>

      <label className="field">
        <span>
          Receipt footer{" "}
          <SpecNote cite="M-06 d46">
            Free text with its own on/off flag — the return policy lives here.
          </SpecNote>
        </span>
        <textarea defaultValue={d.receiptFooter} rows={2} onBlur={(e) => set("receiptFooter", e.target.value)} />
      </label>
      <label className="field">
        <span>Print the footer</span>
        <input
          type="checkbox"
          checked={d.receiptFooterOn}
          onChange={(e) => set("receiptFooterOn", e.target.checked)}
        />
      </label>

      <div className="field">
        <span>
          Logo{" "}
          <SpecNote cite="M-06 d51, A-56">
            An <strong>uploaded image</strong> — PNG or JPEG, 512 KB — and never a URL. Embedding a
            Manager-supplied URL in an email the same Manager can address to themselves is a way
            out of the tenancy, so the capability was removed rather than bounded. Not wired in the
            prototype: there is nothing to upload to.
          </SpecNote>
        </span>
        <div className="callout small muted">Upload is not modelled — see the note.</div>
      </div>

      <div className="field">
        <span>
          Store ID and position{" "}
          <SpecNote cite="M-06 d47, M-04 d11">
            <strong>Assigned, never editable</strong> — by us, when the Store is set up, alongside
            its authentication. There is no screen, function or role that changes them, which is
            why there is no tier above Manager holding that power: the write happens before the
            shop exists as a tenant, so the actor is outside the role model rather than above it.
          </SpecNote>
        </span>
        <div className="btn-row">
          <span className="mono">{d.storeId}</span>
          <span className="muted">· position {d.position}</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function TaxEditor({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();

  return (
    <>
      <p className="small muted">
        Tax resolves from <strong>two axes that never compete</strong> (d14): who the customer is —
        their tax group, else the store's default — and what the product is — the Genre's product
        tax code. Neither overrides the other; they are the two coordinates of one lookup.
      </p>

      <h3>Tax types</h3>
      <p className="small muted">
        One row per tax that <em>exists</em>, shared by every group that charges it, so a
        legislated rate change is edited once (d11).{" "}
        <SpecNote cite="M-06 d11, d48, d52, A-47, A-58">
          A rate is an integer of <strong>parts per million</strong> — QST is 9.975%, which basis
          points could not hold (A-47). The <strong>registration number sits on the type</strong>,
          not in store details, because GST and QST are separate registrations and a receipt
          carries each beside its own tax (d48). A type may carry <strong>one pending change</strong>
          — the new rate and the date it starts — so a legislated change is entered when it is
          announced and lands by the clock (d52, A-58).
        </SpecNote>
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Rate %</th>
            <th>Pending %</th>
            <th>From</th>
            <th>Registration</th>
            <th>In use</th>
          </tr>
        </thead>
        <tbody>
          {app.taxTypes.map((t) => (
            <tr key={t.code}>
              <td className="mono">{t.code}</td>
              <td>{t.name}</td>
              <td>
                <input
                  className="mini"
                  defaultValue={t.ratePpm / 10000}
                  onBlur={(e) =>
                    onRun(app.upsertTaxType({ ...t, ratePpm: Math.round(Number(e.target.value) * 10000) }, by))
                  }
                />
              </td>
              <td>
                <input
                  className="mini"
                  defaultValue={t.pendingRatePpm !== undefined ? t.pendingRatePpm / 10000 : ""}
                  placeholder="—"
                  onBlur={(e) =>
                    onRun(
                      app.upsertTaxType(
                        {
                          ...t,
                          pendingRatePpm: e.target.value ? Math.round(Number(e.target.value) * 10000) : undefined,
                          pendingFrom: e.target.value ? t.pendingFrom ?? "" : undefined,
                        },
                        by,
                      ),
                    )
                  }
                />
              </td>
              <td>
                <input
                  className="mini"
                  defaultValue={t.pendingFrom ?? ""}
                  placeholder="YYYY-MM-DD"
                  onBlur={(e) =>
                    onRun(app.upsertTaxType({ ...t, pendingFrom: e.target.value || undefined }, by))
                  }
                />
              </td>
              <td>
                <input
                  defaultValue={t.registrationNumber ?? ""}
                  placeholder="—"
                  onBlur={(e) =>
                    onRun(app.upsertTaxType({ ...t, registrationNumber: e.target.value || undefined }, by))
                  }
                />
              </td>
              {/* d57, A-63 — not a switch. A tax type is live where a cell
                  names it, so this reports the cells rather than offering a
                  second control that could disagree with them. Clearing the
                  letter from the grid below is what stops a tax. */}
              <td className="small muted">
                {taxTypeUseCount(app.taxGroupCells, t.code) > 0
                  ? `${taxTypeUseCount(app.taxGroupCells, t.code)} cell(s)`
                  : "unused"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        A pending change needs <strong>both</strong> a rate and the date it starts. Only one can be
        queued: a second replaces it, and a pending change whose date has passed is promoted into
        the current rate first, so an elapsed one is never silently dropped (d52).
      </p>
      <NewTaxType by={by} onRun={onRun} />

      <h3>Product tax codes</h3>
      <p className="small muted">
        Carried by <strong>Genre</strong> (d12) — a bare letter sitting on a genre is tribal
        knowledge, so each has a description beside it.
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {app.productTaxCodes.map((c) => (
            <tr key={c.code}>
              <td className="mono">{c.code}</td>
              <td>{c.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Tax groups</h3>
      <p className="small muted">
        A jurisdiction or customer class, with one cell per product tax code.{" "}
        <SpecNote cite="M-06 d13, d15, d16">
          <strong>Stored as rows, drawn as a grid</strong> — storage shape and screen shape are
          decoupled deliberately (d13). A cell names one or two tax type letters, or is blank. A
          trailing <code>+</code> compounds the second on the first: <code>ab</code> charges both
          on the subtotal, <code>ab+</code> charges b on subtotal plus a. <strong>Blank and
          zero-rated are different and both are kept</strong> (d15) — blank is out of scope and
          reports nothing; a zero-rate type is taxable at 0% and <em>is</em> reportable.
        </SpecNote>
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Group</th>
            <th>Short</th>
            {app.productTaxCodes.map((c) => (
              <th key={c.code} title={c.description}>
                {c.code}
              </th>
            ))}
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          {app.taxGroups.map((g) => (
            <tr key={g.id}>
              <td>{g.description}</td>
              <td className="mono">{g.shortName}</td>
              {app.productTaxCodes.map((c) => {
                const cell = app.taxGroupCells.find(
                  (x) => x.groupId === g.id && x.productTaxCode === c.code,
                );
                return (
                  <td key={c.code}>
                    <input
                      className="mini"
                      defaultValue={cell?.spec ?? ""}
                      placeholder="—"
                      onBlur={(e) => onRun(app.setTaxCell(g.id, c.code, e.target.value, by))}
                    />
                  </td>
                );
              })}
              <td>
                <input
                  type="radio"
                  name="defaultGroup"
                  checked={g.id === app.defaultTaxGroup}
                  onChange={() => app.setDefaultTaxGroup(g.id, by)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        The default group applies to a Sale with no Customer, or a Customer who has none of their
        own (d14). A blank cell means out of scope — <code>{"\u2014"}</code> here, and no tax line at
        all on the receipt.
      </p>
      <NewTaxGroup by={by} onRun={onRun} />

      <WorkedExample />
    </>
  );
}

// Adding a tax type. Nothing is ever deleted (d9) — a type that stops
// applying is deactivated, because cells and completed Sales reference it.
function NewTaxType({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  if (!open)
    return (
      <button className="btn ghost sm" onClick={() => setOpen(true)}>
        ＋ New tax type
      </button>
    );

  return (
    <div className="stack callout">
      <div className="btn-row">
        <label className="field">
          <span>Code — one letter</span>
          <input className="mini" value={code} maxLength={1} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="field">
          <span>Name</span>
          <input value={name} placeholder="e.g. PST (BC)" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Rate %</span>
          <input className="mini" value={rate} placeholder="7" onChange={(e) => setRate(e.target.value)} />
        </label>
      </div>
      <div className="btn-row">
        <button
          className="btn primary sm"
          onClick={() => {
            const ok = onRun(
              app.upsertTaxType(
                {
                  code: code.trim().toLowerCase(),
                  name: name.trim(),
                  ratePpm: Math.round(Number(rate) * 10000),
                },
                by,
              ),
            );
            if (ok) {
              setCode("");
              setName("");
              setRate("");
              setOpen(false);
            }
          }}
        >
          Add tax type
        </button>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="small muted">
        The letter is what composes a cell — a new type is charged nowhere until a cell names it.
        Existing cells and completed Sales are untouched (d8).
      </div>
    </div>
  );
}

// Adding a tax group. A new group starts with EVERY CELL BLANK, which is out
// of scope rather than zero-rated (d15) — a jurisdiction charges nothing until
// somebody says what it charges, and blank is the honest starting state.
function NewTaxGroup({ by, onRun }: { by: string; onRun: (r: SettingsWriteResult) => boolean }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [shortName, setShortName] = useState("");

  if (!open)
    return (
      <button className="btn ghost sm" onClick={() => setOpen(true)}>
        ＋ New tax group
      </button>
    );

  return (
    <div className="stack callout">
      <div className="btn-row">
        <label className="field">
          <span>Description</span>
          <input
            value={description}
            placeholder="e.g. Manitoba"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            ShortName — up to 4{" "}
            <SpecNote cite="M-06 d11, E-07">
              This is what appears on a Customer's card, so it has to be readable at a glance
              rather than a code somebody has to look up.
            </SpecNote>
          </span>
          <input className="mini" value={shortName} maxLength={4} onChange={(e) => setShortName(e.target.value)} />
        </label>
      </div>
      <div className="btn-row">
        <button
          className="btn primary sm"
          onClick={() => {
            const ok = onRun(
              app.upsertTaxGroup(
                { id: `tg-${shortName.trim().toLowerCase() || Date.now()}`, description, shortName, active: true },
                by,
              ),
            );
            if (ok) {
              setDescription("");
              setShortName("");
              setOpen(false);
            }
          }}
        >
          Add tax group
        </button>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="small muted">
        It starts with every cell blank — out of scope, charging nothing, until you fill the grid
        in. That is deliberate: a new jurisdiction that silently charged the standard rate would be
        the worse default.
      </div>
    </div>
  );
}

// M-06 states a worked example in the flow itself, and it is the clearest
// possible check that this screen and the till agree: change the Quebec `1`
// cell between `ab` and `ab+` and the figures below move to match the spec.
function WorkedExample() {
  const app = useApp();
  const net = 29.99;
  const spec = app.taxGroupCells.find((c) => c.groupId === "tg-qc" && c.productTaxCode === "1")?.spec ?? "";
  const parts = resolveLineTax(net, spec, app.taxTypes, new Date().toISOString().slice(0, 10));
  const total = parts.reduce((n, p) => n + p.amount, 0);
  return (
    <div className="callout">
      <strong>Worked example — $29.99, Quebec, product tax code 1</strong>
      <table className="data">
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td className="mono">{money(net)}</td>
          </tr>
          {parts.map((p) => (
            <tr key={p.code}>
              <td>
                {p.name} — {p.ratePpm / 10000}%
              </td>
              <td className="mono">{money(p.amount)}</td>
            </tr>
          ))}
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td className="mono">
              <strong>{money(net + total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="small muted">
        Cell <code>{spec || "(blank)"}</code>. M-06 gives <code>ab</code> as 34.48 and{" "}
        <code>ab+</code> as 34.63 — fifteen cents apart, because each tax rounds to the cent as it
        is applied and the evaluation order is the instruction.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SettingsLog() {
  const app = useApp();
  return (
    <aside className="cust-acct">
      <div className="cust-head">
        <h3>Log</h3>
      </div>
      <div className="cust-scroll">
        <div className="stack">
          <div className="callout small">
            <strong>Every settings write is logged with its actor</strong>
            <div className="muted">
              Actor, timestamp, the key touched, and the values <strong>before and after</strong>{" "}
              (A-52). Before and after, not just after, because the question asked afterwards is
              always <em>what did this used to be</em> — and d8's never-retroactive rule makes the
              old value the only record of what yesterday's Sales were computed against.
            </div>
          </div>
          {app.settingsLog.length === 0 ? (
            <p className="small muted">Nothing changed this session. Edit something to see it here.</p>
          ) : (
            <ul className="loglist">
              {[...app.settingsLog].reverse().map((l, i) => (
                <li key={i}>
                  <span className="small muted">
                    {l.at.replace("T", " ")} · {l.actor}
                  </span>
                  <div>
                    <strong>
                      {l.group} · {l.key}
                    </strong>
                  </div>
                  <div className="small">
                    <span className="muted">was</span> {l.before}
                  </div>
                  <div className="small">
                    <span className="muted">now</span> {l.after}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
