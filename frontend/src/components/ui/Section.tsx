import type { ReactNode } from "react";

export function Section({ title, subtitle, actions, children, id }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-label={title} className="border-b border-line px-4 py-3 last:border-b-0">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-fg-faint">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-line px-3 py-2 text-xs text-fg-faint">{children}</p>;
}

export function BulletList({ items, tone = "neutral", empty }: { items: string[] | undefined; tone?: "neutral" | "ok" | "danger" | "warn"; empty?: string }) {
  if (!items || items.length === 0) return empty ? <EmptyNote>{empty}</EmptyNote> : null;
  const marker = tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg-faint";
  return (
    <ul className="space-y-1 text-xs leading-relaxed text-fg">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm ${marker} bg-current`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
