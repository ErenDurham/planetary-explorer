"""Import the "Lesser-Known Mars Sites - Conditions Comparison" workbook.

The workbook (compiled by the project's research lead) pairs 17 candidate Mars
base sites with one Earth location each and records, per site, a role, the
author's notes and short literature-reported condition texts (terrain,
mineralogy, elevation, thermal, solar/power, wind, water/ice) with the sources
they were taken from.

This script turns it into data/workbook/lesser_known_sites.v1.json. It does
NOT score anything: condition texts are literature-reported descriptions, kept
apart from the values the pipeline computes from MOLA, Copernicus DEM and
NASA POWER, and never parsed into numbers.

Source rule (set by the project owner, 2026-11-15): only research articles
with a DOI, or official NASA / CSA / ESA / JAXA pages, plus the sources the
owner approved by name. Every source the workbook cites is listed below with
its decision; a cell whose only support is an excluded source is stored as
null with the reason, never shown as if it were sourced.

Each cell's attribution (which approved sources the workbook ties it to) is
hand-curated from the workbook's "What it supports" column (Earth) and its
per-site source lists (Mars). scripts/verify_workbook_conditions.py later
checks every cell against the text the research corpus actually holds.

Run from backend/:  python scripts/import_workbook.py "<path to .xlsx>"
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND / "data" / "workbook" / "lesser_known_sites.v1.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
ROLES = ["Base candidate", "Resource site", "To evaluate", "Instrument testing", "Context only"]
CONDITIONS = [  # (key, label)
    ("terrain", "Terrain"), ("mineralogy", "Mineralogy"), ("elevation", "Elevation"), ("thermal", "Thermal"),
    ("solar", "Solar / power"), ("wind", "Wind"), ("water_ice", "Water / ice"),
]

# --------------------------------------------------------------------------
# Approved sources. kind: doi | agency | approved_exception (owner-approved
# page outside the DOI/agency rule). `restrict` records an owner condition on
# how a source may be used; ingest_documents.py enforces it on the text.
# --------------------------------------------------------------------------
def doi(cite, title, d, year, venue):
    return {"kind": "doi", "cite": cite, "title": title, "url": f"https://doi.org/{d}", "doi": d, "year": year, "venue": venue}


def page(cite, title, url, institution, kind="agency", year=None):
    return {"kind": kind, "cite": cite, "title": title, "url": url, "institution": institution, "year": year}


SOURCES: dict[str, dict] = {
    # Earth side
    "marinova2022_university_valley": doi("Marinova et al., 2022", "Climate and energy balance of the ground in University Valley, Antarctica", "10.1017/S0954102022000025", 2022, "Antarctic Science"),
    "mckay_marinova2025_ice_cemented_ground": doi("McKay & Marinova, 2025", "Summer snow determines the depth to ice-cemented ground under dry permafrost in Antarctica", "10.1017/S0954102025100448", 2025, "Antarctic Science"),
    "obryk2020_dry_valleys_climate": doi("Obryk et al., 2020", "Climate from the McMurdo Dry Valleys, Antarctica, 1986-2017", "10.1029/2019JD032180", 2020, "Journal of Geophysical Research: Atmospheres"),
    "goordial2016_university_valley": doi("Goordial et al., 2016", "Nearing the cold-arid limits of microbial life in permafrost of an upper dry valley, Antarctica", "10.1038/ismej.2015.239", 2016, "The ISME Journal"),
    "yoldi2020_greenland_old_ice": doi("Yoldi et al., 2020", "Surface-exposed old ice along the Greenland ice sheet margin as an analogue for the north polar layered deposits", "10.5194/epsc2020-1065", 2020, "Europlanet Science Congress 2020"),
    "bishop2020_mawrth_horizons": doi("Bishop et al., 2020", "Multiple mineral horizons in layered outcrops at Mawrth Vallis, Mars", "10.1016/j.icarus.2020.113634", 2020, "Icarus"),
    "bishop2025_painted_desert": doi("Bishop et al., 2025", "Constraining the ancient geochemical environments of Mawrth Vallis (EPSC-DPS 2025-1957)", "10.5194/epsc-dps2025-1957", 2025, "EPSC-DPS Joint Meeting 2025"),
    "rull2021_jaroso": doi("Rull et al., 2021", "Spectroscopic study of terrestrial analogues to support rover missions to Mars - a Raman-centred review", "10.1016/j.aca.2021.339003", 2021, "Analytica Chimica Acta"),
    "demaret2022_jaroso_vents": doi("Demaret et al., 2022", "Fe-rich fossil vents as Mars analog samples: identification of extinct chimneys in Miocene marine sediments using Raman spectroscopy, X-ray diffraction, and scanning electron microscopy-energy dispersive X-ray analysis", "10.1089/ast.2021.0128", 2022, "Astrobiology"),
    "krishnamoorthi2025_uae_dunes": doi("Krishnamoorthi, Atri et al., 2025", "Aeolian sediment lithification from late-stage aqueous activity", "10.1029/2024JE008804", 2025, "Journal of Geophysical Research: Planets"),
    "moores2012_sudbury_sample_return": doi("Moores et al., 2012", "A mission control architecture for robotic lunar sample return as field tested in an analogue deployment to the Sudbury impact structure", "10.1016/j.asr.2012.05.008", 2012, "Advances in Space Research"),
    "lambert_reimold2023_impact_analogs": doi("Lambert & Reimold, 2023", "Terrestrial impact sites as field analogs for planetary exploration", "10.3389/fspas.2023.1186173", 2023, "Frontiers in Astronomy and Space Sciences"),
    "aerts2019_yilgarn_lakes": doi("Aerts et al., 2019", "Microbial communities in sediments from four mildly acidic ephemeral salt lakes in the Yilgarn Craton (Australia)", "10.3389/fmicb.2019.00779", 2019, "Frontiers in Microbiology"),
    "krzesinska2021_oxia_granby": doi("Krzesińska et al., 2021", "Mineralogy, aqueous history and biosignature preservation potential at Oxia Planum (EGU21-841)", "10.5194/egusphere-egu21-841", 2021, "EGU General Assembly 2021"),
    "bultel2022_granby_vermiculite": doi("Bultel et al., 2022", "Micro-scale characterization of vermiculite-rich sample from Granby Tuff (EGU22-11272)", "10.5194/egusphere-egu22-11272", 2022, "EGU General Assembly 2022"),
    "bultel2025_granby_alteration": doi("Bultel et al., 2025", "Deciphering the alteration processes of a vermiculite-rich sample (EPSC-DPS 2025-1550)", "10.5194/epsc-dps2025-1550", 2025, "EPSC-DPS Joint Meeting 2025"),
    "bultel2026_granby_modeling": doi("Bultel et al., 2026", "Geochemical modeling on Granby Tuffs clays (EPSC 2026-842)", "10.5194/epsc2026-842", 2026, "Europlanet Science Congress 2026"),
    "petersen2019_galena_creek": doi("Petersen et al., 2019", "New insights into ice accumulation at Galena Creek Rock Glacier from radar imaging of its internal structure", "10.1017/jog.2019.67", 2019, "Journal of Glaciology"),
    "meng2022_rock_glacier_radio": doi("Meng, Petersen & Holt, 2022", "Rock glacier composition and structure from radio wave speed analysis with dipping reflector correction", "10.1017/jog.2022.90", 2022, "Journal of Glaciology"),
    "aguilar2024_drone_gpr": doi("Aguilar et al., 2024", "Subsurface investigations of debris-covered glaciers using drone-based ground penetrating radar (EPSC2024-1271)", "10.5194/epsc2024-1271", 2024, "Europlanet Science Congress 2024"),
    "aguilar2026_rock_glacier_continuum": doi("Aguilar et al., 2026 (preprint)", "Revealing the internal structure of the rock glacier-debris-covered glacier continuum", "10.22541/essoar.176729449.99810062/v1", 2026, "ESS Open Archive (preprint)"),
    "amils2014_rio_tinto": doi("Amils & Fernández-Remolar, 2014", "Río Tinto: a geochemical and mineralogical terrestrial analogue of Mars", "10.3390/life4030511", 2014, "Life"),
    "sobron2014_rio_tinto": doi("Sobron et al., 2014", "Natural Fe-bearing oxides and sulfates from the Rio Tinto Mars analog site: critical assessment of VNIR reflectance spectroscopy, laser Raman spectroscopy, and XRD as mineral identification tools", "10.2138/am.2014.4595", 2014, "American Mineralogist"),
    "gunes2024_salda_microbialites": doi("Gunes et al., 2024", "Morphological and microbial diversity of hydromagnesite microbialites in Lake Salda", "10.1111/gbi.12619", 2024, "Geobiology"),
    "ustaoglu2023_salda_climate": doi("Ustaoğlu et al., 2023", "Impacts of climate change on precipitation and temperature (book chapter)", "10.1007/978-3-031-24767-5_18", 2023, "Springer book chapter"),
    "kong2018_dalangtan": doi("Kong et al., 2018", "The Dalangtan saline playa in a hyperarid region on Tibet Plateau: I. Evolution and environments", "10.1089/ast.2018.1830", 2018, "Astrobiology"),
    "angles_li2017_qaidam": doi("Anglés & Li, 2017", "The western Qaidam Basin as a potential Martian environmental analogue: an overview", "10.1002/2017JE005293", 2017, "Journal of Geophysical Research: Planets"),
    "zhu2025_qaidam_polygons": doi("Zhu et al., 2025", "Polygonal landforms in the western Qaidam Basin (EPSC-DPS 2025-244)", "10.5194/epsc-dps2025-244", 2025, "EPSC-DPS Joint Meeting 2025"),
    "voigt2025_holuhraun": doi("Voigt et al., 2025", "The 2014-2015 Holuhraun lava flow-field as a planetary analog", "10.3847/PSJ/adb5f1", 2025, "The Planetary Science Journal"),
    "gwizd2024_holuhraun_raven": doi("Gwizd et al., 2024", "Comparing rover and helicopter mission architectures (RAVEN, Holuhraun)", "10.3847/PSJ/ad55f4", 2024, "The Planetary Science Journal"),
    "lit_holuhraun": doi("Pedersen et al., 2017", "Lava field evolution and emplacement dynamics of the 2014-2015 basaltic fissure eruption at Holuhraun, Iceland", "10.1016/j.jvolgeores.2017.02.027", 2017, "Journal of Volcanology and Geothermal Research"),
    "dundas2020_holuhraun_lava_water": doi("Dundas et al., 2020", "Lava-water interaction and hydrothermal activity within the 2014-2015 Holuhraun lava flow field, Iceland", "10.1016/j.jvolgeores.2020.107100", 2020, "Journal of Volcanology and Geothermal Research"),
    "gilbert2018_svalbard_fjord_valley": doi("Gilbert et al., 2018", "Late Quaternary sedimentation and permafrost development in a Svalbard fjord-valley, Norwegian high Arctic", "10.1111/sed.12476", 2018, "Sedimentology"),
    "esa_concordia_analogue": page("ESA, 2025", "An Antarctic analogue for space exploration (Concordia)", "https://explorationscience.esa.int/?p=473", "ESA", year=2025),
    "nasa_ecca_plattner": page("Plattner, NASA ECCA final report, 2023", "Plattner - Early Career Collaboration Award final report (acid saline lakes, Western Australia)", "https://assets.science.nasa.gov/content/dam/science/psd/astrobiology/for-researchers/ecca/ECCA%20Plattner.pdf", "NASA Astrobiology / JPL", year=2023),
    "ntrs_haughton_gullies": page("NASA NTRS (LPSC 2020)", "Haughton crater gullies (LPSC 2020)", "https://ntrs.nasa.gov/api/citations/20200001979/downloads/20200001979.pdf", "NASA Technical Reports Server", year=2020),
    "nasa_eo_channeled_scablands": page("NASA Earth Observatory, 2018", "Channeled Scablands", "https://earthobservatory.nasa.gov/images/92025/channeled-scablands", "NASA Earth Observatory", year=2018),
    "nasa_pj_ares_vallis": page("NASA Photojournal", "Ares Vallis", "https://science.nasa.gov/photojournal/pj-ares-vallis-9/", "NASA / JPL"),
    "nasa_lmap_rio_tinto": page("NASA, 2015", "Drilling for data: simulating the search for life on Mars (LMAP at Río Tinto)", "https://www.nasa.gov/missions/analog-field-testing/drilling-for-data-simulating-the-search-for-life-on-mars", "NASA Ames", year=2015),
    # Mars side
    "luzzi2025_ap8_ice": doi("Luzzi et al., 2025", "Geomorphological evidence of near-surface ice at candidate landing sites in northern Amazonis Planitia", "10.1029/2024JE008724", 2025, "Journal of Geophysical Research: Planets"),
    "sinha2022_npld_sediments": doi("Sinha, Horgan et al., 2022", "Sediments within the icy north polar deposits of Mars", "10.1029/2022GL097758", 2022, "Geophysical Research Letters"),
    "darya2024_mars_pv_wind": doi("Darya, Bansal & Jarndal, 2024", "Seasonal performance evaluation of a hybrid PV-wind-battery power system for a Mars base", "10.1109/EPECS62845.2024.10805508", 2024, "IEEE EPECS 2024"),
    "sharma2025_hebrus_caves": doi("Sharma et al., 2025", "Water-driven accessible potential karstic caves in Hebrus Valles", "10.3847/2041-8213/ae0f1c", 2025, "The Astrophysical Journal Letters"),
    "wray2011_columbus_paleolakes": doi("Wray et al., 2011", "Columbus crater and other possible groundwater-fed paleolakes of Terra Sirenum, Mars", "10.1029/2010JE003694", 2011, "Journal of Geophysical Research: Planets"),
    "liu2018_columbus_gypsum": doi("Liu, 2018", "Raman, mid-IR and NIR spectroscopic study of calcium sulfates and mapping gypsum abundances in Columbus crater, Mars", "10.1016/j.pss.2018.04.010", 2018, "Planetary and Space Science"),
    "mandon2021_oxia_clays": doi("Mandon et al., 2021", "Morphological and spectral diversity of the clay-bearing unit at the ExoMars landing site Oxia Planum", "10.1089/ast.2020.2292", 2021, "Astrobiology"),
    "chuang_crown2009_deuteronilus_map": doi("Chuang & Crown, 2009", "Geologic map of MTM 35337, 40337, and 45337 quadrangles, Deuteronilus Mensae region of Mars (USGS SIM 3079)", "10.3133/sim3079", 2009, "USGS Scientific Investigations Map"),
    "levy2010_protonilus_gullies": doi("Levy, Head et al., 2010", "Identification of gully debris flow deposits in Protonilus Mensae, Mars", "10.1016/j.epsl.2009.08.002", 2010, "Earth and Planetary Science Letters"),
    "soare2022_protonilus_cycling": doi("Soare et al., 2022", "A billion or more years of possible periglacial/glacial cycling in Protonilus Mensae, Mars", "10.1016/j.icarus.2022.115115", 2022, "Icarus"),
    "komatsu2016_chryse_edifices": doi("Komatsu et al., 2016", "Small edifice features in Chryse Planitia, Mars: assessment of a mud volcano hypothesis", "10.1016/j.icarus.2015.12.032", 2016, "Icarus"),
    "bao2026_chryse_mafic": doi("Bao, Zeng et al., 2026", "Crater-exposed mafic materials in Chryse Planitia", "10.1029/2026JE010126", 2026, "Journal of Geophysical Research: Planets"),
    "hynek2017_meridiani": doi("Hynek & Di Achille, 2017", "Geologic map of Meridiani Planum, Mars (USGS SIM 3356)", "10.3133/sim3356", 2017, "USGS Scientific Investigations Map"),
    "brown2020_jezero_olivine_carbonate": doi("Brown et al., 2020", "Olivine-carbonate mineralogy of the Jezero crater region", "10.1029/2019JE006011", 2020, "Journal of Geophysical Research: Planets"),
    "hou2026_zhurong_mn_oxides": doi("Hou, Sun, Hu et al., 2026", "Manganese (hydr)oxides record a Hesperian ocean in Utopia Planitia", "10.1038/s41467-026-72858-y", 2026, "Nature Communications"),
    "golombek2020_insight": doi("Golombek et al., 2020", "Geology of the InSight landing site on Mars", "10.1038/s41467-020-14679-1", 2020, "Nature Communications"),
    "hauber2009_xanthe_deltas": doi("Hauber et al., 2009", "Sedimentary deposits in Xanthe Terra: implications for the ancient climate on Mars", "10.1016/j.pss.2008.06.009", 2009, "Planetary and Space Science"),
    "nasa_pia10652_north_cap": page("NASA PIA10652", "What lies below a Martian ice cap", "https://science.nasa.gov/photojournal/what-lies-below-a-martian-ice-cap/", "NASA / JPL"),
    "nasa_pia03008_south_co2": page("NASA PIA03008", "Frozen frozen CO2", "https://science.nasa.gov/photojournal/frozen-frozen-co2/", "NASA / JPL"),
    "esa_mex_south_pole_water": page("ESA Mars Express", "Water at Martian south pole", "https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/Water_at_Martian_south_pole", "ESA"),
    "nasa_svs_767_mpl": page("NASA Goddard SVS 767", "Mars Polar Lander landing site", "https://svs.gsfc.nasa.gov/767", "NASA Goddard Scientific Visualization Studio"),
    "nasa_pia26773_south_pole_psyche": page("NASA PIA26773, 2026", "Psyche's high-resolution view of Mars' south pole", "https://science.nasa.gov/photojournal/psyches-high-resolution-view-of-mars-south-pole/", "NASA / JPL-Caltech / ASU", year=2026),
    "esa_mex_mawrth_clays": page("ESA Mars Express", "The clays of Mawrth Vallis", "https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/The_clays_of_Mawrth_Vallis", "ESA"),
    "nasa_pia18632_noctis": page("NASA PIA18632", "Water-bearing rocks in Noctis Labyrinthus", "https://science.nasa.gov/photojournal/water-bearing-rocks-in-noctis-labyrinthus/", "NASA / JPL"),
    "nasa_pia25359_hebrus": page("NASA PIA25359", "Flooded impact craters in Hebrus Valles", "https://science.nasa.gov/photojournal/flooded-impact-craters-in-hebrus-valles/", "NASA / JPL"),
    "hirise_esp_048036_2025_hebrus": page("HiRISE ESP_048036_2025", "Pits and channels of Hebrus Valles", "https://www.uahirise.org/ESP_048036_2025", "HiRISE (University of Arizona, NASA MRO)", kind="approved_exception"),
    "nasa_pia26775_huygens_psyche": page("NASA PIA26775, 2026", "NASA's Psyche mission images Mars' Huygens crater", "https://science.nasa.gov/photojournal/nasas-psyche-mission-images-mars-huygens-crater/", "NASA / JPL-Caltech / ASU", year=2026),
    "hirise_esp_094549_1655_huygens": page("HiRISE ESP_094549_1655", "Crater on floor of Huygens crater", "https://www.uahirise.org/ESP_094549_1655", "HiRISE (University of Arizona, NASA MRO)", kind="approved_exception", year=2026),
    "nasa_columbus_sulfates_clays": page("NASA", "Sulfates and clays in Columbus crater, Mars", "https://www.nasa.gov/image-article/sulfates-clays-columbus-crater-mars/", "NASA / JPL"),
    "esa_oxia_planum": page("ESA", "Oxia Planum favoured for ExoMars surface mission", "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/ExoMars/Oxia_Planum_favoured_for_ExoMars_surface_mission", "ESA"),
    "nasa_pia12996_deuteronilus": page("NASA PIA12996", "Lobate debris apron in Deuteronilus Mensae", "https://science.nasa.gov/photojournal/lobate-debris-apron-in-deuteronilus-mensae/", "NASA / JPL"),
    "nasa_jezero_delta_panorama": page("NASA", "Detailed panorama of Mars' Jezero crater delta", "https://science.nasa.gov/resource/detailed-panorama-of-mars-jezero-crater-delta/", "NASA / JPL-Caltech"),
}
RESTRICT = {
    "bultel2025_granby_alteration": "Use only what it says about the Granby tuff and how it relates to Mars; the mission it mentions has not launched, so no mission claims.",
    "aguilar2026_rock_glacier_continuum": "Use only what it says about Galena Creek, not Sourdough (Alaska).",
    "aguilar2024_drone_gpr": "Use only what it says about Galena Creek, not Sourdough (Alaska).",
    "hirise_esp_048036_2025_hebrus": "Use only what it says about Hebrus Valles.",
}
for _k, _v in RESTRICT.items():
    SOURCES[_k]["restriction"] = _v

# Citations the workbook makes that are NOT used, with the reason (owner review, 2026-11-15).
EXCLUDED = {
    "Alharbi & Csala 2021": "Rejected by the owner: a general Gulf-region energy paper, not specific to the Liwa Desert.",
    "NASA PIA13801": "Rejected by the owner for Huygens; replaced by PIA26775 and HiRISE ESP_094549_1655.",
    "ESA Mars Express (Huygens rim)": "Rejected by the owner for Huygens.",
    "Ackiss et al. 2013": "Conference abstract without a DOI.",
    "Weitz et al. LPSC 2010": "Conference abstract without a DOI.",
    "Wilcox & Hamilton LPSC 2005": "Conference abstract without a DOI.",
    "Plaut, NASA EZ workshop 2015": "Workshop page hosted by LPI/USRA; no DOI.",
    "Cockell 2004": "No matching DOI found.",
    "Lee et al. 2015": "No matching DOI found.",
    "Heinemann & Lee 2024": "No matching DOI found.",
    "Xiao et al. 2025": "No matching DOI found.",
    "Beltran (TTU) 2023": "No matching DOI found.",
    "Beltran & Luna 2021": "No matching DOI found.",
    "Li et al. 2026 Nature Comms": "Resolved to Hou et al. 2026 (same paper; Crossref lists Hou as first author).",
    "DLR 2026": "Not an approved agency page.",
    "USGS 2011": "Too vague to identify.",
    "ASU Mars Education": "Not an approved agency page.",
    "Britannica": "Not an approved source.",
    "Space.com / EarthSky / Nautilus / Ground News": "News summaries; the underlying paper (Sharma et al. 2025) is used instead.",
    "NOAA GML (SUM)": "Not an approved agency (NOAA).",
    "Summit Camp climate table (Wikipedia)": "Removed from the workbook by the owner.",
    "EU-INTERACT station catalogue": "Not an approved source.",
    "Concordia polar winter 2025 (Astrobiology.com)": "News site, not the agency page.",
    "USAP 'About the Continent'": "Not an approved agency (NSF).",
    "COMNAP station catalogue": "Not an approved source.",
    "southpolestation.com": "Not an approved source.",
    "SETI Institute summary": "Summary page; the paper (Bishop et al. 2020) is used instead.",
    "NPS Petrified Forest geology": "Not an approved agency (NPS).",
    "climatestotravel.com": "Not an approved source.",
    "NYUAD news": "Summary page; the paper (Krishnamoorthi et al. 2025) is used instead.",
    "Gulf News; McCloskey 2025": "Not approved sources.",
    "Western University news (CSA Sudbury)": "University news page, not a CSA page.",
    "Meteoritics & Planetary Science (Sudbury-Chicxulub)": "No specific paper named.",
    "craterexplorer.ca; GLISA; nouvelon.ca": "Not approved sources.",
    "Plattner et al., Earth and Space Science (Eos summary)": "Only the Eos summary is linked; the paper's DOI could not be found.",
    "Ruecker et al. 2016": "No matching DOI found.",
    "Bureau of Meteorology; WA Museum": "Not approved agencies.",
    "Meng et al. 2026, Annals of Glaciology": "No matching DOI found.",
    "Mars Institute - Haughton-Mars Project": "Pending owner verification; not used.",
    "Wikipedia (Devon Island)": "Not an approved source.",
    "planetary.org": "Not an approved source.",
    "USDA ecological site 9.1": "Not an approved agency (USDA).",
    "NOAA normals": "Not an approved agency (NOAA).",
    "Biomarkers of the deep (phys.org)": "News republication, not the agency page.",
    "INTA repository (Río Tinto drilling)": "Not an approved agency page; no DOI.",
    "AEMET": "Not an approved agency.",
    "IUGS Geoheritage": "Not an approved source.",
    "Live Science; internationalparks.org; traveldojo.com; Bianet": "Not approved sources.",
    "Shen et al., EGU 2025": "No matching DOI found.",
    "Hauber et al. 2009 (Svalbard, DLR elib)": "Conference record without a DOI.",
    "CENPERM (Adventdalen); svalbardblues.com": "Not approved sources.",
    "Hartwick 2022": "Not on the approved list.",
}

# --------------------------------------------------------------------------
# Sites. Workbook name -> app id. `existing` = already in the app (merged).
# Coordinates: the workbook's, rounded to the precision the sheet shows,
# except where the app already has a published landing/mission coordinate
# within ~20 km of the workbook's (kept, see `keep_app_coordinates`).
# --------------------------------------------------------------------------
MARS = [  # (id, comparison-sheet name prefix, approx coords?, region)
    ("amazonis_arcadia_ap8", "Amazonis / Arcadia Planitia (AP-8)", True, "Arcadia / northern Amazonis Planitia boundary"),
    ("planum_boreum", "North Pole (Planum Boreum)", True, "North polar cap"),
    ("planum_australe", "South Pole (Planum Australe)", False, "South polar cap"),
    ("mawrth_vallis", "Mawrth Vallis", False, "Dichotomy boundary, Arabia Terra"),
    ("noctis_labyrinthus", "Noctis Labyrinthus", False, "Western Valles Marineris, Tharsis"),
    ("hebrus_valles", "Hebrus Valles", False, "Northern lowlands west of Elysium"),
    ("huygens_crater", "Huygens Crater", False, "Noachian highlands near the Hellas rim"),
    ("columbus_crater", "Columbus Crater", False, "Terra Sirenum"),
    ("oxia_planum", "Oxia Planum", False, None),
    ("deuteronilus_mensae", "Deuteronilus Mensae", False, "Dichotomy boundary, fretted terrain"),
    ("protonilus_mensae", "Protonilus Mensae", False, "Dichotomy boundary, fretted terrain"),
    ("chryse_planitia", "Chryse Planitia", False, None),
    ("meridiani_planum", "Meridiani Planum", False, None),
    ("jezero_crater", "Jezero Crater", True, None),
    ("utopia_planitia", "Utopia Planitia (Zhurong area)", False, "Southern Utopia Planitia (Zhurong landing region)"),
    ("elysium_planitia", "Elysium Planitia (InSight)", False, None),
    ("xanthe_terra_tyras", "Xanthe Terra (Tyras Vallis delta)", False, "Xanthe Terra highlands"),
]
EARTH = [  # (id, comparison-sheet name prefix, approx coords?, display name, region, country)
    ("mcmurdo_dry_valleys", "University Valley", False, None, None, None),
    ("summit_station_greenland", "Summit Station", False, "Summit Station, Greenland Ice Sheet", "Greenland Ice Sheet summit", "Greenland (Denmark)"),
    ("south_pole_station", "Amundsen–Scott South Pole Station", False, "Amundsen–Scott South Pole Station", "Antarctic Plateau, geographic South Pole", "Antarctica"),
    ("painted_desert", "Painted Desert", False, "Painted Desert, Petrified Forest National Park", "Northeastern Arizona", "United States"),
    ("jaroso_ravine", "Jaroso Ravine", True, "Jaroso Ravine, Sierra Almagrera", "Almería, Andalusia", "Spain"),
    ("liwa_desert", "Liwa Desert", True, "Liwa Desert", "Abu Dhabi", "United Arab Emirates"),
    ("sudbury_impact_structure", "Sudbury impact structure", True, "Sudbury impact structure", "Ontario", "Canada"),
    ("yilgarn_salt_lakes", "Yilgarn Craton acid saline lakes", True, "Yilgarn Craton acid saline lakes", "Kalgoorlie region, Western Australia", "Australia"),
    ("granby_tuff", "Granby Basaltic Tuff", False, "Granby Basaltic Tuff", "Granby, Massachusetts (Connecticut Valley)", "United States"),
    ("galena_creek_rock_glacier", "Galena Creek Rock Glacier", True, "Galena Creek Rock Glacier", "Absaroka Mountains, Wyoming", "United States"),
    ("haughton_crater", "Haughton Crater", False, None, None, None),
    ("channeled_scablands", "Channeled Scablands", False, "Channeled Scablands", "Eastern Washington", "United States"),
    ("rio_tinto", "Río Tinto", False, "Río Tinto (Peña de Hierro, Nerva)", "Huelva, Andalusia", "Spain"),
    ("lake_salda", "Lake Salda", False, "Lake Salda", "Burdur, southwestern Turkey", "Turkey"),
    ("dalangtan_playa", "Dalangtan Playa", True, "Dalangtan Playa, western Qaidam Basin", "Qaidam Basin, Qinghai (NE Tibetan Plateau)", "China"),
    ("holuhraun_iceland", "Holuhraun lava field", False, None, None, None),
    ("svalbard_fan_delta", "Terraced fan-delta, Svalbard", False, "Terraced fan-delta, Svalbard", "Svalbard (Adventdalen area)", "Norway"),
]
# App coordinates kept for these merged sites (published mission/landing points within ~20 km of the workbook's).
KEEP_APP_COORDINATES = {"jezero_crater", "elysium_planitia", "oxia_planum", "chryse_planitia",
                        "mcmurdo_dry_valleys", "haughton_crater", "holuhraun_iceland"}

# Mars site label in the "Base Site Earth Analogs" sheet (parenthetical removed).
ANALOG_LABEL = {
    "amazonis_arcadia_ap8": "Amazonis / Arcadia Planitia", "planum_boreum": "Planum Boreum", "planum_australe": "Planum Australe",
    "mawrth_vallis": "Mawrth Vallis", "noctis_labyrinthus": "Noctis Labyrinthus", "hebrus_valles": "Hebrus Valles",
    "huygens_crater": "Huygens Crater", "columbus_crater": "Columbus Crater", "oxia_planum": "Oxia Planum",
    "deuteronilus_mensae": "Deuteronilus Mensae", "protonilus_mensae": "Protonilus Mensae", "chryse_planitia": "Chryse Planitia",
    "meridiani_planum": "Meridiani Planum", "jezero_crater": "Jezero Crater", "utopia_planitia": "Utopia Planitia",
    "elysium_planitia": "Elysium Planitia", "xanthe_terra_tyras": "Xanthe Terra",
}

# Mars-side approved sources per site (from the workbook's source lists, after review).
MARS_SOURCES = {
    "amazonis_arcadia_ap8": ["luzzi2025_ap8_ice"],
    "planum_boreum": ["nasa_pia10652_north_cap", "sinha2022_npld_sediments"],
    "planum_australe": ["nasa_pia03008_south_co2", "esa_mex_south_pole_water", "nasa_svs_767_mpl", "nasa_pia26773_south_pole_psyche"],
    "mawrth_vallis": ["esa_mex_mawrth_clays"],
    "noctis_labyrinthus": ["nasa_pia18632_noctis"],
    "hebrus_valles": ["sharma2025_hebrus_caves", "nasa_pia25359_hebrus", "hirise_esp_048036_2025_hebrus"],
    "huygens_crater": ["nasa_pia26775_huygens_psyche", "hirise_esp_094549_1655_huygens"],
    "columbus_crater": ["nasa_columbus_sulfates_clays", "wray2011_columbus_paleolakes", "liu2018_columbus_gypsum"],
    "oxia_planum": ["esa_oxia_planum", "mandon2021_oxia_clays"],
    "deuteronilus_mensae": ["chuang_crown2009_deuteronilus_map", "nasa_pia12996_deuteronilus"],
    "protonilus_mensae": ["levy2010_protonilus_gullies", "soare2022_protonilus_cycling"],
    "chryse_planitia": ["komatsu2016_chryse_edifices", "bao2026_chryse_mafic"],
    "meridiani_planum": ["hynek2017_meridiani"],
    "jezero_crater": ["nasa_jezero_delta_panorama", "brown2020_jezero_olivine_carbonate"],
    "utopia_planitia": ["hou2026_zhurong_mn_oxides"],
    "elysium_planitia": ["golombek2020_insight"],
    "xanthe_terra_tyras": ["hauber2009_xanthe_deltas"],
}
DARYA = "darya2024_mars_pv_wind"
# Mars cells with a known excluded-only origin (stored null with the reason).
MARS_EXCLUDED_CELLS = {
    ("huygens_crater", "mineralogy"): "The workbook's mineralogy sources for Huygens (Ackiss et al. 2013, NASA PIA13801, ESA Mars Express) are not on the approved list.",
    **{(sid, key): "The workbook's source for this value (Hartwick 2022) is not on the approved list."
       for sid in ("deuteronilus_mensae", "protonilus_mensae") for key in ("solar", "wind")},
}

# Earth-side attribution per cell, from the Earth Sources sheet's "What it supports"
# column. None = the cell's only support is an excluded source.
E = None
EARTH_CELL_SOURCES = {
    "mcmurdo_dry_valleys": {"terrain": ["marinova2022_university_valley", "mckay_marinova2025_ice_cemented_ground"], "mineralogy": ["goordial2016_university_valley"],
                            "elevation": ["marinova2022_university_valley"], "thermal": ["marinova2022_university_valley", "obryk2020_dry_valleys_climate"],
                            "solar": ["obryk2020_dry_valleys_climate"], "wind": ["obryk2020_dry_valleys_climate"]},
    "summit_station_greenland": {"terrain": E, "mineralogy": ["yoldi2020_greenland_old_ice"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "south_pole_station": {"terrain": E, "mineralogy": E, "elevation": E, "thermal": E, "solar": E, "wind": E},
    "painted_desert": {"terrain": E, "mineralogy": ["bishop2020_mawrth_horizons", "bishop2025_painted_desert"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "jaroso_ravine": {"terrain": ["demaret2022_jaroso_vents", "rull2021_jaroso"], "mineralogy": ["rull2021_jaroso", "demaret2022_jaroso_vents"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "liwa_desert": {"terrain": ["krishnamoorthi2025_uae_dunes"], "mineralogy": ["krishnamoorthi2025_uae_dunes"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "sudbury_impact_structure": {"terrain": ["lambert_reimold2023_impact_analogs", "moores2012_sudbury_sample_return"], "mineralogy": ["lambert_reimold2023_impact_analogs"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "yilgarn_salt_lakes": {"terrain": ["nasa_ecca_plattner"], "mineralogy": ["nasa_ecca_plattner", "aerts2019_yilgarn_lakes"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "granby_tuff": {"terrain": E, "mineralogy": ["krzesinska2021_oxia_granby", "bultel2022_granby_vermiculite", "bultel2025_granby_alteration", "bultel2026_granby_modeling"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "galena_creek_rock_glacier": {"terrain": ["petersen2019_galena_creek", "aguilar2026_rock_glacier_continuum", "aguilar2024_drone_gpr"], "mineralogy": ["meng2022_rock_glacier_radio", "petersen2019_galena_creek"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "haughton_crater": {"terrain": ["ntrs_haughton_gullies"], "mineralogy": ["ntrs_haughton_gullies"], "elevation": E, "thermal": ["ntrs_haughton_gullies"], "solar": E, "wind": E},
    "channeled_scablands": {"terrain": ["nasa_eo_channeled_scablands", "nasa_pj_ares_vallis"], "mineralogy": ["nasa_eo_channeled_scablands"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "rio_tinto": {"terrain": ["amils2014_rio_tinto", "nasa_lmap_rio_tinto"], "mineralogy": ["amils2014_rio_tinto", "sobron2014_rio_tinto"], "elevation": E, "thermal": E, "solar": E, "wind": E},
    "lake_salda": {"terrain": ["ustaoglu2023_salda_climate", "gunes2024_salda_microbialites"], "mineralogy": ["gunes2024_salda_microbialites"], "elevation": ["ustaoglu2023_salda_climate"],
                   "thermal": ["ustaoglu2023_salda_climate"], "solar": E, "wind": ["ustaoglu2023_salda_climate"]},
    "dalangtan_playa": {"terrain": ["kong2018_dalangtan", "angles_li2017_qaidam", "zhu2025_qaidam_polygons"], "mineralogy": ["kong2018_dalangtan", "zhu2025_qaidam_polygons"],
                        "elevation": ["kong2018_dalangtan"], "thermal": ["kong2018_dalangtan"], "solar": ["kong2018_dalangtan"], "wind": ["kong2018_dalangtan"]},
    "holuhraun_iceland": {"terrain": ["lit_holuhraun", "voigt2025_holuhraun"], "mineralogy": ["voigt2025_holuhraun", "lit_holuhraun"],
                          "elevation": E, "thermal": ["lit_holuhraun"], "solar": E, "wind": E},
    "svalbard_fan_delta": {"terrain": ["gilbert2018_svalbard_fjord_valley"], "mineralogy": E, "elevation": E, "thermal": E, "solar": E, "wind": E},
}
EARTH_PAIR_SOURCES = {  # every approved Earth-side source of a pair (for Astro and the Compare tab)
    eid: sorted({s for v in cells.values() if v for s in v}) for eid, cells in EARTH_CELL_SOURCES.items()
}
# Approved sources the workbook cites for a pair as a whole (analog context), not for one cell.
PAIR_CONTEXT_SOURCES = {
    "south_pole_station": ["esa_concordia_analogue"],
    "holuhraun_iceland": ["dundas2020_holuhraun_lava_water", "gwizd2024_holuhraun_raven"],
}
for _eid, _extra in PAIR_CONTEXT_SOURCES.items():
    EARTH_PAIR_SOURCES[_eid] = sorted(set(EARTH_PAIR_SOURCES[_eid]) | set(_extra))


# --------------------------------------------------------------------------
# Workbook reading (stdlib only: the .xlsx is a zip of XML parts)
# --------------------------------------------------------------------------
def read_sheets(path: str) -> dict[str, dict[int, dict[str, str]]]:
    z = zipfile.ZipFile(path)
    shared = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))
              for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rel = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out: dict[str, dict[int, dict[str, str]]] = {}
    for sh in wb.find("m:sheets", NS):
        target = "xl/" + rel[sh.get("{%s}id" % NS["r"])].lstrip("/").removeprefix("xl/")
        rows: dict[int, dict[str, str]] = {}
        for row in ET.fromstring(z.read(target)).iter("{%s}row" % NS["m"]):
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if c.get("t") == "s" and v is not None:
                    val = shared[int(v.text)]
                elif c.get("t") == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                else:
                    val = v.text if v is not None else None
                if val is None:
                    continue
                ref = c.get("r")
                col = re.match(r"[A-Z]+", ref).group()
                rows.setdefault(int(ref[len(col):]), {})[col] = val
        out[sh.get("name")] = rows
    return out


def clean(text: str | None) -> tuple[str | None, str | None]:
    """Workbook cell -> (value, note). "—" means not found in sources: null.
    "— (reason)" keeps the reason as a note. Whitespace is normalised."""
    if text is None:
        return None, None
    t = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()
    if not t:
        return None, None
    if t.startswith("—"):
        rest = t[1:].strip()
        return None, (rest.strip("()").strip() or None) if rest else None
    return t, None


def coord(text: str) -> float:
    """Undo binary float artefacts (18.399999999999999 -> 18.4)."""
    return float(f"{float(text):.6g}")


def cell(key, label, text, sources, provenance, excluded_reason=None):
    value, note = clean(text)
    if value is not None and excluded_reason:
        return {"feature": key, "label": label, "text": None, "note": excluded_reason, "status": "excluded_source",
                "workbook_text_withheld": True, "source_ids": [], "provenance": provenance}
    return {"feature": key, "label": label, "text": value, "note": note,
            "status": "not_found_in_sources" if value is None else "pending_verification",
            "source_ids": [] if value is None else list(sources), "provenance": provenance}


def main(path: str) -> int:
    S = read_sheets(path)
    comp, base, analogs = S["Mars + Earth Comparison"], S["Base Sites"], S["Base Site Earth Analogs"]
    roles = [r["A"] for _, r in sorted(S["Dropdown options"].items())]
    assert roles == ROLES, roles

    def find(rows, prefix, col="A", start=4):
        hits = [(n, r) for n, r in rows.items() if n >= start and r.get(col, "").rstrip("*").strip().startswith(prefix)]
        assert len(hits) == 1, (prefix, [h[0] for h in hits])
        return hits[0][1]

    mars_out, earth_out = [], []
    for (mid, mname, approx, region), (eid, ename, eapprox, edisp, eregion, ecountry) in zip(MARS, EARTH):
        c = find(comp, mname)
        b = find(base, mname)
        assert c["B"].startswith(ename) or ename in c["B"], (mid, c["B"])
        role = c["C"].strip()
        assert role in ROLES and b["B"].strip() == role, (mid, role, b["B"])
        lat, lon = coord(c["R"]), coord(c["S"])
        assert (coord(b["J"]), coord(b["K"])) == (lat, lon), mid
        msrc = MARS_SOURCES[mid]
        prov = "literature-reported (workbook author)"
        base_cols = dict(zip(["terrain", "mineralogy", "elevation", "thermal", "solar", "water_ice"], "DEFGHI"))
        comp_mars = dict(zip(["terrain", "mineralogy", "elevation", "thermal", "solar", "wind", "water_ice"], "EGIKMOQ"))
        comp_earth = dict(zip(["terrain", "mineralogy", "elevation", "thermal", "solar", "wind"], "FHJLNP"))

        def msources(key, text):
            # solar+wind kWh figures are Darya et al. 2024's; every other cell carries the site's approved sources
            return [DARYA] if key == "solar" and "kWh" in (text or "") else msrc
        conditions = []
        for key, label in CONDITIONS:
            excl = MARS_EXCLUDED_CELLS.get((mid, key))
            text = b.get(base_cols[key]) if key in base_cols else c.get(comp_mars[key])
            conditions.append(cell(key, label, text, msources(key, text), prov, excl))
        pair_mars, pair_earth = [], []
        for key, label in CONDITIONS:
            excl = MARS_EXCLUDED_CELLS.get((mid, key))
            mt = c.get(comp_mars[key])
            pair_mars.append(cell(key, label, mt, msources(key, mt), prov, excl))
            if key in comp_earth:
                es = EARTH_CELL_SOURCES[eid][key]
                pair_earth.append(cell(key, label, c.get(comp_earth[key]), es or [], prov,
                                       None if es is not None else "The workbook's source for this value is not on the approved source list."))
        extra = []
        for n, r in sorted(analogs.items()):
            if n < 4 or not r.get("A"):
                continue
            if re.sub(r"\s*\(.*?\)\s*$", "", r["A"]).strip() != ANALOG_LABEL[mid]:
                continue
            alat = coord(r["F"]) if r.get("F") else None
            alon = coord(r["G"]) if r.get("G") else None
            extra.append({"label": r["A"].strip(), "analog": r["B"].strip(), "where": clean(r.get("C"))[0], "matches": clean(r.get("D"))[0],
                          "does_not_match": clean(r.get("E"))[0], "lat": alat, "lon_east": alon, "coordinates_approximate": True,
                          "workbook_source_text": clean(r.get("H"))[0]})
        notes = clean(b.get("C"))[0]
        mars_out.append({
            "id": mid, "name": mname, "role": role, "notes": notes, "lat": lat, "lon_east": lon,
            "coordinates_approximate": approx, "keep_app_coordinates": mid in KEEP_APP_COORDINATES, "region": region,
            "paired_earth_site_id": eid, "why_they_match": clean(c.get("D"))[0],
            "conditions": conditions, "earth_analogs": extra, "source_ids": ([DARYA] if any(DARYA in x["source_ids"] for x in conditions) else []) + msrc,
            "workbook_citations": [p.strip() for p in re.split(r";\s*", b.get("L", "")) if p.strip()],
        })
        earth_out.append({
            "id": eid, "name": edisp or c["B"].strip(), "workbook_name": c["B"].strip(), "region": eregion, "country": ecountry,
            "lat": coord(c["T"]), "lon_east": coord(c["U"]), "coordinates_approximate": eapprox,
            "keep_app_coordinates": eid in KEEP_APP_COORDINATES, "paired_mars_site_id": mid,
            "source_ids": EARTH_PAIR_SOURCES[eid],
            "workbook_citations": [p.strip() for p in re.split(r";\s*", c.get("W", "")) if p.strip()],
        })
        mars_out[-1]["pair"] = {"mars": pair_mars, "earth": pair_earth}

    used = {s for m in mars_out for s in m["source_ids"]} | {s for e in earth_out for s in e["source_ids"]}
    unused = sorted(set(SOURCES) - used)
    assert not unused, f"approved sources no site uses: {unused}"
    doc = {
        "version": "lesser-known-mars-sites-v1",
        "workbook": Path(path).name,
        "imported_from_sheets": list(S),
        "source_rule": "Research articles with a DOI, or official NASA / CSA / ESA / JAXA pages, plus sources the owner approved by name (reviewed 2026-11-15).",
        "provenance_note": "Condition texts are literature-reported descriptions compiled by the workbook author. They are not measurements, are never scored, and are kept apart from values computed from MOLA, Copernicus DEM and NASA POWER.",
        "roles": ROLES,
        "sources": {k: {"source_id": k, **v} for k, v in SOURCES.items()},
        "excluded_citations": EXCLUDED,
        "mars_sites": mars_out,
        "earth_sites": earth_out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(mars_out)} Mars sites, {len(earth_out)} Earth sites, {len(SOURCES)} sources)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    raise SystemExit(main(sys.argv[1]))
