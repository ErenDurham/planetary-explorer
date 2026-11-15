// Objective-aware guidance after a slider SETTLES: POST /mission/guidance.
//
// The rule-based bubble in PrioritySliders is the immediate reaction; this hook
// adds the backend's reading once the user has stopped dragging for ~600 ms.
// Protections, all explicit:
//   - debounce: a drag issues one request, never one per pixel;
//   - previous_weights are the weights BEFORE the drag started (captured on the
//     first change and held until the request fires);
//   - stale guard (lib/staleGuard.ts): a response whose client_request_id is
//     not the latest issued is dropped;
//   - a response is also dropped when the weights or the objective moved on
//     since the request was issued, even if its id is the latest;
//   - a bounded client cache (20 entries) keyed on the request body without
//     the request id, so re-visiting a position does not re-ask the backend.
// This hook is for the LANDING priorities only; Earth-comparison (analog)
// weights are an independent calculation and never reach it.
import { useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { createStaleGuard } from "@/lib/staleGuard";
import type { GuidanceRequest, GuidanceResponse } from "@/types";

export const GUIDANCE_DEBOUNCE_MS = 600;
export const GUIDANCE_CACHE_MAX = 20;

export interface GuidanceState {
  data: GuidanceResponse | null;
  isPending: boolean;
  error: Error | null;
}

interface Params {
  weights: Record<string, number>;
  objective: string;
  /** Criterion the slider UI believes was touched last; used when the diff is ambiguous. */
  changedCriterionId: string | null;
  /** False while sliders are untouched (seeding, reset, objective apply): no request is made. */
  enabled: boolean;
}

export function sameWeights(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && Math.round(a[k]) === Math.round(b[k]));
}

function cacheKey(body: Omit<GuidanceRequest, "client_request_id">): string {
  const sortObj = (o: Record<string, number>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, Math.round(o[k])]));
  return JSON.stringify({ o: body.objective ?? "", p: sortObj(body.previous_weights), n: sortObj(body.new_weights), c: body.changed_criterion_id ?? null });
}

export function usePriorityGuidance({ weights, objective, changedCriterionId, enabled }: Params): GuidanceState {
  const [state, setState] = useState<GuidanceState>({ data: null, isPending: false, error: null });
  const guard = useRef(createStaleGuard("guidance"));
  const cache = useRef(new Map<string, GuidanceResponse>());
  /** Weights at the last settle (or the baseline captured when a drag began). */
  const settled = useRef<Record<string, number>>(weights);
  const baselineObjective = useRef(objective);
  const latestWeights = useRef(weights);
  const latestObjective = useRef(objective);
  latestWeights.current = weights;
  latestObjective.current = objective;

  const weightsJson = JSON.stringify(Object.keys(weights).sort().map((k) => [k, Math.round(weights[k])]));

  useEffect(() => {
    if (!enabled || baselineObjective.current !== objective || Object.keys(settled.current).length === 0) {
      guard.current.issue();
      baselineObjective.current = objective;
      setState({data:null,isPending:false,error:null});
      // seeding, reset or an applied objective: move the baseline without asking
      settled.current = weights;
      return;
    }
    if (sameWeights(settled.current, weights)) return;
    setState({data:null,isPending:true,error:null});
    const baseline = settled.current;
    const timer = window.setTimeout(async () => {
      const newWeights = latestWeights.current;
      const obj = latestObjective.current;
      settled.current = newWeights;
      const diff = Object.keys(newWeights).filter((k) => Math.round(newWeights[k]) !== Math.round(baseline[k] ?? 0));
      const changed = diff.length === 1 ? diff[0] : changedCriterionId ?? diff[0] ?? null;
      const body: Omit<GuidanceRequest, "client_request_id"> = { objective: obj || null, previous_weights: baseline, new_weights: newWeights, changed_criterion_id: changed };
      const key = cacheKey(body);
      const hit = cache.current.get(key);
      if (hit) {
        setState({ data: { ...hit, cached: true }, isPending: false, error: null });
        return;
      }
      const id = guard.current.issue();
      setState((s) => ({ ...s, isPending: true, error: null }));
      try {
        const res = await api.guidance({ ...body, client_request_id: id });
        if (!guard.current.accept(res.client_request_id ?? id)) return; // out of order: a newer request exists
        if (!guard.current.accept(id)) return;
        if (!sameWeights(latestWeights.current, newWeights) || latestObjective.current !== obj) return; // moved on since
        cache.current.set(key, res);
        if (cache.current.size > GUIDANCE_CACHE_MAX) cache.current.delete(cache.current.keys().next().value as string);
        setState({ data: res, isPending: false, error: null });
      } catch (e) {
        if (!guard.current.accept(id) || !sameWeights(latestWeights.current, newWeights) || latestObjective.current !== obj) return;
        setState((s) => ({ data: s.data, isPending: false, error: e instanceof Error ? e : new Error(String(e)) }));
      }
    }, GUIDANCE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightsJson, enabled, objective]);

  return state;
}
