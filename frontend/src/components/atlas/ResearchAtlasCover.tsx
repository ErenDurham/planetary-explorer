import { useState } from "react";
import { useImageryFor } from "@/hooks/usePairImagery";
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import { coverageKind } from "@/lib/comparison";
import { formatLatLon } from "@/lib/format";
import type { Site } from "@/types";
import { ContourArtwork } from "./AtlasSurface";
import styles from "./atlas.module.css";

/** A sourced image-led dossier cover. Missing imagery stays an explicit empty state. */
export function ResearchAtlasCover({ site }: { site: Site }) {
  const imagery = useImageryFor("mars", site.id);
  const entry = imagery.data?.entries.find(e => e.view === "surface") ?? imagery.data?.entries.find(e => e.view === "orbital");
  const [failedEntry, setFailedEntry] = useState<string | null>(null);
  const showImage = entry && failedEntry !== entry.entry_id;
  return <section className={styles.researchCover} aria-label="Research site dossier">
    <div className={styles.dossierText}><span className={styles.eyebrow}>Research dossier / Mars</span><h2>{site.name}</h2>
      <p className={styles.coordinates}>{formatLatLon(site.lat, site.lon_east)}</p><p className={styles.dossierDescription}>{site.description}</p>
      <nav className={styles.dossierFooter} aria-label="Research dossier sections"><a href="#research-dossier-evidence">Study questions &amp; evidence ↘</a><a href="#research-expedition-entry">Plan an expedition ↘</a></nav>
    </div>
    <figure className={styles.coverImage}>
      {showImage ? <img key={`${site.id}:${entry.entry_id}`} src={imageryAssetUrl(entry.entry_id)} alt={`${site.name}: ${entry.title}`} onError={() => setFailedEntry(entry.entry_id)} /> : <div className={styles.coverFallback}><ContourArtwork /><p role="status">{imagery.status === "loading" ? "Loading site imagery…" : "Site imagery unavailable"}</p></div>}
      {entry && showImage && <figcaption><span>{entry.view === "surface" ? "Field photograph" : "Orbital imagery"} · {coverageKind(entry) === "regional" ? "Regional context" : "Exact-site imagery"}</span><a href={entry.source_page_url} target="_blank" rel="noreferrer">{entry.credit} ↗</a></figcaption>}
    </figure>
  </section>;
}
