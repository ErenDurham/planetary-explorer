import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { QualityFlag } from "@/types";

const META: Record<QualityFlag, { label: string; tone: BadgeTone; title: string }> = {
  good: { label: "good", tone: "ok", title: "Measured or derived at the stated resolution with documented uncertainty." },
  regional_scale_only: { label: "regional", tone: "info", title: "Regional statistic (~3.7 km MOLA baseline); cannot resolve lander-scale hazards." },
  qualitative: { label: "qualitative", tone: "neutral", title: "Categorical or descriptive, literature-sourced; not a numeric measurement." },
  low_confidence: { label: "low confidence", tone: "warn", title: "Value carries large or unquantified uncertainty." },
  demo_fixture: { label: "demo data", tone: "danger", title: "Development placeholder, not real data. Do not cite." },
  missing: { label: "no data", tone: "neutral", title: "No measurement is available for this site in this profile version." },
};

export function QualityBadge({ flag }: { flag: QualityFlag }) {
  const m = META[flag] ?? { label: flag, tone: "neutral" as BadgeTone, title: flag };
  return (
    <Badge tone={m.tone} title={m.title}>
      {m.label}
    </Badge>
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  ground: "Ground",
  atmosphere_thermal: "Atmosphere & Thermal",
  light: "Light",
  water_ice: "Water / Ice",
  hazards: "Hazards",
  composition: "Composition",
};

export const CATEGORY_ORDER = ["ground", "atmosphere_thermal", "light", "water_ice", "hazards", "composition"];
