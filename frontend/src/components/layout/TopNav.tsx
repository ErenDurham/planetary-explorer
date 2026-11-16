// Primary navigation is the journey in order: Mission Design, Explore,
// Research. The analysis tools stay fully available behind an Advanced
// disclosure (Analyze, Compare), which also shows which of them is open.
// Compare additionally stays contextual inside Explore ("Compare selected
// pair"). Arrow keys move focus along the visible buttons; Enter or Space
// activates; Escape closes the menu.
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";
import { useAppearance } from "@/theme/appearance";
import { ChevronDown, Sun, Moon } from "lucide-react";
import styles from "./navigation.module.css";
import { type Tab } from "@/store/useAppStore";

const PRIMARY: Array<{ id: Tab; label: string; hint: string; step: number }> = [
  { id: "mission", label: "Mission Design", hint: "Describe the mission; the app reads it and proposes priorities", step: 1 },
  { id: "explore", label: "Explore", hint: "Browse established Earth and Mars regions, or find new Earth terrain resembling Jezero", step: 2 },
  { id: "research", label: "Research", hint: "Notebook, checklist, brief and background evidence for a candidate", step: 3 },
];
const ADVANCED: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "analyze", label: "Analyze", hint: "Rankings and cross-site charts" },
  { id: "compare", label: "Compare", hint: "Compare the selected Earth and Mars locations" },
];

export function TopNav({ active, onChange, right }: { active: Tab; onChange: (t: Tab) => void; right?: React.ReactNode }) {
  const mode=useAppearance(s=>s.mode), toggleAppearance=useAppearance(s=>s.toggle);
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
  const tabClass = (on: boolean) => `${styles.tab} ${on ? styles.active : ""}`;
  return (
    <header data-pane="navigation" className={styles.navigation}>
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" aria-label="Home" aria-current={active === "home" ? "page" : undefined} onClick={() => { setOpen(false); onChange("home"); }} className={styles.brand}>
          <Wordmark /><span className="sr-only">Planetary Explorer</span>
        </button>
      </div>
      <nav aria-label="Primary" className={styles.links}>
        {PRIMARY.map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)} onKeyDown={roving} aria-current={active === t.id ? "page" : undefined} title={t.hint} className={tabClass(active === t.id)}>
            <span aria-hidden className={styles.step}>0{t.step}</span>{t.label}
          </button>
        ))}
        <div ref={menu} className="relative">
          <button type="button" onClick={() => setOpen(o => !o)} onKeyDown={roving} aria-expanded={open} aria-haspopup="menu" aria-controls="advanced-tools" title={advancedActive ? `${advancedActive.label} is open · choose an analysis tool` : "Analyze and Compare"} aria-current={advancedActive ? "page" : undefined} className={`${tabClass(!!advancedActive)} ${styles.tools}`} data-testid="advanced-nav">
            {advancedActive ? <span>{advancedActive.label}</span> : <><span className="sm:hidden">Tools</span><span className="hidden sm:inline">Advanced</span></>}<ChevronDown className={`h-3.5 w-3.5 ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <div id="advanced-tools" role="menu" aria-label="Advanced tools" hidden={!open} className={styles.menu}>
            <p className="px-2 py-1 text-[10.5px] uppercase tracking-wide text-fg-faint">Analysis tools</p>
            {ADVANCED.map(t => (
              <button key={t.id} type="button" role="menuitem" onClick={() => { onChange(t.id); setOpen(false); }} onKeyDown={roving} aria-current={active === t.id ? "page" : undefined} title={t.hint} className={`block w-full rounded px-2 py-1.5 text-left text-xs ${active === t.id ? "bg-copper/15 text-copper-bright" : "text-fg hover:bg-bg-elev-2"}`}>
                {t.label}<span className="block text-[10.5px] text-fg-faint">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>
      <div className={styles.trailing}>{right}<button type="button" className={styles.appearanceToggle} aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} onClick={toggleAppearance}>{mode === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</button></div>
    </header>
  );
}
