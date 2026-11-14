import { Section, EmptyNote } from "@/components/ui/Section";
import { Spinner } from "@/components/ui/Spinner";
import { RankedSitesChart } from "@/components/charts/RankedSitesChart";
import { EnvironmentalComparisonChart } from "@/components/charts/EnvironmentalComparisonChart";
import { CompletenessChart } from "@/components/charts/CompletenessChart";
import { useAllProfiles } from "@/hooks/useAllProfiles";
import { useAppStore } from "@/store/useAppStore";
import type { EvaluateResponse, Site } from "@/types";

export function AnalyzeView({ sites, evaluation, selectedId, onSelect }: { sites: Site[] | undefined; evaluation: EvaluateResponse | undefined; selectedId: string | null; onSelect: (id: string) => void }) {
  const profiles = useAllProfiles(sites?.map((s) => s.id));
  const featureId = useAppStore((s) => s.comparisonFeatureId);
  const setFeatureId = useAppStore((s) => s.setComparisonFeatureId);
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="grid gap-0 xl:grid-cols-2">
        <Section title="Ranked sites" subtitle="Relative suitability index under the current priorities · colours match the globe markers">
          {evaluation ? <RankedSitesChart results={evaluation.results} selectedId={selectedId} onSelect={onSelect} /> : <EmptyNote>No evaluation yet.</EmptyNote>}
        </Section>
        <Section title="Environmental comparison" subtitle="One metric at a time across all sites; missing values are listed, never plotted as zero">
          {profiles.data.length === 0 ? profiles.isPending ? <Spinner label="Loading profiles" /> : <EmptyNote>No profiles loaded.</EmptyNote> : <EnvironmentalComparisonChart profiles={profiles.data} featureId={featureId} onFeatureChange={setFeatureId} selectedId={selectedId} />}
        </Section>
        <Section title="Data completeness" subtitle="Features available per site in profile v1">
          {profiles.data.length === 0 ? profiles.isPending ? <Spinner label="Loading profiles" /> : <EmptyNote>No profiles loaded.</EmptyNote> : <CompletenessChart profiles={profiles.data} />}
        </Section>
        <Section title="Reading these charts">
          <ul className="space-y-1.5 text-xs leading-relaxed text-fg-muted">
            <li>Suitability is a relative decision-support index on 0–100 under documented assumptions. It is not a probability and not a landing-safety certification.</li>
            <li>Terrain statistics are regional (~3.7 km MOLA baseline) and cannot resolve lander-scale hazards.</li>
            <li>A criterion whose feature is missing on any site is excluded for all sites, so every ranked score is built from the same feature set.</li>
            <li>Earth analog similarity (Compare tab) is a separate calculation and is never combined with suitability.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
