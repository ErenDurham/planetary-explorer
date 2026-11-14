import { Orbit } from "lucide-react";
import type { Tab } from "@/store/useAppStore";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "explore", label: "Explore", hint: "Globe, sites and environmental profiles" },
  { id: "analyze", label: "Analyze", hint: "Rankings and cross-site charts" },
  { id: "compare", label: "Compare", hint: "Earth analog comparison" },
];

export function TopNav({ active, onChange, right }: { active: Tab; onChange: (t: Tab) => void; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-bg-elev px-4">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
          <Orbit className="h-4 w-4 text-copper-bright" aria-hidden />
          Planetary Explorer
        </span>
        <span className="hidden text-[10.5px] uppercase tracking-[0.14em] text-fg-faint sm:inline">Mars · landing phase · v1</span>
      </div>
      <nav aria-label="Primary" className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={active === t.id ? "page" : undefined}
            title={t.hint}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${active === t.id ? "bg-copper/15 text-copper-bright" : "text-fg-muted hover:bg-bg-elev-2 hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="hidden items-center gap-2 md:flex">{right}</div>
    </header>
  );
}
