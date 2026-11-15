"""Analytical terrain, production artifact integrity, API replay and regressions."""
import hashlib
import json
import socket
from pathlib import Path

import numpy as np
import pytest
from pyproj import Geod
from pydantic import ValidationError
from rasterio.transform import from_origin

from app.config.settings import get_settings
from app.models.discovery import DiscoveryRankRequest
from app.services import discovery_engine as engine
from app.services.analog_engine import feature_distance, load_spec
from app.services.data_loader import get_store
from app.services import analog_rank_engine
from app.models import AnalogRankRequest
from scripts.discovery_terrain import metric_grid, aggregate, stats
from scripts.build_discovery import centres, tile_names, validate_spec
from tests.factories import make_site, make_candidate

DATA=Path(__file__).resolve().parents[1]/"data/discovery"


def installed():
    runs=engine.capabilities().runs
    assert runs, "A real pilot artifact must ship; synthetic fixtures are not the release acceptance."
    return runs[0].run_id


def test_analytical_plane_has_correct_slope_and_no_detrended_relief():
    yy,xx=np.indices((15,15))
    z=xx*4000*.02+yy*4000*.01+700
    values,coverage,support=stats(z)
    assert values["slope_regional_median_deg"]==pytest.approx(np.degrees(np.arctan(np.hypot(.02,.01))))
    assert values["roughness_regional_m"]<1e-9
    assert coverage==support==1


def test_nodata_is_not_filled_and_removes_gradient_neighbours():
    z=np.zeros((15,15));z[7,7]=np.nan
    values,coverage,support=stats(z)
    assert np.isnan(z[7,7])
    assert coverage==224/225
    assert support==164/169
    assert values["roughness_regional_m"]==0
    with pytest.raises(ValueError):stats(np.full((15,15),np.nan))


def test_area_average_and_support_mask_reject_half_missing_cell():
    # Same metric CRS isolates resampling from geographic reprojection.
    crs="EPSG:32630";source=from_origin(0,8000,1000,1000)
    z=np.ones((8,8))*100;z[:4,:2]=np.nan
    out,support=aggregate(z,source,crs,crs,from_origin(0,8000,4000,4000),(2,2))
    assert support[0,0]==pytest.approx(.5)
    assert np.isnan(out[0,0])
    assert np.all(out[1]==100)


@pytest.mark.parametrize("body,lat",[("earth",0),("earth",70),("mars",18.4447),("mars",70)])
def test_physical_grid_spacing_uses_correct_body_and_latitude(body,lat):
    geo,proj,transform,shape,bounds,polygon=metric_grid(lat,10,body)
    from pyproj import Transformer
    inverse=Transformer.from_crs(proj,geo,always_xy=True)
    a=inverse.transform(0,0);b=inverse.transform(4000,0)
    geod=Geod(ellps="WGS84") if body=="earth" else Geod(a=3396000,b=3396000)
    assert geod.inv(*a,*b)[2]==pytest.approx(4000,rel=1e-5)
    assert shape==(15,15) and transform.a==4000 and transform.e==-4000
    assert polygon["coordinates"][0][0]==polygon["coordinates"][0][-1]


def test_tiles_enumerate_all_intersections_including_seams_and_southern_coords():
    assert len(tile_names((-3.2,30.9,-1.8,32.1)))==9
    assert "S02_00_W004" in tile_names((-3.2,-1.9,-2.8,-1.1))[0]
    with pytest.raises(ValueError):tile_names((179.9,0,180.2,1))


def test_sampling_is_systematic_predeclared_and_not_score_driven():
    spec=json.loads((DATA/"pilot.json").read_text());validate_spec(spec)
    points=centres(spec)
    assert len(points)==16 and points[0]["lat"]==31.125 and points[-1]["lon_east"]==-2.125
    assert len({p["id"] for p in points})==16


@pytest.mark.parametrize("weights",[
    {"slope_regional_median_deg":0,"roughness_regional_m":0},
    {"slope_regional_median_deg":-1}, {"roughness_regional_m":float("nan")},
    {"roughness_regional_m":float("inf")}, {}, {"Not A Feature":1},
])
def test_weights_reject_malformed_values(weights):
    """Shape is a request concern: totals, signs, finiteness and feature-id form."""
    with pytest.raises(ValidationError):DiscoveryRankRequest(run_id=installed(),weights=weights)


def test_weights_naming_a_feature_this_survey_does_not_score_are_rejected_not_ignored():
    """Which features exist is a property of the run, so it is the engine that refuses."""
    request=DiscoveryRankRequest(run_id=installed(),weights={"precipitation_mm_day":100})
    with pytest.raises(engine.DiscoveryRejected) as exc:engine.rank(request)
    assert "precipitation_mm_day" in str(exc.value)


def test_each_installed_run_declares_the_basis_it_scores():
    run,_=engine.load_run(installed())
    features=engine.basis(run)
    assert set(features)==set(run.specification["scales"])
    assert all(f in engine.FEATURE_REGISTRY for f in features)
    # A run's defaults must cover exactly its own basis, never a global assumption.
    assert set(engine.default_weights_for(run))==set(features)


def test_dimension_scores_partition_the_weighted_total():
    response=engine.rank(DiscoveryRankRequest(run_id=installed()))
    for candidate in response.candidates:
        assert candidate.dimension_scores
        assert sum(d.weight_share for d in candidate.dimension_scores)==pytest.approx(1)
        scored={f for d in candidate.dimension_scores for f in d.feature_ids}
        assert scored=={f.feature_id for f in candidate.feature_distances}
        # Weighting each group's own distance by its share rebuilds the overall distance.
        total=sum(d.distance*d.weight_share for d in candidate.dimension_scores)
        assert total==pytest.approx(candidate.distance)


def test_real_run_counts_provenance_geometry_and_numeric_basis():
    run,manifest=engine.load_run(installed())
    assert len(run.audit_rows)==run.survey.generated_count==16
    assert len(run.validation["known_catalog"]["entries"])>7
    assert any(s.institution.startswith("NASA") for s in run.provenance)
    assert all(s.sha256 and s.license for s in run.provenance)
    result=engine.rank(DiscoveryRankRequest(run_id=run.run_id,top_k=20))
    assert result.eligible_pool_count==run.survey.eligible_count
    assert result.returned_count<=result.eligible_pool_count
    assert len(result.basis_features)==2
    for a in result.candidates:
        assert a.context.geology_status=="not_assessed"
        assert a.novelty.outside_catalog_buffer
        assert a.similarity_index==100/(1+a.distance)
        assert a.distance==sum(f.contribution for f in a.feature_distances)
        assert a.display_rank is not None and a.raw_rank>=a.display_rank
    for i,a in enumerate(result.candidates):
        for b in result.candidates[:i]:
            assert engine.distance_km(a.lat,a.lon_east,b.lat,b.lon_east)>=run.survey.diversification["minimum_center_distance_km"]


def test_ranking_is_deterministic_reranks_full_pool_and_does_not_mutate_artifact():
    rid=installed();request=DiscoveryRankRequest(run_id=rid,client_request_id="a")
    before=(engine.root()/rid/"run.json").read_bytes()
    a=engine.rank(request);b=engine.rank(request)
    assert a==b and a.client_request_id=="a"
    other=engine.rank(DiscoveryRankRequest(run_id=rid,weights={"slope_regional_median_deg":100,"roughness_regional_m":0}))
    assert other.eligible_pool_count==a.eligible_pool_count
    assert other.effective_weights["roughness_regional_m"]==0
    assert all(f.contribution==0 for c in other.candidates for f in c.feature_distances if f.feature_id=="roughness_regional_m")
    assert before==(engine.root()/rid/"run.json").read_bytes()


def test_api_serves_rank_detail_export_without_network(client,monkeypatch):
    def blocked(*a,**k):raise AssertionError("API attempted network")
    monkeypatch.setattr(socket.socket,"connect",blocked)
    cap=client.get('/api/v1/discovery/capabilities');assert cap.status_code==200
    rid=cap.json()["runs"][0]["run_id"]
    result=client.post('/api/v1/discovery/rank',json={"run_id":rid,"client_request_id":"replay"})
    assert result.status_code==200 and result.json()["client_request_id"]=="replay"
    candidate=result.json()["candidates"][0]
    d=client.get(f'/api/v1/discovery/runs/{rid}/candidates/{candidate["id"]}')
    assert d.status_code==200 and d.json()["profile"] and d.json()["distance"] is None
    export=client.get(f'/api/v1/discovery/runs/{rid}/export')
    assert export.status_code==200 and len(export.json()["audit_rows"])==16
    assert client.get(f'/api/v1/discovery/runs/{rid}/candidates/unknown').status_code==404
    assert client.post('/api/v1/discovery/rank',json={"run_id":"unknown"}).status_code==404
    for payload in [{"run_id":rid,"top_k":0},{"run_id":rid,"reference_id":"moon"},
        {"run_id":rid,"weights":{"slope_regional_median_deg":0,"roughness_regional_m":0}}, {"run_id":"../escape"}]:
        assert client.post('/api/v1/discovery/rank',json=payload).status_code==422


def test_no_artifact_and_corrupt_artifact_fail_honestly(client,tmp_path,monkeypatch):
    monkeypatch.setattr(engine,"root",lambda:tmp_path)
    assert client.get('/api/v1/discovery/capabilities').json()["state"]=="unavailable"
    assert client.post('/api/v1/discovery/rank',json={"run_id":"missing"}).status_code==503
    d=tmp_path/"broken";d.mkdir();(d/"run.json").write_text('{}');(d/"manifest.json").write_text('{"sha256":"wrong"}')
    assert client.get('/api/v1/discovery/capabilities').json()["runs"]==[]
    assert client.post('/api/v1/discovery/rank',json={"run_id":"broken"}).status_code==503


def test_existing_analog_engine_rejects_unit_mismatch():
    f=next(f for f in load_spec()["features"] if f["feature_id"]=="roughness_regional_m")
    _,m=make_site("mars",{"roughness_regional_m":100})
    _,e=make_candidate("earth",{"roughness_regional_m":.1})
    e.get("roughness_regional_m").unit="km"
    result=feature_distance(f,m,e,50)
    assert not result.comparable and "incompatible units" in result.note
    e.get("roughness_regional_m").unit="m"
    m.get("roughness_regional_m").unit=None
    assert not feature_distance(f,m,e,50).comparable


def test_curated_rank_sorts_full_precision_before_rounded_ties(monkeypatch):
    original=analog_rank_engine._pair_fds
    store=get_store()
    ids=sorted(c.id for c in store.earth_candidates())
    def close(mp,ep,w):
        fds=original(mp,ep,w)
        for f in fds:
            if f.comparable:
                f.distance=.12345649 if ep.site_id==ids[0] else .12345641
        return fds
    monkeypatch.setattr(analog_rank_engine,"_pair_fds",close)
    result=analog_rank_engine.rank_pool(AnalogRankRequest(reference_body="mars",reference_id="jezero_crater"),store)
    assert result.candidates[-1].location.id==ids[0]
    assert result.candidates[0].distance==result.candidates[-1].distance


def test_pair_match_top_k_uses_full_distance_when_display_indices_tie():
    from app.services.analog_engine import match_all
    from app.models import AnalogWeight
    site,mp=make_site("mars",{"roughness_regional_m":100})
    bad,bp=make_candidate("a_bad",{"roughness_regional_m":100.000049})
    good,gp=make_candidate("z_good",{"roughness_regional_m":100.000041})
    # Other spec defaults must also be disabled explicitly.
    weights=[AnalogWeight(feature_id=f["feature_id"],weight=100 if f["feature_id"]=="roughness_regional_m" else 0) for f in load_spec()["features"]]
    ranked,_=match_all(site,mp,[(bad,bp),(good,gp)],weights,2)
    assert ranked[0].earth_candidate.id=="z_good"
    assert ranked[0].similarity==ranked[1].similarity


def test_empty_eligible_pool_returns_empty_not_fabricated(monkeypatch):
    run,manifest=engine.load_run(installed())
    for row in run.audit_rows:row.screening_reasons=["test_exclusion"]
    run.survey.eligible_count=0
    monkeypatch.setattr(engine,"load_run",lambda rid:(run,manifest))
    result=engine.rank(DiscoveryRankRequest(run_id=run.run_id))
    assert result.eligible_pool_count==result.returned_count==0 and result.candidates==[]


def test_artifact_count_corruption_rejected_even_with_recomputed_file_hash(tmp_path,monkeypatch):
    run,_=engine.load_run(installed());d=tmp_path/run.run_id;d.mkdir()
    run.survey.eligible_count+=1
    raw=run.model_dump_json().encode();(d/"run.json").write_bytes(raw)
    (d/"manifest.json").write_text(json.dumps({"run_id":run.run_id,"sha256":hashlib.sha256(raw).hexdigest()}))
    monkeypatch.setattr(engine,"root",lambda:tmp_path)
    with pytest.raises(engine.DiscoveryUnavailable,match="counts"):
        engine.load_run(run.run_id)


def test_profile_rejects_development_fixtures_and_nonfinite_values():
    from app.models.discovery import TerrainMeasurement
    for change in [{"value":float("nan")},{"measurement_type":"demo_fixture"},{"unit":"km"}]:
        with pytest.raises(ValidationError):TerrainMeasurement(**({"value":1,"unit":"m"}|change))


def test_validation_attachment_is_bound_to_immutable_run(tmp_path,monkeypatch):
    import shutil
    rid=installed();shutil.copytree(engine.root()/rid,tmp_path/rid)
    d=tmp_path/rid
    (d/"validation.json").write_text('{}')
    (d/"validation-manifest.json").write_text(json.dumps({"sha256":"incorrect","run_sha256":"incorrect"}))
    monkeypatch.setattr(engine,"root",lambda:tmp_path)
    with pytest.raises(engine.DiscoveryUnavailable,match="attachment"):
        engine.load_run(rid)
