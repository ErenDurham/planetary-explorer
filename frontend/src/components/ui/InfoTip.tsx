// Small accessible disclosure for rationale / provenance text. A native
// <details> keeps keyboard and screen-reader behaviour; the box is a
// viewport-aware floating layer, so it never runs past the screen edge.
// Everywhere on the site the box closes as soon as the pointer leaves the icon
// and the box, instead of waiting for a second click on the icon
// (`closeOnMouseLeave`, on by default). The "help" variant is a question-mark
// circle that also opens on hover; the "info" (i) circle opens on click.
import { useRef, useState, type ReactNode } from "react";
import { CircleQuestionMark, Info } from "lucide-react";
import { Floating } from "@/components/ui/Floating";

export function InfoTip({ label, children, closeOnMouseLeave = true, large = false, variant = "info" }: { label: string; children: ReactNode; closeOnMouseLeave?: boolean; large?: boolean; variant?: "info" | "help" }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    if (details.current) details.current.open = false;
    setOpen(false);
  };
  const show = () => {
    if (details.current) details.current.open = true;
    setOpen(true);
  };
  const Icon = variant === "help" ? CircleQuestionMark : Info;
  return (
    <details
      ref={details}
      className="group relative inline-block"
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onMouseEnter={variant === "help" ? show : undefined}
      onMouseLeave={closeOnMouseLeave ? close : undefined}
      data-testid={variant === "help" ? "help-tip" : undefined}
    >
      <summary ref={summary} aria-label={label} className="list-none cursor-pointer rounded p-0.5 text-fg-faint hover:text-fg [&::-webkit-details-marker]:hidden">
        <Icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
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
