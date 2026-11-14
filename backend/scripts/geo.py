"""Shared geospatial helpers for the data pipeline (no app dependencies).

Everything that turns a grid of elevations into slope / roughness statistics
lives here so Mars (MOLA) and Earth (Copernicus) are processed by the SAME code
at the SAME physical cell size. That is what makes the analog comparison fair.
"""
from __future__ import annotations

import math

import numpy as np

MARS_RADIUS_KM = 3396.0          # MOLA MEGDR label A_AXIS_RADIUS
EARTH_RADIUS_KM = 6371.0
MOLA_PPD = 16                    # pixels per degree of the grid we use
MARS_CELL_KM = 2 * math.pi * MARS_RADIUS_KM / 360 / MOLA_PPD  # ~3.705 km at the equator


def footprint_width_km(half_width_deg: float, lat_deg: float, radius_km: float) -> float:
    return 2 * half_width_deg * (2 * math.pi * radius_km / 360) * math.cos(math.radians(lat_deg))


def slope_deg(z: np.ndarray, dx_m: float, dy_m: float) -> np.ndarray:
    """Slope magnitude in degrees from central differences. Interior cells only
    (edges use one-sided differences via np.gradient)."""
    gy, gx = np.gradient(z.astype(float), dy_m, dx_m)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def detrended_std(z: np.ndarray) -> float:
    """Standard deviation of elevation after removing a best-fit plane.
    Captures relief inside the footprint rather than the regional tilt."""
    z = z.astype(float)
    ny, nx = z.shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    A = np.column_stack([xx.ravel(), yy.ravel(), np.ones(nx * ny)])
    coef, *_ = np.linalg.lstsq(A, z.ravel(), rcond=None)
    resid = z.ravel() - A @ coef
    return float(resid.std())


def terrain_stats(z: np.ndarray, dx_m: float, dy_m: float) -> dict:
    """Summary statistics for one footprint grid. All values in metres / degrees."""
    s = slope_deg(z, dx_m, dy_m)
    return {
        "elevation_median_m": float(np.median(z)),
        "elevation_p10_m": float(np.percentile(z, 10)),
        "elevation_p90_m": float(np.percentile(z, 90)),
        "elevation_std_m": float(np.std(z)),
        "roughness_regional_m": detrended_std(z),
        "slope_regional_median_deg": float(np.median(s)),
        "slope_regional_p90_deg": float(np.percentile(s, 90)),
        "cells": int(z.size),
    }


def block_average_xy(z: np.ndarray, fy: int, fx: int) -> np.ndarray:
    """Aggregate with different factors per axis, for grids whose pixels are
    not square on the ground (Copernicus GLO-90 above 50 deg latitude)."""
    ny, nx = z.shape
    ny2, nx2 = (ny // fy) * fy, (nx // fx) * fx
    zz = z[:ny2, :nx2].astype(float)
    return zz.reshape(ny2 // fy, fy, nx2 // fx, fx).mean(axis=(1, 3))


def block_average(z: np.ndarray, factor: int) -> np.ndarray:
    """Aggregate a fine grid to coarse cells by averaging factor x factor blocks,
    trimming any remainder. Used to bring 90 m Earth DEMs to the ~3.7 km MOLA
    cell size before computing slope and roughness."""
    ny, nx = z.shape
    ny2, nx2 = (ny // factor) * factor, (nx // factor) * factor
    zz = z[:ny2, :nx2].astype(float)
    return zz.reshape(ny2 // factor, factor, nx2 // factor, factor).mean(axis=(1, 3))


# --- Top-of-atmosphere insolation -------------------------------------------
# Daily-mean insolation Q = (S/pi) * (1/r^2) * (H sin(phi) sin(delta) + cos(phi) cos(delta) sin(H))
# with H the half-day arc, delta the solar declination (sin delta = sin(eps) sin(Ls)),
# r the heliocentric distance in AU. Annual mean weights each Ls by dwell time
# (dt proportional to r^2 dLs, from conservation of angular momentum).
SOLAR_CONSTANT_1AU_WM2 = 1361.0

ORBITS = {
    # semi-major axis (AU), eccentricity, obliquity (deg), Ls of perihelion (deg)
    "mars": dict(a=1.52368, e=0.0934, obliquity=25.19, ls_perihelion=251.0),
    "earth": dict(a=1.00000, e=0.0167, obliquity=23.44, ls_perihelion=283.0),
}


def toa_annual_mean_insolation_wm2(lat_deg: float, planet: str, n: int = 720) -> float:
    o = ORBITS[planet]
    phi = math.radians(lat_deg)
    eps = math.radians(o["obliquity"])
    ls = np.linspace(0, 2 * math.pi, n, endpoint=False)
    nu = ls - math.radians(o["ls_perihelion"])            # true anomaly
    r = o["a"] * (1 - o["e"] ** 2) / (1 + o["e"] * np.cos(nu))
    delta = np.arcsin(math.sin(eps) * np.sin(ls))
    cosH = -math.tan(phi) * np.tan(delta)
    H = np.arccos(np.clip(cosH, -1, 1))                      # 0 = polar night, pi = polar day
    q = (SOLAR_CONSTANT_1AU_WM2 / math.pi) / r**2 * (H * math.sin(phi) * np.sin(delta) + math.cos(phi) * np.cos(delta) * np.sin(H))
    w = r**2                                                  # dwell-time weight
    return float((q * w).sum() / w.sum())
