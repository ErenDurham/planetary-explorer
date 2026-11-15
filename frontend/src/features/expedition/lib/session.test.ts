import { describe, expect, it } from "vitest";
import { formatMetric, metricDelta, signed } from "./session";

describe("expedition metrics formatting", () => {
  it("renders a missing metric as No data, never as zero", () => {
    expect(formatMetric(null, { unit: "m", digits: 0 })).toBe("No data");
    expect(formatMetric(undefined, { unit: "Wh", digits: 0 })).toBe("No data");
  });
  it("keeps the service's unit and switches to kilometres above 10 km", () => {
    expect(formatMetric(1234.4, { unit: "m", digits: 0 })).toBe("1,234 m");
    expect(formatMetric(12_345, { unit: "m", digits: 0 })).toBe("12.3 km");
    expect(formatMetric(4.26, { unit: "°", digits: 1 })).toBe("4.3°");
  });
  it("signs a delta without inventing one from missing data", () => {
    expect(metricDelta(10, 4)).toBe(6);
    expect(metricDelta(null, 4)).toBeNull();
    expect(signed(-2.5, 1)).toBe("−2.5");
    expect(signed(0, 0)).toBe("±0");
  });
});
