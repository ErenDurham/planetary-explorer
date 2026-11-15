import { useMemo, useState } from "react";

type Body = "moon" | "mars";
type Analog = {
  id: string; name: string; location: string; bodies: Body[]; summary: string;
  image: string; comparisonImage: string; comparisonName: string;
  shared: string; applications: string; limitations: string;
};

const analogs: Analog[] = [
  { id: "atacama", name: "Atacama Desert", location: "Chile", bodies: ["mars"], summary: "Analog for Mars' arid soil, extreme dryness, and detectable biosignatures.", image: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=900&q=85", comparisonImage: "https://images-assets.nasa.gov/image/PIA24420/PIA24420~orig.jpg", comparisonName: "Mars surface", shared: "Extreme dryness, intense UV exposure, salt-rich soils, and some comparable mineral environments.", applications: "Test life-detection methods, study biosignature preservation, and validate field instruments.", limitations: "Earth's dense atmosphere, rainfall events, biology, and gravity differ greatly from Mars." },
  { id: "mcmurdo", name: "McMurdo Dry Valleys", location: "Antarctica", bodies: ["mars"], summary: "Analog for Mars' cold, dry terrain with low moisture and limited life.", image: "https://images.unsplash.com/photo-1517299321609-52687d1bc55a?auto=format&fit=crop&w=900&q=85", comparisonImage: "https://images-assets.nasa.gov/image/PIA24420/PIA24420~orig.jpg", comparisonName: "Mars surface", shared: "Cold deserts, exposed rock, ice, and scarce liquid water.", applications: "Investigate microbial survival, frozen soils, and water-driven surface processes.", limitations: "Antarctica still has Earth's atmospheric pressure, oxygen, and active ecosystems." },
  { id: "kilauea", name: "Kīlauea", location: "Hawaii, USA", bodies: ["moon"], summary: "Analog for the Moon's basaltic volcanic terrain and lava-driven surface features.", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=85", comparisonImage: "https://images-assets.nasa.gov/image/PIA00405/PIA00405~orig.jpg", comparisonName: "Lunar surface", shared: "Basaltic rocks, lava flows, and rugged volcanic landscapes.", applications: "Practice geology traverses, sampling, and rover navigation on volcanic terrain.", limitations: "Active volcanism, weathering, vegetation, and atmospheric conditions are unlike today's Moon." },
  { id: "askja", name: "Askja", location: "Iceland", bodies: ["moon", "mars"], summary: "Analog for volcanic landscapes and exploration of rugged planetary terrain.", image: "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=900&q=85", comparisonImage: "https://images-assets.nasa.gov/image/PIA00405/PIA00405~orig.jpg", comparisonName: "Lunar surface", shared: "Volcanic deposits, loose rock, and difficult terrain for field operations.", applications: "Practice astronaut field geology, rover traverses, and instrument deployment.", limitations: "Iceland has liquid water, vegetation, an atmosphere, and active terrestrial processes." },
  { id: "haughton", name: "Haughton Crater", location: "Devon Island, Canada", bodies: ["mars"], summary: "Analog for Mars' impact craters, ejecta, and altered rock formations.", image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=900&q=85", comparisonImage: "https://images-assets.nasa.gov/image/PIA24420/PIA24420~orig.jpg", comparisonName: "Mars surface", shared: "Impact geology, polar desert conditions, and remote expedition logistics.", applications: "Test field operations, robotic exploration, and impact-related geological sampling.", limitations: "The site has terrestrial erosion, breathable air, and Earth gravity." },
  { id: "lava-beds", name: "Lava Beds", location: "California, USA", bodies: ["moon"], summary: "Analog for lunar lava tubes, which may offer natural shelter for exploration.", image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=85", comparisonImage: "https://images-assets.nasa.gov/image/PIA00405/PIA00405~orig.jpg", comparisonName: "Lunar surface", shared: "Volcanic caves, basalt, and underground passageways.", applications: "Investigate cave mapping, autonomous navigation, and sheltered habitat concepts.", limitations: "Terrestrial caves have air, water-driven alteration, and different structural conditions." },
];

const datasets = [
  { title: "HiRISE — High-Resolution Imagery", description: "Detailed surface features for Mars analog comparisons.", url: "https://www.uahirise.org/", icon: "◈" },
  { title: "JMARS — Planetary Mapping", description: "Visualize and compare geology, mineral, and terrain data.", url: "https://jmars.asu.edu/", icon: "◉" },
  { title: "NASA Planetary Data System (PDS)", description: "Access archived planetary mission images and science data.", url: "https://pds.nasa.gov/", icon: "◌" },
];

export function EarthAnalogDashboard() {
  const [filter, setFilter] = useState<"all" | Body>("all");
  const [activeId, setActiveId] = useState("atacama");
  const [comparisonOpen, setComparisonOpen] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const visible = useMemo(() => analogs.filter(a => filter === "all" || a.bodies.includes(filter)), [filter]);
  const active = analogs.find(a => a.id === activeId) ?? analogs[0];
  const image = (src: string, alt: string, key: string, className: string) => imageErrors[key] ? <div className={`${className} flex items-center justify-center bg-[#172739] text-xs text-slate-400`}>Image unavailable</div> : <img src={src} alt={alt} loading="lazy" className={`${className} object-cover`} onError={() => setImageErrors(prev => ({ ...prev, [key]: true }))} />;

  return <div className="scroll-thin h-full overflow-y-auto bg-[#060e18] text-slate-100">
    <div className="relative overflow-hidden border-b border-[#263447] bg-[radial-gradient(ellipse_at_90%_0%,#553021_0%,#142032_35%,#08111e_75%)]">
      <div className="mx-auto max-w-[1500px] px-5 pb-6 pt-7 md:px-8">
        <div className="border-l-[3px] border-amber-500 pl-5">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Earth Analog <span className="text-amber-400">Research</span></h1>
          <p className="mt-1 text-sm text-slate-300 md:text-base">Discover Earth's environments that prepare us for the Moon and Mars.</p>
        </div>
        <div className="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-[#34465c] bg-[#0b1726]/90 p-1">
          {([ ["all", "▱", "All sites"], ["moon", "☾", "Moon analogs"], ["mars", "◉", "Mars analogs"] ] as const).map(([value, symbol, label]) => <button key={value} type="button" onClick={() => { setFilter(value); const next = analogs.find(a => value === "all" || a.bodies.includes(value)); if (next) setActiveId(next.id); }} className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${filter === value ? "border border-amber-500/70 bg-amber-500/20 text-amber-300 shadow-[0_0_18px_#e49b2420]" : "text-slate-300 hover:bg-white/5"}`}><span className="mr-2 text-lg">{symbol}</span>{label}</button>)}
        </div>
      </div>
    </div>

    <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-5 md:px-8">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map(a => <button type="button" key={a.id} onClick={() => { setActiveId(a.id); setComparisonOpen(true); }} className={`flex min-h-[172px] gap-3 rounded-2xl border bg-gradient-to-br from-[#142235] to-[#0b1522] p-3 text-left transition hover:border-sky-500/70 hover:bg-[#1a2a40] ${activeId === a.id ? "border-amber-500/60" : "border-[#34475d]"}`}>
          {image(a.image, `${a.name}, ${a.location}`, a.id, "h-[148px] w-[43%] shrink-0 rounded-xl")}
          <div className="min-w-0 flex-1 py-1"><h2 className="text-base font-bold leading-tight">{a.name}</h2><p className="mt-2 text-xs text-slate-300">⌖ {a.location}</p><div className="mt-2 flex flex-wrap gap-1">{a.bodies.map(b => <span key={b} className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${b === "mars" ? "border-amber-600/70 bg-amber-500/10 text-amber-300" : "border-sky-500/70 bg-sky-500/10 text-sky-300"}`}>{b === "mars" ? "◉ Mars" : "☾ Moon"}</span>)}</div><p className="mt-2 text-xs leading-relaxed text-slate-300">{a.summary}</p><p className="mt-3 text-sm font-semibold text-cyan-400">Explore research →</p></div>
        </button>)}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-[#40556d] bg-gradient-to-br from-[#18283b] to-[#0a1523] p-4 md:p-5">
          <button type="button" onClick={() => setComparisonOpen(v => !v)} className="flex w-full items-center justify-between gap-3 border-b border-[#34475b] pb-3 text-left"><h2 className="text-lg font-bold"><span className="mr-2 text-amber-400">⚖</span> Analog Comparison: {active.name} (Earth) vs. {active.bodies[0] === "mars" ? "Mars" : "Moon"}</h2><span>{comparisonOpen ? "⌃" : "⌄"}</span></button>
          {comparisonOpen && <div className="mt-4 grid gap-5 md:grid-cols-[1fr_1.1fr]">
            <div className="space-y-3"> <div className="relative">{image(active.image, `${active.name} on Earth`, `${active.id}-comparison`, "h-40 w-full rounded-xl")}<span className="absolute bottom-2 left-2 rounded-lg bg-[#0b1727]/90 px-3 py-1 text-xs font-semibold">🌎 Earth — {active.name}</span></div><div className="relative">{image(active.comparisonImage, active.comparisonName, `${active.id}-planet`, "h-40 w-full rounded-xl")}<span className="absolute bottom-2 left-2 rounded-lg bg-[#0b1727]/90 px-3 py-1 text-xs font-semibold text-orange-300">◉ {active.comparisonName}</span></div></div>
            <div className="divide-y divide-[#35465a]">{[["△", "Shared features", active.shared], ["♧", "Research applications", active.applications], ["▱", "Where analogy breaks down", active.limitations]].map(([symbol, title, body]) => <div key={title} className="flex gap-4 py-4 first:pt-2"><span className="w-8 shrink-0 text-2xl text-amber-400">{symbol}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-300">{body}</p></div></div>)}</div>
          </div>}
        </section>
        <section className="rounded-2xl border border-[#40556d] bg-gradient-to-br from-[#18283b] to-[#0a1523] p-4 md:p-5"><h2 className="text-lg font-bold"><span className="mr-2 text-amber-400">▤</span> Evidence &amp; NASA datasets</h2><p className="my-3 text-sm text-slate-300">Key data and resources that support Earth analog research and site comparisons.</p><div className="space-y-2">{datasets.map(d => <a key={d.title} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-[#35475a] bg-[#091522] p-3 transition hover:border-cyan-500"><span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-[#23344b] text-2xl text-cyan-300">{d.icon}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{d.title}</h3><p className="mt-1 text-xs text-slate-400">{d.description}</p></div><span className="text-cyan-400">↗</span></a>)}</div></section>
      </div>
      <p className="pb-3 text-xs text-slate-500">Earth analogs reproduce selected environmental or operational conditions, not complete planetary environments. Compare primary datasets before drawing scientific conclusions.</p>
    </div>
  </div>;
}
