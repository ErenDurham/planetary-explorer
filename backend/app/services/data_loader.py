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
from app.models.common import AnalogBasis, ReportedCondition, SiteSource

SITE_CONDITIONS = "sites/site_conditions.v1.json"


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

    def _site_conditions(self) -> tuple[dict, dict, dict]:
        """(mars site id -> row, earth id -> row, source id -> SiteSource); empty without the file."""
        if not (self.data_dir / SITE_CONDITIONS).exists():
            return {}, {}, {}
        sc = self._read(SITE_CONDITIONS)
        sources = {k: SiteSource.model_validate({f: v[f] for f in SiteSource.model_fields if f in v}) for k, v in sc["sources"].items()}
        return {m["id"]: m for m in sc["mars_sites"]}, {e["id"]: e for e in sc["earth_sites"]}, sources

    @staticmethod
    def _conditions(cells: list[dict], sources: dict[str, SiteSource]) -> tuple[list[ReportedCondition], dict[str, SiteSource]]:
        conds = [ReportedCondition.model_validate({k: v for k, v in c.items() if k in ReportedCondition.model_fields}) for c in cells]
        used = {sid for c in conds for sid in c.source_ids}
        return conds, {k: sources[k] for k in sorted(used) if k in sources}

    def _load(self) -> None:
        sc_mars, sc_earth, sc_sources = self._site_conditions()
        self._basis: dict[str, AnalogBasis | None] = {
            e["paired_mars_site_id"]: (AnalogBasis.model_validate(e["analog_basis"]) if e.get("analog_basis") else None) for e in sc_earth.values()}
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
            w = sc_mars.get(s["id"])
            if w:
                site = self._sites[s["id"]]
                site.reported_conditions, site.condition_sources = self._conditions(w["conditions"], sc_sources)

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
            row, pair = sc_earth.get(c["id"]), sc_mars.get(c.get("paired_mars_site_id") or "")
            if row and pair:
                e = self._earth[c["id"]]
                e.role = pair["role"]
                e.analog_basis = AnalogBasis.model_validate(row["analog_basis"]) if row.get("analog_basis") else None
                e.reported_conditions, e.condition_sources = self._conditions(row["conditions"], sc_sources)

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

    def analog_basis(self, mars_site_id: str) -> AnalogBasis | None:
        return self._basis.get(mars_site_id)

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
