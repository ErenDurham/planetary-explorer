"""Physical-grid processing shared by the offline Earth and Mars discovery pass."""
from __future__ import annotations

import math
import numpy as np
from pyproj import CRS, Transformer
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling, transform_bounds


def metric_grid(lat, lon, body="earth", cell_m=4000, footprint_m=60000, offset=(0, 0)):
    if body == "earth":
        geographic = CRS.from_epsg(4326)
        projection = CRS.from_proj4(f"+proj=laea +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs")
    elif body == "mars":
        geographic = CRS.from_proj4("+proj=longlat +R=3396000 +no_defs")
        projection = CRS.from_proj4(f"+proj=laea +lat_0={lat} +lon_0={lon} +R=3396000 +units=m +no_defs")
    else:
        raise ValueError("unsupported body")
    n = int(footprint_m/cell_m)
    if n < 3 or n*cell_m != footprint_m:
        raise ValueError("footprint must have an integral grid of at least 3 cells")
    half = footprint_m/2
    transform = from_origin(-half+offset[0], half+offset[1], cell_m, cell_m)
    bounds = (-half+offset[0], -half+offset[1], half+offset[0], half+offset[1])
    geo_bounds = transform_bounds(projection, geographic, *bounds, densify_pts=41)
    back = Transformer.from_crs(projection, geographic, always_xy=True)
    # Densify footprint edges so the returned polygon reflects the projection.
    ring=[]
    for a,b in [((bounds[0],bounds[1]),(bounds[2],bounds[1])),((bounds[2],bounds[1]),(bounds[2],bounds[3])),
                ((bounds[2],bounds[3]),(bounds[0],bounds[3])),((bounds[0],bounds[3]),(bounds[0],bounds[1]))]:
        for t in np.linspace(0,1,9,endpoint=False):
            ring.append(list(back.transform(a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]))))
    ring.append(ring[0])
    return geographic, projection, transform, (n,n), geo_bounds, {"type":"Polygon", "coordinates":[ring]}


def aggregate(z, source_transform, source_crs, projection, target_transform, shape, min_fraction=.95):
    """Area resample both elevation and support. Missing values are never filled.

    Source mosaics must cover padded target bounds. Unsupported source pixels are
    zeros only in the SUPPORT mask, never in elevation. NoData interpolation is forbidden.
    """
    z = np.asarray(z, dtype=np.float64)
    valid = np.isfinite(z)
    out = np.full(shape, np.nan)
    support = np.zeros(shape, dtype=np.float64)
    kwargs=dict(src_transform=source_transform, src_crs=source_crs,
                dst_transform=target_transform, dst_crs=projection, resampling=Resampling.average)
    reproject(z, out, src_nodata=np.nan, dst_nodata=np.nan, **kwargs)
    reproject(valid.astype(np.float64), support, src_nodata=None, dst_nodata=0, **kwargs)
    out[support < min_fraction] = np.nan
    return out, support


def stats(z, cell_m=4000):
    """Central-difference slopes need all four neighbours, excluding edge cells."""
    z=np.asarray(z,dtype=float)
    valid=np.isfinite(z)
    mask=np.zeros_like(valid)
    mask[1:-1,1:-1]=(valid[1:-1,1:-1]&valid[:-2,1:-1]&valid[2:,1:-1]&valid[1:-1,:-2]&valid[1:-1,2:])
    gy,gx=np.gradient(z,cell_m,cell_m)
    slope=np.degrees(np.arctan(np.hypot(gx,gy)))
    yy,xx=np.indices(z.shape,dtype=float)
    design=np.column_stack([xx[valid]*cell_m, yy[valid]*cell_m, np.ones(valid.sum())])
    if valid.sum()<3 or not mask.any():
        raise ValueError("insufficient terrain support")
    coef=np.linalg.lstsq(design,z[valid],rcond=None)[0]
    return {"slope_regional_median_deg":float(np.median(slope[mask])),
            "roughness_regional_m":float(np.std(z[valid]-design@coef))}, float(valid.mean()), float(mask.sum()/((z.shape[0]-2)*(z.shape[1]-2)))


def profile(z, support, geographic, projection, transform, spec):
    values, fraction, gradient=stats(z,spec["cell_m"])
    return {"measurements":{f:{"value":v,"unit":"deg" if f.endswith("deg") else "m","measurement_type":"derived"} for f,v in values.items()},
        "terrain_valid_fraction":fraction,"gradient_valid_fraction":gradient,
        "grid":{"body_geographic_crs":geographic.to_wkt(),"metric_crs":projection.to_wkt(),
            "transform":list(transform)[:6],"cell_m":spec["cell_m"],"shape":list(z.shape),
            "footprint_m":spec["footprint_m"],"aggregation":"GDAL area-weighted average; mask separately averaged",
            "support_min":float(support.min()),"support_mean":float(support.mean()),
            "gradient_support":"fraction of interior cells with centre and four central-difference neighbours valid",
            "projection_limit":"Local equal-area grid distances approximate ground distances; distortion grows away from centre."}}
