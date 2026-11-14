import { useAppStore } from "@/store/useAppStore";
// AI explanation for the selected site. Cached per site + mission + applied
// objective; fetched only on "Refresh" or when the site changes (never on
// slider motion). When the applied objective or priorities move on, the last
// digest for the site stays visible with a note saying what it was generated
// for, so nothing silently disappears and nothing is relabelled.
import { useEffect, useRef } from "react";
import { Sparkles, Cpu, ExternalLink, RefreshCw } from "lucide-react";
import { Section, BulletList, EmptyNote } from "@/components/ui/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useExplanation } from "@/hooks/useExplanation";
import { StudyCardView } from "@/components/intelligence/StudyCard";
import type { MissionProfile, ResearchExplanation, SourceDigest } from "@/types";

interface Shown { data: ResearchExplanation; objective: string; missionKey: string }

export function ExplanationPanel({ siteId, mission }: { siteId: string | null; mission: MissionProfile | null }) {
  const applied = useAppStore(s => s.appliedObjective);
  const draft = useAppStore(s => s.missionObjective);
  const objective = (applied || draft || "").trim();
  const q = useExplanation(siteId, mission, objective);
  const compare = useAppStore(s => s.setActiveTab);
  const missionKeyNow = JSON.stringify(mission?.criteria ?? null);
  // Last explanation shown per site, so a changed objective or priorities
  // shows a labelled previous digest rather than an empty panel.
  const last = useRef<Record<string, Shown>>({});
  if (siteId && q.data) last.current[siteId] = { data: q.data, objective, missionKey: missionKeyNow };

  // Fetch once per site when nothing is cached for this site+mission; a later
  // slider move changes the key but does not trigger a fetch until "Explain".
  useEffect(() => {
    if (siteId && !q.data && !q.isFetching && q.fetchStatus === "idle" && !q.error) {
      void q.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  if (!siteId) {
    return (
      <Section title="Research potential">
        <EmptyNote>Select a site to generate a citation-backed explanation.</EmptyNote>
      </Section>
    );
  }

  const previous = !q.data ? last.current[siteId] : undefined;
  const data = q.data ?? previous?.data;
  const staleObjective = !!previous && previous.objective !== objective;
  const stalePriorities = !!previous && previous.missionKey !== missionKeyNow;

  return (
    <Section
      title="Research potential"
      subtitle={data ? <span>Questions to investigate, practical next steps and supporting sources · generated {new Date(data.generated_at).toLocaleTimeString()}{data.cached ? " · served from backend cache" : ""}</span> : "Questions to investigate, practical next steps and supporting sources."}
      actions={
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-1 rounded border border-copper/60 bg-copper/10 px-2 py-1 text-[10.5px] text-copper-bright hover:bg-copper/20 disabled:opacity-50"
          aria-label={previous ? "Refresh the explanation for the current objective and priorities" : "Explain this site under the current priorities"}
        >
          {q.isFetching ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
          Refresh
        </button>
      }
    >
      {q.isFetching && !data && <Spinner label="Composing explanation" />}
      {q.error && (
        <div className="mb-2 space-y-2">
          <ErrorNote error={q.error} context="research/explain" />
          <button type="button" onClick={() => void q.refetch()} disabled={q.isFetching} className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:border-copper disabled:opacity-50">Retry</button>
        </div>
      )}
      {(staleObjective || stalePriorities) && data && (
        <p className="mb-2 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn" role="status">
          {staleObjective ? "Digest generated for a previous objective." : "Generated under previous priorities."} Use Refresh to regenerate it for the current mission.
        </p>
      )}
      {data && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {data.generated_by === "llm" ? (
              <Badge tone="copper" title={data.model ?? undefined}>
                <Sparkles className="h-3 w-3" aria-hidden /> Language model{data.model ? ` · ${data.model}` : ""}
              </Badge>
            ) : (
              <Badge tone="neutral" title="No language model configured; sections assembled deterministically from scores, measurements and retrieved excerpts.">
                <Cpu className="h-3 w-3" aria-hidden /> Rule based proposals
              </Badge>
            )}
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2"><div>
          <h2 className="mb-3 text-base font-semibold text-fg">Study ideas</h2>
          <StudyCards data={data} />
          <button type="button" onClick={() => compare("compare")} className="mt-3 w-full rounded-lg border border-info/50 bg-info/10 p-3 text-left text-sm font-semibold text-info">Explore Earth analogs for field studies →</button>
          {(data.sections.future_investigation ?? []).length > 0 && <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-fg">Next investigations</h3>
            <BulletList items={data.sections.future_investigation} />
          </div>}
          </div><div><EvidenceLibrary data={data} /></div></div>
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold text-fg">Risks, missing evidence and limitations</h3>
            {[
              { title: "Risks and unfavorable findings", items: [...(data.sections.risks ?? []), ...(data.sections.unfavorable ?? [])] },
              { title: "Missing evidence", items: data.sections.missing_evidence ?? [] },
              { title: "Limits of these proposals", items: [...(data.research_studies ?? []).map(s => s.cannot_infer), ...(data.source_digests ?? []).flatMap(d => d.limitation ? [d.limitation] : []), ...(data.limitations ?? [])] },
            ].map(group => <details key={group.title} className="mb-2 rounded-lg border border-line-strong p-3"><summary className="cursor-pointer text-sm text-fg-muted">{group.title} · {group.items.length}</summary><div className="mt-3"><BulletList items={[...new Set(group.items)]} tone="warn" empty="No additional findings reported." /></div></details>)}
          </div>
        </div>
      )}
    </Section>
  );
}

/** One source card per URL. Citation handles remain attached to their original
 * chunks; grouping must never remap a claim to a different passage. */
function EvidenceLibrary({ data }: { data: ResearchExplanation }) {
  const groups = new Map<string, typeof data.supporting_evidence>();
  for (const chunk of data.supporting_evidence) {
    const url = chunk.url.replace(/#.*$/, "").replace(/\/$/, "");
    groups.set(url, [...(groups.get(url) ?? []), chunk]);
  }
  return <div className="mt-4">
    <h3 className="mb-2 text-sm font-semibold text-fg">Further reading and evidence · {groups.size} sources</h3>
    <p className="mb-3 text-xs text-fg-muted">Each source appears once. Digest and excerpt labels show how its context was prepared; original passages remain available.</p>
    {!groups.size && <EmptyNote>No supporting documents were retrieved. Proposed studies above use the structured measurements only.</EmptyNote>}
    <ol className="space-y-3">{[...groups.entries()].map(([url, chunks]) => {
      const first = chunks[0];
      const citations = data.citations.filter(c => chunks.some(e => e.chunk_id === c.chunk_id));
      const digest = data.source_digests?.find(d => normaliseUrl(d.url) === url);
      const excerpt = relevantExcerpt(chunks.map(c => c.excerpt).join(" "));
      const support = digest ? SUPPORT[digest.support_level] ?? SUPPORT.context : null;
      return <li key={url} className="rounded-lg border border-line-strong bg-bg-elev-2 p-3" data-testid="source-card">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-fg">{first.title}</h4>
          <a href={first.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-copper-bright" aria-label={`Open ${first.title}`}>Read source <ExternalLink className="h-3 w-3" aria-hidden /></a>
        </div>
        <p className="mt-1 text-xs text-fg-muted">{first.institution}{(digest?.publication_date ?? first.publication_date) ? ` · ${digest?.publication_date ?? first.publication_date}` : ""} · <span className="num">{(digest?.citation_ids?.length ? digest.citation_ids : citations.map(c => c.citation_id)).join(" ")}</span></p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {digest && <Badge tone="info">{digest.purpose_label}</Badge>}
          {digest && support && <Badge tone={support.tone} title={support.title}>{support.label}</Badge>}
          {digest?.generated_by === "llm"
            ? <Badge tone="copper"><Sparkles className="h-3 w-3" aria-hidden /> Model digest</Badge>
            : <Badge tone="neutral"><Cpu className="h-3 w-3" aria-hidden /> Extractive (no model)</Badge>}
        </div>
        {digest ? <div className="mt-2 space-y-1.5 text-sm text-fg">
          {digest.support_level === "insufficient" && <p className="text-xs text-warn">The retrieved passages from this source contain insufficient relevant evidence for this site and objective.</p>}
          <p><span className="text-xs font-semibold text-fg-muted">What it tells us: </span>{digest.what_it_tells_us}</p>
          <p className="text-fg-muted"><span className="text-xs font-semibold text-fg-muted">Why it matters: </span>{digest.why_it_matters}</p>
          {digest.limitation && <p className="text-xs text-fg-faint"><span className="font-semibold">Limitation: </span>{digest.limitation}</p>}
        </div> : <p className="mt-2 text-sm text-fg">{excerpt || "No clean preview available. Read the original passages below."}</p>}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-info">Read {chunks.length} original {chunks.length === 1 ? "passage" : "passages"} and citation details</summary>
          {chunks.map(e => <div key={e.chunk_id} className="mt-3 border border-line rounded p-3">
            <p className="mb-2 text-xs text-fg-muted">{data.citations.find(c => c.chunk_id === e.chunk_id)?.citation_id} · {e.publication_date ?? "Date unavailable"}</p>
            <blockquote className="text-sm leading-relaxed text-fg-muted">{e.excerpt}</blockquote>
            <p className="num mt-2 text-xs text-fg-muted">{e.chunk_id}</p>
          </div>)}
        </details>
      </li>;
    })}</ol>
  </div>;
}

export function relevantExcerpt(text: string): string {
  // Keep whole relevant sentences, reject obvious navigation/scraping debris.
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 45 && s.length < 300 && !/explore resources|view raw images|learn more|image caption|launch vehicle|launch location|quick facts|credit:|copyright/i.test(s));
  const scored = sentences.map((text, index) => ({ text, index, score: (text.match(/\b(landing|terrain|slope|surface|geology|safety|crater|mineral|water|ice|analog)\b/gi) ?? []).length })).filter(s => s.score > 0).sort((a,b) => b.score-a.score || a.index-b.index);
  return [...new Set(scored.slice(0, 1).sort((a,b) => a.index-b.index).map(s => s.text))].join(" ");
}

const SUPPORT: Record<SourceDigest["support_level"], { label: string; tone: BadgeTone; title: string }> = {
  supports: { label: "Supports", tone: "ok", title: "The passages bear directly on this site and objective" },
  context: { label: "Context", tone: "neutral", title: "Background that frames the site but does not support a specific claim" },
  insufficient: { label: "Insufficient evidence", tone: "warn", title: "The retrieved passages contain insufficient relevant evidence for this site and objective" },
};

function normaliseUrl(url: string): string {
  return url.replace(/#.*$/, "").replace(/\/$/, "");
}

/** Structured study cards (research_studies). The compatibility string list in
 * sections.research_applications is deliberately not rendered. The empty state
 * is the backend's evidence_gap, or a plain statement that nothing can be
 * motivated from the retrieved evidence; never filler. */
function StudyCards({ data }: { data: ResearchExplanation }) {
  const studies = data.research_studies ?? [];
  return <div>
    {data.evidence_gap && <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn" role="note">{data.evidence_gap}</p>}
    {studies.length === 0
      ? !data.evidence_gap && <EmptyNote>No study can be motivated from the retrieved evidence for this site.</EmptyNote>
      : <ol className="space-y-3" aria-label="Study cards">{studies.map((study, i) => <StudyCardView key={`${study.title}-${i}`} study={study} citations={data.citations} />)}</ol>}
  </div>;
}
