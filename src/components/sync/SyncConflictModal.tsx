import { AlertTriangle, GitMerge, Download, Upload, X } from "lucide-react";
import { useSyncStore } from "@/stores/useSyncStore";
import { decentralizedSyncService } from "@/services/decentralizedSyncService";

export function SyncConflictModal() {
  const { isConflictModalOpen, conflictInfo, setIsConflictModalOpen } = useSyncStore();

  if (!isConflictModalOpen || !conflictInfo) return null;

  const handleMerge = async () => {
    try {
      await decentralizedSyncService.pullVault(undefined, "merge");
    } finally {
      setIsConflictModalOpen(false);
    }
  };

  const handleOverwriteLocal = async () => {
    try {
      await decentralizedSyncService.pullVault(undefined, "overwrite");
    } finally {
      setIsConflictModalOpen(false);
    }
  };

  const handleOverwriteRemote = async () => {
    try {
      await decentralizedSyncService.pushVault();
    } finally {
      setIsConflictModalOpen(false);
    }
  };

  return (
    <div className="modal modal-open bg-black/60 backdrop-blur-xs z-50 animate-in fade-in duration-150 select-text">
      <div className="modal-box max-w-md bg-base-100 border border-base-300 shadow-2xl p-5 flex flex-col gap-4 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-200 pb-3">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm text-base-content">
              Sync Conflict Detected
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsConflictModalOpen(false)}
            className="btn btn-ghost btn-xs btn-square hover:bg-base-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-base-content/80 leading-relaxed">
          The remote vault has newer updates from another workstation, but you also have local changes.
          How would you like to resolve the conflict?
        </p>

        {/* Comparison card */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-base-200/50 border border-base-300">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-base-content/60 text-[10px] uppercase">
              Local Vault
            </span>
            <span className="font-mono text-sm font-semibold text-base-content">
              {conflictInfo.localHostsCount} Hosts
            </span>
            <span className="text-[10px] text-base-content/50">
              {conflictInfo.localIdentitiesCount} Identities
            </span>
          </div>

          <div className="flex flex-col gap-1 border-l border-base-300/80 pl-3">
            <span className="font-bold text-primary text-[10px] uppercase">
              Remote Vault
            </span>
            <span className="font-mono text-sm font-semibold text-primary">
              {conflictInfo.remoteHostsCount ?? "?"} Hosts
            </span>
            <span className="text-[10px] text-base-content/50">
              {conflictInfo.remoteIdentitiesCount ?? "?"} Identities
            </span>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleMerge}
            className="btn btn-primary btn-sm justify-start gap-2.5 font-bold shadow-xs"
          >
            <GitMerge className="w-4 h-4" />
            <div className="text-left flex-1">
              <div>Smart Merge (Recommended)</div>
              <div className="text-[10px] font-normal opacity-80">
                Preserve local hosts and add new remote hosts
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleOverwriteLocal}
            className="btn btn-neutral btn-sm justify-start gap-2.5"
          >
            <Download className="w-4 h-4" />
            <div className="text-left flex-1">
              <div>Overwrite Local Database</div>
              <div className="text-[10px] font-normal opacity-70">
                Discard local changes and take remote version
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleOverwriteRemote}
            className="btn btn-ghost btn-sm justify-start gap-2.5 text-error hover:bg-error/10"
          >
            <Upload className="w-4 h-4" />
            <div className="text-left flex-1">
              <div>Overwrite Remote Vault</div>
              <div className="text-[10px] font-normal opacity-70">
                Force push local changes over remote
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
