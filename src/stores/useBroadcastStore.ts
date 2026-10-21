import { create } from "zustand";

export type BroadcastScope = "tab" | "all";

interface BroadcastState {
  readonly isBroadcastEnabled: boolean;
  readonly scope: BroadcastScope;
  readonly excludedPaneIds: readonly string[];

  readonly toggleBroadcast: () => void;
  readonly setBroadcastEnabled: (enabled: boolean) => void;
  readonly setScope: (scope: BroadcastScope) => void;
  readonly togglePaneExclusion: (paneId: string) => void;
  readonly isPaneExcluded: (paneId: string) => boolean;
}

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  isBroadcastEnabled: false,
  scope: "tab",
  excludedPaneIds: [],

  toggleBroadcast: () => {
    set((state) => ({ isBroadcastEnabled: !state.isBroadcastEnabled }));
  },

  setBroadcastEnabled: (isBroadcastEnabled) => {
    set({ isBroadcastEnabled });
  },

  setScope: (scope) => {
    set({ scope });
  },

  togglePaneExclusion: (paneId) => {
    set((state) => {
      const isExcluded = state.excludedPaneIds.includes(paneId);
      const next = isExcluded
        ? state.excludedPaneIds.filter((id) => id !== paneId)
        : [...state.excludedPaneIds, paneId];
      return { excludedPaneIds: next };
    });
  },

  isPaneExcluded: (paneId) => {
    return get().excludedPaneIds.includes(paneId);
  },
}));
