import { useState } from "react";
import { Modal } from "./Modal";
import type { ProviderTag, RecordEntry, ReleaseCacheEntry } from "../data/types";
import { useApp } from "../store/AppStore";
import { selectableGenres, sectionLabelFor } from "../lib/taxonomy";

// M-06 d53, d55, d56 — the adoption prompt.
//
// Genre is resolved ONCE, at adoption into the local catalog, and never
// re-resolved (d53). The map runs first (A-61: highest priority, ties by the
// provider's vote count); a hit auto-fills and this never opens. A miss opens
// this, and the operator cannot move on without answering, because d17 makes
// genre mandatory on every sellable thing and leaves a genre-less sellable
// thing nowhere to go.
//
// A TAG-LESS RELEASE AND AN UNMAPPED TAG ARE ONE PATH, NOT TWO. Both prompt
// identically. The only difference is that a release carrying no tags has
// nothing to key a map row on, so the offer below simply isn't there.

export function AdoptRelease({
  release,
  unmapped,
  by,
  onAdopted,
  onCancel,
}: {
  release: ReleaseCacheEntry;
  unmapped: ProviderTag[];
  by: string;
  onAdopted: (rec: RecordEntry) => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const offered = selectableGenres(app.genres);
  const [genreId, setGenreId] = useState("");
  // d53 — the tag a map row would be written against: the best-voted one the
  // map does not already cover. Undefined where the release carried no tags.
  const mappableTag = unmapped[0];
  const [alsoMap, setAlsoMap] = useState(Boolean(mappableTag));

  const confirm = () => {
    if (!genreId) return;
    // A-59 — adding a row for a tag that has none is an UNGATED EMPLOYEE
    // action, logged with the Employee as actor. It is purely additive and
    // cannot change where anything already goes; changing a row is what stays
    // manager-only. A row is never inferred: only the tag the operator was
    // actually shown gets one.
    if (alsoMap && mappableTag) app.addMapRow(mappableTag.tag, genreId, by);
    const rec = app.adoptRelease(release.id, genreId);
    if (rec) onAdopted(rec);
  };

  return (
    // d55 — Escape abandons the ADOPTION, not merely the dialog, following
    // E-01 d19. No Record is created, and at the receiving desk the scan that
    // triggered it is discarded rather than parked: a scan suspended between
    // phases is state the screen cannot show and the operator cannot reason
    // about.
    <Modal title={`Genre — ${release.artist} — ${release.title}`} onClose={onCancel}>
      <div className="stack">
        <p className="small muted">
          Pulling this into the local catalog. The catalog provider supplies everything else; genre
          is ours, so it is asked for here <em>(E-03 d6, M-06 d53)</em>. Escape abandons the whole
          adoption and discards the scan <em>(d55)</em>.
        </p>

        <div className="callout">
          {release.tags?.length ? (
            <>
              <strong>Provider tags:</strong>{" "}
              {release.tags.map((t) => (
                <span key={t.tag} className="badge" style={{ marginRight: 4 }}>
                  {t.tag} · {t.votes}
                </span>
              ))}
              <div className="small muted" style={{ marginTop: 6 }}>
                None of these is mapped to one of our genres yet, so there is nothing to auto-fill
                from.
              </div>
            </>
          ) : (
            <div className="small muted">
              <strong>The provider carries no genre tags for this release.</strong> That is a
              different state from an unmapped tag, and it is why there is no map row to offer
              below — there is nothing to key one on <em>(d53)</em>.
            </div>
          )}
        </div>

        <label className="field">
          <span>Genre — required (d17)</span>
          <select value={genreId} onChange={(e) => setGenreId(e.target.value)} autoFocus>
            <option value="">Choose a genre…</option>
            {offered.map((g) => (
              <option key={g.id} value={g.id}>
                {/* d56 — the product tax code's description sits beside the
                    genre, quietly. d12 put a description on every code because
                    a bare letter is tribal knowledge, and this is the one
                    moment somebody chooses that code deliberately. */}
                {g.name} · {sectionLabelFor(app.genres, app.sections, g.id)} ·{" "}
                {app.productTaxCodes.find((c) => c.code === g.productTaxCode)?.description ??
                  g.productTaxCode}
              </option>
            ))}
          </select>
        </label>

        {mappableTag && (
          <label className="row small">
            <input
              type="checkbox"
              checked={alsoMap}
              onChange={(e) => setAlsoMap(e.target.checked)}
            />
            <span>
              Also map <strong>{mappableTag.tag}</strong> to this genre, so the next release tagged
              that way fills itself in. <em>(A-59 — an Employee may add a row for a tag that has
              none; changing one stays manager-only.)</em>
            </span>
          </label>
        )}

        <div className="row">
          <button className="btn primary" disabled={!genreId} onClick={confirm}>
            Add to catalog
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
