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
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { useThemeStore, DARK_THEMES, LIGHT_THEMES } from "@/stores/useThemeStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { SerialConnectModal } from "@/components/terminal/SerialConnectModal";
import { TelnetConnectModal } from "@/components/terminal/TelnetConnectModal";

export function Topbar() {
  const [quickConnectInput, setQuickConnectInput] = useState("");
  const [isSerialModalOpen, setIsSerialModalOpen] = useState(false);
  const [isTelnetModalOpen, setIsTelnetModalOpen] = useState(false);
  const { openTab, splitActivePane, activeTabId } = useMultiplexerStore();
  const { currentTheme, setTheme } = useThemeStore();
  const { setCommandPaletteOpen } = useLayoutStore();
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
    <header className="h-14 bg-base-200 border-b border-base-300 flex items-center justify-between px-4 gap-4 select-none shrink-0 z-10">
      {/* Left: Quick Connect Form */}
      <form onSubmit={handleQuickConnect} className="flex items-center gap-2 flex-1 max-w-md">
        <div className="join w-full shadow-xs">
          <div className="join-item flex items-center bg-base-100 px-3 border border-r-0 border-base-300 text-base-content/50">
            <Zap className="w-4 h-4 text-warning" />
          </div>
          <input
            type="text"
            value={quickConnectInput}
            onChange={(e) => setQuickConnectInput(e.target.value)}
            placeholder="Quick Connect (e.g. user@192.168.1.100:22)..."
            className="input input-sm join-item bg-base-100 border-base-300 w-full focus:outline-hidden font-mono text-xs"
          />
          <button
            type="submit"
            className="btn btn-sm btn-primary join-item px-3"
            title="Connect via SSH"
          >
            Connect
          </button>
        </div>
      </form>

      {/* Middle: Command Palette Trigger */}
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="btn btn-sm btn-ghost gap-2 border border-base-300/60 bg-base-100/50 hover:bg-base-100 px-3 text-base-content/70"
        title="Open Command Palette (Cmd+K)"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs">Search or run command...</span>
        <kbd className="kbd kbd-xs font-mono text-[10px]">⌘K</kbd>
      </button>

      {/* Right: Multiplexer Controls & Theme Selector */}
      <div className="flex items-center gap-1.5">
        {/* Split Controls (active if tab open) */}
        {activeTabId && (
          <div className="join bg-base-100 border border-base-300 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => splitActivePane("horizontal")}
              className="btn btn-ghost btn-xs btn-square join-item"
              title="Split Horizontal (Side by Side)"
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => splitActivePane("vertical")}
              className="btn btn-ghost btn-xs btn-square join-item"
              title="Split Vertical (Top / Bottom)"
            >
              <Rows2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Broadcast Keystrokes Toggle */}
        {activeTabId && (
          <button
            type="button"
            onClick={toggleBroadcast}
            className={`btn btn-sm gap-1.5 border transition-all ${
              isBroadcastEnabled
                ? "btn-warning font-bold shadow-xs animate-pulse"
                : "btn-ghost border-base-300 text-base-content/80 hover:bg-base-100"
            }`}
            title="Toggle Broadcast Keystrokes (⌘⌥B)"
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Broadcast</span>
          </button>
        )}

        {/* Serial Console Trigger */}
        <button
          type="button"
          onClick={() => setIsSerialModalOpen(true)}
          className="btn btn-sm btn-ghost gap-1.5 text-base-content/80 hover:bg-base-100 border border-base-300"
          title="Connect to Hardware Serial (UART) Console"
        >
          <Cpu className="w-4 h-4 text-warning" />
          <span className="text-xs font-medium">Serial Port</span>
        </button>

        {/* Telnet Trigger */}
        <button
          type="button"
          onClick={() => setIsTelnetModalOpen(true)}
          className="btn btn-sm btn-ghost gap-1.5 text-base-content/80 hover:bg-base-100 border border-base-300"
          title="Connect via Telnet Protocol"
        >
          <Network className="w-4 h-4 text-info" />
          <span className="text-xs font-medium">Telnet</span>
        </button>

        {/* New Terminal Tab */}
        <button
          type="button"
          onClick={() => openTab({ title: "Local Terminal", status: "idle" })}
          className="btn btn-sm btn-ghost gap-1.5 text-base-content/80 hover:bg-base-100 border border-base-300"
          title="Open New Terminal Session"
        >
          <Plus className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">New Session</span>
        </button>

        {/* Theme Picker Dropdown */}
        <div className="dropdown dropdown-end">
          <div
            tabIndex={0}
            role="button"
            className="btn btn-sm btn-ghost btn-square text-base-content/75 hover:bg-base-100 border border-base-300"
            title="Switch Theme"
          >
            <Palette className="w-4 h-4" />
          </div>
          <div
            tabIndex={0}
            className="dropdown-content z-30 p-2 shadow-2xl bg-base-200 border border-base-300 rounded-box w-64 max-h-96 overflow-y-auto mt-2"
          >
            {/* Header */}
            <div className="px-3 py-1.5 border-b border-base-300/60 mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-base-content/80">Theme Selector</span>
              <span className="text-[10px] font-mono text-base-content/50 uppercase">{currentTheme}</span>
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
                        {isActive && <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />}
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
                        {isActive && <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

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
    </header>
  );
}
