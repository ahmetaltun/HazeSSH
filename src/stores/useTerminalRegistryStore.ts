import { create } from "zustand";

export interface TerminalSessionHandle {
  readonly paneId: string;
  readonly sessionId: string;
  readonly hostId?: string;
  readonly hostname?: string;
  readonly username?: string;
  readonly port?: number;
  readonly title: string;
  readonly sendCommand: (command: string) => Promise<void>;
}

interface TerminalRegistryState {
  readonly sessions: ReadonlyMap<string, TerminalSessionHandle>;
  readonly activePaneId: string | null;

  readonly registerSession: (handle: TerminalSessionHandle) => void;
  readonly unregisterSession: (paneId: string) => void;
  readonly setActivePaneId: (paneId: string | null) => void;
  readonly getActiveSession: () => TerminalSessionHandle | null;
  readonly getAllSessions: () => readonly TerminalSessionHandle[];
}

export const useTerminalRegistryStore = create<TerminalRegistryState>((set, get) => ({
  sessions: new Map(),
  activePaneId: null,

  registerSession: (handle) => {
    set((state) => {
      const next = new Map(state.sessions);
      next.set(handle.paneId, handle);
      return {
        sessions: next,
        activePaneId: state.activePaneId ?? handle.paneId,
      };
    });
  },

  unregisterSession: (paneId) => {
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(paneId);
      const remainingKeys = Array.from(next.keys());
      return {
        sessions: next,
        activePaneId:
          state.activePaneId === paneId
            ? remainingKeys.length > 0
              ? remainingKeys[0]
              : null
            : state.activePaneId,
      };
    });
  },

  setActivePaneId: (activePaneId) => set({ activePaneId }),

  getActiveSession: () => {
    const { sessions, activePaneId } = get();
    if (activePaneId && sessions.has(activePaneId)) {
      return sessions.get(activePaneId) ?? null;
    }
    const values = Array.from(sessions.values());
    return values.length > 0 ? values[0] : null;
  },

  getAllSessions: () => {
    return Array.from(get().sessions.values());
  },
}));
