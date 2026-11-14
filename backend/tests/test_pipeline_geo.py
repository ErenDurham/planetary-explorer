"""Scientific tests for the shared pipeline helpers."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from geo import MARS_CELL_KM, block_average, detrended_std, slope_deg, toa_annual_mean_insolation_wm2  # noqa: E402


def test_mola_cell_size():
    assert MARS_CELL_KM == pytest.approx(3.705, abs=0.01)


def test_slope_of_plane():
    z = np.fromfunction(lambda y, x: 100.0 * x, (10, 10))  # rises 100 m per cell
    s = slope_deg(z, 1000.0, 1000.0)
    assert s.mean() == pytest.approx(math.degrees(math.atan(0.1)), abs=1e-6)


def test_detrended_std_removes_tilt():
    z = np.fromfunction(lambda y, x: 50.0 * x + 20.0 * y, (12, 12))
    assert detrended_std(z) == pytest.approx(0.0, abs=1e-6)


def test_block_average_shape_and_mean():
    z = np.arange(100.0).reshape(10, 10)
    b = block_average(z, 3)
    assert b.shape == (3, 3) and b.mean() == pytest.approx(z[:9, :9].mean())


def test_insolation_decreases_toward_poles_and_is_symmetric_enough():
    eq, mid, pole = (toa_annual_mean_insolation_wm2(lat, "mars") for lat in (0, 45, 89.9))
    assert eq > mid > pole > 0
    assert 170 < eq < 195  # ~S_mars/pi; S_mars = 1361/1.5237^2 ~= 586 W/m2
    assert abs(toa_annual_mean_insolation_wm2(30, "mars") - toa_annual_mean_insolation_wm2(-30, "mars")) < 8  # eccentricity asymmetry only
    # Textbook Earth equatorial annual-mean TOA insolation is ~417 W/m2 (obliquity lowers it below S0/pi = 433).
    assert toa_annual_mean_insolation_wm2(0, "earth") == pytest.approx(417, rel=0.02)
