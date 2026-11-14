// Debounced POST /scoring/evaluate driven by the slider weights.
//
// Two protections, both explicit: a ~150 ms debounce so a drag does not fire a
// request per pixel, and the stale-response guard (src/lib/staleGuard.ts) so a
// slow older response cannot overwrite a newer ranking. The accepted response
// is placed into the TanStack cache under a key derived from the mission so
// other panels (charts, globe colours, suitability panel) read it from there.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { buildMission, hasPositiveWeight, missionKey } from "@/lib/mission";
import { createStaleGuard } from "@/lib/staleGuard";
import type { EvaluateResponse, MissionProfile } from "@/types";

export const EVALUATE_DEBOUNCE_MS = 150;

export function useMission(): MissionProfile | null {
  const weights = useAppStore((s) => s.weights);
  const hardConstraints = useAppStore((s) => s.hardConstraints);
  // Select the object itself, not Object.keys(...): a selector that returns a
  // fresh array on every call makes Zustand v5 re-render forever
  // ("Maximum update depth exceeded"). Derive the order with useMemo instead.
  const defaultWeights = useAppStore((s) => s.defaultWeights);
  const order = useMemo(() => Object.keys(defaultWeights), [defaultWeights]);
  return useMemo(
    () => (order.length === 0 ? null : buildMission(weights, hardConstraints, order)),
    [weights, hardConstraints, order],
  );
}

export function evaluationQueryKey(mission: MissionProfile | null) {
  return ["evaluate", missionKey(mission)] as const;
}

export interface EvaluationState {
  data: EvaluateResponse | undefined;
  isPending: boolean;
  error: Error | null;
  mission: MissionProfile | null;
}

export function useEvaluation(): EvaluationState {
  const mission = useMission();
  const queryClient = useQueryClient();
  const guard = useRef(createStaleGuard());
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const key = evaluationQueryKey(mission);
  const cached = useQuery<EvaluateResponse>({
    queryKey: key,
    queryFn: () => Promise.reject(new Error("evaluation is pushed into the cache by useEvaluation")),
    enabled: false,
    staleTime: Infinity,
  });

  const missionJson = mission ? JSON.stringify(mission) : null;

  useEffect(() => {
    if (!mission || !missionJson) return;
    if (!hasPositiveWeight(Object.fromEntries(mission.criteria.map((c) => [c.criterion_id, c.weight])))) {
      setError(new Error("At least one priority must be above zero."));
      return;
    }
    if (queryClient.getQueryData(key)) {
      setError(null);
      return;
    }
    const g = guard.current;
    const timer = window.setTimeout(async () => {
      const id = g.issue();
      setInFlight(true);
      try {
        const res = await api.evaluate({ planet: "mars", mission, client_request_id: id });
        if (!g.accept(res.client_request_id)) return; // stale: a newer request has been issued
        queryClient.setQueryData(key, res);
        setError(null);
      } catch (e) {
        if (!g.accept(id)) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (g.accept(id)) setInFlight(false);
      }
    }, EVALUATE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionJson, queryClient]);

  return {
    data: cached.data,
    isPending: inFlight && !cached.data,
    error,
    mission,
  };
}
