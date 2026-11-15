import { Sparkles } from "lucide-react";
/** A capability label; actual model/fallback provenance remains attached to each result. */
export function AIIndicator({
  label = "AI-assisted",
  iconOnly = false,
}: {
  label?: string;
  iconOnly?: boolean;
}) {
  return (
    <span
      role={iconOnly ? "img" : undefined}
      aria-label={iconOnly ? label : undefined}
      title="Uses Claude when configured; falls back to rule-based guidance when unavailable."
      className="inline-flex shrink-0 items-center gap-1 rounded border border-copper/25 px-1.5 py-0.5 text-[10px] font-medium text-copper-bright"
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      {!iconOnly && label}
    </span>
  );
}
