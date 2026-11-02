import {
  Video,
  Play,
  FolderOpen,
  Trash2,
  HardDrive,
  Monitor,
} from "lucide-react";
import { api } from "@/services/api";
import type { RecordingFileInfo } from "@/types/sessionHistory";

interface RecordingsTabProps {
  readonly recordings: readonly RecordingFileInfo[];
  readonly onPlayRecording: (recording: RecordingFileInfo) => void;
  readonly onDeleteRecording: (recording: RecordingFileInfo) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function RecordingsTab({
  recordings,
  onPlayRecording,
  onDeleteRecording,
}: RecordingsTabProps) {
  if (recordings.length === 0) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center select-none">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md select-none">
          <div className="w-12 h-12 rounded-xl bg-error/15 text-error flex items-center justify-center select-none">
            <Video className="w-6 h-6" />
          </div>
          <div className="select-none">
            <h3 className="text-base font-semibold select-none">No recordings found</h3>
            <p className="text-xs text-base-content/60 mt-1 leading-relaxed select-none">
              Record interactive terminal sessions into standardized asciinema (.cast) recordings by clicking the red REC circle in any terminal pane header.
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
              <th className="select-none">Recording</th>
              <th className="w-28 select-none">Resolution</th>
              <th className="w-28 select-none">File Size</th>
              <th className="w-44 select-none">Date</th>
              <th className="w-32 text-right select-none">Actions</th>
            </tr>
          </thead>
          <tbody className="select-none">
            {recordings.map((rec) => (
              <tr key={rec.file_path} className="hover:bg-base-200/30 transition-colors text-xs">
                {/* Filename & Title */}
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-error/10 text-error shrink-0">
                      <Video className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-base-content block truncate text-xs">
                        {rec.title || rec.filename}
                      </span>
                      <span
                        className="text-[10px] font-mono text-base-content/40 block truncate max-w-md"
                        title={rec.file_path}
                      >
                        {rec.filename}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Dimensions */}
                <td>
                  {rec.width && rec.height ? (
                    <span className="badge badge-sm badge-ghost font-mono text-[10px]">
                      <Monitor className="w-2.5 h-2.5 mr-1 text-base-content/50" />
                      {rec.width}x{rec.height}
                    </span>
                  ) : (
                    <span className="text-base-content/30 text-[11px]">—</span>
                  )}
                </td>

                {/* Size */}
                <td className="font-mono text-[11px] text-base-content/70">
                  <span className="badge badge-sm badge-ghost font-normal">
                    <HardDrive className="w-2.5 h-2.5 mr-1 text-base-content/50" />
                    {formatBytes(rec.size_bytes)}
                  </span>
                </td>

                {/* Date */}
                <td className="text-base-content/70 text-[11px]">
                  {new Date(rec.modified_at).toLocaleString(undefined, {
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
                      onClick={() => onPlayRecording(rec)}
                      className="btn btn-xs btn-primary gap-1"
                      title="Play asciinema recording"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => api.openDirectoryInOs(rec.file_path)}
                      className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
                      title="Reveal in Finder / File Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteRecording(rec)}
                      className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error hover:bg-error/15"
                      title="Delete recording file"
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
