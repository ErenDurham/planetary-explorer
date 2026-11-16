// Site information from approved sources: the landform and mineral labels
// (each backed by a quote from an approved source), what the sources state
// about each condition, the project's own role and note, and an approximate-
// coordinate flag. Condition texts are the sources' own sentences, cited to
// the source; nothing here is scored. When no approved source states
// something, the panel says it could not be found in sources.
import { InfoTip } from "@/components/ui/InfoTip";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { ROLE_HINT } from "@/lib/roles";
import { humanize } from "@/lib/format";
import type { EnvironmentalMeasurement, Provenance, ReportedCondition, SiteRole, SiteSource } from "@/types";

export const NOT_FOUND = "Could not be found in sources";

export function RoleBadge({ role }: { role: SiteRole | null | undefined }) {
  if (!role) return null;
  return <span title={`${ROLE_HINT[role]} (project classification)`} data-testid="site-role"><Badge tone="info">{role}</Badge></span>;
}

export function ApproximateNote({ approximate }: { approximate: boolean | null | undefined }) {
  if (!approximate) return null;
  return <p className="mt-0.5 text-[10.5px] text-warn" data-testid="coords-approximate">Coordinates are approximate.</p>;
}

function SourceLink({ source }: { source: { title: string; url: string; cite?: string | null } | undefined }) {
  if (!source) return null;
  return <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg" title={source.title}>{source.cite ?? source.title}</a>;
}

/** Terrain morphology and mineralogy / composition, from the site's approved-source labels. */
export function SiteLabelsPanel({ measurements, sources }: { measurements: EnvironmentalMeasurement[] | undefined; sources: Record<string, Provenance & { cite?: string | null }> | undefined }) {
  const rows: Array<{ id: string; label: string }> = [{ id: "terrain_morphology", label: "Terrain morphology" }, { id: "mineralogy_tags", label: "Mineralogy / composition" }];
  return (
    <Section title="Terrain and composition" actions={<InfoTip variant="help" label="About these labels">Each label is stated in an approved source; the source is linked below it.</InfoTip>}>
      <dl className="space-y-2" data-testid="site-labels">
        {rows.map((r) => {
          const m = measurements?.find((x) => x.feature_id === r.id);
          const tags = !m || m.is_missing || !Array.isArray(m.value) ? [] : (m.value as string[]);
          const src = m?.source_id ? sources?.[m.source_id] : undefined;
          return (
            <div key={r.id} data-testid={`label-${r.id}`}>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{r.label}</dt>
              <dd className="mt-0.5 text-xs">
                {tags.length ? <>
                  <ul className="flex flex-wrap gap-1">{tags.map((t) => <li key={t}><Badge>{humanize(t)}</Badge></li>)}</ul>
                  {src && <span className="mt-0.5 block text-[10.5px] text-fg-faint">Source: <SourceLink source={src} /></span>}
                </> : <span className="italic text-fg-muted">{NOT_FOUND}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

/** What approved sources state about each condition, quoted and cited. */
export function ReportedConditionsPanel({ conditions, sources, title = "What the sources report" }: { conditions: ReportedCondition[] | undefined; sources: Record<string, SiteSource> | undefined; title?: string }) {
  if (!conditions || conditions.length === 0) return null;
  return (
    <Section title={title} subtitle="Sentences quoted from the approved sources. Not measurements and not scored."
      actions={<InfoTip variant="help" label="About these texts">Each text is a sentence from the cited source. These are kept apart from the values the app measures (MOLA, Copernicus DEM, NASA POWER) and never change a score.</InfoTip>}>
      <dl className="space-y-2" data-testid="reported-conditions">
        {conditions.map((c) => {
          const src = c.source_ids?.[0] ? sources?.[c.source_ids[0]] : undefined;
          return (
            <div key={c.feature} data-testid={`condition-${c.feature}`}>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{c.label}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed">
                {c.text ? <>
                  <q className="text-fg">{c.text}</q>
                  {src && <span className="block text-[10.5px] text-fg-faint">Source: <SourceLink source={src} /></span>}
                </> : <span className="italic text-fg-muted">{NOT_FOUND}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}
