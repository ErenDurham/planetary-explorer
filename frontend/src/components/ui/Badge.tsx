import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info" | "copper";

const tones: Record<BadgeTone, string> = {
  neutral: "border-line-strong text-fg-muted bg-bg-elev-2",
  ok: "border-ok/40 text-ok bg-ok/10",
  warn: "border-warn/40 text-warn bg-warn/10",
  danger: "border-danger/40 text-danger bg-danger/10",
  info: "border-info/40 text-info bg-info/10",
  copper: "border-copper/50 text-copper-bright bg-copper/10",
};

export function Badge({ tone = "neutral", children, title, className = "" }: { tone?: BadgeTone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
