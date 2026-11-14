// Loads the scoring spec's defaults once and seeds the Zustand sliders from it,
// so the UI never hard-codes criteria or weights.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";

export function useDefaultMission() {
  const query = useQuery({
    queryKey: ["scoring", "default-mission"],
    queryFn: () => api.defaultMission(),
    staleTime: Infinity,
  });

  const setWeights = useAppStore((s) => s.setWeights);
  const setDefaultWeights = useAppStore((s) => s.setDefaultWeights);
  const setHardConstraints = useAppStore((s) => s.setHardConstraints);
  const seeded = useAppStore((s) => Object.keys(s.defaultWeights).length > 0);

  useEffect(() => {
    if (!query.data || seeded) return;
    const defaults: Record<string, number> = {};
    for (const c of query.data.mission.criteria) defaults[c.criterion_id] = c.weight;
    setDefaultWeights(defaults);
    setWeights({ ...defaults });
    setHardConstraints(query.data.mission.hard_constraints ?? []);
  }, [query.data, seeded, setDefaultWeights, setWeights, setHardConstraints]);

  return query;
}
