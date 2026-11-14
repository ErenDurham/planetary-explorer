import { AlertTriangle } from "lucide-react";
import { isApiError } from "@/services/api";

export function ErrorNote({ error, context }: { error: unknown; context?: string }) {
  const msg = isApiError(error)
    ? error.isUnavailable
      ? `Backend unavailable${context ? ` (${context})` : ""}: ${error.message}`
      : `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
  return (
    <div role="alert" className="flex items-start gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{msg}</span>
    </div>
  );
}
