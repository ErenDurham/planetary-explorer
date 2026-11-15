import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { discoveryEngine, type CandidateResearchUpdate } from "@/services/discoveryEngine";
import { useAppStore } from "@/store/useAppStore";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";

export function CandidateResearchPanel() {
  const target = useCandidateResearchTarget(s => s.target);
  const client = useQueryClient();
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<CandidateResearchUpdate["status"]>("unresearched");
  const [findings, setFindings] = useState<NonNullable<CandidateResearchUpdate["findings"]>>([]);
  const [copyState, setCopyState] = useState("");
  const query = useQuery({
    queryKey: ["discovery", "research", target?.runId, target?.candidateId, submittedQuestion],
    queryFn: ({ signal }) => discoveryEngine.research(target!.runId, target!.candidateId, submittedQuestion, signal),
    enabled: !!target, retry: false,
  });
  const data = query.data;
  const hydratedRecord = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const identity = `${data.run_id}:${data.candidate_id}:${data.record.updated_at ?? "new"}`;
    if (hydratedRecord.current === identity) return;
    hydratedRecord.current = identity;
    setNotes(data.record.notes ?? ""); setStatus(data.record.status ?? "unresearched"); setFindings(data.record.findings ?? []);
  }, [target?.runId, target?.candidateId, data?.record.updated_at]);
  const save = useMutation({
    mutationFn: () => discoveryEngine.saveResearch(target!.runId, target!.candidateId, { status, notes, findings }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["discovery"] }); },
  });
  const dirty = !!data && (status !== data.record.status || notes !== data.record.notes || JSON.stringify(findings) !== JSON.stringify(data.record.findings));
  const canComplete = notes.trim().length >= 40 && findings.some(f => f.scope !== "regional_background");
  const button = "rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-fg hover:border-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper disabled:opacity-40";
  const input = "w-full rounded-lg border border-line-strong bg-bg p-3 text-sm text-fg";
  if (!target) return <section className="rounded-xl border border-line-strong bg-bg-elev p-4"><h2 className="text-lg font-semibold text-fg">Earth candidate research</h2><p className="mt-2 text-sm text-fg-muted">Select a proposed region in Discover, then choose “Research this candidate”. Its research status is separate from its terrain score.</p><button type="button" className={`${button} mt-3`} onClick={() => useAppStore.getState().setActiveTab("discover")}>Choose a discovery candidate</button></section>;
  if (query.isPending) return <div role="status" className="space-y-3 p-4"><p className="text-sm text-fg-muted">Loading candidate research dossier…</p><div className="h-24 animate-pulse rounded-lg bg-bg-elev-2" /></div>;
  if (query.error || !data) return <div className="p-4"><ErrorNote error={query.error} context="candidate/research" /><button type="button" className={`${button} mt-3`} onClick={() => void query.refetch()}>Retry research dossier</button></div>;
  return <div className="space-y-4" data-testid="candidate-research-panel">
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-fg">Deep research: {data.candidate.name}</h2><p className="mt-1 text-sm text-fg-muted">{data.candidate.lat.toFixed(4)}°, {data.candidate.lon_east.toFixed(4)}°E · survey {data.run_id}</p></div><ResearchStatusBadge status={data.record.status} /></div>
      <p className="mt-3 text-sm text-warn">This candidate has not been field validated. Opening this dossier or retrieving background passages does not complete a literature review.</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(data.candidate.profile?.measurements ?? {}).map(([id, m]) => <div key={id}><dt className="text-fg-muted">{id.replaceAll("_", " ")}</dt><dd className="num text-fg">{m.value.toFixed(3)} {m.unit} · regional measurement</dd></div>)}</dl>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={async () => { try { await navigator.clipboard.writeText(data.research_brief); setCopyState("Investigation brief copied."); } catch { setCopyState("Copy unavailable. Expand the brief below and copy its text."); } }}>Copy investigation brief</button><button type="button" className={button} onClick={() => useAppStore.getState().setActiveTab("discover")}>Back to discovery candidates</button></div>
      {copyState && <p role="status" className="mt-2 text-sm text-fg-muted">{copyState}</p>}
      <details className="mt-3"><summary className="cursor-pointer text-sm text-fg">Full investigation brief</summary><pre className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{data.research_brief}</pre></details>
    </section>
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4"><h3 className="text-lg font-semibold text-fg">Investigate the full footprint</h3><ol className="mt-3 list-decimal space-y-2 pl-6 text-sm text-fg-muted">{data.research_questions.map(q => <li key={q}>{q}</li>)}</ol><p className="mt-3 text-sm text-fg-muted">Open targeted searches, inspect the sources, then record findings below. These links do not run an automated web review.</p><div className="mt-3 flex flex-wrap gap-3">{data.search_tasks.map(s => <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="text-sm text-info underline underline-offset-2">{s.label}</a>)}</div></section>
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4"><h3 className="text-lg font-semibold text-fg">Evidence library</h3><p className="mt-2 text-sm text-fg-muted">Retrieved from the existing local library. These passages are background, not proof about this footprint or a live literature search.</p><form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setSubmittedQuestion(question.trim()); }}><label htmlFor="candidate-evidence-question" className="sr-only">Question for the evidence library</label><input id="candidate-evidence-question" maxLength={1000} className={`${input} flex-1`} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What evidence would support or contradict this analogy?" /><button className={button} disabled={query.isFetching}>Retrieve background evidence</button></form>
      {data.background_evidence.length === 0 ? <p className="mt-3 text-sm text-warn">No relevant library passages are available. This is an evidence gap, not evidence of novelty.</p> : <ul className="mt-3 space-y-3">{data.background_evidence.map(e => <li key={e.chunk_id} className="rounded-lg border border-line p-3"><p className="text-xs font-semibold text-warn">Background only · candidate relevance not established</p><a href={e.url} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-info underline">{e.title}</a><p className="mt-1 text-sm text-fg-muted">{e.institution}{e.publication_date ? ` · ${e.publication_date}` : ""}</p><blockquote className="mt-2 text-sm text-fg">{e.excerpt}</blockquote></li>)}</ul>}
    </section>
    <section className="rounded-xl border border-line-strong bg-bg-elev p-4"><h3 className="text-lg font-semibold text-fg">Research notebook</h3><p className="mt-2 text-sm text-fg-muted">Saved findings are analyst supplied and are not automatically verified. Literature reviewed means a documented literature review, never a validated analog.</p>
      <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <label className="block text-sm text-fg">Research status<select aria-label="Candidate research status" className={`${input} mt-2`} value={status} onChange={e => setStatus(e.target.value as CandidateResearchUpdate["status"])}><option value="unresearched">Unresearched</option><option value="in_progress">Research in progress</option><option value="literature_reviewed">Literature reviewed</option></select></label>
        <label className="block text-sm text-fg">Review summary and remaining gaps<textarea aria-label="Review summary and remaining gaps" className={`${input} mt-2`} rows={5} maxLength={12000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {findings.map((f, i) => <fieldset key={i} className="space-y-2 rounded-lg border border-line p-3"><legend className="text-sm text-fg">Source finding {i+1}</legend><input aria-label={`Source ${i+1} title`} required minLength={3} maxLength={250} placeholder="Source title" className={input} value={f.title} onChange={e => setFindings(v => v.map((x,j) => j === i ? {...x,title:e.target.value}:x))} /><input aria-label={`Source ${i+1} URL`} required type="url" placeholder="https://…" className={input} value={f.url} onChange={e => setFindings(v => v.map((x,j) => j === i ? {...x,url:e.target.value}:x))} /><select aria-label={`Source ${i+1} relevance`} className={input} value={f.scope} onChange={e => setFindings(v => v.map((x,j) => j === i ? {...x,scope:e.target.value as typeof f.scope}:x))}><option value="regional_background">Regional background only</option><option value="candidate_specific">Direct evidence for this candidate</option><option value="contradictory">Evidence against the proposed analogy</option></select><textarea aria-label={`Source ${i+1} finding`} required minLength={20} maxLength={4000} placeholder="What does the source establish, and where does it apply?" className={input} value={f.finding} onChange={e => setFindings(v => v.map((x,j) => j === i ? {...x,finding:e.target.value}:x))} /><button type="button" className={button} onClick={() => setFindings(v => v.filter((_,j) => j!==i))}>Remove source finding {i+1}</button></fieldset>)}
        <button type="button" disabled={findings.length>=20} className={button} onClick={() => setFindings(v => [...v,{title:"",url:"",finding:"",scope:"regional_background"}])}>Add cited finding</button>
        {status === "literature_reviewed" && !canComplete && <p className="text-sm text-warn">To record a literature review, add a summary of at least 40 characters and a source finding that directly addresses or contradicts this candidate.</p>}
        <div><button className={button} disabled={save.isPending || (status === "literature_reviewed" && !canComplete)}>{save.isPending ? "Saving research notes…" : "Save research notes"}</button></div>
        {save.error && <ErrorNote error={save.error} context="candidate/research/save" />}{save.isSuccess && !dirty && <p role="status" className="text-sm text-ok">Research notebook saved. The candidate tag reflects the recorded review status.</p>}
      </form>
    </section>
  </div>;
}
