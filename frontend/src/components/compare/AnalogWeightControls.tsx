// Fallback analog-preference sliders for Compare, used until the shared
// `components/mission/AnalogPreferences` exists (AnalogPreferencesSlot swaps
// it in automatically). Shares over the five analog features; the store keeps
// them summing to 100. Reweighting re-ranks the pool and never changes the pair.
import { RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ANALOG_FEATURES, INSOLATION_NOTE, toAnalogShares } from "@/lib/analogFeatures";

export function AnalogWeightControls() {
  const analogWeights = useAppStore(s => s.analogWeights);
  const recommended = useAppStore(s => s.recommendedAnalogWeights);
  const setAnalogWeight = useAppStore(s => s.setAnalogWeight);
  const resetAnalogWeights = useAppStore(s => s.resetAnalogWeights);
  const shares = toAnalogShares(analogWeights);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-fg-muted">What should count as "similar" for this pair. These shares re-rank the analog sites and change the similarity score. They do not change the selected pair, the objective or the Mars landing ranking.</p>
        <button type="button" onClick={resetAnalogWeights} disabled={!analogWeights} className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-[10.5px] text-fg-muted hover:text-fg disabled:opacity-40" aria-label={recommended ? "Reset the analog preferences to the suggestion for this objective" : "Reset the analog preferences to the defaults"}>
          <RotateCcw className="h-3 w-3" aria-hidden /> {recommended ? "Objective's suggestion" : "Defaults"}
        </button>
      </div>
      <ul className="space-y-3">
        {ANALOG_FEATURES.map(f => {
          const id = `cmp-aw-${f.id}`;
          const w = shares[f.id] ?? 0;
          return (
            <li key={f.id}>
              <div className="mb-0.5 flex justify-between"><label htmlFor={id} className="text-sm text-fg">{f.label}</label><span className="num text-sm text-fg-muted">{w}%</span></div>
              <p id={`${id}-d`} className="mb-1.5 text-xs text-fg-muted">{f.description}</p>
              <input id={id} type="range" min={0} max={100} step={1} value={w} aria-describedby={`${id}-d`} aria-label={`${f.label} analog preference`} style={{ ["--pct" as string]: `${w}%` }} onChange={e => setAnalogWeight(f.id, Number(e.target.value))} />
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-fg-faint">{INSOLATION_NOTE}</p>
    </div>
  );
}
