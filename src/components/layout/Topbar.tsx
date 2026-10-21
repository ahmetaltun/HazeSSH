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
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useThemeStore, AVAILABLE_THEMES } from "@/stores/useThemeStore";
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
          <ul
            tabIndex={0}
            className="dropdown-content z-30 menu p-2 shadow-2xl bg-base-200 border border-base-300 rounded-box w-52 max-h-80 overflow-y-auto mt-2"
          >
            <li className="menu-title text-xs uppercase tracking-wider text-base-content/50">
              DaisyUI Themes
            </li>
            {AVAILABLE_THEMES.map((theme) => (
              <li key={theme.id}>
                <button
                  type="button"
                  onClick={() => setTheme(theme.id)}
                  className={`text-xs py-2 flex items-center justify-between ${
                    currentTheme === theme.id ? "active font-bold" : ""
                  }`}
                >
                  <span>{theme.label}</span>
                  {currentTheme === theme.id && (
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              </li>
            ))}
          </ul>
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
