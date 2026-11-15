// "What this pair can help test": documented analog campaigns (labelled as
// documented) and proposed studies (labelled as proposals, StudyCardView) from
// /analogs/match for this exact pair, with a link to Research that keeps the
// selected Mars site. Terrestrial field use is never presented as a completed
// Mars experiment.
import { BookOpenCheck, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyNote } from "@/components/ui/Section";
import { StudyCardView } from "@/components/intelligence/StudyCard";
import type { AnalogMatch, StudyCard } from "@/types";

export function isStudyCard(x: unknown): x is StudyCard {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (o.kind === "proposed_study" || o.kind === "documented_campaign") && typeof o.title === "string" && typeof o.research_question === "string" && typeof o.method === "string" && typeof o.why_here === "string" && typeof o.cannot_infer === "string";
}

export function PairStudies({ pairMatch, earthName, marsName, pending, onOpenResearch }: { pairMatch: AnalogMatch | undefined; earthName: string; marsName: string; pending: boolean; onOpenResearch: () => void }) {
  const documented = [...new Set([...(pairMatch?.documented_analog_use ?? pairMatch?.research_applications ?? []), ...(pairMatch?.earth_candidate.known_analog_use ?? [])])];
  const proposed = (pairMatch?.proposed_studies ?? []).filter(isStudyCard);
  return (
    <section aria-label="What this pair can help test" className="rounded border border-line bg-bg-elev p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">What this pair can help test</h2>
          <p className="mt-0.5 text-xs text-fg-faint">Documented campaigns at {earthName} are real programmes. Proposals are ideas based on the shared features. Field work on Earth is not a completed Mars experiment.</p>
        </div>
        <button type="button" onClick={onOpenResearch} className="inline-flex items-center gap-1 rounded border border-line px-3 py-2 text-xs text-fg hover:border-line-strong">Open Research for {marsName} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>
      </div>
      {pending && !pairMatch && <p role="status" className="mt-3 text-xs text-fg-muted">Loading analog studies…</p>}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ok">Documented analog use</h3>
          {documented.length === 0 ? <EmptyNote>No analog campaign is recorded for {earthName}.</EmptyNote> : (
            <ul className="space-y-1.5" aria-label="Documented analog programmes">{documented.map(u => <li key={u} className="flex items-start gap-2 text-xs text-fg"><Badge tone="ok"><BookOpenCheck className="h-3 w-3" aria-hidden /> Documented</Badge><span>{u}</span></li>)}</ul>
          )}
        </div>
        <div>
          <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-info">Proposed studies</h3>
          {proposed.length === 0 ? <EmptyNote>The features this pair shares do not suggest a study.</EmptyNote> : (
            <ol className="space-y-3" aria-label="Proposed studies">{proposed.map((s, i) => <StudyCardView key={`${s.title}-${i}`} study={s} analogName={earthName} similarityNote />)}</ol>
          )}
        </div>
      </div>
    </section>
  );
}
