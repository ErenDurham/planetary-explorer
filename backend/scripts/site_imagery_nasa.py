"""Build the verified site-imagery manifest.

Two kinds of entries:

1. CTX context mosaics stitched by scripts/site_imagery_ctx.py (read from
   data/imagery/ctx_context.json): exact bounds from the tile grid.
2. Curated NASA/JPL products from the NASA Image and Video Library
   (images-api.nasa.gov, no key). For each product the API's metadata is
   fetched at build time (title, credit, release date, description), the
   asset is downloaded from images-assets.nasa.gov, checked for MIME type and
   size, measured with Pillow and cached under data/imagery/assets/. The
   geographic relationship, acquisition date and caveats below were verified
   by hand against the product captions on 2026-11-14 and are recorded as
   such; anything not stated by the source is null, never guessed.

Licence: NASA/JPL imagery is not copyrighted and may be used for any purpose
with credit (NASA Media Usage Guidelines); credit lines are copied from the
product metadata. The CTX mosaic: free use of beta01 for all purposes, credit
NASA/JPL/MSSS/The Murray Lab (Esri-hosted tiles via NASA Solar System Treks).

Run from backend/:  python scripts/site_imagery_nasa.py
"""
from __future__ import annotations

import io
import json
import math
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from PIL import Image

BACKEND = Path(__file__).resolve().parents[1]
IMG = BACKEND / "data" / "imagery"
ASSETS = IMG / "assets"
ALLOWLIST = ["images-assets.nasa.gov", "images-api.nasa.gov", "astro.arcgis.com", "trek.nasa.gov", "photojournal.jpl.nasa.gov", "science.nasa.gov",
             "gibs.earthdata.nasa.gov", "upload.wikimedia.org", "thumb.wikimedia.org", "commons.wikimedia.org"]
MAX_BYTES = 6_000_000
UA = "PlanetaryExplorer/0.1 (hackathon; contact via repository)"
TODAY = date.today().isoformat()

# Curated products. Fields verified by hand against the NASA captions.
NASA_PRODUCTS: list[dict] = [
    # ---- Jezero (Perseverance) ----
    dict(entry_id="jezero_hirise_hardware", site_id="jezero_crater", nasa_id="PIA24333", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="Mars 2020 / MRO",
         acquisition_date="2021-02-19", acquisition_note="Caption: image taken on Feb. 19, 2021, the day after landing.", relationship="exact_location", distance_km=0.0,
         coverage="Caption states the rover sits at the centre of the sky-crane blast pattern; the candidate coordinate is the Perseverance touchdown point.",
         relevance="The exact landing location seen from orbit, with the descent-stage debris, heat shield and parachute. Shows the terrain at the candidate point itself.",
         appearance="HiRISE enhanced colour; relative contrast stretched to show hardware."),
    dict(entry_id="jezero_hirise_candidate", site_id="jezero_crater", nasa_id="PIA19303", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="MRO",
         acquisition_date=None, acquisition_note="Acquisition date not stated on the product page; released 2015 during landing-site selection.", relationship="candidate_region", distance_km=None,
         coverage="Caption: 'a possible landing site for the 2020 mission: Jezero Crater' imaged to identify hazards within a landing ellipse; the exact offset of this scene from the final touchdown point is not stated.",
         relevance="Landing-ellipse scale HiRISE view used in site selection; somewhere within the Jezero landing region, not necessarily the touchdown point.",
         appearance="HiRISE enhanced colour (not natural colour)."),
    dict(entry_id="jezero_mastcamz_pano", site_id="jezero_crater", nasa_id="PIA24264", view="surface", image_type="surface_panorama", instrument="Mastcam-Z (Perseverance)", mission="Mars 2020",
         acquisition_date="2021-02-21", acquisition_note="Caption: 142 images taken on Sol 3 (Feb. 21, 2021).", relationship="exact_location", distance_km=0.0,
         coverage="First 360-degree panorama from the rover at its landing site (Octavia E. Butler Landing); the candidate coordinate is that touchdown point.",
         relevance="What the ground looks like at the candidate point: the surface panorama from the landing site, with the crater rim on the horizon.",
         appearance="Mastcam-Z colour balanced for Earth-like lighting; the horizon is tens of kilometres away."),
    # ---- Gale (Curiosity) ----
    dict(entry_id="gale_hirise_hardware", site_id="gale_crater", nasa_id="PIA16001", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="MSL / MRO",
         acquisition_date=None, acquisition_note="Caption: captured about 24 hours after the 6 Aug 2012 landing; exact date not stated.", relationship="exact_location", distance_km=0.0,
         coverage="Caption: the four pieces of landing hardware spotted by MRO; Bradbury Landing is the candidate coordinate.",
         relevance="The landing point and its surroundings from orbit, with the rover, heat shield, parachute and descent stage marked.",
         appearance="HiRISE image; contrast adjusted to show hardware."),
    dict(entry_id="gale_mastcam_pano", site_id="gale_crater", nasa_id="PIA16029", view="surface", image_type="surface_panorama", instrument="Mastcam (Curiosity)", mission="MSL",
         acquisition_date=None, acquisition_note="First 360-degree colour panorama from the landing site, assembled from thumbnails within days of the 6 Aug 2012 landing; sol not stated on the page.", relationship="exact_location", distance_km=0.0,
         coverage="Caption: first 360-degree colour panorama of the Gale Crater landing site (Bradbury Landing), which is the candidate coordinate.",
         relevance="Ground view from the landing point: the crater floor with Mount Sharp and the crater rim on the horizon.",
         appearance="Thumbnail-resolution mosaic; colours as returned by Mastcam."),
    # ---- Elysium (InSight) ----
    dict(entry_id="elysium_hirise_hardware", site_id="elysium_planitia", nasa_id="PIA22875", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="InSight / MRO",
         acquisition_date="2018-12-06", acquisition_note="Caption: imaged on Dec. 6 and 11, 2018.", relationship="exact_location", distance_km=0.0,
         coverage="Caption: InSight, its heat shield and parachute imaged by HiRISE; the candidate coordinate is the InSight landing point.",
         relevance="The landing point from orbit on the smooth Elysium plain, with the lander and its discarded hardware.",
         appearance="HiRISE enhanced colour; hardware appears as bright specks."),
    dict(entry_id="elysium_icc_first", site_id="elysium_planitia", nasa_id="PIA22829", view="surface", image_type="surface_image", instrument="Instrument Context Camera (InSight)", mission="InSight",
         acquisition_date="2018-11-26", acquisition_note="Caption: obtained shortly after landing on Nov. 26, 2018, with the transparent lens cover still on.", relationship="exact_location", distance_km=0.0,
         coverage="First image from the lander at its landing point, the candidate coordinate.",
         relevance="The ground at the candidate point moments after landing; dust on the lens cover speckles the view.",
         appearance="Fisheye camera below the deck; lens cover in place, so the image is dusty and distorted."),
    # ---- Chryse (Viking 1) ----
    dict(entry_id="chryse_moc_regional", site_id="chryse_planitia", nasa_id="PIA02000", view="orbital", image_type="orbital_image", instrument="MOC wide-angle (Mars Global Surveyor)", mission="MGS",
         acquisition_date=None, acquisition_note="Composite of 9 red and 9 blue MOC strips; acquisition dates not stated on the page (released 2000-06-14).", relationship="candidate_region", distance_km=None,
         coverage="Caption: shows the Chryse plains region where Viking 1 and Pathfinder landed; a hemispheric-scale view hundreds of kilometres across.",
         relevance="Regional context only: the Chryse basin and outflow channels at a scale far wider than the candidate footprint.",
         appearance="MOC red/blue colour composite with clouds; not true colour."),
    dict(entry_id="chryse_viking1_first_color", site_id="chryse_planitia", nasa_id="PIA00563", view="surface", image_type="surface_image", instrument="Viking Lander 1 Camera 2", mission="Viking",
         acquisition_date=None, acquisition_note="Product page states spacecraft and camera but not the acquisition date (first colour image after the July 1976 landing).", relationship="exact_location", distance_km=0.0,
         coverage="Taken from the lander at its landing point, the candidate coordinate.",
         relevance="The first colour view of the surface at the Viking 1 site: rocky plain and drift material.",
         appearance="1976 vidicon colour reconstruction; colours are approximate."),
    dict(entry_id="chryse_viking1_afternoon", site_id="chryse_planitia", nasa_id="PIA03165", view="surface", image_type="surface_panorama", instrument="Viking Lander 1 Camera 1", mission="Viking",
         acquisition_date=None, acquisition_note="Mosaic assembled from Viking Lander 1 frames; acquisition dates not stated (released 2001).", relationship="exact_location", distance_km=0.0,
         coverage="Lander camera mosaic from the landing point, the candidate coordinate.",
         relevance="Wide afternoon mosaic of the Chryse Planitia surface around the lander.",
         appearance="Reprocessed 1970s lander data; colour approximate."),
    # ---- Utopia (Viking 2) ----
    dict(entry_id="utopia_themis_regional", site_id="utopia_planitia", nasa_id="PIA04023", view="orbital", image_type="orbital_image", instrument="THEMIS infrared band 9 (Mars Odyssey)", mission="Mars Odyssey",
         acquisition_date=None, acquisition_note="Acquisition date not stated (released 2002-12-13).", relationship="candidate_region", distance_km=None,
         coverage="Caption: covers the Viking 2 landing site marked with an X; it also states the lander's exact location is less well established than Viking 1's.",
         relevance="Regional thermal-infrared view of the Utopia plain around the landing site, showing pedestal craters and gentle ridges.",
         appearance="Single-band THEMIS infrared (12.6 micron) brightness, not visible colour."),
    dict(entry_id="utopia_viking2_first_color", site_id="utopia_planitia", nasa_id="PIA00568", view="surface", image_type="surface_image", instrument="Viking Lander 2 Camera 2", mission="Viking",
         acquisition_date=None, acquisition_note="Product page states spacecraft and camera but not the acquisition date (first colour image after the Sept 1976 landing).", relationship="exact_location", distance_km=0.0,
         coverage="Taken from the lander at its landing point, the candidate coordinate.",
         relevance="The first colour view of the surface at the Viking 2 site: a rock-strewn plain.",
         appearance="1976 vidicon colour reconstruction; colours are approximate."),
    # ---- Meridiani (Opportunity) ----
    dict(entry_id="meridiani_hirise_eagle", site_id="meridiani_planum", nasa_id="PIA21494", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="MER / MRO",
         acquisition_date="2017-04-08", acquisition_note="Caption: April 8, 2017 observation.", relationship="exact_location", distance_km=0.0,
         coverage="Caption gives Eagle Crater at 1.95 S, 354.47 E with the lander platform visible; the candidate coordinate is that landing point.",
         relevance="Eagle Crater (about 22 m across) and the plains around it from orbit, with the landing platform still visible.",
         appearance="HiRISE colour; small crater inside a flat plain."),
    dict(entry_id="meridiani_pancam_eagle", site_id="meridiani_planum", nasa_id="PIA05163", view="surface", image_type="surface_image", instrument="Panoramic Camera (Opportunity)", mission="MER",
         acquisition_date=None, acquisition_note="Released 2004-01-28, four days after landing inside Eagle Crater; sol not stated on the page.", relationship="exact_location", distance_km=0.0,
         coverage="Pancam view from inside Eagle Crater, where the rover landed; the crater is about 22 m across so the camera position is within tens of metres of the candidate coordinate.",
         relevance="The bedrock outcrop inside the landing crater; the plains beyond are what the candidate footprint mostly consists of.",
         appearance="Pancam colour mosaic of an outcrop inside a small crater, not the open plain."),
    # ---- Gusev (Spirit) ----
    dict(entry_id="gusev_pancam_pano", site_id="gusev_crater", nasa_id="PIA05049", view="surface", image_type="surface_panorama", instrument="Panoramic Camera (Spirit)", mission="MER",
         acquisition_date=None, acquisition_note="Released 2004-01-12, eight days after landing; sol not stated on the page.", relationship="exact_location", distance_km=0.0,
         coverage="Pancam panorama taken from the landing platform at Columbia Memorial Station, the candidate coordinate.",
         relevance="The Gusev plains from the landing point: rock-strewn basaltic surface with the Columbia Hills on the horizon.",
         appearance="Pancam colour mosaic; horizon features are kilometres away."),
    # ---- Oxia Planum (no landed mission) ----
    dict(entry_id="oxia_hirise_clay", site_id="oxia_planum", nasa_id="PIA19851", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="MRO",
         acquisition_date=None, acquisition_note="Acquisition date not stated (released 2015-07-01).", relationship="candidate_region", distance_km=None,
         coverage="Caption: HiRISE view of the proposed ExoMars landing site in Oxia Planum; its offset from the ellipse centre used here is not stated.",
         relevance="Clay-rich terrain within the Oxia Planum landing region; the exact position relative to the candidate coordinate is unknown.",
         appearance="HiRISE enhanced colour."),
    dict(entry_id="oxia_hirise_region", site_id="oxia_planum", nasa_id="PIA18817", view="orbital", image_type="orbital_image", instrument="HiRISE (MRO)", mission="MRO",
         acquisition_date=None, acquisition_note="Acquisition date not stated (released 2014-10-01).", relationship="candidate_region", distance_km=None,
         coverage="Caption: proposed future landing site in Oxia Planum, between Mawrth and Ares Vallis; offset from the candidate coordinate not stated.",
         relevance="Another HiRISE view of the Oxia Planum candidate region.",
         appearance="HiRISE enhanced colour."),
]


# ---- Earth field photographs ------------------------------------------------
# NASA Image and Video Library products (official): same pipeline as Mars.
EARTH_NASA_PRODUCTS: list[dict] = [
    dict(entry_id="haughton_hmp_k10_survey", site_id="haughton_crater", nasa_id="ARC-2007-ACD07-0170-005", view="surface", image_type="surface_image", instrument="Field photograph (NASA Ames)", mission="Haughton-Mars Project 2007",
         acquisition_date="2007-07-19", acquisition_note="Library date_created 2007-07-19 during the HMP 2007 field season; caption credits Matt Deans (NASA).", relationship="candidate_region", distance_km=None,
         coverage="Caption: K-10 rovers conducting a site survey at Haughton Crater, Devon Island; the exact spot within the ~23 km crater relative to the candidate centre is not stated.",
         relevance="Ground view of the Haughton polar-desert terrain used for rover trials - what the crater floor actually looks like.", appearance="Ordinary daylight photograph; shows rovers and people for scale."),
    dict(entry_id="haughton_hmp_k10_fortress", site_id="haughton_crater", nasa_id="ARC-2007-ACD09-0255-001", view="surface", image_type="surface_image", instrument="Field photograph (NASA Ames)", mission="Haughton-Mars Project 2007",
         acquisition_date="2007-07-15", acquisition_note="Library date_created 2007-07-15; caption credits NASA/Lorenzo Fluckiger.", relationship="candidate_region", distance_km=None,
         coverage="Caption: K-10 Red driving near 'The Fortress' formation at Haughton Crater, Devon Island; position within the crater not stated.",
         relevance="Impact-breccia outcrop and rubble terrain inside the crater, with a rover for scale.", appearance="Ordinary daylight photograph."),
    dict(entry_id="holuhraun_artemis_training", site_id="holuhraun_iceland", nasa_id="jsc2024e055198", view="surface", image_type="surface_image", instrument="Field photograph (NASA JSC, Robert Markowitz)", mission="Artemis II crew geology training, 2024",
         acquisition_date=None, acquisition_note="Library date_created 2024-08-01; the exact day is not stated in the caption.", relationship="nearby_scene", distance_km=None,
         coverage="Caption: a view of the Holuhraun lava field from the Bárðarbunga volcano; the camera stands on the volcano looking toward the lava field, not inside the candidate footprint.",
         relevance="What the rubbly basaltic lava flow looks like from the ground, partially buried by wind-blown sediment.", appearance="Ordinary daylight photograph taken from a distance; foreground is the volcano flank."),
]
# Wikimedia Commons products: US-government (public domain) or Creative Commons files.
# Licence, author and credit are read from the file's extmetadata at build time and recorded verbatim.
COMMONS_PRODUCTS: list[dict] = [
    dict(entry_id="mcmurdo_beacon_valley_nsf", site_id="mcmurdo_dry_valleys", title="File:Beacon Valley 2019-02-04 01.jpg", view="surface", image_type="surface_image", instrument="Field photograph (NSF / USAP photo library)", mission="US Antarctic Program",
         acquisition_date="2019-02-04", acquisition_note="Commons DateTimeOriginal 2019-02-04; source is the USAP photo library.", relationship="nearby_scene", distance_km=8.0,
         coverage="Beacon Valley is the main trunk valley; University Valley (the candidate centre) is a hanging valley on its south side a few kilometres away.",
         relevance="The Dry Valleys surface as it is: rock-mantled, ice-cemented ground with no vegetation, instrumented for weathering studies.", appearance="Ordinary daylight photograph."),
    dict(entry_id="mcmurdo_beacon_valley_nasa", site_id="mcmurdo_dry_valleys", title="File:Beacon Valley.jpg", view="surface", image_type="surface_image", instrument="Field photograph (Alfonso Davila, NASA)", mission="NASA Ames Antarctic analog field work",
         acquisition_date=None, acquisition_note="Commons records the date as unknown.", relationship="nearby_scene", distance_km=8.0,
         coverage="Beacon Valley, adjacent to the University Valley candidate centre.", relevance="Wide view of the rocky valley floor over buried glacial ice, the permafrost analog terrain.", appearance="Ordinary daylight photograph."),
    dict(entry_id="death_valley_badwater_salt_nps", site_id="death_valley", title="File:Salt detail, Badwater Basin.JPG", view="surface", image_type="surface_image", instrument="Field photograph (National Park Service)", mission="Death Valley National Park",
         acquisition_date="2006-11-28", acquisition_note="Commons DateTimeOriginal 28 November 2006 (from EXIF).", relationship="nearby_scene", distance_km=25.0,
         coverage="Badwater Basin lies about 25 km south of the candidate footprint centre, within the same valley floor.", relevance="Evaporite salt crust of the valley floor - the playa surface the candidate footprint includes.", appearance="Close-up daylight photograph; not a landscape view."),
    dict(entry_id="death_valley_mesquite_dunes_nps", site_id="death_valley", title="File:Mesquite Flat Sand Dunes.jpg", view="surface", image_type="surface_image", instrument="Field photograph (National Park Service)", mission="Death Valley National Park",
         acquisition_date="2006-12-06", acquisition_note="Commons DateTimeOriginal 6 December 2006 (from EXIF).", relationship="nearby_scene", distance_km=20.0,
         coverage="Mesquite Flat near Stovepipe Wells, in central Death Valley, roughly 20 km north-west of the candidate footprint centre.", relevance="Dune field and basin-and-range backdrop typical of the valley floor.", appearance="Ordinary daylight photograph."),
    dict(entry_id="mauna_kea_summit_usgs", site_id="mauna_kea_summit", title="File:Mauna Kea Summit in Winter.jpg", view="surface", image_type="surface_image", instrument="Field photograph (USGS)", mission="USGS",
         acquisition_date="2011-08-09", acquisition_note="Commons DateTimeOriginal 2011-08-09.", relationship="exact_location", distance_km=0.0,
         coverage="The summit region, which is the candidate footprint centre.", relevance="Cinder cones of the summit region (here under snow): the tephra and basalt slopes used for ISRU and rover trials.", appearance="Small (800x400) daylight photograph with seasonal snow, which the analog tests avoid."),
    dict(entry_id="mauna_kea_puu_cc", site_id="mauna_kea_summit", title="File:Pu'u on Mauna Kea.jpg", view="surface", image_type="surface_image", instrument="Field photograph (Commons contributor)", mission=None,
         acquisition_date="2025-06-11", acquisition_note="Commons DateTimeOriginal 2025-06-11.", relationship="candidate_region", distance_km=None,
         coverage="A cinder cone (pu'u) on Mauna Kea's upper slopes; exact position relative to the summit not stated.", relevance="Close view of the reddish tephra cone surfaces that make the upper mountain a Mars analog.", appearance="Ordinary daylight photograph."),
    dict(entry_id="mdrs_bdj_landscape", site_id="mdrs_utah", title="File:Mars Desert Research Station (10.3897-BDJ.8.e55063) Figure 1 a.jpeg", view="surface", image_type="surface_image", instrument="Field photograph (Sokoloff et al. 2020, Biodiversity Data Journal, CC BY 4.0)", mission="MDRS biodiversity survey",
         acquisition_date=None, acquisition_note="Figure from a 2020 open-access paper; the photograph date is not stated on Commons.", relationship="exact_location", distance_km=0.0,
         coverage="Landscape at the Mars Desert Research Station, which is the candidate footprint centre.", relevance="The badland terrain around the station: Jurassic-Cretaceous mudstone and sandstone slopes.", appearance="Ordinary daylight photograph."),
    dict(entry_id="mdrs_station_2020", site_id="mdrs_utah", title="File:Mars Desert Research Station 2020.jpg", view="surface", image_type="surface_image", instrument="Field photograph (The Mars Society / MDRS, CC BY-SA 4.0)", mission="Mars Desert Research Station",
         acquisition_date="2020-10-07", acquisition_note="Commons DateTimeOriginal 2020-10-07.", relationship="exact_location", distance_km=0.0,
         coverage="The station itself, which is the candidate footprint centre.", relevance="The habitat and the surrounding desert terrain where crewed simulations run.", appearance="Ordinary daylight photograph; the structures are the station, not natural features."),
    dict(entry_id="haughton_devon_aerial_hmp", site_id="haughton_crater", title="File:Flying over Devon Island (2665527817).jpg", view="orbital", image_type="orbital_image", instrument="Aerial photograph (Haughton-Mars Project)", mission="Haughton-Mars Project",
         acquisition_date=None, acquisition_note="Commons gives only 'taken on' without a verified date.", relationship="candidate_region", distance_km=None,
         coverage="Low-altitude aerial view over Devon Island near the crater; the frame's position relative to the crater centre is not stated.", relevance="Oblique aerial context of the polar desert surface (not an orbital map; no georeferencing).", appearance="Oblique aerial photograph, not nadir imagery."),
    dict(entry_id="holuhraun_landsat8_eo", site_id="holuhraun_iceland", title="File:Holuhraun Natural Color OLI Landsat 8.jpg", view="orbital", image_type="orbital_image", instrument="Landsat 8 OLI (NASA Earth Observatory)", mission="Landsat 8",
         acquisition_date="2014-09-06", acquisition_note="Commons DateTimeOriginal 2014-09-06, during the 2014-15 eruption.", relationship="candidate_region", distance_km=None,
         coverage="Natural-colour Landsat 8 scene of the Holuhraun eruption and lava field; frame extent and georeferencing are not supplied with the JPEG.", relevance="The fresh lava field forming, seen from orbit at the time of emplacement.", appearance="Natural-colour satellite image with plume; no scale bar available."),
]


def commons_info(title: str) -> dict:
    """File URL, licence and author from Commons extmetadata (paced: the API rate-limits bursts)."""
    import urllib.parse
    u = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=" + urllib.parse.quote(title)
         + "&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1600")
    for attempt in range(5):
        try:
            d = _get(u)
            break
        except Exception as e:  # noqa: BLE001 - 429 or transient
            time.sleep(3 + 3 * attempt)
            if attempt == 4:
                raise
    p = list(d["query"]["pages"].values())[0]
    if "imageinfo" not in p:
        raise FileNotFoundError(f"Commons file not found: {title}")
    ii = p["imageinfo"][0]
    em = ii.get("extmetadata", {})
    g = lambda k: re.sub(r"<[^>]+>", "", em.get(k, {}).get("value", "") or "").strip()  # noqa: E731
    return {"title": p["title"], "page": ii["descriptionurl"], "url": (ii.get("thumburl") if ii.get("width", 0) > 1600 else ii["url"]).split("?")[0],
            "width": ii["width"], "height": ii["height"], "mime": ii["mime"], "license": g("LicenseShortName"), "license_url": g("LicenseUrl"),
            "artist": g("Artist"), "credit": g("Credit"), "description": g("ImageDescription")}


def earth_context_entries(cands: dict[str, dict]) -> list[dict]:
    p = IMG / "earth_context.json"
    if not p.exists():
        return []
    ctx = json.loads(p.read_text())
    out = []
    for key, m in ctx.items():
        site_id, level = key.rsplit("_gibs_", 1)
        c = cands[site_id]
        weld = m["source_used"] == "weld"
        out.append(dict(
            entry_id=key, site_id=site_id, view="orbital", image_type="orbital_mosaic",
            title=f"{m['layer_title']}, {'regional' if level == 'regional' else 'local'} context ({m['width_km_ns']} km across) centred on {c['name']}",
            institution="NASA Global Imagery Browse Services (GIBS)" + (" / USGS-NASA Landsat WELD" if weld else " / MODIS LANCE"),
            credit=m["credit"], license="NASA / USGS imagery: public domain, credit requested (GIBS usage policy)",
            instrument="Landsat 7 ETM+ (WELD annual composite)" if weld else "MODIS Terra", mission="Landsat 7" if weld else "Terra",
            source_page_url="https://www.earthdata.nasa.gov/data/tools/global-imagery-browse-services-gibs",
            asset_url=f"https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{m['layer']}/default/{m['time']}/ (tiles, level {m['zoom']})",
            local_asset=m["file"], mime_type="image/jpeg", width_px=m["width_px"], height_px=m["height_px"], bytes=m["bytes"],
            acquisition_date=None if weld else m["time"], acquisition_note=m["acquisition_note"], release_date=None,
            spatial_resolution_m_per_px=m["px_m_ns"], resolution_note=f"Tile pixel {m['px_m_ns']} m N-S ({m['px_m_ew']} m E-W at this latitude).",
            bounds=dict(**m["bounds"]),
            coverage_evidence=f"Bounds computed exactly from the GIBS EPSG:4326 tile grid at level {m['zoom']}; the candidate coordinate ({c['lat']}, {c['lon_east']}) lies inside the block.",
            relationship="candidate_region" if level == "regional" else "exact_location", distance_from_site_km=0.0,
            relevance=("Covers roughly the analysis footprint; the harmonised regional slope and relief describe this area." if level == "regional"
                       else "A few tens of kilometres around the candidate coordinate at ~30 m per pixel; vegetation, water and seasonal snow are visible where present."),
            appearance_note=("Landsat true colour composited over a year (2000), so clouds are suppressed and seasonal states mixed." if weld
                             else "Single-day MODIS true colour at 250 m, chosen for austral summer; coarse and may include cloud."),
            verified_on=m["verified_on"],
        ))
    return out


def _get(url: str, binary: bool = False, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        return (data, r.headers.get("Content-Type", "")) if binary else json.loads(data)


def nasa_metadata(nasa_id: str) -> tuple[dict, list[str]]:
    d = _get(f"https://images-api.nasa.gov/search?nasa_id={nasa_id}")
    items = d["collection"]["items"]
    if not items:
        raise RuntimeError(f"{nasa_id} not found in the NASA Image Library")
    assets = _get(items[0]["href"])
    return items[0]["data"][0], assets


def pick_asset(assets: list[str]) -> str:
    for suffix in ("~medium.jpg", "~large.jpg", "~orig.jpg"):
        for a in assets:
            if a.endswith(suffix):
                return a
    raise RuntimeError("no jpg asset")


def download(url: str, dest: Path) -> tuple[str, int, int, int]:
    host = re.sub(r"^https?://([^/]+).*$", r"\1", url)
    if host not in ALLOWLIST:
        raise RuntimeError(f"host {host} not in allowlist")
    data, ctype = _get(url, binary=True)
    if not ctype.startswith("image/"):
        raise RuntimeError(f"not an image: {ctype}")
    if len(data) > MAX_BYTES:
        raise RuntimeError(f"asset too large ({len(data)} bytes)")
    im = Image.open(io.BytesIO(data))
    im.load()
    dest.write_bytes(data)
    return ctype.split(";")[0], len(data), im.width, im.height


def ctx_entries(sites: dict[str, dict]) -> list[dict]:
    p = IMG / "ctx_context.json"
    if not p.exists():
        return []
    ctx = json.loads(p.read_text())
    out = []
    for key, m in ctx.items():
        site_id, level = key.rsplit("_ctx_", 1)
        s = sites[site_id]
        out.append(dict(
            entry_id=key, site_id=site_id, view="orbital", image_type="orbital_mosaic",
            title=f"CTX mosaic, {'regional' if level == 'regional' else 'local'} context ({m['width_km_ns']} km across) centred on {s['name']}",
            institution="NASA/JPL/MSSS/The Murray Lab (Caltech); tiles hosted by Esri for NASA Solar System Treks",
            credit="NASA/JPL/MSSS/The Murray Lab", license="Free use of the CTX beta01 mosaic for all purposes with credit (Murray Lab statement on the service page)",
            instrument="Context Camera (CTX), Mars Reconnaissance Orbiter", mission="MRO",
            source_page_url="https://trek.nasa.gov/mars/", asset_url=f"https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer (tiles zoom {m['zoom']})",
            local_asset=m["file"], mime_type="image/jpeg", width_px=m["width_px"], height_px=m["height_px"], bytes=m["bytes"],
            acquisition_date=None, acquisition_note="Mosaic of many CTX orbits (2006 onward); individual acquisition dates are not tracked in the beta01 mosaic.",
            release_date=None, spatial_resolution_m_per_px=m["px_m_ns"],
            resolution_note=f"Tile pixel {m['px_m_ns']} m N-S ({m['px_m_ew']} m E-W at this latitude); the underlying CTX mosaic is ~5 m/px, resampled for this zoom level.",
            bounds=dict(**m["bounds"]),
            coverage_evidence=f"Bounds computed exactly from the WMTS tile grid at zoom {m['zoom']}; the candidate coordinate ({s['lat']}, {s['lon_east']}) lies in the centre tile.",
            relationship="candidate_region" if level == "regional" else "exact_location", distance_from_site_km=0.0,
            relevance=("Covers the whole ~59 km analysis footprint; the regional slope and relief statistics describe this area." if level == "regional"
                       else "A few kilometres around the candidate coordinate at ~10 m per pixel; shows local landforms, not metre-scale hazards."),
            appearance_note="Uncontrolled greyscale CTX mosaic (beta01): brightness varies between orbit strips and seams can be visible; lossy JPEG tiles.",
            verified_on=m["verified_on"],
        ))
    return out


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)
    sites = {s["id"]: s for s in json.loads((BACKEND / "data" / "mars" / "sites.json").read_text())["sites"]}
    earth = {c["id"]: c for c in json.loads((BACKEND / "data" / "earth" / "candidates.json").read_text())["candidates"]}
    entries: list[dict] = ctx_entries(sites) + earth_context_entries(earth)
    for spec in NASA_PRODUCTS + EARTH_NASA_PRODUCTS:
        meta, assets = nasa_metadata(spec["nasa_id"])
        asset_url = pick_asset(assets)
        fn = f"{spec['entry_id']}.jpg"
        mime, nbytes, w, h = download(asset_url, ASSETS / fn)
        entries.append(dict(
            entry_id=spec["entry_id"], site_id=spec["site_id"], view=spec["view"], image_type=spec["image_type"],
            title=meta["title"], institution=meta.get("center", "JPL") + " / NASA Image and Video Library",
            credit=meta.get("secondary_creator") or "NASA/JPL-Caltech",
            license="NASA imagery: free to use for any purpose with credit (NASA Media Usage Guidelines)",
            instrument=spec["instrument"], mission=spec["mission"],
            source_page_url=f"https://photojournal.jpl.nasa.gov/catalog/{spec['nasa_id']}", asset_url=asset_url, local_asset=fn,
            mime_type=mime, width_px=w, height_px=h, bytes=nbytes,
            acquisition_date=spec["acquisition_date"], acquisition_note=spec["acquisition_note"],
            release_date=(meta.get("date_created") or "")[:10] or None,
            spatial_resolution_m_per_px=None, resolution_note="Ground sampling of this web-sized asset is not stated by the source.",
            bounds=None, coverage_evidence=spec["coverage"], relationship=spec["relationship"], distance_from_site_km=spec["distance_km"],
            relevance=spec["relevance"], appearance_note=spec["appearance"], verified_on=TODAY,
        ))
        print(f"{spec['entry_id']:<30} {meta['title'][:50]:<52} {w}x{h} {nbytes:>8} B", flush=True)
        time.sleep(0.5)
    for spec in COMMONS_PRODUCTS:
        try:
            info = commons_info(spec["title"])
        except FileNotFoundError as e:
            print(f"SKIP {spec['entry_id']}: {e}", flush=True)   # recorded as a gap, never invented
            continue
        fn = f"{spec['entry_id']}.jpg"
        mime, nbytes, w, h = download(info["url"], ASSETS / fn)
        entries.append(dict(
            entry_id=spec["entry_id"], site_id=spec["site_id"], view=spec["view"], image_type=spec["image_type"],
            title=info["title"].replace("File:", "").rsplit(".", 1)[0], institution="Wikimedia Commons (" + (info["artist"] or "author not stated") + ")",
            credit=(info["artist"] or "author not stated") + (f" via {info['credit']}" if info["credit"] and not info["credit"].startswith("http") else ""),
            license=(info["license"] or "licence not stated") + (f" ({info['license_url']})" if info["license_url"] else ""),
            instrument=spec["instrument"], mission=spec["mission"], source_page_url=info["page"], asset_url=info["url"], local_asset=fn,
            mime_type=mime, width_px=w, height_px=h, bytes=nbytes, acquisition_date=spec["acquisition_date"], acquisition_note=spec["acquisition_note"],
            release_date=None, spatial_resolution_m_per_px=None, resolution_note="Photograph; no ground sampling applies.", bounds=None,
            coverage_evidence=spec["coverage"] + (f" Commons description: {info['description'][:200]}" if info["description"] else ""),
            relationship=spec["relationship"], distance_from_site_km=spec["distance_km"], relevance=spec["relevance"], appearance_note=spec["appearance"], verified_on=TODAY,
        ))
        print(f"{spec['entry_id']:<30} {info['license']:<16} {w}x{h} {nbytes:>8} B", flush=True)
        time.sleep(2.0)
    by_site: dict[str, dict] = {}
    all_locations = {**{k: {"body": "mars", **v} for k, v in sites.items()}, **{k: {"body": "earth", **v} for k, v in earth.items()}}
    for sid, s in all_locations.items():
        es = [e for e in entries if e["site_id"] == sid]
        views = {e["view"] for e in es}
        notes = []
        if "surface" not in views:
            notes.append("No landed mission has imaged this candidate from the ground, so no surface view exists; orbital views only." if s["body"] == "mars"
                         else "No field photograph with a documented licence and location could be verified for this site; orbital context only.")
        by_site[sid] = dict(site_id=sid, body=s["body"], entries=es, missing_views=[v for v in ("orbital", "surface") if v not in views], notes=notes)
    manifest = dict(version="v1", generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), allowlist=ALLOWLIST, sites=by_site)
    (IMG / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote manifest with", len(entries), "entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
