// Loads the scoring spec's defaults once and seeds the Zustand store from them,
// so the UI never hard-codes criteria or weights.
//
// Seeding is objective-first: the initial objective text is sent to
// POST /mission/interpret (current_weights null = spec defaults, excluded
// criteria from the store, i.e. thermal until an evaluation says otherwise)
// and its validated suggestion is applied as shares, labelled with the
// interpretation's real provenance. Only when that call fails does the
// browser's keyword fallback seed the sliders, and then it is labelled
// "offline rule-based" so it can never pass for a model reading.
//
// The same reading's `task_interpretation` (task, focus body, destination,
// reference, analog preferences) is applied in the same store action, exactly
// as the review UI's Apply does. An ambiguous initial objective leaves the
// task state at its defaults rather than guessing a direction.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore, type ObjectiveMeta } from "@/store/useAppStore";
import { applicationFromInterpretation, interpretOffline } from "@/hooks/useInterpretObjective";

export function useDefaultMission() {
  const query = useQuery({
    queryKey: ["scoring", "default-mission"],
    queryFn: () => api.defaultMission(),
    staleTime: Infinity,
  });

  const seeded = useAppStore((s) => Object.keys(s.defaultWeights).length > 0);
  const seeding = useRef(false);

  useEffect(() => {
    if (!query.data || seeded || seeding.current) return;
    seeding.current = true;
    const data = query.data;
    const defaults: Record<string, number> = {};
    for (const c of data.mission.criteria) defaults[c.criterion_id] = c.weight;
    const { missionObjective: objective, excludedCriteria: excluded } = useAppStore.getState();

    (async () => {
      let application: { weights: Record<string, number>; notes: string[]; meta: ObjectiveMeta };
      try {
        const res = await api.interpret({ objective, current_weights: null, excluded_criteria: excluded });
        application = applicationFromInterpretation(res, excluded, res.generated_by);
      } catch {
        const labels = Object.fromEntries(data.criteria.map((c) => [c.criterion_id, c.label]));
        application = applicationFromInterpretation(interpretOffline(objective, defaults, excluded, labels), excluded, "offline_rule_based");
      }
      const store = useAppStore.getState();
      if (Object.keys(store.defaultWeights).length) return; // seeded elsewhere meanwhile
      store.setHardConstraints(data.mission.hard_constraints ?? []);
      // shares first, then the criterion order: the evaluation hook builds a
      // mission only once both exist, so this is one evaluate call, not two
      store.applyObjective(objective, application.weights, application.notes, application.meta);
      store.setDefaultWeights(defaults);
    })().finally(() => {
      seeding.current = false;
    });
  }, [query.data, seeded]);

  return query;
}
