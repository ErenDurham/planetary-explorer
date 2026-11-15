import type { ReactNode } from "react";
import { BODY_NAME, type Body } from "@/lib/analogFeatures";
import styles from "./CompareAtlasFrame.module.css";

/** Presentation only. Selection, matching, imagery and zoom stay in CompareView. */
export function CompareAtlasFrame({ focusBody, children }: { focusBody: Body; children: ReactNode }) {
  return <div className={`scroll-thin h-full overflow-y-auto ${styles.atlas}`} aria-label="Earth and Mars pair comparison">
    <div className={styles.content}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Earth / Mars · field atlas</p>
          <h1 className={styles.title}>Two worlds. One comparison.</h1>
          <p className={styles.intro}>Inspect the terrain, compare the measurements, and find what transfers between sites.</p>
        </div>
        <div className={styles.context}>
          <span className={styles.contextLabel}>Mission focus</span>
          <span className={styles.focus}>{BODY_NAME[focusBody]}</span>
          <span className={styles.contextNote}>Your mission site appears first. Swap changes the display order.</span>
        </div>
      </header>
      {children}
    </div>
  </div>;
}

/** A local visual boundary around existing imagery controls and panes. */
export function CompareAtlasImagery({ children }: { children: ReactNode }) {
  return <section aria-label="Side-by-side visual field views" className={styles.imagery}>
    <div className={styles.sectionHeading}><span className={styles.eyebrow}>01 / Visual field views</span><p>Read the landscape side by side.</p></div>
    {children}
  </section>;
}
