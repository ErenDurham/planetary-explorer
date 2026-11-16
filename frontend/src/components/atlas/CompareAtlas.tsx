import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { BODY_NAME, type Body } from "@/lib/analogFeatures";
import { formatLatLon } from "@/lib/format";
import type { PairColumnData } from "@/components/compare/PairSelectors";
import { ContourArtwork } from "./AtlasSurface";
import styles from "./atlas.module.css";

export function CompareAtlasHeader({ focusBody }: { focusBody: Body }) {
  return <header className={styles.hero}>
    <ContourArtwork variant="compare" />
    <div className={styles.heroText}><p className={styles.eyebrow}>Planetary Explorer / Comparative field atlas</p>
      <h1>Earth meets Mars.</h1><p className={styles.lead}>Compare terrain, materials, and field context.</p>
    </div>
    <div className={styles.focusNote}><span>Mission focus</span><strong>{BODY_NAME[focusBody]}</strong><p>Compare your selected site with a reference on the other world.</p></div>
  </header>;
}

/** Drop-in selector presentation; callbacks and role semantics are unchanged. */
export function AtlasPairSelectors({ columns, swapped, onSwap, onSelect, onShowOnGlobe }: {
  columns: [PairColumnData, PairColumnData]; swapped: boolean; onSwap: () => void;
  onSelect: (body: Body, id: string) => void; onShowOnGlobe: (body: Body, id: string) => void;
}) {
  return <div className={styles.pairSelectors} role="group" aria-label="Compared locations">
    {columns.map((c, i) => <div key={c.body} className={`${styles.location} ${i === 1 ? styles.secondLocation : ""}`}>
      <div className={styles.locationRole}><span className={styles.planetDot} data-body={c.body} /><span>{c.label}</span></div>
      <label htmlFor={`compare-${c.body}`} className="sr-only">{BODY_NAME[c.body]} location</label>
      <select id={`compare-${c.body}`} value={c.location?.id ?? ""} onChange={e => onSelect(c.body, e.target.value)}>
        {!c.location && <option value="" disabled>Choose a {BODY_NAME[c.body]} location</option>}
        <optgroup label="Established catalog regions">{c.locations.filter(l=>!l.id.startsWith("discovered:")).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
        {c.locations.some(l=>l.id.startsWith("discovered:")) && <optgroup label="Found survey regions">{c.locations.filter(l=>l.id.startsWith("discovered:")).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
      </select>
      {c.location && <div className={styles.locationMeta}><span className="num">{formatLatLon(c.location.lat, c.location.lon_east)}</span><button type="button" onClick={() => onShowOnGlobe(c.body, c.location!.id)}>Show on globe <ArrowUpRight size={14} aria-hidden /></button></div>}
      {c.location && <details className={styles.locationAbout}><summary>About this location</summary><p>{c.location.description}</p><p className={styles.muted}>{c.location.coverage}</p></details>}
    </div>)}
    <button type="button" className={styles.swap} onClick={onSwap} aria-pressed={swapped} aria-label="Swap display order of the two columns" title="Swap display order only"><ArrowLeftRight size={18} aria-hidden /><span className="sr-only">Swap display order</span></button>
  </div>;
}
