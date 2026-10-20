import { create } from "zustand";
import { api } from "@/services/api";
import type { Tunnel, CreateTunnelInput, TunnelRuntimeStatus } from "@/types/tunnel";
import { useLayoutStore } from "@/stores/useLayoutStore";

interface TunnelState {
  readonly tunnels: readonly Tunnel[];
  readonly statuses: Record<string, TunnelRuntimeStatus>;
  readonly isLoading: boolean;
  readonly error: string | null;

  readonly fetchTunnels: () => Promise<void>;
  readonly fetchStatuses: () => Promise<void>;
  readonly createTunnel: (input: CreateTunnelInput) => Promise<Tunnel>;
  readonly deleteTunnel: (id: string) => Promise<void>;
  readonly startTunnel: (id: string) => Promise<void>;
  readonly stopTunnel: (id: string) => Promise<void>;
}

export const useTunnelStore = create<TunnelState>((set, get) => ({
  tunnels: [],
  statuses: {},
  isLoading: false,
  error: null,

  fetchTunnels: async () => {
    set({ isLoading: true, error: null });
    try {
      const tunnels = await api.tunnelList();
      set({ tunnels, isLoading: false });
      // Fetch statuses right after loading tunnels
      await get().fetchStatuses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
    }
  },

  fetchStatuses: async () => {
    try {
      const statusList = await api.tunnelGetStatuses();
      const statusMap: Record<string, TunnelRuntimeStatus> = {};
      let activeCount = 0;

      for (const st of statusList) {
        statusMap[st.tunnel_id] = st;
        if (st.status === "running") {
          activeCount++;
        }
      }

      set({ statuses: statusMap });
      useLayoutStore.getState().updateCounters({ activeTunnels: activeCount });
    } catch (err: unknown) {
      console.error("Failed to fetch tunnel statuses:", err);
    }
  },

  createTunnel: async (input: CreateTunnelInput) => {
    set({ isLoading: true, error: null });
    try {
      const created = await api.tunnelCreate(input);
      set((state) => ({
        tunnels: [...state.tunnels, created],
        isLoading: false,
      }));
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  deleteTunnel: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      // If running, stop first
      if (get().statuses[id]?.status === "running") {
        try {
          await api.tunnelStop(id);
        } catch {
          // ignore error if stop fails
        }
      }

      await api.tunnelDelete(id);
      set((state) => {
        const nextStatuses = { ...state.statuses };
        delete nextStatuses[id];
        return {
          tunnels: state.tunnels.filter((t) => t.id !== id),
          statuses: nextStatuses,
          isLoading: false,
        };
      });
      await get().fetchStatuses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  startTunnel: async (id: string) => {
    // Optimistically set to starting
    set((state) => ({
      statuses: {
        ...state.statuses,
        [id]: {
          tunnel_id: id,
          status: "starting",
          bytes_in: 0,
          bytes_out: 0,
          active_connections: 0,
          error_message: null,
        },
      },
    }));

    try {
      await api.tunnelStart(id);
      await get().fetchStatuses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        statuses: {
          ...state.statuses,
          [id]: {
            tunnel_id: id,
            status: "error",
            bytes_in: 0,
            bytes_out: 0,
            active_connections: 0,
            error_message: msg,
          },
        },
      }));
      throw new Error(msg);
    }
  },

  stopTunnel: async (id: string) => {
    try {
      await api.tunnelStop(id);
      await get().fetchStatuses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        statuses: {
          ...state.statuses,
          [id]: {
            ...state.statuses[id],
            status: "stopped",
            error_message: msg,
          },
        },
      }));
      throw new Error(msg);
    }
  },
}));
