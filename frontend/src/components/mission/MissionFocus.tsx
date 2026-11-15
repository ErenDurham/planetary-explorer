import { MISSION_TYPES } from "@/lib/missionProfiles";
import { useAppStore } from "@/store/useAppStore";
import { BODY_NAME, otherBody } from "@/lib/analogFeatures";

export function MissionFocus() {
  const kind = useAppStore(s => s.missionType);
  const setKind = useAppStore(s => s.setMissionType);
  const focus = useAppStore(s => s.selectionBody);
  const override = useAppStore(s => s.missionFocusOverride);
  const suggested = useAppStore(s => s.suggestedMissionFocus);
  const setFocus = useAppStore(s => s.setMissionFocus);
  return <section aria-label="Mission focus" className="border-b border-line p-4">
    <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Mission focus</h2>
    <p className="mt-2 text-xs leading-relaxed text-fg-muted">Where are you choosing a mission site?</p>
    <div role="group" aria-label="Mission focus planet" className="mt-3 grid grid-cols-2 gap-2">{(["earth", "mars"] as const).map(body => <button key={body} type="button" onClick={() => setFocus(body)} aria-pressed={focus === body} className={`rounded border px-4 py-3 text-sm font-semibold ${focus === body ? "border-copper bg-copper/15 text-copper-bright" : "border-line-strong text-fg-muted hover:text-fg"}`}>{BODY_NAME[body]}</button>)}</div>
    <label className="mt-4 block text-xs font-medium text-fg-muted" htmlFor="mission-type">Mission type</label>
    <select id="mission-type" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="mt-2 w-full rounded border border-line-strong bg-bg p-2 text-sm text-fg">{MISSION_TYPES.map(t => <option key={t.id} value={t.id} disabled={t.id === "landing" && focus !== "mars"}>{t.label}</option>)}</select>
    <p className="mt-3 text-xs leading-relaxed text-fg-muted">Explore opens {BODY_NAME[focus]}. Analog match finds similar sites on {BODY_NAME[otherBody(focus)]}.</p>
    {override ? <div className="mt-2 text-xs text-fg-muted"><span>Your choice stays in effect when you apply objective suggestions.</span>{suggested && <button type="button" onClick={() => setFocus(null)} className="mt-2 block text-info underline underline-offset-4">Use objective suggestion: {BODY_NAME[suggested]}</button>}</div> : <p className="mt-2 text-xs text-fg-muted">{suggested ? `Suggested from your objective: ${BODY_NAME[suggested]}. You can change it here.` : "The objective can suggest a planet; you can choose either one here."}</p>}
  </section>;
}
