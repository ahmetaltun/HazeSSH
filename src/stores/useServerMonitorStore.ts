import { create } from "zustand";
import { api } from "@/services/api";
import type { ServerMetrics, HostHealthState } from "@/types/monitor";

interface ServerMonitorState {
  readonly healthByHostId: Readonly<Record<string, HostHealthState>>;
  readonly isAutoPolling: boolean;
  readonly pollIntervalSeconds: number;

  readonly fetchMetrics: (hostId: string) => Promise<ServerMetrics | null>;
  readonly fetchAllMetrics: (hostIds: readonly string[]) => Promise<void>;
  readonly setPollInterval: (seconds: number) => void;
  readonly toggleAutoPolling: (getHostIds: () => readonly string[]) => void;
  readonly stopAutoPolling: () => void;
  readonly clearMetrics: (hostId?: string) => void;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

export const useServerMonitorStore = create<ServerMonitorState>((set, get) => ({
  healthByHostId: {},
  isAutoPolling: false,
  pollIntervalSeconds: 30,

  fetchMetrics: async (hostId: string) => {
    // Set loading state for this specific host
    set((state) => ({
      healthByHostId: {
        ...state.healthByHostId,
        [hostId]: {
          ...state.healthByHostId[hostId],
          isLoading: true,
          error: undefined,
        },
      },
    }));

    try {
      const metrics = await api.hostFetchMetrics(hostId);
      set((state) => ({
        healthByHostId: {
          ...state.healthByHostId,
          [hostId]: {
            metrics,
            isLoading: false,
            lastUpdated: Date.now(),
            error: metrics.error ?? undefined,
          },
        },
      }));
      return metrics;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        healthByHostId: {
          ...state.healthByHostId,
          [hostId]: {
            ...state.healthByHostId[hostId],
            isLoading: false,
            lastUpdated: Date.now(),
            error: msg,
          },
        },
      }));
      return null;
    }
  },

  fetchAllMetrics: async (hostIds: readonly string[]) => {
    if (!hostIds.length) return;
    // Query in parallel
    await Promise.allSettled(hostIds.map((id) => get().fetchMetrics(id)));
  },

  setPollInterval: (seconds: number) => {
    set({ pollIntervalSeconds: Math.max(5, seconds) });
  },

  toggleAutoPolling: (getHostIds: () => readonly string[]) => {
    const { isAutoPolling, pollIntervalSeconds, fetchAllMetrics, stopAutoPolling } = get();

    if (isAutoPolling) {
      stopAutoPolling();
    } else {
      // Immediately run once
      const ids = getHostIds();
      void fetchAllMetrics(ids);

      if (pollingTimer) {
        clearInterval(pollingTimer);
      }

      pollingTimer = setInterval(() => {
        const currentIds = getHostIds();
        void get().fetchAllMetrics(currentIds);
      }, pollIntervalSeconds * 1000);

      set({ isAutoPolling: true });
    }
  },

  stopAutoPolling: () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    set({ isAutoPolling: false });
  },

  clearMetrics: (hostId?: string) => {
    if (hostId) {
      set((state) => {
        const updated = { ...state.healthByHostId };
        delete updated[hostId];
        return { healthByHostId: updated };
      });
    } else {
      set({ healthByHostId: {} });
    }
  },
}));
