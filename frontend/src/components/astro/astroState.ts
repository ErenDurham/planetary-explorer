import { create } from "zustand";
import type { AstroRequest, AstroResponse } from "@/types";
import { api } from "@/services/api";
export interface ChatEntry {
  question: string;
  request: AstroRequest;
  contextKey: string;
  response?: AstroResponse;
  error?: string;
}
interface ChatState {
  entries: ChatEntry[];
  pending: boolean;
  generation: number;
  clear: () => void;
  send: (
    request: AstroRequest,
    contextKey: string,
    retry?: boolean,
  ) => Promise<void>;
}
export const useAstroStore = create<ChatState>((set, get) => ({
  entries: [],
  pending: false,
  generation: 0,
  clear: () =>
    set((s) => ({ entries: [], pending: false, generation: s.generation + 1 })),
  send: async (request, contextKey, retry = false) => {
    if (get().pending) return;
    const generation = get().generation;
    const entry: ChatEntry = {
      question: request.question,
      request,
      contextKey,
    };
    set((s) => ({
      pending: true,
      entries: [
        ...(retry ? s.entries.slice(0, -1) : s.entries).slice(-19),
        entry,
      ],
    }));
    try {
      const response = await api.astroChat(request);
      if (get().generation !== generation) return;
      set((s) => ({
        entries: [...s.entries.slice(0, -1), { ...entry, response }],
      }));
    } catch (error) {
      if (get().generation !== generation) return;
      set((s) => ({
        entries: [
          ...s.entries.slice(0, -1),
          {
            ...entry,
            error:
              error instanceof Error ? error.message : "Unable to reach Astro",
          },
        ],
      }));
    } finally {
      if (get().generation === generation) set({ pending: false });
    }
  },
}));
