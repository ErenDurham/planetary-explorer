// The "Mission Design" tab. It opens on the chat box alone; saving a mission
// has the language model read it ONCE for both planets: the Mars landing
// priorities and the Earth priorities, on the same factors (each with reasons
// and cited research). The sliders (most of the width) then slide in beside the
// priority pie. Mission focus (Earth / Mars) switches between the two sets;
// each keeps its own values, and both use the same slider, pie and "Why"
// components. When the reading's task half needs a decision (an ambiguous
// direction or site name) the task panel appears under the mission text. It
// also tells the store which Mars factors the latest evaluation excluded, so
// no-data factors are hidden and left out of the shares.
import { useEffect, useState } from "react";
import { MissionFocus } from "@/components/mission/MissionFocus";
import { earthFactors, marsFactors } from "@/components/mission/priorityFactors";
import { MissionObjective } from "@/components/mission/MissionObjective";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { PrioritySliders } from "@/components/mission/PrioritySliders";
import { PriorityPie } from "@/components/mission/PriorityPie";
import { WhyThesePriorities } from "@/components/mission/WhyThesePriorities";
import { TaskResolver, needsTaskInput } from "@/components/mission/TaskReview";
import { useAppStore, type ObjectiveSource } from "@/store/useAppStore";
import { useInterpretObjective, applicationFromInterpretation } from "@/hooks/useInterpretObjective";
import { toShares } from "@/lib/allocation";
import type { DefaultMissionResponse, EvaluateResponse, TaskInterpretation } from "@/types";

interface Props {
  defaults: DefaultMissionResponse | undefined;
  defaultsError: unknown;
  evaluation: EvaluateResponse | undefined;
  evaluationError: Error | null;
}

export function LeftSidebar({ defaults, defaultsError, evaluation, evaluationError }: Props) {
  const excludedIds = useAppStore((s) => s.excludedCriteria);
  const setExcludedCriteria = useAppStore((s) => s.setExcludedCriteria);
  const canSave = useAppStore((s) => Object.keys(s.defaultWeights).length > 0);
  const apply = useAppStore((s) => s.applyObjective);
  const missionType = useAppStore((s) => s.missionType);
  const setMissionDesigned = useAppStore((s) => s.setMissionDesigned);
  const setMissionDraftDirty = useAppStore((s) => s.setMissionDraftDirty);
  // Mars landing priorities
  const weights = useAppStore((s) => s.weights);
  const recommended = useAppStore((s) => s.recommendedWeights);
  const setWeight = useAppStore((s) => s.setWeight);
  const beginPriorityChange = useAppStore((s) => s.beginPriorityChange);
  const resetWeights = useAppStore((s) => s.resetWeights);
  // Earth-mode priorities: the same factors, their own values
  const earthShares = useAppStore((s) => s.earthWeights);
  const earthSuggested = useAppStore((s) => s.recommendedEarthWeights);
  const setEarthWeight = useAppStore((s) => s.setEarthWeight);
  const resetEarthWeights = useAppStore((s) => s.resetEarthWeights);
  // what the reading said, for the "Why" pop-ups
  const source = useAppStore((s) => s.appliedObjectiveSource);
  const interp = useAppStore((s) => s.appliedInterpretation);
  const first = evaluation?.results[0];
  const observed = first?.factor_scores.filter((f) => f.is_missing || (!!f.excluded_reason && f.excluded_reason !== "weight is 0")).map((f) => f.criterion_id);
  const observedKey = observed?.join(",");
  useEffect(() => {
    if (observed) setExcludedCriteria(observed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observedKey, setExcludedCriteria]);

  const interpret = useInterpretObjective();
  const [missionText, setMissionText] = useState<string | null>(null);
  /** True once the first saved mission has been applied, so the sliders slide in with its shares. */
  const [designed, setDesigned] = useState(false);
  /** A task reading that needs the user's choice before it can be applied. */
  const [openTask, setOpenTask] = useState<{ ti: TaskInterpretation; hash: string } | null>(null);
  const pending = interpret.status === "pending";

  const save = async (text: string) => {
    setMissionText(text);
    setOpenTask(null);
    const { weights, defaultWeights } = useAppStore.getState();
    const current = Object.keys(weights).length ? weights : toShares(defaultWeights, excludedIds);
    const result = await interpret.run(text, current, excludedIds);
    if (!result) return; // a newer save superseded this one
    const source: ObjectiveSource = result.offline ? "offline_rule_based" : result.response.generated_by;
    const app = applicationFromInterpretation(result.response, useAppStore.getState().excludedCriteria, source);
    // the weights and, when it is clear, the task reading go in one store action
    apply(result.requestedText, app.weights, app.notes, app.meta);
    const ti = result.response.task_interpretation;
    if (ti && needsTaskInput(ti)) setOpenTask({ ti, hash: result.response.objective_hash });
    // the same reading's Earth weights (the Mars ones if the backend was unreachable)
    useAppStore.getState().applyEarthSuggestion(app.earthWeights ?? app.weights);
    setMissionDraftDirty(false);
    setMissionDesigned(true);
    setDesigned(true);
  };

  return (
    <div aria-label="Mission settings" className="mission-panel min-h-full bg-bg-elev">
      <MissionObjective submitted={missionText !== null} missionText={missionText ?? ""} pending={pending} canSave={canSave} onSave={(t) => void save(t)} />
      {openTask && !pending && <TaskResolver key={openTask.hash} ti={openTask.ti} objectiveHash={openTask.hash} onDone={() => setOpenTask(null)} />}
      {missionText === null && defaultsError ? (
        <div className="mx-auto max-w-2xl px-4"><ErrorNote error={defaultsError} context="scoring/default-mission" /></div>
      ) : null}
      {designed && (
        <div className="mission-enter">
        <div className="mx-auto w-full max-w-3xl border-t border-line"><MissionFocus /></div>
        {defaultsError ? (
          <div className="border-t border-line p-4"><ErrorNote error={defaultsError} context="scoring/default-mission" /></div>
        ) : !defaults ? (
          <div className="border-t border-line p-4"><Spinner label="Loading scoring defaults" /></div>
        ) : (
          (() => {
            const mars = missionType === "landing";
            const factors = mars ? marsFactors(defaults.criteria, excludedIds) : earthFactors(defaults.criteria, excludedIds);
            const shares = mars ? weights : earthShares;
            return (
              <div className="grid border-t border-line lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]" data-testid={mars ? "mars-priorities" : "earth-priorities"}>
                {/* disabled while a re-saved mission is read, so a slider move is not overwritten */}
                <fieldset disabled={pending} aria-busy={pending} className="m-0 min-w-0 border-0 p-0">
                  <PrioritySliders
                    factors={factors}
                    shares={shares}
                    onChange={mars ? setWeight : setEarthWeight}
                    onBegin={mars ? beginPriorityChange : undefined}
                    onReset={mars ? resetWeights : resetEarthWeights}
                    headerExtra={<WhyThesePriorities
                      factors={factors}
                      shares={shares}
                      suggested={(mars ? recommended : earthSuggested) ?? {}}
                      reasons={mars ? interp?.reasons : interp?.earth?.reasons}
                      evidence={mars ? interp?.evidence : interp?.earth?.evidence}
                      source={source}
                      unsupported={mars ? interp?.unsupportedNeeds : undefined}
                      constraints={mars ? defaults.mission.hard_constraints ?? [] : undefined}
                      constraintEvidence={interp?.constraintEvidence}
                    />}
                  />
                  {mars && evaluationError && <div className="px-4 pb-3"><ErrorNote error={evaluationError} context="scoring/evaluate" /></div>}
                </fieldset>
                <div className="min-w-0 border-t border-line lg:border-l lg:border-t-0">
                  <PriorityPie factors={factors} shares={shares} />
                </div>
              </div>
            );
          })()
        )}
        </div>
      )}
    </div>
  );
}
