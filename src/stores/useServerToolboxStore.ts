import { create } from "zustand";
import { api } from "@/services/api";
import { useVaultStore } from "@/stores/useVaultStore";
import type { HostToolboxState, ServerToolboxOverview } from "@/types/toolbox";

export type ToolboxTab = "containers" | "services" | "ports" | "processes" | "storage";

interface ServerToolboxStore {
  readonly activeHostId: string | null;
  readonly isOpen: boolean;
  readonly activeTab: ToolboxTab;
  readonly dataByHostId: Readonly<Record<string, HostToolboxState>>;
  readonly isActionLoading: boolean;
  readonly actionError: string | null;

  readonly openToolbox: (hostId: string, initialTab?: ToolboxTab) => void;
  readonly closeToolbox: () => void;
  readonly setActiveTab: (tab: ToolboxTab) => void;
  readonly fetchToolboxData: (hostId: string) => Promise<ServerToolboxOverview | null>;
  readonly fetchToolboxTelemetry: (hostId: string) => Promise<void>;
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
    action: "start" | "stop" | "restart" | "kill"
  ) => Promise<boolean>;
  readonly serviceLogs: (
    hostId: string,
    unit: string,
    tailLines?: number
  ) => Promise<string>;
  readonly killProcess: (
    hostId: string,
    pid: number
  ) => Promise<boolean>;
  readonly dockerPrune: (
    hostId: string
  ) => Promise<string>;
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
            isTelemetryLoading: overview.docker_installed,
            lastUpdated: Date.now(),
            error: overview.error,
          },
        },
      }));

      // If Docker is installed, asynchronously load heavy telemetry in background without blocking UI
      if (overview.docker_installed) {
        void get().fetchToolboxTelemetry(hostId);
      }

      return overview;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        dataByHostId: {
          ...state.dataByHostId,
          [hostId]: {
            ...state.dataByHostId[hostId],
            isLoading: false,
            isTelemetryLoading: false,
            lastUpdated: Date.now(),
            error: msg,
          },
        },
      }));
      return null;
    }
  },

  fetchToolboxTelemetry: async (hostId: string) => {
    try {
      const telemetry = await api.hostFetchToolboxTelemetry(hostId);
      set((state) => {
        const current = state.dataByHostId[hostId];
        if (!current?.overview) return state;

        // Merge container live stats (CPU% and RAM)
        const updatedContainers = current.overview.containers.map((c) => {
          const shortId = c.id.slice(0, 12);
          const stat = telemetry.container_stats[shortId];
          if (stat) {
            return {
              ...c,
              cpu_percent: stat.cpu_percent,
              memory_usage: stat.memory_usage,
              memory_percent: stat.memory_percent,
            };
          }
          return c;
        });

        return {
          dataByHostId: {
            ...state.dataByHostId,
            [hostId]: {
              ...current,
              isTelemetryLoading: false,
              overview: {
                ...current.overview,
                containers: updatedContainers,
                docker_disk_usage: telemetry.docker_disk_usage ?? current.overview.docker_disk_usage,
              },
            },
          },
        };
      });
    } catch {
      set((state) => ({
        dataByHostId: {
          ...state.dataByHostId,
          [hostId]: {
            ...state.dataByHostId[hostId],
            isTelemetryLoading: false,
          },
        },
      }));
    }
  },

  containerAction: async (hostId: string, containerId: string, action: "start" | "stop" | "restart") => {
    set({ isActionLoading: true, actionError: null });
    try {
      await api.hostContainerAction(hostId, containerId, action);
      // Allow container daemon to transition state before re-probing
      await new Promise((resolve) => setTimeout(resolve, 300));
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
      return `Failed to fetch container logs: ${err instanceof Error ? err.message : String(err)}`;
    }
  },

  serviceAction: async (hostId: string, unit: string, action: "start" | "stop" | "restart" | "kill") => {
    set({ isActionLoading: true, actionError: null });
    try {
      await api.hostServiceAction(hostId, unit, action);
      // Allow systemd to update unit status in memory before re-querying list-units
      await new Promise((resolve) => setTimeout(resolve, 250));
      await get().fetchToolboxData(hostId);
      set({ isActionLoading: false });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isActionLoading: false, actionError: msg });
      return false;
    }
  },

  serviceLogs: async (hostId: string, unit: string, tailLines = 150) => {
    try {
      return await api.hostServiceLogs(hostId, unit, tailLines);
    } catch (err: unknown) {
      return `Failed to fetch service logs: ${err instanceof Error ? err.message : String(err)}`;
    }
  },

  killProcess: async (hostId: string, pid: number) => {
    set({ isActionLoading: true, actionError: null });
    try {
      await api.hostKillProcess(hostId, pid);
      // Allow the Linux kernel procfs to reap the killed process before querying ps
      await new Promise((resolve) => setTimeout(resolve, 250));
      await get().fetchToolboxData(hostId);
      set({ isActionLoading: false });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isActionLoading: false, actionError: msg });
      return false;
    }
  },

  dockerPrune: async (hostId: string) => {
    set({ isActionLoading: true, actionError: null });
    try {
      const res = await api.hostDockerPrune(hostId);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await get().fetchToolboxData(hostId);
      set({ isActionLoading: false });
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isActionLoading: false, actionError: msg });
      return `Prune failed: ${msg}`;
    }
  },
}));
