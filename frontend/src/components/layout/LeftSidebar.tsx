// The "Edit mission" drawer: objective (left), share sliders (middle) and the
// recommendation card (right), stacked on narrow screens. It also tells the
// store which factors the latest evaluation excluded, so the share maths and
// the "Unavailable" row follow the backend rather than a hard-coded list.
import { useEffect } from "react";
import { MissionObjective } from "@/components/mission/MissionObjective";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { PrioritySliders } from "@/components/mission/PrioritySliders";
import { RecommendationCard } from "@/components/mission/RecommendationCard";
import { HardConstraints } from "@/components/mission/HardConstraints";
import { useAppStore } from "@/store/useAppStore";
import type { DefaultMissionResponse, EvaluateResponse } from "@/types";

interface Props {
  defaults: DefaultMissionResponse | undefined;
  defaultsError: unknown;
  evaluation: EvaluateResponse | undefined;
  evaluationError: Error | null;
}

export function LeftSidebar({ defaults, defaultsError, evaluation, evaluationError }: Props) {
  const excludedIds = useAppStore((s) => s.excludedCriteria);
  const setExcludedCriteria = useAppStore((s) => s.setExcludedCriteria);
  const first = evaluation?.results[0];
  const observed = first?.factor_scores.filter((f) => f.is_missing || (!!f.excluded_reason && f.excluded_reason !== "weight is 0")).map((f) => f.criterion_id);
  const observedKey = observed?.join(",");
  useEffect(() => {
    if (observed) setExcludedCriteria(observed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observedKey, setExcludedCriteria]);

  return (
    <div aria-label="Mission settings" className="mission-panel grid bg-bg-elev md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
      <div className="min-w-0 border-b border-line md:border-b-0 md:border-r">
        <MissionObjective excluded={excludedIds} />
        <details className="mx-4 mb-3 rounded-lg border border-line-strong">
          <summary className="cursor-pointer px-3 py-2 text-xs text-fg-muted">Landing constraints · fixed assumptions</summary>
          <HardConstraints constraints={defaults?.mission.hard_constraints ?? []} />
        </details>
      </div>
      {defaultsError ? (
        <div className="p-4 md:col-span-2"><ErrorNote error={defaultsError} context="scoring/default-mission" /></div>
      ) : !defaults ? (
        <div className="p-4 md:col-span-2"><Spinner label="Loading scoring defaults" /></div>
      ) : (
        <>
          <div className="min-w-0">
            <PrioritySliders criteria={defaults.criteria} result={first} />
            {evaluationError && <div className="px-4 pb-3"><ErrorNote error={evaluationError} context="scoring/evaluate" /></div>}
          </div>
          <div className="min-w-0 border-t border-line md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
            <RecommendationCard criteria={defaults.criteria} />
          </div>
        </>
      )}
    </div>
  );
}
