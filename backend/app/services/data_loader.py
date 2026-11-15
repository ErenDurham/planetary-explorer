"""Load versioned, preprocessed site definitions and environmental profiles.

Owner: Engineer 2. This is the only module that knows where data files live.
Everything downstream (scoring, analogs, retrieval, API) asks a DataStore for
validated Pydantic objects and never touches the filesystem.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.config.settings import get_settings
from app.models import EarthCandidate, EnvironmentalProfile, GeographicFootprint, Site
from app.models.common import EarthAnalogNote, ReportedCondition, WorkbookSource

WORKBOOK = "workbook/lesser_known_sites.v1.json"


class DataError(RuntimeError):
    pass


def _footprint(planet: str, lat: float, lon: float, half: float) -> GeographicFootprint:
    return GeographicFootprint(
        shape="square", center_lat=lat, center_lon_east=lon, half_width_deg=half,
        crs="IAU2000:49900" if planet == "mars" else "EPSG:4326", longitude_convention="east_-180_180",
    )


class DataStore:
    def __init__(self, data_dir: Path, profile_version: str):
        self.data_dir = data_dir
        self.profile_version = profile_version
        self._sites: dict[str, Site] = {}
        self._profiles: dict[str, EnvironmentalProfile] = {}
        self._earth: dict[str, EarthCandidate] = {}
        self._earth_profiles: dict[str, EnvironmentalProfile] = {}
        self._load()

    # -- loading ---------------------------------------------------------
    def _read(self, rel: str) -> dict:
        p = self.data_dir / rel
        if not p.exists():
            raise DataError(f"missing data file {p}; run the scripts in backend/scripts/ (see docs/DATA_SOURCES.md)")
        return json.loads(p.read_text(encoding="utf-8"))

    def _workbook(self) -> tuple[dict, dict, dict]:
        """(mars site id -> workbook row, earth id -> workbook row, source id -> WorkbookSource); empty without the file."""
        if not (self.data_dir / WORKBOOK).exists():
            return {}, {}, {}
        wb = self._read(WORKBOOK)
        sources = {k: WorkbookSource.model_validate({f: v[f] for f in WorkbookSource.model_fields if f in v}) for k, v in wb["sources"].items()}
        return {m["id"]: m for m in wb["mars_sites"]}, {e["id"]: e for e in wb["earth_sites"]}, sources

    @staticmethod
    def _conditions(cells: list[dict], sources: dict[str, WorkbookSource]) -> tuple[list[ReportedCondition], dict[str, WorkbookSource]]:
        conds = [ReportedCondition.model_validate({k: v for k, v in c.items() if k in ReportedCondition.model_fields}) for c in cells]
        used = {sid for c in conds for sid in c.source_ids} | {c.evidence_source_id for c in conds if c.evidence_source_id}
        return conds, {k: sources[k] for k in sorted(used) if k in sources}

    def _load(self) -> None:
        wb_mars, _wb_earth, wb_sources = self._workbook()
        self._why: dict[str, str | None] = {k: v.get("why_they_match") for k, v in wb_mars.items()}
        mars = self._read("mars/sites.json")
        prof = self._read(f"mars/site_profiles.{self.profile_version}.json")
        profiles = {p["site_id"]: EnvironmentalProfile.model_validate(p) for p in prof["profiles"]}
        for s in mars["sites"]:
            fp = profiles[s["id"]].measurements[0].geographic_footprint or _footprint("mars", s["lat"], s["lon_east"], 0.5)
            self._sites[s["id"]] = Site(
                id=s["id"], planet="mars", name=s["name"], region=s["region"], lat=s["lat"], lon_east=s["lon_east"],
                footprint=fp, description=s["description"], heritage=s.get("heritage"),
                tags=sorted(set(s.get("tags_terrain", [])) | set(s.get("tags_mineralogy", []))),
                coordinate_sources=s.get("coordinate_sources", []),
                role=s.get("role"), notes=s.get("notes"), coordinates_approximate=s.get("coordinates_approximate", False),
                paired_earth_site_id=s.get("paired_earth_site_id"),
            )
            w = wb_mars.get(s["id"])
            if w:
                site = self._sites[s["id"]]
                site.reported_conditions, site.condition_sources = self._conditions(w["conditions"], wb_sources)
                site.earth_analogs = [EarthAnalogNote.model_validate(a) for a in w["earth_analogs"]]
            if s["id"] not in profiles:
                raise DataError(f"site {s['id']} has no profile in version {self.profile_version}")
        self._profiles = profiles

        earth = self._read("earth/candidates.json")
        ep_path = self.data_dir / f"earth/candidate_profiles.{self.profile_version}.json"
        eprof = json.loads(ep_path.read_text(encoding="utf-8"))["profiles"] if ep_path.exists() else []
        self._earth_profiles = {p["site_id"]: EnvironmentalProfile.model_validate(p) for p in eprof}
        for c in earth["candidates"]:
            prof_fp = self._earth_profiles[c["id"]].measurements[0].geographic_footprint if c["id"] in self._earth_profiles else None
            self._earth[c["id"]] = EarthCandidate(
                id=c["id"], name=c["name"], region=c["region"], country=c["country"], lat=c["lat"], lon_east=c["lon_east"],
                footprint=prof_fp or _footprint("earth", c["lat"], c["lon_east"], 0.25), description=c["description"],
                tags=sorted(set(c.get("tags_terrain", [])) | set(c.get("tags_mineralogy", []))),
                known_analog_use=c.get("known_analog_use", []), sources=c.get("sources", []),
                coordinates_approximate=c.get("coordinates_approximate", False), paired_mars_site_id=c.get("paired_mars_site_id"),
            )
            pair = wb_mars.get(c.get("paired_mars_site_id") or "")
            if pair and pair.get("paired_earth_site_id") == c["id"]:
                e = self._earth[c["id"]]
                e.role, e.why_they_match = pair["role"], pair.get("why_they_match")
                e.reported_conditions, e.condition_sources = self._conditions(pair["pair"]["earth"], wb_sources)

    # -- queries ---------------------------------------------------------
    def sites(self, planet: str = "mars") -> list[Site]:
        if planet != "mars":
            return []
        return list(self._sites.values())

    def site(self, site_id: str) -> Site | None:
        return self._sites.get(site_id)

    def profile(self, site_id: str) -> EnvironmentalProfile | None:
        return self._profiles.get(site_id)

    def earth_candidates(self) -> list[EarthCandidate]:
        return list(self._earth.values())

    def earth_candidate(self, cid: str) -> EarthCandidate | None:
        return self._earth.get(cid)

    def earth_profile(self, cid: str) -> EnvironmentalProfile | None:
        return self._earth_profiles.get(cid)

    def why_they_match(self, mars_site_id: str) -> str | None:
        return self._why.get(mars_site_id)

    def feature_value(self, profile: EnvironmentalProfile, feature_id: str):
        """Return (value, measurement) or (None, measurement|None); never a fake zero."""
        m = profile.get(feature_id)
        if m is None or m.is_missing:
            return None, m
        return m.value, m


@lru_cache
def get_store() -> DataStore:
    s = get_settings()
    return DataStore(s.data_dir, s.profile_version)
