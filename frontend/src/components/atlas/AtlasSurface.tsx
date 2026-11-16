import type { ReactNode } from "react";
import styles from "./atlas.module.css";

/** Opt-in presentation boundary. No application state, global CSS or data transforms. */
export function AtlasSurface({ children, enabled = true, label }: { children: ReactNode; enabled?: boolean; label?: string }) {
  return <div className={`scroll-thin h-full overflow-y-auto ${enabled ? styles.surface : ""}`} aria-label={label}>{children}</div>;
}

export function AtlasSection({ number, title, description, children }: { number: string; title: string; description?: string; children: ReactNode }) {
  return <section className={styles.chapter} aria-label={title}>
    <header className={styles.chapterHeader}><div><span className={styles.eyebrow}>{number} / Field notes</span><h2>{title}</h2></div>{description && <p>{description}</p>}</header>
    {children}
  </section>;
}

/** Original decorative contour drawing. Never an elevation or observation layer. */
export function ContourArtwork({ variant = "mission" }: { variant?: "mission" | "compare" | "analysis" | "quiet" }) {
  return <div aria-hidden="true" data-contour={variant} className={styles.contours}><svg focusable="false" viewBox="0 0 600 300" preserveAspectRatio="none">
    {variant === "analysis" ? Array.from({length:10},(_,i)=><ellipse key={i} cx="430" cy="120" rx={70+i*15} ry={25+i*8} transform="rotate(-18 430 120)" />) : <>
      <g transform={variant === "compare" ? "translate(600 0) scale(-1 1)" : undefined}>{Array.from({ length: variant === "quiet" ? 8 : 14 }, (_, i) => <path key={i} d={`M ${-100+i*8} ${280+i*12} C ${80+i*10} ${200+i*8}, ${65+i*9} ${-80+i*10}, ${270+i*7} ${10+i*7} S ${490+i*7} ${280+i*9}, ${700+i*10} ${70+i*8}`} />)}</g>

    </>}
  </svg></div>;
}
