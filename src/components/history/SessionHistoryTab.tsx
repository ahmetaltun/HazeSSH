import { useState } from "react";
import {
  Server,
  Terminal,
  Cpu,
  Globe,
  Play,
  FileText,
  Video,
  Copy,
  Check,
  Trash2,
  Clock,
  History,
  AlertCircle,
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useHostStore } from "@/stores/useHostStore";
import { useHistoryStore } from "@/stores/useHistoryStore";
import type { SessionHistoryEntry, ConnectionType } from "@/types/sessionHistory";

interface SessionHistoryTabProps {
  readonly entries: readonly SessionHistoryEntry[];
  readonly onDeleteEntry: (entry: SessionHistoryEntry) => void;
}

function formatDurationSeconds(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return "--";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function getConnectionIcon(type: ConnectionType) {
  switch (type) {
    case "ssh":
      return <Server className="w-3.5 h-3.5 text-primary" />;
    case "local":
      return <Terminal className="w-3.5 h-3.5 text-info" />;
    case "serial":
      return <Cpu className="w-3.5 h-3.5 text-warning" />;
    case "telnet":
      return <Globe className="w-3.5 h-3.5 text-secondary" />;
  }
}

export function SessionHistoryTab({ entries, onDeleteEntry }: SessionHistoryTabProps) {
  const { openTab } = useMultiplexerStore();
  const { hosts } = useHostStore();
  const { setSelectedLogFile, setSelectedRecordingFile } = useHistoryStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyTarget = async (id: string, target: string) => {
    try {
      await navigator.clipboard.writeText(target);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy target:", err);
    }
  };

  const handleReconnect = (entry: SessionHistoryEntry) => {
    if (entry.host_id) {
      const host = hosts.find((h) => h.id === entry.host_id);
      if (host) {
        if (host.auth_type === "telnet") {
          openTab(
            {
              title: `Telnet: ${host.label}`,
              connectionType: "telnet",
              hostname: host.hostname,
              port: host.port,
              telnetOptions: {
                host: host.hostname,
                port: host.port,
                terminal_type: "xterm-256color",
              },
              status: "connecting",
            },
            `Telnet: ${host.label}`
          );
          return;
        }

        openTab(
          {
            hostId: host.id,
            title: host.label,
            hostname: host.hostname,
            port: host.port,
            username: host.username || undefined,
            status: "connecting",
          },
          host.label
        );
        return;
      }
    }

    if (entry.connection_type === "local") {
      openTab(
        {
          title: "Local Shell",
          connectionType: "local",
          status: "connecting",
        },
        "Local Shell"
      );
      return;
    }

    // Fallback: parse host/port from target string
    openTab(
      {
        title: entry.title,
        connectionType: entry.connection_type,
        status: "connecting",
      },
      entry.title
    );
  };

  if (entries.length === 0) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center select-none">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md select-none">
          <div className="w-12 h-12 rounded-xl bg-base-300 text-base-content/60 flex items-center justify-center">
            <History className="w-6 h-6" />
          </div>
          <div className="select-none">
            <h3 className="text-base font-semibold select-none">No connection history</h3>
            <p className="text-xs text-base-content/60 mt-1 select-none">
              Terminal connections to remote SSH hosts, serial devices, and local shells will be automatically tracked here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 select-none">
      <div className="bg-base-100 rounded-2xl border border-base-300 overflow-hidden shadow-xs select-none">
        <table className="table table-sm w-full select-none">
          <thead className="select-none">
            <tr className="bg-base-200/50 text-[11px] font-semibold text-base-content/70 select-none">
              <th className="w-28 select-none">Status</th>
              <th className="select-none">Session / Host</th>
              <th className="select-none">Target</th>
              <th className="w-40 select-none">Started</th>
              <th className="w-24 select-none">Duration</th>
              <th className="w-32 text-center select-none">Artifacts</th>
              <th className="w-24 text-right select-none">Actions</th>
            </tr>
          </thead>
          <tbody className="select-none">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-base-200/30 transition-colors text-xs select-none">
                {/* Status */}
                <td className="select-none">
                  {entry.status === "connected" ? (
                    <span className="badge badge-xs badge-success gap-1 font-medium py-1 px-2 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      Active
                    </span>
                  ) : entry.status === "error" ? (
                    <span
                      className="badge badge-xs badge-error gap-1 font-medium py-1 px-2 cursor-help select-none"
                      title={entry.error_message || "Connection failed"}
                    >
                      <AlertCircle className="w-2.5 h-2.5" />
                      Failed
                    </span>
                  ) : (
                    <span className="badge badge-xs badge-ghost gap-1 text-base-content/60 font-medium py-1 px-2 select-none">
                      <Clock className="w-2.5 h-2.5" />
                      Closed
                    </span>
                  )}
                </td>

                {/* Session Title & Type */}
                <td className="select-none">
                  <div className="flex items-center gap-2 select-none">
                    <div className="p-1.5 rounded-lg bg-base-200/70 shrink-0">
                      {getConnectionIcon(entry.connection_type)}
                    </div>
                    <div className="min-w-0 select-none">
                      <span className="font-semibold text-base-content block truncate select-none">
                        {entry.title}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-base-content/40 tracking-wider select-none">
                        {entry.connection_type}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Target */}
                <td>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-base-content/80 group">
                    <span className="truncate max-w-[200px] select-text" title={entry.target}>
                      {entry.target}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyTarget(entry.id, entry.target)}
                      className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy target address"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-success" />
                      ) : (
                        <Copy className="w-3 h-3 text-base-content/60" />
                      )}
                    </button>
                  </div>
                </td>

                {/* Started Timestamp */}
                <td className="text-base-content/70 text-[11px]">
                  {new Date(entry.started_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>

                {/* Duration */}
                <td className="font-mono text-[11px] text-base-content/70">
                  {entry.status === "connected" ? (
                    <span className="text-success font-medium">Running</span>
                  ) : (
                    formatDurationSeconds(entry.duration_seconds)
                  )}
                </td>

                {/* Artifacts (Log / Recording) */}
                <td className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {entry.log_file_path && (
                      <button
                        type="button"
                        onClick={() => {
                          const filename = entry.log_file_path!.split(/[\\/]/).pop() || "session.log";
                          setSelectedLogFile({
                            filename,
                            file_path: entry.log_file_path!,
                            size_bytes: 0,
                            created_at: entry.started_at,
                            modified_at: entry.ended_at || entry.started_at,
                          });
                        }}
                        className="badge badge-sm badge-info gap-1 cursor-pointer hover:opacity-80 transition-opacity py-1 px-1.5 text-[10px]"
                        title={`View Audit Log: ${entry.log_file_path}`}
                      >
                        <FileText className="w-2.5 h-2.5" />
                        Log
                      </button>
                    )}

                    {entry.recording_file_path && (
                      <button
                        type="button"
                        onClick={() => {
                          const filename = entry.recording_file_path!.split(/[\\/]/).pop() || "recording.cast";
                          setSelectedRecordingFile({
                            filename,
                            file_path: entry.recording_file_path!,
                            size_bytes: 0,
                            title: entry.title,
                            created_at: entry.started_at,
                            modified_at: entry.ended_at || entry.started_at,
                          });
                        }}
                        className="badge badge-sm badge-error gap-1 cursor-pointer hover:opacity-80 transition-opacity py-1 px-1.5 text-[10px]"
                        title={`Play Recording: ${entry.recording_file_path}`}
                      >
                        <Video className="w-2.5 h-2.5" />
                        Cast
                      </button>
                    )}

                    {!entry.log_file_path && !entry.recording_file_path && (
                      <span className="text-base-content/30 text-[11px]">—</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleReconnect(entry)}
                      className="btn btn-xs btn-outline btn-primary gap-1 text-[11px]"
                      title="Open new terminal connection to this host"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span className="hidden sm:inline">Connect</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry)}
                      className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error hover:bg-error/15"
                      title="Delete from history"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
