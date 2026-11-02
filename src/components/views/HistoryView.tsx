import { useEffect, useState, useMemo } from "react";
import {
  History,
  FileText,
  Video,
  Trash2,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { api } from "@/services/api";
import { SessionHistoryTab } from "@/components/history/SessionHistoryTab";
import { AuditLogsTab } from "@/components/history/AuditLogsTab";
import { RecordingsTab } from "@/components/history/RecordingsTab";
import { LogViewerModal } from "@/components/history/LogViewerModal";
import { RecordingPlayerModal } from "@/components/history/RecordingPlayerModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { SearchInput } from "@/components/common/SearchInput";
import type {
  SessionHistoryEntry,
  AuditLogFileInfo,
  RecordingFileInfo,
  ConnectionType,
  SessionStatus,
} from "@/types/sessionHistory";

export function HistoryView() {
  const {
    activeTab,
    searchQuery,
    typeFilter,
    statusFilter,
    historyEntries,
    auditLogs,
    recordings,
    isLoading,
    selectedLogFile,
    selectedRecordingFile,
    setActiveTab,
    setSearchQuery,
    setTypeFilter,
    setStatusFilter,
    setSelectedLogFile,
    setSelectedRecordingFile,
    fetchAll,
    deleteHistory,
    clearAllHistory,
    deleteLog,
    clearAllLogs,
    deleteRecording,
    clearAllRecordings,
  } = useHistoryStore();

  const [paths, setPaths] = useState<{ logsDir: string; recordingsDir: string } | null>(null);

  // Confirm modal states
  const [confirmClearType, setConfirmClearType] = useState<"history" | "logs" | "recordings" | null>(null);
  const [itemToDelete, setItemToDelete] = useState<
    | { type: "history"; item: SessionHistoryEntry }
    | { type: "log"; item: AuditLogFileInfo }
    | { type: "recording"; item: RecordingFileInfo }
    | null
  >(null);

  useEffect(() => {
    fetchAll();
    api.auditLogGetPaths().then(setPaths).catch(() => {});
  }, [fetchAll]);

  // Filtered session history
  const filteredHistory = useMemo(() => {
    return historyEntries.filter((entry) => {
      if (typeFilter !== "all" && entry.connection_type !== typeFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.target.toLowerCase().includes(q) ||
        entry.connection_type.toLowerCase().includes(q)
      );
    });
  }, [historyEntries, searchQuery, typeFilter, statusFilter]);

  // Filtered audit logs
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return auditLogs;
    const q = searchQuery.toLowerCase();
    return auditLogs.filter((log) => log.filename.toLowerCase().includes(q));
  }, [auditLogs, searchQuery]);

  // Filtered recordings
  const filteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return recordings;
    const q = searchQuery.toLowerCase();
    return recordings.filter(
      (rec) =>
        rec.filename.toLowerCase().includes(q) ||
        (rec.title && rec.title.toLowerCase().includes(q))
    );
  }, [recordings, searchQuery]);

  const handleOpenFolder = () => {
    if (activeTab === "recordings") {
      void api.openDirectoryInOs(paths?.recordingsDir);
    } else {
      void api.openDirectoryInOs(paths?.logsDir);
    }
  };

  const handleConfirmClear = async () => {
    if (confirmClearType === "history") {
      await clearAllHistory();
    } else if (confirmClearType === "logs") {
      await clearAllLogs();
    } else if (confirmClearType === "recordings") {
      await clearAllRecordings();
    }
    setConfirmClearType(null);
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === "history") {
      await deleteHistory(itemToDelete.item.id);
    } else if (itemToDelete.type === "log") {
      await deleteLog(itemToDelete.item.file_path);
    } else if (itemToDelete.type === "recording") {
      await deleteRecording(itemToDelete.item.file_path);
    }
    setItemToDelete(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30 select-none">
        <div className="flex items-center gap-4 select-none">
          <div className="select-none">
            <h2 className="text-base font-bold text-base-content flex items-center gap-2 select-none">
              <History className="w-4 h-4 text-primary" />
              <span>Session History & Logs</span>
            </h2>
            <p className="text-xs text-base-content/60 select-none">
              Recorded terminal sessions, connection audit trail, and asciinema playback
            </p>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchAll()}
            className="btn btn-sm btn-ghost gap-1.5 border border-base-300"
            title="Refresh session history and logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleOpenFolder}
            className="btn btn-sm btn-ghost gap-1.5 border border-base-300"
            title={activeTab === "recordings" ? "Open recordings folder in OS" : "Open logs folder in OS"}
          >
            <FolderOpen className="w-3.5 h-3.5 text-info" />
            <span className="hidden sm:inline">
              {activeTab === "recordings" ? "Recordings Folder" : "Logs Folder"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === "sessions") setConfirmClearType("history");
              else if (activeTab === "logs") setConfirmClearType("logs");
              else setConfirmClearType("recordings");
            }}
            disabled={
              (activeTab === "sessions" && historyEntries.length === 0) ||
              (activeTab === "logs" && auditLogs.length === 0) ||
              (activeTab === "recordings" && recordings.length === 0)
            }
            className="btn btn-sm btn-ghost text-error gap-1.5 border border-base-300 hover:bg-error/15"
            title="Clear all entries for the active tab"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {activeTab === "sessions"
                ? "Clear History"
                : activeTab === "logs"
                ? "Clear Logs"
                : "Clear Recordings"}
            </span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-b border-base-200 px-6 flex flex-wrap items-center justify-between gap-3 bg-base-100 shrink-0 select-none">
        <div className="tabs tabs-border select-none">
          <button
            type="button"
            onClick={() => setActiveTab("sessions")}
            className={`tab gap-2 font-medium text-xs py-3 ${
              activeTab === "sessions" ? "tab-active text-primary border-primary" : ""
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Connection History</span>
            <span className="badge badge-sm badge-ghost font-mono text-[10px]">
              {historyEntries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`tab gap-2 font-medium text-xs py-3 ${
              activeTab === "logs" ? "tab-active text-info border-info" : ""
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
            <span className="badge badge-sm badge-ghost font-mono text-[10px]">
              {auditLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("recordings")}
            className={`tab gap-2 font-medium text-xs py-3 ${
              activeTab === "recordings" ? "tab-active text-error border-error" : ""
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Terminal Recordings</span>
            <span className="badge badge-sm badge-ghost font-mono text-[10px]">
              {recordings.length}
            </span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2 py-2">
          <SearchInput
            inputSize="xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            placeholder={
              activeTab === "sessions"
                ? "Search connections..."
                : activeTab === "logs"
                ? "Search logs..."
                : "Search recordings..."
            }
            className="w-48 sm:w-64"
          />

          {activeTab === "sessions" && (
            <>
              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as ConnectionType | "all")}
                className="select select-xs select-bordered text-xs rounded-lg"
              >
                <option value="all">All Protocols</option>
                <option value="ssh">SSH</option>
                <option value="local">Local Shell</option>
                <option value="serial">Serial</option>
                <option value="telnet">Telnet</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SessionStatus | "all")}
                className="select select-xs select-bordered text-xs rounded-lg"
              >
                <option value="all">All Statuses</option>
                <option value="connected">Active</option>
                <option value="disconnected">Closed</option>
                <option value="error">Failed</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === "sessions" && (
          <SessionHistoryTab
            entries={filteredHistory}
            onDeleteEntry={(item) => setItemToDelete({ type: "history", item })}
          />
        )}

        {activeTab === "logs" && (
          <AuditLogsTab
            logs={filteredLogs}
            onViewLog={(log) => setSelectedLogFile(log)}
            onDeleteLog={(item) => setItemToDelete({ type: "log", item })}
          />
        )}

        {activeTab === "recordings" && (
          <RecordingsTab
            recordings={filteredRecordings}
            onPlayRecording={(rec) => setSelectedRecordingFile(rec)}
            onDeleteRecording={(item) => setItemToDelete({ type: "recording", item })}
          />
        )}
      </div>

      {/* Modals */}
      <LogViewerModal
        logFile={selectedLogFile}
        onClose={() => setSelectedLogFile(null)}
      />

      <RecordingPlayerModal
        recordingFile={selectedRecordingFile}
        onClose={() => setSelectedRecordingFile(null)}
      />

      {/* Confirm Clear All Modal */}
      <ConfirmModal
        isOpen={confirmClearType !== null}
        title={
          confirmClearType === "history"
            ? "Clear Connection History"
            : confirmClearType === "logs"
            ? "Clear All Audit Logs"
            : "Clear All Terminal Recordings"
        }
        message={
          confirmClearType === "history"
            ? "Are you sure you want to clear all connection history records? This cannot be undone."
            : confirmClearType === "logs"
            ? "Are you sure you want to permanently delete all session audit log files in ~/.haze/logs/? This cannot be undone."
            : "Are you sure you want to permanently delete all asciinema (.cast) recordings in ~/.haze/recordings/? This cannot be undone."
        }
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClearType(null)}
      />

      {/* Confirm Delete Single Item Modal */}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        title={
          itemToDelete?.type === "history"
            ? "Delete Connection History Entry"
            : itemToDelete?.type === "log"
            ? "Delete Audit Log File"
            : "Delete Recording File"
        }
        message={
          itemToDelete?.type === "history" ? (
            <p>
              Are you sure you want to remove{" "}
              <strong className="text-base-content">{itemToDelete.item.title}</strong> from connection history?
            </p>
          ) : itemToDelete?.type === "log" ? (
            <p>
              Are you sure you want to permanently delete the audit log{" "}
              <strong className="text-base-content font-mono text-xs">{itemToDelete.item.filename}</strong>?
            </p>
          ) : (
            <p>
              Are you sure you want to permanently delete the recording{" "}
              <strong className="text-base-content font-mono text-xs">
                {itemToDelete?.item.filename}
              </strong>
              ?
            </p>
          )
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
