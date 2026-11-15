"""Bounded 8-neighbor A*. No corner cutting through missing/steep cells."""
import heapq
import math
import numpy as np
from .geo import distance_m, edge_metrics

def astar(grid, start, goal, rover, preference, gravity=3.73):
    slopes=grid.slopes()
    valid=np.isfinite(grid.z)&np.isfinite(slopes)&(slopes<=rover.max_slope_deg)
    if not valid[start] or not valid[goal]:
        return None
    flat_wh_m=(rover.mass_kg*gravity*rover.rolling_resistance/rover.drive_efficiency/3600
               +rover.hotel_power_w/rover.nominal_speed_m_s/3600)
    def heuristic(cell):
        d=distance_m(grid.point(cell),grid.point(goal),grid.body)
        return d*flat_wh_m if preference=="lowest_energy" else d
    queue=[(heuristic(start),0.,start)]
    costs={start:0.}; parent={}
    while queue:
        _,g,a=heapq.heappop(queue)
        if g>costs[a]: continue
        if a==goal:
            path=[a]
            while a in parent:
                a=parent[a];path.append(a)
            return list(reversed(path))
        for dr,dc in ((-1,0),(0,-1),(0,1),(1,0),(-1,-1),(-1,1),(1,-1),(1,1)):
            b=(a[0]+dr,a[1]+dc)
            if not (0<=b[0]<valid.shape[0] and 0<=b[1]<valid.shape[1]) or not valid[b]: continue
            if dr and dc and not (valid[a[0]+dr,a[1]] and valid[a[0],a[1]+dc]): continue
            d,slope,_,energy=edge_metrics(grid.point(a),grid.point(b),grid.z[a],grid.z[b],grid.body,rover,gravity)
            if slope>rover.max_slope_deg: continue
            u=max(slope,slopes[a],slopes[b])/rover.max_slope_deg
            cost={"shortest_distance":d,"lowest_energy":energy,
                  "lowest_risk":d*(1+9*u*u),"balanced":d*(1+u*u)+energy/flat_wh_m}[preference]
            ng=g+cost
            if ng<costs.get(b,math.inf):
                costs[b]=ng;parent[b]=a
                heapq.heappush(queue,(ng+heuristic(b),ng,b))
    return None
