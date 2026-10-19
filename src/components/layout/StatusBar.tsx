import {
  ShieldCheck,
  HardDrive,
  Activity,
  Network,
} from "lucide-react";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";

export function StatusBar() {
  const { isVaultLocked, hasMasterPassword, activeTunnelCount } = useLayoutStore();
  const { tabs } = useMultiplexerStore();

  return (
    <footer className="h-7 bg-base-300 border-t border-base-200 flex items-center justify-between px-3 text-[11px] text-base-content/65 select-none shrink-0 font-mono">
      {/* Left items: App info & storage status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-sans font-medium text-base-content/85">
          <span>Haze SSH</span>
          <span className="badge badge-xs badge-neutral text-[9px] font-mono">v0.1.0</span>
        </div>

        <div className="flex items-center gap-1.5" title="All data strictly stored on device in SQLite">
          <HardDrive className="w-3 h-3 text-success" />
          <span>Local SQLite (Offline)</span>
        </div>

        <div className="flex items-center gap-1.5" title="Vault encryption status">
          <ShieldCheck className={`w-3 h-3 ${isVaultLocked ? "text-warning" : "text-success"}`} />
          <span>
            {hasMasterPassword
              ? isVaultLocked
                ? "Vault Locked"
                : "Vault Encrypted"
              : "Device-Key Encrypted"}
          </span>
        </div>
      </div>

      {/* Right items: Active sessions, tunnels, shortcuts */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-info" />
          <span>{tabs.length} {tabs.length === 1 ? "Session" : "Sessions"}</span>
        </div>

        {activeTunnelCount > 0 && (
          <div className="flex items-center gap-1.5 text-warning font-semibold">
            <Network className="w-3 h-3" />
            <span>{activeTunnelCount} Active Tunnels</span>
          </div>
        )}

        <div className="text-[10px] text-base-content/40 hidden sm:block">
          Press <kbd className="kbd kbd-xs font-mono text-[9px]">⌘K</kbd> for commands
        </div>
      </div>
    </footer>
  );
}
