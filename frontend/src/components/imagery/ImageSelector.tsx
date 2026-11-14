// A small, labelled select over the entries of one view (orbital or surface)
// for one location. Regional context and exact-site imagery are told apart in
// the option text so the choice is informed before the image loads.
import { coverageKind } from "@/lib/comparison";
import type { ImageryEntry } from "@/types";

export function ImageSelector({ id, label, entries, value, onChange }: { id: string; label: string; entries: ImageryEntry[]; value: string; onChange: (entryId: string) => void }) {
  if (entries.length <= 1) return null;
  return (
    <label htmlFor={id} className="block text-xs text-fg-muted">
      <span className="sr-only">{label}</span>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className="w-full rounded border border-line-strong bg-bg-elev px-2 py-2 text-xs text-fg">
        {entries.map(e => <option key={e.entry_id} value={e.entry_id}>{coverageKind(e) === "regional" ? "Regional · " : "Exact site · "}{e.title}</option>)}
      </select>
    </label>
  );
}
