import { create } from "zustand";
import { api } from "@/services/api";
import { useVaultStore } from "@/stores/useVaultStore";
import type { HostToolboxState, ServerToolboxOverview } from "@/types/toolbox";

interface ServerToolboxStore {
  readonly activeHostId: string | null;
  readonly isOpen: boolean;
  readonly activeTab: "containers" | "services" | "ports";
  readonly dataByHostId: Readonly<Record<string, HostToolboxState>>;
  readonly isActionLoading: boolean;
  readonly actionError: string | null;

  readonly openToolbox: (hostId: string, initialTab?: "containers" | "services" | "ports") => void;
  readonly closeToolbox: () => void;
  readonly setActiveTab: (tab: "containers" | "services" | "ports") => void;
  readonly fetchToolboxData: (hostId: string) => Promise<ServerToolboxOverview | null>;
  readonly containerAction: (
    hostId: string,
    containerId: string,
    action: "start" | "stop" | "restart"
  ) => Promise<boolean>;
  readonly containerLogs: (
    hostId: string,
    containerId: string,
    tailLines?: number
  ) => Promise<string>;
  readonly serviceAction: (
    hostId: string,
    unit: string,
    action: "start" | "stop" | "restart"
  ) => Promise<boolean>;
}

export const useServerToolboxStore = create<ServerToolboxStore>((set, get) => ({
  activeHostId: null,
  isOpen: false,
  activeTab: "containers",
  dataByHostId: {},
  isActionLoading: false,
  actionError: null,

  openToolbox: (hostId: string, initialTab = "containers") => {
    set({
      activeHostId: hostId,
      isOpen: true,
      activeTab: initialTab,
      actionError: null,
    });
    void get().fetchToolboxData(hostId);
  },

  closeToolbox: () => {
    set({ isOpen: false, activeHostId: null, actionError: null });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  fetchToolboxData: async (hostId: string) => {
    const { hasMasterPassword, isLocked } = useVaultStore.getState();
    if (hasMasterPassword && isLocked) {
      return null;
    }

    set((state) => ({
      dataByHostId: {
        ...state.dataByHostId,
        [hostId]: {
          ...state.dataByHostId[hostId],
          isLoading: true,
          error: undefined,
        },
      },
    }));

    try {
      const overview = await api.hostFetchToolboxData(hostId);
      set((state) => ({
        dataByHostId: {
          ...state.dataByHostId,
          [hostId]: {
            overview,
            isLoading: false,
            lastUpdated: Date.now(),
            error: overview.error,
          },
        },
      }));
      return overview;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        dataByHostId: {
          ...state.dataByHostId,
          [hostId]: {
            ...state.dataByHostId[hostId],
            isLoading: false,
            lastUpdated: Date.now(),
            error: msg,
          },
        },
      }));
      return null;
    }
  },

  containerAction: async (hostId: string, containerId: string, action: "start" | "stop" | "restart") => {
    set({ isActionLoading: true, actionError: null });
    try {
      await api.hostContainerAction(hostId, containerId, action);
      // Refresh containers list after action
      await get().fetchToolboxData(hostId);
      set({ isActionLoading: false });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isActionLoading: false, actionError: msg });
      return false;
    }
  },

  containerLogs: async (hostId: string, containerId: string, tailLines = 150) => {
    try {
      return await api.hostContainerLogs(hostId, containerId, tailLines);
    } catch (err: unknown) {
      return `Failed to fetch logs: ${err instanceof Error ? err.message : String(err)}`;
    }
  },

  serviceAction: async (hostId: string, unit: string, action: "start" | "stop" | "restart") => {
    set({ isActionLoading: true, actionError: null });
    try {
      await api.hostServiceAction(hostId, unit, action);
      // Refresh services list after action
      await get().fetchToolboxData(hostId);
      set({ isActionLoading: false });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isActionLoading: false, actionError: msg });
      return false;
    }
  },
}));
