// Step 2: three objective cards. A radiogroup with arrow-key movement; the
// chosen card is announced and the workspace opens on selection.
import { FlaskConical, Mountain, Route } from "lucide-react";
import { OBJECTIVES, ACCENT_CLASS } from "../lib/objectives";
import type { ObjectiveId } from "../adapter/types";

const ICON: Record<ObjectiveId, typeof Mountain> = { terrain_survey: Mountain, geological_sampling: FlaskConical, research_traverse: Route };

export function ObjectiveCards({ value, onChoose }: { value: ObjectiveId | null; onChoose: (id: ObjectiveId) => void }) {
  return (
    <div className="rise-in">
      <p className="eyebrow">Select mission objective</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg">What should this expedition achieve?</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">The objective sets what the service optimises the route for. You can change it later in the workspace.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Mission objective">
        {OBJECTIVES.map((o, i) => {
          const Icon = ICON[o.id]; const a = ACCENT_CLASS[o.accent]; const on = value === o.id;
          return (
            <button
              key={o.id} type="button" role="radio" aria-checked={on}
              onClick={() => onChoose(o.id)}
              onKeyDown={e => {
                if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
                e.preventDefault();
                const next = OBJECTIVES[(i + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : OBJECTIVES.length - 1)) % OBJECTIVES.length];
                (e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-objective="${next.id}"]`))?.focus();
              }}
              data-objective={o.id}
              className={`group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 hover:-translate-y-0.5 ${on ? `${a.border} ${a.bg} ring-2 ${a.ring}` : "border-line bg-bg-elev hover:border-line-strong"}`}
            >
              <span aria-hidden className={`absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-20 blur-2xl ${a.text} bg-current transition-opacity group-hover:opacity-40`} />
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${a.border} ${a.bg} ${a.text}`}><Icon className="h-5 w-5" aria-hidden /></span>
              <span>
                <span className={`block text-lg font-semibold tracking-tight ${on ? a.text : "text-fg"}`}>{o.label}</span>
                <span className="mt-1 block text-sm text-fg">{o.summary}</span>
                <span className="mt-2 block text-xs leading-relaxed text-fg-muted">{o.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
