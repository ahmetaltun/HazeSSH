import {
  FileText,
  FolderOpen,
  Eye,
  Trash2,
  HardDrive,
  Settings,
} from "lucide-react";
import { api } from "@/services/api";
import { useLayoutStore } from "@/stores/useLayoutStore";
import type { AuditLogFileInfo } from "@/types/sessionHistory";

interface AuditLogsTabProps {
  readonly logs: readonly AuditLogFileInfo[];
  readonly onViewLog: (log: AuditLogFileInfo) => void;
  readonly onDeleteLog: (log: AuditLogFileInfo) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function AuditLogsTab({ logs, onViewLog, onDeleteLog }: AuditLogsTabProps) {
  const { setView } = useLayoutStore();

  if (logs.length === 0) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center select-none">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md select-none">
          <div className="w-12 h-12 rounded-xl bg-info/10 text-info flex items-center justify-center select-none">
            <FileText className="w-6 h-6" />
          </div>
          <div className="select-none">
            <h3 className="text-base font-semibold select-none">No audit logs found</h3>
            <p className="text-xs text-base-content/60 mt-1 leading-relaxed select-none">
              Session audit logging records terminal session output to disk for audit compliance. Enable it globally in Settings or per-host in Host settings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("settings")}
            className="btn btn-sm btn-outline gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Open Audit Settings</span>
          </button>
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
              <th className="select-none">Log File</th>
              <th className="w-28 select-none">File Size</th>
              <th className="w-44 select-none">Last Modified</th>
              <th className="w-32 text-right select-none">Actions</th>
            </tr>
          </thead>
          <tbody className="select-none">
            {logs.map((log) => (
              <tr key={log.file_path} className="hover:bg-base-200/30 transition-colors text-xs">
                {/* Filename & Path */}
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-info/10 text-info shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-base-content block truncate font-mono text-xs">
                        {log.filename}
                      </span>
                      <span
                        className="text-[10px] text-base-content/40 block truncate max-w-md"
                        title={log.file_path}
                      >
                        {log.file_path}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Size */}
                <td className="font-mono text-[11px] text-base-content/70">
                  <span className="badge badge-sm badge-ghost font-normal">
                    <HardDrive className="w-2.5 h-2.5 mr-1 text-base-content/50" />
                    {formatBytes(log.size_bytes)}
                  </span>
                </td>

                {/* Modified */}
                <td className="text-base-content/70 text-[11px]">
                  {new Date(log.modified_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>

                {/* Actions */}
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onViewLog(log)}
                      className="btn btn-xs btn-primary gap-1"
                      title="Inspect log content"
                    >
                      <Eye className="w-3 h-3" />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => api.openDirectoryInOs(log.file_path)}
                      className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
                      title="Reveal in Finder / File Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteLog(log)}
                      className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error hover:bg-error/15"
                      title="Delete log file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
