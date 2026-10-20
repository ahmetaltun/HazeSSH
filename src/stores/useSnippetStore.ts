import { create } from "zustand";
import { api } from "@/services/api";
import type { Snippet, CreateSnippetInput, UpdateSnippetInput } from "@/types/snippet";

interface SnippetState {
  readonly snippets: readonly Snippet[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly searchQuery: string;
  readonly selectedTag: string | null;

  readonly fetchSnippets: () => Promise<void>;
  readonly createSnippet: (input: CreateSnippetInput) => Promise<Snippet>;
  readonly updateSnippet: (input: UpdateSnippetInput) => Promise<Snippet>;
  readonly deleteSnippet: (id: string) => Promise<void>;
  readonly setSearchQuery: (query: string) => void;
  readonly setSelectedTag: (tag: string | null) => void;
}

export const useSnippetStore = create<SnippetState>((set) => ({
  snippets: [],
  isLoading: false,
  error: null,
  searchQuery: "",
  selectedTag: null,

  fetchSnippets: async () => {
    set({ isLoading: true, error: null });
    try {
      const snippets = await api.snippetList();
      set({ snippets, isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        error: `Failed to load snippets from local vault: ${msg}`,
        isLoading: false,
      });
    }
  },

  createSnippet: async (input: CreateSnippetInput) => {
    set({ isLoading: true, error: null });
    try {
      const created = await api.snippetCreate(input);
      set((state) => ({
        snippets: [...state.snippets, created].sort((a, b) => a.title.localeCompare(b.title)),
        isLoading: false,
      }));
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const explanatoryError = `Failed to create snippet '${input.title}': ${msg}`;
      set({ error: explanatoryError, isLoading: false });
      throw new Error(explanatoryError);
    }
  },

  updateSnippet: async (input: UpdateSnippetInput) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await api.snippetUpdate(input);
      set((state) => ({
        snippets: state.snippets
          .map((s) => (s.id === updated.id ? updated : s))
          .sort((a, b) => a.title.localeCompare(b.title)),
        isLoading: false,
      }));
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const explanatoryError = `Failed to update snippet '${input.title}' (${input.id}): ${msg}`;
      set({ error: explanatoryError, isLoading: false });
      throw new Error(explanatoryError);
    }
  },

  deleteSnippet: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.snippetDelete(id);
      set((state) => ({
        snippets: state.snippets.filter((s) => s.id !== id),
        isLoading: false,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const explanatoryError = `Failed to delete snippet with ID '${id}': ${msg}`;
      set({ error: explanatoryError, isLoading: false });
      throw new Error(explanatoryError);
    }
  },

  setSearchQuery: (searchQuery: string) => set({ searchQuery }),
  setSelectedTag: (selectedTag: string | null) => set({ selectedTag }),
}));
