// AI explanation for the selected site. Cached per site + mission; fetched
// only on "Explain" or when the site changes (never on slider motion).
import { useEffect } from "react";
import { Sparkles, Cpu, ExternalLink, RefreshCw } from "lucide-react";
import { Section, BulletList, EmptyNote } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useExplanation } from "@/hooks/useExplanation";
import type { MissionProfile, ResearchExplanation } from "@/types";

const SECTIONS: Array<{ key: keyof ResearchExplanation["sections"]; title: string; tone: "ok" | "danger" | "warn" | "neutral" }> = [
  { key: "favorable", title: "Favorable", tone: "ok" },
  { key: "unfavorable", title: "Unfavorable", tone: "danger" },
  { key: "risks", title: "Risks", tone: "danger" },
  { key: "influential_factors", title: "Most influential factors", tone: "neutral" },
  { key: "research_applications", title: "Research applications", tone: "neutral" },
  { key: "missing_evidence", title: "Missing evidence", tone: "warn" },
  { key: "future_investigation", title: "Future investigation", tone: "neutral" },
];

export function ExplanationPanel({ siteId, mission }: { siteId: string | null; mission: MissionProfile | null }) {
  const q = useExplanation(siteId, mission);

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
      <Section title="Scientific explanation">
        <EmptyNote>Select a site to generate a citation-backed explanation.</EmptyNote>
      </Section>
    );
  }

  const data = q.data;

  return (
    <Section
      title="Scientific explanation"
      subtitle={data ? <span>generated {new Date(data.generated_at).toLocaleTimeString()}{data.cached ? " · served from backend cache" : ""}</span> : "Grounded in retrieved documents; degrades to a deterministic template"}
      actions={
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-1 rounded border border-copper/60 bg-copper/10 px-2 py-1 text-[10.5px] text-copper-bright hover:bg-copper/20 disabled:opacity-50"
          aria-label="Explain this site under the current priorities"
        >
          {q.isFetching ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
          Explain
        </button>
      }
    >
      {q.isFetching && !data && <Spinner label="Composing explanation" />}
      {q.error && <ErrorNote error={q.error} context="research/explain" />}
      {data && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {data.generated_by === "llm" ? (
              <Badge tone="copper" title={data.model ?? undefined}>
                <Sparkles className="h-3 w-3" aria-hidden /> Language model{data.model ? ` · ${data.model}` : ""}
              </Badge>
            ) : (
              <Badge tone="neutral" title="No language model configured; sections assembled deterministically from scores, measurements and retrieved excerpts.">
                <Cpu className="h-3 w-3" aria-hidden /> Deterministic fallback — no LLM configured
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            {SECTIONS.map((s) => (
              <div key={s.key}>
                <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-copper">{s.title}</h3>
                <BulletList items={data.sections[s.key]} tone={s.tone} empty="Nothing to report." />
              </div>
            ))}
          </div>

          <div className="mt-3">
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-fg-faint">Supporting evidence</h3>
            {data.supporting_evidence.length === 0 ? (
              <EmptyNote>No passages were retrieved for this site (retrieval service unavailable or corpus empty). The sections above come only from the measurements and scores.</EmptyNote>
            ) : (
              <ol className="space-y-2">
                {data.supporting_evidence.map((e) => (
                  <li key={e.chunk_id} className="rounded border border-line bg-bg-elev-2/60 p-2 text-[11px]">
                    <div className="mb-1 flex items-center justify-between gap-2 text-fg-muted">
                      <span className="truncate">
                        <span className="text-fg">{e.title}</span> — {e.institution}
                        {e.publication_date ? ` (${e.publication_date})` : ""}
                      </span>
                      <a href={e.url} target="_blank" rel="noreferrer" className="shrink-0 text-copper-bright hover:text-fg" aria-label={`Open ${e.title}`}>
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                    <blockquote className="border-l-2 border-line-strong pl-2 italic leading-snug text-fg-muted">{e.excerpt}</blockquote>
                    {e.score != null && <div className="num mt-1 text-[10px] text-fg-faint">retrieval score {e.score.toFixed(3)} · {e.chunk_id}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-3">
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-fg-faint">Citations</h3>
            {data.citations.length === 0 ? (
              <p className="text-[11px] text-fg-faint">No citations (no retrieved passages to cite).</p>
            ) : (
              <ul className="space-y-0.5 text-[11px]">
                {data.citations.map((c) => (
                  <li key={c.citation_id}>
                    <span className="num text-fg-muted">{c.citation_id}</span>{" "}
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-copper-bright underline decoration-dotted hover:text-fg">
                      {c.title}
                    </a>{" "}
                    <span className="text-fg-faint">— {c.institution}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.limitations && data.limitations.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-fg-faint">Limitations</h3>
              <BulletList items={data.limitations} tone="warn" />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
