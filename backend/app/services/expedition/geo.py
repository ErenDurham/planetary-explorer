"""Spherical geometry and explicit, deterministic drive-energy approximation."""
import math
from scripts.geo import MARS_RADIUS_KM, EARTH_RADIUS_KM
from app.models.expedition import GeoPoint, RoverParameters

RADII_M = {"mars": MARS_RADIUS_KM * 1000, "moon": 1737400., "earth": EARTH_RADIUS_KM * 1000}

def distance_m(a: GeoPoint, b: GeoPoint, body: str) -> float:
    p, q = math.radians(a.lat), math.radians(b.lat)
    dl = math.radians((b.lon_east - a.lon_east + 180) % 360 - 180)
    h = math.sin((q-p)/2)**2 + math.cos(p)*math.cos(q)*math.sin(dl/2)**2
    return 2 * RADII_M[body] * math.asin(math.sqrt(min(1., max(0., h))))

def edge_metrics(a: GeoPoint, b: GeoPoint, za: float, zb: float, body: str, rover: RoverParameters, gravity: float):
    d = distance_m(a, b, body)
    dz = zb - za
    time_h = math.hypot(d, dz) / rover.nominal_speed_m_s / 3600
    energy = (rover.mass_kg * gravity * (rover.rolling_resistance*d + max(0.,dz)) / rover.drive_efficiency / 3600
              + rover.hotel_power_w * time_h)
    return d, math.degrees(math.atan2(abs(dz), d)), time_h, energy
