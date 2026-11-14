"""Scientific tests for the shared pipeline helpers (scripts/geo.py) and the
MOLA footprint sampler (scripts/build_mars_profiles.window). Synthetic grids
only; no network and no raw data required."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from geo import (  # noqa: E402
    EARTH_RADIUS_KM,
    MARS_CELL_KM,
    MARS_RADIUS_KM,
    MOLA_PPD,
    SOLAR_CONSTANT_1AU_WM2,
    ORBITS,
    block_average,
    detrended_std,
    footprint_width_km,
    slope_deg,
    terrain_stats,
    toa_annual_mean_insolation_wm2,
)
import build_mars_profiles  # noqa: E402
from build_mars_profiles import LINES, SAMPLES, window  # noqa: E402


# --- constants and footprints ----------------------------------------------------
def test_mola_cell_size():
    assert MARS_CELL_KM == pytest.approx(3.705, abs=0.01)
    assert MARS_CELL_KM == pytest.approx(2 * math.pi * MARS_RADIUS_KM / 360 / MOLA_PPD)


def test_footprint_width_shrinks_with_latitude():
    eq = footprint_width_km(0.5, 0.0, MARS_RADIUS_KM)
    assert eq == pytest.approx(59.27, abs=0.05)                       # 1 deg of Mars longitude at the equator
    assert footprint_width_km(0.5, 60.0, MARS_RADIUS_KM) == pytest.approx(eq / 2, rel=1e-9)
    assert footprint_width_km(0.25, 0.0, EARTH_RADIUS_KM) == pytest.approx(55.6, abs=0.1)


# --- slope ----------------------------------------------------------------------------
def test_slope_of_plane():
    z = np.fromfunction(lambda y, x: 100.0 * x, (10, 10))  # rises 100 m per cell
    s = slope_deg(z, 1000.0, 1000.0)
    assert s.mean() == pytest.approx(math.degrees(math.atan(0.1)), abs=1e-6)
    assert s.std() == pytest.approx(0.0, abs=1e-9), "a plane has one slope everywhere, edges included"


def test_slope_combines_both_gradients_and_respects_anisotropic_cells():
    z = np.fromfunction(lambda y, x: 30.0 * x + 40.0 * y, (8, 8))
    s = slope_deg(z, 1000.0, 2000.0)                                   # dx 1 km, dy 2 km
    expected = math.degrees(math.atan(math.hypot(30.0 / 1000.0, 40.0 / 2000.0)))
    assert np.allclose(s, expected)
    assert np.all(slope_deg(np.full((5, 5), 42.0), 1.0, 1.0) == 0.0)   # flat => zero
    assert np.all(slope_deg(z, 1000.0, 2000.0) >= 0.0)


# --- detrended relief -------------------------------------------------------------------
def test_detrended_std_removes_tilt():
    z = np.fromfunction(lambda y, x: 50.0 * x + 20.0 * y, (12, 12))
    assert detrended_std(z) == pytest.approx(0.0, abs=1e-6)
    assert detrended_std(z + 12345.0) == pytest.approx(0.0, abs=1e-6)  # offset-invariant


def test_detrended_std_keeps_relief_and_is_tilt_invariant():
    rng = np.random.default_rng(42)
    relief = rng.normal(0.0, 100.0, (16, 16))
    tilt = np.fromfunction(lambda y, x: 500.0 * x - 300.0 * y, (16, 16))
    a, b = detrended_std(relief), detrended_std(relief + tilt)
    assert a == pytest.approx(b, rel=1e-9), "adding a plane must not change the detrended std"
    assert a == pytest.approx(relief.std(), rel=0.1)                   # random relief has (almost) no planar component
    assert 0.0 < a <= relief.std() + 1e-9


# --- block averaging --------------------------------------------------------------------
def test_block_average_shape_and_mean():
    z = np.arange(100.0).reshape(10, 10)
    b = block_average(z, 3)
    assert b.shape == (3, 3) and b.mean() == pytest.approx(z[:9, :9].mean())


def test_block_average_preserves_mean_exactly_when_divisible_and_trims_otherwise():
    rng = np.random.default_rng(7)
    z = rng.uniform(-5000, 5000, (12, 20))
    b = block_average(z, 4)
    assert b.shape == (3, 5) and b.mean() == pytest.approx(z.mean(), rel=1e-12)
    assert b[0, 0] == pytest.approx(z[:4, :4].mean())
    assert np.array_equal(block_average(z, 1), z)
    c = block_average(z, 7)                                             # 12//7 = 1 row block, 20//7 = 2 col blocks
    assert c.shape == (1, 2) and c.mean() == pytest.approx(z[:7, :14].mean())


def test_terrain_stats_on_flat_and_tilted_grids():
    flat = terrain_stats(np.full((16, 16), -2500.0), 3700.0, 3700.0)
    assert flat["elevation_median_m"] == -2500.0 and flat["roughness_regional_m"] == pytest.approx(0.0, abs=1e-9)
    assert flat["slope_regional_median_deg"] == 0.0 and flat["cells"] == 256
    tilted = terrain_stats(np.fromfunction(lambda y, x: 100.0 * x, (16, 16)), 1000.0, 1000.0)
    assert tilted["roughness_regional_m"] == pytest.approx(0.0, abs=1e-6)
    assert tilted["slope_regional_median_deg"] == pytest.approx(math.degrees(math.atan(0.1)), abs=1e-6)
    assert tilted["elevation_p10_m"] <= tilted["elevation_median_m"] <= tilted["elevation_p90_m"]


# --- footprint window and longitude wrap -----------------------------------------------------
def _column_grid() -> np.ndarray:
    """Synthetic MOLA-shaped grid whose value is the column index, so the set of
    sampled columns can be read straight off the window."""
    return np.broadcast_to(np.arange(SAMPLES, dtype=np.int32), (LINES, SAMPLES))


def test_window_at_plus_minus_180_overlaps_and_is_contiguous():
    g = _column_grid()
    east = window(g, 0.0, 179.9, 0.5)                                   # 179.4 .. 180.4 E
    west = window(g, 0.0, -179.9, 0.5)                                  # 179.6 .. 180.6 E
    assert east.shape[0] == 16 and west.shape[0] == 16
    ce, cw = set(east[0].tolist()), set(west[0].tolist())
    assert len(ce & cw) >= 13, "windows 0.2 deg apart must share most of their columns"
    for cols in (ce, cw):
        s = sorted(cols)
        assert s == list(range(s[0], s[-1] + 1)), "no gaps: the antimeridian is not an array edge in a 0..360 grid"
        assert all(2860 <= c <= 2900 for c in s), "both sit around column 180*16 = 2880"
    assert np.array_equal(window(g, 0.0, -180.0, 0.5), window(g, 0.0, 180.0, 0.5)), "-180 and +180 are the same meridian"


@pytest.mark.parametrize("lon", [0.1, -0.1, 359.9, 0.0])
def test_window_wraps_across_the_0_360_seam(lon):
    g = _column_grid()
    w = window(g, 0.0, lon, 0.5)
    cols = sorted(set(w[0].tolist()))
    assert any(c < 16 for c in cols) and any(c > SAMPLES - 16 for c in cols), "the seam is spanned: columns from both edges"
    assert 15 <= len(cols) <= 17
    assert all(0 <= c < SAMPLES for c in cols)
    assert w.shape[0] == 16


def test_window_rows_follow_latitude_and_clip_at_the_poles():
    g = np.broadcast_to(np.arange(LINES, dtype=np.int32)[:, None], (LINES, SAMPLES))
    rows = sorted(set(window(g, 0.0, 10.0, 0.5)[:, 0].tolist()))
    assert rows == list(range(int(89.5 * MOLA_PPD), int(90.5 * MOLA_PPD)))   # 16 rows straddling the equator
    north = window(g, 18.4447, 77.4508, 0.5)[:, 0]
    assert north.min() == math.floor((90 - 18.9447) * MOLA_PPD)
    polar = window(g, 89.9, 0.0, 0.5)
    assert polar.min() == 0 and polar.max() <= 15, "rows are clipped at the pole, never wrapped"


def test_window_is_what_the_mars_builder_samples():
    """The Mars builder must call this very function with the committed half width."""
    assert build_mars_profiles.HALF_WIDTH_DEG == 0.5
    assert (LINES, SAMPLES) == (2880, 5760) == (180 * MOLA_PPD, 360 * MOLA_PPD)


# --- insolation ------------------------------------------------------------------------------
def test_insolation_decreases_toward_poles_and_is_symmetric_enough():
    eq, mid, pole = (toa_annual_mean_insolation_wm2(lat, "mars") for lat in (0, 45, 89.9))
    assert eq > mid > pole > 0
    assert 170 < eq < 195  # ~S_mars/pi; S_mars = 1361/1.5237^2 ~= 586 W/m2
    assert abs(toa_annual_mean_insolation_wm2(30, "mars") - toa_annual_mean_insolation_wm2(-30, "mars")) < 8  # eccentricity asymmetry only
    # Textbook Earth equatorial annual-mean TOA insolation is ~417 W/m2 (obliquity lowers it below S0/pi = 433).
    assert toa_annual_mean_insolation_wm2(0, "earth") == pytest.approx(417, rel=0.02)


@pytest.mark.parametrize("planet", ["mars", "earth"])
def test_insolation_is_monotone_from_equator_to_pole_in_both_hemispheres(planet):
    lats = list(range(0, 91, 5))
    north = [toa_annual_mean_insolation_wm2(lat, planet) for lat in lats]
    south = [toa_annual_mean_insolation_wm2(-lat, planet) for lat in lats]
    assert all(a > b for a, b in zip(north, north[1:])), "annual-mean insolation falls monotonically toward the north pole"
    assert all(a > b for a, b in zip(south, south[1:])), "and toward the south pole"
    assert all(v > 0 for v in north + south)


@pytest.mark.parametrize("planet", ["mars", "earth"])
def test_insolation_hemispheric_asymmetry_is_bounded_by_eccentricity(planet):
    """With a circular orbit the two hemispheres would be identical; the asymmetry
    from eccentricity e is of order 2e relative (the r^-2 modulation), so the
    north/south difference must stay well inside that envelope at every latitude."""
    e = ORBITS[planet]["e"]
    for lat in (10, 30, 50, 70, 89):
        n, s = toa_annual_mean_insolation_wm2(lat, planet), toa_annual_mean_insolation_wm2(-lat, planet)
        assert abs(n - s) / max(n, s) <= 2 * e + 1e-3


def test_insolation_equatorial_values_against_solar_constant_and_pole_ratio():
    for planet in ("mars", "earth"):
        o = ORBITS[planet]
        s_planet = SOLAR_CONSTANT_1AU_WM2 / o["a"] ** 2
        eq = toa_annual_mean_insolation_wm2(0, planet)
        # obliquity lowers the equatorial annual mean a few percent below S/pi, never above it
        assert 0.93 * s_planet / math.pi < eq < s_planet / math.pi
        pole = toa_annual_mean_insolation_wm2(90, planet)
        # polar annual mean ~ (S/pi) * sin(obliquity) * (2/pi)... numerically ~0.42-0.45 of the equatorial value
        assert 0.38 < pole / eq < 0.48
    assert toa_annual_mean_insolation_wm2(0, "mars") == pytest.approx(178.6, abs=0.5)
    assert toa_annual_mean_insolation_wm2(90, "mars") == pytest.approx(79.8, abs=0.5)


def test_insolation_is_deterministic_and_resolution_converged():
    a = toa_annual_mean_insolation_wm2(20.0, "mars")
    assert a == toa_annual_mean_insolation_wm2(20.0, "mars")
    assert toa_annual_mean_insolation_wm2(20.0, "mars", n=2880) == pytest.approx(a, abs=0.05), "720 steps per orbit is converged to <0.05 W/m2"
