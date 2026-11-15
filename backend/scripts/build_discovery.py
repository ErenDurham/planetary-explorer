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
from app.models.discovery import DiscoveryRunArtifact, DiscoveryRankRequest
from app.services.discovery_engine import FEATURES, LIMITATIONS, distance_km, rank, verify_run
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


def mars_grid(spec,offset=(0,0)):
    lat,lon=18.4447,77.4508
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


def centres(spec):
    b=spec["bounds"];n=spec["samples_per_axis"]
    if n!=4 or abs(b["east"]-b["west"]-1)>1e-9 or abs(b["north"]-b["south"]-1)>1e-9:
        raise ValueError("discovery-v1 pilot must be 1 degree square with 4x4 systematic centres")
    return [{"id":f"region-{r:02d}-{c:02d}","lat":b["south"]+(r+.5)/n,"lon_east":b["west"]+(c+.5)/n}
            for r in range(n) for c in range(n)]


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
    la=int(math.floor(lat/3)*3);lo=int(math.floor(lon/3)*3)
    name=f"ESA_WorldCover_10m_2021_v200_{'N' if la>=0 else 'S'}{abs(la):02d}{'E' if lo>=0 else 'W'}{abs(lo):03d}_Map.tif"
    url="https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"+name
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
        raise ValueError("discovery-v1 fixes 4km cells and 60km footprints")
    for key in ("min_cell_valid_fraction","min_terrain_valid_fraction","min_gradient_valid_fraction"):
        if not .8<=spec[key]<=1:
            raise ValueError("invalid coverage setting")
    for key in ("catalog_buffer_km","minimum_center_distance_km"):
        if not math.isfinite(spec[key]) or spec[key]<=0:
            raise ValueError("invalid spatial threshold")
    if set(spec["scales"])!=set(FEATURES) or any(not math.isfinite(v) or v<=0 for v in spec["scales"].values()):
        raise ValueError("invalid scales")


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
    mp=profile(mz,ms,*mg,spec)
    all_sources={mola["source_id"]:mola};audit=[];grids={}
    if optional["climate"]:
        context_source=optional["climate"]["source"]
        all_sources[context_source["source_id"]]=context_source
    for c in centres(spec):
        print("process",c["id"],c["lat"],c["lon_east"],flush=True)
        reasons=[];p=None;sources=[];valid_fraction=0
        _,_,_,_,_,polygon=metric_grid(c["lat"],c["lon_east"])
        try:
            z,support,g,polygon,sources,errors=earth_grid(c["lat"],c["lon_east"],spec,offline)
            p=profile(z,support,*g,spec)
            valid_fraction=p["terrain_valid_fraction"]
            if p["terrain_valid_fraction"]<spec["min_terrain_valid_fraction"] or p["gradient_valid_fraction"]<spec["min_gradient_valid_fraction"]:
                p=None;reasons.append("insufficient_terrain_coverage")
            else:
                grids[c["id"]]=z
        except (ValueError,OSError) as exc:
            errors=[str(exc)];reasons.append("terrain_unavailable")
        for s in sources: all_sources[s["source_id"]]=s
        nearest=min(known["entries"],key=lambda k:distance_km(c["lat"],c["lon_east"],k["lat"],k["lon_east"]))
        d=distance_km(c["lat"],c["lon_east"],nearest["lat"],nearest["lon_east"])
        if d<=spec["catalog_buffer_km"]:reasons.append("inside_known_catalog_buffer")
        candidate={**c,"name":f"Survey footprint {c['lat']:.3f} N, {c['lon_east']:.3f} E",
            "footprint_geojson":polygon,"terrain_valid_fraction":valid_fraction,
            "novelty":{"catalog_version":known["version"],"nearest_known_site_id":nearest["id"],"nearest_known_site_distance_km":d,
                "buffer_rule":f"Exclude centres <= {spec['catalog_buffer_km']} km from approximate catalog reference points; not a site boundary",
                "outside_catalog_buffer":d>spec["catalog_buffer_km"],"review_status":"not_reviewed"},
            "context":{"climate":optional["climate"],"land_cover":None,"geology_status":"not_assessed"},
            "sources":sources+[mola]+([optional["climate"]["source"]] if optional["climate"] else []),"limitations":LIMITATIONS+(["Acquisition gaps: "+"; ".join(errors)] if errors else [])}
        audit.append({"candidate":candidate,"profile":p,"screening_reasons":reasons})
    pipeline_hash=digest(b"".join(Path(p).read_bytes() for p in [__file__,Path(__file__).with_name("discovery_terrain.py"),BACKEND/"app/services/discovery_engine.py"]))
    identity={"spec_sha256":spec_hash,"catalog_sha256":known_hash,"pipeline_sha256":pipeline_hash,
        "sources":sorted((s["source_id"],s["sha256"]) for s in all_sources.values()),"optional":optional["checks"]}
    run_id="morocco-"+digest(encoded(identity))[:12]
    exclusions=Counter(r for row in audit for r in row["screening_reasons"])
    run={"engine_version":"discovery-v1","run_id":run_id,"label":spec["label"],"created_at":NOW(),
        "reference":{"body":"mars","id":"jezero_crater","name":"Jezero Crater","lat":18.4447,"lon_east":77.4508},
        "reference_profile":mp,"specification":spec,"audit_rows":audit,"provenance":list(all_sources.values()),"limitations":LIMITATIONS,
        "survey":{"bounds":spec["bounds"],"generated_count":len(audit),"terrain_valid_count":sum(r["profile"] is not None for r in audit),
            "eligible_count":sum(not r["screening_reasons"] for r in audit),"exclusion_counts":dict(exclusions),"sampling_centres":centres(spec),
            "grid_specification":{"cell_m":4000,"projection":"Per-footprint Lambert azimuthal equal-area; Earth WGS84 and Mars sphere radius 3396000 m", "no_nodata_fill":True},
            "footprint_specification":{"width_m":60000,"height_m":60000,"candidate_centres_only_inside_aoi":True,"source_padding":True},
            "dataset_versions":{"earth":"Copernicus GLO-90 AWS COG; per-tile SHA256","mars":"MOLA MEGDR 16ppd "+EXPECTED_SHA,"catalog":known["version"]},
            "spec_version":spec["spec_version"],"diversification":{"method":"greedy full-precision rank then centre separation", "minimum_center_distance_km":spec["minimum_center_distance_km"]}},
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
