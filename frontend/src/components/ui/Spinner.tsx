import { Loader2 } from "lucide-react";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-fg-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      {label}
    </span>
  );
}
