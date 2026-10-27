import { useState, useMemo } from "react";
import {
  Boxes,
  Cpu,
  Radio,
  RefreshCw,
  X,
  Play,
  Square,
  RotateCw,
  Terminal,
  AlertCircle,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { useServerToolboxStore } from "@/stores/useServerToolboxStore";
import { useHostStore } from "@/stores/useHostStore";
import type { ContainerItem } from "@/types/toolbox";

export function ServerToolboxModal() {
  const {
    isOpen,
    activeHostId,
    activeTab,
    dataByHostId,
    isActionLoading,
    actionError,
    closeToolbox,
    setActiveTab,
    fetchToolboxData,
    containerAction,
    containerLogs,
    serviceAction,
  } = useServerToolboxStore();

  const hosts = useHostStore((state) => state.hosts);
  const activeHost = useMemo(
    () => hosts.find((h) => h.id === activeHostId),
    [hosts, activeHostId]
  );

  const hostState = activeHostId ? dataByHostId[activeHostId] : undefined;
  const overview = hostState?.overview;
  const isLoading = hostState?.isLoading ?? false;
  const error = hostState?.error;

  // Search & Filters
  const [containerSearch, setContainerSearch] = useState("");
  const [containerStateFilter, setContainerStateFilter] = useState<"all" | "running" | "stopped">("all");

  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceStateFilter, setServiceStateFilter] = useState<"all" | "active" | "failed" | "inactive">("all");

  const [portSearch, setPortSearch] = useState("");
  const [portProtoFilter, setPortProtoFilter] = useState<"all" | "tcp" | "udp">("all");

  // Log Viewer Modal State
  const [viewingLogsContainer, setViewingLogsContainer] = useState<ContainerItem | null>(null);
  const [logsContent, setLogsContent] = useState<string>("");
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleOpenLogs = async (container: ContainerItem) => {
    if (!activeHostId) return;
    setViewingLogsContainer(container);
    setIsLogsLoading(true);
    setLogsContent("");
    const logs = await containerLogs(activeHostId, container.id, 200);
    setLogsContent(logs);
    setIsLogsLoading(false);
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logsContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  // Filtered Containers
  const filteredContainers = useMemo(() => {
    if (!overview?.containers) return [];
    return overview.containers.filter((c) => {
      const matchSearch =
        c.names.toLowerCase().includes(containerSearch.toLowerCase()) ||
        c.image.toLowerCase().includes(containerSearch.toLowerCase()) ||
        c.id.toLowerCase().includes(containerSearch.toLowerCase());
      if (!matchSearch) return false;

      if (containerStateFilter === "running") return c.state === "running";
      if (containerStateFilter === "stopped") return c.state !== "running";
      return true;
    });
  }, [overview?.containers, containerSearch, containerStateFilter]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    if (!overview?.services) return [];
    return overview.services.filter((s) => {
      const matchSearch =
        s.unit.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        s.description.toLowerCase().includes(serviceSearch.toLowerCase());
      if (!matchSearch) return false;

      if (serviceStateFilter === "active") return s.active_state === "active";
      if (serviceStateFilter === "failed") return s.active_state === "failed";
      if (serviceStateFilter === "inactive") return s.active_state !== "active" && s.active_state !== "failed";
      return true;
    });
  }, [overview?.services, serviceSearch, serviceStateFilter]);

  // Filtered Ports
  const filteredPorts = useMemo(() => {
    if (!overview?.ports) return [];
    return overview.ports.filter((p) => {
      const matchSearch =
        p.local_port.toString().includes(portSearch) ||
        (p.process?.toLowerCase() ?? "").includes(portSearch.toLowerCase()) ||
        p.local_address.includes(portSearch);
      if (!matchSearch) return false;

      if (portProtoFilter === "tcp") return p.protocol.startsWith("tcp");
      if (portProtoFilter === "udp") return p.protocol.startsWith("udp");
      return true;
    });
  }, [overview?.ports, portSearch, portProtoFilter]);

  if (!isOpen || !activeHostId) {
    return null;
  }

  const runningContainersCount = overview?.containers.filter((c) => c.state === "running").length ?? 0;
  const failedServicesCount = overview?.services.filter((s) => s.active_state === "failed").length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="bg-base-100 border border-base-300 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300/80 bg-base-200/50 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-base-content">
                  {activeHost?.label || "Remote Server"}
                </h2>
                <span className="badge badge-neutral badge-sm font-mono">
                  {activeHost?.hostname}:{activeHost?.port}
                </span>
              </div>
              <p className="text-xs text-base-content/60 font-mono">
                Agentless System Inspection & Live Remote Hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchToolboxData(activeHostId)}
              disabled={isLoading || isActionLoading}
              className="btn btn-ghost btn-sm gap-1.5 font-mono text-xs"
              title="Refresh server inspection telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
              <span>{isLoading ? "Probing..." : "Refresh"}</span>
            </button>
            <button
              type="button"
              onClick={closeToolbox}
              className="btn btn-ghost btn-sm btn-square"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Error Banner if action failed */}
        {actionError && (
          <div className="px-6 py-2 bg-error/10 border-b border-error/20 flex items-center justify-between text-xs text-error">
            <div className="flex items-center gap-2 truncate">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{actionError}</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-base-300 bg-base-100 select-none">
          <button
            type="button"
            onClick={() => setActiveTab("containers")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "containers"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Containers</span>
            {overview?.docker_installed ? (
              <span className="badge badge-xs font-mono badge-primary">
                {runningContainersCount}/{overview.containers.length}
              </span>
            ) : (
              <span className="badge badge-xs font-mono badge-ghost opacity-60">N/A</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("services")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "services"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Services</span>
            {overview?.systemd_installed ? (
              <span className={`badge badge-xs font-mono ${failedServicesCount > 0 ? "badge-error" : "badge-neutral"}`}>
                {overview.services.length}
                {failedServicesCount > 0 ? ` (${failedServicesCount} fail)` : ""}
              </span>
            ) : (
              <span className="badge badge-xs font-mono badge-ghost opacity-60">N/A</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ports")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "ports"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Listening Ports</span>
            {overview?.ports && (
              <span className="badge badge-xs font-mono badge-neutral">
                {overview.ports.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-base-100">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
              <div className="p-3 bg-error/10 text-error rounded-2xl">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm font-bold text-base-content">Failed to inspect remote host</h3>
                <p className="text-xs text-base-content/60 font-mono">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => void fetchToolboxData(activeHostId)}
                className="btn btn-primary btn-sm gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Probe</span>
              </button>
            </div>
          ) : isLoading && !overview ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3 py-16 text-base-content/60 font-mono text-xs">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <span>Querying remote systemd, docker, and network listeners...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: CONTAINERS */}
              {activeTab === "containers" && (
                <div className="space-y-4">
                  {!overview?.docker_installed ? (
                    <div className="p-8 border border-dashed border-base-300 rounded-2xl text-center space-y-2">
                      <Boxes className="w-8 h-8 text-base-content/40 mx-auto" />
                      <h4 className="text-sm font-semibold">No Container Engine Found</h4>
                      <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                        Neither Docker nor Podman was detected in standard PATH on this server.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Filter Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                          <input
                            type="text"
                            placeholder="Search containers..."
                            value={containerSearch}
                            onChange={(e) => setContainerSearch(e.target.value)}
                            className="input input-sm input-bordered w-full pl-8 font-mono text-xs"
                          />
                        </div>

                        <div className="join">
                          <button
                            type="button"
                            onClick={() => setContainerStateFilter("all")}
                            className={`join-item btn btn-xs ${containerStateFilter === "all" ? "btn-active btn-primary" : "btn-ghost"}`}
                          >
                            All ({overview.containers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setContainerStateFilter("running")}
                            className={`join-item btn btn-xs ${containerStateFilter === "running" ? "btn-active btn-primary" : "btn-ghost"}`}
                          >
                            Running ({runningContainersCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setContainerStateFilter("stopped")}
                            className={`join-item btn btn-xs ${containerStateFilter === "stopped" ? "btn-active btn-primary" : "btn-ghost"}`}
                          >
                            Stopped ({overview.containers.length - runningContainersCount})
                          </button>
                        </div>
                      </div>

                      {/* Containers Grid / List */}
                      {filteredContainers.length === 0 ? (
                        <div className="p-8 text-center text-xs text-base-content/50 font-mono">
                          No containers matched the current filter.
                        </div>
                      ) : (
                        <div className="border border-base-300 rounded-xl overflow-hidden divide-y divide-base-200">
                          {filteredContainers.map((container) => {
                            const isRunning = container.state === "running";
                            return (
                              <div
                                key={container.id}
                                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-base-200/40 transition-colors"
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-2 h-2 rounded-full ${isRunning ? "bg-success" : "bg-base-content/30"}`}
                                    />
                                    <span className="font-mono font-bold text-sm text-base-content truncate">
                                      {container.names}
                                    </span>
                                    <span className="badge badge-ghost badge-xs font-mono">
                                      {container.id.slice(0, 12)}
                                    </span>
                                    <span className="badge badge-neutral badge-xs font-mono">
                                      {container.engine}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60 font-mono">
                                    <span className="text-primary truncate max-w-xs">{container.image}</span>
                                    <span>•</span>
                                    <span>{container.status}</span>
                                  </div>

                                  {container.ports && (
                                    <div className="text-[11px] font-mono text-base-content/50 truncate pt-0.5">
                                      Ports: {container.ports}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLogs(container)}
                                    className="btn btn-ghost btn-xs gap-1 font-mono text-[11px]"
                                    title="View container logs"
                                  >
                                    <Terminal className="w-3 h-3" />
                                    <span>Logs</span>
                                  </button>

                                  {isRunning ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void containerAction(activeHostId, container.id, "restart")}
                                        disabled={isActionLoading}
                                        className="btn btn-ghost btn-xs gap-1 font-mono text-[11px]"
                                        title="Restart container"
                                      >
                                        <RotateCw className="w-3 h-3" />
                                        <span>Restart</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void containerAction(activeHostId, container.id, "stop")}
                                        disabled={isActionLoading}
                                        className="btn btn-ghost btn-xs text-error gap-1 font-mono text-[11px]"
                                        title="Stop container"
                                      >
                                        <Square className="w-3 h-3 fill-current" />
                                        <span>Stop</span>
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void containerAction(activeHostId, container.id, "start")}
                                      disabled={isActionLoading}
                                      className="btn btn-ghost btn-xs text-success gap-1 font-mono text-[11px]"
                                      title="Start container"
                                    >
                                      <Play className="w-3 h-3 fill-current" />
                                      <span>Start</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: SERVICES */}
              {activeTab === "services" && (
                <div className="space-y-4">
                  {!overview?.systemd_installed ? (
                    <div className="p-8 border border-dashed border-base-300 rounded-2xl text-center space-y-2">
                      <Cpu className="w-8 h-8 text-base-content/40 mx-auto" />
                      <h4 className="text-sm font-semibold">systemd Not Detected</h4>
                      <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                        This host does not appear to run systemd as its init daemon.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Filter Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                          <input
                            type="text"
                            placeholder="Search systemd units..."
                            value={serviceSearch}
                            onChange={(e) => setServiceSearch(e.target.value)}
                            className="input input-sm input-bordered w-full pl-8 font-mono text-xs"
                          />
                        </div>

                        <div className="join">
                          <button
                            type="button"
                            onClick={() => setServiceStateFilter("all")}
                            className={`join-item btn btn-xs ${serviceStateFilter === "all" ? "btn-active btn-primary" : "btn-ghost"}`}
                          >
                            All ({overview.services.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setServiceStateFilter("active")}
                            className={`join-item btn btn-xs ${serviceStateFilter === "active" ? "btn-active btn-primary" : "btn-ghost"}`}
                          >
                            Active
                          </button>
                          <button
                            type="button"
                            onClick={() => setServiceStateFilter("failed")}
                            className={`join-item btn btn-xs ${serviceStateFilter === "failed" ? "btn-active btn-error" : "btn-ghost text-error"}`}
                          >
                            Failed ({failedServicesCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setServiceStateFilter("inactive")}
                            className={`join-item btn btn-xs ${serviceStateFilter === "inactive" ? "btn-active btn-primary" : "btn-ghost"}`}
                          >
                            Inactive
                          </button>
                        </div>
                      </div>

                      {/* Services Table */}
                      <div className="border border-base-300 rounded-xl overflow-hidden">
                        <table className="table table-xs w-full">
                          <thead>
                            <tr className="bg-base-200/60 font-mono text-[11px]">
                              <th>Service Unit</th>
                              <th>Status</th>
                              <th>Substate</th>
                              <th>Description</th>
                              <th className="text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-base-200 font-mono text-xs">
                            {filteredServices.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center py-6 text-base-content/40">
                                  No services found matching current filters.
                                </td>
                              </tr>
                            ) : (
                              filteredServices.map((service) => {
                                const isActive = service.active_state === "active";
                                const isFailed = service.active_state === "failed";
                                return (
                                  <tr key={service.unit} className="hover:bg-base-200/30">
                                    <td className="font-semibold">{service.unit}</td>
                                    <td>
                                      <span
                                        className={`badge badge-xs font-mono ${
                                          isActive
                                            ? "badge-success"
                                            : isFailed
                                            ? "badge-error"
                                            : "badge-ghost"
                                        }`}
                                      >
                                        {service.active_state}
                                      </span>
                                    </td>
                                    <td className="text-base-content/60">{service.sub_state}</td>
                                    <td className="text-base-content/70 max-w-sm truncate" title={service.description}>
                                      {service.description || "—"}
                                    </td>
                                    <td className="text-right">
                                      <button
                                        type="button"
                                        onClick={() => void serviceAction(activeHostId, service.unit, "restart")}
                                        disabled={isActionLoading}
                                        className="btn btn-ghost btn-xs gap-1 text-[11px]"
                                        title={`systemctl restart ${service.unit}`}
                                      >
                                        <RotateCw className="w-3 h-3" />
                                        <span>Restart</span>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: OPEN PORTS */}
              {activeTab === "ports" && (
                <div className="space-y-4">
                  {/* Filter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                      <input
                        type="text"
                        placeholder="Search ports or process..."
                        value={portSearch}
                        onChange={(e) => setPortSearch(e.target.value)}
                        className="input input-sm input-bordered w-full pl-8 font-mono text-xs"
                      />
                    </div>

                    <div className="join">
                      <button
                        type="button"
                        onClick={() => setPortProtoFilter("all")}
                        className={`join-item btn btn-xs ${portProtoFilter === "all" ? "btn-active btn-primary" : "btn-ghost"}`}
                      >
                        All ({overview?.ports.length ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPortProtoFilter("tcp")}
                        className={`join-item btn btn-xs ${portProtoFilter === "tcp" ? "btn-active btn-primary" : "btn-ghost"}`}
                      >
                        TCP
                      </button>
                      <button
                        type="button"
                        onClick={() => setPortProtoFilter("udp")}
                        className={`join-item btn btn-xs ${portProtoFilter === "udp" ? "btn-active btn-primary" : "btn-ghost"}`}
                      >
                        UDP
                      </button>
                    </div>
                  </div>

                  {/* Ports Table */}
                  <div className="border border-base-300 rounded-xl overflow-hidden">
                    <table className="table table-xs w-full">
                      <thead>
                        <tr className="bg-base-200/60 font-mono text-[11px]">
                          <th>Protocol</th>
                          <th>Port</th>
                          <th>Local Address</th>
                          <th>State</th>
                          <th>Process / Service</th>
                          <th>PID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-base-200 font-mono text-xs">
                        {filteredPorts.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-6 text-base-content/40">
                              No open socket listeners found.
                            </td>
                          </tr>
                        ) : (
                          filteredPorts.map((port, idx) => (
                            <tr key={`${port.protocol}-${port.local_port}-${idx}`} className="hover:bg-base-200/30">
                              <td>
                                <span className="badge badge-neutral badge-xs font-mono uppercase font-bold">
                                  {port.protocol}
                                </span>
                              </td>
                              <td className="font-bold text-primary">{port.local_port}</td>
                              <td className="text-base-content/70">{port.local_address}</td>
                              <td>
                                <span className="badge badge-ghost badge-xs">{port.state}</span>
                              </td>
                              <td className="font-semibold text-base-content">
                                {port.process ? (
                                  <span className="badge badge-primary/15 text-primary badge-sm font-mono">
                                    {port.process}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="text-base-content/50">{port.pid ?? "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-modal: Container Log Viewer */}
      {viewingLogsContainer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-6 animate-in fade-in duration-150">
          <div className="bg-base-100 border border-base-300 w-full max-w-4xl h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-base-300 bg-base-200/60 select-none">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="font-mono text-sm font-bold truncate max-w-md">
                  Logs: {viewingLogsContainer.names}
                </h3>
                <span className="badge badge-ghost badge-xs font-mono">
                  {viewingLogsContainer.image}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={!logsContent}
                  className="btn btn-ghost btn-xs gap-1 font-mono"
                  title="Copy logs to clipboard"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingLogsContainer(null)}
                  className="btn btn-ghost btn-xs btn-square"
                  title="Close Logs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-black text-gray-200 p-4 font-mono text-xs overflow-y-auto whitespace-pre-wrap select-text">
              {isLogsLoading ? (
                <div className="flex items-center justify-center h-full text-base-content/50">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  <span>Fetching container stdout / stderr...</span>
                </div>
              ) : logsContent ? (
                logsContent
              ) : (
                <div className="text-gray-500 italic">No output produced by container yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
