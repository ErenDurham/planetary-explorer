"""Site imagery manifest and asset proxy: schema, coverage honesty, allowlist
and failure states. No network: the proxy's fetch is monkeypatched."""
import json
import re
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api import imagery_routes as ir
from app.models import ImageryManifest

MANIFEST = Path(__file__).resolve().parents[1] / "data" / "imagery" / "manifest.json"
pytestmark = pytest.mark.skipif(not MANIFEST.exists(), reason="imagery manifest not built")


def _manifest() -> ImageryManifest:
    return ImageryManifest.model_validate_json(MANIFEST.read_text())


def _all_locations() -> dict[str, dict]:
    mars = {s["id"]: {**s, "body": "mars"} for s in json.loads((MANIFEST.parents[1] / "mars" / "sites.json").read_text())["sites"]}
    earth = {c["id"]: {**c, "body": "earth"} for c in json.loads((MANIFEST.parents[1] / "earth" / "candidates.json").read_text())["candidates"]}
    return {**mars, **earth}


def test_manifest_validates_and_covers_every_site_with_verified_fields():
    m = _manifest()
    locations = _all_locations()
    assert {sid for sid in m.sites if m.sites[sid].body == "mars"} == {k for k, v in locations.items() if v["body"] == "mars"}
    for sid, site in m.sites.items():
        assert site.entries, sid
        for e in site.entries:
            assert e.site_id == sid and e.source_page_url.startswith("https://") and e.credit and e.license
            assert e.coverage_evidence and e.relevance and e.verified_on
            assert e.relationship in ("exact_location", "landing_ellipse", "candidate_region", "nearby_scene")
            if e.image_type == "orbital_mosaic":
                assert e.bounds is not None and e.bounds.west < e.bounds.east and e.bounds.south < e.bounds.north
                assert e.spatial_resolution_m_per_px
                # a multi-orbit mosaic has no single acquisition date; a single-day image (MODIS fallback) does
                assert e.acquisition_date is None or "Single-day" in (e.acquisition_note or "")
            # acquisition and release dates are distinct fields; a release date never fills an acquisition date
            if e.acquisition_date is not None:
                assert e.acquisition_note and len(e.acquisition_note) > 20  # every dated entry says where the date comes from
        views = {e.view for e in site.entries}
        assert set(site.missing_views) == {v for v in ("orbital", "surface") if v not in views}


def test_oxia_has_no_surface_view_and_says_so():
    site = _manifest().sites["oxia_planum"]
    assert "surface" in site.missing_views and site.notes and "No landed mission" in site.notes[0]


def test_georeferenced_mosaic_bounds_contain_the_site_and_are_regional_or_local():
    m = _manifest()
    locations = _all_locations()
    for sid, site in m.sites.items():
        for e in site.entries:
            if e.bounds:
                s = locations[sid]
                assert e.bounds.west <= s["lon_east"] <= e.bounds.east and e.bounds.south <= s["lat"] <= e.bounds.north
                km_per_deg = 59.27 if s["body"] == "mars" else 111.19
                width_km = (e.bounds.east - e.bounds.west) * km_per_deg
                assert 5 < width_km < (80 if s["body"] == "mars" else 300)


def test_cached_assets_exist_and_match_recorded_size():
    m = _manifest()
    for site in m.sites.values():
        for e in site.entries:
            p = MANIFEST.parent / "assets" / e.local_asset
            assert p.exists() and p.stat().st_size == e.bytes and e.mime_type.startswith("image/")


def test_endpoints_serve_manifest_and_asset(client):
    body = client.get("/api/v1/sites/jezero_crater/imagery").json()
    assert body["site_id"] == "jezero_crater" and {e["view"] for e in body["entries"]} == {"orbital", "surface"}
    entry = body["entries"][0]
    r = client.get(f"/api/v1/imagery/{entry['entry_id']}/asset")
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/") and len(r.content) == entry["bytes"]
    assert client.get("/api/v1/sites/nope/imagery").status_code == 404
    assert client.get("/api/v1/imagery/nope/asset").status_code == 404


def test_proxy_refuses_non_allowlisted_hosts_and_non_images(monkeypatch, tmp_path):
    with pytest.raises(HTTPException) as ex:
        ir._fetch_to_cache("https://evil.example/x.jpg", tmp_path / "x.jpg", ["images-assets.nasa.gov"])
    assert ex.value.status_code == 502 and ex.value.detail["code"] == "asset_not_allowed"

    class FakeResp:
        headers = {"Content-Type": "text/html"}
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self, n=-1): return b"<html>"
    class FakeOpener:
        def open(self, req, timeout=30): return FakeResp()
    monkeypatch.setattr(ir.urllib.request, "build_opener", lambda *handlers: FakeOpener())
    with pytest.raises(HTTPException) as ex2:
        ir._fetch_to_cache("https://images-assets.nasa.gov/image/x.jpg", tmp_path / "y.jpg", ["images-assets.nasa.gov"])
    assert ex2.value.detail["code"] == "asset_rejected" and not (tmp_path / "y.jpg").exists()


def test_earth_locations_have_imagery_records_with_body_and_licences():
    m = _manifest()
    earth_ids = {c["id"] for c in json.loads((MANIFEST.parents[1] / "earth" / "candidates.json").read_text())["candidates"]}
    if not earth_ids <= set(m.sites):
        pytest.skip("Earth imagery not built into this manifest yet")
    for sid in earth_ids:
        site = m.sites[sid]
        assert site.body == "earth" and site.entries, sid
        assert any(e.view == "orbital" and e.bounds is not None for e in site.entries), f"{sid} lacks a georeferenced orbital context"
        for e in site.entries:
            assert e.license and e.credit and e.source_page_url.startswith("https://")
            assert re.sub(r"^https?://([^/]+).*$", r"\1", e.asset_url.split(" ")[0]) in m.allowlist or e.asset_url.startswith("https://gibs")
            if e.view == "surface":
                assert e.image_type in ("surface_image", "surface_panorama") and e.relationship in ("exact_location", "candidate_region", "nearby_scene")
    # honesty: a site with no verifiable field photo says so
    at = m.sites["atacama_yungay"]
    if not any(e.view == "surface" for e in at.entries):
        assert "surface" in at.missing_views and at.notes


def test_mars_records_declare_body_mars():
    m = _manifest()
    assert all(site.body == "mars" for sid, site in m.sites.items() if sid in {"jezero_crater", "gale_crater", "oxia_planum"})
