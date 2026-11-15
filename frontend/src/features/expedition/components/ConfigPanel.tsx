// Mission configuration: objective, rover inputs, optimisation preference,
// research targets and the Calculate action. Rover profiles and preference
// options come from the service's capabilities when it is connected; the
// values are inputs the user chooses, never results.
import { Play, RotateCcw, Square } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyNote } from "@/components/ui/Section";
import { OBJECTIVES, OPTIMIZATION_LABEL, ACCENT_CLASS } from "../lib/objectives";
import type { ObjectiveId, OptimizationPreference, ResearchTarget, RoverParameters, RoverProfile } from "../adapter/types";
import type { ServiceState } from "../hooks/useExpeditionCapabilities";
import type { TerrainState } from "../hooks/useTerrainContext";
import type { RegionWorkspace } from "../store/useExpeditionStore";

type NumericRoverKey = Exclude<keyof RoverParameters, "profile_id">;
const ROVER_FIELDS: ReadonlyArray<{ key: NumericRoverKey; label: string; unit: string; min: number; max: number; step: number; group: "limits" | "assumptions" }> = [
  { key: "max_slope_deg", label: "Maximum traversable slope", unit: "°", min: 1, max: 45, step: 1, group: "limits" },
  { key: "nominal_speed_m_s", label: "Nominal speed", unit: "m/s", min: 0.01, max: 2, step: 0.01, group: "limits" },
  { key: "battery_capacity_wh", label: "Battery capacity (one charge)", unit: "Wh", min: 10, max: 100000, step: 10, group: "limits" },
  { key: "drive_hours_per_sol", label: "Drive hours per sol", unit: "h", min: 0.5, max: 24, step: 0.5, group: "limits" },
  { key: "mass_kg", label: "Rover mass", unit: "kg", min: 1, max: 5000, step: 1, group: "limits" },
  { key: "rolling_resistance", label: "Rolling resistance (Crr)", unit: "", min: 0.01, max: 0.5, step: 0.01, group: "assumptions" },
  { key: "drive_efficiency", label: "Drive efficiency", unit: "", min: 0.05, max: 1, step: 0.05, group: "assumptions" },
  { key: "hotel_power_w", label: "Hotel power", unit: "W", min: 0, max: 2000, step: 5, group: "assumptions" },
];

export function ConfigPanel({ workspace, service, terrain, onChange, onChooseObjective, onToggleTarget, onCalculate, onCancel, running, canCalculate, blockers }: {
  workspace: RegionWorkspace;
  service: ServiceState;
  terrain: TerrainState;
  onChange: (patch: Partial<RegionWorkspace>) => void;
  onChooseObjective: (id: ObjectiveId) => void;
  onToggleTarget: (id: string) => void;
  onCalculate: () => void;
  onCancel: () => void;
  running: boolean;
  canCalculate: boolean;
  /** Why Calculate is disabled, in order of importance. */
  blockers: string[];
}) {
  const caps = service.kind === "available" ? service.capabilities : null;
  const profiles: RoverProfile[] = caps?.rover_profiles ?? [];
  const prefs: OptimizationPreference[] = caps?.optimization_preferences?.length ? caps.optimization_preferences : (Object.keys(OPTIMIZATION_LABEL) as OptimizationPreference[]);
  const targets: ResearchTarget[] = terrain.kind === "ready" ? terrain.terrain.research_targets ?? [] : [];
  const rover = workspace.rover;

  return (
    <div className="space-y-5 text-sm">
      <section aria-labelledby="cfg-objective">
        <h3 id="cfg-objective" className="eyebrow mb-2">Mission objective</h3>
        <div className="grid gap-1.5" role="radiogroup" aria-label="Mission objective">
          {OBJECTIVES.map(o => {
            const on = workspace.objective === o.id; const a = ACCENT_CLASS[o.accent];
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChooseObjective(o.id)} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${on ? `${a.border} ${a.bg}` : "border-line hover:border-line-strong"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${on ? a.text : "text-fg-faint"} bg-current`} aria-hidden />
                <span className="min-w-0"><span className={`block text-xs font-semibold ${on ? a.text : "text-fg"}`}>{o.label}</span><span className="block text-[11px] leading-snug text-fg-muted">{o.summary}</span></span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="cfg-rover">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 id="cfg-rover" className="eyebrow">Rover configuration</h3>{profiles.length > 0 && rover && <button type="button" onClick={() => { const pr = profiles.find(x => x.profile_id === workspace.roverProfileId) ?? profiles[0]; onChange({ rover: { ...pr.parameters }, roverProfileId: pr.profile_id }); }} className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg"><RotateCcw className="h-3 w-3" aria-hidden />Profile defaults</button>}</div>
        {service.kind === "loading" && <p className="text-xs text-fg-muted" role="status">Loading rover profiles from the expedition service…</p>}
        {service.kind !== "available" && service.kind !== "loading" && <EmptyNote>Rover profiles come from the expedition service. The service is not connected. The inputs will appear once it is.</EmptyNote>}
        {caps && profiles.length === 0 && <EmptyNote>The connected service lists no rover profiles.</EmptyNote>}
        {profiles.length > 0 && (
          <label className="block text-xs text-fg-muted">Profile
            <select value={workspace.roverProfileId ?? ""} onChange={e => { const pr = profiles.find(x => x.profile_id === e.target.value); if (pr) onChange({ roverProfileId: pr.profile_id, rover: { ...pr.parameters } }); }} className="mt-1 w-full rounded-lg border border-line-strong bg-bg px-2 py-2 text-sm text-fg" aria-label="Rover profile">
              <option value="" disabled>Choose a rover profile…</option>
              {profiles.map(pr => <option key={pr.profile_id} value={pr.profile_id}>{pr.label}</option>)}
            </select>
          </label>
        )}
        {rover && (
          <div className="mt-2 space-y-2">
            {profiles.find(x => x.profile_id === workspace.roverProfileId)?.description && <p className="text-[11px] text-fg-muted">{profiles.find(x => x.profile_id === workspace.roverProfileId)?.description}</p>}
            {ROVER_FIELDS.filter(f => f.group === "limits").map(f => <RoverField key={f.key} field={f} value={rover[f.key]} onChange={v => onChange({ rover: { ...rover, [f.key]: v }, roverProfileId: workspace.roverProfileId })} />)}
            <details className="rounded-lg border border-line px-2.5 py-2">
              <summary className="cursor-pointer text-[11px] text-fg-muted">Engineering assumptions. You can edit these. They are not measured rover values.</summary>
              <div className="mt-2 space-y-2">{ROVER_FIELDS.filter(f => f.group === "assumptions").map(f => <RoverField key={f.key} field={f} value={rover[f.key]} onChange={v => onChange({ rover: { ...rover, [f.key]: v }, roverProfileId: workspace.roverProfileId })} />)}</div>
              <p className="mt-2 text-[10.5px] text-fg-faint">Used by the service's energy model: (mass·g·Crr·distance + mass·g·climb) / efficiency, plus hotel power over the drive time. It does not include regenerative descent or solar recharging.</p>
            </details>
            <p className="text-[10.5px] text-fg-faint">These are inputs to the shared simulation. The service uses its own physical model. It may report that a value is outside the range it supports.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="cfg-opt">
        <h3 id="cfg-opt" className="eyebrow mb-2">Route optimization</h3>
        <div className="grid gap-1" role="radiogroup" aria-label="Route optimization preference">
          {prefs.map(pref => { const on = workspace.optimization === pref; const l = OPTIMIZATION_LABEL[pref] ?? { label: pref.replace(/_/g, " "), hint: "" }; return (
            <button key={pref} type="button" role="radio" aria-checked={on} onClick={() => onChange({ optimization: pref })} title={l.hint} className={`rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${on ? "border-copper bg-copper/10 text-copper-bright" : "border-line text-fg hover:border-line-strong"}`}>{l.label}<span className="block text-[10.5px] font-normal text-fg-muted">{l.hint}</span></button>
          ); })}
        </div>
      </section>

      <section aria-labelledby="cfg-targets">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 id="cfg-targets" className="eyebrow">Research targets</h3>{targets.length > 0 && <span className="num text-[11px] text-fg-muted">{workspace.targetIds.length}/{targets.length} selected</span>}</div>
        {terrain.kind === "loading" && <p className="text-xs text-fg-muted" role="status">Loading research targets…</p>}
        {terrain.kind === "unavailable" && <EmptyNote>{terrain.reason}</EmptyNote>}
        {terrain.kind === "error" && <div className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger" role="alert">Research targets could not be loaded. <button type="button" className="underline" onClick={terrain.retry}>Retry</button></div>}
        {terrain.kind === "ready" && targets.length === 0 && <EmptyNote>The service lists no research targets with coordinates for this region. You can still plan routes between your waypoints.</EmptyNote>}
        {targets.length > 0 && (
          <ul className="space-y-1" aria-label="Research targets">
            {targets.map(t => { const on = workspace.targetIds.includes(t.target_id); return (
              <li key={t.target_id}>
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${on ? "border-info/60 bg-info/10" : "border-line hover:border-line-strong"}`}>
                  <input type="checkbox" checked={on} onChange={() => onToggleTarget(t.target_id)} className="mt-0.5 accent-info" aria-label={`Include research target ${t.name}`} />
                  <span className="min-w-0 flex-1"><span className="block font-medium text-fg">{t.name}</span><span className="block text-[10.5px] text-fg-muted">{t.kind.replace(/_/g, " ")}{t.priority != null ? ` · priority ${t.priority}` : ""}{t.source ? ` · ${t.source}` : ""}</span>{t.description && <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">{t.description}</span>}</span>
                </label>
              </li>
            ); })}
          </ul>
        )}
      </section>

      <section aria-label="Calculate route" className="sticky bottom-0 -mx-4 border-t border-line bg-bg-elev px-4 pt-3">
        {running ? (
          <button type="button" onClick={onCancel} className="flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong px-4 py-3 text-sm font-semibold text-fg hover:border-danger hover:text-danger"><Square className="h-4 w-4" aria-hidden />Cancel calculation</button>
        ) : (
          <button type="button" onClick={onCalculate} disabled={!canCalculate} aria-describedby={!canCalculate ? "calc-blockers" : undefined} className="flex w-full items-center justify-center gap-2 rounded-lg border border-copper bg-copper px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-copper-bright hover:text-bg disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4" aria-hidden />{workspace.runs.length ? "Recalculate route" : "Calculate route"}
          </button>
        )}
        {!canCalculate && !running && blockers.length > 0 && (
          <ul id="calc-blockers" className="mt-2 space-y-1 text-[11px] text-fg-muted">{blockers.map(b => <li key={b} className="flex gap-1.5"><Badge tone="neutral">needs</Badge><span>{b}</span></li>)}</ul>
        )}
        <p className="mt-2 pb-1 text-[10.5px] text-fg-faint">The shared expedition service calculates the distances, energy, slopes and feasibility. Nothing is estimated in the browser.</p>
      </section>
    </div>
  );
}

function RoverField({ field, value, onChange }: { field: { key: string; label: string; unit: string; min: number; max: number; step: number }; value: number | null | undefined; onChange: (v: number) => void }) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs text-fg-muted">
      <span>{field.label}</span>
      <span className="flex items-center gap-1"><input type="number" aria-label={field.unit ? `${field.label} (${field.unit})` : field.label} value={value ?? ""} min={field.min} max={field.max} step={field.step} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} className="num w-24 rounded border border-line-strong bg-bg px-1.5 py-1 text-right text-xs text-fg" /><span className="w-8 text-[10.5px]">{field.unit}</span></span>
    </label>
  );
}
