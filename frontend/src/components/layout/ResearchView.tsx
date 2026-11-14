import { ExplanationPanel } from "@/components/intelligence/ExplanationPanel";
import { EmptyNote } from "@/components/ui/Section";
import type { MissionProfile, Site } from "@/types";

export function ResearchView({ sites, selectedId, onSelect, mission }: { sites: Site[] | undefined; selectedId: string | null; onSelect: (id: string) => void; mission: MissionProfile | null }) {
  const site = sites?.find(s => s.id === selectedId);
  return <div className="scroll-thin h-full overflow-y-auto">
    <div className="border-b border-line bg-bg-elev p-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-xl font-semibold text-fg">Research</h1><p className="mt-1 text-sm text-fg-muted">Investigate what a site could help us learn.</p></div>
          <div className="flex items-center gap-2"><label htmlFor="research-site" className="text-sm text-fg-muted">Mars site</label><select id="research-site" value={selectedId ?? ""} onChange={e => onSelect(e.target.value)} className="max-w-full rounded-lg border border-line-strong bg-bg p-3 text-sm text-fg"><option value="" disabled>Select a site…</option>{sites?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </div>
        {site && <p className="mt-3 max-w-3xl text-sm text-fg-muted"><span className="font-semibold text-fg">{site.name}</span> · {site.description}</p>}
      </div>
    </div>
    <div className="mx-auto max-w-7xl p-4">{selectedId ? <ExplanationPanel key={selectedId} siteId={selectedId} mission={mission} /> : <EmptyNote>Choose a Mars site above, or select a ranked candidate in Explore. Its study ideas and evidence will appear here.</EmptyNote>}</div>
  </div>;
}
