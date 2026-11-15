// The "Mission Design" pane, the first step of the journey. It opens on the
// composer alone; applying a mission has the backend read it ONCE for both
// planets: the Mars landing priorities and the Earth priorities, on the same
// factors (each with reasons and cited research). What comes next is then the
// prominent thing on the page - MissionNextStep says where the applied
// objective leads and what that view can and cannot do - while the scoring
// priorities and mission focus sit under a disclosure for whoever wants to
// adjust them. Mission focus (Earth / Mars) switches between the two priority
// sets; each keeps its own values. The reading's task half is always settled
// by the backend; the pane never guesses a task. It also tells the store which
// Mars factors the latest evaluation excluded, so no-data factors are hidden.
import { useEffect, useState } from "react";
import { MissionFocus } from "@/components/mission/MissionFocus";
import { MissionNextStep } from "@/components/mission/MissionNextStep";
import { SpaceDecor } from "@/components/mission/SpaceDecor";
import { earthFactors, marsFactors } from "@/components/mission/priorityFactors";
import { MissionObjective } from "@/components/mission/MissionObjective";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { PrioritySliders } from "@/components/mission/PrioritySliders";
import { PriorityPie } from "@/components/mission/PriorityPie";
import { WhyThesePriorities } from "@/components/mission/WhyThesePriorities";
import { useAppStore, type ObjectiveSource } from "@/store/useAppStore";
import { useInterpretObjective, applicationFromInterpretation } from "@/hooks/useInterpretObjective";
import { toShares } from "@/lib/allocation";
import type { DefaultMissionResponse, EvaluateResponse } from "@/types";

interface Props {
  defaults: DefaultMissionResponse | undefined;
  defaultsError: unknown;
  evaluation: EvaluateResponse | undefined;
  evaluationError: Error | null;
  /** Open Explore on the mission's body for the established catalogs; App supplies the first site to select. */
  onExploreMission?: () => void;
  /** The scores that view needs have loaded. */
  exploreReady?: boolean;
}

export function LeftSidebar({ defaults, defaultsError, evaluation, evaluationError, onExploreMission, exploreReady = false }: Props) {
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
  /** True once the first applied mission has been read, so the next step and the priorities appear. */
  const [designed, setDesigned] = useState(false);
  const pending = interpret.status === "pending";

  const save = async (text: string) => {
    setMissionText(text);
    const { weights, defaultWeights } = useAppStore.getState();
    const current = Object.keys(weights).length ? weights : toShares(defaultWeights, excludedIds);
    const result = await interpret.run(text, current, excludedIds);
    if (!result) return; // a newer save superseded this one
    const source: ObjectiveSource = result.offline ? "offline_rule_based" : result.response.generated_by;
    const app = applicationFromInterpretation(result.response, useAppStore.getState().excludedCriteria, source);
    // the weights and, when it is clear, the task reading go in one store action
    apply(result.requestedText, app.weights, app.notes, app.meta);
    // the same reading's Earth weights (the Mars ones if the backend was unreachable)
    useAppStore.getState().applyEarthSuggestion(app.earthWeights ?? app.weights);
    // Earth sites are ranked by their analog similarity to the paired Mars site
    useAppStore.getState().setEarthReference(result.response.analog_check?.mars_site_id ?? null);
    setMissionDraftDirty(false);
    setMissionDesigned(true);
    setDesigned(true);
  };

  const mars = missionType === "landing";
  const shares = mars ? weights : earthShares;
  const factors = defaults ? (mars ? marsFactors(defaults.criteria, excludedIds) : earthFactors(defaults.criteria, excludedIds)) : [];
  const top = factors.map(f => ({ label: f.name, share: shares[f.id] ?? 0 })).sort((a, b) => b.share - a.share).slice(0, 2);

  return (
    <div data-pane="mission" aria-label="Mission settings" className="mission-panel relative min-h-full bg-bg-elev">
      <SpaceDecor openSky={!designed} />
      <MissionObjective submitted={missionText !== null} missionText={missionText ?? ""} pending={pending} canSave={canSave} onSave={(t) => void save(t)} />
      {missionText === null && defaultsError ? (
        <div className="mx-auto max-w-2xl px-4"><ErrorNote error={defaultsError} context="scoring/default-mission" /></div>
      ) : null}
      {designed && (
        <div className="mission-enter px-4">
          <MissionNextStep onExploreMission={onExploreMission ?? (() => {})} exploreReady={exploreReady} pending={pending} />
          <details open className="mission-advanced" data-testid="mission-advanced">
            <summary>
              <span className="font-medium text-fg">Adjust mission focus and scoring priorities</span>
              <span className="ml-2 text-fg-muted">{top.length ? `· ${top.map(t => `${t.label} ${Math.round(t.share)}%`).join(", ")}` : ""}</span>
            </summary>
            <div className="mx-auto w-full max-w-3xl border-t border-line"><MissionFocus /></div>
            {defaultsError ? (
              <div className="border-t border-line p-4"><ErrorNote error={defaultsError} context="scoring/default-mission" /></div>
            ) : !defaults ? (
              <div className="border-t border-line p-4"><Spinner label="Loading scoring defaults" /></div>
            ) : (
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
                      analog={interp?.analog}
                      planet={mars ? "mars" : "earth"}
                    />}
                  />
                  {mars && evaluationError && <div className="px-4 pb-3"><ErrorNote error={evaluationError} context="scoring/evaluate" /></div>}
                </fieldset>
                <div className="min-w-0 border-t border-line lg:border-l lg:border-t-0">
                  <PriorityPie factors={factors} shares={shares} />
                </div>
              </div>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
