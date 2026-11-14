// Number and unit formatting. Every value on screen carries its unit; a null
// is rendered by the caller as "No data" and is never passed through here.
export function formatNumber(v: number, opts?: { maxFractionDigits?: number }): string {
  if (!Number.isFinite(v)) return String(v);
  const abs = Math.abs(v);
  let digits = opts?.maxFractionDigits;
  if (digits === undefined) {
    if (abs === 0) digits = 0;
    else if (abs >= 1000) digits = 0;
    else if (abs >= 100) digits = 1;
    else if (abs >= 10) digits = 2;
    else if (abs >= 1) digits = 3;
    else digits = 3;
  }
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Human-readable unit symbols for the backend's unit strings. */
export function formatUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  const map: Record<string, string> = {
    deg: "°",
    degC: "°C",
    "W/m2": "W/m²",
    "m/s2": "m/s²",
  };
  return map[unit] ?? unit;
}

export function formatValueWithUnit(v: number, unit: string | null | undefined): string {
  const u = formatUnit(unit);
  if (!u) return formatNumber(v);
  // degrees attach directly; everything else gets a thin space
  return u.startsWith("°") ? `${formatNumber(v)}${u}` : `${formatNumber(v)} ${u}`;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatLatLon(lat: number, lonEast: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lonEast >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lonEast).toFixed(2)}°${ew}`;
}

export function humanize(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
