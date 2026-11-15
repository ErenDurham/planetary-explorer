# App theme

One document-wide `ThemeProvider` is mounted in `main.tsx`. Its default is
`APP_THEME` in `config.ts`; change `atlas` to `observatory` to switch presets.
A future preference control can render `<ThemeProvider theme={name}>` directly.
There is no theme state in the scientific store and no storage side effects.

- `../theme.css`: canonical semantic color and font roles, including Tailwind's existing
  `bg-bg`, `text-fg`, `border-line`, status and action tokens. Add a named palette
  with `:root[data-app-theme="name"]` and add its name to `THEME_NAMES`.
- `geometry.css`: shared radius, spacing and editorial type roles.
- `panes.css`: shared pane treatments through explicit `data-pane` hooks.
- `components/atlas/atlas.module.css`: feature-specific composition, using the
  shared tokens rather than declaring its own theme.
- Fonts are loaded once in `index.html`. Change that font URL when adding a
  different font family in `theme.css`.

The provider sets a document attribute without inserting a DOM wrapper. This
keeps workspace sizing intact and includes tooltips/dialogs portaled into body.
Unmounting restores the previous attribute; use one provider per document.

Do not put ROYGBIV ranks, criterion colors, scientific status meanings, map
textures or source imagery in decorative presets. Those retain their own
semantics. Charts that explicitly set SVG colors must continue to use their
existing scientific palette; theme tokens style the surrounding chrome.

Feature authors can opt a root into pane styling with `data-pane="analysis"`,
`mission`, `mission-objective`, `explore`, `site`, or `navigation`. All layout,
selection, API, scoring and route computation logic remains in its feature.
