// Primary navigation is the journey in order: Mission Design, Explore,
// Research. The analysis tools stay fully available behind an Advanced
// disclosure (Analyze, Compare), which also shows which of them is open.
// Compare additionally stays contextual inside Explore ("Compare selected
// pair"). Arrow keys move focus along the visible buttons; Enter or Space
// activates; Escape closes the menu.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Orbit } from "lucide-react";
import { type Tab } from "@/store/useAppStore";

const PRIMARY: Array<{ id: Tab; label: string; hint: string; step: number }> = [
  { id: "mission", label: "Mission Design", hint: "Describe the mission; the app reads it and proposes priorities", step: 1 },
  { id: "explore", label: "Explore", hint: "Find Earth terrain resembling Jezero, or browse the established regions and Mars sites", step: 2 },
  { id: "research", label: "Research", hint: "Notebook, checklist, brief and background evidence for a candidate", step: 3 },
];
const ADVANCED: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "analyze", label: "Analyze", hint: "Rankings and cross-site charts" },
  { id: "compare", label: "Compare", hint: "Compare the selected Earth and Mars locations" },
];

export function TopNav({ active, onChange, right }: { active: Tab; onChange: (t: Tab) => void; right?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const advancedActive = ADVANCED.find(t => t.id === active) ?? null;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const roving = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const scope = e.currentTarget.closest("nav, [role=menu]");
    const buttons = Array.from(scope?.querySelectorAll<HTMLButtonElement>("button") ?? []).filter(b => b.offsetParent !== null || b === e.currentTarget);
    const index = buttons.indexOf(e.currentTarget);
    const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    e.preventDefault(); buttons[next]?.focus();
  };
  const tabClass = (on: boolean) => `rounded px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-copper/15 text-copper-bright" : "text-fg-muted hover:bg-bg-elev-2 hover:text-fg"}`;
  return (
    <header data-pane="navigation" className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-bg-elev px-4 py-2 sm:h-12 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-fg">
          <Orbit className="h-4 w-4 text-copper-bright" aria-hidden />
          Planetary Explorer
        </span>
      </div>
      <nav aria-label="Primary" className="flex flex-wrap items-center justify-center gap-1 justify-self-center">
        {PRIMARY.map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)} onKeyDown={roving} aria-current={active === t.id ? "page" : undefined} title={t.hint} className={`inline-flex items-center gap-1.5 ${tabClass(active === t.id)}`}>
            <span aria-hidden className={`num inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${active === t.id ? "border-copper-bright/60 text-copper-bright" : "border-line-strong text-fg-faint"}`}>{t.step}</span>{t.label}
          </button>
        ))}
        <div ref={menu} className="relative">
          <button type="button" onClick={() => setOpen(o => !o)} onKeyDown={roving} aria-expanded={open} aria-haspopup="menu" aria-controls="advanced-tools" title="Analyze and Compare" className={`inline-flex items-center gap-1 ${tabClass(!!advancedActive)}`} data-testid="advanced-nav">
            Advanced{advancedActive ? <span className="text-fg-faint"> · </span> : null}{advancedActive ? <span>{advancedActive.label}</span> : null}<ChevronDown className={`h-3.5 w-3.5 ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <div id="advanced-tools" role="menu" aria-label="Advanced tools" hidden={!open} className="absolute left-1/2 top-full z-50 mt-1 w-56 -translate-x-1/2 rounded-lg border border-line bg-bg-elev p-1 shadow-lg">
            <p className="px-2 py-1 text-[10.5px] uppercase tracking-wide text-fg-faint">Analysis tools</p>
            {ADVANCED.map(t => (
              <button key={t.id} type="button" role="menuitem" onClick={() => { onChange(t.id); setOpen(false); }} onKeyDown={roving} aria-current={active === t.id ? "page" : undefined} title={t.hint} className={`block w-full rounded px-2 py-1.5 text-left text-xs ${active === t.id ? "bg-copper/15 text-copper-bright" : "text-fg hover:bg-bg-elev-2"}`}>
                {t.label}<span className="block text-[10.5px] text-fg-faint">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>
      <div className="hidden min-w-0 items-center justify-end gap-2 md:flex">{right}</div>
    </header>
  );
}
