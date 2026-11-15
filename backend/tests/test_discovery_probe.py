"""The dropped-pin probe: same pipeline and formula as the survey, honest when it cannot measure."""
import socket

import numpy as np
import pytest

from app.models.discovery import DiscoveryProbeRequest, DiscoveryRankRequest, TerrainMeasurement
from app.services import discovery_engine as engine
from app.services import discovery_probe as probe_service
from scripts.discovery_terrain import metric_grid, profile


def installed():
    runs = engine.capabilities().runs
    assert runs
    return runs[0].run_id


def fake_grid(z_fn, support=1.0, errors=(), seen=None):
    """An earth_grid stand-in: a footprint whose elevation is an analytic function of the metric grid."""
    def earth_grid(lat, lon, spec, offline=False, offset=(0, 0)):
        if seen is not None:
            seen.append(offline)
        geographic, projection, transform, shape, _, polygon = metric_grid(lat, lon, "earth", spec["cell_m"], spec["footprint_m"], offset)
        yy, xx = np.indices(shape, dtype=float)
        z = z_fn(xx * spec["cell_m"], yy * spec["cell_m"])
        source = [{"source_id": "cop_test", "title": "test tile", "institution": "test", "url": "https://example.invalid/t.tif",
                   "license": "test", "retrieved_at": "2026-01-01T00:00:00+00:00", "observation_period": "n/a", "sha256": "0" * 64, "etag": None}]
        return z, np.full(shape, support), (geographic, projection, transform), polygon, source, list(errors)
    return earth_grid


@pytest.fixture
def no_network(monkeypatch):
    def blocked(*a, **k): raise AssertionError("probe attempted network")
    monkeypatch.setattr(socket.socket, "connect", blocked)


def test_plane_scores_with_the_survey_formula_and_places_against_the_pool(client, monkeypatch, no_network):
    # a 1 percent grade: median slope is analytic, and a plane has no detrended relief
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (fake_grid(lambda x, y: 0.01 * x), profile))
    rid = installed()
    run, _ = engine.load_run(rid)
    weights = {"slope_regional_median_deg": 70, "roughness_regional_m": 30}
    r = client.post("/api/v1/discovery/probe", json={"run_id": rid, "lat": 31.5, "lon_east": -2.5, "weights": weights, "client_request_id": "pin-1"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scored" and body["client_request_id"] == "pin-1"
    by_id = {f["feature_id"]: f for f in body["feature_distances"]}
    assert by_id["slope_regional_median_deg"]["earth_value"] == pytest.approx(np.degrees(np.arctan(0.01)), abs=1e-6)
    assert by_id["roughness_regional_m"]["earth_value"] == pytest.approx(0, abs=1e-6)
    ref = run.reference_profile.measurements
    expected = 0.7 * abs(by_id["slope_regional_median_deg"]["earth_value"] - ref["slope_regional_median_deg"].value) / 1.5 \
        + 0.3 * abs(0 - ref["roughness_regional_m"].value) / 100
    assert body["distance"] == pytest.approx(expected) and body["similarity_index"] == pytest.approx(100 / (1 + expected))
    assert sum(d["weight_share"] for d in body["dimension_scores"]) == pytest.approx(1)
    # placement is the pool's own distances under the same weights
    ranked = engine.rank(DiscoveryRankRequest(run_id=rid, weights=weights, top_k=40))
    closer = sum(1 for c in ranked.candidates if c.distance < body["distance"])
    pool = ranked.eligible_pool_count
    assert body["placement"]["eligible_pool_count"] == pool
    # chosen candidates are a diversified subset, so the full pool count is bounded below by them
    assert body["placement"]["closer_survey_candidates"] >= closer
    assert body["placement"]["inside_survey_bounds"] is True
    assert body["placement"]["nearest_survey_candidate_id"]
    assert body["novelty"]["catalog_version"] == "known-analogs-v1.0" and body["novelty"]["outside_catalog_buffer"] is True
    assert body["footprint_geojson"]["type"] == "Polygon" and body["profile"]["terrain_valid_fraction"] == 1
    assert any("not part of the preregistered sample" in l for l in body["limitations"])


def test_a_point_inside_the_catalog_buffer_is_scored_but_flagged(client, monkeypatch, no_network):
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (fake_grid(lambda x, y: 0.02 * x + 0.01 * y), profile))
    r = client.post("/api/v1/discovery/probe", json={"run_id": installed(), "lat": -24.1, "lon_east": -69.9})
    assert r.status_code == 200
    n = r.json()["novelty"]
    assert r.json()["status"] == "scored" and n["nearest_known_site_id"] == "atacama_yungay" and n["outside_catalog_buffer"] is False
    assert r.json()["placement"]["inside_survey_bounds"] is False


def test_no_tile_and_thin_coverage_stay_unscored_with_reasons(client, monkeypatch, no_network):
    def no_tiles(lat, lon, spec, offline=False, offset=(0, 0)): raise ValueError("No DEM tiles: ['HTTPError: 404']")
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (no_tiles, profile))
    rid = installed()
    r = client.post("/api/v1/discovery/probe", json={"run_id": rid, "lat": 0.0, "lon_east": -30.0})
    assert r.status_code == 200 and r.json()["status"] == "terrain_unavailable"
    assert r.json()["similarity_index"] is None and r.json()["feature_distances"] == [] and r.json()["placement"]["closer_survey_candidates"] is None
    # half the footprint missing: the survey's own cut-offs apply
    def half(x, y):
        z = 0.01 * x
        z[:, : z.shape[1] // 2] = np.nan
        return z
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (fake_grid(half), profile))
    r = client.post("/api/v1/discovery/probe", json={"run_id": rid, "lat": 31.5, "lon_east": -2.5})
    assert r.status_code == 200 and r.json()["status"] == "insufficient_terrain_coverage"
    assert r.json()["profile"]["terrain_valid_fraction"] == pytest.approx(8 / 15) and r.json()["similarity_index"] is None  # 7 of 15 columns blank


def test_a_feature_the_point_cannot_supply_leaves_the_probe_unscored(client, monkeypatch, no_network):
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (fake_grid(lambda x, y: 0.01 * x), profile))
    rid = installed()
    run, manifest = engine.load_run(rid)
    # a run that scores a climate feature the probe has no provider for
    run.specification = {**run.specification, "scales": {**run.specification["scales"], "precipitation_mm_day": 1.0}}
    # a real run carries that feature in every profile; only the probe's point lacks it
    rain = TerrainMeasurement(value=0.1, unit="mm/day", measurement_type="measured")
    run.reference_profile.measurements["precipitation_mm_day"] = rain
    for row in run.audit_rows:
        if row.profile is not None:
            row.profile.measurements["precipitation_mm_day"] = rain
    monkeypatch.setattr(probe_service, "load_run", lambda _rid: (run, manifest))
    monkeypatch.setitem(engine.FEATURE_REGISTRY, "precipitation_mm_day", ("Mean precipitation", "mm/day", 1.0, "water", "test"))
    r = client.post("/api/v1/discovery/probe", json={"run_id": rid, "lat": 31.5, "lon_east": -2.5})
    assert r.status_code == 200 and r.json()["status"] == "features_unavailable"
    assert "Mean precipitation" in r.json()["reasons"][-1] and r.json()["similarity_index"] is None


def test_probe_reads_the_cache_only_unless_fetching_is_enabled(client, monkeypatch, no_network):
    from app.config.settings import get_settings
    seen = []
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (fake_grid(lambda x, y: 0.01 * x, seen=seen), profile))
    rid = installed()
    monkeypatch.setattr(get_settings(), "discovery_probe_fetch", False)
    r = client.post("/api/v1/discovery/probe", json={"run_id": rid, "lat": 31.5, "lon_east": -2.5})
    assert r.status_code == 200 and seen == [True] and any("does not download" in l for l in r.json()["limitations"])
    monkeypatch.setattr(get_settings(), "discovery_probe_fetch", True)
    r = client.post("/api/v1/discovery/probe", json={"run_id": rid, "lat": 31.5, "lon_east": -2.5})
    assert r.status_code == 200 and seen == [True, False] and not any("does not download" in l for l in r.json()["limitations"])


def test_requests_the_survey_cannot_answer_are_refused_plainly(client, monkeypatch, no_network):
    monkeypatch.setattr(probe_service, "terrain_tools", lambda: (fake_grid(lambda x, y: 0.01 * x), profile))
    rid = installed()
    assert client.post("/api/v1/discovery/probe", json={"run_id": "unknown", "lat": 1, "lon_east": 1}).status_code == 404
    for payload in [{"run_id": rid, "lat": 85, "lon_east": 10}, {"run_id": rid, "lat": 10, "lon_east": 179.9},
                    {"run_id": rid, "lat": 10, "lon_east": 10, "weights": {"insolation": 1}},
                    {"run_id": rid, "lat": 10, "lon_east": 10, "weights": {"slope_regional_median_deg": 0, "roughness_regional_m": 0}},
                    {"run_id": rid, "lat": 91, "lon_east": 10}, {"run_id": "../x", "lat": 1, "lon_east": 1}]:
        assert client.post("/api/v1/discovery/probe", json=payload).status_code == 422, payload


def test_without_raster_libraries_the_probe_is_unavailable_not_wrong(client, monkeypatch, no_network):
    def missing(): raise engine.DiscoveryUnavailable("Pin scoring runs only against the local API")
    monkeypatch.setattr(probe_service, "terrain_tools", missing)
    r = client.post("/api/v1/discovery/probe", json={"run_id": installed(), "lat": 31.5, "lon_east": -2.5})
    assert r.status_code == 503 and "data_unavailable" in r.text and "local API" in r.text


def test_request_model_rejects_polar_and_malformed_weights():
    with pytest.raises(ValueError):
        DiscoveryProbeRequest(run_id="x", lat=10, lon_east=10, weights={"Slope!": 1})
    with pytest.raises(ValueError):
        DiscoveryProbeRequest(run_id="x", lat=10, lon_east=10, weights={})
