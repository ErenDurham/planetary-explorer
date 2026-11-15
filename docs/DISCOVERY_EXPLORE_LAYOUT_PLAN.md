# Plan: make Find Earth Analogs use the Browse Regions layout

Status: proposal, 2026-11-15. Nothing here is built yet. Scope is frontend only;
every value shown comes from discovery-v1 as it exists today (checked against
the live Morocco run). Where the contract does not carry something, this plan
says so and leaves it out rather than inventing it.

## 1. What Browse Regions does that Find Earth Analogs does not

Browse Regions is a three-column working view (`App.tsx` grid):

| column | width | component | role |
|---|---|---|---|
| left | 250px | `candidatePane` (ranked list) | pick a site |
| centre | flexible | `ExploreView` with the `PlanetViewer` globe | see it on the planet; globe / orbital / surface toggle |
| right | resizable `SitePanelShell` (280–520px) | `RightSidebar` | every fact about the selected site, scrolled to top on each selection |

Selection is one store write (`selectLocation`) that moves the list highlight,
flies the globe camera (`selectionRevision` → `focusToken`), and refills the
right pane.

Find Earth Analogs (`features/discovery/DiscoveryView.tsx`) is a single
full-width scrolling page: hero stats, a schematic survey map or a small globe,
candidate cards on the right, the selected candidate's detail *below* the
grid, and Method & Data in a `<details>` at the bottom. The only shared UI is
the mode switch. There is no persistent right pane, the globe is an optional
toggle, and justification for a candidate is split across three places.

## 2. Target layout

Same grid, discovery content in each cell. `App.tsx` stops special-casing
`findAnalogs` as full-width and instead supplies discovery components to the
three slots. The AstroPanel inset and the mobile candidate `<select>` bar come
back for this mode as well.

```
┌───────────┬──────────────────────────────────┬────────────────────────┐
│ Candidate │  Explore · Find Earth Analogs     │  Candidate details     │
│ list      │  [Browse Regions | Find Analogs]  │  (SitePanelShell)      │
│           │  Reference Jezero · Area searched │                        │
│ 1  68.5   │  · 16 evaluated · 4 presented     │  §A Identity & status  │
│ 2  60.8   │  [Globe | Survey map]  Weights ▾  │  §B Match to Jezero    │
│ 3  55.6   │                                   │  §C How it was measured│
│ 4  54.5   │        ● Earth globe              │  §D Relation to known  │
│           │        survey box, footprints,    │     analogs            │
│ Weights ▾ │        sampling dots, established │  §E Not compared       │
│ Survey ▾  │        analog crosses             │  §F Sources            │
│ Export    │                                   │  §G Limits & next steps│
└───────────┴──────────────────────────────────┴────────────────────────┘
```

### Left column — `DiscoveryCandidateList` (replaces the right-hand cards)
Mirrors `AnalogRankedList`. Header: "Candidates · 4 presented of 16
evaluated" (`returned_count`, `survey.generated_count`). One row per
candidate: rank badge coloured by `rankColor(display_rank)` (same palette as
the globe), coordinates formatted as `31.875°N, 2.125°W` (the server name
"Survey footprint 31.875 N, -2.125 E" is kept as a secondary line, not the
headline), `similarity_index` to one decimal with "/100 index", a novelty chip
("outside catalog buffer" / "near <site>"), and a `research_status` dot.
Below the rows, collapsibles already built: `WeightControls`, `SurveyPicker`
(only when more than one run), `ExportPanel`.

### Centre — `DiscoveryStage` inside the existing `ExploreView` chrome
Keep `ExploreView`'s header (mode switch, stage sentence, Edit mission link)
and swap the view toggle to **Globe | Survey map** (orbital/surface are
dropped here: candidates have no imagery in the contract and showing none is
the honest state). Second bar carries the survey facts that are currently the
hero: reference, area searched with bounds and extent, counts, footprint and
cell size. These stay bound to `survey.*` exactly as `DiscoveryView` binds
them now.

Globe is `PlanetViewer` with `EARTH_CONFIG`, plus three things it cannot draw
today (new `components/globe/SurfaceOverlays.tsx`, see §4):
- the survey bounds as a dashed rectangle (`survey.bounds`),
- every `sampling_centres` point as a small neutral dot, so the sixteen
  evaluated locations are visible and the four presented ones read as a
  selection from them,
- each candidate's `footprint_geojson` ring as a filled outline in its rank
  colour, with the existing centre marker on top.
Established catalog sites stay as the `established:*` browse markers
`DiscoveryGlobe` already adds. Clicking one does not select it (same as now)
but shows its name on hover, so "near Ibn Battuta" has a place on the map.

Fly-to: a 60 km footprint is about half a degree on Earth and is invisible at
the current focus distance (`radius × 1.65`, minimum `radius × 1.35`). Add an
optional `focusDistance` prop to `PlanetViewer`; discovery passes something
near `radius × 1.08` and lowers `minDistance` to match while in this mode. The
Survey map stays available as the footprint-scale view.

### Right column — `DiscoveryCandidatePanel` inside `SitePanelShell`
Header "Candidate details". Same scroll-to-top-and-highlight behaviour as
`RightSidebar`, keyed on the discovery selection revision. Sections in §3.

Empty state (nothing selected) is **not** blank: it shows the survey overview
that currently lives in the hero and in Method & Data: the four `Fact` cards,
`SurveyFunnel`, the formula explainer with `criteria` scales, `ReferenceCard`
(Jezero with its verified orbital image), and the limitations list. That is
the same move Browse makes when no site is selected.

### State
Selection stays in `useDiscoveryStore` (per-run `selectedCandidateId`), never
in `selectedEarthId`, so Browse's Earth selection is untouched. Add a
`selectionRevision` counter to the discovery store and pass it as the globe's
`focusToken`. Globe `onSelect(id)` writes the discovery store; `onDeselect`
clears it. Both lists and the panel read the same id.

## 3. What the right pane shows, and why each item is there

The purpose of the pane is to let someone decide whether a candidate is worth
a field visit, without ever reading it as a confirmed analog. Every item below
names its source field; nothing is shown that the contract does not carry.
Score and factor values come from the **rank response** candidate (the detail
endpoint returns the immutable row with `similarity_index` null and
`feature_distances` empty); measurement inputs, grid provenance and field
validation come from the **detail** endpoint; the dossier is loaded lazily for
§G.

### §A Identity and status
- Rank `display_rank` of `returned_count`, coordinates, the server `name`.
- `PROPOSED_LABEL` badge, always: "Proposed terrain analog candidate; field
  validation required."
- `research_status` and `novelty.review_status` ("desktop reviewed").
- `terrain_valid_fraction` as "terrain data complete" when 1.0, otherwise the
  percentage, with `screening_reasons` listed when non-empty.

### §B Match to Jezero Crater — the core justification
- `similarity_index` large, with the fixed sentence that it is a two-feature
  heuristic index, not a probability or a suitability score (from
  `limitations`).
- The weights actually used: `effective_weights` × 100 per feature.
- A factor table from `feature_distances`, one row per feature, sorted by
  `contribution` descending:

  | feature (`criteria.label`) | here (`earth_value`) | Jezero (`mars_value`) | unit | scale | weight | distance | share of total |

  with a bar for `contribution / distance`. This is the whole scoring
  arithmetic made visible: a reader can recompute
  `100 / (1 + Σ contribution)` from the row values. The existing
  `similarityReasons` sentences ("regional slope is close: 0.56° here against
  0.99° at Jezero"; "the larger difference is relief: 117 m against 181 m")
  sit above the table as the plain-language reading.
- "Changing the weights changes this ranking" with a link that opens
  `WeightControls` in the left column.

### §C How it was measured
From `detail.profile`:
- `measurements[*].value / unit`, each marked `derived`.
- Grid: `grid.cell_m`, `grid.footprint_m`, `grid.shape` ("15 × 15 cells of
  4 km inside a 60 km footprint"), `grid.aggregation`,
  `grid.projection_limit`, `terrain_valid_fraction`,
  `gradient_valid_fraction`, `support_mean` / `support_min`.
- One line from `survey.footprint_specification` and
  `survey.grid_specification` (`no_nodata_fill`, projection) so the reader
  knows no gaps were filled.
This is what lets a reviewer judge whether the two numbers in §B mean
anything at the scale they care about, and it is the honest answer to "4 km
cells do not resolve rover hazards".

### §D Relation to known analogs
From `novelty`:
- `outside_catalog_buffer` as the headline, worded by `noveltyRelation`
  (never "novel"): "Outside the 100 km catalog buffer. Nearest catalogued site:
  Ibn Battuta (Marrakech), 556 km away."
- `buffer_rule` verbatim, `catalog_version`, and the fixed limitation that
  outside the buffer does not mean unknown to science.
- A "show on globe" action for the nearest site if its id resolves in the
  Earth catalog the globe already draws. The discovery catalog
  (`known-analogs-v1.0`) and the comparison catalog are different lists, so
  this is conditional and hidden when the id does not resolve.

### §E What was not compared
From `context` plus `missingFactors`:
- Climate: shown as **context, not a score input**, with the scope line the
  server sends ("single survey-centre context") and its coarseness
  (`resolution` 0.5° × 0.625°, centre `lat/lon_east`): `air_temperature_c`,
  `precipitation_mm_day`, source NASA POWER with `header.range`.
- Land cover: "not available" when `land_cover` is null (it is, today).
- Geology and materials: `geology_status` "not assessed".
This section is what stops the index being over-read. It should be visible
without expanding anything.

### §F Sources and provenance
`sources` deduplicated by `title` + `institution`, with the count of tiles
("Copernicus GLO-90, 4 tiles"), `observation_period` (the 2011–2015
acquisition caveat matters: it is a surface model, not current land cover),
`license`, `retrieved_at`, and a truncated `sha256` with copy. Then
`survey.dataset_versions` (catalog, earth, mars) and the export link.

### §G Limitations and next steps
- `limitations` (the six fixed sentences) in full, not summarised.
- `proposed_field_validation` as a checklist (three items today).
- Research: lazily fetch the dossier (`GET …/research`). Show
  `record.status`, `retrieval_status`, the count of `research_questions` and
  `search_tasks`, and a primary button "Open in Research Prospects" that
  routes to the Research tab for this candidate, which is where the dossier
  is already rendered. Do not duplicate the dossier here.

### Deliberately absent
- Any Earth imagery for a candidate: the contract has none. The panel says
  "No imagery is attached to proposed candidates" rather than showing a tile.
- Any probability, confidence, or suitability wording.
- Any comparison with the curated five-feature analog scores (the server
  forbids it in `limitations`; `SEPARATE_SCORES_NOTE` already exists).
- Place names, elevation profiles, histograms, or access notes: not in the
  contract. See §5 for what to ask Codex for.

## 4. Work plan

1. **Layout plumbing** (`App.tsx`, `ExploreView.tsx`, new
   `features/discovery/components/{DiscoveryCandidateList,DiscoveryStage,DiscoveryCandidatePanel,DiscoverySurveyPanel}.tsx`).
   Split `DiscoveryView` into the three slots; keep every existing data
   binding, copy helper and error/unavailable state. `DiscoveryView` becomes
   a thin composition or is removed.
2. **Globe overlays** (`components/globe/SurfaceOverlays.tsx`, `PlanetViewer`
   props `overlays?` and `focusDistance?`). Rings projected with
   `markerPosition` at `radius × 1.002`; survey bounds as a dashed ring; dots
   as instanced points. Rank colours from `analogMarkerAppearance`. Respect
   `prefers-reduced-motion` as the camera already does.
3. **Right pane content** per §3, reusing `Section`, `Badge`, `BulletList`,
   `SourcesList`-style primitives from `components/sites`, and the existing
   `copy.ts` helpers. Add `lib/copy.ts` helpers only for the factor table
   formatting.
4. **Selection revision** in `useDiscoveryStore`; wire list, globe and panel.
5. **Tests** (vitest/jsdom): three-column render in find_analogs mode;
   selecting from the list fills the panel and bumps the focus token; globe
   `onSelect` does the same; empty state shows the survey overview; every §3
   section renders from a fixture rank + detail pair and hides itself when
   its field is null (climate null, profile null, empty feature_distances);
   no section renders a value the fixture does not carry. Keep the existing
   discovery tests green.
6. **Verification**: typecheck, full suite, build, then the headless Chrome
   walk against the live backend: Explore → Find Earth Analogs → click
   candidate 1 on the globe → panel shows 68.5, slope 0.56° vs 0.99°, relief
   117 m vs 181 m, "outside catalog buffer", climate as context, six
   limitations; Survey map toggle still works; Browse Regions unchanged.
7. **Docs**: fold the result into `docs/DISCOVERY_UI.md`.

Order matters: 1 and 4 first so the page works with the existing small globe,
then 2, then 3. Each step is a separate commit.

## 5. Gaps worth raising with Codex (contract asks, not frontend work)

These would strengthen the justification and cannot be derived in the
browser:
- A named locality or nearest town per candidate (reverse geocode at survey
  time, with a source), so a row can read as somewhere rather than a pair of
  coordinates.
- `land_cover` populated (the export manifest already mentions WorldCover as
  optional), so §E can say what is on the ground instead of "not available".
- Per-footprint distribution of slope and relief (quantiles or a small
  histogram over the 15 × 15 cells), so §C can show spread and not only a
  median; this is the single biggest upgrade to "why trust this number".
- The reference profile on the rank response, not only on the export, so the
  Jezero column in §B does not depend on `feature_distances` being present.
- `nearest_known_site_id` resolvable to a catalog entry with coordinates and
  a display name.
