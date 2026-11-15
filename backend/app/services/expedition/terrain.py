"""Read only the installed, checksum-verified MOLA MEGDR; no synthetic fallback."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import hashlib
import math
import numpy as np
from scripts.geo import MOLA_PPD, MARS_CELL_KM, slope_deg
from app.config.settings import get_settings
from app.models.expedition import Bounds, GeoPoint, TerrainContext, TerrainCoverage, TerrainDataset
from app.services.comparison_catalog import comparison_catalog
from .geo import distance_m

LIMITS = [
    "Regional orbital topography cannot resolve rover-scale rocks, wheel traction, cliffs or safe passages.",
    "MOLA bins without laser shots were interpolated by the data producer; no shot-count layer is installed.",
    "No illumination, thermal, communications, regolith-bearing, radiation or sampling model is applied.",
    "Catalog region coordinates are starting references, not verified rover deployment or sampling locations.",
]
EXPECTED_SHA = "d18d9b9ab8c5516d02e157dd2cde0f1d0d160c21940e953ba22391269a545e7b"
DATASET = TerrainDataset(
    name="MOLA MEGDR 16 ppd (MEGT90N000EB)", source="NASA PDS / MOLA Science Team",
    url="https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl",
    license="NASA PDS public data; cite MOLA Science Team", resolution_m=MARS_CELL_KM*1000,
    note="Median topography, including producer-interpolated cells. Regional resolution only.",
    vertical_datum="GMM3 areoid (mgm1025), degree/order 50; IAU2000", sha256=EXPECTED_SHA)

@dataclass
class TerrainGrid:
    z: np.ndarray
    latitudes: np.ndarray
    longitudes: np.ndarray  # continuous, possibly outside [-180,180) around a seam
    bounds: Bounds
    body: str = "mars"

    def point(self, cell):
        r,c=cell
        return GeoPoint(lat=float(self.latitudes[r]),lon_east=float((self.longitudes[c]+180)%360-180))

    def cell(self, p: GeoPoint):
        center=(self.bounds.west+self.bounds.east)/2
        lon=center+(p.lon_east-center+180)%360-180
        if not (self.bounds.west <= lon < self.bounds.east and self.bounds.south < p.lat <= self.bounds.north):
            return None
        r=min(len(self.latitudes)-1,int((self.bounds.north-p.lat)/(self.latitudes[0]-self.latitudes[1])))
        c=min(len(self.longitudes)-1,int((lon-self.bounds.west)/(self.longitudes[1]-self.longitudes[0])))
        return (r,c) if np.isfinite(self.z[r,c]) else None

    def slopes(self):
        # Same gradient helper as profile pipeline, row-specific spherical spacing.
        dy=distance_m(self.point((0,0)),self.point((1,0)),self.body)
        result=np.empty_like(self.z,dtype=float)
        for r in range(self.z.shape[0]):
            dx=distance_m(self.point((r,0)),self.point((r,1)),self.body)
            with np.errstate(invalid="ignore",divide="ignore"):
                result[r]=slope_deg(self.z,max(dx,1e-6),dy)[r]
        return result

@lru_cache(maxsize=2)
def _raw(path: str, size: int, mtime_ns: int):
    p=Path(path)
    if size != 2880*5760*2:
        raise ValueError("Installed MOLA binary has an invalid byte count.")
    if hashlib.sha256(p.read_bytes()).hexdigest()!=EXPECTED_SHA:
        raise ValueError("Installed MOLA binary failed the known-product checksum.")
    return np.memmap(p,dtype=">i2",mode="r",shape=(2880,5760))

def regions():
    return [x for x in comparison_catalog().locations if x.body in ("mars","moon","earth")]

def load_terrain(body: str, site_id: str):
    loc=next((x for x in regions() if x.body==body and x.id==site_id),None)
    if loc is None:
        raise ValueError("Unknown region for this planetary body.")
    context=TerrainContext(body=body,site_id=site_id,start=GeoPoint(lat=loc.lat,lon_east=loc.lon_east),
        dem=TerrainCoverage(available=False),notes=list(LIMITS),start_source_ids=loc.source_ids)
    if body!="mars":
        context.dem.note=("No usable LOLA elevation grid is installed for this lunar region." if body=="moon"
                          else "Earth terrain routing is not supported by this expedition engine.")
        return context,None
    path=get_settings().data_dir/"raw"/"megt90n000eb.img"
    if not path.exists():
        context.dem.note="MOLA raw elevation grid is not installed; run backend/scripts/fetch_mola.py."
        return context,None
    try:
        stat=path.stat()
        raw=_raw(str(path),stat.st_size,stat.st_mtime_ns)
    except (ValueError,OSError) as exc:
        context.dem.note=str(exc)
        return context,None
    # Only cells whose centers are inside the existing one-degree site footprint.
    north,south=loc.lat+.5,loc.lat-.5
    west,east=loc.lon_east-.5,loc.lon_east+.5
    rows=np.arange(max(0,math.ceil((90-north)*MOLA_PPD-.5)),min(2880,math.floor((90-south)*MOLA_PPD-.5)+1))
    cols=np.arange(math.ceil(west*MOLA_PPD-.5),math.floor(east*MOLA_PPD-.5)+1)
    z=raw[np.ix_(rows,cols%5760)].astype(float)
    z[(z < -8177)|(z > 21171)]=np.nan
    lats=90-(rows+.5)/MOLA_PPD
    lons=(cols+.5)/MOLA_PPD
    bounds=Bounds(west=float(lons[0]-.5/MOLA_PPD),east=float(lons[-1]+.5/MOLA_PPD),
                  north=float(lats[0]+.5/MOLA_PPD),south=float(lats[-1]-.5/MOLA_PPD))
    grid=TerrainGrid(z,lats,lons,bounds)
    context.routing_bounds=bounds
    context.dem=TerrainCoverage(available=bool(np.isfinite(z).any()),dataset=DATASET,
        note="Regional route grid; inputs snap to cell centers. No high-resolution hazard layer.",
        rows=len(rows),columns=len(cols),valid_fraction=float(np.isfinite(z).mean()),
        resolution_lat_deg=1/MOLA_PPD,resolution_lon_deg=1/MOLA_PPD,
        cell_width_m=distance_m(grid.point((len(rows)//2,0)),grid.point((len(rows)//2,1)),body),
        cell_height_m=MARS_CELL_KM*1000,crs="IAU2000 planetocentric Mars; MOLA 3396 km sphere")
    return context,grid
