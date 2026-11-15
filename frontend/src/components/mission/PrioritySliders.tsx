// Mission priorities as SHARE sliders, for either planet: one row per factor,
// the slider value IS the factor's integer percentage, and the shares always
// sum to 100 (the store's setters rescale the others; lib/allocation.ts).
// Hovering a factor's name shows its share in large type with a fixed
// one-sentence description; (i) explains the measured quantity and the rule.
// The caller supplies the factors, the shares and what Reset does, so Mars
// (landing factors) and Earth (field-test factors) look and behave the same.
import { useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { InfoTip } from "@/components/ui/InfoTip";
import { Floating } from "@/components/ui/Floating";
import { PriorityHoverCard } from "@/components/mission/PriorityHoverCard";
import type { PriorityFactor } from "@/components/mission/priorityFactors";

/** A factor name that shows the priority popup while hovered. */
function HoverName({ factor, percent, htmlFor }: { factor: PriorityFactor; percent: number; htmlFor: string }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} className="relative min-w-0" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <label htmlFor={htmlFor} className="block truncate text-base font-medium text-fg">{factor.name}</label>
      {hovered && (
        <Floating anchor={() => ref.current?.getBoundingClientRect()} interactive={false}>
          <PriorityHoverCard factor={factor} percent={percent} />
        </Floating>
      )}
    </span>
  );
}

interface Props {
  factors: PriorityFactor[];
  shares: Record<string, number>;
  onChange: (id: string, share: number) => void;
  /** Called when a drag or key press on a slider starts (Mars records the last change). */
  onBegin?: (id: string) => void;
  onReset: () => void;
  headerExtra?: ReactNode;
}

export function PrioritySliders({ factors, shares, onChange, onBegin, onReset, headerExtra }: Props) {
  const share = (id: string) => Math.round(shares[id] ?? 0);
  const total = factors.reduce((sum, f) => sum + share(f.id), 0);

  return (
    <Section
      large
      title="Mission priorities"
      actions={
        <div className="flex shrink-0 items-center gap-2.5">
          <button type="button" onClick={onReset} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-fg hover:border-copper hover:text-copper-bright" aria-label="Reset priorities to the applied objective's suggestion" title="Restore the applied objective's suggested shares">
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset
          </button>
          {headerExtra}
        </div>
      }
    >
      <ul className="divide-y divide-line/60" aria-label="Priority shares">
        {factors.map((f) => {
          const value = share(f.id);
          const id = `share-${f.id}`;
          return (
            <li key={id} className="mission-row py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.color }} aria-hidden />
                <HoverName factor={f} percent={value} htmlFor={id} />
                <InfoTip label={`About ${f.name}`} closeOnMouseLeave large>
                  <dl className="space-y-1.5">
                    <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Preference</dt><dd>{f.preference}</dd></div>
                    <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Measured or modelled quantity</dt><dd>{f.quantity}</dd></div>
                    <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Caveat</dt><dd>{f.caveat}</dd></div>
                  </dl>
                  <p className="mt-2 text-fg-muted">{f.rule}</p>
                </InfoTip>
                <output htmlFor={id} className="num ml-auto shrink-0 text-lg text-fg" aria-hidden>{value}%</output>
              </div>
              <p id={`${id}-pref`} className="mb-2 truncate pl-[18px] text-sm leading-snug text-fg-muted" title={f.preference}>{f.preference}</p>
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                aria-label={`${f.name} share of priorities`}
                aria-valuetext={`${value} percent`}
                aria-describedby={`${id}-pref`}
                style={{ ["--pct" as string]: `${value}%` }}
                onPointerDown={() => onBegin?.(f.id)}
                onKeyDown={e => { if (!e.repeat && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) onBegin?.(f.id); }}
                onChange={(e) => onChange(f.id, Number(e.target.value))}
              />
            </li>
          );
        })}
      </ul>
      {total !== 100 && factors.length > 0 && <p className="mt-2 text-sm text-warn" role="alert">Shares total {total}%, not 100%. Reset to restore the applied objective's suggestion.</p>}
    </Section>
  );
}
