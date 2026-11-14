// Full-size view of one image. A real modal: role=dialog + aria-modal, focus
// moves to the close button on open, Tab cycles inside, Escape closes, and
// focus returns to the element that opened it. Same zoom/pan frame as the pane.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { ZoomControls, ZoomableImage, type GeoContext } from "@/components/imagery/ZoomableImage";
import { relationshipLabel } from "@/lib/comparison";
import type { ImageryEntry } from "@/types";

export function ExpandDialog({ entry, geo, locationName, onClose }: { entry: ImageryEntry; geo: GeoContext | null; locationName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; opener?.focus?.(); };
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], select, input, [tabindex]:not([tabindex="-1"])') ?? []).filter(el => !el.hasAttribute("disabled"));
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 md:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="expand-title" aria-describedby="expand-desc" onKeyDown={onKey} className="flex max-h-full w-full max-w-[1400px] flex-col rounded-lg border border-line-strong bg-bg-elev shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id="expand-title" className="truncate text-sm font-semibold text-fg">{locationName}: {entry.title}</h2>
            <p id="expand-desc" className="mt-0.5 text-xs text-fg-muted">{relationshipLabel(entry)} · {entry.credit}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close expanded image" className="rounded border border-line p-2 text-fg-muted hover:text-fg"><X className="h-4 w-4" aria-hidden /></button>
        </header>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <ZoomControls zoom={zoom} onZoom={setZoom} idPrefix="expand" />
          <a href={entry.source_page_url} target="_blank" rel="noreferrer" className="text-xs text-info underline underline-offset-4">Original source ↗</a>
        </div>
        <div className="min-h-0 px-4 pb-4">
          <ZoomableImage entry={entry} geo={geo} zoom={zoom} onZoom={setZoom} frameClassName="h-[70vh]" ariaLabel={`Expanded image of ${locationName}`} frameId="expand-frame" />
        </div>
      </div>
    </div>
  );
}
