// The first-run prompt: until a mission has been designed, any click outside
// the Mission Design tab opens this dialog instead of acting. App decides when
// the gate is on; everything marked data-gate-allow (this dialog, the Mission
// Design tab) stays clickable.
import { useEffect, useRef } from "react";
import { Rocket, X } from "lucide-react";

export function MissionGate({ onGo, onClose }: { onGo: () => void; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div data-gate-allow className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mission-gate-title" className="relative w-full max-w-md rounded-2xl border border-line-strong bg-bg-elev p-7 text-center shadow-2xl" data-testid="mission-gate">
        <button type="button" onClick={onClose} aria-label="Close" title="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted hover:bg-bg-elev-2 hover:text-fg"><X className="h-5 w-5" aria-hidden /></button>
        <Rocket className="mx-auto h-8 w-8 text-copper-bright" aria-hidden />
        <h2 id="mission-gate-title" className="mt-3 text-xl font-semibold text-fg">Try Entering a Mission Design before getting started!</h2>
        <button ref={button} type="button" onClick={onGo} className="mt-6 rounded-lg border border-copper bg-copper px-6 py-3 text-sm font-semibold text-white hover:bg-copper-bright">Go to Mission Design</button>
      </div>
    </div>
  );
}
