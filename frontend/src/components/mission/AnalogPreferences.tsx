// Analog match preferences: five shares that sum to 100 over the enabled
// analog features (lib/allocation), each slider position equal to its displayed
// share. This is a DIFFERENT control from the landing priorities: different
// features, different store fields (analogWeights / recommendedAnalogWeights),
// and nothing is ever copied between the two. Reset restores the applied
// objective's recommended analog preferences (spec defaults if none applied).
//
// After a change settles, `rankChanges` (computed by the caller from the
// previous vs the new rank response) is rendered as a short deterministic
// sentence - no model, no invented numbers.
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ANALOG_FEATURES, INSOLATION_NOTE, toAnalogShares, type AnalogFeatureSpec } from "@/lib/analogFeatures";
import { shareDeltas, sharesEqual } from "@/lib/allocation";
import { Section } from "@/components/ui/Section";

export interface RankChange {
  id: string;
  name: string;
  previousRank: number | null;
  newRank: number | null;
}

export interface AnalogPreferencesProps {
  /** Feature ids the current ranking could not use (dropped pool-wide), shown disabled with the reason. */
  unavailable?: Record<string, string>;
  /** Rank movements between the previous settled ranking and the current one. */
  rankChanges?: RankChange[] | null;
  /** Shares in force when the previous ranking was produced, for the emphasis sentence. */
  previousShares?: Record<string, number> | null;
  compact?: boolean;
  /** Section title; the Compare view may want a different one. */
  title?: string;
}

/** One deterministic sentence about what the user emphasised and how ranks moved. */
export function describeChange(previous: Record<string, number> | null | undefined, current: Record<string, number>, changes: RankChange[] | null | undefined, features: readonly AnalogFeatureSpec[] = ANALOG_FEATURES): string | null {
  if (!previous || sharesEqual(previous, current)) return null;
  const deltas = shareDeltas(current, previous);
  const label = (id: string) => features.find((f) => f.id === id)?.label.toLowerCase() ?? id;
  const up = deltas.filter((d) => d.delta > 0).map((d) => `${label(d.id)} (+${d.delta})`);
  const down = deltas.filter((d) => d.delta < 0).map((d) => `${label(d.id)} (${d.delta})`);
  let s = "";
  if (up.length) s += `Emphasised ${up.join(", ")}`;
  if (down.length) s += `${s ? "; reduced " : "Reduced "}${down.join(", ")}`;
  s += ".";
  const moved = (changes ?? []).filter((c) => c.previousRank !== c.newRank);
  if (!changes) return s;
  if (moved.length === 0) return `${s} The ranks did not change.`;
  const parts = moved.slice(0, 4).map((c) => `${c.name} ${c.previousRank ?? "unranked"} → ${c.newRank ?? "unranked"}`);
  return `${s} Rank changes: ${parts.join("; ")}${moved.length > 4 ? ` and ${moved.length - 4} more` : ""}.`;
}

export function AnalogPreferences({ unavailable = {}, rankChanges, previousShares, compact, title = "Analog match preferences" }: AnalogPreferencesProps) {
  const analogWeights = useAppStore((s) => s.analogWeights);
  const recommended = useAppStore((s) => s.recommendedAnalogWeights);
  const setAnalogWeight = useAppStore((s) => s.setAnalogWeight);
  const reset = useAppStore((s) => s.resetAnalogWeights);
  const shares = useMemo(() => toAnalogShares(analogWeights, Object.keys(unavailable)), [analogWeights, unavailable]);
  const atRecommended = sharesEqual(shares, toAnalogShares(recommended));
  // the explanation is shown once per settled change, then stays until the next one
  const [explanation, setExplanation] = useState<string | null>(null);
  useEffect(() => {
    setExplanation(describeChange(previousShares, shares, rankChanges));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankChanges, previousShares]);

  return (
    <Section
      title={title}
      subtitle={compact ? undefined : "The shares add up to 100%. Raise a factor to give it more weight when matching across planets."}
      actions={
        <button type="button" onClick={reset} disabled={atRecommended} className="rounded border border-line px-2 py-1 text-[11px] text-fg-muted hover:text-fg disabled:opacity-40" title="Go back to the suggested analog preferences for this objective">
          Reset
        </button>
      }
    >
      <ul className="space-y-1.5" aria-label="Analog match preferences">
        {ANALOG_FEATURES.map((f) => {
          const off = f.id in unavailable;
          const id = `analog-pref-${f.id}`;
          const value = off ? 0 : shares[f.id] ?? 0;
          return (
            <li key={f.id} className={`mission-row grid grid-cols-[minmax(0,1fr)_38px] items-center gap-x-2 ${compact ? "" : "gap-y-2 border-b border-line py-3 last:border-0"} ${off ? "opacity-60" : ""}`}>
              <label htmlFor={id} className="truncate text-xs text-fg" title={f.description}>{f.label}</label>
              <span className="num text-right text-xs text-fg-muted" aria-hidden>{value}%</span>
              {!compact && <p className="col-span-2 text-xs leading-relaxed text-fg-muted">{f.description}</p>}
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                disabled={off}
                aria-label={`${f.label} share of analog match emphasis`}
                aria-valuetext={`${value} percent`}
                title={off ? unavailable[f.id] : f.description}
                style={{ ["--pct" as string]: `${value}%` }}
                onChange={(e) => setAnalogWeight(f.id, Number(e.target.value))}
                className="col-span-2"
              />
              {off && <span className="col-span-2 text-[10.5px] text-warn">Not available for this ranking: {unavailable[f.id]}</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10.5px] leading-snug text-fg-faint">{INSOLATION_NOTE}</p>
      {explanation && <p role="status" className="mt-2 rounded border border-line bg-bg-elev-2 px-2 py-1.5 text-xs text-fg-muted" data-testid="analog-change-explanation">{explanation}</p>}
    </Section>
  );
}
