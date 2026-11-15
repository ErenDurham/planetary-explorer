// Colour and wording for the service's terrain-risk classes. The classes are
// the service's; the UI only maps them to the palette and never reclassifies.
import type { FeasibilityVerdict, RiskCategory } from "../adapter/types";

export const RISK_STYLE: Record<RiskCategory, { label: string; stroke: string; className: string; dashed: boolean }> = {
  low: { label: "Low terrain risk", stroke: "#6fb98f", className: "text-ok", dashed: false },
  moderate: { label: "Moderate terrain risk", stroke: "#d9a441", className: "text-warn", dashed: false },
  high: { label: "High terrain risk", stroke: "#d16a5a", className: "text-danger", dashed: false },
  unknown: { label: "Risk not classified", stroke: "#9aa5b4", className: "text-fg-muted", dashed: true },
};

export const VERDICT_STYLE: Record<FeasibilityVerdict, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  feasible: { label: "Feasible", tone: "ok" },
  marginal: { label: "Marginal", tone: "warn" },
  infeasible: { label: "Infeasible", tone: "danger" },
  undetermined: { label: "Undetermined", tone: "neutral" },
};
