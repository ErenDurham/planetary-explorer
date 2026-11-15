"""Real bounded discovery build. Run from backend: python scripts/build_discovery.py.

Network is confined to this offline command. Saved artifacts serve without rasters.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.windows import from_bounds, transform as window_transform

BACKEND=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BACKEND))
from scripts.discovery_terrain import metric_grid, aggregate, profile
from scripts.geo import toa_annual_mean_insolation_wm2
from app.models.discovery import DiscoveryRunArtifact, DiscoveryRankRequest
from app.services.discovery_engine import FEATURE_REGISTRY, LIMITATIONS, distance_km, rank, verify_run
from app.services.expedition.terrain import EXPECTED_SHA

DATA=BACKEND/"data"/"discovery"
CACHE=BACKEND/"data"/"raw"/"discovery"
COP="https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif"
NOW=lambda:datetime.now(timezone.utc).isoformat(timespec="seconds")


def encoded(value):
    return (json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+"\n").encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic(path, raw):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+f".{os.getpid()}.tmp")
    tmp.write_bytes(raw)
    os.replace(tmp,path)


def fetch(url, offline=False):
    """Content-verified resumable cache. No credentials, infinite retries or secrets."""
    key=digest(url.encode())
    path=CACHE/(key+".bin")
    meta=CACHE/(key+".json")
    if path.exists() and meta.exists():
        info=json.loads(meta.read_text())
        if info["url"]==url and digest(path.read_bytes())==info["sha256"]:
            return path,info
        if offline:
            raise ValueError("cache checksum mismatch: "+url)
    if offline:
        raise FileNotFoundError("Not in verified cache: "+url)
    print("fetch",url,flush=True)
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PlanetaryExplorer-discovery-v1"}),timeout=45) as r:
        raw=r.read()
        info={"url":url,"sha256":digest(raw),"bytes":len(raw),"retrieved_at":NOW(),"etag":r.headers.get("ETag")}
    atomic(path,raw);atomic(meta,encoded(info))
    return path,info


def tile_names(bounds):
    west,south,east,north=bounds
    if not (-180<=west<east<=180 and -80<south<north<80):
        raise ValueError("Pilot supports non-dateline, nonpolar footprints only")
    return [f"Copernicus_DSM_COG_30_{'N' if la>=0 else 'S'}{abs(la):02d}_00_{'E' if lo>=0 else 'W'}{abs(lo):03d}_00_DEM"
            for la in range(math.floor(south),math.ceil(north)) for lo in range(math.floor(west),math.ceil(east))]


def cop_source(info):
    return {"source_id":"cop_"+info["sha256"][:16],"title":"Copernicus GLO-90 digital surface model tile",
        "institution":"Copernicus Programme / ESA / Airbus; AWS public mirror", "url":info["url"],
        "license":"Copernicus DEM licence; attribution required. https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
        "retrieved_at":info["retrieved_at"],"observation_period":"TanDEM-X primary acquisitions 2011–2015; edited DSM, not current land cover",
        "sha256":info["sha256"],"etag":info["etag"]}


def earth_grid(lat,lon,spec,offline=False,offset=(0,0)):
    geographic,projection,transform,shape,bounds,polygon=metric_grid(lat,lon,"earth",spec["cell_m"],spec["footprint_m"],offset)
    # Pad source sampling by 0.01 deg: target border must not become partial coverage.
    bounds=(bounds[0]-.01,bounds[1]-.01,bounds[2]+.01,bounds[3]+.01)
    paths=[];sources=[];errors=[]
    for name in tile_names(bounds):
        try:
            path,info=fetch(COP.format(name=name),offline)
            paths.append(path);sources.append(cop_source(info))
        except (OSError,ValueError,urllib.error.URLError) as exc:
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
    if not paths:
        raise ValueError("No DEM tiles: "+str(errors))
    with ExitStack() as stack:
        datasets=[stack.enter_context(rasterio.open(p)) for p in paths]
        # merge handles true tile transforms and geographic spacing, not corner concatenation.
        mosaic,source_transform=merge(datasets,bounds=bounds,nodata=np.nan,dtype="float64",masked=False)
        z=mosaic[0]
        # Source nodata may not be NaN in native tiles.
        for ds in datasets:
            if ds.nodata is not None:
                z[z==ds.nodata]=np.nan
        out,support=aggregate(z,source_transform,datasets[0].crs,projection,transform,shape,spec["min_cell_valid_fraction"])
    return out,support,(geographic,projection,transform),polygon,sources,errors


def mars_reference_extras(spec):
    """Scored non-terrain values for the reference, each taken from a cited record."""
    extras={"latitude_abs_deg":abs(JEZERO[0])}
    if "precipitation_mm_day" in spec["scales"]:
        extras["precipitation_mm_day"]=MARS_PRECIPITATION_MM_DAY
    return {f:v for f,v in extras.items() if f in spec["scales"]}


def mars_grid(spec,offset=(0,0)):
    lat,lon=JEZERO
    geographic,projection,transform,shape,bounds,_=metric_grid(lat,lon,"mars",spec["cell_m"],spec["footprint_m"],offset)
    path=BACKEND/"data/raw/megt90n000eb.img"
    raw=path.read_bytes()
    if digest(raw)!=EXPECTED_SHA:
        raise ValueError("MOLA source checksum mismatch")
    source_transform=from_origin(0,90,1/16,1/16)
    w=from_bounds(bounds[0]-.125,bounds[1]-.125,bounds[2]+.125,bounds[3]+.125,source_transform).round_offsets().round_lengths()
    arr=np.frombuffer(raw,dtype=">i2").reshape(2880,5760)
    rows,cols=w.toslices()
    z=arr[rows,cols].astype(float)
    z[(z < -8177)|(z>21171)]=np.nan
    out,support=aggregate(z,window_transform(w,source_transform),geographic,projection,transform,shape,spec["min_cell_valid_fraction"])
    source={"source_id":"nasa_mola_megdr_16ppd","title":"NASA MOLA MEGDR 16 ppd MEGT90N000EB",
        "institution":"NASA PDS / MOLA Science Team",
        "url":"https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl",
        "license":"NASA PDS public data; cite MOLA Science Team","retrieved_at":NOW(),
        "observation_period":"Mars Global Surveyor MOLA mapping era, 1999–2001; median/interpolated bins",
        "sha256":EXPECTED_SHA,"etag":None}
    return out,support,(geographic,projection,transform),source


def sector(row,col,n):
    """Compass name for a cell, rows counted from the north so it reads like the map."""
    if n==1:return "centre"
    mid=(n-1)/2
    vertical="north" if row<mid else "south" if row>mid else ""
    horizontal="west" if col<mid else "east" if col>mid else ""
    return "-".join(part for part in (vertical,horizontal) if part) or "centre"


def centres(spec):
    """Systematic cell centres. Positions follow the preregistered grid, never the scores.

    A legacy single-region pilot keeps its original identifiers and ordering so its
    immutable run still replays byte for byte.
    """
    n=spec["samples_per_axis"]
    if "regions" not in spec:
        b=spec["bounds"]
        if n!=4 or abs(b["east"]-b["west"]-1)>1e-9 or abs(b["north"]-b["south"]-1)>1e-9:
            raise ValueError("discovery-v1 pilot must be 1 degree square with 4x4 systematic centres")
        return [{"id":f"region-{r:02d}-{c:02d}","lat":b["south"]+(r+.5)/n,"lon_east":b["west"]+(c+.5)/n}
                for r in range(n) for c in range(n)]
    if n<1 or not spec["regions"]:
        raise ValueError("a survey needs at least one region and one sample per axis")
    if len({r["id"] for r in spec["regions"]})!=len(spec["regions"]):
        raise ValueError("duplicate region ids")
    out=[]
    for region in spec["regions"]:
        b=region["bounds"]
        if abs(b["east"]-b["west"]-1)>1e-9 or abs(b["north"]-b["south"]-1)>1e-9:
            raise ValueError(f"region {region['id']} must be a one-degree square")
        for row in range(n):
            for col in range(n):
                out.append({"id":f"{region['id']}-{row}{col}",
                    "lat":b["north"]-(row+.5)/n,"lon_east":b["west"]+(col+.5)/n,
                    "region_id":region["id"],"region_name":region["name"],"sector":sector(row,col,n)})
    return out


JEZERO=(18.4447,77.4508)
POWER_PARAMETERS="T2M,T2M_MIN,T2M_MAX,PRECTOTCORR,WS2M,ALLSKY_SFC_SW_DWN"
# Mars has no liquid precipitation at the surface. The value and its citation are taken
# from the curated Mars profile rather than asserted here.
MARS_PRECIPITATION_MM_DAY=0.0
MARS_PRECIPITATION_SOURCE={"source_id":"nasa_m2020_landing_site",
    "title":"Mars 2020 Perseverance Rover science pages, Jezero Crater landing site",
    "institution":"NASA Science / JPL","url":"https://science.nasa.gov/mission/mars-2020-perseverance/science/",
    "license":"NASA public web content","retrieved_at":"2026-11-15T00:00:00+00:00",
    "observation_period":"Mission science summary; no liquid precipitation reaches the modern Martian surface",
    "sha256":None,"etag":None}


def power_climate(lat,lon,offline=False):
    """One NASA POWER climatology per candidate. Precipitation is scored; the rest is context.

    Any fill value or non-finite annual mean fails the candidate rather than being
    treated as a measurement.
    """
    url=(f"https://power.larc.nasa.gov/api/temporal/climatology/point?parameters={POWER_PARAMETERS}"
         f"&community=RE&latitude={lat:.4f}&longitude={lon:.4f}&format=JSON")
    path,meta=fetch(url,offline)
    document=json.loads(path.read_text())
    parameters=document["properties"]["parameter"]
    fill=document.get("header",{}).get("fill_value",-999.0)
    def annual(key):
        value=parameters[key]["ANN"]
        if not isinstance(value,(int,float)) or not math.isfinite(value) or value==fill:
            raise ValueError(f"POWER returned no usable annual {key} at {lat},{lon}")
        return float(value)
    values={"air_temperature_c":annual("T2M"),"temperature_monthly_min_c":annual("T2M_MIN"),
            "temperature_monthly_max_c":annual("T2M_MAX"),"precipitation_mm_day":annual("PRECTOTCORR"),
            "wind_speed_2m_ms":annual("WS2M"),
            # POWER reports insolation as kWh/m2/day; this is the same quantity in W/m2.
            "surface_sw_annual_mean_wm2":annual("ALLSKY_SFC_SW_DWN")*1000/24}
    if values["precipitation_mm_day"]<0:
        raise ValueError("negative precipitation")
    source={"source_id":"nasa_power_"+meta["sha256"][:16],"title":"NASA POWER climatology at the footprint centre",
        "institution":"NASA POWER","url":url,"license":"NASA POWER free public data; cite POWER project",
        "retrieved_at":meta["retrieved_at"],
        "observation_period":str(document.get("header",{}).get("start","unspecified"))+"-"+str(document.get("header",{}).get("end","unspecified")),
        "sha256":meta["sha256"],"etag":meta["etag"]}
    climate={"scope":"Footprint-centre climatology. Precipitation is a scored feature; the remaining values are context.",
        "lat":lat,"lon_east":lon,"values":values,
        "resolution":"0.5 x 0.625 deg meteorological grid, coarser than the 60 km terrain footprint",
        "header":document.get("header"),"source":source}
    return values,source,climate


def context_measurements(values,lat):
    """Dimensions the app reports but refuses to score.

    Two kinds appear here: quantities measured on both bodies whose difference no Earth
    site can remove, and quantities this release measures only on Earth. Neither is
    allowed into the index.
    """
    earth_flux=toa_annual_mean_insolation_wm2(lat,"earth")
    mars_flux=toa_annual_mean_insolation_wm2(JEZERO[0],"mars")
    return [
        {"feature_id":"insolation_toa_annual_mean_wm2","label":"Annual-mean insolation (top of atmosphere)",
         "group":"illumination","earth_value":round(earth_flux,1),"mars_value":round(mars_flux,1),
         "unit":"W/m2","comparable":True,
         "note":f"Both values are analytic from latitude and orbit. Earth receives about {earth_flux/mars_flux:.1f} times Jezero's flux, a gap no Earth location can close, which is why latitude is scored and flux is not."},
        {"feature_id":"surface_sw_annual_mean_wm2","label":"Surface shortwave received","group":"illumination",
         "earth_value":round(values["surface_sw_annual_mean_wm2"],1),"mars_value":None,"unit":"W/m2","comparable":False,
         "note":"NASA POWER all-sky surface flux. No equivalent surface measurement for Jezero is held in this release, so the two cannot be differenced."},
        {"feature_id":"surface_temperature_mean_c","label":"Mean air temperature","group":"thermal",
         "earth_value":round(values["air_temperature_c"],2),"mars_value":None,"unit":"degC","comparable":False,
         "note":"NASA POWER 25-year climatology at 2 m. This release holds no measured Mars surface temperature, so the difference is reported and never scored."},
        {"feature_id":"temperature_monthly_min_c","label":"Coldest monthly mean minimum","group":"thermal",
         "earth_value":round(values["temperature_monthly_min_c"],2),"mars_value":None,"unit":"degC","comparable":False,
         "note":"The cold end of the annual cycle. Mars is far colder at every latitude; the comparison is directional only."},
        {"feature_id":"temperature_monthly_max_c","label":"Warmest monthly mean maximum","group":"thermal",
         "earth_value":round(values["temperature_monthly_max_c"],2),"mars_value":None,"unit":"degC","comparable":False,
         "note":"The warm end of the annual cycle, which sets whether brines or ice can persist seasonally."},
        {"feature_id":"wind_speed_2m_ms","label":"Mean wind speed at 2 m","group":"aeolian",
         "earth_value":round(values["wind_speed_2m_ms"],2),"mars_value":None,"unit":"m/s","comparable":False,
         "note":"A proxy for aeolian activity. Mars moves sand at higher speeds in a far thinner atmosphere, so wind speed does not transfer directly and is not scored."},
    ]


def catalog():
    existing=json.loads((BACKEND/"data/earth/candidates.json").read_text())
    entries=[{"id":c["id"],"name":c["name"],"lat":c["lat"],"lon_east":c["lon_east"],
        "sources":[existing["sources"][sid]["url"] for sid in c["sources"]],"coordinate_note":"Existing curated reference point; not a mapped site boundary."} for c in existing["candidates"]]
    additions=[
        ("lake_salda", "Lake Salda",37.55,29.68,"https://science.nasa.gov/solar-system/analog-explorer/"),
        ("rio_tinto", "Rio Tinto",37.69,-6.59,"https://www.nasa.gov/general/rio-tinto-spain/"),
        ("svalbard_amase", "Svalbard AMASE regional reference",79.3,13.3,"https://science.gsfc.nasa.gov/solarsystem/projects/247/"),
        ("ibn_battuta_marrakech", "Ibn Battuta Centre / Marrakech regional reference",31.63,-8.0,"https://www.lpi.usra.edu/meetings/analogues2011/pdf/6006.pdf")]
    entries += [{"id":i,"name":n,"lat":la,"lon_east":lo,"sources":[u],
        "coordinate_note":"Approximate geographic reference, not exact field campaign bounds; source establishes analog use, not precise coordinate."} for i,n,la,lo,u in additions]
    return {"version":"known-analogs-v1.0","entries":entries,
        "limitations":["Incomplete catalog, approximate points, no global prior-art search. A 100 km centre buffer is a conservative heuristic, not site extent.",
            "Moroccan analog research extends beyond Marrakech; outside these points is not proof of a previously unstudied region."]}


def worldcover_url(lat,lon):
    """The ESA WorldCover tile covering this point. Tiles are a 3-degree grid named by
    their south-west corner, so a tile picked for one point does not cover another."""
    la=int(math.floor(lat/3)*3);lo=int(math.floor(lon/3)*3)
    name=f"ESA_WorldCover_10m_2021_v200_{'N' if la>=0 else 'S'}{abs(la):02d}{'E' if lo>=0 else 'W'}{abs(lo):03d}_Map.tif"
    return "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"+name


def optional_access(spec,offline):
    """One representative climate query, explicitly NOT a per-footprint measurement."""
    b=spec["bounds"];lat=(b["south"]+b["north"])/2;lon=(b["west"]+b["east"])/2
    result={"climate":None,"land_cover":None,"checks":{}}
    url=f"https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR&community=RE&latitude={lat}&longitude={lon}&format=JSON"
    try:
        path,meta=fetch(url,offline);d=json.loads(path.read_text());p=d["properties"]["parameter"]
        vals={"air_temperature_c":p["T2M"]["ANN"],"precipitation_mm_day":p["PRECTOTCORR"]["ANN"]}
        if any(not math.isfinite(v) or v==d.get("header",{}).get("fill_value",-999) for v in vals.values()):
            raise ValueError("POWER missing annual values")
        result["climate"]={"scope":"Single survey-centre context, not a candidate measurement or score input", "lat":lat,"lon_east":lon,
            "values":vals,"resolution":"0.5 x 0.625 deg meteorological grid", "header":d.get("header"),"source":{
                "source_id":"nasa_power_survey_context","title":"NASA POWER climatology, survey-centre context",
                "institution":"NASA POWER","url":url,"license":"NASA POWER free public data; cite POWER project",
                "retrieved_at":meta["retrieved_at"],"observation_period":str(d.get("header",{}).get("start","unspecified"))+"–"+str(d.get("header",{}).get("end","unspecified")),
                "sha256":meta["sha256"],"etag":meta["etag"]}}
        result["checks"]["power"]={"status":"available","sha256":meta["sha256"],"url":url}
    except (OSError, ValueError,KeyError,urllib.error.URLError) as exc:
        result["checks"]["power"]={"status":"unavailable","reason":str(exc)}
    # Metadata/range spike only: no land-cover percentage inferred from a TIFF header.
    url=worldcover_url(lat,lon)
    check_path=CACHE/"worldcover-check.json"
    if offline and check_path.exists():
        result["checks"]["worldcover"]=json.loads(check_path.read_text())
    elif not offline:
        try:
            req=urllib.request.Request(url,headers={"Range":"bytes=0-16383"})
            with urllib.request.urlopen(req,timeout=20) as r:
                data=r.read(16384)
                check={"status":"header_access_verified_only","url":url,"http_status":r.status,"bytes_read":len(data),"retrieved_at":NOW(),"etag":r.headers.get("ETag")}
        except (OSError,urllib.error.URLError) as exc:
            check={"status":"unavailable","url":url,"reason":str(exc)}
        atomic(check_path,encoded(check));result["checks"]["worldcover"]=check
    else:
        result["checks"]["worldcover"]={"status":"not_cached"}
    return result


def validate_spec(spec):
    centres(spec)
    if spec["cell_m"]!=4000 or spec["footprint_m"]!=60000:
        raise ValueError("discovery fixes 4km cells and 60km footprints")
    for key in ("min_cell_valid_fraction","min_terrain_valid_fraction","min_gradient_valid_fraction"):
        if not .8<=spec[key]<=1:
            raise ValueError("invalid coverage setting")
    for key in ("catalog_buffer_km","minimum_center_distance_km"):
        if not math.isfinite(spec[key]) or spec[key]<=0:
            raise ValueError("invalid spatial threshold")
    # A survey may only score features the engine knows how to compare.
    unknown=sorted(set(spec["scales"])-set(FEATURE_REGISTRY))
    if unknown or not spec["scales"] or any(not math.isfinite(v) or v<=0 for v in spec["scales"].values()):
        raise ValueError("invalid scales"+(": "+", ".join(unknown) if unknown else ""))
    weights=spec.get("default_weights") or {}
    if weights and set(weights)!=set(spec["scales"]):
        raise ValueError("default weights must cover exactly the scored features")
    for region in spec.get("regions",[]):
        if not region.get("hypothesis") or not region.get("name"):
            raise ValueError(f"region {region.get('id')} needs a name and a stated hypothesis")


def build(spec,offline=False):
    started=time.monotonic();validate_spec(spec)
    CACHE.mkdir(parents=True,exist_ok=True)
    # Persist preregistration before data access or score inspection.
    spec_hash=digest(encoded(spec))
    prereg=DATA/"preregistrations"/(spec_hash[:16]+".json")
    if not prereg.exists():
        atomic(prereg,encoded({"registered_at":NOW(),"specification":spec,"specification_sha256":spec_hash}))
    known=catalog();known_hash=digest(encoded(known))
    optional=optional_access(spec,offline)
    mz,ms,mg,mola=mars_grid(spec)
    mp=profile(mz,ms,*mg,spec,mars_reference_extras(spec))
    all_sources={mola["source_id"]:mola};audit=[];grids={}
    if "precipitation_mm_day" in spec["scales"]:
        all_sources[MARS_PRECIPITATION_SOURCE["source_id"]]=MARS_PRECIPITATION_SOURCE
    if optional["climate"]:
        context_source=optional["climate"]["source"]
        all_sources[context_source["source_id"]]=context_source
    needs_climate=any(f in spec["scales"] for f in ("precipitation_mm_day",)) or "regions" in spec
    for c in centres(spec):
        print("process",c["id"],round(c["lat"],3),round(c["lon_east"],3),flush=True)
        reasons=[];p=None;sources=[];valid_fraction=0;climate=optional["climate"];context=[]
        extras={"latitude_abs_deg":abs(c["lat"])} if "latitude_abs_deg" in spec["scales"] else {}
        climate_source=None
        _,_,_,_,_,polygon=metric_grid(c["lat"],c["lon_east"])
        errors=[]
        if needs_climate:
            try:
                values,climate_source,climate=power_climate(c["lat"],c["lon_east"],offline)
                if "precipitation_mm_day" in spec["scales"]:
                    extras["precipitation_mm_day"]=values["precipitation_mm_day"]
                context=context_measurements(values,c["lat"])
            except (OSError,ValueError,KeyError,urllib.error.URLError) as exc:
                errors.append(f"climate: {type(exc).__name__}: {exc}")
                reasons.append("climate_unavailable")
        try:
            z,support,g,polygon,sources,terrain_errors=earth_grid(c["lat"],c["lon_east"],spec,offline)
            errors+=terrain_errors
            p=profile(z,support,*g,spec,extras)
            valid_fraction=p["terrain_valid_fraction"]
            if p["terrain_valid_fraction"]<spec["min_terrain_valid_fraction"] or p["gradient_valid_fraction"]<spec["min_gradient_valid_fraction"]:
                p=None;reasons.append("insufficient_terrain_coverage")
            else:
                grids[c["id"]]=z
        except (ValueError,OSError) as exc:
            errors.append(str(exc));reasons.append("terrain_unavailable")
        # A candidate missing any scored value is screened out rather than part-scored.
        if p is not None and set(spec["scales"])-set(p["measurements"]):
            p=None
            if "climate_unavailable" not in reasons:reasons.append("incomplete_feature_basis")
        for s in sources: all_sources[s["source_id"]]=s
        if climate_source: all_sources[climate_source["source_id"]]=climate_source
        nearest=min(known["entries"],key=lambda k:distance_km(c["lat"],c["lon_east"],k["lat"],k["lon_east"]))
        d=distance_km(c["lat"],c["lon_east"],nearest["lat"],nearest["lon_east"])
        if d<=spec["catalog_buffer_km"]:reasons.append("inside_known_catalog_buffer")
        name=(f"{c['region_name']} ({c['sector']})" if c.get("region_name")
              else f"Survey footprint {c['lat']:.3f} N, {c['lon_east']:.3f} E")
        candidate={"id":c["id"],"lat":c["lat"],"lon_east":c["lon_east"],"name":name,
            "region_id":c.get("region_id"),"region_name":c.get("region_name"),
            "footprint_geojson":polygon,"terrain_valid_fraction":valid_fraction,
            "novelty":{"catalog_version":known["version"],"nearest_known_site_id":nearest["id"],"nearest_known_site_distance_km":d,
                "buffer_rule":f"Exclude centres <= {spec['catalog_buffer_km']} km from approximate catalog reference points; not a site boundary",
                "outside_catalog_buffer":d>spec["catalog_buffer_km"],"review_status":"not_reviewed"},
            "context":{"climate":climate,"land_cover":None,"geology_status":"not_assessed","measurements":context},
            "sources":sources+[mola]+([climate_source] if climate_source else [])
                      +([MARS_PRECIPITATION_SOURCE] if "precipitation_mm_day" in spec["scales"] else []),
            "limitations":LIMITATIONS+(["Acquisition gaps: "+"; ".join(errors)] if errors else [])}
        audit.append({"candidate":candidate,"profile":p,"screening_reasons":reasons})
    pipeline_hash=digest(b"".join(Path(p).read_bytes() for p in [__file__,Path(__file__).with_name("discovery_terrain.py"),BACKEND/"app/services/discovery_engine.py"]))
    identity={"spec_sha256":spec_hash,"catalog_sha256":known_hash,"pipeline_sha256":pipeline_hash,
        "sources":sorted((s["source_id"],s["sha256"]) for s in all_sources.values()),"optional":optional["checks"]}
    run_id=(spec.get("run_prefix") or ("morocco" if "regions" not in spec else "survey"))+"-"+digest(encoded(identity))[:12]
    exclusions=Counter(r for row in audit for r in row["screening_reasons"])
    run={"engine_version":"discovery-v1","run_id":run_id,"label":spec["label"],"created_at":NOW(),
        "reference":{"body":"mars","id":"jezero_crater","name":"Jezero Crater","lat":18.4447,"lon_east":77.4508},
        "reference_profile":mp,"specification":spec,"audit_rows":audit,"provenance":list(all_sources.values()),"limitations":LIMITATIONS,
        "survey":{"bounds":spec["bounds"],"generated_count":len(audit),"terrain_valid_count":sum(r["profile"] is not None for r in audit),
            "eligible_count":sum(not r["screening_reasons"] for r in audit),"exclusion_counts":dict(exclusions),"sampling_centres":centres(spec),
            "grid_specification":{"cell_m":4000,"projection":"Per-footprint Lambert azimuthal equal-area; Earth WGS84 and Mars sphere radius 3396000 m", "no_nodata_fill":True},
            "footprint_specification":{"width_m":60000,"height_m":60000,"candidate_centres_only_inside_aoi":True,"source_padding":True},
            "dataset_versions":{"earth":"Copernicus GLO-90 AWS COG; per-tile SHA256","mars":"MOLA MEGDR 16ppd "+EXPECTED_SHA,"catalog":known["version"]},
            "spec_version":spec["spec_version"],"diversification":{"method":"greedy full-precision rank then centre separation", "minimum_center_distance_km":spec["minimum_center_distance_km"]},
            "regions":[{**r,"sampled":sum(1 for c in centres(spec) if c.get("region_id")==r["id"])} for r in spec.get("regions",[])],
            "context_features":[{"feature_id":m["feature_id"],"label":m["label"],"group":m["group"],"unit":m["unit"],"comparable":m["comparable"]}
                                for m in (audit[0]["candidate"]["context"]["measurements"] if audit and audit[0]["candidate"]["context"]["measurements"] else [])]},
        "validation":{"processing_seconds":time.monotonic()-started,"preregistration":json.loads(prereg.read_text()),"identity":identity,"known_catalog":known,
            "optional_access_checks":optional["checks"],"scientific_validation":"Not field validated; terrain-only screening. No independent predictive accuracy established.",
            "desktop_review":{"status":"pending","note":"Not a substitute for literature, land-cover, geology or field assessment."}}}
    # Stored reference validity uses the same support requirements as candidates.
    parsed=DiscoveryRunArtifact.model_validate(run);verify_run(parsed)
    runs=DATA/"runs";runs.mkdir(parents=True,exist_ok=True);directory=runs/run_id
    # A content-addressed run is immutable. Replays compare numerical outcomes.
    if directory.exists():
        old=json.loads((directory/"run.json").read_text())
        if [(x["candidate"]["id"],x["profile"]) for x in old["audit_rows"]] != [(x["candidate"]["id"],x["profile"]) for x in parsed.model_dump()["audit_rows"]]:
            raise ValueError("Replay differs from immutable run")
        print("verified replay",run_id,flush=True)
        return directory,grids
    staging=Path(tempfile.mkdtemp(prefix=".build-",dir=runs))
    raw=encoded(parsed.model_dump());atomic(staging/"run.json",raw)
    manifest={"engine_version":"discovery-v1","run_id":run_id,"sha256":digest(raw),"bytes":len(raw),"created_at":run["created_at"],**identity}
    atomic(staging/"manifest.json",encoded(manifest));os.rename(staging,directory)
    print("published",run_id,"seconds",round(time.monotonic()-started,2),flush=True)
    return directory,grids


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--spec",type=Path,default=DATA/"pilot.json")
    ap.add_argument("--offline",action="store_true")
    args=ap.parse_args()
    directory,grids=build(json.loads(args.spec.read_text()),args.offline)
    # Private evidence for independent inspection; not loaded by API.
    for key,z in grids.items():
        np.save(CACHE/(directory.name+"-"+key+".npy"),z)
    print(directory)


if __name__=="__main__":main()
