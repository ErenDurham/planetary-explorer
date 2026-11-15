// The one control that joins the two Explore experiences: Find Earth Analogs
// (the installed discovery pilot, the default) and Browse Regions (the
// featured Mars and Earth regions, including the established analogs, the
// secondary mode). Shown at the top of both.
import { Compass, Globe2 } from "lucide-react";
import { useAppStore, type ExploreMode } from "@/store/useAppStore";

const MODES: Array<{ id: ExploreMode; label: string; hint: string; Icon: typeof Globe2 }> = [
  { id: "find_analogs", label: "Find Unresearched Analogs", hint: "Candidate Earth regions for review in this app; unresearched does not mean unknown to science", Icon: Compass },
  { id: "browse", label: "Browse Regions", hint: "Secondary: the established Earth analogs and featured Mars regions, with mission scoring", Icon: Globe2 },
];

export function ExploreModeSwitch({ className = "" }: { className?: string }) {
  const mode = useAppStore((s) => s.exploreMode);
  const setMode = useAppStore((s) => s.setExploreMode);
  return (
    <div role="radiogroup" aria-label="Explore mode" className={`inline-flex rounded-full border border-line bg-bg p-1 text-xs ${className}`}>
      {MODES.map(({ id, label, hint, Icon }) => { const on = mode === id; return (
        <button key={id} type="button" role="radio" aria-checked={on} title={hint} onClick={() => setMode(id)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${on ? (id === "browse" ? "bg-copper/20 text-copper-bright" : "bg-info/20 text-info") : "text-fg-muted hover:text-fg"}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden />{label}
        </button>
      ); })}
    </div>
  );
}
