import { useState } from "react";
import { AdoptRelease } from "./AdoptRelease";
import { SpecNote } from "./SpecNote";
import type { RecordEntry, ReleaseCacheEntry } from "../data/types";
import { useApp } from "../store/AppStore";

// E-03 d18 — a provider match is BROWSABLE. Opening one writes nothing.
//
// Decision 5 exists so "we can order it" is answerable in place, which means
// somebody at the counter with a customer has to be able to read this without
// it landing in the shop's catalog. Adopting on view would file every title
// anyone ever asked about, permanently and silently.
//
// So this is deliberately NOT a titlecard. It has no copies, no stock, no
// genre and no Section, because there is nothing for those to sit on until
// adoption (architecture A-6). What it has is what the provider supplied, and
// one act that brings it in.

export function ReleaseSelection({
  release,
  by,
  onAdopted,
}: {
  release: ReleaseCacheEntry;
  by: string;
  onAdopted: (rec: RecordEntry) => void;
}) {
  const app = useApp();
  const [adopting, setAdopting] = useState(false);
  const { match, unmapped } = app.resolveAdoptionGenre(release.id);

  return (
    <div className="find-selection">
      <div className="find-head">
        <span className="art lg">{release.art}</span>
        <div style={{ minWidth: 0 }}>
          <h2>
            {release.artist} — {release.title}
          </h2>
          <div className="small muted">
            {release.label} · {release.catalogNo} · {release.year} · {release.country}
          </div>
        </div>
      </div>

      <div className="callout">
        <strong>Not in our catalog.</strong> This is what the catalog provider knows about the
        pressing — reading it changes nothing.{" "}
        <SpecNote cite="E-03 d5, d18, d19, d20; M-06 d53">
          Decision 5 exists so <em>&ldquo;we can order it&rdquo;</em> is answerable in place, which
          means browsing has to be free. Adoption is triggered by the first act that{" "}
          <strong>changes</strong> something — ordering it, stocking it, editing it, or putting it
          on a sale line ([E-05] d34) — never by looking. It carries{" "}
          <strong>tags and no genre</strong> because our genre is a different thing from a provider
          tag (M-06 d6), and there is no Record for one to sit on yet.
        </SpecNote>
      </div>

      <div className="find-scroll">
        <div className="fact-grid">
          <Fact k="Format" v={release.format} />
          <Fact k="Year / country" v={`${release.year} · ${release.country}`} />
          <Fact k="Manufacturer UPC" v={release.manufacturerUpc ?? "— (none on sleeve)"} />
          <Fact
            k="Provider tags"
            v={
              release.tags?.length ? (
                <>
                  {release.tags.map((t) => (
                    <span key={t.tag} className="badge" style={{ marginRight: 4 }}>
                      {t.tag} · {t.votes}
                    </span>
                  ))}
                </>
              ) : (
                "— (the provider carries none for this release)"
              )
            }
          />
          {/* The genre the map WOULD resolve, shown before committing to it.
              Nothing is written until the act below. */}
          <Fact
            k="Genre on adoption"
            v={
              match ? (
                <>
                  {app.genres.find((g) => g.id === match.genreId)?.name}{" "}
                  <span className="small muted">via {match.matchedTag}</span>
                </>
              ) : (
                <em>{unmapped.length ? "unmapped — we'll be asked" : "we'll be asked"}</em>
              )
            }
          />
        </div>
      </div>

      <div className="row">
        <button className="btn primary" onClick={() => setAdopting(true)}>
          Add to catalog
        </button>
      </div>

      {adopting && (
        <AdoptRelease
          release={release}
          unmapped={unmapped}
          defaultGenreId={match?.genreId}
          by={by}
          onAdopted={(rec) => {
            setAdopting(false);
            onAdopted(rec);
          }}
          onCancel={() => setAdopting(false)}
        />
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fact">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}
