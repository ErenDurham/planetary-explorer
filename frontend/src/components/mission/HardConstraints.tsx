import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { InfoTip } from "@/components/ui/InfoTip";
import { formatNumber } from "@/lib/format";
import type { HardConstraint } from "@/types";

export function HardConstraints({ constraints }: { constraints: HardConstraint[] }) {
  return (
    <Section title="Hard constraints" subtitle="Sites failing any of these are ineligible and unranked">
      <ul className="space-y-1.5">
        {constraints.map((c) => (
          <li key={c.constraint_id} className="flex items-start justify-between gap-2 text-xs">
            <div>
              <span className="text-fg">{c.feature_id.replace(/_/g, " ")}</span>{" "}
              <span className="num text-fg-muted">
                {c.operator} {formatNumber(c.threshold)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {c.is_assumption && <Badge tone="warn" title="Documented screening assumption, not an established requirement">assumption</Badge>}
              <InfoTip label={`Rationale for ${c.constraint_id}`}>{c.rationale}</InfoTip>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
