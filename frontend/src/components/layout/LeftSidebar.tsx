import { Section } from "@/components/ui/Section";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { PrioritySliders } from "@/components/mission/PrioritySliders";
import { HardConstraints } from "@/components/mission/HardConstraints";
import { RankedList } from "@/components/mission/RankedList";
import type { DefaultMissionResponse, EvaluateResponse } from "@/types";

interface Props {
  defaults: DefaultMissionResponse | undefined;
  defaultsError: unknown;
  evaluation: EvaluateResponse | undefined;
  evaluationPending: boolean;
  evaluationError: Error | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LeftSidebar({ defaults, defaultsError, evaluation, evaluationPending, evaluationError, selectedId, onSelect }: Props) {
  return (
    <aside aria-label="Mission and ranking" className="scroll-thin flex h-full flex-col overflow-y-auto bg-bg-elev">
      <Section title="Mission objective">
        <p className="text-xs leading-relaxed text-fg-muted">
          Screen eight real Mars candidate sites for a <span className="text-fg">landing phase</span> at a regional (~3.7 km) scale. Move the priorities; the ranking, markers and charts recompute on the backend. Every threshold is a documented assumption from{" "}
          <span className="num text-fg">{defaults?.scoring_spec_version ?? "the scoring spec"}</span>.
        </p>
      </Section>
      {defaultsError ? (
        <div className="p-4">
          <ErrorNote error={defaultsError} context="scoring/default-mission" />
        </div>
      ) : !defaults ? (
        <div className="p-4">
          <Spinner label="Loading scoring defaults" />
        </div>
      ) : (
        <>
          <PrioritySliders criteria={defaults.criteria} />
          <HardConstraints constraints={defaults.mission.hard_constraints ?? []} />
        </>
      )}
      {evaluationError && (
        <div className="px-4 pt-3">
          <ErrorNote error={evaluationError} context="scoring/evaluate" />
        </div>
      )}
      <RankedList results={evaluation?.results} selectedId={selectedId} onSelect={onSelect} isPending={evaluationPending} warnings={evaluation?.warnings} />
    </aside>
  );
}
