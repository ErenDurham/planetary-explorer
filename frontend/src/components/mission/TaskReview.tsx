// The task half of a mission reading (Earth-Mars release): what the user is
// doing, where, for which mission, against which reference, plus the separate
// analog-match preferences. A clear reading is applied with the landing
// weights when the mission is saved; this panel appears only when the reading
// needs the user - an ambiguous search direction or an ambiguous site name -
// and nothing is guessed. `TaskReview` is the review block from the original
// proposal UI, unchanged; `TaskResolver` holds the choices and applies them.
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { taskApplicationFromInterpretation, type TaskResolution } from "@/hooks/useInterpretObjective";
import { ANALOG_FEATURES, BODY_NAME, analogFeatureLabel, toAnalogShares } from "@/lib/analogFeatures";
import type { DirectionOption, SiteReference, TaskInterpretation } from "@/types";

export const TASK_LABEL: Record<TaskInterpretation["task"], string> = {
  landing_screening: "Mars landing screening",
  analog_site_selection: "Analog site selection",
  ambiguous: "Ambiguous - choose a direction",
};


/** True when the reading cannot be applied as-is: the direction is ambiguous,
 * or a site mention was not resolved to one location. */
export function needsTaskInput(ti: TaskInterpretation | null | undefined): boolean {
  if (!ti) return false;
  return ti.task === "ambiguous" || (!ti.reference_site && (ti.unresolved_sites ?? []).length > 0);
}

export function TaskResolver({ ti, objectiveHash, onDone }: { ti: TaskInterpretation; objectiveHash: string | null; onDone: () => void }) {
  const applyInterpretation = useAppStore((s) => s.applyInterpretation);
  const [direction, setDirection] = useState<DirectionOption | null>(null);
  const [pickedReference, setPickedReference] = useState<SiteReference | null>(null);
  const proposedAnalog = useMemo(() => (ti.analog_suggestions?.length ? toAnalogShares(Object.fromEntries(ti.analog_suggestions.map((a) => [a.feature_id, a.weight]))) : null), [ti]);
  const [analogEdited, setAnalogEdited] = useState<Record<string, number> | null>(proposedAnalog);
  useEffect(() => { setAnalogEdited(proposedAnalog); setDirection(null); setPickedReference(null); }, [proposedAnalog, ti]);
  const resolution: TaskResolution = { direction, reference: pickedReference, analogShares: analogEdited && proposedAnalog && !sameShares(analogEdited, proposedAnalog) ? toAnalogShares(analogEdited) : null };
  const application = taskApplicationFromInterpretation(ti, objectiveHash, resolution);
  const needsDirection = ti.task === "ambiguous" && !direction;

  return (
    <div className="mx-auto mb-5 w-full max-w-3xl px-4 text-left" data-testid="task-resolver">
      <p className="mb-1.5 text-sm text-warn" role="status">Your mission can be read more than one way. Settle the task below; the landing priorities are already applied.</p>
      <TaskReview ti={ti} direction={direction} onDirection={setDirection} pickedReference={pickedReference} onPickReference={setPickedReference} analogShares={analogEdited ?? proposedAnalog} onAnalogShare={(id, v) => setAnalogEdited((cur) => ({ ...(cur ?? proposedAnalog ?? {}), [id]: clamp(v) }))} disabled={false} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!application} onClick={() => { if (application) { applyInterpretation(application); onDone(); } }} title={needsDirection ? "Choose a search direction first" : "Sets the task, body and reference"} className="rounded-lg border border-copper bg-copper/10 px-4 py-2 text-sm font-semibold text-copper-bright disabled:opacity-40">
          Apply task
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-line px-4 py-2 text-sm text-fg-muted hover:text-fg">Dismiss</button>
        {needsDirection && <span className="text-sm text-fg-faint">Choose a direction to enable.</span>}
      </div>
    </div>
  );
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
