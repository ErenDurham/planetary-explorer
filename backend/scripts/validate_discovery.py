"""Attach reproducible sensitivity checks and independent WorldCover desktop evidence.

No field validation or predictive accuracy is inferred. Run artifacts stay immutable;
the validation attachment is separately hashed and bound to the original artifact.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
import time
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image, ImageDraw

BACKEND=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BACKEND))
from app.services import discovery_engine as engine
from scripts.build_discovery import CACHE, atomic, encoded, digest, earth_grid, mars_grid, worldcover_url
from scripts.discovery_terrain import profile

CLASSES={10:"tree_cover",20:"shrubland",30:"grassland",40:"cropland",50:"built_up",60:"bare_sparse",
         70:"snow_ice",80:"water",90:"herbaceous_wetland",95:"mangroves",100:"moss_lichen",0:"no_data"}


def scores(run, weights=(.5,.5), scales=(1,1), profiles=None, reference=None):
    ref=reference or run.reference_profile.model_dump()
    results=[]
    for row in run.audit_rows:
        if row.screening_reasons:continue
        p=(profiles or {}).get(row.candidate.id) or row.profile.model_dump()
        d=sum(w*abs(p["measurements"][fid]["value"]-ref["measurements"][fid]["value"])/(run.specification["scales"][fid]*scale)
              for fid,w,scale in zip(engine.FEATURES,weights,scales))
        results.append((d,row.candidate.id))
    return sorted(results)


def sensitivity(run):
    base=scores(run);base_top={x[1] for x in base[:3]};scenarios=[]
    for slope in (0,.25,.5,.75,1):
        for a in (.5,1,2):
            for b in (.5,1,2):
                ranked=scores(run,(slope,1-slope),(a,b))
                scenarios.append({"slope_weight":slope,"scale_multipliers":[a,b],"top_candidate":ranked[0][1] if ranked else None,
                    "top3_overlap_with_default":len(base_top&{x[1] for x in ranked[:3]}),"ordered_ids":[x[1] for x in ranked]})
    offsets=[]
    for offset in [(1000,0),(-1000,0),(0,1000),(0,-1000)]:
        z,s,g,_=mars_grid(run.specification,offset)
        ref=profile(z,s,*g,run.specification);profiles={}
        for row in run.audit_rows:
            if row.screening_reasons:continue
            c=row.candidate
            z,s,g,_,_,_=earth_grid(c.lat,c.lon_east,run.specification,True,offset)
            profiles[c.id]=profile(z,s,*g,run.specification)
        ranked=scores(run,profiles=profiles,reference=ref)
        offsets.append({"offset_east_north_m":list(offset),"ordered_ids":[x[1] for x in ranked],
            "top_candidate":ranked[0][1] if ranked else None,"top3_overlap_with_default":len(base_top&{x[1] for x in ranked[:3]}),
            "reference_values":ref["measurements"],"candidate_values":{k:v["measurements"] for k,v in profiles.items()}})
    return {"default_order":[x[1] for x in base],"weight_scale_scenarios":scenarios,"grid_origin_scenarios":offsets,
        "interpretation":"Robustness to explicitly chosen parameters, not calibrated confidence or independent truth. Physical shifts change footprint support as well as grid origin."}


def review(run,offline=False):
    order=scores(run)
    if not order:return []
    chosen=[order[i][1] for i in sorted({0,len(order)//2,len(order)-1})]
    source=run.validation["optional_access_checks"]["worldcover"]
    output=[]
    for cid in chosen:
        c=next(r.candidate for r in run.audit_rows if r.candidate.id==cid)
        # The tile must cover THIS candidate. A survey spanning continents has no single
        # tile, and reading a candidate from someone else's tile yields an empty window.
        url=worldcover_url(c.lat,c.lon_east)
        path=CACHE/(run.run_id+"-"+cid+"-worldcover.npz")
        meta_path=path.with_suffix(".json")
        try:
            # A cached window counts only when it is intact AND came from the tile this
            # candidate needs; anything else is treated as not cached and fetched again.
            cached=None
            if path.exists() and meta_path.exists():
                meta=json.loads(meta_path.read_text())
                if digest(path.read_bytes())!=meta["sha256"]:raise ValueError("WorldCover cache checksum mismatch")
                if meta.get("url")==url:cached=np.load(path)["classes"]
            if cached is not None:
                arr=cached
            else:
                if offline:raise FileNotFoundError("No independent WorldCover window cached")
                # Independent native-resolution ~1km window at the candidate centre.
                # Never extrapolate this sample to the entire 60km footprint.
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",GDAL_HTTP_TIMEOUT=20,GDAL_HTTP_MAX_RETRY=0):
                    with rasterio.open(url) as ds:
                        window=from_bounds(c.lon_east-.005,c.lat-.005,c.lon_east+.005,c.lat+.005,ds.transform).round_offsets().round_lengths()
                        arr=ds.read(1,window=window)
                        transform=list(ds.window_transform(window))[:6]
                np.savez_compressed(path,classes=arr)
                meta={"url":url,"sha256":digest(path.read_bytes()),"transform":transform,"shape":list(arr.shape),
                    "etag":source.get("etag"),"dataset":"ESA WorldCover 2021 v200 10m", "license":"CC BY 4.0; ESA WorldCover project 2021", "source_id":"esa_worldcover_2021_v200"}
                atomic(meta_path,encoded(meta))
            # An empty window means the tile did not cover the point: report it as missing
            # evidence, never as an available sample with nothing in it.
            if arr.size==0:raise ValueError("WorldCover window is empty at this centre")
            counts={CLASSES.get(int(k),"unknown_"+str(k)):int(v) for k,v in zip(*np.unique(arr,return_counts=True))}
            item={"candidate_id":cid,"status":"independent_land_cover_sample_available","scope":"Native 10m classification in 0.01 degree square at centre only; NOT full footprint, not geology, access or field validation.",
                "class_counts":counts,"sample_count":int(arr.size),"source":meta,"manual_observations":None}
        except (OSError,ValueError,rasterio.errors.RasterioError) as exc:
            item={"candidate_id":cid,"status":"independent_sample_unavailable","reason":str(exc),"manual_observations":None}
            arr=None
        # Small evidence contact sheet for human desktop inspection.
        zpath=CACHE/(run.run_id+"-"+cid+".npy")
        if zpath.exists():
            z=np.load(zpath);low=np.nanmin(z);high=np.nanmax(z)
            pixels=np.nan_to_num((z-low)/max(1,high-low)*255).astype("uint8")
            image=Image.new("RGB",(660,390),"white");draw=ImageDraw.Draw(image)
            image.paste(Image.fromarray(pixels).convert("RGB").resize((300,300),Image.Resampling.NEAREST),(15,55))
            draw.text((15,10),f"{cid}: {c.lat}, {c.lon_east}",fill="black")
            draw.text((15,30),"DEM regional elevations (60 km)",fill="black")
            if arr is not None:
                colors={0:(0,0,0),10:(0,100,0),20:(255,187,34),30:(255,255,76),40:(240,150,255),50:(250,0,0),60:(180,180,180),70:(240,240,240),80:(0,100,200),90:(0,150,160),95:(0,207,117),100:(250,230,160)}
                rgb=np.zeros((*arr.shape,3),dtype=np.uint8)
                for k,v in colors.items():rgb[arr==k]=v
                image.paste(Image.fromarray(rgb).resize((300,300),Image.Resampling.NEAREST),(345,55))
                draw.text((345,30),"WorldCover centre sample (~1 km)",fill="black")
            draw.text((15,365),"Independent context only. No geology, accessibility or field validation.",fill="black")
            image.save(CACHE/(run.run_id+"-"+cid+"-review.png"))
        output.append(item)
    return output


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument("run_id");ap.add_argument("--offline",action="store_true");args=ap.parse_args()
    run,manifest=engine.load_run(args.run_id);started=time.monotonic()
    result={"run_id":run.run_id,"weight_scale_and_origin_sensitivity":sensitivity(run),"desktop_review":review(run,args.offline),
        "independent_evidence_limit":"WorldCover is independent of the terrain score but checks only central land-cover samples. It does not validate analog ranking or geological similarity.",
        "literature_context":[{"url":"https://www.jpl.nasa.gov/images/pia01863-space-radar-image-of-eastern-morocco/", "scope":"Regional eastern Morocco imagery context, not candidate-specific validation"},
            {"url":"https://www.nesdis.noaa.gov/news/the-high-atlas-mountains-separating-morocco-algeria", "scope":"Regional Morocco-Algeria mountain/desert context; no inference of accessibility"}],
        "field_validation":"not_performed","processing_seconds":time.monotonic()-started}
    # Recompute numerical checks without erasing an inspection of the same evidence.
    previous=run.validation.get("follow_up_assessment",{})
    for item in result["desktop_review"]:
        old=next((x for x in previous.get("desktop_review",[]) if x["candidate_id"]==item["candidate_id"]),{})
        if old.get("source")==item.get("source"):
            item["manual_observations"]=old.get("manual_observations")
    if previous.get("desktop_review_method"):
        result["desktop_review_method"]=previous["desktop_review_method"]
    raw=encoded(result);directory=engine.root()/run.run_id
    atomic(directory/"validation.json",raw)
    atomic(directory/"validation-manifest.json",encoded({"sha256":digest(raw),"run_sha256":manifest["sha256"]}))
    print(json.dumps({"run_id":run.run_id,"review":result["desktop_review"],"seconds":result["processing_seconds"]},indent=2))


if __name__=="__main__":main()
