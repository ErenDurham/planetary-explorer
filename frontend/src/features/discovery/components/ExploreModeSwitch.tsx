// The one control that joins the two Explore experiences: Browse Regions (the
// featured Mars and Earth regions, including the established analogs) and
// Find Earth Analogs (the offline discovery survey). Shown at the top of both.
import { Compass, Globe2 } from "lucide-react";
import { useAppStore, type ExploreMode } from "@/store/useAppStore";

const MODES: Array<{ id: ExploreMode; label: string; hint: string; Icon: typeof Globe2 }> = [
  { id: "browse", label: "Browse Regions", hint: "Featured Mars and Earth regions, including established Earth analogs", Icon: Globe2 },
  { id: "find_analogs", label: "Find Earth Analogs", hint: "Candidate Earth locations with terrain similar to a reference region", Icon: Compass },
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
