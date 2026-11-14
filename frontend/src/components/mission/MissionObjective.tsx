// Mission objective: free text in, a REVIEWABLE share proposal out. Nothing
// here changes the sliders until the user clicks "Apply to priorities"; the
// proposal comes from POST /mission/interpret, or from the local keyword rules
// when the backend is unreachable, and is labelled accordingly. A proposal is
// only ever shown as "interpreted" for the exact text it was produced from,
// and proposed values are shown as SHARES (before -> proposed) so they read
// the same way the sliders do. Applying is the ONLY action that replaces the
// current shares; editing the text alone never touches them.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Cpu, WifiOff } from "lucide-react";
import { useAppStore, type ObjectiveSource } from "@/store/useAppStore";
import { useInterpretObjective, applicationFromInterpretation, type InterpretResult } from "@/hooks/useInterpretObjective";
import { toShares } from "@/lib/allocation";
import { factorName } from "@/lib/objective";
import { Section } from "@/components/ui/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const CONFIDENCE_TONE: Record<string, BadgeTone> = { high: "ok", medium: "warn", low: "neutral" };

export function MissionObjective({ excluded }: { excluded: string[] }) {
  const objective = useAppStore((s) => s.missionObjective);
  const applied = useAppStore((s) => s.appliedObjective);
  const appliedSource = useAppStore((s) => s.appliedObjectiveSource);
  const appliedModel = useAppStore((s) => s.appliedObjectiveModel);
  const interpretation = useAppStore((s) => s.appliedInterpretation);
  const defaults = useAppStore((s) => s.defaultWeights);
  const weights = useAppStore((s) => s.weights);
  const apply = useAppStore((s) => s.applyObjective);
  const notes = useAppStore((s) => s.objectiveNotes);
  const [draft, setDraft] = useState(objective);
  const interpret = useInterpretObjective();
  const draftDiffers = Boolean(applied) && draft.trim() !== applied;

  const onSuggest = () => {
    const current = Object.keys(weights).length ? weights : toShares(defaults, excluded);
    void interpret.run(draft, current, excluded);
  };

  return (
    <Section title="Mission objective" subtitle="Describe the mission; review the suggested shares before applying.">
      <form onSubmit={(e) => { e.preventDefault(); onSuggest(); }}>
        <label htmlFor="mission-objective" className="sr-only">Your mission objective</label>
        <textarea id="mission-objective" maxLength={500} rows={2} required value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="For example: land safely and maximise solar energy" className="w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-fg" />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button disabled={!draft.trim() || !Object.keys(defaults).length || interpret.status === "pending"} className="inline-flex items-center gap-2 rounded-lg border border-copper bg-copper/10 px-3 py-1.5 text-sm font-semibold text-copper-bright disabled:opacity-40" type="submit">
            {interpret.status === "pending" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {interpret.status === "pending" ? "Reading objective…" : "Suggest priorities"}
          </button>
          {applied && appliedSource && (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg-muted">
              <span>Applied objective:</span>
              <ProvenanceBadge source={appliedSource} model={appliedModel} />
            </span>
          )}
        </div>
        {draftDiffers && (
          <p className="mt-2 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn" role="status" data-testid="objective-stale-notice">
            Current priorities belong to the previous applied objective: “{applied}”. Suggest, review and apply to change them.
          </p>
        )}
      </form>

      {interpret.status === "done" && interpret.result && (
        <ProposalReview
          result={interpret.result}
          draft={draft}
          excluded={excluded}
          current={weights}
          onRerun={onSuggest}
          onDiscard={interpret.discard}
          onApply={(text, w, reviewNotes, meta) => { apply(text, w, reviewNotes, meta); interpret.discard(); }}
        />
      )}

      <details className="mt-2 text-xs text-fg-muted" data-testid="why-these-priorities">
        <summary className="cursor-pointer">Why these priorities?</summary>
        <p className="mt-1.5">A reading of your objective text, not a scientific finding: the shares are a starting point, never an optimal allocation. Scores use the documented model.</p>
        {interpretation ? (
          <>
            {interpretation.confidence && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={CONFIDENCE_TONE[interpretation.confidence] ?? "neutral"}>confidence {interpretation.confidence}</Badge>
                <span>{interpretation.confidenceNote}</span>
              </p>
            )}
            <ul className="mt-1.5 space-y-0.5" aria-label="Per-factor reasons">
              {Object.entries(interpretation.reasons).map(([id, reason]) => (
                <li key={id}><span className="text-fg">{factorName(id)}:</span> {reason}</li>
              ))}
            </ul>
            <NoteList title="Trade-offs read from the text" items={interpretation.tradeoffs} />
            <NoteList title="Cannot be scored by this model" items={interpretation.unsupportedNeeds} tone="warn" />
            <NoteList title="Clarifying questions" items={interpretation.clarifyingQuestions} tone="info" />
            <NoteList title="Validation notes" items={interpretation.validationNotes} />
            {interpretation.editedByUser && <p className="mt-1.5 text-fg-faint">You edited the proposed shares before applying them.</p>}
          </>
        ) : (
          <ul className="mt-1.5 space-y-1">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
      </details>
    </Section>
  );
}

function ProvenanceBadge({ source, model, muted }: { source: ObjectiveSource; model?: string | null; muted?: boolean }) {
  const cls = muted ? "opacity-50" : "";
  if (source === "llm") return <Badge tone="copper" className={cls} title={muted ? "The objective text changed after this suggestion was produced" : undefined}><Sparkles className="h-3 w-3" aria-hidden /> Interpreted by language model{model ? ` (${model})` : ""}</Badge>;
  if (source === "offline_rule_based") return <Badge tone="warn" className={cls}><WifiOff className="h-3 w-3" aria-hidden /> Offline rule-based suggestion</Badge>;
  return <Badge tone="neutral" className={cls}><Cpu className="h-3 w-3" aria-hidden /> Rule-based reading (no model)</Badge>;
}

function ProposalReview({ result, draft, excluded, current, onRerun, onDiscard, onApply }: {
  result: InterpretResult;
  draft: string;
  excluded: string[];
  /** The current store shares, shown as "before". */
  current: Record<string, number>;
  onRerun: () => void;
  onDiscard: () => void;
  onApply: (text: string, weights: Record<string, number>, notes: string[], meta: { objectiveHash?: string | null; source?: ObjectiveSource; model?: string | null; interpretation?: import("@/store/useAppStore").AppliedInterpretation | null }) => void;
}) {
  const r = result.response;
  const stale = draft.trim() !== result.requestedText;
  const source: ObjectiveSource = result.offline ? "offline_rule_based" : r.generated_by;
  const noData = (id: string, available: boolean) => !available || excluded.includes(id);
  // proposed values as SHARES: the interpretation's weights normalised to 100 over the active factors
  const proposedShares = useMemo(
    () => toShares(Object.fromEntries(r.suggestions.map((s) => [s.criterion_id, noData(s.criterion_id, s.data_available) ? 0 : s.weight])), excluded),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, excluded.join(",")],
  );
  const before = useMemo(() => {
    const ids = r.suggestions.map((s) => s.criterion_id);
    const have = ids.every((id) => id in current);
    return have ? current : toShares(Object.fromEntries(r.suggestions.map((s) => [s.criterion_id, s.previous_weight])), excluded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, current, excluded.join(",")]);
  const [edited, setEdited] = useState<Record<string, number>>(proposedShares);
  useEffect(() => setEdited(proposedShares), [proposedShares]);
  const editedTotal = r.suggestions.reduce((sum, s) => sum + (noData(s.criterion_id, s.data_available) ? 0 : edited[s.criterion_id] ?? 0), 0);
  const changedByUser = r.suggestions.some((s) => !noData(s.criterion_id, s.data_available) && edited[s.criterion_id] !== proposedShares[s.criterion_id]);

  const applyNow = () => {
    const app = applicationFromInterpretation({ ...r, suggestions: r.suggestions.map((s) => ({ ...s, weight: proposedShares[s.criterion_id] ?? s.weight })) }, excluded, source, edited);
    onApply(result.requestedText, app.weights, app.notes, app.meta);
  };

  return (
    <div className="mt-2 rounded-lg border border-copper/40 bg-copper/5 p-2.5" role="region" aria-label="Proposed priority allocation">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <h3 className="text-sm font-semibold text-fg">Proposed shares</h3>
        <ProvenanceBadge source={source} model={r.model} muted={stale} />
        <Badge tone={CONFIDENCE_TONE[r.confidence] ?? "neutral"} title={r.confidence_note}>confidence {r.confidence}</Badge>
        {r.cached && <Badge tone="neutral">cached</Badge>}
      </div>
      <p className="mb-1.5 text-xs text-fg-muted">Confidence is about how clearly the text was read, not about any site's suitability. {r.confidence_note}</p>
      {result.offline && <p className="mb-1.5 text-xs text-warn" role="status">Backend unreachable{result.error ? ` (${result.error.message})` : ""}. This proposal comes from the browser's keyword rules; no language model was involved.</p>}
      {stale && <p className="mb-1.5 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn" role="status">Objective changed since this suggestion. Run Suggest priorities again before applying.</p>}

      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-fg-faint">
          <tr><th className="py-1 pr-2 font-medium">Factor</th><th className="num py-1 pr-2 text-right font-medium">Before</th><th className="num py-1 pr-2 text-right font-medium">Proposed %</th><th className="py-1 font-medium">Reason</th></tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {r.suggestions.map((s) => {
            const off = noData(s.criterion_id, s.data_available);
            const id = `proposed-${s.criterion_id}`;
            return (
              <tr key={s.criterion_id} className={off ? "text-fg-faint" : "text-fg"}>
                <td className="py-1 pr-2"><label htmlFor={id}>{factorName(s.criterion_id, s.label)}</label>{off && <div className="text-[10px] uppercase tracking-wide text-warn">no data · forced to 0</div>}</td>
                <td className="num py-1 pr-2 text-right">{Math.round(before[s.criterion_id] ?? 0)}%</td>
                <td className="py-1 pr-2 text-right">
                  <span className="num mr-1 text-fg-faint" aria-hidden>→</span>
                  <input id={id} type="number" min={0} max={100} step={1} disabled={off || stale} value={off ? 0 : edited[s.criterion_id] ?? proposedShares[s.criterion_id] ?? 0} aria-label={`Proposed share for ${s.label}`} onChange={(e) => setEdited((w) => ({ ...w, [s.criterion_id]: clamp(Number(e.target.value)) }))} className="num w-14 rounded border border-line-strong bg-bg px-1.5 py-0.5 text-right text-xs text-fg disabled:opacity-50" />
                </td>
                <td className="py-1 text-fg-muted">{s.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-fg-faint">{editedTotal === 100 ? "Proposed shares total 100%." : `Edited shares total ${editedTotal}%; they are rescaled to 100% on apply.`}{changedByUser ? " You changed the proposal." : ""}</p>

      <NoteList title="Rationale" items={r.rationale} />
      <NoteList title="Trade-offs read from the text" items={r.tradeoffs} />
      <NoteList title="Cannot be scored by this model" items={r.unsupported_needs} tone="warn" />
      <NoteList title="Clarifying questions" items={r.clarifying_questions} tone="info" />
      <NoteList title="Validation notes" items={r.validation_notes} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {stale && <button type="button" onClick={onRerun} className="rounded-lg border border-copper bg-copper/10 px-3 py-1.5 text-xs font-semibold text-copper-bright">Re-run Suggest priorities</button>}
        <button type="button" onClick={applyNow} disabled={stale} title={stale ? "Objective changed since this suggestion" : "Replaces your current shares with the proposal"} className="rounded-lg border border-copper bg-copper/10 px-3 py-1.5 text-left text-xs font-semibold text-copper-bright disabled:opacity-40">
          Apply to priorities
          <span className="block text-[10px] font-normal text-fg-muted">Replaces your current shares</span>
        </button>
        <button type="button" onClick={onDiscard} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-muted hover:text-fg">Discard</button>
      </div>
    </div>
  );
}

function NoteList({ title, items, tone }: { title: string; items?: string[] | null; tone?: "warn" | "info" }) {
  if (!items || items.length === 0) return null;
  const color = tone === "warn" ? "text-warn" : tone === "info" ? "text-info" : "text-fg-faint";
  return (
    <div className="mt-1.5">
      <h4 className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>{title}</h4>
      <ul className="mt-0.5 space-y-0.5 text-xs text-fg-muted">{items.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
