import { AnalogComparison } from "@/components/intelligence/AnalogComparison";
import { useSiteProfile } from "@/hooks/useSites";
import type { Site } from "@/types";

export function CompareView({ sites, selectedId, onSelect }: { sites: Site[] | undefined; selectedId: string | null; onSelect: (id: string) => void }) {
  const site = sites?.find((s) => s.id === selectedId) ?? null;
  const profile = useSiteProfile(selectedId);
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg-elev px-4 py-2">
        <label htmlFor="compare-site" className="text-[10.5px] uppercase tracking-wide text-fg-faint">
          Mars site
        </label>
        <select id="compare-site" value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value)} className="rounded border border-line-strong bg-bg-elev-2 px-2 py-1 text-xs text-fg">
          <option value="" disabled>
            Select a site…
          </option>
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-[10.5px] text-fg-faint">Environmental similarity only — independent of landing suitability.</span>
      </div>
      <AnalogComparison site={site} sources={profile.data?.profile.sources} />
    </div>
  );
}
