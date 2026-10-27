import { useState } from "react";
import { Cloud, RefreshCw, Check, AlertCircle } from "lucide-react";
import { useSyncStore } from "@/stores/useSyncStore";
import { decentralizedSyncService } from "@/services/decentralizedSyncService";
import { useLayoutStore } from "@/stores/useLayoutStore";

export function SyncStatusBadge() {
  const { status, lastSyncedAt, activeProvider, syncPassphrase } = useSyncStore();
  const { setView, setActiveSection } = useLayoutStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const formatRelativeTime = (ts: number | null) => {
    if (!ts) return "Never synced";
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const handleSyncClick = async () => {
    if (!syncPassphrase) {
      // Navigate to Settings -> Sync
      setActiveSection("management");
      setView("settings");
      return;
    }

    setIsManualSyncing(true);
    try {
      await decentralizedSyncService.pushVault();
    } catch {
      // Error stored in store
    } finally {
      setIsManualSyncing(false);
    }
  };

  const isSyncing = status === "syncing" || isManualSyncing;

  return (
    <button
      type="button"
      onClick={handleSyncClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`btn btn-ghost btn-xs h-7 px-2 gap-1.5 rounded-lg border transition-all ${
        status === "synced"
          ? "border-success/30 text-success hover:bg-success/10"
          : status === "error"
          ? "border-error/30 text-error hover:bg-error/10"
          : isSyncing
          ? "border-warning/30 text-warning hover:bg-warning/10"
          : "border-base-300 text-base-content/60 hover:text-base-content hover:bg-base-200"
      }`}
      title={
        !syncPassphrase
          ? "Decentralized Sync not configured (Click to setup)"
          : `Sync: ${activeProvider.toUpperCase()} · Last synced: ${formatRelativeTime(lastSyncedAt)} (Click to sync now)`
      }
    >
      {isSyncing ? (
        <RefreshCw className="w-3 h-3 animate-spin text-warning" />
      ) : status === "synced" ? (
        <Check className="w-3 h-3 text-success" />
      ) : status === "error" ? (
        <AlertCircle className="w-3 h-3 text-error" />
      ) : (
        <Cloud className="w-3 h-3" />
      )}

      <span className="text-[10px] font-mono font-medium hidden sm:inline">
        {isSyncing
          ? "Syncing..."
          : isHovered && syncPassphrase
          ? "Sync Now"
          : formatRelativeTime(lastSyncedAt)}
      </span>
    </button>
  );
}
