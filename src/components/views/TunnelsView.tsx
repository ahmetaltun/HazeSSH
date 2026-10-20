import { useState, useEffect } from "react";
import {
  Network,
  Plus,
  Play,
  Square,
  Copy,
  Check,
  Trash2,
  Search,
  ArrowRight,
  Laptop,
  Server,
  Globe,
  AlertCircle,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { useTunnelStore } from "@/stores/useTunnelStore";
import { useHostStore } from "@/stores/useHostStore";
import { TunnelModal } from "@/components/tunnels/TunnelModal";
import type { Tunnel } from "@/types/tunnel";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function TunnelsView() {
  const { tunnels, statuses, fetchTunnels, fetchStatuses, startTunnel, stopTunnel, deleteTunnel } =
    useTunnelStore();
  const { hosts, fetchHosts } = useHostStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "local" | "remote" | "dynamic">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchTunnels();
    fetchHosts();

    const interval = setInterval(() => {
      fetchStatuses();
    }, 1500);

    return () => clearInterval(interval);
  }, [fetchTunnels, fetchHosts, fetchStatuses]);

  const handleToggle = async (tunnel: Tunnel) => {
    const isRunning = statuses[tunnel.id]?.status === "running";
    setActionInProgress((prev) => ({ ...prev, [tunnel.id]: true }));

    try {
      if (isRunning) {
        await stopTunnel(tunnel.id);
      } else {
        await startTunnel(tunnel.id);
      }
    } catch (err: unknown) {
      console.error("Tunnel toggle failed:", err);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [tunnel.id]: false }));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete tunnel "${name}"?`)) {
      try {
        await deleteTunnel(id);
      } catch (err: unknown) {
        console.error("Failed to delete tunnel:", err);
      }
    }
  };

  const getSshCommand = (tunnel: Tunnel): string => {
    const host = hosts.find((h) => h.id === tunnel.host_id);
    const user = host?.username ? `${host.username}@` : "";
    const target = host ? `${user}${host.hostname}` : "user@host";
    const portArg = host && host.port !== 22 ? ` -p ${host.port}` : "";

    switch (tunnel.tunnel_type) {
      case "local":
        return `ssh -N -L ${tunnel.local_port}:${tunnel.remote_host || "127.0.0.1"}:${tunnel.remote_port || tunnel.local_port} ${target}${portArg}`;
      case "remote":
        return `ssh -N -R ${tunnel.remote_port || tunnel.local_port}:${tunnel.local_host}:${tunnel.local_port} ${target}${portArg}`;
      case "dynamic":
        return `ssh -N -D ${tunnel.local_port} ${target}${portArg}`;
    }
  };

  const handleCopyCommand = (tunnel: Tunnel) => {
    const cmd = getSshCommand(tunnel);
    navigator.clipboard.writeText(cmd);
    setCopiedId(tunnel.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered tunnels
  const filteredTunnels = tunnels.filter((t) => {
    const host = hosts.find((h) => h.id === t.host_id);
    const matchesQuery =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (host?.label && host.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.local_port.toString().includes(searchQuery) ||
      (t.remote_port && t.remote_port.toString().includes(searchQuery));

    const matchesType = typeFilter === "all" || t.tunnel_type === typeFilter;
    return matchesQuery && matchesType;
  });

  // Calculate total bandwidth across all tunnels
  let totalBytesIn = 0;
  let totalBytesOut = 0;
  let runningCount = 0;

  for (const st of Object.values(statuses)) {
    if (st.status === "running") {
      runningCount++;
      totalBytesIn += st.bytes_in;
      totalBytesOut += st.bytes_out;
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      {/* Top Header */}
      <div className="h-16 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Port Forwarding & Tunnels</h2>
              {runningCount > 0 && (
                <span className="badge badge-sm badge-success gap-1 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-content animate-pulse" />
                  {runningCount} Active
                </span>
              )}
            </div>
            <p className="text-xs text-base-content/60">
              Encrypted Local, Remote, and Dynamic (SOCKS5) SSH tunnels
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Global bandwidth telemetry badge */}
          {runningCount > 0 && (
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-base-200 border border-base-300 text-xs">
              <div className="flex items-center gap-1 text-primary">
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span className="font-mono font-medium">{formatBytes(totalBytesIn)}</span>
              </div>
              <div className="w-px h-3 bg-base-300" />
              <div className="flex items-center gap-1 text-secondary">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span className="font-mono font-medium">{formatBytes(totalBytesOut)}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn btn-sm btn-primary gap-1.5 rounded-xl shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Tunnel</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="px-6 py-3 border-b border-base-200 bg-base-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Type tabs */}
        <div className="join bg-base-200/60 p-0.5 rounded-xl border border-base-200">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={`join-item btn btn-xs rounded-lg ${
              typeFilter === "all" ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70"
            }`}
          >
            All ({tunnels.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("local")}
            className={`join-item btn btn-xs rounded-lg ${
              typeFilter === "local" ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70"
            }`}
          >
            Local (-L)
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("remote")}
            className={`join-item btn btn-xs rounded-lg ${
              typeFilter === "remote" ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70"
            }`}
          >
            Remote (-R)
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("dynamic")}
            className={`join-item btn btn-xs rounded-lg ${
              typeFilter === "dynamic" ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70"
            }`}
          >
            Dynamic SOCKS5 (-D)
          </button>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tunnels or ports..."
            className="input input-xs input-bordered w-full pl-8 rounded-lg bg-base-200/50"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        {tunnels.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="border-2 border-dashed border-base-300 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg bg-base-200/20">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                <Network className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold">No Port Forwarding Tunnels</h3>
                <p className="text-xs text-base-content/60 mt-1.5 leading-relaxed">
                  Safely expose private databases, connect to remote services via Local Forwarding,
                  or route all app traffic securely through Dynamic SOCKS5 proxies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="btn btn-sm btn-primary gap-1.5 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Tunnel</span>
              </button>
            </div>
          </div>
        ) : filteredTunnels.length === 0 ? (
          <div className="text-center py-12 text-base-content/60 text-xs">
            No tunnels match your filter criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTunnels.map((tunnel) => {
              const host = hosts.find((h) => h.id === tunnel.host_id);
              const statusInfo = statuses[tunnel.id] || {
                tunnel_id: tunnel.id,
                status: "stopped",
                bytes_in: 0,
                bytes_out: 0,
                active_connections: 0,
              };

              const isRunning = statusInfo.status === "running";
              const isStarting = statusInfo.status === "starting" || actionInProgress[tunnel.id];
              const isError = statusInfo.status === "error";

              return (
                <div
                  key={tunnel.id}
                  className={`border rounded-2xl p-5 flex flex-col justify-between transition-all bg-base-100 ${
                    isRunning
                      ? "border-success/40 shadow-md shadow-success/5 ring-1 ring-success/20"
                      : isError
                        ? "border-error/40 bg-error/5"
                        : "border-base-200 hover:border-base-300 shadow-xs"
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-base-content">{tunnel.name}</h3>
                          {tunnel.tunnel_type === "local" && (
                            <span className="badge badge-xs badge-info font-semibold">Local -L</span>
                          )}
                          {tunnel.tunnel_type === "remote" && (
                            <span className="badge badge-xs badge-warning font-semibold">
                              Remote -R
                            </span>
                          )}
                          {tunnel.tunnel_type === "dynamic" && (
                            <span className="badge badge-xs badge-accent font-semibold">
                              Dynamic -D
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-base-content/60 mt-0.5 flex items-center gap-1">
                          <span>Via</span>
                          <span className="font-semibold text-base-content/80">
                            {host ? host.label : "Unknown Host"}
                          </span>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => handleDelete(tunnel.id, tunnel.name)}
                        className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-error transition-colors"
                        title="Delete Tunnel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Network Route Visualization */}
                    <div className="my-4 bg-base-200/50 rounded-xl p-3 border border-base-200 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate max-w-[85px] font-semibold">
                          {tunnel.tunnel_type === "remote"
                            ? `${tunnel.remote_port || "???"}`
                            : `${tunnel.local_port}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-base-content/40 text-[10px]">
                        <div className="h-px w-3 bg-base-content/30" />
                        <ArrowRight className="w-3 h-3 text-base-content/60" />
                        <div className="h-px w-3 bg-base-content/30" />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {tunnel.tunnel_type === "dynamic" ? (
                          <>
                            <Globe className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="text-[11px] font-sans font-semibold text-accent">
                              SOCKS5
                            </span>
                          </>
                        ) : (
                          <>
                            <Server className="w-3.5 h-3.5 text-secondary shrink-0" />
                            <span className="truncate max-w-[85px] font-semibold">
                              {tunnel.tunnel_type === "remote"
                                ? `${tunnel.local_port}`
                                : `${tunnel.remote_host || "127.0.0.1"}:${tunnel.remote_port}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status & Error */}
                    {isError && statusInfo.error_message && (
                      <div className="alert alert-error text-xs py-2 px-2.5 rounded-xl mb-3 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="break-all line-clamp-2">{statusInfo.error_message}</span>
                      </div>
                    )}

                    {/* Live Telemetry / Traffic */}
                    {isRunning && (
                      <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-base-200/40 border border-base-200 text-xs mb-4">
                        <div>
                          <div className="text-[10px] text-base-content/50 uppercase">Recv</div>
                          <div className="font-mono font-semibold text-primary text-[11px] flex items-center gap-0.5">
                            <ArrowDownRight className="w-3 h-3" />
                            <span>{formatBytes(statusInfo.bytes_in)}</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-base-content/50 uppercase">Sent</div>
                          <div className="font-mono font-semibold text-secondary text-[11px] flex items-center gap-0.5">
                            <ArrowUpRight className="w-3 h-3" />
                            <span>{formatBytes(statusInfo.bytes_out)}</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-base-content/50 uppercase">Clients</div>
                          <div className="font-mono font-semibold text-accent text-[11px] flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            <span>{statusInfo.active_connections}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-base-200 flex items-center justify-between gap-2 mt-auto">
                    {/* Copy SSH command */}
                    <button
                      type="button"
                      onClick={() => handleCopyCommand(tunnel)}
                      className="btn btn-ghost btn-xs gap-1 text-base-content/60 hover:text-base-content"
                      title="Copy OpenSSH command"
                    >
                      {copiedId === tunnel.id ? (
                        <>
                          <Check className="w-3 h-3 text-success" />
                          <span className="text-[11px] text-success">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[11px]">Copy SSH</span>
                        </>
                      )}
                    </button>

                    {/* Start / Stop Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggle(tunnel)}
                      disabled={isStarting}
                      className={`btn btn-xs rounded-lg gap-1.5 font-semibold ${
                        isRunning
                          ? "btn-error text-error-content shadow-xs"
                          : "btn-primary text-primary-content shadow-xs"
                      }`}
                    >
                      {isStarting ? (
                        <>
                          <span className="loading loading-spinner loading-xs" />
                          <span>Working...</span>
                        </>
                      ) : isRunning ? (
                        <>
                          <Square className="w-3 h-3 fill-current" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Start</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Tunnel Modal */}
      <TunnelModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
