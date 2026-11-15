// One research study card, shared by the site explanation (research_studies)
// and the Earth analog detail (proposed_studies). The kind badge is the first
// thing on the card: a proposed study has NOT been performed, a documented
// campaign has. "What this cannot establish" is always shown, never collapsed.
import { FlaskConical, BookOpenCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { Citation, StudyCard as StudyCardT } from "@/types";

export function StudyCardView({ study, citations, analogName, similarityNote }: {
  study: StudyCardT;
  /** Citations from the same explanation, so a [C#] handle can link to its source. */
  citations?: Citation[];
  /** Name of the Earth analog when `analog_candidate_id` is set. */
  analogName?: string | null;
  /** Compare page: remind that similarity is a heuristic index. */
  similarityNote?: boolean;
}) {
  const proposed = study.kind === "proposed_study";
  const handles = study.motivating_citation_ids ?? [];
  return (
    <li className="rounded-lg border border-line-strong bg-bg-elev-2 p-3" data-testid="study-card">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {proposed ? (
          <Badge tone="info"><FlaskConical className="h-3 w-3" aria-hidden /> Proposed study · not performed</Badge>
        ) : (
          <Badge tone="ok"><BookOpenCheck className="h-3 w-3" aria-hidden /> Documented campaign</Badge>
        )}
        {study.analog_candidate_id && <Badge tone="neutral">Earth analog: {analogName ?? study.analog_candidate_id}</Badge>}
      </div>
      <h3 className="text-sm font-semibold text-fg">{study.title}</h3>
      <dl className="mt-2 space-y-1.5 text-xs">
        <Row label="Research question">{study.research_question}</Row>
        <Row label="How to investigate">{study.method}</Row>
        <Row label="Why here">{study.why_here}</Row>
        <Row label="Motivated by">
          {handles.length ? (
            <span className="flex flex-wrap gap-1">
              {handles.map((h) => {
                const c = citations?.find((x) => x.citation_id === h);
                return c ? (
                  <a key={h} href={c.url} target="_blank" rel="noreferrer" className="num rounded border border-line-strong px-1 text-copper-bright hover:text-fg" title={c.title}>{h}</a>
                ) : (
                  <span key={h} className="num rounded border border-line-strong px-1 text-fg-muted">{h}</span>
                );
              })}
            </span>
          ) : (
            <span className="text-fg-faint">based on the site data, with no passage cited</span>
          )}
        </Row>
        <Row label="What this cannot establish" tone="warn">{study.cannot_infer}</Row>
      </dl>
      {similarityNote && study.analog_candidate_id && <p className="mt-2 text-[11px] text-fg-faint">Analog similarity is a rough index over the compared features. It is not evidence that results transfer.</p>}
    </li>
  );
}

function Row({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2">
      <dt className={`text-[10px] font-semibold uppercase tracking-wide ${tone === "warn" ? "text-warn" : "text-fg-faint"}`}>{label}</dt>
      <dd className={`leading-relaxed ${tone === "warn" ? "text-warn" : "text-fg-muted"}`}>{children}</dd>
    </div>
  );
}
