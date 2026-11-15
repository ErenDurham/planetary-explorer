"""Expedition-only contract; independent of suitability and UI state."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Body = Literal["mars", "moon", "earth"]
Objective = Literal["terrain_survey", "geological_sampling", "research_traverse"]
Optimization = Literal["shortest_distance", "lowest_energy", "lowest_risk", "balanced"]

class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

class GeoPoint(Strict):
    lat: float = Field(ge=-90, le=90)
    lon_east: float = Field(ge=-180, le=360)

    @field_validator("lon_east")
    @classmethod
    def normalize(cls, v):
        return (v + 180) % 360 - 180

class UserTarget(GeoPoint):
    target_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)

class ResearchTarget(UserTarget):
    kind: str
    description: str | None = None
    source: str | None = None
    priority: float | None = None

class RoverParameters(Strict):
    profile_id: str | None = Field(None, max_length=100)
    max_slope_deg: float = Field(15, gt=0, le=45)
    nominal_speed_m_s: float = Field(.05, gt=0, le=10)
    battery_capacity_wh: float = Field(10000, gt=0, le=1e9)
    drive_hours_per_sol: float = Field(4, gt=0, le=24)
    mass_kg: float = Field(100, gt=0, le=1e5)
    rolling_resistance: float = Field(.08, gt=0, le=1)
    drive_efficiency: float = Field(.30, gt=0, le=1)
    hotel_power_w: float = Field(50, ge=0, le=1e6)

class PlanRequest(Strict):
    body: Body
    site_id: str = Field(min_length=1, max_length=100)
    objective: Objective
    start: GeoPoint
    waypoints: list[GeoPoint] = Field(default_factory=list, max_length=30)
    target_ids: list[str] = Field(default_factory=list, max_length=30)
    user_targets: list[UserTarget] = Field(default_factory=list, max_length=30)
    rover: RoverParameters = Field(default_factory=RoverParameters)
    optimization: Optimization = "balanced"
    client_request_id: str = Field(default="", max_length=150)

    @model_validator(mode="after")
    def valid_stops(self):
        if not (self.waypoints or self.target_ids or self.user_targets):
            raise ValueError("Provide at least one waypoint or target; no targets are invented.")
        ids = self.target_ids + [t.target_id for t in self.user_targets]
        if any(i == "start" or i.startswith("waypoint-") for i in ids):
            raise ValueError("Target IDs cannot use reserved start or waypoint- identifiers.")
        if len(set(ids)) != len(ids):
            raise ValueError("Target identifiers must be unique.")
        return self

class TerrainDataset(Strict):
    name: str
    source: str
    url: str | None = None
    license: str | None = None
    resolution_m: float | None = None
    note: str | None = None
    sha256: str | None = None
    vertical_datum: str | None = None

class Bounds(Strict):
    west: float
    east: float
    south: float
    north: float

class TerrainCoverage(Strict):
    available: bool
    dataset: TerrainDataset | None = None
    note: str | None = None
    rows: int | None = None
    columns: int | None = None
    valid_fraction: float | None = None
    resolution_lat_deg: float | None = None
    resolution_lon_deg: float | None = None
    cell_width_m: float | None = None
    cell_height_m: float | None = None
    longitude_convention: str = "east_-180_180"
    crs: str = "planetocentric body-fixed"

class TerrainContext(Strict):
    body: Body
    site_id: str
    start: GeoPoint
    dem: TerrainCoverage
    research_targets: list[ResearchTarget] = Field(default_factory=list)
    routing_bounds: Bounds | None = None
    notes: list[str] = Field(default_factory=list)
    start_source_ids: list[str] = Field(default_factory=list)

class Region(Strict):
    body: Body
    site_id: str
    name: str
    terrain_available: bool
    note: str

class RoverProfile(Strict):
    profile_id: str
    label: str
    description: str
    parameters: RoverParameters

class ServiceCapabilities(Strict):
    engine_version: str
    bodies: list[Body]
    objectives: list[Objective]
    optimization_preferences: list[Optimization]
    rover_profiles: list[RoverProfile]
    regions: list[Region]
    notes: list[str]

class RouteSegment(Strict):
    segment_id: str
    from_: GeoPoint = Field(alias="from")
    to: GeoPoint
    polyline: list[GeoPoint]
    distance_m: float
    risk: Literal["low", "moderate", "high", "unknown"]
    max_slope_deg: float
    note: str | None = None
    elevations_m: list[float]
    edge_slopes_deg: list[float]
    energy_wh: float
    elevation_gain_m: float
    elevation_loss_m: float

class PlanMetrics(Strict):
    total_distance_m: float | None = None
    energy_wh: float | None = None
    elevation_gain_m: float | None = None
    elevation_loss_m: float | None = None
    slope_mean_deg: float | None = None
    slope_max_deg: float | None = None
    slope_p95_deg: float | None = None
    traverse_time_hours: float | None = None
    driving_sols: float | None = None
    targets_reached: list[str] = Field(default_factory=list)
    targets_unreached: list[str] = Field(default_factory=list)

class Feasibility(Strict):
    verdict: Literal["feasible", "marginal", "infeasible", "undetermined"]
    summary: str
    reasons: list[str]

class PlanWarning(Strict):
    severity: Literal["info", "warning", "critical"]
    message: str
    segment_id: str | None = None

class Interpretation(Strict):
    text: str
    generated_by: Literal["rule_based"] = "rule_based"
    model: str | None = None

class SnappedStop(Strict):
    stop_id: str
    requested: GeoPoint
    snapped: GeoPoint | None = None
    offset_m: float | None = None
    visited: bool = False

class VisitedTarget(Strict):
    target_id: str
    name: str
    coordinate_status: Literal["user_defined", "verified"]
    visited: bool

class PlanResponse(Strict):
    plan_id: str
    client_request_id: str
    body: Body
    site_id: str
    status: Literal["ok", "partial", "infeasible"]
    data_status: Literal["limited", "unavailable"]
    objective: Objective
    route: list[RouteSegment]
    metrics: PlanMetrics
    feasibility: Feasibility
    warnings: list[PlanWarning]
    interpretation: Interpretation | None = None
    assumptions: list[str]
    limitations: list[str]
    datasets: list[TerrainDataset]
    terrain: TerrainContext
    constraints: RoverParameters
    stops: list[SnappedStop]
    visited_targets: list[VisitedTarget]
    engine_version: str
    computed_at: str
