import { lazy, Suspense } from "react";
import { ArrowRight, ArrowUpRight, Compass, FileText, SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";
import styles from "./home.module.css";

const HomePlanetPreview = lazy(() => import("./HomePlanetPreview"));

const steps = [
  { number: "01", title: "Define the question", text: "Describe your mission. Review the proposed priorities and adjust what matters.", Icon: SlidersHorizontal },
  { number: "02", title: "Explore the evidence", text: "Inspect locations, compare their measured properties, and see where the analogy breaks down.", Icon: Compass },
  { number: "03", title: "Build a research brief", text: "Investigate a terrain candidate, record sources and gaps, then download your findings.", Icon: FileText },
];

/** An orientation and entry surface, never a second mission editor or scoring model. */
export function HomeView() {
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const missionDesigned = useAppStore(s => s.missionDesigned);
  const objective = useAppStore(s => s.appliedObjective);
  const target = useCandidateResearchTarget(s => s.target);
  const navigate = (go: () => void) => {
    go();
    requestAnimationFrame(() => document.getElementById("workspace")?.focus());
  };
  const browse = () => {
    const state = useAppStore.getState();
    state.navigateExplore(state.selectionBody === "mars" ? "analogs" : "mission");
  };
  return <div className={`scroll-thin ${styles.page}`}>
    <div className={styles.inner}>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div className={styles.introduction}>
          <p className={styles.eyebrow}>An atlas for planetary fieldwork</p>
          <h1 id="home-heading">Explore Mars.<br /><span>Find its parallels<br className={styles.desktopBreak} /> on Earth.</span></h1>
          <p className={styles.lede}>Compare worlds. Understand the evidence. Find a place to take your research further.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => navigate(() => setActiveTab("mission"))}>{missionDesigned ? "Continue your mission" : "Start with a mission"}<ArrowRight size={17} aria-hidden /></button>
            <button type="button" className={styles.secondary} onClick={() => navigate(browse)}>Find Earth Analogs<ArrowUpRight size={15} aria-hidden /></button>
          </div>
          <p className={styles.definition}>An Earth analog shares specific properties with a planetary environment. It gives researchers a place to study a process or test an approach—not a replica of another world.</p>
        </div>
        <div className={styles.investigation}>
          <Suspense fallback={<div className={styles.previewLoading} aria-hidden="true" />}><HomePlanetPreview /></Suspense>
        </div>
      </section>
      {(missionDesigned || target) && <section className={styles.session} aria-label="Your current work">
        <div><p className={styles.eyebrow}>Your current work</p><p>{missionDesigned && objective ? objective : "Your candidate research notebook is ready to reopen."}</p></div>
        {target && <button type="button" className={styles.secondary} onClick={() => navigate(() => setActiveTab("research"))}>Reopen research notebook<ArrowRight size={15} aria-hidden /></button>}
      </section>}
      <section className={styles.workflow} aria-labelledby="workflow-heading">
        <div className={styles.sectionHeading}><h2 id="workflow-heading">From a question to a research plan.</h2><p>Start with your goal. Keep the evidence in view.</p></div>
        <ol className={styles.steps}>{steps.map(({ number, title, text, Icon }) => <li key={number}>
          <div className={styles.stepTop}><span>{number}</span><Icon size={18} strokeWidth={1.5} aria-hidden /></div>
          <h3>{title}</h3><p>{text}</p>
        </li>)}</ol>
      </section>
      <details className={styles.method}>
        <summary>What the results can tell you<span>Evidence & limits</span></summary>
        <div className={styles.methodGrid}>
          <div><h3>Two different questions</h3><p>Mission fit ranks locations against your priorities. Analog similarity compares properties between locations. Neither is a probability or a certification of safety.</p></div>
          <div><h3>Measurements before interpretation</h3><p>Scores come from supplied data and deterministic calculations. AI can help interpret objectives and explain results; it does not create measurements or determine the scores.</p></div>
          <div><h3>A starting point for investigation</h3><p>Regional terrain cannot establish local geology, site access or field suitability. Earth also differs in gravity, atmosphere and radiation. Review the sources and document what remains unknown.</p></div>
        </div>
      </details>
      <footer className={styles.footer}><span>Planetary Explorer</span><span>Mars & Earth · research screening</span></footer>
    </div>
  </div>;
}
