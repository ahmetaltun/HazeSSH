import { create } from "zustand";
import { api } from "@/services/api";
import type {
  SessionHistoryEntry,
  AuditLogFileInfo,
  RecordingFileInfo,
  ConnectionType,
  SessionStatus,
} from "@/types/sessionHistory";

export type HistoryTab = "sessions" | "logs" | "recordings";
export type TypeFilter = "all" | ConnectionType;
export type StatusFilter = "all" | SessionStatus;

interface HistoryState {
  readonly activeTab: HistoryTab;
  readonly searchQuery: string;
  readonly typeFilter: TypeFilter;
  readonly statusFilter: StatusFilter;
  readonly historyEntries: readonly SessionHistoryEntry[];
  readonly auditLogs: readonly AuditLogFileInfo[];
  readonly recordings: readonly RecordingFileInfo[];
  readonly isLoading: boolean;
  readonly error: string | null;

  // Selected modals
  readonly selectedLogFile: AuditLogFileInfo | null;
  readonly selectedRecordingFile: RecordingFileInfo | null;

  // Setters
  readonly setActiveTab: (tab: HistoryTab) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setTypeFilter: (filter: TypeFilter) => void;
  readonly setStatusFilter: (filter: StatusFilter) => void;
  readonly setSelectedLogFile: (log: AuditLogFileInfo | null) => void;
  readonly setSelectedRecordingFile: (rec: RecordingFileInfo | null) => void;

  // Fetch actions
  readonly fetchHistory: () => Promise<void>;
  readonly fetchLogs: () => Promise<void>;
  readonly fetchRecordings: () => Promise<void>;
  readonly fetchAll: () => Promise<void>;

  // Mutation actions
  readonly deleteHistory: (id: string) => Promise<void>;
  readonly clearAllHistory: () => Promise<void>;
  readonly deleteLog: (filePath: string) => Promise<void>;
  readonly clearAllLogs: () => Promise<void>;
  readonly deleteRecording: (filePath: string) => Promise<void>;
  readonly clearAllRecordings: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  activeTab: "sessions",
  searchQuery: "",
  typeFilter: "all",
  statusFilter: "all",
  historyEntries: [],
  auditLogs: [],
  recordings: [],
  isLoading: false,
  error: null,
  selectedLogFile: null,
  selectedRecordingFile: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setTypeFilter: (filter) => set({ typeFilter: filter }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setSelectedLogFile: (log) => set({ selectedLogFile: log }),
  setSelectedRecordingFile: (rec) => set({ selectedRecordingFile: rec }),

  fetchHistory: async () => {
    try {
      const historyEntries = await api.sessionHistoryList(300);
      set({ historyEntries, error: null });
    } catch (err) {
      console.error("Failed to load session history:", err);
      set({ error: String(err) });
    }
  },

  fetchLogs: async () => {
    try {
      const auditLogs = await api.auditLogList();
      set({ auditLogs, error: null });
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      set({ error: String(err) });
    }
  },

  fetchRecordings: async () => {
    try {
      const recordings = await api.sessionRecordingList();
      set({ recordings, error: null });
    } catch (err) {
      console.error("Failed to load recordings:", err);
      set({ error: String(err) });
    }
  },

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [historyEntries, auditLogs, recordings] = await Promise.all([
        api.sessionHistoryList(300),
        api.auditLogList(),
        api.sessionRecordingList(),
      ]);
      set({ historyEntries, auditLogs, recordings, isLoading: false });
    } catch (err) {
      console.error("Failed to fetch history data:", err);
      set({ error: String(err), isLoading: false });
    }
  },

  deleteHistory: async (id: string) => {
    try {
      await api.sessionHistoryDelete(id);
      set((state) => ({
        historyEntries: state.historyEntries.filter((e) => e.id !== id),
      }));
    } catch (err) {
      console.error("Failed to delete session history entry:", err);
    }
  },

  clearAllHistory: async () => {
    try {
      await api.sessionHistoryClear();
      set({ historyEntries: [] });
    } catch (err) {
      console.error("Failed to clear session history:", err);
    }
  },

  deleteLog: async (filePath: string) => {
    try {
      await api.auditLogDelete(filePath);
      set((state) => ({
        auditLogs: state.auditLogs.filter((l) => l.file_path !== filePath),
      }));
    } catch (err) {
      console.error("Failed to delete audit log:", err);
    }
  },

  clearAllLogs: async () => {
    try {
      await api.auditLogClearAll();
      set({ auditLogs: [] });
    } catch (err) {
      console.error("Failed to clear all audit logs:", err);
    }
  },

  deleteRecording: async (filePath: string) => {
    try {
      await api.sessionRecordingDelete(filePath);
      set((state) => ({
        recordings: state.recordings.filter((r) => r.file_path !== filePath),
      }));
    } catch (err) {
      console.error("Failed to delete recording:", err);
    }
  },

  clearAllRecordings: async () => {
    try {
      await api.sessionRecordingClearAll();
      set({ recordings: [] });
    } catch (err) {
      console.error("Failed to clear all recordings:", err);
    }
  },
}));
