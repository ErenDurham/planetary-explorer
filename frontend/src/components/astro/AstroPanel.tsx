import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useMission } from "@/hooks/useEvaluation";
import { AIIndicator } from "@/components/ui/AIIndicator";
import { useBoundsReporter } from "@/hooks/useBoundsReporter";
import type { OverlayBounds } from "@/lib/overlay";
import { AstroComposer } from "./AstroComposer";
import { astroSuggestion } from "./suggestion";
import { ResponsiveSurface } from "@/components/ui/ResponsiveSurface";
import { useAstroStore } from "./astroState";
import type { AstroAction, AstroRequest } from "@/types";

const button =
  "rounded border border-line px-2.5 py-2 text-left text-xs text-fg-muted hover:border-copper hover:text-fg focus-visible:outline focus-visible:outline-copper";
export function AstroPanel({
  onBoundsChange,
  maxOverlayHeight,
}: {
  onBoundsChange?: (bounds: OverlayBounds) => void;
  maxOverlayHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const state = useAppStore();
  const mission = useMission();
  const { entries, pending, send, clear } = useAstroStore();
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useBoundsReporter(launcher, onBoundsChange, !open);
  const context = {
    active_tab: state.activeTab,
    viewed_body: state.viewedBody,
    map_mode: state.mapMode,
    selected_mars_id:
      state.activeTab === "compare"
        ? (state.comparisonPair?.marsId ?? state.selectedMarsId)
        : state.selectedMarsId,
    selected_earth_id:
      state.activeTab === "compare"
        ? (state.comparisonPair?.earthId ?? state.selectedEarthId)
        : state.selectedEarthId,
    candidate_body: state.selectionBody,
    objective: state.appliedObjective.slice(0, 500),
    mission,
    assessment:
      state.missionType === "landing"
        ? null
        : {
            body: state.selectionBody,
            mission_type: state.missionType,
            weights: state.missionProfileWeights[state.missionType],
            requirements: state.missionRequirements[state.selectionBody],
          },
    analog_weights: state.analogWeights
      ? Object.entries(state.analogWeights).map(([feature_id, weight]) => ({
          feature_id,
          weight,
        }))
      : null,
  };
  const contextKey = JSON.stringify(context);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [entries, pending]);
  function ask(question: string) {
    if (!question.trim() || pending) return;
    const history: AstroRequest["history"] = entries
      .filter((e) => e.response)
      .slice(-6)
      .flatMap((e) => [
        { role: "user" as const, content: e.question },
        {
          role: "assistant" as const,
          content:
            `Context: ${e.response!.context_label}\n${e.response!.answer}`.slice(
              0,
              4000,
            ),
        },
      ]);
    void send({ ...context, question: question.trim(), history }, contextKey);
    setDraft("");
    setOpen(true);
  }
  function act(action: AstroAction) {
    // The server returns an allowlist. Never interpret arbitrary model commands.
    if (
      action.id === `location:${action.location_id}` &&
      action.location_id &&
      action.body
    )
      state.showOnGlobe(action.body, action.location_id);
    else if (
      ["mission", "analyze", "research", "compare"].includes(action.id) &&
      action.id === action.tab
    ) {
      if (
        action.tab === "compare" &&
        (!state.selectedMarsId || !state.selectedEarthId)
      )
        return;
      if (action.tab === "analyze" && action.body && action.location_id)
        state.selectLocation(action.body, action.location_id);
      else if (action.tab === "research") {
        if (action.body === "mars" && action.location_id)
          state.selectLocation("mars", action.location_id);
        else if (!state.selectedMarsId) return;
      }
      state.setActiveTab(action.tab);
    }
    close();
  }
  const suggestion = astroSuggestion({
    tab: state.activeTab,
    body: state.viewedBody,
    analysisBody:
      state.missionType === "landing" ? "mars" : state.selectionBody,
    taskMission:
      state.missionType !== "landing" &&
      (state.activeTab === "analyze" || state.mapMode === "mission_browse"),
    hasMars: !!context.selected_mars_id,
    hasEarth: !!context.selected_earth_id,
    hasConversation: entries.length > 0,
  });
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  };
  useEffect(() => {
    if (open) {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Collapse Astro"]')
        ?.focus();
      if (log.current) log.current.scrollTop = log.current.scrollHeight;
    }
  }, [open]);
  useEffect(() => {
    const focusedInside = document.activeElement?.closest(
      '[aria-label="Astro research assistant"]',
    );
    setOpen(false);
    if (focusedInside) requestAnimationFrame(() => launcher.current?.focus());
  }, [state.activeTab]);
  const composer = (
    <AstroComposer
      draft={draft}
      onDraft={setDraft}
      onSend={() => ask(draft)}
      suggestion={suggestion}
      pending={pending}
    />
  );
  return (
    <>
      {!open && (
        <button
          ref={launcher}
          type="button"
          aria-label="Expand Astro"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-line-strong bg-bg-elev px-4 py-2.5 text-sm font-medium text-fg shadow-lg hover:border-copper/50 focus-visible:outline focus-visible:outline-copper"
        >
          <span>Astro</span>
          <AIIndicator label="AI" />
          <ChevronUp className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
        </button>
      )}
      {open && (
        <ResponsiveSurface
          focusOnMount={false}
          onBoundsChange={onBoundsChange}
          style={
            maxOverlayHeight === undefined
              ? undefined
              : {
                  maxHeight: maxOverlayHeight,
                  minHeight: Math.min(
                    entries.length || pending ? 280 : 0,
                    maxOverlayHeight,
                  ),
                }
          }
          label="Astro research assistant"
          mobileClassName={
            entries.length || pending
              ? "h-[min(66dvh,480px)] max-h-[80dvh]"
              : "h-[180px] max-h-[80dvh]"
          }
          onClose={close}
          className={`pointer-events-auto absolute bottom-3 left-1/2 flex w-[calc(100%-24px)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line-strong bg-bg-elev shadow-2xl motion-safe:animate-[sheet-in_180ms_ease-out] ${entries.length || pending ? "h-[min(66%,480px)] min-h-[280px]" : "h-[180px]"}`}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-fg">Astro</h2>
              <AIIndicator label="AI assistant" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clear}
                className="text-xs text-fg-muted hover:text-fg"
              >
                Clear conversation
              </button>
              <button
                type="button"
                aria-label="Collapse Astro"
                aria-expanded={true}
                onClick={close}
                className="rounded p-1 text-fg-muted hover:text-fg"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>
          <div
            ref={log}
            role="log"
            aria-label="Astro conversation"
            aria-live="polite"
            aria-busy={pending}
            className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          >
            {entries.map((entry, i) => (
              <article key={i} className="space-y-3 border-b border-line pb-4">
                <p className="rounded-lg bg-bg-elev-2 p-3 text-sm text-fg">
                  <span className="sr-only">You: </span>
                  {entry.question}
                </p>
                {entry.response && (
                  <div className="space-y-3 text-xs leading-relaxed text-fg-muted">
                    <p className="text-[10px] uppercase tracking-wide text-fg-faint">
                      {entry.response.generated_by === "llm"
                        ? "Claude · interpretation"
                        : "Deterministic guidance"}{" "}
                      · {entry.response.context_label}
                    </p>
                    {entry.contextKey !== contextKey && (
                      <p className="rounded border border-warn/40 p-2 text-warn">
                        Earlier context — this answer refers to the selection
                        and priorities when you sent it.
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-fg">
                      {entry.response.answer}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {entry.response.actions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          disabled={entry.contextKey !== contextKey}
                          className={`${button} disabled:opacity-40`}
                          onClick={() => act(a)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                    <details>
                      <summary className="cursor-pointer">
                        Evidence and limitations
                      </summary>
                      {!!entry.response.facts.length && (
                        <details>
                          <summary className="cursor-pointer font-medium text-fg">
                            Computed context
                          </summary>
                          <ul className="mt-2 list-disc space-y-2 pl-4">
                            {entry.response.facts.map((f, j) => (
                              <li key={j}>{f}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {entry.response.evidence.map((quote, j) => {
                        const citation = entry.response!.citations.find(
                          (c) => c.citation_id === quote.citation_id,
                        );
                        return (
                          <blockquote
                            key={j}
                            className="border-l-2 border-copper/50 pl-3"
                          >
                            <p>{quote.quote}</p>
                            {citation && /^https?:\/\//.test(citation.url) && (
                              <a
                                href={citation.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block text-info underline"
                              >
                                {quote.citation_id} {citation.title} ↗
                              </a>
                            )}
                          </blockquote>
                        );
                      })}

                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {entry.response.limitations.map((l, j) => (
                          <li key={j}>{l}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
                {entry.error && (
                  <div role="alert" className="space-y-2 text-xs text-danger">
                    <p>Astro could not respond. {entry.error}</p>
                    {i === entries.length - 1 && (
                      <button
                        type="button"
                        disabled={pending}
                        className={button}
                        onClick={() =>
                          void send(entry.request, entry.contextKey, true)
                        }
                      >
                        Retry message
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {pending && (
              <p role="status" className="text-xs text-fg-muted">
                Reviewing the evidence…
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-line">{composer}</div>
        </ResponsiveSurface>
      )}
    </>
  );
}
