// Small accessible disclosure for rationale / provenance text. A native
// <details> keeps keyboard and screen-reader behaviour; the box is a
// viewport-aware floating layer, so it never runs past the screen edge.
// With `closeOnMouseLeave`, the box also closes as soon as the pointer leaves
// the icon and the box, instead of waiting for a second click on the icon.
import { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Floating } from "@/components/ui/Floating";

export function InfoTip({ label, children, closeOnMouseLeave = false, large = false }: { label: string; children: ReactNode; closeOnMouseLeave?: boolean; large?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    if (details.current) details.current.open = false;
    setOpen(false);
  };
  return (
    <details
      ref={details}
      className="group relative inline-block"
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onMouseLeave={closeOnMouseLeave ? close : undefined}
    >
      <summary ref={summary} aria-label={label} className="list-none cursor-pointer rounded p-0.5 text-fg-faint hover:text-fg [&::-webkit-details-marker]:hidden">
        <Info className={large ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
      </summary>
      {/* always in the DOM, like native <details> content; the browser shows it only while open */}
      <Floating anchor={() => summary.current?.getBoundingClientRect()} align="end" gap={4} bridge={closeOnMouseLeave} active={open}>
        <div className={`rounded border border-line-strong bg-bg-elev-2 p-3 leading-relaxed text-fg shadow-xl ${large ? "w-80 text-sm" : "w-72 text-xs"} max-w-full`}>
          {children}
        </div>
      </Floating>
    </details>
  );
}
