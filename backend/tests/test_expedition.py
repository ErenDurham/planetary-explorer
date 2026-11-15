"""Synthetic scientific invariants plus installed-data API integration (no network)."""
import math
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import app
from app.models.expedition import Bounds, GeoPoint, PlanRequest, RoverParameters
from app.services.expedition.geo import distance_m, edge_metrics, RADII_M
from app.services.expedition.terrain import TerrainGrid, load_terrain, _raw
from app.services.expedition.pathfinding import astar
from app.services.expedition.engine import plan, capabilities

client=TestClient(app)

def point(lat=0,lon=0):return GeoPoint(lat=lat,lon_east=lon)

def grid(z):
    z=np.array(z,dtype=float);r,c=z.shape
    return TerrainGrid(z,np.arange(r)[::-1]*.01,np.arange(c)*.01,
        Bounds(west=-.005,east=(c-.5)*.01,north=(r-.5)*.01,south=-.005))

def request(**kw):
    args=dict(body="mars",site_id="jezero_crater",objective="terrain_survey",start=point(18.4447,77.4508),
        waypoints=[point(18.65,77.65)],rover=RoverParameters(battery_capacity_wh=1e8),client_request_id="test-42")
    args.update(kw);return PlanRequest(**args)

@pytest.mark.parametrize("body",["mars","moon","earth"])
def test_surface_distance(body):
    assert distance_m(point(),point(0,1),body)==pytest.approx(RADII_M[body]*math.pi/180)
    assert distance_m(point(),point(),body)==0
    assert distance_m(point(0,179.9),point(0,-179.9),body)==pytest.approx(RADII_M[body]*math.radians(.2))
    assert distance_m(point(90,0),point(90,100),body)<1e-8
    assert distance_m(point(),point(0,180),body)==pytest.approx(math.pi*RADII_M[body])

def test_coordinates_normalize_and_reject_invalid():
    assert point(0,359).lon_east==-1
    assert point(0,180).lon_east==-180
    for args in [(91,0),(0,361),(float('nan'),0),(0,float('inf'))]:
        with pytest.raises(ValidationError):point(*args)
    with pytest.raises(ValidationError):request(waypoints=[])
    with pytest.raises(ValidationError):RoverParameters(max_slope_deg=0)

def test_energy_physical_terms_and_no_regeneration():
    rover=RoverParameters(mass_kg=100,rolling_resistance=.1,drive_efficiency=.5,hotel_power_w=20,nominal_speed_m_s=1)
    a,b=point(),point(0,.01)
    d,s,t,e=edge_metrics(a,b,0,0,"mars",rover,3.73)
    assert s==0
    assert e==pytest.approx(100*3.73*.1*d/.5/3600+20*d/3600)
    _,s,t,up=edge_metrics(a,b,0,10,"mars",rover,3.73)
    _,_,_,down=edge_metrics(a,b,10,0,"mars",rover,3.73)
    assert up-down==pytest.approx(100*3.73*10/.5/3600)
    assert down>=e
    assert s==pytest.approx(math.degrees(math.atan(10/d)))

@pytest.mark.parametrize("preference",["shortest_distance","lowest_energy","lowest_risk","balanced"])
def test_astar_flat_grid_and_determinism(preference):
    g=grid(np.zeros((7,7)));r=RoverParameters()
    p=astar(g,(0,0),(6,6),r,preference)
    assert p==[(i,i) for i in range(7)]
    assert astar(g,(0,0),(6,6),r,preference)==p

def test_missing_barrier_and_no_corner_cut():
    z=np.zeros((7,7));z[:,3]=np.nan;g=grid(z)
    assert astar(g,(3,0),(3,6),RoverParameters(),"balanced") is None
    z=np.zeros((5,5));z[0,1]=np.nan;z[1,0]=np.nan
    assert astar(grid(z),(0,0),(4,4),RoverParameters(),"balanced") is None

def test_gradient_and_slope_limit():
    g=grid(np.tile(np.arange(7)*1000.,(7,1)))
    assert g.slopes()[3,3]>45
    assert astar(g,(3,0),(3,6),RoverParameters(max_slope_deg=5),"shortest_distance") is None

def test_longitude_seam_grid_cell_mapping():
    g=TerrainGrid(np.zeros((3,3)),np.array([1.,0.,-1.]),np.array([179.,180.,181.]),Bounds(west=178.5,east=181.5,south=-1.5,north=1.5))
    assert g.cell(point(0,-179))==(1,2)
    assert g.point((1,2)).lon_east==-179
    assert g.cell(point(0,178)) is None

@pytest.mark.parametrize("body,site",[("moon","apollo_11"),("moon","apollo_15"),("earth","haughton_crater")])
def test_unavailable_is_not_synthetic(body,site):
    if body=="earth":
        site=next(x.site_id for x in capabilities().regions if x.body=="earth")
    ctx,g=load_terrain(body,site)
    assert g is None and not ctx.dem.available
    result=plan(request(body=body,site_id=site,start=ctx.start,waypoints=[ctx.start]))
    assert result.data_status=="unavailable" and result.route==[]
    assert result.metrics.total_distance_m is None
    assert result.feasibility.verdict=="undetermined"

def test_missing_raw_file(monkeypatch,tmp_path):
    import app.services.expedition.terrain as terrain
    from types import SimpleNamespace
    monkeypatch.setattr(terrain,"get_settings",lambda:SimpleNamespace(data_dir=tmp_path))
    ctx,g=terrain.load_terrain("mars","jezero_crater")
    assert g is None and "not installed" in ctx.dem.note

def test_bad_product_rejected(tmp_path):
    p=tmp_path/"bad.img";p.write_bytes(b"broken")
    with pytest.raises(ValueError,match="byte count"):_raw(str(p),6,1)

def installed():
    ctx,g=load_terrain("mars","jezero_crater")
    if g is None:pytest.skip("MOLA raw product not installed")
    return ctx,g

def test_installed_mola_cell_centers_and_source():
    ctx,g=installed()
    assert g.z.shape==(16,16)
    assert ctx.dem.valid_fraction==1
    assert ctx.dem.dataset.sha256
    assert (90-g.latitudes[0])*16%1==pytest.approx(.5)
    assert g.longitudes[0]*16%1==pytest.approx(.5)
    assert 3690<ctx.dem.cell_height_m<3720
    assert ctx.dem.cell_width_m<ctx.dem.cell_height_m

def test_real_route_api_and_accounting():
    installed()
    response=client.post('/api/v1/expedition/plan',json=request().model_dump())
    assert response.status_code==200,response.text
    data=response.json()
    assert data['client_request_id']=='test-42'
    assert data['status']=='ok' and data['data_status']=='limited'
    assert data['feasibility']['verdict']=='undetermined'
    assert data['metrics']['total_distance_m']>0
    assert sum(x['distance_m'] for x in data['route'])==pytest.approx(data['metrics']['total_distance_m'])
    assert sum(x['energy_wh'] for x in data['route'])==pytest.approx(data['metrics']['energy_wh'])
    for seg in data['route']:
        assert len(seg['polyline'])==len(seg['elevations_m'])
        assert len(seg['edge_slopes_deg'])==len(seg['polyline'])-1
        assert seg['polyline'][0]==seg['from']
    assert all(x['visited'] for x in data['stops'])

def test_battery_and_outside_coverage():
    installed()
    result=plan(request(rover=RoverParameters(battery_capacity_wh=1)))
    assert result.status=='infeasible' and result.feasibility.verdict=='infeasible'
    assert result.route
    result=plan(request(waypoints=[point(0,0)]))
    assert result.status=='infeasible' and result.route==[]
    assert result.stops[-1].snapped is None

def test_user_targets_are_not_scientific_observations():
    installed()
    result=plan(request(waypoints=[],user_targets=[dict(target_id="hypothesis-1",name="User hypothesis",lat=18.65,lon_east=77.65)]))
    assert result.metrics.targets_reached==['hypothesis-1']
    assert result.visited_targets[0].coordinate_status=='user_defined'
    response=client.post('/api/v1/expedition/plan',json=request(target_ids=['invented']).model_dump())
    assert response.status_code==422

def test_site_changes_and_body_mismatch():
    installed()
    a=plan(request());ctx,g=load_terrain("mars","gale_crater")
    b=plan(request(site_id='gale_crater',start=ctx.start,waypoints=[g.point((2,2))]))
    assert a.plan_id!=b.plan_id
    assert a.terrain.routing_bounds!=b.terrain.routing_bounds
    assert client.get('/api/v1/expedition/terrain?body=moon&site_id=jezero_crater').status_code==422

def test_same_cell_does_not_claim_resolved_route():
    installed()
    result=plan(request(waypoints=[point(18.4447,77.4508)]))
    assert result.status=='partial'
    assert result.metrics.total_distance_m is None
    assert any('same DEM cell' in w.message for w in result.warnings)

def test_capabilities_and_terrain_api():
    response=client.get('/api/v1/expedition/capabilities')
    assert response.status_code==200
    assert len([x for x in response.json()['regions'] if x['body']=='mars'])==8
    assert response.json()['objectives']==['terrain_survey','geological_sampling','research_traverse']
    response=client.get('/api/v1/expedition/terrain?body=moon&site_id=apollo_11')
    assert response.status_code==200 and response.json()['research_targets']==[]

def test_energy_preference_avoids_unnecessary_climb():
    z=np.zeros((9,9));z[3:6,3:6]=200
    g=grid(z)
    rover=RoverParameters(max_slope_deg=30,hotel_power_w=0,rolling_resistance=.01,drive_efficiency=1,nominal_speed_m_s=1)
    shortest=astar(g,(4,0),(4,8),rover,'shortest_distance')
    efficient=astar(g,(4,0),(4,8),rover,'lowest_energy')
    assert any(g.z[c]>0 for c in shortest)
    assert all(g.z[c]==0 for c in efficient)
    def energy(path):
        return sum(edge_metrics(g.point(a),g.point(b),g.z[a],g.z[b],g.body,rover,3.73)[3] for a,b in zip(path,path[1:]))
    assert energy(efficient)<energy(shortest)

def test_partial_route_stops_at_first_blocked_leg(monkeypatch):
    import app.services.expedition.engine as engine
    from app.models.expedition import TerrainContext,TerrainCoverage
    z=np.zeros((7,7));z[3,:]=np.nan;g=grid(z)
    ctx=TerrainContext(body='mars',site_id='test',start=g.point((0,0)),routing_bounds=g.bounds,dem=TerrainCoverage(available=True))
    monkeypatch.setattr(engine,'load_terrain',lambda *_:(ctx,g))
    r=engine.plan(request(site_id='test',start=g.point((0,0)),waypoints=[g.point((0,2)),g.point((6,6)),g.point((0,3))]))
    assert r.status=='partial' and len(r.route)==1
    assert [s.visited for s in r.stops]==[True,True,False,False]
    assert r.metrics.total_distance_m==pytest.approx(r.route[0].distance_m)
    assert r.feasibility.verdict=='infeasible'

def test_reserved_and_duplicate_target_ids():
    for ids in [['start'],['waypoint-1'],['x','x']]:
        with pytest.raises(ValidationError):request(target_ids=ids)

@pytest.mark.parametrize('objective',['terrain_survey','geological_sampling','research_traverse'])
def test_objectives_preserve_explicit_routing_and_science_limits(objective):
    installed()
    a=plan(request(objective=objective))
    assert a.objective==objective
    assert a.interpretation.generated_by=='rule_based'
    assert a.metrics.total_distance_m==pytest.approx(plan(request()).metrics.total_distance_m)

@pytest.mark.parametrize('site',['jezero_crater','gale_crater','elysium_planitia','oxia_planum','utopia_planitia','chryse_planitia','meridiani_planum','gusev_crater'])
def test_each_featured_mars_region_has_a_real_route(site):
    installed()
    ctx,g=load_terrain('mars',site)
    result=plan(request(site_id=site,start=g.point((2,2)),waypoints=[g.point((13,13))]))
    assert ctx.dem.dataset.source=='NASA PDS / MOLA Science Team'
    assert result.status=='ok' and result.metrics.total_distance_m>0
    assert result.route[0].polyline[0]==g.point((2,2))
    assert result.route[-1].polyline[-1]==g.point((13,13))
