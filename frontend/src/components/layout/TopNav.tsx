import { Orbit } from "lucide-react";
import { effectiveMapMode, useAppStore, type Tab } from "@/store/useAppStore";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "mission", label: "Mission Design", hint: "Mission objective, priorities and recommendation" },
  { id: "explore", label: "Explore", hint: "Globe, sites and environmental profiles" },
  { id: "analyze", label: "Analyze", hint: "Rankings and cross-site charts" },
  { id: "compare", label: "Compare", hint: "Compare the selected Earth and Mars locations" },
  { id: "research", label: "Research", hint: "Study ideas, supporting evidence and further reading" },
];

export function TopNav({ active, onChange, right }: { active: Tab; onChange: (t: Tab) => void; right?: React.ReactNode }) {
  const viewedBody = useAppStore((s) => s.viewedBody);
  const mapMode = useAppStore((s) => s.mapMode);
  const analog = effectiveMapMode({ viewedBody, mapMode }) === "analog_match";
  const subtitle = active === "compare" ? "Earth · Mars · analog pair" : active === "explore" && analog ? `${viewedBody === "earth" ? "Earth" : "Mars"} · analog matching · v1` : "Mission planning · Earth & Mars";
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-bg-elev px-4 py-2 sm:h-12 sm:flex-nowrap sm:py-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
          <Orbit className="h-4 w-4 text-copper-bright" aria-hidden />
          Planetary Explorer
        </span>
        <span className="hidden text-[10.5px] uppercase tracking-[0.14em] text-fg-faint sm:inline">{subtitle}</span>
      </div>
      <nav aria-label="Primary" className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            onKeyDown={e => {
              if (e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              const buttons = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? []);
              const index = buttons.indexOf(e.currentTarget);
              const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
              e.preventDefault(); buttons[next]?.focus();
            }}
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
