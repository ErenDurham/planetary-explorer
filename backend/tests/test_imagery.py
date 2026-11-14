"""Site imagery manifest and asset proxy: schema, coverage honesty, allowlist
and failure states. No network: the proxy's fetch is monkeypatched."""
import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api import imagery_routes as ir
from app.models import ImageryManifest

MANIFEST = Path(__file__).resolve().parents[1] / "data" / "imagery" / "manifest.json"
pytestmark = pytest.mark.skipif(not MANIFEST.exists(), reason="imagery manifest not built")


def _manifest() -> ImageryManifest:
    return ImageryManifest.model_validate_json(MANIFEST.read_text())


def test_manifest_validates_and_covers_every_site_with_verified_fields():
    m = _manifest()
    sites = json.loads((MANIFEST.parents[1] / "mars" / "sites.json").read_text())["sites"]
    assert set(m.sites) == {s["id"] for s in sites}
    for sid, site in m.sites.items():
        assert site.entries, sid
        for e in site.entries:
            assert e.site_id == sid and e.source_page_url.startswith("https://") and e.credit and e.license
            assert e.coverage_evidence and e.relevance and e.verified_on
            assert e.relationship in ("exact_location", "landing_ellipse", "candidate_region", "nearby_scene")
            if e.image_type == "orbital_mosaic":
                assert e.bounds is not None and e.bounds.west < e.bounds.east and e.bounds.south < e.bounds.north
                assert e.spatial_resolution_m_per_px and e.acquisition_date is None  # a mosaic has no single acquisition date
            # acquisition and release dates are distinct fields; a release date never fills an acquisition date
            if e.acquisition_date is not None:
                assert e.acquisition_note and "Caption" in e.acquisition_note
        views = {e.view for e in site.entries}
        assert set(site.missing_views) == {v for v in ("orbital", "surface") if v not in views}


def test_oxia_has_no_surface_view_and_says_so():
    site = _manifest().sites["oxia_planum"]
    assert "surface" in site.missing_views and site.notes and "No landed mission" in site.notes[0]


def test_ctx_mosaic_bounds_contain_the_site_and_are_regional_or_local():
    m = _manifest()
    sites = {s["id"]: s for s in json.loads((MANIFEST.parents[1] / "mars" / "sites.json").read_text())["sites"]}
    for sid, site in m.sites.items():
        for e in site.entries:
            if e.bounds:
                s = sites[sid]
                assert e.bounds.west <= s["lon_east"] <= e.bounds.east and e.bounds.south <= s["lat"] <= e.bounds.north
                width_km = (e.bounds.east - e.bounds.west) * 59.27
                assert 5 < width_km < 80


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
