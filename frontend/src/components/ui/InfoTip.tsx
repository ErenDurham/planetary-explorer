// Small accessible disclosure for rationale / provenance text. Uses a native
// <details> so it works with keyboard and screen readers without extra JS.
import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group relative inline-block">
      <summary aria-label={label} className="list-none cursor-pointer rounded p-0.5 text-fg-faint hover:text-fg [&::-webkit-details-marker]:hidden">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-72 rounded border border-line-strong bg-bg-elev-2 p-3 text-xs leading-relaxed text-fg shadow-xl">
        {children}
      </div>
    </details>
  );
}
