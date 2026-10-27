import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, AlertCircle, X, Ban } from "lucide-react";
import { useTransferStore } from "@/stores/useTransferStore";
import { terminalSessionManager } from "@/services/terminalSessionManager";

interface TransferProgressOverlayProps {
  readonly paneId: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(1)} ${units[idx]}`;
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function TransferProgressOverlay({ paneId }: TransferProgressOverlayProps) {
  const transfer = useTransferStore((state) => state.transfers[paneId]);
  const clearTransfer = useTransferStore((state) => state.clearTransfer);

  if (!transfer || transfer.status === "idle") {
    return null;
  }

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const session = terminalSessionManager.getSession(paneId);
    if (session?.transferCoordinator) {
      await session.transferCoordinator.cancelActiveTransfer();
    } else {
      useTransferStore.getState().cancelTransfer(paneId);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearTransfer(paneId);
  };

  const isCompleted = transfer.status === "completed";
  const isError = transfer.status === "error";
  const isCancelled = transfer.status === "cancelled";
  const isPrompting = transfer.status === "prompting";

  return (
    <div className="absolute bottom-4 right-4 z-30 max-w-sm w-88 shadow-2xl rounded-xl border border-base-300 bg-base-200/95 backdrop-blur-md p-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {transfer.direction === "download" ? (
            <ArrowDownToLine className="w-4 h-4 text-primary shrink-0 animate-bounce" />
          ) : (
            <ArrowUpFromLine className="w-4 h-4 text-secondary shrink-0 animate-bounce" />
          )}
          <span className="text-xs font-bold tracking-wide uppercase font-mono">
            {transfer.protocol} {transfer.direction}
          </span>
          <span className="badge badge-xs font-mono font-semibold uppercase badge-primary">
            {transfer.status}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isCompleted || isError || isCancelled ? (
            <button
              type="button"
              onClick={handleDismiss}
              className="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 text-base-content/60 hover:text-base-content"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-ghost btn-xs gap-1 h-5 px-1.5 min-h-0 text-error hover:bg-error/10 font-mono text-[10px]"
              title="Abort transfer"
            >
              <Ban className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* File Info */}
      <div className="space-y-0.5">
        <div className="text-xs font-mono font-medium truncate text-base-content" title={transfer.fileName}>
          {transfer.fileName || (isPrompting ? "Waiting for selection..." : "In-stream file")}
        </div>
        {transfer.localPath && (
          <div className="text-[10px] text-base-content/50 truncate font-mono" title={transfer.localPath}>
            {transfer.localPath}
          </div>
        )}
      </div>

      {/* Progress Bar & Stats */}
      {isPrompting ? (
        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs text-primary" />
          <span className="text-[11px] font-mono">Selecting file / save location...</span>
        </div>
      ) : isError ? (
        <div className="flex items-center gap-1.5 text-xs text-error font-mono">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{transfer.errorMessage || "Transfer failed"}</span>
        </div>
      ) : isCancelled ? (
        <div className="flex items-center gap-1.5 text-xs text-warning font-mono">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Transfer aborted by user</span>
        </div>
      ) : isCompleted ? (
        <div className="flex items-center gap-1.5 text-xs text-success font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Transfer successfully completed</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <progress
            className="progress progress-primary w-full h-1.5"
            value={transfer.progressPercent}
            max={100}
          />
          <div className="flex justify-between items-center text-[10px] font-mono text-base-content/70">
            <span>
              {formatBytes(transfer.transferredBytes)}
              {transfer.fileSize > 0 ? ` / ${formatBytes(transfer.fileSize)}` : ""}
            </span>
            <span>{transfer.progressPercent}%</span>
            <span className="text-primary font-semibold">{formatSpeed(transfer.speedBytesPerSec)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
