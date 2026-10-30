import {
  ShieldCheck,
  HardDrive,
  Activity,
  Network,
  Command,
} from "lucide-react";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { formatShortcut } from "@/utils/platform";

export function StatusBar() {
  const {
    isVaultLocked,
    hasMasterPassword,
    activeTunnelCount,
    setView,
    setActiveSection,
    setAboutModalOpen,
    setCommandPaletteOpen,
    setVaultUnlockModalOpen,
  } = useLayoutStore();
  const { tabs } = useMultiplexerStore();

  return (
    <footer className="h-6 bg-base-300 border-t border-base-200 flex items-center justify-between px-3 text-[11px] text-base-content/65 select-none shrink-0 font-mono">
      {/* Left items: App info & storage status */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setAboutModalOpen(true)}
          className="flex items-center font-sans font-medium text-base-content/85 hover:text-primary transition-colors cursor-pointer"
          title="About Haze SSH"
        >
          <span>Haze SSH</span>
        </button>

        <span className="text-base-content/20">•</span>

        <button
          type="button"
          onClick={() => setView("settings")}
          className="flex items-center gap-1 hover:text-base-content transition-colors cursor-pointer"
          title="All data strictly stored on device in SQLite"
        >
          <HardDrive className="w-3 h-3 text-success" />
          <span className="hidden sm:inline">Local SQLite</span>
        </button>

        <span className="text-base-content/20">•</span>

        <button
          type="button"
          onClick={() => {
            if (hasMasterPassword && isVaultLocked) {
              setVaultUnlockModalOpen(true);
            } else {
              setView("settings");
            }
          }}
          className="flex items-center gap-1 hover:text-base-content transition-colors cursor-pointer"
          title={
            hasMasterPassword && isVaultLocked
              ? "Vault is locked. Click to unlock with Master Password."
              : "Click to view Vault Security settings"
          }
        >
          <ShieldCheck
            className={`w-3 h-3 ${isVaultLocked ? "text-warning" : "text-success"}`}
          />
          <span>
            {hasMasterPassword
              ? isVaultLocked
                ? "Vault Locked"
                : "Vault Encrypted"
              : "Device Encrypted"}
          </span>
        </button>
      </div>

      {/* Right items: Active sessions, tunnels, shortcuts */}
      <div className="flex items-center gap-3">
        {tabs.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveSection("terminal")}
            className="flex items-center gap-1 text-info hover:underline cursor-pointer"
            title="Switch to active terminal sessions"
          >
            <Activity className="w-3 h-3 text-info" />
            <span>
              {tabs.length} {tabs.length === 1 ? "Session" : "Sessions"}
            </span>
          </button>
        )}

        {activeTunnelCount > 0 && (
          <button
            type="button"
            onClick={() => setView("tunnels")}
            className="flex items-center gap-1 text-warning font-semibold hover:underline cursor-pointer"
            title="Switch to Port Forwarding view"
          >
            <Network className="w-3 h-3" />
            <span>{activeTunnelCount} Tunnels</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden md:flex items-center gap-1 text-[10px] text-base-content/50 hover:text-base-content transition-colors cursor-pointer"
          title="Open Command Palette"
        >
          <Command className="w-2.5 h-2.5" />
          <span>{formatShortcut("⌘K", "Ctrl+K")}</span>
        </button>
      </div>
    </footer>
  );
}
