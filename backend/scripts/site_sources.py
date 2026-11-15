"""Registry of the sources approved for the 17 Mars sites and their Earth analogs.

Only these sources are read for site information (conditions, labels, analog
links) and ingested for the Mission Design assistant. kind: doi (research
article with a DOI) | agency (NASA / ESA page) | approved_exception (a page the
owner approved by name). `restriction` records an owner condition on how a
source may be used; scripts/ingest_documents.py enforces it on the text.
"""
from __future__ import annotations

CONDITIONS = [  # (key, label)
    ("terrain", "Terrain"), ("mineralogy", "Mineralogy"), ("elevation", "Elevation"), ("thermal", "Thermal"),
    ("solar", "Solar / power"), ("wind", "Wind"), ("water_ice", "Water / ice"),
]
ROLES = ["Base candidate", "Resource site", "To evaluate", "Instrument testing", "Context only"]


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


# App coordinates kept for these merged sites (published mission / landing points).
KEEP_APP_COORDINATES = {"jezero_crater", "elysium_planitia", "oxia_planum", "chryse_planitia",
                        "mcmurdo_dry_valleys", "haughton_crater", "holuhraun_iceland"}


# Approved sources to read for each Mars site.
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
# Approved sources to read for each Earth-site condition (None: no approved source covers it).
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
# Approved sources about a pair as a whole (analog context), not one condition.
PAIR_CONTEXT_SOURCES = {
    "south_pole_station": ["esa_concordia_analogue"],
    "holuhraun_iceland": ["dundas2020_holuhraun_lava_water", "gwizd2024_holuhraun_raven"],
}
for _eid, _extra in PAIR_CONTEXT_SOURCES.items():
    EARTH_PAIR_SOURCES[_eid] = sorted(set(EARTH_PAIR_SOURCES[_eid]) | set(_extra))


# The 17 Mars sites and their paired Earth locations: (mars id, earth id).
# Regions state only what an approved source says about where the site is.
MARS_SITES = {  # id: (name, region, coordinates approximate?)
    "amazonis_arcadia_ap8": ("Amazonis / Arcadia Planitia (AP-8)", "Boundary of Arcadia and northern Amazonis Planitia", True),
    "planum_boreum": ("North Pole (Planum Boreum)", "North polar ice cap", True),
    "planum_australe": ("South Pole (Planum Australe)", "South polar cap", False),
    "mawrth_vallis": ("Mawrth Vallis", "Mawrth Vallis region", False),
    "noctis_labyrinthus": ("Noctis Labyrinthus", "Noctis Labyrinthus", False),
    "hebrus_valles": ("Hebrus Valles", "Northern lowlands west of the Elysium volcanic region", False),
    "huygens_crater": ("Huygens Crater", "Southern highlands", False),
    "columbus_crater": ("Columbus Crater", "Terra Sirenum", False),
    "oxia_planum": ("Oxia Planum", None, False),
    "deuteronilus_mensae": ("Deuteronilus Mensae", "Deuteronilus Mensae", False),
    "protonilus_mensae": ("Protonilus Mensae", "Protonilus Mensae", False),
    "chryse_planitia": ("Chryse Planitia", None, False),
    "meridiani_planum": ("Meridiani Planum", None, False),
    "jezero_crater": ("Jezero Crater", None, True),
    "utopia_planitia": ("Utopia Planitia", "Utopia Planitia", False),
    "elysium_planitia": ("Elysium Planitia (InSight)", None, False),
    "xanthe_terra_tyras": ("Xanthe Terra", "Xanthe Terra", False),
}
EARTH_SITES = {  # id: (paired Mars id, name, region, country, coordinates approximate?)
    "mcmurdo_dry_valleys": ("amazonis_arcadia_ap8", None, None, None, False),
    "summit_station_greenland": ("planum_boreum", "Summit Station, Greenland Ice Sheet", "Greenland Ice Sheet", "Greenland", False),
    "south_pole_station": ("planum_australe", "Amundsen–Scott South Pole Station", "Antarctica", "Antarctica", False),
    "painted_desert": ("mawrth_vallis", "Painted Desert", "Arizona", "United States", False),
    "jaroso_ravine": ("noctis_labyrinthus", "Jaroso Ravine", "Jaroso hydrothermal system, SE Spain", "Spain", True),
    "liwa_desert": ("hebrus_valles", "Liwa Desert", "United Arab Emirates", "United Arab Emirates", True),
    "sudbury_impact_structure": ("huygens_crater", "Sudbury impact structure", "Ontario", "Canada", True),
    "yilgarn_salt_lakes": ("columbus_crater", "Yilgarn Craton salt lakes", "Yilgarn Craton", "Australia", True),
    "granby_tuff": ("oxia_planum", "Granby tuff", "Granby, Massachusetts", "United States", False),
    "galena_creek_rock_glacier": ("deuteronilus_mensae", "Galena Creek Rock Glacier", "Wyoming", "United States", True),
    "haughton_crater": ("protonilus_mensae", None, None, None, False),
    "channeled_scablands": ("chryse_planitia", "Channeled Scablands", "Columbia Plateau, eastern Washington", "United States", False),
    "rio_tinto": ("meridiani_planum", "Río Tinto", "Tinto basin", "Spain", False),
    "lake_salda": ("jezero_crater", "Lake Salda", "Lake Salda", "Turkey", False),
    "dalangtan_playa": ("utopia_planitia", "Dalangtan Playa", "Qaidam Basin, Tibetan Plateau", "China", True),
    "holuhraun_iceland": ("elysium_planitia", None, None, None, False),
    "svalbard_fan_delta": ("xanthe_terra_tyras", "Adventdalen delta, Svalbard", "Adventdalen, Spitsbergen", "Norway", False),
}
