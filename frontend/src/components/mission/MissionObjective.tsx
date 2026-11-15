// The Mission Design composer: one objective box as the instrument of the
// page. Before anything is applied it carries a two-sentence account of what
// the user will get and three example objectives that fill the box (each one
// a task the app actually supports). Enter, or the Apply button, hands the
// text to the parent, which has the backend read it and applies the result.
// Afterwards the applied objective sits in a quiet card with its task reading
// and an Edit Mission button; editing shows the text as a draft, clearly not
// applied until it is, so the sliders and the next step always belong to the
// applied objective. Loading and the no-model fallback are said in plain
// words. Shift+Enter is a new line; Escape cancels an edit.
import { ContourArtwork } from "@/components/atlas/AtlasSurface";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import { ShootingStar } from "@/components/mission/SpaceDecor";
import { useAppStore } from "@/store/useAppStore";
import { BODY_NAME } from "@/lib/analogFeatures";
import type { Task } from "@/store/useAppStore";

const TASK_LABEL: Record<Task, string> = { landing_screening: "Mars landing screening", analog_site_selection: "Analog site selection" };

/** Three objectives the app can act on, one per supported workflow. Clicking one fills the box; nothing is applied until the user applies it. */
export const EXAMPLE_OBJECTIVES: Array<{ id: string; label: string; hint: string; text: string }> = [
  { id: "analogs", label: "Best established analog for Jezero", hint: "the curated Earth analogs", text: "Which established Earth analog best matches Jezero Crater's regional terrain for a rover field rehearsal? Rank the curated analog sites and explain each match with cited evidence." },
  { id: "landing", label: "Mars landing screening", hint: "the catalogued Mars sites", text: "Screen the catalogued Mars sites for a solar-powered lander: favour gentle regional slopes and low relief, then reliable sunlight, and explain the trade-offs." },
];

const PLACEHOLDER = "Describe your mission in a sentence or two, or start from an example below.";

interface Props {
  /** True once a mission has been applied from this box. */
  submitted: boolean;
  /** The applied mission text shown in the card. */
  missionText: string;
  /** True while the text is being read. */
  pending: boolean;
  /** False until the scoring defaults have loaded. */
  canSave: boolean;
  onSave: (text: string) => void;
}

export function MissionObjective({ submitted, missionText, pending, canSave, onSave }: Props) {
  const appliedSource = useAppStore((s) => s.appliedObjectiveSource);
  const appliedObjective = useAppStore((s) => s.appliedObjective);
  const missionType = useAppStore((s) => s.missionType);
  const setDraftDirty = useAppStore((s) => s.setMissionDraftDirty);
  const appliedTask = useAppStore((s) => s.appliedTask);
  const appliedFocusBody = useAppStore((s) => s.appliedFocusBody);
  const appliedDestination = useAppStore((s) => s.appliedMissionDestination);
  const appliedReference = useAppStore((s) => s.appliedReference);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const composing = !submitted || editing;
  const draftDiffers = editing && draft.trim() !== missionText;
  const baseline = (submitted ? missionText : appliedObjective).trim();

  const cancelEdit = () => { setEditing(false); setDraftDirty(false); };
  const save = () => {
    const text = draft.trim();
    if (!text || !canSave || pending) return;
    setEditing(false);
    setDraftDirty(false);
    if (submitted && text === missionText) return; // nothing changed
    onSave(text);
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); save(); };
  const fill = (text: string) => {
    setDraft(text);
    setDraftDirty(text.trim() !== baseline);
    requestAnimationFrame(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
    else if (e.key === "Escape" && editing) { e.preventDefault(); cancelEdit(); }
  };
  const startEdit = () => { setDraft(missionText); setEditing(true); };
  // landing priorities only: the other mission types are keyword-based by design
  const noModel = missionType === "landing" && submitted && !pending && !composing && appliedSource !== null && appliedSource !== "llm";
  const applyLabel = pending ? "Reading your mission…" : editing ? "Apply changes" : "Apply objective";

  return (
    <div data-pane="mission-objective" data-composing={composing} className={`mx-auto w-full px-4 text-center transition-[max-width,padding] duration-500 ease-out ${submitted ? "max-w-3xl pb-5 pt-6" : "max-w-2xl pb-8 pt-[12vh]"}`}>
      <ContourArtwork />
      <p className="eyebrow">Step 1 of 3</p>
      <h2 className={`font-semibold tracking-tight text-fg transition-[font-size] duration-500 ${submitted ? "text-3xl" : "text-4xl"}`}>Mission Design</h2>
      {!submitted && (
        <p className="mission-lede" data-testid="mission-lede">
          Describe the mission in a sentence or two. The app reads it, proposes scoring priorities you can adjust, and sends you to the right view: the established Earth analogs or Mars landing screening.
        </p>
      )}

      {composing ? (
        <form onSubmit={onSubmit} className="mt-5" aria-busy={pending}>
          <label htmlFor="mission-objective" className="sr-only">Your mission objective</label>
          <textarea
            id="mission-objective"
            ref={box}
            maxLength={500}
            rows={4}
            value={draft}
            disabled={pending}
            onChange={(e) => { setDraft(e.target.value); setDraftDirty(e.target.value.trim() !== baseline); }}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDER}
            aria-describedby="mission-objective-keys"
            autoFocus={editing}
            className="w-full resize-none rounded-xl border border-line-strong bg-bg px-4 py-3 text-left text-base text-fg placeholder:text-fg-faint"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span id="mission-objective-keys"><kbd className="num rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-fg">Enter</kbd> applies · <kbd className="num rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-fg">Shift+Enter</kbd> for a new line</span>
            <span className="num" aria-live="polite">{draft.length} / 500</span>
          </div>
          {!editing && (
            <div className="mission-examples mt-4" role="group" aria-label="Example objectives">
              <p className="mb-2 text-xs uppercase tracking-wide text-fg-faint">Start from an example</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_OBJECTIVES.map(ex => (
                  <button key={ex.id} type="button" onClick={() => fill(ex.text)} disabled={pending} title={ex.text} aria-pressed={draft === ex.text}>
                    {ex.label}<span className="ml-1.5 text-fg-faint">· {ex.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {editing && draftDiffers && <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-warn/50 bg-warn/10 px-3 py-1 text-xs text-warn" data-testid="draft-badge">Draft · not applied until you apply it</p>}
          <div className="mt-4 flex items-center justify-center gap-2">
            {editing && <button type="button" onClick={cancelEdit} className="rounded-lg border border-line px-4 py-2 text-sm text-fg-muted hover:text-fg">Cancel</button>}
            <button type="submit" disabled={!draft.trim() || !canSave || pending} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-copper bg-copper px-6 py-2.5 text-sm font-semibold text-white hover:bg-copper-bright disabled:opacity-40" data-testid="apply-objective">
              {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}{applyLabel}
            </button>
          </div>
          {!canSave && <p className="mt-2 text-xs text-fg-faint" role="status">Loading the scoring defaults before an objective can be applied…</p>}
        </form>
      ) : (
        <div className="mission-text-enter">
          <div className="mission-applied" data-testid="mission-applied">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/50 bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok"><Check className="h-3.5 w-3.5" aria-hidden />Applied objective</span>
              <button type="button" onClick={startEdit} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm text-fg hover:border-copper disabled:opacity-40">
                <Pencil className="h-4 w-4" aria-hidden /> Edit Mission
              </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-fg" data-testid="mission-text">{missionText}</p>
            {appliedTask && !pending && (
              <p className="mt-2 text-sm text-fg-muted" data-testid="applied-task">
                Applied task: {TASK_LABEL[appliedTask]}
                {appliedFocusBody && <> · looking on {BODY_NAME[appliedFocusBody]}</>}
                {appliedDestination && <> · mission to {BODY_NAME[appliedDestination]}</>}
                {appliedReference && <> · reference {appliedReference.name} ({BODY_NAME[appliedReference.body]})</>}
              </p>
            )}
            {pending && (
              <div className="mt-4 flex w-full items-center justify-center gap-2.5 text-xl font-medium text-fg" role="status" data-testid="mission-loading">
                <ShootingStar />
                <p>Reading your mission…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {draftDiffers && (
        <p className="mx-auto mt-3 max-w-2xl rounded border border-warn/40 bg-warn/10 px-3 py-1.5 text-sm text-warn" role="status" data-testid="objective-stale-notice">
          Current priorities belong to the saved mission: “{missionText}”. Save to change them.
        </p>
      )}
      {noModel && (
        <p className="mx-auto mt-3 inline-flex max-w-2xl items-start gap-2 text-left text-sm text-warn" role="status" data-testid="no-model-notice">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {/* backend unreachable, model unavailable, or its answer could not be used */}
          Uh oh! Either our model is not available, or we could not understand your mission. Please try again!
        </p>
      )}
    </div>
  );
}
