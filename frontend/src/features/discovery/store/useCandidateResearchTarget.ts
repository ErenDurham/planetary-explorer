// Which discovery candidate the Research tab is about, and the notebook drafts
// for each one. Drafts live here rather than in component state so that going
// back to Explore, switching tabs or re-ranking never loses unsaved notes;
// they are keyed by run and candidate, cleared on a successful save, and never
// written anywhere else (export reads them, it does not save them).
import { create } from "zustand";
import type { CandidateResearchUpdate } from "@/services/discoveryEngine";

export interface ResearchTarget { runId: string; candidateId: string }

/** Unsaved notebook edits: the fields the save endpoint takes, plus the checklist ticks, which are a session aid and not part of the record. */
export interface ResearchDraft {
  status: CandidateResearchUpdate["status"];
  notes: string;
  findings: NonNullable<CandidateResearchUpdate["findings"]>;
  checked: string[];
  /** The `updated_at` of the saved record the draft was made from, so a save from elsewhere is noticed. */
  baseUpdatedAt: string | null;
}

export const draftKey = (t: ResearchTarget) => `${t.runId}:${t.candidateId}`;

interface State {
  target: ResearchTarget | null;
  open: (runId: string, candidateId: string) => void;
  drafts: Record<string, ResearchDraft>;
  setDraft: (t: ResearchTarget, draft: ResearchDraft) => void;
  clearDraft: (t: ResearchTarget) => void;
}

export const useCandidateResearchTarget = create<State>(set => ({
  target: null,
  open: (runId, candidateId) => set({ target: { runId, candidateId } }),
  drafts: {},
  setDraft: (t, draft) => set(s => ({ drafts: { ...s.drafts, [draftKey(t)]: draft } })),
  clearDraft: (t) => set(s => { const next = { ...s.drafts }; delete next[draftKey(t)]; return { drafts: next }; }),
}));
