// Research for one discovery candidate, ordered for finishing: who and where
// (with the rank, index and weights it arrived with, and a way back to it in
// Explore), what the three statuses mean, the notebook with its save feedback,
// the research checklist and prepared searches, the downloadable brief, and
// only then the background passages, labelled as background. Drafts live in
// the target store so leaving the tab never loses them; the page warns before
// an unload with unsaved edits; a failed save says so and keeps the draft.
// Nothing here advances the research status except an explicit save under the
// backend's rule.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { discoveryEngine, type CandidateResearchUpdate } from "@/services/discoveryEngine";
import { useAppStore } from "@/store/useAppStore";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RESEARCH_STATUS_MEANING, ResearchStatusBadge, type ResearchStatus } from "./ResearchStatusBadge";
import { draftKey, useCandidateResearchTarget, type ResearchDraft, type ResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import { useDiscoveryRank } from "../hooks/useDiscoveryRank";
import { useDiscoveryCapabilities } from "../hooks/useDiscoveryCapabilities";
import { buildResearchBrief, researchBriefFilename } from "../lib/researchBrief";
import { downloadText } from "../lib/download";
import { formatPoint } from "../lib/geo";
import { PROPOSED_LABEL } from "../lib/copy";

type Finding = NonNullable<CandidateResearchUpdate["findings"]>[number];
const STATUSES: ResearchStatus[] = ["unresearched", "in_progress", "literature_reviewed"];
const button = "rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-fg hover:border-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper disabled:opacity-40";
const input = "w-full rounded-lg border border-line-strong bg-bg p-3 text-sm text-fg";

/** Go back to the same candidate in Explore, selecting it there. */
function returnToCandidate(target: ResearchTarget) {
  const ds = useDiscoveryStore.getState();
  if (ds.runId !== target.runId) ds.setRun(target.runId);
  useDiscoveryStore.getState().selectCandidate(target.candidateId);
  useAppStore.getState().openFindAnalogs();
}

export function CandidateResearchPanel() {
  const target = useCandidateResearchTarget(s => s.target);
  const draft = useCandidateResearchTarget(s => (s.target ? s.drafts[draftKey(s.target)] : undefined));
  const setDraft = useCandidateResearchTarget(s => s.setDraft);
  const clearDraft = useCandidateResearchTarget(s => s.clearDraft);
  const client = useQueryClient();
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [copyState, setCopyState] = useState("");
  const [briefState, setBriefState] = useState("");

  const query = useQuery({
    queryKey: ["discovery", "research", target?.runId, target?.candidateId, submittedQuestion],
    queryFn: ({ signal }) => discoveryEngine.research(target!.runId, target!.candidateId, submittedQuestion, signal),
    enabled: !!target, retry: false,
  });
  const data = query.data;
  const record = data?.record;

  // ranking context from this session: the same cached rank query Explore used, read-only here
  const caps = useDiscoveryCapabilities();
  const weights = useDiscoveryStore(s => s.weights);
  const topK = useDiscoveryStore(s => s.topK);
  const rank = useDiscoveryRank(target?.runId ?? null, weights, topK, !!target);
  const ranked = rank.data?.candidates.find(c => c.id === target?.candidateId) ?? null;
  const run = (caps.kind === "ready" ? caps.capabilities.runs : []).find(r => r.run_id === target?.runId) ?? null;

  // the notebook as edited: the draft when there is one, else the saved record
  const working: ResearchDraft | null = draft ?? (record ? { status: record.status, notes: record.notes ?? "", findings: record.findings ?? [], checked: [], baseUpdatedAt: record.updated_at ?? null } : null);
  const dirty = !!draft && !!record && (draft.status !== record.status || draft.notes !== (record.notes ?? "") || JSON.stringify(draft.findings) !== JSON.stringify(record.findings ?? []));
  const staleBase = !!draft && !!record && dirty && draft.baseUpdatedAt !== (record.updated_at ?? null);
  const update = (patch: Partial<ResearchDraft>) => { if (target && working) setDraft(target, { ...working, ...patch }); };
  const setFindings = (fn: (v: Finding[]) => Finding[]) => update({ findings: fn(working?.findings ?? []) });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => discoveryEngine.saveResearch(target!.runId, target!.candidateId, { status: working!.status, notes: working!.notes, findings: working!.findings }),
    onSuccess: async () => { if (target) clearDraft(target); await client.invalidateQueries({ queryKey: ["discovery"] }); },
  });
  const canComplete = !!working && working.notes.trim().length >= 40 && working.findings.some(f => f.scope !== "regional_background");
  const blockedCompletion = working?.status === "literature_reviewed" && !canComplete;

  const downloadBrief = () => {
    if (!data || !working) return;
    const md = buildResearchBrief({ dossier: data, ranked, ranking: rank.data ?? null, run, notebook: { status: working.status, notes: working.notes, findings: working.findings }, draft: dirty });
    const name = researchBriefFilename(data, dirty);
    downloadText(name, md, "text/markdown");
    setBriefState(`Saved ${name}${dirty ? " (marked DRAFT: it contains unsaved edits)" : ""}. Downloading never changes the research status.`);
  };

  if (!target) return <section className="rounded-xl border border-line-strong bg-bg-elev p-4"><h2 className="text-lg font-semibold text-fg">Earth candidate research</h2><p className="mt-2 text-sm text-fg-muted">Select a candidate under Explore → Find Earth Analogs, then choose “Research this candidate”. Its research status is separate from its terrain score.</p><button type="button" className={`${button} mt-3`} onClick={() => useAppStore.getState().openFindAnalogs()}>Choose a discovery candidate</button></section>;
  if (query.isPending) return <div role="status" className="space-y-3 p-4"><p className="text-sm text-fg-muted">Loading candidate research dossier…</p><div className="h-24 animate-pulse rounded-lg bg-bg-elev-2" /></div>;
  if (query.error || !data || !working) return <div className="p-4"><ErrorNote error={query.error} context="candidate/research" /><button type="button" className={`${button} mt-3`} onClick={() => void query.refetch()}>Retry research dossier</button></div>;

  const c = data.candidate;
  const weightLine = rank.data ? Object.entries(rank.data.effective_weights).map(([k, v]) => `${k === "slope_regional_median_deg" ? "slope" : k === "roughness_regional_m" ? "relief" : k} ${(v * 100).toFixed(0)}%`).join(" · ") : null;

  return <div className="space-y-4" data-testid="candidate-research-panel">
    {/* who, where, and the ranking context it arrived with */}
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4">
      <button type="button" className="inline-flex items-center gap-1.5 text-sm text-info underline underline-offset-2" onClick={() => returnToCandidate(target)}><ArrowLeft className="h-4 w-4" aria-hidden />Back to this candidate in Explore</button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold text-fg">Deep research: {c.name}</h2><p className="num mt-1 text-sm text-fg-muted">{formatPoint(c.lat, c.lon_east, 4)} · survey {run?.label ?? data.run_id}</p></div>
        <ResearchStatusBadge status={record!.status} />
      </div>
      <p className="mt-2 text-xs text-fg-muted" data-testid="research-ranking-context">
        {ranked ? <>Rank <span className="num text-fg">{ranked.display_rank ?? "—"}{rank.data?.returned_count ? ` of ${rank.data.returned_count}` : ""}</span> in this session's ranking · index <span className="num text-fg">{ranked.similarity_index?.toFixed(1) ?? "—"}</span> / 100{weightLine ? <> · weights {weightLine}</> : null}. The index is a two-feature terrain heuristic, not a probability.</> : rank.isPending ? "Loading this session's ranking context…" : "Not in this session's shortlist at the current weights and shortlist size; the candidate record below is unchanged by that."}
      </p>
      <p className="mt-2 text-xs text-fg-faint">{PROPOSED_LABEL} Opening this dossier, retrieving background passages or downloading a brief does not change the research status; only saving the notebook does.</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(c.profile?.measurements ?? {}).map(([id, m]) => <div key={id}><dt className="text-fg-muted">{id.replaceAll("_", " ")}</dt><dd className="num text-fg">{m.value.toFixed(3)} {m.unit} · regional measurement</dd></div>)}</dl>
    </section>

    {/* the notebook, with what the statuses mean and honest save feedback */}
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="research-notebook">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="research-notebook" className="text-lg font-semibold text-fg">Research notebook</h3>{dirty && <span className="rounded-full border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs text-warn" data-testid="draft-indicator">Unsaved changes · kept while you navigate</span>}</div>
      <p className="mt-2 text-sm text-fg-muted">Saved findings are analyst supplied and are not automatically verified. Literature reviewed means a documented literature review, never a validated analog, and it can conclude the candidate is unsuitable.</p>
      {staleBase && <p role="status" className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2 text-xs text-warn">The saved notes changed after this draft was started. Saving will overwrite them; discard the draft to see the saved version.</p>}
      <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <label className="block text-sm text-fg">Research status
          <select aria-label="Candidate research status" className={`${input} mt-2`} value={working.status} onChange={e => update({ status: e.target.value as ResearchStatus })}>
            {STATUSES.map(s => <option key={s} value={s}>{RESEARCH_STATUS_MEANING[s].label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-fg-muted" data-testid="status-meaning">{RESEARCH_STATUS_MEANING[working.status].meaning}</span>
        </label>
        <details className="rounded-lg border border-line px-3 py-2 text-xs text-fg-muted"><summary className="cursor-pointer text-fg">What the three statuses mean</summary>
          <dl className="mt-2 space-y-1.5">{STATUSES.map(s => <div key={s}><dt className="font-medium text-fg">{RESEARCH_STATUS_MEANING[s].label}</dt><dd>{RESEARCH_STATUS_MEANING[s].meaning}</dd></div>)}</dl>
          <p className="mt-2">Status changes only when you save. Viewing, searching, exporting and downloading never change it.</p>
        </details>
        <label className="block text-sm text-fg">Review summary and remaining gaps<textarea aria-label="Review summary and remaining gaps" className={`${input} mt-2`} rows={5} maxLength={12000} value={working.notes} onChange={e => update({ notes: e.target.value })} /></label>
        {working.findings.map((f, i) => <fieldset key={i} className="space-y-2 rounded-lg border border-line p-3"><legend className="text-sm text-fg">Source finding {i + 1}</legend><input aria-label={`Source ${i + 1} title`} required minLength={3} maxLength={250} placeholder="Source title" className={input} value={f.title} onChange={e => setFindings(v => v.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} /><input aria-label={`Source ${i + 1} URL`} required type="url" placeholder="https://…" className={input} value={f.url} onChange={e => setFindings(v => v.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} /><select aria-label={`Source ${i + 1} relevance`} className={input} value={f.scope} onChange={e => setFindings(v => v.map((x, j) => j === i ? { ...x, scope: e.target.value as Finding["scope"] } : x))}><option value="regional_background">Regional background only</option><option value="candidate_specific">Direct evidence for this candidate</option><option value="contradictory">Evidence against the proposed analogy</option></select><textarea aria-label={`Source ${i + 1} finding`} required minLength={20} maxLength={4000} placeholder="What does the source establish, and where does it apply?" className={input} value={f.finding} onChange={e => setFindings(v => v.map((x, j) => j === i ? { ...x, finding: e.target.value } : x))} /><button type="button" className={button} onClick={() => setFindings(v => v.filter((_, j) => j !== i))}>Remove source finding {i + 1}</button></fieldset>)}
        <button type="button" disabled={working.findings.length >= 20} className={button} onClick={() => setFindings(v => [...v, { title: "", url: "", finding: "", scope: "regional_background" }])}>Add cited finding</button>
        {blockedCompletion && <p className="text-sm text-warn">To record a literature review, add a summary of at least 40 characters and a source finding that directly addresses or contradicts this candidate.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button className={button} disabled={save.isPending || blockedCompletion}>{save.isPending ? "Saving research notes…" : "Save research notes"}</button>
          {dirty && <button type="button" className={button} onClick={() => clearDraft(target)}>Discard changes</button>}
        </div>
        {save.error ? <div><ErrorNote error={save.error} context="candidate/research/save" /><p className="mt-1 text-sm text-warn" role="status">Nothing was saved. Your notes are still here; try again, or download the brief to keep a copy.</p></div> : null}
        {save.isSuccess && !dirty && <p role="status" className="text-sm text-ok">Research notebook saved. The candidate tag reflects the recorded review status.</p>}
      </form>
    </section>

    {/* the checklist and the prepared searches */}
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="research-checklist">
      <h3 id="research-checklist" className="text-lg font-semibold text-fg">Research checklist</h3>
      <p className="mt-2 text-sm text-fg-muted">Questions the service prepared for this footprint. Ticks are a working aid in this browser session and are not part of the saved record; record what you find as notes and cited findings above.</p>
      <ul className="mt-3 space-y-2 text-sm text-fg">{data.research_questions.map(q => <li key={q}><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4 accent-copper-bright" checked={working.checked.includes(q)} onChange={e => update({ checked: e.target.checked ? [...working.checked, q] : working.checked.filter(x => x !== q) })} /><span>{q}</span></label></li>)}</ul>
      <p className="mt-3 text-sm text-fg-muted">Open targeted searches, inspect the sources, then record findings in the notebook. These links do not run an automated web review.</p>
      <div className="mt-2 flex flex-wrap gap-3">{data.search_tasks.map(s => <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="text-sm text-info underline underline-offset-2">{s.label}</a>)}</div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={async () => { try { await navigator.clipboard.writeText(data.research_brief); setCopyState("Investigation brief copied."); } catch { setCopyState("Copy unavailable. Expand the brief below and copy its text."); } }}>Copy investigation brief</button></div>
      {copyState && <p role="status" className="mt-2 text-sm text-fg-muted">{copyState}</p>}
      <details className="mt-3"><summary className="cursor-pointer text-sm text-fg">Full investigation brief</summary><pre className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{data.research_brief}</pre></details>
    </section>

    {/* the finish */}
    <section className="rounded-xl border border-copper/50 bg-copper/5 p-4" aria-labelledby="research-finish">
      <h3 id="research-finish" className="text-lg font-semibold text-fg">Finish: download the research brief</h3>
      <p className="mt-2 text-sm text-fg-muted">One Markdown file with this candidate, the reference and run, the ranking settings and measurements, the catalog-relative statement, the sources, your notes and cited findings (contradictions listed separately), the open questions and the research status. Unsaved edits are included and the file is marked DRAFT. The reproducible JSON audit export is under Export in Explore.</p>
      <button type="button" className={`${button} mt-3 inline-flex items-center gap-2 border-copper text-copper-bright`} onClick={downloadBrief} data-testid="download-research-brief"><Download className="h-4 w-4" aria-hidden />Download research brief{dirty ? " (draft)" : ""}</button>
      {briefState && <p role="status" className="mt-2 text-sm text-fg-muted">{briefState}</p>}
    </section>

    {/* background, last and labelled */}
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="research-background">
      <h3 id="research-background" className="text-lg font-semibold text-fg">Background evidence</h3>
      <p className="mt-2 text-sm text-fg-muted">Retrieved from the existing local library. These passages are background, not proof about this footprint or a live literature search.</p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setSubmittedQuestion(question.trim()); }}><label htmlFor="candidate-evidence-question" className="sr-only">Question for the evidence library</label><input id="candidate-evidence-question" maxLength={1000} className={`${input} flex-1`} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What evidence would support or contradict this analogy?" /><button className={button} disabled={query.isFetching}>Retrieve background evidence</button></form>
      {data.background_evidence.length === 0 ? <p className="mt-3 text-sm text-warn">No relevant library passages are available. This is an evidence gap, not evidence of novelty.</p> : <ul className="mt-3 space-y-3">{data.background_evidence.map(e => <li key={e.chunk_id} className="rounded-lg border border-line p-3"><p className="text-xs font-semibold text-warn">Background only · candidate relevance not established</p><a href={e.url} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-info underline">{e.title}</a><p className="mt-1 text-sm text-fg-muted">{e.institution}{e.publication_date ? ` · ${e.publication_date}` : ""}</p><blockquote className="mt-2 text-sm text-fg">{e.excerpt}</blockquote></li>)}</ul>}
    </section>
  </div>;
}
