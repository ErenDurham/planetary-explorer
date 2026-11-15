// Site information from the Lesser-Known Mars Sites workbook: the site's role,
// the author's notes, the literature-reported condition texts with their
// sources, and further Earth analogs.
//
// The condition texts are descriptions compiled by the workbook author from
// cited sources. They are shown apart from the measured profile, never as
// numbers, and never scored. A null text is "Not found in sources" (or, when
// the workbook's only source is not on the approved list, says so), never a
// blank or a zero.
import { InfoTip } from "@/components/ui/InfoTip";
import { Section } from "@/components/ui/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ROLE_HINT } from "@/lib/roles";
import { formatLatLon } from "@/lib/format";
import type { EarthAnalogNote, ReportedCondition, SiteRole, WorkbookSource } from "@/types";

const STATUS: Record<ReportedCondition["status"], { label: string; tone: BadgeTone; hint: string }> = {
  verified: { label: "quoted", tone: "ok", hint: "A sentence of the cited source states this; the quote is shown below." },
  cited_not_verified: { label: "cited", tone: "info", hint: "The workbook cites approved sources for this, but their openly available text (often only an abstract) does not state it." },
  citation_only: { label: "citation only", tone: "neutral", hint: "The cited sources are paywalled with no public abstract, so this could not be checked against their text." },
  not_found_in_sources: { label: "not found", tone: "neutral", hint: "The workbook found no value in its sources." },
  excluded_source: { label: "no approved source", tone: "warn", hint: "The workbook's only source for this is not on the approved source list, so the value is not shown." },
};

export function RoleBadge({ role }: { role: SiteRole | null | undefined }) {
  if (!role) return null;
  return <span title={ROLE_HINT[role]} data-testid="site-role"><Badge tone="info">{role}</Badge></span>;
}

export function ApproximateNote({ approximate }: { approximate: boolean | undefined }) {
  if (!approximate) return null;
  return <p className="mt-0.5 text-[10.5px] text-warn" data-testid="coords-approximate">Coordinates are approximate (as marked in the workbook).</p>;
}

function SourceLinks({ ids, sources }: { ids: string[]; sources: Record<string, WorkbookSource> }) {
  const known = ids.map((id) => sources[id]).filter((s): s is WorkbookSource => !!s);
  if (known.length === 0) return null;
  return (
    <span className="text-[10.5px] text-fg-faint">
      {known.map((s, i) => (
        <span key={s.source_id}>
          {i > 0 && "; "}
          <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg" title={s.title + (s.restriction ? ` (${s.restriction})` : "")}>{s.cite}</a>
        </span>
      ))}
    </span>
  );
}

export function ReportedConditionsPanel({ conditions, sources, title = "Reported conditions", subtitle }: { conditions: ReportedCondition[] | undefined; sources: Record<string, WorkbookSource> | undefined; title?: string; subtitle?: string }) {
  if (!conditions || conditions.length === 0) return null;
  return (
    <Section title={title} subtitle={subtitle ?? "Literature-reported descriptions (workbook author), with their sources. Not measurements and not scored."}
      actions={<InfoTip variant="help" label="About reported conditions">These texts come from the Lesser-Known Mars Sites workbook. They are kept apart from the values the app measures from MOLA, Copernicus DEM and NASA POWER, and never change a score.</InfoTip>}>
      <dl className="space-y-2" data-testid="reported-conditions">
        {conditions.map((c) => {
          const st = STATUS[c.status];
          return (
            <div key={c.feature} data-testid={`condition-${c.feature}`}>
              <dt className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-fg-faint">
                <span>{c.label}</span>
                <span title={st.hint}><Badge tone={st.tone}>{st.label}</Badge></span>
              </dt>
              <dd className="mt-0.5 text-xs leading-relaxed">
                {c.text ? <span className="text-fg">{c.text}</span> : <span className="italic text-fg-muted">{c.status === "excluded_source" ? "Not shown: no approved source" : "Not found in sources"}</span>}
                {c.note && <span className="block text-[10.5px] text-fg-muted">{c.note}</span>}
                {c.text && <span className="block"><SourceLinks ids={c.source_ids ?? []} sources={sources ?? {}} /></span>}
                {c.evidence_quote && (
                  <details className="mt-0.5 text-[10.5px] text-fg-muted">
                    <summary className="cursor-pointer">Source quote</summary>
                    <blockquote className="mt-1 border-l-2 border-line pl-2">“{c.evidence_quote}”</blockquote>
                  </details>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

export function EarthAnalogNotesPanel({ analogs }: { analogs: EarthAnalogNote[] | undefined }) {
  if (!analogs || analogs.length === 0) return null;
  return (
    <Section title="Further Earth analogs" subtitle="Listed by the workbook author; not ranked candidates.">
      <ul className="space-y-2" data-testid="earth-analog-notes">
        {analogs.map((a) => (
          <li key={a.label + a.analog} className="text-xs">
            <span className="font-medium text-fg">{a.analog}</span>
            {a.where && <span className="text-fg-muted"> · {a.where}</span>}
            {a.lat != null && a.lon_east != null && <span className="num text-[10.5px] text-fg-faint"> · ~{formatLatLon(a.lat, a.lon_east)}</span>}
            {a.matches && <p className="mt-0.5 text-fg-muted"><span className="text-ok">Matches:</span> {a.matches}</p>}
            {a.does_not_match && <p className="mt-0.5 text-fg-muted"><span className="text-warn">Doesn’t match:</span> {a.does_not_match}</p>}
            {a.workbook_source_text && <p className="mt-0.5 text-[10.5px] text-fg-faint">Workbook citation: {a.workbook_source_text}</p>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
