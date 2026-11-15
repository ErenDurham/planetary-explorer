// POST a plan request to the service. One request in flight at a time: a new
// Calculate aborts the previous one, and a response whose echoed
// client_request_id is not the latest is dropped (never shown as current).
import { useCallback, useRef, useState } from "react";
import { expeditionService, isAbort, isRejected, isUnavailable, type PlanRequest, type PlanResponse } from "../adapter";

export type PlanState =
  | { kind: "idle" }
  | { kind: "running"; requestId: string; startedAt: number }
  | { kind: "done"; plan: PlanResponse }
  | { kind: "rejected"; message: string; code: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: unknown };

let seq = 0;
export function nextRequestId(): string {
  seq += 1;
  return `expedition-${Date.now().toString(36)}-${seq}`;
}

export function usePlanRoute(onPlan: (plan: PlanResponse, request: PlanRequest) => void) {
  const [state, setState] = useState<PlanState>({ kind: "idle" });
  const controller = useRef<AbortController | null>(null);
  const latest = useRef<string | null>(null);

  const run = useCallback(async (request: Omit<PlanRequest, "client_request_id">) => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    const client_request_id = nextRequestId();
    latest.current = client_request_id;
    const full: PlanRequest = { ...request, client_request_id };
    setState({ kind: "running", requestId: client_request_id, startedAt: Date.now() });
    try {
      const plan = await expeditionService().plan(full, ac.signal);
      if (latest.current !== client_request_id) return; // a newer request superseded this one
      if (plan.client_request_id && plan.client_request_id !== client_request_id) return; // echoed id mismatch: stale
      setState({ kind: "done", plan });
      onPlan(plan, full);
    } catch (e) {
      if (isAbort(e) || latest.current !== client_request_id) return;
      if (isUnavailable(e)) setState({ kind: "unavailable", reason: e.reason });
      else if (isRejected(e)) setState({ kind: "rejected", message: e.message, code: e.code });
      else setState({ kind: "error", error: e });
    }
  }, [onPlan]);

  const cancel = useCallback(() => { controller.current?.abort(); latest.current = null; setState({ kind: "idle" }); }, []);
  const reset = useCallback(() => setState({ kind: "idle" }), []);
  return { state, run, cancel, reset };
}
