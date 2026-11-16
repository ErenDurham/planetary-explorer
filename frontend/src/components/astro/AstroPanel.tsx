import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useMission } from "@/hooks/useEvaluation";
import { useBoundsReporter } from "@/hooks/useBoundsReporter";
import type { OverlayBounds } from "@/lib/overlay";
import { AstroPresence } from "./AstroPresence";
import styles from "./astro.module.css";
import { AstroComposer } from "./AstroComposer";
import { astroSuggestion } from "./suggestion";
import { ResponsiveSurface } from "@/components/ui/ResponsiveSurface";
import { useAstroStore } from "./astroState";
import type { AstroRequest } from "@/types";

const cornerToggle = "absolute right-1 top-1 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-bg-elev-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-bright";

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
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [draft, setDraft] = useState("");
  const [chatHeight, setChatHeight] = useState<number | null>(null);
  const [chatWidth, setChatWidth] = useState<number | null>(null);
  const resize = useRef<{ x: number; y: number; width: number; height: number; max: number; maxWidth: number; edge: string } | null>(null);
  function beginResize(e: ReactPointerEvent<HTMLDivElement>, edge: string) {
    if (e.button !== 0) return;
    const surface = e.currentTarget.parentElement!;
    const box = surface.getBoundingClientRect();
    resize.current = {
      x: e.clientX, y: e.clientY, width: box.width, height: box.height, edge,
      maxWidth: Math.max(0, (surface.parentElement?.clientWidth || window.innerWidth) - 32),
      max: maxOverlayHeight ?? Math.min(window.innerHeight * .8, (surface.parentElement?.clientHeight || window.innerHeight) - 24),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function moveResize(e: ReactPointerEvent<HTMLDivElement>) {
    const start = resize.current;
    if (!start) return;
    if (start.edge.includes("left") || start.edge.includes("right")) {
      const direction = start.edge.includes("left") ? -1 : 1;
      setChatWidth(Math.min(start.maxWidth, Math.max(Math.min(360, start.maxWidth), start.width + direction * (e.clientX - start.x) * 2)));
    }
    if (start.edge.includes("top")) {
      const min = entries.length || pending ? 240 : 180;
      setChatHeight(Math.min(start.max, Math.max(Math.min(min, start.max), start.height + start.y - e.clientY)));
    }
  }
  function endResize(e: ReactPointerEvent<HTMLDivElement>) {
    resize.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const state = useAppStore();
  const mission = useMission();
  const { entries, pending, send, clear } = useAstroStore();
  const latest = entries.at(-1);
  const presenceState = pending ? "thinking" : latest?.error ? "error" : latest?.response ? "answer" : "ready";
  const presenceLabel = pending ? "Reviewing evidence" : latest?.error ? "Reply unavailable" : latest?.response ? "Response ready" : "Ready for a question";
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useBoundsReporter(launcher, onBoundsChange, !open);
  const context = {
    // Astro is hidden on Home, which has no scientific conversation context.
    active_tab: state.activeTab === "home" ? "mission" as const : state.activeTab,
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
          className={`pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center text-fg hover:border-copper/50 focus-visible:outline focus-visible:outline-copper ${styles.launcher}`}
        >
          <AstroPresence state={presenceState} size={36} /><span className={styles.identity}><strong>Astro</strong><small>AI · {pending ? "Reviewing" : "Ask a question"}</small></span>
          <span className={cornerToggle} aria-hidden><ArrowUpRight className="h-4 w-4" /></span>
        </button>
      )}
      {open && (
        <ResponsiveSurface
          focusOnMount={false}
          onBoundsChange={onBoundsChange}
          style={{
            ...(chatWidth !== null && !narrow ? { width: chatWidth } : {}),
            ...(chatHeight !== null ? { height: chatHeight, minHeight: Math.min(entries.length || pending ? 240 : 180, maxOverlayHeight ?? Infinity) } : {}),
            ...(maxOverlayHeight === undefined ? {} : {
              maxHeight: maxOverlayHeight,
              minHeight: Math.min(chatHeight !== null ? (entries.length || pending ? 240 : 180) : (entries.length || pending ? 280 : 0), maxOverlayHeight),
            }),
          }}
          label="Astro research assistant"
          mobileClassName={
            entries.length || pending
              ? "h-[min(64dvh,500px)] max-h-[80dvh]"
              : "h-[300px] max-h-[80dvh]"
          }
          onClose={close}
          className={`pointer-events-auto absolute bottom-3 left-1/2 flex w-[720px] max-w-[calc(100%-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line-strong bg-bg-elev shadow-2xl motion-safe:animate-[sheet-in_180ms_ease-out] ${styles.surface} ${entries.length || pending ? "h-[min(64%,480px)] min-h-[280px]" : "h-[300px]"}`}
        >
          <div
            role="separator" tabIndex={0} aria-label="Resize Astro height" aria-orientation="horizontal"
            aria-valuemin={entries.length || pending ? 240 : 180}
            aria-valuemax={Math.round(maxOverlayHeight ?? window.innerHeight * .8)}
            aria-valuenow={Math.round(Math.min(maxOverlayHeight ?? window.innerHeight * .8, chatHeight ?? (entries.length || pending ? 480 : 220)))}
            title="Drag down to shorten, up to enlarge. Arrow keys resize; double-click resets."
            className="flex h-4 shrink-0 touch-none cursor-ns-resize items-center justify-center rounded-t-xl hover:bg-bg-elev-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-bright"
            onPointerDown={e => beginResize(e, "top")}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={() => { resize.current = null; }}
            onDoubleClick={() => setChatHeight(null)}
            onKeyDown={e => {
              if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const min = entries.length || pending ? 240 : 180;
              const max = maxOverlayHeight ?? Math.min(window.innerHeight * .8, (e.currentTarget.parentElement?.parentElement?.clientHeight || window.innerHeight) - 24);
              const current = e.currentTarget.parentElement?.getBoundingClientRect().height || chatHeight || 480;
              setChatHeight(Math.min(max, Math.max(Math.min(min, max), e.key === "Home" ? min : e.key === "End" ? max : current + (e.key === "ArrowUp" ? 32 : -32))));
            }}
          ><span aria-hidden className="h-1 w-10 rounded-full bg-line-strong" /></div>
          {(["left", "right"] as const).map(edge => <div key={edge}
            role="separator" tabIndex={0} aria-label={`Resize Astro from ${edge}`} aria-orientation="vertical"
            aria-valuemin={360} aria-valuemax={window.innerWidth - 32} aria-valuenow={Math.round(chatWidth ?? 720)}
            title="Drag to resize chat width; arrow keys adjust; double-click resets."
            className={`absolute bottom-3 top-4 z-10 hidden w-2 touch-none cursor-ew-resize hover:bg-copper/15 focus-visible:outline focus-visible:outline-copper-bright lg:block ${edge === "left" ? "left-0" : "right-0"}`}
            onPointerDown={e => beginResize(e, edge)} onPointerMove={moveResize} onPointerUp={endResize}
            onPointerCancel={() => { resize.current = null; }} onDoubleClick={() => setChatWidth(null)}
            onKeyDown={e => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const max = Math.max(0, (e.currentTarget.parentElement?.parentElement?.clientWidth || window.innerWidth) - 32);
              const current = e.currentTarget.parentElement?.getBoundingClientRect().width || chatWidth || 720;
              const delta = (e.key === "ArrowRight" ? 32 : -32) * (edge === "left" ? -1 : 1);
              setChatWidth(Math.min(max, Math.max(Math.min(360, max), e.key === "Home" ? 360 : e.key === "End" ? max : current + delta)));
            }} />)}
          {(["left", "right"] as const).map(edge => <div key={`corner-${edge}`} aria-hidden
            data-testid={`astro-resize-top-${edge}`} title="Drag corner to resize; double-click resets."
            className={`absolute top-0 z-20 hidden h-3 w-3 touch-none lg:block ${edge === "left" ? "left-0 cursor-nwse-resize" : "right-0 cursor-nesw-resize"}`}
            onPointerDown={e => beginResize(e, `top-${edge}`)} onPointerMove={moveResize} onPointerUp={endResize}
            onPointerCancel={() => { resize.current = null; }} onDoubleClick={() => { setChatWidth(null); setChatHeight(null); }} />)}
          <button type="button" aria-label="Collapse Astro" title="Collapse Astro" aria-expanded={true} onClick={close} className={cornerToggle}>
            <ArrowDownLeft className="h-4 w-4" aria-hidden />
          </button>
          <header className={`flex shrink-0 items-center justify-between gap-3 border-b border-line py-3 pl-4 pr-14 ${styles.header}`}>
            <div className="flex items-center gap-2">
              {(entries.length > 0 || pending) && <AstroPresence state={presenceState} size={38} />}<div><div className="flex items-center gap-2"><h2 className="text-sm font-medium text-fg">Astro</h2></div><p className={styles.status}>{presenceLabel}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { clear(); setDraft(""); }}
                className="text-xs text-fg-muted hover:text-fg"
              >
                Clear conversation
              </button>

            </div>
          </header>
          <div
            ref={log}
            role="log"
            aria-label="Astro conversation"
            aria-live="polite"
            aria-busy={pending}
            className={`scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4 ${styles.log}`}
          >
            {!entries.length && !pending && <div className={styles.empty}><AstroPresence size={76} /><div><h3>Make sense of the evidence.</h3><p>Ask about a place, a ranking, or what to investigate next.</p></div></div>}
            {entries.map((entry, i) => (
              <article key={i} className="space-y-3 border-b border-line pb-4">
                <p className="rounded-lg bg-bg-elev-2 p-3 text-sm text-fg">
                  <span className="sr-only">You: </span>
                  {entry.question}
                </p>
                {entry.response && (
                  <div className="space-y-3 text-xs leading-relaxed text-fg-muted">
                    {entry.response.generated_by === "deterministic_fallback" && <p className="text-xs text-fg-faint" role="status">{entry.response.fallback_reason === "rate_limit" ? "Free AI limit reached · using a site summary" : entry.response.fallback_reason === "not_configured" ? "AI is not connected · using a site summary" : "Using a site summary for this reply"}</p>}
                    {entry.contextKey !== contextKey && (
                      <p className="rounded border border-warn/40 p-2 text-warn">
                        Earlier context — this answer refers to the selection
                        and priorities when you sent it.
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-fg">
                      {entry.response.answer}
                    </p>
                    {!!entry.response.evidence.length && <details>
                      <summary className="cursor-pointer text-xs text-info hover:underline">Sources</summary>
                      <div className="mt-2 space-y-3">
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

                      </div>
                    </details>}
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
