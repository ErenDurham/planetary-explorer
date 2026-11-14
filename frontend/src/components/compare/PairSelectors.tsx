// The two location columns: role label from the objective (selected /
// reference), a select over every location on that body, coordinates and a
// jump to the globe. Editing a select changes only that body's selection in
// the store. The swap button reorders the DISPLAY and nothing else.
import { ArrowLeftRight, Globe2 } from "lucide-react";
import { BODY_COLOR } from "@/components/imagery/assetUrl";
import { formatLatLon } from "@/lib/format";
import { BODY_NAME, type Body } from "@/lib/analogFeatures";
import type { PairColumn } from "@/lib/comparison";
import type { ComparisonLocation } from "@/types";

export interface PairColumnData extends PairColumn { locations: ComparisonLocation[]; location: ComparisonLocation | null }

export function PairSelectors({ columns, swapped, onSwap, onSelect, onShowOnGlobe }: { columns: [PairColumnData, PairColumnData]; swapped: boolean; onSwap: () => void; onSelect: (body: Body, id: string) => void; onShowOnGlobe: (body: Body, id: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch" role="group" aria-label="Compared locations">
      {columns.map((c, i) => (
        <div key={c.body} className={`rounded border border-line bg-bg-elev p-3 ${i === 1 ? "md:order-3" : ""}`} style={{ borderTop: `3px solid ${BODY_COLOR[c.body]}` }}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: BODY_COLOR[c.body] }}>{c.label}</span>
            <span className="text-xs text-fg-muted">{c.locations.length} locations</span>
          </div>
          <label htmlFor={`compare-${c.body}`} className="sr-only">{BODY_NAME[c.body]} location</label>
          <select id={`compare-${c.body}`} value={c.location?.id ?? ""} onChange={e => onSelect(c.body, e.target.value)} className="w-full min-w-0 rounded border border-line-strong bg-bg px-2 py-2 text-sm font-medium text-fg">
            {!c.location && <option value="" disabled>Choose a {BODY_NAME[c.body]} location</option>}
            {c.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {c.location && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
              <span><span className="num">{formatLatLon(c.location.lat, c.location.lon_east)}</span> · {c.location.coverage}</span>
              <button type="button" onClick={() => onShowOnGlobe(c.body, c.location!.id)} className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 hover:text-fg"><Globe2 className="h-3 w-3" aria-hidden /> Show on globe</button>
            </div>
          )}
          {c.location && <details className="mt-2 text-xs text-fg-muted"><summary className="cursor-pointer">About this location</summary><p className="mt-1 leading-relaxed text-fg">{c.location.description}</p></details>}
        </div>
      ))}
      <div className="flex items-center justify-center md:order-2">
        <button type="button" onClick={onSwap} aria-pressed={swapped} aria-label="Swap display order of the two columns" title="Swap display order only; the objective and roles do not change" className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-2 text-xs text-fg-muted hover:text-fg">
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> <span className="md:sr-only">Swap display order</span>
        </button>
      </div>
    </div>
  );
}
