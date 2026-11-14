# The challenge, and how Version 1 answers it

NASA Space Apps Challenge 2026. This page records what the challenge actually
asks for, maps each ask onto what Version 1 ships, and states plainly where
the two diverge so the team can decide what to put in front of the judges.

## 1. Official challenge statement

**Title:** *Identify Earth Locations that Analog the Permanent Moon Base
Locations and Mars*

**Statement, verbatim:**

> Selecting future landing sites and lunar base locations depends on many
> factors, including topography, geology, environment, and available
> resources, to name a few. Places on Earth that have analogous
> characteristics to the Moon or Mars – the Atacama Desert, Haughton Crater,
> Death Valley – allow mission teams to test equipment and methods before they
> fly; however, such terrestrial analog sites are not entirely well
> characterized. Your challenge is to use open Earth, Moon, and Mars data from
> NASA and other space agencies to identify and characterize new terrestrial
> analogs for future bases or landing sites, drawing on deserts, polar
> regions, volcanic and arid terrains, caves, and other environments that
> share conditions with the lunar or Martian surface.

**Source:** https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/

The official page is client-rendered, so the verbatim text above was read from
the Rohnert Park local-event page, which reproduces it:
https://edeon.sonoma.edu/nasaspaceapps-26/ (read 2026-11-14).

## 2. What the statement asks for

Read closely, the statement has four parts:

| # | Ask | Where it sits in the text |
|---|---|---|
| A | Use **open Earth, Moon and Mars data** from NASA and other agencies | "use open Earth, Moon, and Mars data from NASA and other space agencies" |
| B | **Identify** terrestrial analogs, including **new** ones | "identify ... new terrestrial analogs" |
| C | **Characterize** them, because existing analog sites "are not entirely well characterized" | "identify and characterize" |
| D | Cover a **range of environments**: deserts, polar regions, volcanic and arid terrains, caves | the closing list |

The three named examples (Atacama Desert, Haughton Crater, Death Valley) are
all in V1's Earth candidate list (`backend/data/earth/candidates.json`:
`atacama_yungay`, `haughton_crater`, `death_valley`).

The **core deliverable is on the Earth side**: finding and describing Earth
places that stand in for the Moon or Mars. The Moon and Mars are the reference
targets; landing-site selection on them is context ("Selecting future landing
sites ... depends on many factors"), not the thing being asked for.

## 3. How Version 1 maps onto the asks

| Challenge ask | V1 feature | Status |
|---|---|---|
| A. Open Mars data | MOLA MEGDR 16 ppd topography (NASA PDS), Viking MDIM 2.1 mosaic (NASA Trek), agency landing-site pages, 7 peer-reviewed papers | Done; see [DATA_SOURCES.md](DATA_SOURCES.md) |
| A. Open Earth data | Copernicus DEM GLO-90 (ESA, via AWS Open Data), NASA POWER climatology, 4 peer-reviewed papers, NASA analog-programme pages | Done |
| A. Open Moon data | None | **Not in V1.** Moon is a Version 2 item ([ROADMAP.md](ROADMAP.md)) |
| B. Identify analogs | `POST /analogs/match`: ranks 7 curated Earth candidates against a chosen Mars site by a documented distance over harmonised features | Done for the **curated** list |
| B. Identify **new** analogs | None. The 7 candidates are established sites chosen from the literature and NASA analog programmes | **Not in V1.** Discovery over continuous Earth data (EMIT, SRTM, HLS) is Version 2 |
| C. Characterize analogs | Each Earth candidate has a 17-feature environmental profile with units, provenance, footprint, resolution and quality flags, computed by the same code and at the same ~3.7 km baseline as the Mars sites (the 90 m DEM is block-averaged with separate N-S and E-W factors, so the cell is ~3.7 km in both directions even at 78 S); every profile passes `scripts/validate_profiles.py` | Done; this is V1's strongest answer to the challenge |
| D. Range of environments | Hyperarid desert (Atacama), polar desert (McMurdo Dry Valleys, Haughton), arid basin (Death Valley), volcanic (Holuhraun, Mauna Kea), sedimentary badlands (MDRS) | Partly done: no cave, no dune field, no Moon-oriented site |
| (Context) Landing-site factors on Mars | 8 Mars sites with profiles; `POST /scoring/evaluate` with adjustable mission priorities, hard constraints and ranking | Done; useful framing, but not the deliverable the statement asks for |
| (Implied) Explain the reasoning | `POST /research/explain`: BM25 retrieval over a committed corpus of 36 public documents (311 chunks: agency site pages, the MOLA label and archive text, analog-programme pages, Crossref records for all 11 DOIs), citations restricted to retrieved chunks, an Anthropic LLM path with citation and numeric guards, and a deterministic fallback | Done on the deterministic path (retrieval `ok`, 6 evidence chunks on the Jezero example); the live LLM call has not yet been exercised |

## 4. The honest gap

The team's engineering prompt is organised around a **Mars globe and a
landing-suitability score**. The official challenge is organised around
**Earth analogs**. V1 ships both, but the weighting is inverted relative to
what judges will be grading against:

- The suitability engine, the sliders, the ranking and the chart work are the
  largest part of the V1 build, and they answer a question the statement only
  uses as context.
- The analog engine and the Earth-side characterisation are smaller in code
  but are the direct answer to asks B and C, and the harmonised-baseline
  method behind them (Earth 90 m DEM block-averaged, per axis, to the MOLA
  cell size before slope and roughness are computed, so both planets are
  measured the same way) is the one genuinely methodological contribution V1
  makes.
- Nothing in V1 **discovers** a new analog. Ask B's word "new" is unanswered.
- Nothing in V1 touches the Moon.

## 5. Recommendation for the demo and the write-up

1. **Lead with the Earth-analog comparison.** Open on a Mars site, go straight
   to Compare, and show the ranked Earth candidates with their feature
   distances, shared characteristics and the non-comparable disclosures
   (pressure, gravity, radiation, temperature, elevation datum). This is the
   challenge's deliverable.
2. **Make the harmonised-baseline methodology the thesis.** Say in one
   sentence why comparing a 90 m Earth DEM against a 3.7 km Mars grid without
   harmonising would be meaningless, and show that the same `terrain_stats`
   function in `backend/scripts/geo.py` produced both sides. Point at the
   `regional_scale_only` quality flag and the `spatial_resolution` string on
   every terrain metric (on Earth it reads, for example, `~3.7 km (N-S) x
   3.7 km (E-W) cells (DEM block-averaged 40x53); 45 cells` at Haughton).
3. **Present the globe as the entry point, not the thesis.** It is how a user
   picks a Mars reference site. The suitability score is a secondary feature
   that shows the team can also reason about the Mars side; keep it to one
   slider demonstration.
4. **Say what is missing, in the app and in the pitch.** Missing Mars
   features are `null` and listed; the Moon and analog *discovery* are
   roadmap items. Judges reward honesty about scope more than they penalise
   it.
5. **Reframe the written submission around asks B and C.** "We characterised
   seven established analog sites with a reproducible, provenance-tracked
   pipeline and built the comparison method that a discovery pass would use",
   rather than "we built a Mars landing-site tool".

## 6. Action item: the official Resources tab

The challenge page's **Resources** tab could not be read programmatically on
2026-11-14 (client-rendered; the GraphQL API probe was not permitted). Nobody
on the team has yet reconciled V1's data choices against the datasets NASA
actually lists there.

**Someone must open https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/
in a browser, read the Resources tab, and record every listed dataset in
[DATA_SOURCES.md](DATA_SOURCES.md)** as used, deferred, or not applicable.
Judges may check whether the suggested resources were considered.

## 7. Unofficial suggested datasets

A community resource list (not NASA's, not official) at
https://spacedata.swapniltamse.com/challenges/earth-analogs-moon-mars/
suggests the following. None was used in V1, either because it requires an
Earthdata Login or because of weekend time. They are recorded here as
Version 2 candidates only.

| Dataset | Suggested use | Access | Why not in V1 |
|---|---|---|---|
| EMIT L2B Surface Mineral Identification (EMITL2BMIN), NASA LP DAAC | Earth surface mineralogy for compositional matching | Earthdata Login | login |
| SRTM GL1 30 m | Finer Earth topography than GLO-90 | Earthdata Login | login; GLO-90 already met the harmonised 3.7 km baseline |
| HLS L30 (Harmonized Landsat Sentinel-2) | Earth surface reflectance / vegetation screening for analog discovery | Earthdata Login | login |
| CRISM MTRDR via PDS Geosciences ODE, https://ode.rsl.wustl.edu/mars/ | Mars surface mineralogy to replace literature tags | No login | time |
| Mars Trek WMTS layers, incl. `CTX_beta01_uncontrolled_5m_Caltech` and `Mars_MGS_MOLA_ClrShade_merge_global_463m` | Higher-resolution imagery; MOLA shaded relief as an alternative globe texture | No login, CORS | time; the MOLA shade layer is already wired as an option in `scripts/fetch_mars_texture.py` but not fetched |
| LRO Diviner temperature maps | Lunar thermal environment | Not checked | Moon is out of V1 scope |

## 8. Related documents

- [DATA_SOURCES.md](DATA_SOURCES.md): every dataset used, with provenance.
- [SCIENTIFIC_METHOD.md](SCIENTIFIC_METHOD.md): the formulas and their assumptions.
- [ROADMAP.md](ROADMAP.md): V1 acceptance criteria and the Version 2 plan.
- [TEAM_WORKSTREAMS.md](TEAM_WORKSTREAMS.md): who owns what.
