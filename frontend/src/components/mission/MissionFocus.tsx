import { useAppStore } from "@/store/useAppStore";
import { BODY_NAME } from "@/lib/analogFeatures";

export function MissionFocus() {
  const focus = useAppStore(s => s.selectionBody);
  const setFocus = useAppStore(s => s.setMissionFocus);
  return <section aria-label="Mission focus" className="border-b border-line p-4">
    <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Mission focus</h2>
    <p className="mt-2 text-xs leading-relaxed text-fg-muted">Where are you choosing a mission site?</p>
    <div role="group" aria-label="Mission focus planet" className="mt-3 grid grid-cols-2 gap-2">{(["earth", "mars"] as const).map(body => <button key={body} type="button" onClick={() => setFocus(body)} aria-pressed={focus === body} className={`rounded border px-4 py-3 text-sm font-semibold ${focus === body ? "border-copper bg-copper/15 text-copper-bright" : "border-line-strong text-fg-muted hover:text-fg"}`}>{BODY_NAME[body]}</button>)}</div>
  </section>;
}
