// Mission Design chat box. Until a mission is saved it is the only thing on
// the tab: the heading, a one-line prompt and a text box. Enter (Shift+Enter
// for a new line) or Save hands the text to the parent, which has the language
// model interpret it against the research registry and applies the result to
// the sliders. The saved text then sits under the heading with an Edit Mission
// button that reopens the box. Everything is centred. When the language model
// did not run, one plain line says so: the weights then come from keyword
// matching, not from research. The applied task reading (Earth-Mars release:
// task, body, destination, reference) is shown under the saved text.
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Pencil, TriangleAlert } from "lucide-react";
import { ShootingStar } from "@/components/mission/SpaceDecor";
import { useAppStore } from "@/store/useAppStore";
import { BODY_NAME } from "@/lib/analogFeatures";
import type { Task } from "@/store/useAppStore";

const TASK_LABEL: Record<Task, string> = { landing_screening: "Mars landing screening", analog_site_selection: "Analog site selection" };

const PLACEHOLDER = "We want to land on Mars to establish a Research Base.";

interface Props {
  /** True once a mission has been saved from this box. */
  submitted: boolean;
  /** The saved mission text shown under the heading. */
  missionText: string;
  /** True while the saved text is being interpreted. */
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
  const composing = !submitted || editing;
  const draftDiffers = editing && draft.trim() !== missionText;

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
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
    else if (e.key === "Escape" && editing) { e.preventDefault(); cancelEdit(); }
  };
  const startEdit = () => { setDraft(missionText); setEditing(true); };
  // landing priorities only: the other mission types are keyword-based by design
  const noModel = missionType === "landing" && submitted && !pending && !composing && appliedSource !== null && appliedSource !== "llm";

  return (
    <div className={`mx-auto w-full px-4 text-center transition-[max-width,padding] duration-500 ease-out ${submitted ? "max-w-3xl pb-5 pt-6" : "max-w-2xl pb-8 pt-[16vh]"}`}>
      <h2 className={`font-semibold tracking-tight text-fg transition-[font-size] duration-500 ${submitted ? "text-3xl" : "text-4xl"}`}>Mission Design</h2>
      {!submitted && <p className="mt-2 text-base text-fg-muted">Tell us what your mission is</p>}

      {composing ? (
        <form onSubmit={onSubmit} className="mt-4">
          <label htmlFor="mission-objective" className="sr-only">Your mission objective</label>
          <textarea
            id="mission-objective"
            maxLength={500}
            rows={3}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDraftDirty(e.target.value.trim() !== (submitted ? missionText : appliedObjective).trim()); }}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDER}
            autoFocus={editing}
            className="w-full resize-none rounded-xl border border-line-strong bg-bg px-4 py-3 text-left text-base text-fg placeholder:text-fg-faint"
          />
          <div className="mt-3 flex items-center justify-center gap-2">
            {editing && <button type="button" onClick={cancelEdit} className="rounded-lg border border-line px-4 py-2 text-sm text-fg-muted hover:text-fg">Cancel</button>}
            <button type="submit" disabled={!draft.trim() || !canSave || pending} className="rounded-lg border border-copper bg-copper/10 px-5 py-2 text-sm font-semibold text-copper-bright disabled:opacity-40">
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="mission-text-enter">
          <p className="mx-auto mt-2 max-w-2xl whitespace-pre-wrap break-words text-base text-fg" data-testid="mission-text">{missionText}</p>
          {appliedTask && !pending && (
            <p className="mx-auto mt-1.5 max-w-2xl text-sm text-fg-muted" data-testid="applied-task">
              Applied task: {TASK_LABEL[appliedTask]}
              {appliedFocusBody && <> · looking on {BODY_NAME[appliedFocusBody]}</>}
              {appliedDestination && <> · mission to {BODY_NAME[appliedDestination]}</>}
              {appliedReference && <> · reference {appliedReference.name} ({BODY_NAME[appliedReference.body]})</>}
            </p>
          )}
          <div className="mt-3 flex flex-col items-center gap-2">
            <button type="button" onClick={startEdit} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-copper bg-copper/10 px-4 py-2 text-sm font-semibold text-copper-bright disabled:opacity-40">
              <Pencil className="h-4 w-4" aria-hidden /> Edit Mission
            </button>
            {pending && (
              <div className="mt-4 flex w-full items-center justify-center gap-2.5 text-xl font-medium text-fg" role="status" data-testid="mission-loading">
                <ShootingStar />
                <p>Considering the rocket science...</p>
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
