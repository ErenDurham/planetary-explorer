// Decoration for the Mission Design tab: a small rocket in the top-right
// corner and twinkling stars in the empty side margins beside the centred
// heading and chat box. Purely visual: hidden from screen readers, never
// clickable, and still under prefers-reduced-motion (index.css).
interface Star {
  x: string;      // horizontal position (left or right edge), in % of the panel width
  side: "left" | "right";
  y: string;      // vertical position
  size: number;   // px
  delay: number;  // s
  duration: number; // s
  sparkle?: boolean;
  copper?: boolean;
}

// Beside the heading and the saved mission text (always empty space).
const HEADER_STARS: Star[] = [
  { side: "left", x: "6%", y: "34px", size: 14, delay: 0, duration: 3.2, sparkle: true },
  { side: "left", x: "13%", y: "92px", size: 4, delay: 1.1, duration: 2.6 },
  { side: "left", x: "4%", y: "150px", size: 6, delay: 0.6, duration: 3.6, copper: true },
  { side: "left", x: "10%", y: "205px", size: 10, delay: 1.8, duration: 4, sparkle: true },
  { side: "right", x: "16%", y: "48px", size: 5, delay: 0.4, duration: 2.8 },
  { side: "right", x: "9%", y: "128px", size: 12, delay: 1.4, duration: 3.4, sparkle: true, copper: true },
  { side: "right", x: "4%", y: "188px", size: 4, delay: 2.2, duration: 3 },
];

// Lower down: only while the tab shows the chat box alone.
const OPEN_SKY_STARS: Star[] = [
  { side: "left", x: "8%", y: "48%", size: 5, delay: 0.9, duration: 3.1 },
  { side: "left", x: "14%", y: "63%", size: 12, delay: 0.2, duration: 3.8, sparkle: true },
  { side: "left", x: "5%", y: "80%", size: 4, delay: 1.6, duration: 2.7, copper: true },
  { side: "right", x: "12%", y: "55%", size: 6, delay: 1.2, duration: 3.3 },
  { side: "right", x: "6%", y: "72%", size: 14, delay: 0.5, duration: 4.2, sparkle: true },
  { side: "right", x: "15%", y: "88%", size: 4, delay: 2, duration: 2.9 },
];

const SPARKLE = "M12 0c.9 6.2 5.8 11.1 12 12-6.2.9-11.1 5.8-12 12-.9-6.2-5.8-11.1-12-12C6.2 11.1 11.1 6.2 12 0z";

function StarMark({ star }: { star: Star }) {
  const style = {
    [star.side]: star.x,
    top: star.y,
    width: star.size,
    height: star.size,
    ["--twinkle-delay" as string]: `${star.delay}s`,
    ["--twinkle-duration" as string]: `${star.duration}s`,
  };
  const color = star.copper ? "var(--color-copper-bright)" : "var(--color-fg)";
  return star.sparkle ? (
    <svg viewBox="0 0 24 24" className="star absolute" style={style} data-testid="decor-star">
      <path d={SPARKLE} fill={color} />
    </svg>
  ) : (
    <span className="star absolute rounded-full" style={{ ...style, background: color }} data-testid="decor-star" />
  );
}

export function SpaceDecor({ openSky }: { openSky: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="space-decor">
      {/* only where the side margins are wide enough to stay clear of the text */}
      <div className="hidden lg:block">
        {HEADER_STARS.map((s, i) => <StarMark key={`h${i}`} star={s} />)}
        {openSky && OPEN_SKY_STARS.map((s, i) => <StarMark key={`o${i}`} star={s} />)}
      </div>
      <svg viewBox="0 0 64 64" className="rocket-float absolute right-3 top-3 h-11 w-11 sm:right-8 sm:top-6 sm:h-16 sm:w-16" data-testid="decor-rocket">
        <g transform="rotate(45 32 32)">
          <path className="rocket-flame" d="M28.5 49h7L32 59z" fill="var(--color-copper-bright)" />
          <path d="M27 44h10l-1.6 5h-6.8z" fill="#9aa5b4" />
          <path d="M22 33l-8 10.5V48l8-3.5z" fill="var(--color-copper)" />
          <path d="M42 33l8 10.5V48l-8-3.5z" fill="var(--color-copper)" />
          <path d="M32 5c7 6 10 15.5 10 27v12H22V32c0-11.5 3-21 10-27z" fill="var(--color-fg)" />
          <path d="M32 5c2.9 2.5 5.1 5.5 6.7 9H25.3c1.6-3.5 3.8-6.5 6.7-9z" fill="var(--color-copper)" />
          <circle cx="32" cy="26" r="4.6" fill="var(--color-info)" stroke="var(--color-line-strong)" strokeWidth="2" />
          <path d="M32 38v6" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

/** The loading indicator while the model reads a mission: a star (with a
 * short fading tail) circling like a loading spinner. Sized in em so the
 * circle is as tall as the text beside it; the view box is centred on the
 * circle (12, 12) so it spins without wobbling. */
export function ShootingStar() {
  return (
    <svg viewBox="-2.5 -2.5 29 29" className="star-spinner h-[1.35em] w-[1.35em] shrink-0" aria-hidden data-testid="shooting-star">
      {/* tail: arcs behind the star on its circle, fading out */}
      <path d="M3.34 17A10 10 0 0 1 2.152 10.264" fill="none" stroke="var(--color-copper-bright)" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
      <path d="M2.152 10.264A10 10 0 0 1 5.572 4.34" fill="none" stroke="var(--color-copper-bright)" strokeOpacity="0.65" strokeWidth="3" strokeLinecap="round" />
      <path d="M5.572 4.34A10 10 0 0 1 12 2" fill="none" stroke="var(--color-fg)" strokeOpacity="0.9" strokeWidth="3" strokeLinecap="round" />
      {/* the star, at the top of the circle */}
      <path d={SPARKLE} transform="translate(7.7 -2.3) scale(0.36)" fill="var(--color-fg)" />
    </svg>
  );
}
