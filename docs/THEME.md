# Theme: one place to edit the look

`frontend/src/theme.css` holds every colour, font and radius the interface uses. Tailwind reads the
`@theme` block, so utilities such as `bg-bg`, `text-fg-muted`, `border-line-strong`, `text-copper-bright`
and `bg-canvas` all resolve to those tokens, and plain CSS can use `var(--color-…)` directly. Changing a
value there changes the whole app: Mission Design, Explore (both modes), Analyze, Compare, Research and the
Expedition Planner.

The palette is the atlas look that first shipped on Compare and Research (warm near-black surfaces, soft
off-white type, copper accent, Manrope for text, IBM Plex Mono for numbers). `components/atlas/` no longer
carries its own palette or font import; it only contributes layout.

## Pane styles

`frontend/src/theme/panes.css` holds the per-pane rules that hang off `data-pane` attributes
(`navigation`, `mission`, `mission-objective`, `explore`, `site`, `analysis`). The Mission Design
composer lives there: the lede, the objective box and its copper focus ring, the example pills, the
applied-objective card, the next-step card and the scoring-priorities disclosure, with a phone block
for widths under 640 px. All of it reads the tokens above; nothing in it is a literal colour.

## Where literal colours are still needed

Recharts presentation attributes and three.js colours cannot take a CSS variable, so they read the same
tokens through `src/lib/theme.ts`:

```ts
import { token } from "@/lib/theme";
token("--color-copper-bright"); // "#f0a03c" from the stylesheet, or the shipped fallback in tests
```

`components/charts/theme.ts`, the priority-factor colours in `lib/objective.ts`, and the globe canvas use it.

## What is deliberately not a theme token

Colours that encode data are kept out of the theme so the chrome can change without changing meaning:

- the rank scale, ROYGBIV or single hue (`lib/rankColor.ts`);
- the landing-score scale and marker statuses (`components/globe/colors.ts`);
- route risk classes (`features/expedition/lib/risk.ts`);
- the Earth and Mars body colours (`components/imagery/assetUrl.ts`, atlas planet dots).

## Editing

1. Change the value in `theme.css`.
2. If you add a token, add its fallback to `FALLBACK` in `src/lib/theme.ts` so tests and charts agree.
3. Run `npm run typecheck && npx vitest run && npm run build` from `frontend/`.
