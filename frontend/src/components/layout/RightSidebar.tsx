import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { MapPin } from "lucide-react";
import { Section, EmptyNote, BulletList } from "@/components/ui/Section";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Badge } from "@/components/ui/Badge";
import { EnvironmentalProfilePanel } from "@/components/sites/EnvironmentalProfilePanel";
import { SourcesList } from "@/components/sites/SourcesList";
import { SuitabilityPanel } from "@/components/mission/SuitabilityPanel";
import { useSiteProfile } from "@/hooks/useSites";
import { formatLatLon, formatNumber, humanize } from "@/lib/format";
import type { EvaluateResponse, MissionProfile } from "@/types";

interface Props {
  selectedId: string | null;
  evaluation: EvaluateResponse | undefined;
  evaluationPending: boolean;
  mission: MissionProfile | null;
}

export function RightSidebar({ selectedId, evaluation, evaluationPending }: Props) {
  const q = useSiteProfile(selectedId);
  const openResearch = useAppStore(s => s.setActiveTab);
  const panel = useRef<HTMLElement>(null);
  const revision = useAppStore(s => s.selectionRevision);
  useEffect(() => {
    if (!selectedId || !panel.current) return;
    panel.current.scrollTop = 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (window.matchMedia?.("(max-width: 1023px)")?.matches) panel.current.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (!reduced) {
      panel.current.animate?.([{ boxShadow: "inset 0 0 0 2px #f0a03c", backgroundColor: "#313131" }, { boxShadow: "inset 0 0 0 2px transparent", backgroundColor: "transparent" }], { duration: 1100, easing: "cubic-bezier(0.32,0.72,0,1)" });
    }
  }, [selectedId, revision]);
  const result = evaluation?.results.find((r) => r.site_id === selectedId);
  const ranked = evaluation?.results.filter((r) => r.status === "ok").length;

  return (
    <aside ref={panel} aria-label="Site detail" className="scroll-thin flex h-full flex-col overflow-y-auto bg-bg-elev">
      {!selectedId ? (
        <Section title="Site">
          <EmptyNote>Click a marker on the globe or a row in the ranked list.</EmptyNote>
        </Section>
      ) : q.isPending ? (
        <div className="p-4">
          <Spinner label="Loading site profile" />
        </div>
      ) : q.error ? (
        <div className="p-4">
          <ErrorNote error={q.error} context={`sites/${selectedId}`} />
        </div>
      ) : q.data ? (
        <>
          <Section title="Site">
            <h2 className="text-base font-medium leading-tight text-fg">{q.data.site.name}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
              <MapPin className="h-3 w-3" aria-hidden /> {q.data.site.region} · <span className="num">{formatLatLon(q.data.site.lat, q.data.site.lon_east)}</span>
            </p>
            <p className="num mt-0.5 text-[10.5px] text-fg-faint">
              footprint {q.data.site.footprint.shape}, ~{formatNumber(q.data.site.footprint.approx_width_km ?? 0, { maxFractionDigits: 1 })} km · {q.data.site.footprint.crs}
            </p>
            {q.data.site.heritage && <p className="mt-1.5 text-[11px] text-copper-bright">{q.data.site.heritage}</p>}
            <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{q.data.site.description}</p>
            {(q.data.site.tags ?? []).length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1" aria-label="Site tags">
                {(q.data.site.tags ?? []).map((t) => (
                  <li key={t}>
                    <Badge>{humanize(t)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div>
            <SuitabilityPanel result={result} scoringSpecVersion={evaluation?.scoring_spec_version} isPending={evaluationPending} totalRanked={ranked} />
            <Section title="Research potential" subtitle="Turn this site's characteristics into questions to investigate.">
              <button type="button" onClick={() => openResearch("research")} className="w-full rounded-lg border border-info/50 bg-info/10 p-3 text-left text-sm font-semibold text-info">Explore study ideas and supporting evidence →</button>
            </Section>
            <details className="m-4 rounded-lg border border-line">
              <summary className="cursor-pointer p-3 text-sm text-fg">All environmental measurements and sources</summary>
              <EnvironmentalProfilePanel profile={q.data.profile} />
              <SourcesList sources={q.data.profile.sources} />
            </details>
            <Section title="Risks and limitations" subtitle="Scope and evidence gaps to review before relying on this ranking">
              <BulletList items={result?.risks} tone="danger" empty="No risk flags among the scored regional factors. Unmeasured hazards remain unknown." />
              <div className="mt-3"><BulletList items={result?.limitations} tone="warn" /></div>
            </Section>
          </div>
        </>
      ) : null}
    </aside>
  );
}
