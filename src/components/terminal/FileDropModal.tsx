import { useState } from "react";
import { UploadCloud, FileText, Check, AlertCircle, ArrowRight, Loader2, X } from "lucide-react";
import { api } from "@/services/api";
import type { TerminalPane } from "@/types/terminal";

export interface DroppedFileInfo {
  readonly name: string;
  readonly path: string;
  readonly size?: number;
}

interface FileDropModalProps {
  readonly isOpen: boolean;
  readonly file: DroppedFileInfo | null;
  readonly pane: TerminalPane;
  readonly onClose: () => void;
  readonly onPastePath: (path: string) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "Unknown size";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FileDropModal({
  isOpen,
  file,
  pane,
  onClose,
  onPastePath,
}: FileDropModalProps) {
  const [remoteDir, setRemoteDir] = useState("/tmp");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  if (!isOpen || !file) return null;

  const sanitizedRemotePath = `${remoteDir.replace(/\/+$/, "")}/${file.name}`;

  const handleUpload = async () => {
    if (!pane.hostId) {
      setUploadError("This session does not have an associated SSH host ID.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      await api.sftpUploadFile(pane.hostId, file.path, sanitizedRemotePath);
      setUploadSuccess(true);
      setTimeout(() => {
        // Automatically paste remote path into terminal on success
        onPastePath(sanitizedRemotePath);
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(`SFTP upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasteLocalPath = () => {
    // Escaped local path (wrap in quotes if spaces present)
    const escaped = file.path.includes(" ") ? `"${file.path}"` : file.path;
    onPastePath(escaped);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="bg-base-200 border border-base-300 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-300 bg-base-100/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">File Dropped on Terminal</h3>
              <p className="text-[11px] text-base-content/60 mt-0.5">
                Target: {pane.hostname || pane.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* File Card */}
          <div className="p-3 rounded-xl bg-base-100 border border-base-300 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate text-base-content">{file.name}</div>
              <div className="text-[11px] text-base-content/50 truncate font-mono mt-0.5">
                {formatBytes(file.size)} • {file.path}
              </div>
            </div>
          </div>

          {/* Remote Destination Directory */}
          <div className="space-y-1.5">
            <label className="font-semibold text-base-content/80 flex items-center justify-between">
              <span>Remote Upload Directory</span>
              <span className="text-[10px] text-base-content/50 font-mono">SFTP Subsystem</span>
            </label>
            <input
              type="text"
              value={remoteDir}
              onChange={(e) => setRemoteDir(e.target.value)}
              disabled={isUploading || uploadSuccess}
              placeholder="/tmp"
              className="input input-sm input-bordered w-full font-mono text-xs"
            />
            <div className="text-[11px] text-base-content/50 truncate">
              Will upload to: <span className="font-mono text-primary">{sanitizedRemotePath}</span>
            </div>
          </div>

          {/* Status Alerts */}
          {uploadError && (
            <div className="alert alert-error text-xs p-3 rounded-xl gap-2 flex items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="alert alert-success text-xs p-3 rounded-xl gap-2 flex items-center">
              <Check className="w-4 h-4 shrink-0" />
              <span>Uploaded successfully! Pasting remote path into terminal...</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-base-300 bg-base-100/50 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePasteLocalPath}
            disabled={isUploading || uploadSuccess}
            className="btn btn-ghost btn-xs text-base-content/70 hover:text-base-content"
            title="Paste local filesystem path directly into terminal"
          >
            Paste Local Path
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || uploadSuccess || !remoteDir.trim()}
              className="btn btn-primary btn-sm gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : uploadSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <span>Upload via SFTP</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
