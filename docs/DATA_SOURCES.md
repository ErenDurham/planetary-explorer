# Data sources

Every number the application serves traces to one of the sources on this
page. In the data files each measurement carries a `source_id` that resolves
to a `Provenance` record in the profile's `sources` map
(`backend/app/models/common.py`); this page is the human-readable version of
those records plus the detail the JSON does not hold.

Dates: all downloads and checks recorded here were made on **2026-11-14**.
"Verified reachable" means an unauthenticated HTTPS request succeeded on that
day; it is not a guarantee about any other day, which is why the processed
outputs are committed and the app never fetches at request time
([ARCHITECTURE.md](ARCHITECTURE.md), principle 2).

Contents

1. [Mars topography: MOLA MEGDR 16 ppd](#1-mars-topography-mola-megdr-16-ppd)
2. [Earth topography: Copernicus DEM GLO-90](#2-earth-topography-copernicus-dem-glo-90)
3. [Earth climate: NASA POWER climatology](#3-earth-climate-nasa-power-climatology)
4. [Mars globe texture: NASA Trek Viking MDIM 2.1](#4-mars-globe-texture-nasa-solar-system-treks-viking-mdim-21)
5. [Derived: top-of-atmosphere insolation](#5-derived-top-of-atmosphere-insolation-model)
6. [Agency web pages (coordinates, heritage, analog programmes)](#6-agency-web-pages)
7. [Peer-reviewed literature (DOIs)](#7-peer-reviewed-literature)
8. [Not used in V1, and why](#8-not-used-in-v1-and-why)
9. [Data marked missing in V1](#9-data-marked-missing-in-v1)
10. [Scientific document corpus](#10-scientific-document-corpus)
11. [Demonstration fixtures](#11-demonstration-fixtures)
12. [Licence and attribution summary](#12-licence-and-attribution-summary)

---

## 1. Mars topography: MOLA MEGDR 16 ppd

`source_id`: `mola_megdr_16ppd`

| Field | Value |
|---|---|
| Institution | NASA PDS Geosciences Node (Washington University in St. Louis), hosting the product of the MOLA Science Team, Goddard Space Flight Center (producer: David E. Smith) |
| Original URL | https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/ (files `megt90n000eb.img`, `megt90n000eb.lbl`) |
| Instrument | Mars Global Surveyor / Mars Orbiter Laser Altimeter (MOLA) |
| Dataset / product | `MGS-M-MOLA-5-MEGDR-L3-V1.0`, product `MEGT90N000EB.IMG`, `PRODUCT_VERSION_ID` 2.0, created 2003-04-03 |
| What it is | Mission Experiment Gridded Data Record: a global grid of **median** MOLA topography per 0.0625 x 0.0625 degree bin, built from the MOLA PEDRs (nearly 600,000,000 nadir observations) |
| Coverage | Global, 90 N to 90 S, 0 to 360 E |
| Projection / CRS | Simple cylindrical; IAU2000 reference; body-fixed rotating **planetocentric** coordinates; `POSITIVE_LONGITUDE_DIRECTION = EAST`; `CENTER_LONGITUDE 180`, so grid column 0 is at 0 E (the label's `WESTERNMOST_LONGITUDE` is 0) |
| Vertical datum | Areoid from the Goddard Mars potential model GMM3 (`mgm1025`) evaluated to degree and order 50. Topography = planetary radius minus areoid radius |
| Reference radius | `A_AXIS_RADIUS = B = C = 3396.0 km` |
| Resolution | 16 pixels per degree (`MAP_RESOLUTION 16.0`), `MAP_SCALE 3.705 km/pixel` at the equator; grid is 5760 samples x 2880 lines |
| Sample format | `MSB_INTEGER`, 16 bit (big-endian signed int16), `UNIT = METER`, fixed-length records of 11,520 bytes; file size 33,177,600 bytes |
| Stated extremes | minimum -8177 m, maximum 21171 m (asserted by `build_mars_profiles.py` on load) |
| Observation period | `START_TIME 1997-09-15T19:10:00`, `STOP_TIME 2001-06-30T11:10:40`; orbits 3 to 20333 (MGS mapping, primary and extended missions) |
| Quality limitations (from the label) | Each cell is the **median** of the shots inside it; where no shot fell in a cell **an interpolated value is supplied**. Because of the polar orbit, shot density is lowest near the equator, where about **55% of bins contain at least one shot**; gaps of **up to 12 km** exist between profiles. Shots more than 1.2 degrees off-nadir, channel 4 returns and non-ground returns (clouds, noise) were excluded; orbits were adjusted by a first-order crossover solution. |
| Quality limitations (project) | Any slope or roughness derived from this grid is a **regional** statistic at a ~3.7 km baseline and says nothing about metre-scale landing hazards. Every derived measurement carries `quality_flag: regional_scale_only` and says so in `notes`. The profile's `uncertainty_notes` also give the radial (vertical) shot accuracy as "of order 1 m after crossover adjustment", attributed to **Smith et al. (2001)**, *Mars Orbiter Laser Altimeter: Experiment summary after the first year of global mapping of Mars*, J. Geophys. Res. 106(E10), https://doi.org/10.1029/2000JE001364 (validated against Crossref). The note says explicitly that this figure is **not stated in the product label**; it is a literature value, and the profile labels it as such. |
| Extraction | `backend/scripts/fetch_mola.py` downloads both files over HTTPS, checks the `.img` is exactly 33,177,600 bytes, and writes `backend/data/raw/megt90n000eb.sha256` (`d18d9b9ab8c5516d02e157dd2cde0f1d0d160c21940e953ba22391269a545e7b`). `backend/scripts/build_mars_profiles.py` reads the grid with `numpy.fromfile(dtype=">i2")`, reshapes to 2880 x 5760, asserts the extremes, samples a 1.0 degree square around each site (`window()`: floor/ceil edges, so **17 x 17 = 289 cells**; longitude wraps modulo 5760, latitude clipped; `sites.json`'s `footprint_definition` and every measurement's footprint `description` say "17x17 MOLA 16 ppd cells (floor/ceil edges)") and computes the statistics in [SCIENTIFIC_METHOD.md](SCIENTIFIC_METHOD.md#3-derived-terrain-statistics). The `.img` is gitignored; the `.lbl` and the sha256 are committed. |
| Why 16 ppd and not 128 ppd | The 128 ppd product is ~2 GB in tiles and needs hours of download; 16 ppd is sufficient for the regional footprint statistics this project claims, and the limitation is recorded on every derived value (`fetch_mola.py` docstring). |
| Sanity checks (2026-11-14) | Single-cell values read at landmark coordinates: Olympus Mons 20046 m, Hellas -6072 m, Jezero -2628 m, Gale -4509 m, InSight -2595 m. `build_mars_profiles.py` asserts Olympus Mons > 15000 m and Hellas < -5000 m on every run. (A footprint **median** differs from the single cell at the centre; Jezero's footprint median is -2129 m.) |
| Licence / attribution | NASA PDS data are public domain. Cite the MGS MOLA Science Team; the label names the producer and institution above. |
| Retrieved | 2026-11-14 |

Verified reachable without login on 2026-11-14.

## 2. Earth topography: Copernicus DEM GLO-90

`source_id`: `copernicus_glo90`

| Field | Value |
|---|---|
| Institution | ESA / Airbus / Copernicus Programme; accessed through the **AWS Open Data** mirror |
| Original URL | https://registry.opendata.aws/copernicus-dem/ (bucket `copernicus-dem-90m`) |
| Tile URL pattern used | `https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM/Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM.tif`, e.g. `N36_00_W117_00` |
| Instrument / model | TanDEM-X derived digital **surface** model (DSM), so it includes vegetation and buildings where present |
| Dataset id | `copernicus-dem-90m` (GLO-90) |
| Coverage | Global, 1 x 1 degree Cloud-Optimised GeoTIFF tiles; includes Antarctica (the McMurdo Dry Valleys candidate at 77.86 S was read successfully) |
| CRS | WGS84 geographic (EPSG:4326), east-positive longitude |
| Vertical datum | Metres above the **EGM2008** geoid. **Not comparable** with Mars areoid elevations; the analog engine discloses this and never differences absolute elevations between planets |
| Resolution | 3 arc-second latitude spacing (**92.66 m**, recorded as "93 m (N-S)" in the profiles). **Longitude spacing is coarser at high latitude**: GLO-90 tiles are 1.5x coarser E-W at 50-60 degrees, 2x at 60-70 and 3x at 70-80 (`read_dem()` docstring). The profiles record both pixel sizes in every fine-scale `spatial_resolution` string, e.g. `93 m (N-S) x 85 m (E-W) pixels; 360000 pixels` at Atacama (600 x 600), `93 m (N-S) x 79 m (E-W) pixels; 180000 pixels` at Holuhraun (64.85 N, 600 x 300), `93 m (N-S) x 70 m (E-W) pixels; 120000 pixels` at Haughton (75.38 N, 600 x 200) and `93 m (N-S) x 58 m (E-W) pixels; 120000 pixels` at McMurdo (77.86 S, 600 x 200) |
| Units | metres |
| Observation period | 2011 to 2015 acquisitions (TanDEM-X mission data; stated in `candidates.json`) |
| Quality limitations | The profile records "absolute vertical accuracy < 4 m (90% linear error)" as stated in `candidates.json`/`build_earth_profiles.py`; the DSM includes vegetation and buildings. Nodata pixels are replaced with the footprint's median before statistics; every V1 footprint reported a nodata fraction of 0.000 (the figure is written into each profile's `pipeline` string). |
| **Per-axis harmonisation** | `read_dem()` returns both pixel sizes, `ds.res[0]` (longitude) and `ds.res[1]` (latitude), and `build()` converts each to metres on the ground (the longitude size times cos(latitude)). The fine slope gradient uses the two true spacings, and the block factors to the MOLA cell size are computed **separately per axis**: `fy = round(3705 m / N-S pixel)`, `fx = round(3705 m / E-W pixel)`, applied by `geo.block_average_xy()`. The harmonised cell is therefore ~3.7 km in **both** directions at every latitude, and every harmonised `spatial_resolution` string records it, e.g. `~3.7 km (N-S) x 3.7 km (E-W) cells (DEM block-averaged 40x53); 45 cells` at Haughton. The factors stored in each profile's `pipeline` string (rows x cols) are: Atacama 40x44, McMurdo 40x63, Haughton 40x53, Death Valley 40x50, Holuhraun 40x47, MDRS 40x51, Mauna Kea 40x42. An earlier build assumed square pixels in degrees and over-estimated the high-latitude slopes; the committed `candidate_profiles.v1.json` (generated 2026-11-14T16:19:15Z) is the rebuilt output. |
| Extraction | `backend/scripts/build_earth_profiles.py`: `rasterio` windowed read over HTTPS of the 1 to 4 tiles the footprint touches (`read_dem()`), mosaicked north-first; fine statistics on the 90 m grid; `block_average_xy()` by the per-axis factors above to the MOLA cell size, then the same `terrain_stats()` as Mars. |
| Licence / attribution | Free for any use under the Copernicus DEM licence; **attribution required** ("produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA" is the form the programme requests; the team should confirm the current wording on the AWS registry page before publishing). |
| Retrieved | 2026-11-14 |

Verified reachable without login on 2026-11-14.

## 3. Earth climate: NASA POWER climatology

`source_id`: `nasa_power`

| Field | Value |
|---|---|
| Institution | NASA Langley Research Center, Prediction Of Worldwide Energy Resources (POWER) project |
| Original URL | https://power.larc.nasa.gov/ |
| Endpoint used | `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MIN,T2M_MAX,ALLSKY_SFC_SW_DWN,PRECTOTCORR&community=RE&longitude={lon}&latitude={lat}&format=JSON` |
| Model / inputs | MERRA-2 reanalysis (meteorology) and CERES/FLASHFlux (solar) |
| Dataset id | POWER climatology, **API v2.10.1**, community `RE`; response title recorded in every profile: "NASA/POWER Source Native Resolution Climatology Climatologies" |
| Coverage | Global point service |
| Resolution | 0.5 x 0.625 degree grid (meteorological parameters), 1 degree grid (solar). Both are far coarser than the 0.5 degree footprint, so they describe the regional climate, not the field site's microclimate |
| Parameters and units | `T2M` 2 m air temperature, degC (annual mean `ANN` used); `T2M_MIN`, `T2M_MAX` degC (the pipeline takes the **minimum over months** of the monthly-mean minimum, and the maximum over months of the monthly-mean maximum); `ALLSKY_SFC_SW_DWN` kWh/m2/day (converted to W/m2 by x1000/24); `PRECTOTCORR` bias-corrected precipitation, mm/day |
| Observation period | Multi-decade climatology; the exact span is in the API response header, which the pipeline does not store. Record it in the next profile version. |
| Quality limitations | `measurement_type` is `estimated` (reanalysis/satellite product, not an in-situ reading). The coarse grid may not resolve valley or summit microclimates (Death Valley floor, Mauna Kea summit). `PRECTOTCORR` underestimates orographic extremes. `T2M` is **air** temperature at 2 m, not ground temperature; the profile notes say so. |
| Extraction | `power_climate()` in `backend/scripts/build_earth_profiles.py`, one request per candidate |
| Licence | Public domain (NASA) |
| Retrieved | 2026-11-14 |

Verified reachable without login on 2026-11-14.

## 4. Mars globe texture: NASA Solar System Treks, Viking MDIM 2.1

Not a `source_id` (it feeds the frontend, not a profile). Attribution file:
`frontend/public/textures/mars_viking_4k.ATTRIBUTION.txt`.

| Field | Value |
|---|---|
| Institution | NASA Solar System Treks (Mars Trek); imagery credit **NASA/JPL/USGS** |
| Capabilities URL | https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml |
| Tile URL pattern | `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{zoom}/{row}/{col}.jpg` |
| Layer | `Mars_Viking_MDIM21_ClrMosaic_global_232m`: Viking Orbiter Mars Digital Image Model 2.1, colour, 232 m/pixel at full resolution |
| Zoom used | 3: a 16 x 8 grid of 256 px tiles stitched to **4096 x 2048** px, saved as JPEG quality 88, 2,329,229 bytes |
| Projection / convention | Equirectangular; in the stitched file **column 0 is at 180 W (-180 E), row 0 at 90 N**, so u = (lon_east + 180)/360 and v = (90 - lat)/180. Note this differs from the MOLA grid, whose column 0 is at 0 E |
| Use | Visual texture only. No number in the application is read from it |
| Extraction | `backend/scripts/fetch_mars_texture.py` (also offers `--layer mola_shade` = `Mars_MGS_MOLA_ClrShade_merge_global_463m`, not fetched in V1) |
| Licence / attribution | NASA imagery; credit "NASA/JPL/USGS via NASA Solar System Treks". Served with open CORS |
| Retrieved | 2026-11-14 |

## 5. Derived: top-of-atmosphere insolation model

`source_id`: `derived_toa_insolation`

| Field | Value |
|---|---|
| Institution | Planetary Explorer pipeline, `backend/scripts/geo.py` (`toa_annual_mean_insolation_wm2`) |
| URL | [SCIENTIFIC_METHOD.md#insolation](SCIENTIFIC_METHOD.md#insolation) |
| Model | Analytic daily-mean top-of-atmosphere insolation integrated over one orbit, weighted by orbital dwell time. Solar constant **S0 = 1361 W/m2** at 1 AU. Mars: a = 1.52368 AU, e = 0.0934, obliquity 25.19 deg, Ls of perihelion 251 deg. Earth: a = 1.00000 AU, e = 0.0167, obliquity 23.44 deg, Ls of perihelion 283 deg. 720 steps in Ls |
| Coverage | Any latitude; latitude is the only input |
| Units | W/m2 |
| Check | Earth equator 415.6 W/m2 against the textbook ~417 W/m2 (`test_pipeline_geo.py`, 2% tolerance); S0/pi = 433.2 without obliquity. Mars equator 178.6 W/m2; Mars 47.67 N (Utopia) 127.8 W/m2; Mars 89.9 N 79.8 W/m2 |
| Limitations | **Model output, not a measurement.** Ignores atmospheric dust opacity (which can cut Mars surface flux by tens of percent), clouds, local horizon and slope. Dominated by heliocentric distance when compared across planets, which is why the analog spec gives it weight 0. Seasonal variation is computed internally but not exposed as a metric |
| Licence | n/a (project code, MIT) |

## 6. Agency web pages

These supply site **coordinates**, mission **heritage**, qualitative
terrain/mineralogy **tags** and the Earth candidates' **documented analog
use**. They carry no numeric measurement other than coordinates. All returned
HTTP 200 on 2026-11-14; the Mars 2020 page redirects to the URL shown.

Mars (`backend/data/mars/sites.json`):

| `source_id` | Title | Institution | URL | Used by |
|---|---|---|---|---|
| `nasa_m2020_landing_site` | Mars 2020 Perseverance Rover - Science (Jezero Crater landing site) | NASA Science / JPL | https://science.nasa.gov/mission/mars-2020-perseverance/science/ | `jezero_crater` coordinates |
| `nasa_msl_landing` | Mars Science Laboratory (Curiosity) - Gale Crater landing site | NASA Science / JPL | https://science.nasa.gov/mission/msl-curiosity/ | `gale_crater` coordinates |
| `nasa_insight` | InSight Mars Lander mission page (Elysium Planitia) | NASA Science / JPL | https://science.nasa.gov/mission/insight/ | `elysium_planitia` coordinates and composition tags |
| `esa_oxia_planum` | ExoMars Rosalind Franklin rover landing site: Oxia Planum | ESA | https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/ExoMars/Oxia_Planum_favoured_for_ExoMars_surface_mission | `oxia_planum` coordinates |
| `nasa_viking` | Viking 1 and 2 missions | NASA Science | https://science.nasa.gov/mission/viking/ | `utopia_planitia` and `chryse_planitia` coordinates; `utopia_planitia` rocky-surface label (section 7) |
| `nasa_mer` | Mars Exploration Rovers (Spirit and Opportunity) | NASA Science / JPL | https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/ | `meridiani_planum` and `gusev_crater` coordinates; plains, crater and lake labels (section 7) |

Earth (`backend/data/earth/candidates.json`): the site files cite no program web pages any more; every landform and mineral label comes from the literature in section 7. Program names (ARADS, HMP, MDRS) appear only as text in `known_analog_use`.

Coordinates convention: Mars positions are rover/lander touchdown points or
the published centre of a selected landing ellipse (`sites.json`,
`coordinate_convention`). Earth positions are the field-site centres chosen by
the team; the Mauna Kea footprint is deliberately summit-centred and its
description says the statistics describe the whole upper mountain, not only
the test sites.

## 7. Literature behind the site labels

**Single source of truth: `backend/data/site_literature.v1.json`** (verified 2026-11-15).
Every landform (`terrain_morphology`) and mineral (`mineralogy_tags`) label, every
site description and every Mars water/ice note comes from it;
`scripts/apply_site_literature.py` writes them into the site files and both
profile files (and both build scripts call it). Rules, enforced by
`tests/test_site_literature.py`:

- every source is NASA, USGS or peer-reviewed, linked through doi.org,
  ntrs.nasa.gov or nasa.gov, and published in the last 15 years (2011 or later in
  2026), the same window as the evidence registry; a live NASA mission page is
  dated by its retrieval date instead;
- every label carries a verbatim quote from its source (checked against the
  source text when written) that names the label, from a study at the site or
  its footprint region;
- labels use a controlled vocabulary so synonyms are not double counted
  (gypsum, jarosite -> `sulfates`; hematite -> `iron_oxides`; smectite,
  nontronite -> `clays`);
- a label with no such source is removed, not kept on an older or generic
  source. Utopia Planitia (Viking 2) has no recent source on its composition,
  so its mineral labels are marked missing; under the analog engine's
  common-basis rule, minerals are then left out when Mars sites are ranked
  against an Earth site (disclosed in the response);
- a source shared with the evidence registry has the same id, link, year and
  citation in both files.

Replaced in 2026-11 because they were older than 15 years or generic:
Navarro-Gonzalez et al. (2003), Marchant & Head (2007), Osinski et al. (2005),
Christensen et al. (2000), McSween et al. (2004), Golombek et al. (2003) and the
NASA Analog Missions overview page. The DOIs were checked against Crossref and
OpenAlex; the research corpus (`scripts/ingest_documents.py`) ingests a
record for exactly the DOIs in this file.

Mars:

| `source_id` | Reference | Link | Labels it supports |
|---|---|---|---|
| `lit_jezero_mineralogy` | Goudge et al., 2015, Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, Mars, *Journal of Geophysical Research: Planets* | https://doi.org/10.1002/2014JE004782 | `jezero_crater`: paleolake_basin, carbonates, olivine, clays |
| `farley2022_jezero` | Farley et al., 2022, Aqueously altered igneous rocks sampled on the floor of Jezero crater, Mars, *Science* | https://doi.org/10.1126/science.abo2196 | `jezero_crater`: impact_crater, crater_floor, delta, sulfates, perchlorates |
| `lit_gale_stratigraphy` | Grotzinger et al., 2014, A Habitable Fluvio-Lacustrine Environment at Yellowknife Bay, Gale Crater, Mars, *Science* | https://doi.org/10.1126/science.1242777 | `gale_crater`: paleolake_basin |
| `rampe2020_gale` | Rampe et al., 2020, Mineralogy of Vera Rubin Ridge From the Mars Science Laboratory CheMin Instrument, *Journal of Geophysical Research: Planets* | https://doi.org/10.1029/2019JE006306 | `gale_crater`: impact_crater, iron_oxides, sulfates, clays, silica |
| `golombek2020_insight` | Golombek et al., 2020, Geology of the InSight landing site on Mars, *Nature Communications* | https://doi.org/10.1038/s41467-020-14679-1 | `elysium_planitia`: smooth_plains, lava_plain, basalt, regolith |
| `lit_oxia_clays` | Quantin-Nataf et al., 2021, Oxia Planum: The Landing Site for the ExoMars "Rosalind Franklin" Rover Mission: Geological Context and Prelanding Interpretation, *Astrobiology* | https://doi.org/10.1089/ast.2019.2191 | `oxia_planum`: smooth_plains, delta, clays |
| `cooke2011_utopia` | Cooke et al., 2011, Basement controls on the scale of giant polygons in Utopia Planitia, Mars, *Journal of Geophysical Research: Planets* | https://doi.org/10.1029/2011JE003812 | `utopia_planitia`: polygonal_terrain |
| `nasa_viking` | NASA Viking mission page, Viking 1 and 2 missions, *NASA Science (live mission page)* | https://science.nasa.gov/mission/viking/ | `utopia_planitia`: rocky_surface |
| `rodriguez2022_chryse` | Rodriguez et al., 2022, Evidence of an oceanic impact and megatsunami sedimentation in Chryse Planitia, Mars, *Scientific Reports* | https://doi.org/10.1038/s41598-022-18082-2 | `chryse_planitia`: outflow_channel_deposits, rocky_surface, northern_lowlands, regolith |
| `hynek2017_meridiani` | Hynek & Di Achille, 2017, Geologic map of Meridiani Planum, Mars, *U.S. Geological Survey Scientific Investigations Map 3356* | https://doi.org/10.3133/sim3356 | `meridiani_planum`: layered_deposits, iron_oxides |
| `mccollom2018_meridiani` | McCollom et al., 2018, Phosphorous Immobility During Formation of the Layered Sulfate Deposits of the Burns Formation at Meridiani Planum, *Journal of Geophysical Research: Planets* | https://doi.org/10.1029/2017JE005493 | `meridiani_planum`: sulfates, basalt |
| `nasa_mer` | NASA Mars Exploration Rovers mission page, Mars Exploration Rovers (Spirit and Opportunity), *NASA Science (live mission page)* | https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/ | `meridiani_planum`: smooth_plains; `gusev_crater`: impact_crater, paleolake_basin |
| `ruff2014_gusev` | Ruff et al., 2014, Evidence for a Noachian-aged ephemeral lake in Gusev crater, Mars, *Geology* | https://doi.org/10.1130/G35508.1 | `gusev_crater`: carbonates |
| `ruff2019_gusev` | Ruff et al., 2019, The Case for Ancient Hot Springs in Gusev Crater, Mars, *Astrobiology* | https://doi.org/10.1089/ast.2019.2044 | `gusev_crater`: hills, silica |
| `bost2012_gusev` | Bost et al., 2012, Synthesis of a spinifex-textured basalt as an analog to Gusev crater basalts, Mars, *Meteoritics & Planetary Science* | https://doi.org/10.1111/j.1945-5100.2012.01355.x | `gusev_crater`: basalt |

Earth:

| `source_id` | Reference | Link | Labels it supports |
|---|---|---|---|
| `sager2020_yungay` | Sager et al., 2020, New type of sand wedge polygons in the salt cemented soils of the hyper-arid Atacama Desert, *Geomorphology* | https://doi.org/10.1016/j.geomorph.2020.107481 | `atacama_yungay`: polygonal_terrain, sulfates, nitrates, chlorides |
| `horstmann2024_yungay` | Horstmann et al., 2024, Persistent microbial communities in hyperarid subsurface habitats of the Atacama Desert: Insights from intracellular DNA analysis, *PNAS Nexus* | https://doi.org/10.1093/pnasnexus/pgae123 | `atacama_yungay`: alluvial_fan, playa |
| `heldmann2015_dryvalleys` | Heldmann et al., 2015, Mars: Periglacial Morphology and Implications for Future Landing Sites, *NASA Technical Reports Server 20150023012* | https://ntrs.nasa.gov/citations/20150023012 | `mcmurdo_dry_valleys`: polar_desert, periglacial |
| `goordial2016_university_valley` | Goordial et al., 2016, Nearing the cold-arid limits of microbial life in permafrost of an upper dry valley, Antarctica, *The ISME Journal* | https://doi.org/10.1038/ismej.2015.239 | `mcmurdo_dry_valleys`: water_ice |
| `trowbridge2024_haughton` | Trowbridge et al., 2024, Modeling of the Impact-Generated Hydrothermal System at the Haughton Impact Structure, *Journal of Geophysical Research: Planets* | https://doi.org/10.1029/2023JE008267 | `haughton_crater`: impact_crater |
| `izawa2011_haughton` | Izawa et al., 2011, Weathering of Post-Impact Hydrothermal Deposits from the Haughton Impact Structure: Implications for Microbial Colonization and Biosignature Preservation, *Astrobiology* | https://doi.org/10.1089/ast.2011.0612 | `haughton_crater`: impact_breccia, carbonates |
| `parnell2012_haughton` | Parnell et al., 2012, Evidence for life in the isotopic analysis of surface sulphates in the Haughton impact structure, and potential application on Mars, *International Journal of Astrobiology* | https://doi.org/10.1017/S1473550411000395 | `haughton_crater`: sulfates, iron_oxides |
| `elmaarry2015_playas` | El-Maarry et al., 2015, Field investigation of dried lakes in western United States as an analogue to desiccation fractures on Mars, *Journal of Geophysical Research: Planets* | https://doi.org/10.1002/2015JE004895 | `death_valley`: playa, chlorides, sulfates, clays |
| `lasser2020_badwater` | Lasser et al., 2020, Surface and subsurface characterisation of salt pans expressing polygonal patterns, *Earth System Science Data* | https://doi.org/10.5194/essd-12-2881-2020 | `death_valley`: polygonal_terrain |
| `das2026_deathvalley` | Das et al., 2026, Estimating past fluid pH and evaporative conditions in Gale crater using terrestrial analog samples from Death Valley, CA, *Meteoritics & Planetary Science* | https://doi.org/10.1111/maps.70237 | `death_valley`: borates |
| `lit_holuhraun` | Pedersen et al., 2017, Lava field evolution and emplacement dynamics of the 2014-2015 basaltic fissure eruption at Holuhraun, Iceland, *Journal of Volcanology and Geothermal Research* | https://doi.org/10.1016/j.jvolgeores.2017.02.027 | `holuhraun_iceland`: lava_plain, fissure_vent, outwash_plain, basalt |
| `voigt2025_holuhraun` | Voigt et al., 2025, The 2014-2015 Holuhraun Lava Flow-field in Iceland as a Planetary Analog for Young Volcanic Terrains in Elysium Planitia, Mars, *The Planetary Science Journal* | https://doi.org/10.3847/PSJ/adb5f1 | `holuhraun_iceland`: polygonal_terrain |
| `hartley2018_holuhraun` | Hartley et al., 2018, Melt inclusion constraints on petrogenesis of the 2014-2015 Holuhraun eruption, Iceland, *Contributions to Mineralogy and Petrology* | https://doi.org/10.1007/s00410-017-1435-0 | `holuhraun_iceland`: volcanic_glass |
| `stoker2011_mdrs` | Stoker et al., 2011, Properties of Subsurface Soil Cores from Four Geologic Provinces Surrounding Mars Desert Research Station, Utah: Characterizing Analog Martian Soil in a Human Exploration Scenario, *42nd Lunar and Planetary Science Conference (NASA Technical Reports Server 20110014304)* | https://ntrs.nasa.gov/citations/20110014304 | `mdrs_utah`: sandstone, sulfates, carbonates, clays |
| `clarke2011_hanksville` | Clarke & Stoker, 2011, Concretions in Exhumed Channels Near Hanksville Utah: Implications for Mars, *NASA Technical Reports Server 20110023235* | https://ntrs.nasa.gov/citations/20110023235 | `mdrs_utah`: inverted_channels, carbonates |
| `adams2014_maunakea` | Adams, 2014, Pu'u Poli'ahu, Mauna Kea: A Possible Analog for the Hematite Bearing Layer Located in Gale Crater, Mars, *NASA Technical Reports Server 20140010577* | https://ntrs.nasa.gov/citations/20140010577 | `mauna_kea_summit`: cinder_cone, tephra, iron_oxides |
| `graham2013_maunakea` | Graham & Graff, 2013, Rover-Based Instrumentation and Scientific Investigations During the 2012 Analog Field Test on Mauna Kea Volcano, Hawaii, *NASA Technical Reports Server 20130009908* | https://ntrs.nasa.gov/citations/20130009908 | `mauna_kea_summit`: volcanic_slope |

## 8. Not used in V1, and why

| Source | Why not in V1 | What it would add |
|---|---|---|
| **JMARS** (ASU) | Has **no public API** (confirmed by the challenge prompt). A desktop GIS, not a data service; do not claim otherwise | Interactive layer browsing for humans; not a pipeline input |
| **HiRISE / CTX DTMs** (UA / MSSS via PDS) | Per-site stereo DTMs are large, patchy in coverage and would have needed `rasterio` ingestion per ellipse; weekend scope | Metre-scale slope and roughness over the landing ellipse: the direct replacement for the `regional_scale_only` MOLA statistics (`future_investigation` in every explanation already says so) |
| **CRISM MTRDR** via PDS Geosciences ODE (https://ode.rsl.wustl.edu/mars/) | No login, but time: mapping spectral parameters to the categorical `mineralogy_tags` needs a defined vocabulary | Measured surface mineralogy instead of literature tags; would make the Jaccard comparison data-driven |
| **THEMIS / TES** (ASU, PDS) | Time; the gridded products need reprojection and masking | `surface_temperature_mean_c` (thermal inertia / surface temperature), `rock_abundance_pct` (IRTM/TES rock abundance; Christensen 1986; Nowicki & Christensen 2007), `dust_cover_index` (TES Dust Cover Index; Ruff & Christensen 2002). These are exactly the four missing Mars features |
| **Mars Climate Database** (LMD) | Time; web form / API access not evaluated | `surface_temperature_mean_c`, `atmospheric_pressure_pa` per site and season |
| **EMIT L2B Surface Mineral Identification** (EMITL2BMIN, NASA LP DAAC) | Requires Earthdata Login | Measured Earth surface mineralogy; the Earth half of a data-driven composition match, and the basis for *discovering* new analogs rather than curating them |
| **SRTM GL1 30 m** | Requires Earthdata Login; GLO-90 already satisfies the harmonised 3.7 km baseline, and 30 m would be block-averaged away | Finer `slope_fine_median_deg` only |
| **HLS L30** | Requires Earthdata Login | Vegetation and surface-reflectance screening to find bare, arid terrain at continental scale |
| **PDS Geosciences ODE** generally | Time | Programmatic discovery of CRISM, HiRISE and other PDS products by footprint |
| **Mars Trek `CTX_beta01_uncontrolled_5m_Caltech`**, **`Mars_MGS_MOLA_ClrShade_merge_global_463m`** | Time; the MOLA shade layer is already a `--layer` option in `fetch_mars_texture.py` | Higher-resolution imagery for the globe; shaded relief that makes the topography the scoring uses visible |
| **LRO Diviner** temperature maps | Moon is out of V1 scope | Lunar thermal environment for the Version 2 Moon globe |

The EMIT, SRTM, HLS, CRISM, Trek and Diviner entries come from an
**unofficial** community list (see [CHALLENGE.md](CHALLENGE.md#7-unofficial-suggested-datasets)).
The official Resources tab has not yet been reconciled.

## 9. Data marked missing in V1

Missing means `"value": null, "is_missing": true, "quality_flag": "missing"`.
Nothing is imputed and nothing is scored as zero.

**Mars: four features missing on every one of the 8 sites**
(`completeness.features_requested 17, features_available 13, fraction 0.765`):

| `feature_id` | Unit | Candidate source recorded in the profile note | Effect in V1 |
|---|---|---|---|
| `surface_temperature_mean_c` | degC | THEMIS/TES-derived surface temperature or thermal inertia (PDS); Mars Climate Database | The `thermal_conditions` scoring criterion is excluded for all sites under `common_feature_set` and listed in every result's `warnings`/`completeness.excluded_criteria` |
| `atmospheric_pressure_pa` | Pa | Lander records (Viking, InSight, Curiosity, Perseverance); depends on elevation and season | Not scored; disclosed as non-comparable in every analog match |
| `rock_abundance_pct` | % | IRTM/TES rock abundance maps (Christensen 1986; Nowicki & Christensen 2007) | Not scored |
| `dust_cover_index` | (index) | TES Dust Cover Index (Ruff & Christensen 2002) | Not scored |

**Earth: no missing features.** All 7 candidate profiles report
`features_requested 17, features_available 17, fraction 1.0`.

**Documents:** `backend/data/documents/` is populated (section 10 below):
36 documents, 311 chunks, and `/api/v1/health` reports `retrieval: ok`
(`docs/api_examples.json`). The explanation example for Jezero carries six
`supporting_evidence` chunks. The corpus is evidence for the explanation
engine only; no number in a profile comes from it.

## 10. Scientific document corpus

`backend/data/documents/`: the evidence behind `POST /api/v1/research/explain`.
Built by `backend/scripts/ingest_documents.py` from a hand-curated list of real
public URLs (`DOCUMENTS` in that script); described in
`backend/data/documents/README.md`; inventoried in `manifest.json`. The
retriever (`app/services/retrieval_engine.py`) never fetches at request time:
everything it serves was ingested offline and committed.

| Field | Value |
|---|---|
| Built | `manifest.json` `built_at` 2026-11-14T16:17:31+00:00 |
| Counts | `documents_ingested` **36**, `documents_failed` **2**, `chunks` **311** (`chunks.jsonl` has 311 lines; `corpus/` has 36 files) |
| Chunking | `target_chars` 900, `max_chars` 1000, `overlap_chars` 150, boundary "paragraph, then sentence" |
| Document kinds | `html` (agency and programme pages), `text` (PDS3 label, AAREADME, catalog), `crossref` (bibliographic records) |
| Chunk fields | `chunk_id` (`<document_id>#<nnn>`), `document_id`, `title`, `institution`, `url`, `publication_date`, `geographic_relevance`, `text`, `char_start`, `char_end`, `retrieved_at` |

Document classes ingested (from `data/documents/README.md`, counts from the
manifest):

| Class | Documents | Institutions as recorded |
|---|---|---|
| The 8 Mars sites | NASA Science pages for Mars 2020 (overview and science), MSL (overview and science), InSight (overview and science), Viking (project, Viking 1, Viking 2), MER (overview, Spirit, Opportunity); ESA's Oxia Planum selection article | NASA Science / JPL; NASA Science; ESA |
| Nomenclature | USGS/IAU Gazetteer descriptor-terms page and Mars system page | USGS Astrogeology / IAU WGPSN |
| MOLA MEGDR | the PDS3 label of `MEGT90N000EB`, the archive AAREADME, the data set catalog, the PDS Geosciences product page | NASA PDS Geosciences Node / MOLA Science Team |
| Landing-site selection | the 2015 First Landing Site / Exploration Zone Workshop page | NASA / Lunar and Planetary Institute (USRA) |
| Earth analog programmes and datasets | NASA Analog Missions, ARADS, Haughton-Mars Project, the Copernicus DEM registry entry, NASA POWER methodology | NASA; NASA Ames; Mars Institute / SETI Institute / NASA; ESA Copernicus / AWS Registry of Open Data; NASA Langley Research Center (POWER) |
| Peer-reviewed literature | Crossref metadata records for all 11 DOIs in section 7 (`crossref_lit_*`) | the journal and publisher, e.g. "Science / American Association for the Advancement of Science (AAAS)" |

The literature entries are **bibliographic records, not papers**: the papers
are paywalled, so each record holds title, authors, venue, date, DOI and
(where Crossref has one) the abstract, and its text says so. A citation of one
supports "this paper exists and studied this site", not a quotation of its
findings unless the abstract carries them.

The two failures, quoted from `manifest.json` `failed`:

| `document_id` | URL | `reason` |
|---|---|---|
| `marssociety_mdrs` | https://mdrs.marssociety.org/ | "extracted text too short (45 chars): likely a JavaScript-rendered shell" |
| `nasa_power_home` | https://power.larc.nasa.gov/ | "extracted text too short (584 chars): likely a JavaScript-rendered shell" |

A page whose extracted text is under `MIN_TEXT_CHARS` (1200) is recorded as
failed rather than replaced with anything invented. The MDRS failure means the
`mdrs` provenance in section 6 has no corpus document behind it; the POWER
methodology page (`nasa_power_methodology`, 11 chunks) stands in for the POWER
home page.

**Trust.** Retrieved documents are untrusted input: public pages and
third-party metadata fetched verbatim. They are quoted as evidence and handed
to the language model inside labelled delimiters; nothing in them is executed
and no number in them can enter a score. Licences as recorded in the README:
NASA and USGS content and PDS data are US public domain; ESA content is quoted
under ESA's standard licence for editorial use with attribution; Crossref
metadata is CC0; the Copernicus registry entry and the Mars Institute page are
quoted for attribution and reference.

## 11. Demonstration fixtures

**None are present in the committed data.** Every measurement in
`site_profiles.v1.json` and `candidate_profiles.v1.json` has a
`measurement_type` of `measured`, `derived`, `literature` or `estimated`, and
no `quality_flag` is `demo_fixture`.

If one is ever added, the contract (`backend/app/models/common.py`) defines
`measurement_type: "demo_fixture"` as "placeholder for development only and
must never be presented as evidence", and `quality_flag: "demo_fixture"` as
"not real data". Such a value must be labelled as a fixture wherever the UI
shows it, must not enter a score or a similarity unless the user has been told
it is fake, and must be removed before any demonstration or submission.

## 12. Licence and attribution summary

| Source | Terms |
|---|---|
| MOLA MEGDR (NASA PDS) | Public domain; cite the MGS MOLA Science Team |
| NASA POWER | Public domain |
| NASA Trek Viking MDIM 2.1 mosaic | NASA imagery; credit NASA/JPL/USGS via Solar System Treks |
| Copernicus DEM GLO-90 | Free for any use; **attribution required** (confirm wording on the AWS registry page) |
| Agency web pages | Public web content; cited by URL |
| Literature | Cited by DOI; the corpus holds Crossref metadata records (CC0), not paper text |
| Document corpus (`backend/data/documents/`) | Excerpts of public web pages and PDS text, quoted as evidence with attribution; see section 10 |
| Project code and derived values | MIT (repository licence) |

## 13. Verified site imagery (Task B, 2026-11-14)

Manifest: `backend/data/imagery/manifest.json` (built by `scripts/site_imagery_ctx.py` and
`scripts/site_imagery_nasa.py`; cached assets under `backend/data/imagery/assets/`; served by
`GET /api/v1/sites/{id}/imagery` and `GET /api/v1/imagery/{entry_id}/asset`). Every entry records
the source page, asset URL, credit and licence, instrument, acquisition date (null unless the
caption states it; the publication date is a separate field), resolution if known, bounds only
where georeferenced, the geographic relationship to the candidate point, and an appearance
caveat. Nothing generated or artistic is included.

| Source | Institution / credit | Access | Licence |
|---|---|---|---|
| CTX global mosaic beta01 (Context Camera, MRO), tiles via NASA Solar System Treks / Esri `astro.arcgis.com/.../OnMars/CTX` | NASA/JPL/MSSS/The Murray Lab (Caltech) | WMTS/ArcGIS tile cache, no login; stitched at zoom 9 (62 km, 81 m/px) and zoom 12 (7.8 km, 10 m/px) around each site; bounds exact from the tile grid | Free use of beta01 for all purposes with credit (service description) |
| NASA Image and Video Library (`images-api.nasa.gov`) products from JPL Photojournal | NASA/JPL-Caltech and partner credits as recorded per entry | REST API, no key; web-sized JPEG assets cached locally with MIME and size checks | NASA imagery is free to use with credit (NASA Media Usage Guidelines) |

Uncontrolled-mosaic caveat: the CTX beta01 mosaic is greyscale, lossy and uncontrolled, so
brightness changes and seams occur between orbit strips; three zoom-9 tiles around Elysium
Planitia are corrupt at the source and were rebuilt from their zoom-10 children.

| Site | View | Product | Instrument | Relationship to the candidate point | Acquired | Source |
|---|---|---|---|---|---|---|
| jezero_crater | orbital | CTX mosaic, regional context (62.5 km across) centred on Jez | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| jezero_crater | orbital | CTX mosaic, local context (7.8 km across) centred on Jezero  | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| jezero_crater | orbital | Perseverance and Mars 2020 Spacecraft Components on the Surf | HiRISE (MRO) | exact location | 2021-02-19 | [source](https://photojournal.jpl.nasa.gov/catalog/PIA24333) |
| jezero_crater | orbital | A Possible Landing Site for the 2020 Mission: Jezero Crater | HiRISE (MRO) | candidate region | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA19303) |
| jezero_crater | surface | Mastcam-Z's First 360-Degree Panorama | Mastcam-Z (Perseverance) | exact location | 2021-02-21 | [source](https://photojournal.jpl.nasa.gov/catalog/PIA24264) |
| gale_crater | orbital | CTX mosaic, regional context (62.5 km across) centred on Gal | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| gale_crater | orbital | CTX mosaic, local context (7.8 km across) centred on Gale Cr | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| gale_crater | orbital | Scene of a Martian Landing | HiRISE (MRO) | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA16001) |
| gale_crater | surface | Gale Crater Vista, in Glorious Color | Mastcam (Curiosity) | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA16029) |
| elysium_planitia | orbital | CTX mosaic, regional context (62.5 km across) centred on Ely | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| elysium_planitia | orbital | CTX mosaic, local context (7.8 km across) centred on Elysium | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| elysium_planitia | orbital | InSight on Mars, As Seen by HiRISE | HiRISE (MRO) | exact location | 2018-12-06 | [source](https://photojournal.jpl.nasa.gov/catalog/PIA22875) |
| elysium_planitia | surface | InSight's First Image from Mars | Instrument Context Camera (InSight) | exact location | 2018-11-26 | [source](https://photojournal.jpl.nasa.gov/catalog/PIA22829) |
| oxia_planum | orbital | CTX mosaic, regional context (62.5 km across) centred on Oxi | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| oxia_planum | orbital | CTX mosaic, local context (7.8 km across) centred on Oxia Pl | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| oxia_planum | orbital | Clay-Rich Terrain in Oxia Planum: A Proposed ExoMars Landing | HiRISE (MRO) | candidate region | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA19851) |
| oxia_planum | orbital | Possible Future Mars Landing Site in Oxia Planum | HiRISE (MRO) | candidate region | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA18817) |
| utopia_planitia | orbital | CTX mosaic, regional context (62.5 km across) centred on Uto | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| utopia_planitia | orbital | CTX mosaic, local context (7.8 km across) centred on Utopia  | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| utopia_planitia | orbital | Viking Lander 2 Anniversary | THEMIS infrared band 9 (Mars Odyssey) | candidate region | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA04023) |
| utopia_planitia | surface | First Color Image of the Viking Lander 2 Site | Viking Lander 2 Camera 2 | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA00568) |
| chryse_planitia | orbital | CTX mosaic, regional context (62.5 km across) centred on Chr | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| chryse_planitia | orbital | CTX mosaic, local context (7.8 km across) centred on Chryse  | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| chryse_planitia | orbital | Acidalia and Chryse Plains, Mars | MOC wide-angle (Mars Global Surveyor) | candidate region | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA02000) |
| chryse_planitia | surface | First Color Image From Viking Lander 1 | Viking Lander 1 Camera 2 | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA00563) |
| chryse_planitia | surface | Afternoon on Chryse Planitia - Viking Lander 1 Camera 1 Mosa | Viking Lander 1 Camera 1 | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA03165) |
| meridiani_planum | orbital | CTX mosaic, regional context (62.5 km across) centred on Mer | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| meridiani_planum | orbital | CTX mosaic, local context (7.8 km across) centred on Meridia | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| meridiani_planum | orbital | Rover Landing Hardware at Eagle Crater, Mars | HiRISE (MRO) | exact location | 2017-04-08 | [source](https://photojournal.jpl.nasa.gov/catalog/PIA21494) |
| meridiani_planum | surface | A Geologist Treasure Trove | Panoramic Camera (Opportunity) | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA05163) |
| gusev_crater | orbital | CTX mosaic, regional context (62.5 km across) centred on Gus | Context Camera (CTX), Mars Reconnaissance Orbiter | candidate region | not verified | [source](https://trek.nasa.gov/mars/) |
| gusev_crater | orbital | CTX mosaic, local context (7.8 km across) centred on Gusev C | Context Camera (CTX), Mars Reconnaissance Orbiter | exact location | not verified | [source](https://trek.nasa.gov/mars/) |
| gusev_crater | surface | Mars in Full View | Panoramic Camera (Spirit) | exact location | not verified | [source](https://photojournal.jpl.nasa.gov/catalog/PIA05049) |

Missing imagery is a recorded state: Oxia Planum has no landed mission and therefore no surface
view. For the Viking first colour images and the early MER panoramas the product pages state the
spacecraft and camera but not the acquisition sol, so `acquisition_date` is null with a note.


## Earth–Mars–Moon comparison reference catalogue

`backend/data/comparison/catalog.v1.json` holds dated NASA body references and curated Apollo 11 / Apollo 15 landing-region descriptions. Each record carries source links. Lunar mission coordinates are rounded to the precision of the NASA NSSDCA mission summaries. The lunar records are not numeric environmental profiles; no slopes, relief, local illumination, temperature or resource quantities are inferred from their descriptions. Original Earth and Mars profile measurements are exposed unchanged through `/comparison/catalog`.

## 14. Earth globe texture and Earth imagery (Earth–Mars release)

| Source | Use | Access | Licence / credit |
|---|---|---|---|
| NASA GIBS `BlueMarble_NextGeneration` (Blue Marble Next Generation, NASA Earth Observatory, Reto Stöckli, NASA GSFC) | Earth globe texture, stitched at 500 m set level 3 (10x5 tiles) and resized to 4096x2048 (`frontend/public/textures/earth_bluemarble_4k.jpg`); equirectangular, column 0 = 180 W, same convention as the Mars texture; verified by pixel colour at the Gulf of Guinea, Sahara, Amazon, Pacific and Himalaya | WMTS, no login | Public domain (NASA) |
| NASA GIBS `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`, time 2000-12-01 (Landsat 7 ETM+ Web-Enabled Landsat Data annual composite) | Earth orbital context per site: level 10 (2x2 tiles, ~62.5 km, 61 m/px) and level 11 (2x2, ~31 km, 30.5 m/px); exact bounds from the tile grid | WMTS, no login (`scripts/site_imagery_earth.py`) | Public domain (USGS/NASA); GIBS requests credit |
| NASA GIBS `MODIS_Terra_CorrectedReflectance_TrueColor`, 2016-01-15 | Fallback where WELD tiles are blank (high-latitude Dry Valleys) | WMTS, no login | Public domain (NASA LANCE) |
| NASA Image and Video Library | Haughton-Mars Project field photos (ARC-2007-ACD07-0170-005, ARC-2007-ACD09-0255-001), Holuhraun from Bárðarbunga (jsc2024e055198) | REST, no key | NASA, credit as recorded |
| Wikimedia Commons (metadata read from `extmetadata`) | NSF/USAP Beacon Valley (public domain), Alfonso Davila/NASA Beacon Valley (public domain), NPS Badwater and Mesquite Flat (public domain), USGS Mauna Kea summit (public domain), CC BY 4.0 Mauna Kea pu'u, CC BY 4.0 MDRS landscape (Sokoloff et al. 2020), CC BY-SA 4.0 MDRS station 2020, HMP aerial Devon Island (public domain), NASA Earth Observatory Landsat 8 Holuhraun (public domain) | MediaWiki API, no key, paced | Per file, recorded verbatim in the manifest |

No field photograph with a documented licence and location could be verified for the Atacama Yungay site; it carries orbital context only and says so. Field photographs are evidence of appearance, not measurements, and several are explicitly `nearby_scene` (Beacon Valley for University Valley; Badwater and Mesquite Flat for the Death Valley footprint centre).
