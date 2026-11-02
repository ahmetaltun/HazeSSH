import { create } from "zustand";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { api } from "@/services/api";

export interface PaneRecordingState {
  readonly isRecording: boolean;
  readonly elapsedSeconds: number;
  readonly eventCount: number;
}

interface RecordingStoreState {
  readonly recordings: Readonly<Record<string, PaneRecordingState>>;

  readonly startRecording: (paneId: string, title?: string) => void;
  readonly stopRecording: (paneId: string) => string | null;
  readonly saveRecording: (
    paneId: string,
    defaultFilename?: string
  ) => Promise<{ savedPath?: string; cancelled?: boolean; error?: string }>;
  readonly exportRecordingDialog: (
    paneId: string,
    defaultFilename?: string
  ) => Promise<{ savedPath?: string; cancelled?: boolean; error?: string }>;
  readonly updateStats: (paneId: string, elapsedSeconds: number, eventCount: number) => void;
  readonly isPaneRecording: (paneId: string) => boolean;
  readonly getPaneRecording: (paneId: string) => PaneRecordingState | undefined;
}

const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

export const useRecordingStore = create<RecordingStoreState>((set, get) => ({
  recordings: {},

  isPaneRecording: (paneId: string): boolean => {
    return Boolean(get().recordings[paneId]?.isRecording);
  },

  getPaneRecording: (paneId: string): PaneRecordingState | undefined => {
    return get().recordings[paneId];
  },

  updateStats: (paneId: string, elapsedSeconds: number, eventCount: number) => {
    set((state) => ({
      recordings: {
        ...state.recordings,
        [paneId]: {
          isRecording: true,
          elapsedSeconds,
          eventCount,
        },
      },
    }));
  },

  startRecording: (paneId: string, title?: string) => {
    const session = terminalSessionManager.getSession(paneId);
    if (!session) {
      console.warn(`[RecordingStore] Cannot start recording: pane ${paneId} session not found.`);
      return;
    }

    const cols = session.term.cols || 80;
    const rows = session.term.rows || 24;
    const sessionTitle = title || session.pane.title || "Terminal Session";

    // Snapshot existing terminal buffer so playback does not start with a blank screen
    let initialScreen = "";
    try {
      const buffer = session.term.buffer.active;
      const lines: string[] = [];
      const startRow = Math.max(0, buffer.baseY);
      const endRow = Math.min(buffer.length, buffer.baseY + session.term.rows);
      for (let y = startRow; y < endRow; y++) {
        const line = buffer.getLine(y);
        if (line) {
          lines.push(line.translateToString(true));
        }
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }
      if (lines.length > 0) {
        initialScreen = lines.join("\r\n") + "\r\n";
      }
    } catch {
      // Ignore buffer snapshot error
    }

    session.recorder.start(cols, rows, sessionTitle, initialScreen);

    set((state) => ({
      recordings: {
        ...state.recordings,
        [paneId]: {
          isRecording: true,
          elapsedSeconds: 0,
          eventCount: 0,
        },
      },
    }));

    // Clear any previous interval
    const existingTimer = activeTimers.get(paneId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Update elapsed seconds every 1000ms
    const timer = setInterval(() => {
      const activeSession = terminalSessionManager.getSession(paneId);
      if (!activeSession || !activeSession.recorder.isRecording()) {
        clearInterval(timer);
        activeTimers.delete(paneId);
        return;
      }
      const elapsed = Math.floor(activeSession.recorder.getDuration());
      const count = activeSession.recorder.getEventCount();
      get().updateStats(paneId, elapsed, count);
    }, 1000);

    activeTimers.set(paneId, timer);
  },

  stopRecording: (paneId: string): string | null => {
    const timer = activeTimers.get(paneId);
    if (timer) {
      clearInterval(timer);
      activeTimers.delete(paneId);
    }

    set((state) => {
      const copy = { ...state.recordings };
      delete copy[paneId];
      return { recordings: copy };
    });

    const session = terminalSessionManager.getSession(paneId);
    if (!session) return null;
    return session.recorder.stop();
  },

  saveRecording: async (paneId: string, defaultFilename?: string) => {
    const session = terminalSessionManager.getSession(paneId);
    const title = (defaultFilename || session?.pane.title || "session").replace(/[^a-zA-Z0-9_-]/g, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${title}_${timestamp}.cast`;

    const castContent = get().stopRecording(paneId);
    if (!castContent) {
      return { error: "No recorded content available to save." };
    }

    try {
      const savedPath = await api.sessionSaveRecording(filename, castContent);
      if (session?.historyId) {
        session.recordingFilePath = savedPath;
        void api
          .sessionHistoryUpdate({
            id: session.historyId,
            recording_file_path: savedPath,
          })
          .catch(() => {});
      }
      return { savedPath };
    } catch (err) {
      return { error: String(err) };
    }
  },

  exportRecordingDialog: async (paneId: string, defaultFilename?: string) => {
    const session = terminalSessionManager.getSession(paneId);
    const title = (defaultFilename || session?.pane.title || "session").replace(/[^a-zA-Z0-9_-]/g, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${title}_${timestamp}.cast`;

    const castContent = get().stopRecording(paneId);
    if (!castContent) {
      return { error: "No recorded content available to save." };
    }

    try {
      const savedPath = await api.sessionSaveRecordingDialog(filename, castContent);
      if (!savedPath) {
        return { cancelled: true };
      }
      return { savedPath };
    } catch (err) {
      return { error: String(err) };
    }
  },
}));
