import { StageButton } from "@/components/ui/StageButton";
// After an objective is applied: the one deliberate next action, chosen from
// what the app can actually do with that reading (lib/missionRoute.ts), with
// the limits said in the same breath. A reading with no task is never guessed
// at; the user picks a supported workflow. The card is disabled while a draft
// edit is unapplied, so Explore never opens on priorities that belong to an
// older objective.
import { Globe2, Mountain, TriangleAlert } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { routeForMission, type MissionRoute } from "@/lib/missionRoute";

export function MissionNextStep({ onExploreMission, exploreReady, pending }: {
  /** Open Explore on the mission's own body for the established catalogs (Find Earth Analogs). */
  onExploreMission: () => void;
  /** Scores for that view have loaded, so the first site can be selected. */
  exploreReady: boolean;
  /** A re-read of the objective is in flight. */
  pending: boolean;
}) {
  const objective = useAppStore(s => s.appliedObjective);
  const task = useAppStore(s => s.appliedTask);
  const reference = useAppStore(s => s.appliedReference);
  const focusBody = useAppStore(s => s.appliedFocusBody);
  const draftDirty = useAppStore(s => s.missionDraftDirty);
  const setMissionFocus = useAppStore(s => s.setMissionFocus);
  if (!objective) return null;
  const route: MissionRoute = routeForMission({ objective, task, reference: reference ? { id: reference.id, name: reference.name, body: reference.body } : null, focusBody, discoveryReady: false });
  const blocked = draftDirty || pending;
  const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-bg-elev px-4 py-2.5 text-sm font-medium text-fg hover:border-copper disabled:opacity-40";
  const go = (fn: () => void) => () => { if (!blocked) fn(); };
  return (
    <section className="mission-next" aria-labelledby="mission-next-title" data-testid="mission-next-step" data-route={route.kind}>
      <p className="eyebrow">Step 2 · Explore</p>
      <h3 id="mission-next-title" className="mt-1 text-lg font-semibold text-fg">{route.kind === "choose" ? "Choose a supported task" : route.kind === "discovery" ? "Explore new candidate regions" : route.kind === "landing_screening" ? "Explore the Mars sites" : "Explore the established analogs"}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">{route.detail}</p>
      {route.unsupported && <p className="mt-3 inline-flex max-w-3xl items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="status" data-testid="mission-unsupported"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{route.unsupported}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(route.kind === "established_analogs" || route.kind === "landing_screening") && <StageButton disabled={blocked || !exploreReady} onClick={go(onExploreMission)}><Globe2 className="h-4 w-4" aria-hidden />{route.cta}</StageButton>}
        {route.kind === "choose" && (
          <>
            <button type="button" className={secondary} disabled={blocked || !exploreReady} onClick={go(() => { setMissionFocus("earth"); onExploreMission(); })}><Globe2 className="h-4 w-4" aria-hidden />Established Earth analogs</button>
            <button type="button" className={secondary} disabled={blocked || !exploreReady} onClick={go(() => { setMissionFocus("mars"); onExploreMission(); })}><Mountain className="h-4 w-4" aria-hidden />Mars landing screening</button>
          </>
        )}
        {draftDirty && <span className="text-xs text-warn" role="status">Apply your edited objective first.</span>}
        {!draftDirty && pending && <span className="text-xs text-fg-muted" role="status">Reading your mission…</span>}
        {!draftDirty && !pending && route.kind !== "discovery" && !exploreReady && <span className="text-xs text-fg-muted" role="status">Preparing scores…</span>}
      </div>
    </section>
  );
}
