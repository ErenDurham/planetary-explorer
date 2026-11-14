// Share allocation maths for the mission-priority sliders.
//
// The UI has ONE interaction model: each active (data-available) factor's
// slider value IS its integer percentage share of the scored priorities, and
// the active shares always sum to exactly 100. Excluded factors (no data) are
// always 0 and never part of the sum. The backend normalises whatever weights
// it receives, so sending shares is equivalent to sending raw weights - which
// is why the store keeps `weights` in share form and the number beside a
// thumb can be checked against the backend's `normalized_weight`.
//
// Every function here is pure and deterministic. Rounding is largest-remainder
// (Hamilton) so integer shares land on the target total exactly; ties in the
// remainder go to the LATER factor, so three equal factors round to 33/33/34.

export type Shares = Record<string, number>;

function clampShare(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function excludedSet(excluded: Iterable<string> | undefined): Set<string> {
  return new Set(excluded ?? []);
}

/** Round non-negative `values` to integers that sum to exactly `total`,
 * proportionally to their size. Returns all zeros when the values sum to 0. */
export function largestRemainder(values: number[], total = 100): number[] {
  const sum = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (sum <= 0 || total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / sum) * total);
  const floors = exact.map((x) => Math.floor(x));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, rem: x - floors[i] }))
    // larger remainder first; equal remainders resolve toward the later index
    .sort((a, b) => b.rem - a.rem || b.i - a.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** Normalise raw weights to integer shares summing to 100 over the active
 * factors. Excluded factors come back as 0 and stay in the record so the
 * backend still receives them. If every active weight is 0 (or negative) the
 * active factors split 100 equally, so a slider state can never be all-zero. */
export function toShares(weights: Shares, excluded?: Iterable<string>): Shares {
  const ex = excludedSet(excluded);
  const ids = Object.keys(weights);
  const active = ids.filter((id) => !ex.has(id));
  const raw = active.map((id) => Math.max(0, Number(weights[id]) || 0));
  const positive = raw.some((v) => v > 0);
  const rounded = largestRemainder(positive ? raw : raw.map(() => 1), 100);
  const out: Shares = {};
  for (const id of ids) out[id] = 0;
  active.forEach((id, i) => { out[id] = rounded[i]; });
  return out;
}

/** Set one active factor's share to `value` (clamped to 0..100) and
 * redistribute the remaining 100 - value across the other active factors in
 * proportion to their current shares (equal split when they are all 0). The
 * changed factor keeps exactly `value`. Excluded factors stay 0. Because the
 * remainder is always handed to the other active factors (equally when they
 * are all 0), the active total is always 100 and the all-zero state is
 * unreachable through a slider. */
export function setShare(shares: Shares, id: string, value: number, excluded?: Iterable<string>): Shares {
  const ex = excludedSet(excluded);
  if (!(id in shares) || ex.has(id)) return shares;
  const v = clampShare(value);
  const others = Object.keys(shares).filter((k) => k !== id && !ex.has(k));
  const remaining = 100 - v;
  if (others.length === 0) {
    // a single active factor must carry the whole 100
    return v === shares[id] && shares[id] === 100 ? shares : { ...zeroed(shares, ex), [id]: 100 };
  }
  const current = others.map((k) => Math.max(0, Number(shares[k]) || 0));
  const basis = current.some((c) => c > 0) ? current : current.map(() => 1);
  const rounded = largestRemainder(basis, remaining);
  const out = zeroed(shares, ex);
  out[id] = v;
  others.forEach((k, i) => { out[k] = rounded[i]; });
  return out;
}

function zeroed(shares: Shares, ex: Set<string>): Shares {
  const out: Shares = {};
  for (const k of Object.keys(shares)) out[k] = ex.has(k) ? 0 : shares[k];
  return out;
}

/** True when both records hold the same factors with the same rounded shares. */
export function sharesEqual(a: Shares, b: Shares): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && Math.round(a[k]) === Math.round(b[k]));
}

/** Per-factor differences `a - b`, non-zero only, largest magnitude first. */
export function shareDeltas(a: Shares, b: Shares): Array<{ id: string; delta: number }> {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...ids]
    .map((id) => ({ id, delta: Math.round(a[id] ?? 0) - Math.round(b[id] ?? 0) }))
    .filter((d) => d.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.id.localeCompare(y.id));
}

/** Sum of the active shares (should always be 100 after normalisation). */
export function activeTotal(shares: Shares, excluded?: Iterable<string>): number {
  const ex = excludedSet(excluded);
  return Object.keys(shares).filter((k) => !ex.has(k)).reduce((s, k) => s + (Number(shares[k]) || 0), 0);
}
