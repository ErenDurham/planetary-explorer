// The "?" in the top-right corner above the sliders, for either planet.
// Hovering it names it ("Why these priorities?"); clicking opens a pop-up that
// lists, per slider, the model's reason and the research findings it cited
// for that weight (numbers quoted from NASA and peer-reviewed sources, each
// linked), then - on Mars - the hard constraints with their sources. Nothing here is generated text with numbers:
// facts come from the backend's evidence registry, and a missing finding is
// stated as missing.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleQuestionMark, TriangleAlert, X } from "lucide-react";
import { Floating } from "@/components/ui/Floating";
import type { ObjectiveSource } from "@/store/useAppStore";
import type { PriorityFactor } from "@/components/mission/priorityFactors";
import { formatNumber } from "@/lib/format";
import type { AnalogCheck, AnalogFactorCheck, EvidenceCitation, HardConstraint } from "@/types";

export interface WhyProps {
  factors: PriorityFactor[];
  shares: Record<string, number>;
  /** What the applied reading suggested (shown when the user has moved a slider). */
  suggested: Record<string, number>;
  reasons?: Record<string, string>;
  evidence?: Record<string, EvidenceCitation[]>;
  source: ObjectiveSource | null;
  unsupported?: string[];
  /** Mars only: the hard constraints and the research behind each. */
  constraints?: HardConstraint[];
  constraintEvidence?: Record<string, EvidenceCitation[]>;
  /** The Earth <-> Mars cross-reference behind the priorities. */
  analog?: AnalogCheck | null;
  planet?: "mars" | "earth";
}
const OPERATOR: Record<string, string> = { "<=": "≤", ">=": "≥", "<": "<", ">": ">", "abs<=": "|x| ≤" };

function constraintLabel(c: HardConstraint): string {
  if (c.feature_id === "elevation_median_m") return `Median elevation ${OPERATOR[c.operator] ?? c.operator} ${c.threshold > 0 ? "+" : ""}${formatNumber(c.threshold)} m (MOLA)`;
  if (c.feature_id === "latitude_abs_deg") return `|Latitude| ${OPERATOR[c.operator] ?? c.operator} ${formatNumber(c.threshold)}°`;
  return `${c.feature_id.replace(/_/g, " ")} ${OPERATOR[c.operator] ?? c.operator} ${formatNumber(c.threshold)}`;
}

export function WhyThesePriorities(props: WhyProps) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const focusVisible = (el: Element) => { try { return el.matches(":focus-visible"); } catch { return true; } };

  return (
    <>
      <span className="inline-flex" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
        <button
          ref={button}
          type="button"
          onClick={() => { setTip(false); setOpen(true); }}
          onFocus={(e) => setTip(focusVisible(e.currentTarget))}
          onBlur={() => setTip(false)}
          aria-label="Why these priorities?"
          aria-haspopup="dialog"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-copper/60 bg-copper/10 text-copper-bright hover:bg-copper/20"
        >
          <CircleQuestionMark className="h-5 w-5" aria-hidden />
        </button>
        {tip && !open && (
          <Floating anchor={() => button.current?.getBoundingClientRect()} align="end" interactive={false}>
            <span role="tooltip" className="block whitespace-nowrap rounded border border-line-strong bg-bg-elev-2 px-2.5 py-1.5 text-sm text-fg shadow-lg">Why these priorities?</span>
          </Floating>
        )}
      </span>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="scroll-thin max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-line-strong bg-bg-elev text-fg shadow-2xl outline-none sm:max-h-[calc(100dvh-3rem)]">
            <WhyContent {...props} titleId={titleId} onClose={close} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function WhyContent({ factors, shares, suggested, reasons, evidence, source, unsupported = [], constraints, constraintEvidence = {}, analog, planet = "mars", titleId, onClose }: WhyProps & { titleId: string; onClose: () => void }) {
  const byLlm = source === "llm";

  return (
    <>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-bg-elev px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-fg">Why these priorities?</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded p-1 text-fg-muted hover:bg-bg-elev-2 hover:text-fg">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {!byLlm && (
        <p className="mx-5 mt-4 flex gap-2 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="status" data-testid="why-no-llm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {source === "offline_rule_based"
            ? "The backend could not be reached. The weights come from keyword matching in the browser. No research was used."
            : "The language model was not available. The weights come from keyword matching. The findings below apply to this mission type, but they were not used to set the weights."}
        </p>
      )}

      {analog && <AnalogChain analog={analog} planet={planet} />}

      <ul className="divide-y divide-line" aria-label="Per-factor reasons">
        {factors.map((f) => {
          const now = Math.round(shares[f.id] ?? 0);
          const was = suggested[f.id];
          return (
            <FactorRow key={f.id} factor={f}
              right={<><span className="num text-base text-fg">{now}%</span>{was !== undefined && was !== now && <span className="ml-2 text-sm text-fg-faint">suggested {was}%</span>}</>}
              reason={byLlm ? reasons?.[f.id] : undefined}
              evidence={evidence?.[f.id] ?? []}
              comparison={analog?.factors.find((c) => c.criterion_id === f.id)} />
          );
        })}
      </ul>

      {unsupported.length > 0 && (
        <section className="border-t border-line px-5 py-4" aria-label="Not scored by this model">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-warn">Not scored by this model</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg-muted">{unsupported.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}

      {constraints && constraints.length > 0 && <section className="border-t border-line px-5 py-4" aria-label="Hard constraints" data-testid="why-hard-constraints">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Hard constraints</h3>
        <p className="mt-0.5 text-sm text-fg-faint">Sites failing any of these are ineligible and unranked.</p>
        <ul className="mt-2 space-y-2.5">
          {constraints.map((c) => {
            const ev = constraintEvidence[c.constraint_id] ?? [];
            return (
              <li key={c.constraint_id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-medium text-fg">{constraintLabel(c)}</span>
                </div>
                {ev.length > 0 ? <Findings items={ev} /> : <p className="mt-0.5 text-fg-muted">{c.rationale}</p>}
              </li>
            );
          })}
        </ul>
      </section>}
      <p className="border-t border-line px-5 py-3 text-sm text-fg-faint">Sources are NASA technical reports and peer-reviewed papers. Hover over a finding to see the exact source text.</p>
    </>
  );
}

function FactorRow({ factor, right, reason, evidence, comparison }: { factor: PriorityFactor; right: React.ReactNode; reason?: string; evidence: EvidenceCitation[]; comparison?: AnalogFactorCheck }) {
  return (
    <li className="px-5 py-3.5" data-testid={`why-${factor.id}`}>
      <h3 className="flex items-baseline gap-2 text-base font-semibold text-fg">
        <span className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: factor.color }} aria-hidden />
        {factor.name}
        <span className="ml-auto shrink-0 font-normal">{right}</span>
      </h3>
      {reason && <p className="mt-1 pl-[18px] text-sm text-fg-muted">{reason}</p>}
      {comparison && <Comparison c={comparison} />}
      <div className="pl-[18px]">
        {evidence.length > 0 ? <Findings items={evidence} /> : <p className="mt-1 text-sm italic text-fg-faint">No finding in the evidence registry supports this weight.</p>}
      </div>
    </li>
  );
}

function Findings({ items }: { items: EvidenceCitation[] }) {
  return (
    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg">
      {items.map((e) => (
        <li key={e.evidence_id} data-testid={`finding-${e.evidence_id}`}>
          <span title={`“${e.quotes.join(" … ")}”`}>{e.fact}</span>{" "}
          <span className="whitespace-nowrap">(<a href={e.url} target="_blank" rel="noreferrer" title={`${e.title}. ${e.venue}.`} className="text-copper-bright underline decoration-dotted underline-offset-2 hover:text-fg">{e.cite}</a>)</span>
        </li>
      ))}
    </ul>
  );
}

const UNIT: Record<string, string> = { deg: "°", m: " m", "W/m2": " W/m²" };
const show = (v: number | null | undefined, unit: string) => (typeof v === "number" ? `${formatNumber(v)}${UNIT[unit] ?? ` ${unit}`}` : "no data");

/** The chain the priorities rest on: a proven Earth site, its research, and the Mars site it is compared with. */
function AnalogChain({ analog, planet }: { analog: AnalogCheck; planet: "mars" | "earth" }) {
  return (
    <section className="mx-5 mt-4 rounded-lg border border-line-strong bg-bg/40 px-4 py-3 text-sm" aria-label="Analog check" data-testid="why-analog">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Analog check</h3>
      <p className="mt-1 text-fg-muted">
        {planet === "mars"
          ? "A Mars site is good when its data compares with an Earth site that research shows suits this mission."
          : "An Earth site is good when its data compares with the Mars data."}
      </p>
      <p className="mt-2 text-fg"><span className="text-fg-muted">Proven Earth site:</span> <span className="font-medium">{analog.earth_site_name}</span></p>
      {(analog.research ?? []).length > 0
        ? <Findings items={analog.research ?? []} />
        : <p className="mt-1 text-sm italic text-fg-faint">No research from the last 15 years on this site in the evidence registry.</p>}
      <p className="mt-2 text-fg"><span className="text-fg-muted">Compared with Mars site:</span> <span className="font-medium">{analog.mars_site_name}</span></p>
      <p className="mt-1 text-fg-muted" data-testid="why-shared">
        Shared landforms: <span className="text-fg">{tagList(analog.shared_landforms)}</span> · Shared minerals: <span className="text-fg">{tagList(analog.shared_minerals)}</span>
      </p>
      {planet === "earth" && <p className="mt-1 text-fg-muted">Earth sites are ranked by how closely their slope, relief, landforms, minerals and dryness match {analog.mars_site_name}.</p>}
    </section>
  );
}

function tagList(tags: string[] | undefined): string {
  return tags && tags.length ? tags.map((t) => t.replace(/_/g, " ")).join(", ") : "none";
}

/** One factor's Earth vs Mars values from the site profiles, and whether they compare. */
function Comparison({ c }: { c: AnalogFactorCheck }) {
  const tone = c.comparable === true ? "text-ok" : c.comparable === false ? "text-warn" : "text-fg-faint";
  const verdict = c.comparable === true ? "comparable" : c.comparable === false ? "not comparable" : "not compared";
  return (
    <p className="mt-1.5 pl-[18px] text-sm" data-testid={`why-compare-${c.criterion_id}`} title={c.note}>
      <span className="num text-fg">Earth {show(c.earth_value, c.unit)} · Mars {show(c.mars_value, c.unit)}</span>{" "}
      <span className={tone}>— {verdict}</span>
    </p>
  );
}
