// Default-objective handoff: the Mission Design objective can ask for NEW
// regions beyond the established analogs. That reading only decides where the
// UI points the user; it never changes a score.
const CUES = /\b(new|novel|undiscovered|additional|beyond (the )?(established|known|curated|existing)|discover(y|ing)?|candidate (earth )?regions?)\b/i;
export function wantsDiscovery(objective: string | null | undefined): boolean {
  return !!objective && CUES.test(objective);
}
