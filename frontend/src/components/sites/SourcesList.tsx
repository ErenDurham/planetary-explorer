import { ExternalLink } from "lucide-react";
import { Section } from "@/components/ui/Section";
import type { Provenance } from "@/types";

export function SourcesList({ sources, title = "Sources" }: { sources: Record<string, Provenance>; title?: string }) {
  const list = Object.values(sources);
  if (list.length === 0) return null;
  return (
    <Section title={title}>
      <ol className="space-y-1.5 text-[11px] leading-snug">
        {list.map((s) => (
          <li key={s.source_id} className="text-fg-muted">
            <span className="text-fg">{s.title}</span>
            {s.institution && <span> — {s.institution}</span>}
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-copper-bright hover:text-fg" aria-label={`Open ${s.title}`}>
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
