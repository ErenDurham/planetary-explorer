import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatNumber } from "@/lib/format";

export function rowKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
  const buttons = Array.from(e.currentTarget.closest("ol")?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const i = buttons.indexOf(e.currentTarget);
  const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
  e.preventDefault();
  buttons[next]?.focus();
}

export const candidateRowClass = (selected: boolean) => `group grid w-full grid-cols-[22px_1fr_auto] items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${selected ? "border-copper bg-copper/10" : "border-transparent hover:border-line-strong hover:bg-bg-elev-2"}`;

export function CandidateRow({ name, rank, score, color, selected, status, tone, detail, scoreSuffix = "", accessibleLabel, onSelect }: {
  name: string; rank?: number | null; score?: number | null; color?: string;
  scoreSuffix?: string; accessibleLabel?: string;
  selected: boolean; status: string; tone: BadgeTone; detail?: string; onSelect: () => void;
}) {
  return <button type="button" onClick={onSelect} onKeyDown={rowKeyDown}
    aria-pressed={selected}
    aria-label={accessibleLabel ?? `${name}, ${rank != null ? `rank ${rank}, ` : ""}${score != null ? `index ${formatNumber(score, { maxFractionDigits: 1 })}, ` : ""}${status}${detail ? `, ${detail}` : ""}`}
    className={candidateRowClass(selected)}>
    <span className="num text-xs text-fg-muted">{rank ?? "—"}</span>
    <span className="min-w-0">
      <span className="block truncate text-xs text-fg" title={name}>{name}</span>
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
        {score != null && <span className="block h-full" style={{ width: `${score}%`, backgroundColor: color }} />}
      </span>
    </span>
    <span className="flex flex-col items-end gap-0.5">
      <span className="num text-xs" style={{ color }}>{score != null ? `${formatNumber(score, { maxFractionDigits: 1 })}${scoreSuffix}` : "—"}</span>
      <Badge tone={tone} title={detail}>{status}</Badge>
    </span>
  </button>;
}
