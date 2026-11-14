import { MapPin } from "lucide-react";
import { Section, EmptyNote } from "@/components/ui/Section";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Badge } from "@/components/ui/Badge";
import { EnvironmentalProfilePanel } from "@/components/sites/EnvironmentalProfilePanel";
import { SourcesList } from "@/components/sites/SourcesList";
import { SuitabilityPanel } from "@/components/mission/SuitabilityPanel";
import { ExplanationPanel } from "@/components/intelligence/ExplanationPanel";
import { useSiteProfile } from "@/hooks/useSites";
import { formatLatLon, formatNumber, humanize } from "@/lib/format";
import type { EvaluateResponse, MissionProfile } from "@/types";

interface Props {
  selectedId: string | null;
  evaluation: EvaluateResponse | undefined;
  evaluationPending: boolean;
  mission: MissionProfile | null;
}

export function RightSidebar({ selectedId, evaluation, evaluationPending, mission }: Props) {
  const q = useSiteProfile(selectedId);
  const result = evaluation?.results.find((r) => r.site_id === selectedId);
  const ranked = evaluation?.results.filter((r) => r.status === "ok").length;

  return (
    <aside aria-label="Site detail" className="scroll-thin flex h-full flex-col overflow-y-auto bg-bg-elev">
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

          <EnvironmentalProfilePanel profile={q.data.profile} />

          <div className="border-y-2 border-copper/40 bg-copper/5 px-4 py-1.5 text-[10.5px] uppercase tracking-[0.14em] text-copper">Mission-dependent results</div>
          <SuitabilityPanel result={result} scoringSpecVersion={evaluation?.scoring_spec_version} isPending={evaluationPending} totalRanked={ranked} />
          <ExplanationPanel siteId={selectedId} mission={mission} />
          <SourcesList sources={q.data.profile.sources} />
        </>
      ) : null}
    </aside>
  );
}
