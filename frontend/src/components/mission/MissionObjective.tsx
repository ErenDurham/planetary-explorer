// Mission objective: free text in, a REVIEWABLE share proposal out. Nothing
// here changes the sliders until the user clicks "Apply to priorities"; the
// proposal comes from POST /mission/interpret, or from the local keyword rules
// when the backend is unreachable, and is labelled accordingly. A proposal is
// only ever shown as "interpreted" for the exact text it was produced from,
// and proposed values are shown as SHARES (before -> proposed) so they read
// the same way the sliders do. Applying is the ONLY action that replaces the
// current shares; editing the text alone never touches them.
import { TaskMissionObjective } from "./TaskMissionObjective";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Cpu, WifiOff } from "lucide-react";
import { useAppStore, type ObjectiveSource } from "@/store/useAppStore";
import { useInterpretObjective, applicationFromInterpretation, taskApplicationFromInterpretation, type InterpretResult, type TaskResolution } from "@/hooks/useInterpretObjective";
import { toShares } from "@/lib/allocation";
import { factorName } from "@/lib/objective";
import { ANALOG_FEATURES, BODY_NAME, analogFeatureLabel, toAnalogShares } from "@/lib/analogFeatures";
import { AIIndicator } from "@/components/ui/AIIndicator";
import { Section } from "@/components/ui/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { DirectionOption, SiteReference, TaskInterpretation } from "@/types";

const TASK_LABEL: Record<TaskInterpretation["task"], string> = {
  landing_screening: "Mars landing screening",
  analog_site_selection: "Analog site selection",
  ambiguous: "Ambiguous - choose a direction",
};

const CONFIDENCE_TONE: Record<string, BadgeTone> = { high: "ok", medium: "warn", low: "neutral" };

export function MissionObjective({ excluded }: { excluded: string[] }) {
  const kind=useAppStore(s=>s.missionType);
  return kind === "landing" ? <LandingMissionObjective excluded={excluded}/> : <TaskMissionObjective key={kind}/>;
}

function LandingMissionObjective({ excluded }: { excluded: string[] }) {
  const objective = useAppStore((s) => s.missionObjective);
  const applied = useAppStore((s) => s.appliedObjective);
  const appliedSource = useAppStore((s) => s.appliedObjectiveSource);
  const appliedModel = useAppStore((s) => s.appliedObjectiveModel);
  const interpretation = useAppStore((s) => s.appliedInterpretation);
  const defaults = useAppStore((s) => s.defaultWeights);
  const weights = useAppStore((s) => s.weights);
  const apply = useAppStore((s) => s.applyObjective);
  const notes = useAppStore((s) => s.objectiveNotes);
  const appliedTask = useAppStore((s) => s.appliedTask);
  const appliedFocusBody = useAppStore((s) => s.appliedFocusBody);
  const appliedDestination = useAppStore((s) => s.appliedMissionDestination);
  const appliedReference = useAppStore((s) => s.appliedReference);
  const setDraftDirty = useAppStore(s => s.setMissionDraftDirty);
  const [draft, setDraft] = useState(objective);
  const interpret = useInterpretObjective();
  const draftDiffers = Boolean(applied) && draft.trim() !== applied;

  const onSuggest = () => {
    const current = Object.keys(weights).length ? weights : toShares(defaults, excluded);
    void interpret.run(draft, current, excluded);
  };

  return (
    <Section title="Mission objective" subtitle="AI can suggest priorities; you review and apply them. Rules are used when AI is unavailable." actions={<AIIndicator label="AI-assisted priorities" iconOnly/>}>
      <form onSubmit={(e) => { e.preventDefault(); onSuggest(); }}>
        <label htmlFor="mission-objective" className="sr-only">Your mission objective</label>
        <textarea id="mission-objective" maxLength={500} rows={2} required value={draft} onChange={(e) => { setDraft(e.target.value); useAppStore.setState({missionObjective:e.target.value}); setDraftDirty(e.target.value.trim() !== applied.trim()); }} placeholder="For example: land safely and maximise solar energy" className="w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-fg" />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button disabled={!draft.trim() || !Object.keys(defaults).length || interpret.status === "pending"} className="inline-flex items-center gap-2 rounded-lg border border-copper bg-copper/10 px-3 py-1.5 text-sm font-semibold text-copper-bright disabled:opacity-40" type="submit">
            {interpret.status !== "pending" && <Sparkles className="h-3.5 w-3.5" aria-hidden />}
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
        {appliedTask && (
          <p className="mt-1.5 text-fg" data-testid="applied-task">
            Applied task: {TASK_LABEL[appliedTask]}
            {appliedFocusBody && <> · looking on {BODY_NAME[appliedFocusBody]}</>}
            {appliedDestination && <> · mission to {BODY_NAME[appliedDestination]}</>}
            {appliedReference && <> · reference {appliedReference.name} ({BODY_NAME[appliedReference.body]})</>}
          </p>
        )}
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
  // what the review settles about the TASK reading: a direction when the text
  // was ambiguous, a site for an unresolved mention, edited analog shares
  const ti = r.task_interpretation ?? null;
  const [direction, setDirection] = useState<DirectionOption | null>(null);
  const [pickedReference, setPickedReference] = useState<SiteReference | null>(null);
  const proposedAnalog = useMemo(() => (ti?.analog_suggestions?.length ? toAnalogShares(Object.fromEntries(ti.analog_suggestions.map((a) => [a.feature_id, a.weight]))) : null), [ti]);
  const [analogEdited, setAnalogEdited] = useState<Record<string, number> | null>(proposedAnalog);
  useEffect(() => { setAnalogEdited(proposedAnalog); setDirection(null); setPickedReference(null); }, [proposedAnalog, ti]);
  const resolution: TaskResolution = { direction, reference: pickedReference, analogShares: analogEdited && proposedAnalog && !sameShares(analogEdited, proposedAnalog) ? toAnalogShares(analogEdited) : null };
  const taskApplication = taskApplicationFromInterpretation(ti, r.objective_hash, resolution);
  const needsDirection = ti?.task === "ambiguous" && !direction;
  const editedTotal = r.suggestions.reduce((sum, s) => sum + (noData(s.criterion_id, s.data_available) ? 0 : edited[s.criterion_id] ?? 0), 0);
  const changedByUser = r.suggestions.some((s) => !noData(s.criterion_id, s.data_available) && edited[s.criterion_id] !== proposedShares[s.criterion_id]);

  const applyNow = () => {
    const app = applicationFromInterpretation({ ...r, suggestions: r.suggestions.map((s) => ({ ...s, weight: proposedShares[s.criterion_id] ?? s.weight })) }, excluded, source, edited, resolution);
    onApply(result.requestedText, app.weights, app.notes, app.meta);
  };

  return (
    <div className="mt-2 rounded-lg border border-copper/40 bg-copper/5 p-2.5" role="region" aria-label="Proposed priority allocation">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <h3 className="text-sm font-semibold text-fg">Proposed mission priorities</h3>
        <ProvenanceBadge source={source} model={r.model} muted={stale} />
        <Badge tone={CONFIDENCE_TONE[r.confidence] ?? "neutral"} title={r.confidence_note}>confidence {r.confidence}</Badge>
        {r.cached && <Badge tone="neutral">cached</Badge>}
      </div>
      <p className="mb-1.5 text-xs text-fg-muted">Confidence is about how clearly the text was read, not about any site's suitability. {r.confidence_note}</p>
      {result.offline && <p className="mb-1.5 text-xs text-warn" role="status">Backend unreachable{result.error ? ` (${result.error.message})` : ""}. This proposal comes from the browser's keyword rules; no language model was involved.</p>}
      {stale && <p className="mb-1.5 rounded border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn" role="status">Objective changed since this suggestion. Run Suggest priorities again before applying.</p>}

      {ti && (
        <TaskReview ti={ti} direction={direction} onDirection={setDirection} pickedReference={pickedReference} onPickReference={setPickedReference} analogShares={analogEdited ?? proposedAnalog} onAnalogShare={(id, v) => setAnalogEdited((cur) => ({ ...(cur ?? proposedAnalog ?? {}), [id]: clamp(v) }))} disabled={stale} />
      )}

      <h4 className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Landing priorities (Mars suitability)</h4>
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
        <button type="button" onClick={applyNow} disabled={stale || needsDirection} title={stale ? "Objective changed since this suggestion" : needsDirection ? "Choose a search direction first" : "Replaces your current shares and sets the task, body and reference"} className="rounded-lg border border-copper bg-copper/10 px-3 py-1.5 text-left text-xs font-semibold text-copper-bright disabled:opacity-40">
          Apply to priorities
          <span className="block text-[10px] font-normal text-fg-muted">{taskApplication ? `Replaces your current shares · ${TASK_LABEL[taskApplication.task]}${taskApplication.focusBody ? ` on ${BODY_NAME[taskApplication.focusBody]}` : ""}` : needsDirection ? "Choose a direction to enable" : "Replaces your current shares"}</span>
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

function sameShares(a: Record<string, number>, b: Record<string, number>): boolean {
  return ANALOG_FEATURES.every((f) => Math.round(a[f.id] ?? 0) === Math.round(b[f.id] ?? 0));
}

/** The task half of the proposal: what the reading says the user is doing,
 * where, for which mission, against which reference - plus the separate
 * analog-match preference proposal. Nothing here is guessed: an ambiguous
 * direction is a radio group and an unresolved mention is a select. */
function TaskReview({ ti, direction, onDirection, pickedReference, onPickReference, analogShares, onAnalogShare, disabled }: {
  ti: TaskInterpretation;
  direction: DirectionOption | null;
  onDirection: (d: DirectionOption) => void;
  pickedReference: SiteReference | null;
  onPickReference: (r: SiteReference | null) => void;
  analogShares: Record<string, number> | null;
  onAnalogShare: (id: string, value: number) => void;
  disabled: boolean;
}) {
  const task = ti.task === "ambiguous" ? direction?.task ?? "ambiguous" : ti.task;
  const focus = ti.task === "ambiguous" ? direction?.focus_body ?? null : ti.focus_body ?? null;
  const reference = ti.reference_site ?? pickedReference;
  const unresolved = ti.unresolved_sites ?? [];
  const analogTotal = analogShares ? ANALOG_FEATURES.reduce((sum, f) => sum + (analogShares[f.id] ?? 0), 0) : 0;
  return (
    <div className="mb-2 rounded border border-line bg-bg/40 p-2" role="group" aria-label="Proposed task" data-testid="task-review">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Task</h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-fg-muted">Proposed task</dt><dd className="text-fg" data-testid="task-proposed">{TASK_LABEL[task]}</dd>
        <dt className="text-fg-muted">Looking on</dt><dd className="text-fg" data-testid="task-focus">{focus ? BODY_NAME[focus] : "—"}</dd>
        <dt className="text-fg-muted">Mission destination</dt><dd className="text-fg" data-testid="task-destination">{ti.mission_destination ? BODY_NAME[ti.mission_destination] : "—"}</dd>
        <dt className="text-fg-muted">Reference site</dt>
        <dd className="text-fg" data-testid="task-reference">{reference ? <>{reference.name} <span className="text-fg-muted">({BODY_NAME[reference.body]})</span></> : unresolved.length ? <span className="text-warn">unresolved - pick below</span> : "none named"}</dd>
      </dl>
      {ti.task === "ambiguous" && (ti.direction_options ?? []).length > 0 && (
        <fieldset className="mt-2">
          <legend className="text-[10px] font-semibold uppercase tracking-wide text-warn">The text does not settle the search direction - choose one</legend>
          <div className="mt-1 space-y-1">
            {(ti.direction_options ?? []).map((d, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2 text-xs text-fg">
                <input type="radio" name="task-direction" className="mt-0.5 accent-copper-bright" disabled={disabled} checked={direction === d} onChange={() => onDirection(d)} />
                <span><span className="font-medium">{d.label}</span> <span className="text-fg-muted">- {d.description}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!ti.reference_site && unresolved.map((u, i) => (
        <label key={i} className="mt-2 block text-xs text-fg-muted">
          “{u.matched_text}” could mean several sites - choose one (never guessed):
          <select
            className="mt-1 w-full rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg"
            disabled={disabled}
            value={pickedReference?.id ?? ""}
            aria-label={`Site for “${u.matched_text}”`}
            onChange={(e) => onPickReference(u.options.find((o) => o.id === e.target.value) ?? null)}
          >
            <option value="">Leave unresolved</option>
            {u.options.map((o) => <option key={`${o.body}:${o.id}`} value={o.id}>{o.name} ({BODY_NAME[o.body]})</option>)}
          </select>
        </label>
      ))}
      {analogShares && (
        <div className="mt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Analog match preferences (separate from landing priorities)</h4>
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-line/70">
              {ANALOG_FEATURES.map((f) => {
                const sug = (ti.analog_suggestions ?? []).find((a) => a.feature_id === f.id);
                const id = `proposed-analog-${f.id}`;
                return (
                  <tr key={f.id} className="text-fg">
                    <td className="py-1 pr-2"><label htmlFor={id}>{analogFeatureLabel(f.id, sug?.label)}</label></td>
                    <td className="py-1 pr-2 text-right">
                      <input id={id} type="number" min={0} max={100} step={1} disabled={disabled} value={analogShares[f.id] ?? 0} aria-label={`Proposed analog share for ${f.label}`} onChange={(e) => onAnalogShare(f.id, Number(e.target.value))} className="num w-14 rounded border border-line-strong bg-bg px-1.5 py-0.5 text-right text-xs text-fg disabled:opacity-50" />
                    </td>
                    <td className="py-1 text-fg-muted">{sug?.reason ?? "Not mentioned; spec default."}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-fg-faint">{analogTotal === 100 ? "Analog shares total 100%." : `Edited analog shares total ${analogTotal}%; they are rescaled to 100% on apply.`} Insolation stays informational (no weight).</p>
        </div>
      )}
      {(ti.rationale ?? []).length > 0 && <NoteList title="How the task was read" items={ti.rationale} />}
    </div>
  );
}
