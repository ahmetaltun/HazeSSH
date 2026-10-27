import { useState, useMemo, type FormEvent } from "react";
import {
  Server,
  Zap,
  Copy,
  Search,
  ArrowRight,
  X,
  Shield,
  Terminal,
} from "lucide-react";
import type { TerminalPane } from "@/types/terminal";
import type { Host } from "@/types/host";
import { useHostStore } from "@/stores/useHostStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { TextInput } from "@/components/common/TextInput";

interface PaneHostSelectorProps {
  readonly pane: TerminalPane;
  readonly tabId: string;
}

export function PaneHostSelector({ pane, tabId }: PaneHostSelectorProps) {
  const { hosts } = useHostStore();
  const { updatePane, closePane } = useMultiplexerStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [quickConnectInput, setQuickConnectInput] = useState("");

  const filteredHosts = useMemo(() => {
    if (!searchTerm.trim()) return hosts;
    const query = searchTerm.toLowerCase();
    return hosts.filter((h) => {
      const labelMatch = h.label.toLowerCase().includes(query);
      const hostMatch = h.hostname.toLowerCase().includes(query);
      const userMatch = h.username?.toLowerCase().includes(query);
      const tagMatch = h.tags?.some((t) => t.toLowerCase().includes(query));
      return labelMatch || hostMatch || userMatch || tagMatch;
    });
  }, [hosts, searchTerm]);

  const handleSelectHost = (host: Host) => {
    if (host.auth_type === "telnet") {
      updatePane(pane.id, {
        title: `Telnet: ${host.label}`,
        connectionType: "telnet",
        hostname: host.hostname,
        port: host.port,
        telnetOptions: {
          host: host.hostname,
          port: host.port,
          terminal_type: "xterm-256color",
        },
        status: "connecting",
      });
      return;
    }

    updatePane(pane.id, {
      hostId: host.id,
      title: host.label,
      hostname: host.hostname,
      port: host.port,
      username: host.username || undefined,
      connectionType: "ssh",
      status: "connecting",
    });
  };

  const handleDuplicateCurrent = () => {
    if (!pane.sourceHost) return;

    if (pane.sourceHost.connectionType === "telnet") {
      updatePane(pane.id, {
        title: pane.sourceHost.title ? `${pane.sourceHost.title} (2)` : "Telnet",
        connectionType: "telnet",
        hostname: pane.sourceHost.hostname,
        port: pane.sourceHost.port,
        telnetOptions: {
          host: pane.sourceHost.hostname || "127.0.0.1",
          port: pane.sourceHost.port || 23,
          terminal_type: "xterm-256color",
        },
        status: "connecting",
      });
      return;
    }

    updatePane(pane.id, {
      hostId: pane.sourceHost.hostId,
      title: pane.sourceHost.title ? `${pane.sourceHost.title} (2)` : "Terminal",
      hostname: pane.sourceHost.hostname,
      port: pane.sourceHost.port || 22,
      username: pane.sourceHost.username,
      connectionType: "ssh",
      status: "connecting",
    });
  };

  const handleQuickConnect = (e: FormEvent) => {
    e.preventDefault();
    const query = quickConnectInput.trim();
    if (!query) return;

    // 1. Telnet scheme
    if (query.toLowerCase().startsWith("telnet://")) {
      const rest = query.slice(9);
      const [h, p] = rest.split(":");
      const port = parseInt(p, 10) || 23;
      updatePane(pane.id, {
        title: `Telnet: ${h}:${port}`,
        connectionType: "telnet",
        hostname: h,
        port,
        telnetOptions: { host: h, port },
        status: "connecting",
      });
      return;
    }

    // 2. SSH (optional ssh:// scheme) or standard user@host:port
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

    updatePane(pane.id, {
      title: query,
      hostname,
      port,
      username,
      connectionType: "ssh",
      status: "connecting",
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-base-100 overflow-y-auto p-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-base-300">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-base-content">
              Select Host for Split Terminal
            </h3>
            <p className="text-xs text-base-content/60">
              Connect to an existing host or enter connection details
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => closePane(tabId, pane.id)}
          className="btn btn-ghost btn-xs btn-square hover:bg-error/20 hover:text-error"
          title="Cancel and close pane"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 py-4">
        {/* Launch Local Shell Card */}
        <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="p-2 rounded-md bg-accent/20 text-accent">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-base-content truncate">
                  Local Terminal Shell
                </span>
                <span className="badge badge-accent badge-xs">Local PTY</span>
              </div>
              <p className="text-xs font-mono text-base-content/70 truncate mt-0.5">
                Launch your system default shell (zsh, bash, powershell)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              updatePane(pane.id, {
                title: "Local Shell",
                connectionType: "local",
                status: "connecting",
              });
            }}
            className="btn btn-accent btn-xs gap-1.5 shrink-0"
          >
            <span>Spawn Shell</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Duplicate Current Host Card */}
        {pane.sourceHost && (pane.sourceHost.hostname || pane.sourceHost.hostId) && (
          <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="p-2 rounded-md bg-primary/20 text-primary">
                <Copy className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-base-content truncate">
                    Duplicate Current Host
                  </span>
                  <span className="badge badge-primary badge-xs">Active Session</span>
                </div>
                <p className="text-xs font-mono text-base-content/70 truncate mt-0.5">
                  {pane.sourceHost.title ? `${pane.sourceHost.title} · ` : ""}
                  {pane.sourceHost.username ? `${pane.sourceHost.username}@` : ""}
                  {pane.sourceHost.hostname || "Host"}
                  {pane.sourceHost.port ? `:${pane.sourceHost.port}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDuplicateCurrent}
              className="btn btn-primary btn-xs gap-1.5 shrink-0"
            >
              <span>Connect</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Quick Connect Form */}
        <form onSubmit={handleQuickConnect} className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-base-content/80 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-warning" />
            <span>Quick Connect</span>
          </label>
          <div className="join w-full shadow-xs">
            <TextInput
              type="text"
              value={quickConnectInput}
              onChange={(e) => setQuickConnectInput(e.target.value)}
              placeholder="user@192.168.1.100:22 or telnet://host:port..."
              className="input input-sm join-item bg-base-200 border-base-300 w-full font-mono text-xs focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={!quickConnectInput.trim()}
              className="btn btn-sm btn-primary join-item px-3"
            >
              Connect
            </button>
          </div>
        </form>

        {/* Saved Hosts Section */}
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-base-content/80 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-info" />
              <span>Saved Hosts ({filteredHosts.length})</span>
            </label>
            {hosts.length > 4 && (
              <div className="relative max-w-[180px]">
                <Search className="w-3 h-3 absolute left-2 top-2.5 text-base-content/40" />
                <TextInput
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter hosts..."
                  className="input input-xs bg-base-200 border-base-300 pl-7 w-full text-xs"
                />
              </div>
            )}
          </div>

          {filteredHosts.length === 0 ? (
            <div className="p-4 text-center rounded-lg border border-dashed border-base-300 text-xs text-base-content/50">
              {hosts.length === 0
                ? "No saved hosts available. Use Quick Connect above."
                : "No hosts match your search query."}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
              {filteredHosts.map((h) => (
                <div
                  key={h.id}
                  onClick={() => handleSelectHost(h)}
                  className="flex items-center justify-between p-2 rounded-lg border border-base-300 bg-base-200/40 hover:bg-base-200 hover:border-primary/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-6 h-6 rounded-md bg-base-300 flex items-center justify-center shrink-0">
                      {h.auth_type === "telnet" ? (
                        <Zap className="w-3.5 h-3.5 text-warning" />
                      ) : (
                        <Shield className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-base-content truncate">
                          {h.label}
                        </span>
                        {h.tags?.map((t) => (
                          <span
                            key={t}
                            className="badge badge-neutral badge-xs text-[9px] font-mono"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] font-mono text-base-content/60 truncate">
                        {h.username ? `${h.username}@` : ""}
                        {h.hostname}:{h.port}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectHost(h);
                    }}
                    className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
