"""Regional expedition orchestration. Never writes mission rankings or site data."""
import hashlib
import math
from datetime import datetime, timezone
import numpy as np
from app.models.expedition import (
    Feasibility, GeoPoint, Interpretation, PlanMetrics, PlanRequest, PlanResponse,
    PlanWarning, Region, RoverParameters, RoverProfile, RouteSegment, ServiceCapabilities,
    SnappedStop, VisitedTarget,
)
from .geo import distance_m, edge_metrics
from .pathfinding import astar
from .terrain import LIMITS, load_terrain, regions

VERSION="expedition-v1"
OBJECTIVES={
    "terrain_survey":"Characterize terrain along user-selected regional transects; no automated survey completeness is inferred.",
    "geological_sampling":"Reach designated sampling hypotheses; target geology and sample accessibility require independent verification.",
    "research_traverse":"Connect ordered research stops; no scientific value or discovery probability is inferred.",
}
ASSUMPTIONS=[
    "8-neighbor A* within the region grid; missing cells and slopes above the requested limit are blocked.",
    "Inputs snap to containing DEM cell centers. No interpolated fine-scale route or connector is invented.",
    "Energy = (mass*g*Crr*horizontal distance + mass*g*positive elevation gain)/efficiency/3600 + hotel W*drive hours.",
    "Example rover parameters are assumptions, not a calibrated vehicle. No descent regeneration, solar recharge or stop-operation energy.",
    "Slope risk is a heuristic slope/limit ratio, not probability or overall mission risk.",
    "All ordered stops are attempted; path optimization never reorders or assigns scientific value to targets.",
]

def capabilities():
    items=[]
    for loc in regions():
        context,_=load_terrain(loc.body,loc.id)
        items.append(Region(body=loc.body,site_id=loc.id,name=loc.name,
            terrain_available=context.dem.available,note=context.dem.note or ""))
    return ServiceCapabilities(engine_version=VERSION,bodies=["mars","moon"],
        objectives=list(OBJECTIVES),optimization_preferences=["shortest_distance","lowest_energy","lowest_risk","balanced"],
        rover_profiles=[RoverProfile(profile_id="example_rover",label="Example rover assumptions",
            description="Editable, uncalibrated engineering example; not a named operational rover.",parameters=RoverParameters())],
        regions=items,notes=["Mars routes use regional MOLA only; lunar terrain is unavailable.","No verified subregional research-target coordinates are installed; user-defined targets are supported."])

def plan(req: PlanRequest) -> PlanResponse:
    context,grid=load_terrain(req.body,req.site_id)
    known={t.target_id:t for t in context.research_targets}
    if any(t not in known for t in req.target_ids):
        raise ValueError("Unknown verified target ID. Supply user_targets with explicit coordinates instead.")
    targets=[known[t] for t in req.target_ids]+req.user_targets
    stops=[("start",req.start)]+[(f"waypoint-{i+1}",p) for i,p in enumerate(req.waypoints)]+[(t.target_id,GeoPoint(lat=t.lat,lon_east=t.lon_east)) for t in targets]
    target_ids=[t.target_id for t in targets]
    report=PlanResponse(plan_id=hashlib.sha256(req.model_dump_json().encode()).hexdigest()[:24],
        client_request_id=req.client_request_id,body=req.body,site_id=req.site_id,status="partial",
        data_status="limited" if grid is not None else "unavailable",objective=req.objective,route=[],
        metrics=PlanMetrics(targets_unreached=target_ids),
        feasibility=Feasibility(verdict="undetermined",summary="Terrain is unavailable; no route computed.",reasons=[]),
        warnings=[],assumptions=list(ASSUMPTIONS),limitations=list(LIMITS),
        datasets=[context.dem.dataset] if context.dem.dataset else [],terrain=context,constraints=req.rover,
        stops=[SnappedStop(stop_id=i,requested=p) for i,p in stops],
        visited_targets=[VisitedTarget(target_id=t.target_id,name=t.name,coordinate_status="verified" if t.target_id in known else "user_defined",visited=False) for t in targets],
        interpretation=Interpretation(text=OBJECTIVES[req.objective]),engine_version=VERSION,
        computed_at=datetime.now(timezone.utc).isoformat())
    if grid is None or not context.dem.available:
        report.data_status="unavailable"
        report.warnings.append(PlanWarning(severity="warning",message=context.dem.note or "No usable terrain data."))
        return report
    report.warnings.append(PlanWarning(severity="warning",message="Regional DEM route only; operational rover feasibility and fine-scale hazards remain unknown."))
    cells=[]
    for s in report.stops:
        cell=grid.cell(s.requested);cells.append(cell)
        if cell is not None:
            s.snapped=grid.point(cell)
            s.offset_m=distance_m(s.requested,s.snapped,req.body)
    if any(c is None for c in cells):
        report.status="infeasible"
        report.feasibility=Feasibility(verdict="infeasible",summary="A stop is outside routing coverage or has missing elevation.",reasons=[s.stop_id for s,c in zip(report.stops,cells) if c is None])
        report.warnings.append(PlanWarning(severity="critical",message=report.feasibility.summary))
        return report
    report.warnings.append(PlanWarning(severity="info",message=f"Stops snapped to grid centers; maximum offset {max(s.offset_m or 0 for s in report.stops):.0f} m. Inspect stops for requested and snapped coordinates."))
    slopes=grid.slopes()
    report.stops[0].visited=True
    all_dist=[];all_slope=[];time_h=0.; gain=0.;loss=0.;energy=0.
    blocked=False
    for i in range(1,len(cells)):
        path=astar(grid,cells[i-1],cells[i],req.rover,req.optimization)
        if path is None:
            blocked=True
            report.warnings.append(PlanWarning(severity="critical",segment_id=f"leg-{i}",message="No grid path meets slope and missing-cell constraints; subsequent stops were not attempted."))
            break
        points=[grid.point(c) for c in path];zs=[float(grid.z[c]) for c in path]
        edge=[edge_metrics(a,b,za,zb,req.body,req.rover,3.73) for a,b,za,zb in zip(points,points[1:],zs,zs[1:])]
        ds=[x[0] for x in edge];ss=[x[1] for x in edge]
        local_max=max(float(slopes[c]) for c in path)
        maximum=max(ss+[local_max])
        util=maximum/req.rover.max_slope_deg
        leg_energy=sum(x[3] for x in edge)
        leg_gain=sum(max(0,b-a) for a,b in zip(zs,zs[1:]))
        leg_loss=sum(max(0,a-b) for a,b in zip(zs,zs[1:]))
        report.route.append(RouteSegment(**{"segment_id":f"leg-{i}","from":points[0],"to":points[-1],
            "polyline":points,"distance_m":sum(ds),"risk":"high" if util>.8 else "moderate" if util>.5 else "low",
            "max_slope_deg":maximum,"note":"Slope-only proxy; all other hazards unknown.",
            "elevations_m":zs,"edge_slopes_deg":ss,"energy_wh":leg_energy,"elevation_gain_m":leg_gain,"elevation_loss_m":leg_loss}))
        report.stops[i].visited=True
        all_dist.extend(ds);all_slope.extend(ss)
        time_h+=sum(x[2] for x in edge);energy+=leg_energy;gain+=leg_gain;loss+=leg_loss
        if not ds:
            report.warnings.append(PlanWarning(severity="warning",segment_id=f"leg-{i}",message="Stops occupy the same DEM cell; their separation and local traverse cannot be resolved."))
    reached=[s.stop_id for s in report.stops[1:] if s.visited and s.stop_id in target_ids]
    for t in report.visited_targets:t.visited=t.target_id in reached
    report.metrics.targets_reached=reached
    report.metrics.targets_unreached=[t for t in target_ids if t not in reached]
    total=sum(all_dist)
    if total>0:
        order=np.argsort(all_slope)
        cumulative=np.cumsum(np.array(all_dist)[order])
        p95=float(np.array(all_slope)[order][np.searchsorted(cumulative,.95*total)])
        report.metrics=PlanMetrics(total_distance_m=total,energy_wh=energy,elevation_gain_m=gain,elevation_loss_m=loss,
            slope_mean_deg=sum(d*s for d,s in zip(all_dist,all_slope))/total,
            slope_max_deg=max(seg.max_slope_deg for seg in report.route),slope_p95_deg=p95,
            traverse_time_hours=time_h,driving_sols=math.ceil(time_h/req.rover.drive_hours_per_sol),
            targets_reached=reached,targets_unreached=report.metrics.targets_unreached)
    over_budget=energy>req.rover.battery_capacity_wh
    reasons=[]
    if blocked: reasons.append("No path to the next ordered stop under requested grid constraints.")
    if over_budget: reasons.append("Estimated drive energy exceeds the one-charge battery budget; no recharge assumed.")
    if over_budget:report.warnings.append(PlanWarning(severity="critical",message=reasons[-1]))
    report.status="partial" if blocked and report.route else "infeasible" if blocked else "infeasible" if over_budget else "ok" if total>0 else "partial"
    report.feasibility=Feasibility(verdict="infeasible" if blocked or over_budget else "undetermined",
        summary="Modeled constraints fail." if reasons else "Regional grid constraints pass; operational feasibility remains undetermined." if total>0 else "Stops cannot be resolved into a traverse at this grid resolution.",
        reasons=reasons or ["No high-resolution hazard, traction or environmental validation."])
    return report
