import { useState, type FormEvent } from "react";
import {
  Search,
  Plus,
  Columns2,
  Rows2,
  Palette,
  Zap,
  Cpu,
  Network,
  Moon,
  Sun,
  Check,
  Radio,
  Keyboard,
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { useThemeStore, DARK_THEMES, LIGHT_THEMES } from "@/stores/useThemeStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { SerialConnectModal } from "@/components/terminal/SerialConnectModal";
import { TelnetConnectModal } from "@/components/terminal/TelnetConnectModal";
import { WindowControls } from "@/components/layout/WindowControls";
import { ShortcutsModal } from "@/components/layout/ShortcutsModal";
import { BrandLogo } from "@/components/common/BrandLogo";
import { isMacOS, formatShortcut } from "@/utils/platform";

export function Topbar() {
  const [quickConnectInput, setQuickConnectInput] = useState("");
  const [isSerialModalOpen, setIsSerialModalOpen] = useState(false);
  const [isTelnetModalOpen, setIsTelnetModalOpen] = useState(false);

  const { openTab, splitActivePane, activeTabId } = useMultiplexerStore();
  const { currentTheme, setTheme } = useThemeStore();
  const {
    setCommandPaletteOpen,
    setAboutModalOpen,
    isShortcutsModalOpen,
    setShortcutsModalOpen,
  } = useLayoutStore();
  const { isBroadcastEnabled, toggleBroadcast } = useBroadcastStore();

  const handleQuickConnect = (e: FormEvent) => {
    e.preventDefault();
    const query = quickConnectInput.trim();
    if (!query) return;

    // 1. Telnet URL Scheme: telnet://host:port
    if (query.toLowerCase().startsWith("telnet://")) {
      const rest = query.slice(9);
      const [h, p] = rest.split(":");
      const port = parseInt(p, 10) || 23;
      openTab(
        {
          title: `Telnet: ${h}:${port}`,
          connectionType: "telnet",
          hostname: h,
          port,
          telnetOptions: { host: h, port },
          status: "connecting",
        },
        `Telnet: ${h}`
      );
      setQuickConnectInput("");
      return;
    }

    // 2. Serial URL Scheme: serial://port@baud or serial://COM3:115200
    if (query.toLowerCase().startsWith("serial://")) {
      const rest = query.slice(9);
      let portName = rest;
      let baudRate = 115200;

      if (rest.includes("@")) {
        const [p, b] = rest.split("@");
        portName = p;
        baudRate = parseInt(b, 10) || 115200;
      } else if (rest.includes(":") && !rest.includes("/")) {
        const [p, b] = rest.split(":");
        portName = p;
        baudRate = parseInt(b, 10) || 115200;
      }

      const shortName = portName.split("/").pop() || portName;
      openTab(
        {
          title: `Serial: ${shortName} (${baudRate})`,
          connectionType: "serial",
          serialOptions: { port_name: portName, baud_rate: baudRate },
          status: "connecting",
        },
        `Serial: ${shortName}`
      );
      setQuickConnectInput("");
      return;
    }

    // 3. SSH (optional ssh:// scheme) or standard user@host:port
    let rawSsh = query;
    if (rawSsh.toLowerCase().startsWith("ssh://")) {
      rawSsh = rawSsh.slice(6);
    }

    let username: string | undefined;
    let hostname = rawSsh;
    let port = 22;

    if (hostname.includes("@")) {
      const parts = hostname.split("@");
      username = parts[0];
      hostname = parts[1];
    }

    if (hostname.includes(":")) {
      const parts = hostname.split(":");
      hostname = parts[0];
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort) && parsedPort > 0) {
        port = parsedPort;
      }
    }

    openTab(
      {
        title: query,
        hostname,
        port,
        username,
        status: "connecting",
      },
      query
    );

    setQuickConnectInput("");
  };

  return (
    <>
      <header
        data-tauri-drag-region
        className={`h-11 bg-base-200/95 backdrop-blur-md border-b border-base-300 flex items-center justify-between gap-3 select-none shrink-0 z-30 transition-all ${
          isMacOS ? "pl-20 pr-3" : "px-3"
        }`}
      >
        {/* Left Section: Brand Logo (on non-macOS) & Quick Connect Omnibar */}
        <div className="flex items-center gap-3 flex-1 min-w-0 max-w-lg">
          {!isMacOS && (
            <div
              onClick={() => setAboutModalOpen(true)}
              className="flex items-center gap-2 cursor-pointer no-drag hover:opacity-80 transition-opacity shrink-0"
              title="About Haze SSH"
            >
              <BrandLogo variant="mark" size={20} />
              <span className="font-bold text-xs tracking-tight hidden sm:inline">
                Haze SSH
              </span>
            </div>
          )}

          {/* Quick Connect Form */}
          <form
            onSubmit={handleQuickConnect}
            className="flex items-center gap-1.5 flex-1 min-w-0 no-drag"
          >
            <div className="join w-full shadow-2xs">
              <div className="join-item flex items-center bg-base-100/80 px-2.5 border border-r-0 border-base-300/80 text-base-content/50">
                <Zap className="w-3.5 h-3.5 text-warning" />
              </div>
              <input
                type="text"
                value={quickConnectInput}
                onChange={(e) => setQuickConnectInput(e.target.value)}
                placeholder="Quick Connect (e.g. user@192.168.1.100:22)..."
                className="input input-xs h-7 join-item bg-base-100/80 border-base-300/80 w-full focus:outline-hidden font-mono text-[11px] placeholder:text-base-content/40"
              />
              <button
                type="submit"
                className="btn btn-xs h-7 btn-primary join-item px-2.5 text-[11px] font-medium"
                title="Connect via SSH"
                aria-label="Connect Quick SSH Session"
              >
                Connect
              </button>
            </div>
          </form>
        </div>

        {/* Center: Desktop Command Palette Trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="btn btn-xs h-7 btn-ghost gap-2 border border-base-300/70 bg-base-100/60 hover:bg-base-100 px-2.5 text-base-content/75 no-drag shadow-2xs"
          title={`Open Command Palette (${formatShortcut("⌘K", "Ctrl+K")})`}
          aria-label="Open Command Palette"
        >
          <Search className="w-3 h-3 text-base-content/50" />
          <span className="text-[11px] hidden md:inline">Search or command…</span>
          <kbd className="kbd kbd-xs font-mono text-[9px] px-1 py-0.5 bg-base-200/60">
            {formatShortcut("⌘K", "Ctrl+K")}
          </kbd>
        </button>

        {/* Right Section: Workspace Controls, Theme & Window Controls */}
        <div className="flex items-center gap-1.5 no-drag shrink-0">
          {/* Split Controls (active if terminal tab open) */}
          {activeTabId && (
            <div className="join bg-base-100/80 border border-base-300/80 rounded-md p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => splitActivePane("horizontal")}
                className="btn btn-ghost btn-xs btn-square h-6 w-6 join-item"
                title={`Split Right (${formatShortcut("⌘\\", "Ctrl+\\")})`}
                aria-label="Split Pane Right"
              >
                <Columns2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => splitActivePane("vertical")}
                className="btn btn-ghost btn-xs btn-square h-6 w-6 join-item"
                title="Split Down (Top / Bottom)"
                aria-label="Split Pane Down"
              >
                <Rows2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Broadcast Keystrokes Toggle */}
          {activeTabId && (
            <button
              type="button"
              onClick={toggleBroadcast}
              className={`btn btn-xs h-7 gap-1 border transition-all ${
                isBroadcastEnabled
                  ? "btn-warning font-bold shadow-xs animate-pulse"
                  : "btn-ghost border-base-300/70 text-base-content/80 hover:bg-base-100"
              }`}
              title={`Toggle Broadcast Keystrokes (${formatShortcut("⌘⌥B", "Ctrl+Alt+B")})`}
              aria-label="Toggle Keystroke Broadcasting"
            >
              <Radio className="w-3 h-3" />
              <span className="text-[11px] font-medium hidden lg:inline">Broadcast</span>
            </button>
          )}

          {/* Serial Console Trigger */}
          <button
            type="button"
            onClick={() => setIsSerialModalOpen(true)}
            className="btn btn-xs h-7 btn-ghost gap-1 text-base-content/80 hover:bg-base-100 border border-base-300/70"
            title="Connect to Hardware Serial (UART) Console"
            aria-label="Connect Serial Port"
          >
            <Cpu className="w-3.5 h-3.5 text-warning" />
            <span className="text-[11px] font-medium hidden xl:inline">Serial</span>
          </button>

          {/* Telnet Trigger */}
          <button
            type="button"
            onClick={() => setIsTelnetModalOpen(true)}
            className="btn btn-xs h-7 btn-ghost gap-1 text-base-content/80 hover:bg-base-100 border border-base-300/70"
            title="Connect via Telnet Protocol"
            aria-label="Connect Telnet"
          >
            <Network className="w-3.5 h-3.5 text-info" />
            <span className="text-[11px] font-medium hidden xl:inline">Telnet</span>
          </button>

          {/* New Terminal Tab */}
          <button
            type="button"
            onClick={() => openTab({ title: "Local Terminal", status: "idle" })}
            className="btn btn-xs h-7 btn-ghost gap-1 text-base-content/80 hover:bg-base-100 border border-base-300/70"
            title={`Open New Terminal (${formatShortcut("⌘T", "Ctrl+T")})`}
            aria-label="New Terminal Tab"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-medium hidden sm:inline">New Session</span>
          </button>

          {/* Shortcuts Cheat Sheet Trigger */}
          <button
            type="button"
            onClick={() => setShortcutsModalOpen(true)}
            className="btn btn-xs h-7 btn-ghost btn-square text-base-content/70 hover:bg-base-100 border border-base-300/70"
            title={`Keyboard Shortcuts (${formatShortcut("⌘/", "Ctrl+/")})`}
            aria-label="Open Keyboard Shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          {/* Theme Picker Dropdown */}
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-xs h-7 btn-ghost btn-square text-base-content/75 hover:bg-base-100 border border-base-300/70"
              title="Switch Color Theme"
              aria-label="Switch Color Theme"
            >
              <Palette className="w-3.5 h-3.5" />
            </div>
            <div
              tabIndex={0}
              className="dropdown-content z-40 p-2 shadow-2xl bg-base-200 border border-base-300 rounded-box w-64 max-h-96 overflow-y-auto mt-2"
            >
              {/* Header */}
              <div className="px-3 py-1.5 border-b border-base-300/60 mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-base-content/80">
                  Theme Selector
                </span>
                <span className="text-[10px] font-mono text-base-content/50 uppercase">
                  {currentTheme}
                </span>
              </div>

              {/* Dark Themes Group */}
              <div className="pt-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                  <Moon className="w-3.5 h-3.5 text-primary" />
                  <span>Dark Themes</span>
                </div>
                <ul className="menu menu-xs p-0 gap-0.5">
                  {DARK_THEMES.map((theme) => {
                    const isActive = currentTheme === theme.id;
                    return (
                      <li key={theme.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setTheme(theme.id);
                            (document.activeElement as HTMLElement)?.blur();
                          }}
                          className={`py-1.5 px-2.5 flex items-center justify-between rounded-md transition-colors ${
                            isActive
                              ? "bg-primary text-primary-content font-bold shadow-xs"
                              : "hover:bg-base-300/80 text-base-content/80"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-base-content/20 shrink-0 flex items-center justify-center shadow-xs"
                              style={{ backgroundColor: theme.baseColor }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: theme.primaryColor }}
                              />
                            </span>
                            <span className="text-xs">{theme.label}</span>
                          </div>
                          {isActive && (
                            <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="divider my-1.5 opacity-60"></div>

              {/* Light Themes Group */}
              <div>
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                  <Sun className="w-3.5 h-3.5 text-warning" />
                  <span>Light Themes</span>
                </div>
                <ul className="menu menu-xs p-0 gap-0.5">
                  {LIGHT_THEMES.map((theme) => {
                    const isActive = currentTheme === theme.id;
                    return (
                      <li key={theme.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setTheme(theme.id);
                            (document.activeElement as HTMLElement)?.blur();
                          }}
                          className={`py-1.5 px-2.5 flex items-center justify-between rounded-md transition-colors ${
                            isActive
                              ? "bg-primary text-primary-content font-bold shadow-xs"
                              : "hover:bg-base-300/80 text-base-content/80"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-base-content/20 shrink-0 flex items-center justify-center shadow-xs"
                              style={{ backgroundColor: theme.baseColor }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: theme.primaryColor }}
                              />
                            </span>
                            <span className="text-xs">{theme.label}</span>
                          </div>
                          {isActive && (
                            <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>

          {/* Windows / Linux Native Window Controls */}
          <WindowControls />
        </div>
      </header>

      {/* Modals */}
      {isSerialModalOpen && (
        <SerialConnectModal
          isOpen={true}
          onClose={() => setIsSerialModalOpen(false)}
        />
      )}

      {isTelnetModalOpen && (
        <TelnetConnectModal
          isOpen={true}
          onClose={() => setIsTelnetModalOpen(false)}
        />
      )}

      {isShortcutsModalOpen && (
        <ShortcutsModal
          isOpen={true}
          onClose={() => setShortcutsModalOpen(false)}
        />
      )}
    </>
  );
}
