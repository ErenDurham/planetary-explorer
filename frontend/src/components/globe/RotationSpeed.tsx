/** A small slider for how fast a globe auto-rotates, as a multiple of its normal speed. */
export function RotationSpeed({ value, onChange, className = "" }: { value: number; onChange: (speed: number) => void; className?: string }) {
  return (
    <label className={`inline-flex items-center gap-2 text-fg-muted ${className}`} title="Rotation speed">
      <span>Speed</span>
      <input type="range" min={0.25} max={4} step={0.25} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Rotation speed" aria-valuetext={`${value} times normal speed`} className="h-1 w-20 cursor-pointer accent-copper-bright" />
      <span className="num w-7 tabular-nums">{value}×</span>
    </label>
  );
}
