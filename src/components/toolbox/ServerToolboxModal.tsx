import { useState, useMemo } from "react";
import {
  Boxes,
  Cpu,
  Radio,
  Activity,
  HardDrive,
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
  Skull,
  Network,
  Trash2,
  ExternalLink,
  MemoryStick,
  LayoutGrid,
  List,
} from "lucide-react";
import { useServerToolboxStore } from "@/stores/useServerToolboxStore";
import { useHostStore } from "@/stores/useHostStore";
import { useTunnelStore } from "@/stores/useTunnelStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import type { ContainerItem, ServiceItem, OpenPortItem } from "@/types/toolbox";

interface ParsedPort {
  hostPort?: string;
  containerPort: string;
  protocol: string;
  raw: string;
}

function parseContainerPorts(raw?: string): ParsedPort[] {
  if (!raw || !raw.trim()) return [];

  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const result: ParsedPort[] = [];

  for (const token of tokens) {
    if (token.includes("->")) {
      const [hostPart, containerPart] = token.split("->");
      const hostPort = hostPart.includes(":") ? hostPart.split(":").pop() : hostPart;
      const [contPort, proto] = (containerPart || "").split("/");
      const cleanProto = proto || "tcp";
      const key = `${hostPort}:${contPort}/${cleanProto}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          hostPort,
          containerPort: contPort || "",
          protocol: cleanProto,
          raw: `${hostPort} → ${contPort}/${cleanProto}`,
        });
      }
    } else {
      if (!seen.has(token)) {
        seen.add(token);
        const [contPort, proto] = token.split("/");
        result.push({
          containerPort: contPort || token,
          protocol: proto || "tcp",
          raw: token,
        });
      }
    }
  }

  return result;
}

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
    serviceLogs,
    killProcess,
    dockerPrune,
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
  const [serviceViewMode, setServiceViewMode] = useState<"cards" | "table">("cards");

  const [portSearch, setPortSearch] = useState("");
  const [portProtoFilter, setPortProtoFilter] = useState<"all" | "tcp" | "udp">("all");

  const [processSearch, setProcessSearch] = useState("");
  const [processSortBy, setProcessSortBy] = useState<"cpu" | "mem">("cpu");

  // Log Viewer State (Containers & Services)
  const [logViewerTitle, setLogViewerTitle] = useState<string | null>(null);
  const [logViewerSubtitle, setLogViewerSubtitle] = useState<string | null>(null);
  const [logsContent, setLogsContent] = useState<string>("");
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Success Feedback Toast
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleOpenContainerLogs = async (container: ContainerItem) => {
    if (!activeHostId) return;
    setLogViewerTitle(`Container Logs: ${container.names}`);
    setLogViewerSubtitle(`${container.image} (${container.id.slice(0, 12)})`);
    setIsLogsLoading(true);
    setLogsContent("");
    const logs = await containerLogs(activeHostId, container.id, 250);
    setLogsContent(logs);
    setIsLogsLoading(false);
  };

  const handleOpenServiceLogs = async (service: ServiceItem) => {
    if (!activeHostId) return;
    setLogViewerTitle(`Service Journal: ${service.unit}`);
    setLogViewerSubtitle(service.description || "systemd service unit");
    setIsLogsLoading(true);
    setLogsContent("");
    const logs = await serviceLogs(activeHostId, service.unit, 200);
    setLogsContent(logs);
    setIsLogsLoading(false);
  };

  // Service Lifecycle Actions
  const handleServiceAction = async (unit: string, action: "start" | "stop" | "restart") => {
    if (!activeHostId) return;
    const ok = await serviceAction(activeHostId, unit, action);
    if (ok) {
      const verb = action === "stop" ? "stopped" : action === "start" ? "started" : "restarted";
      showToast(`Service ${unit} ${verb} successfully`);
    }
  };

  const handleKillService = async (unit: string) => {
    if (!activeHostId) return;
    const confirmed = window.confirm(
      `Force terminate systemd service "${unit}"?\n\nThis immediately sends SIGKILL to all processes in the unit's cgroup.`
    );
    if (!confirmed) return;
    const ok = await serviceAction(activeHostId, unit, "kill");
    if (ok) {
      showToast(`Service ${unit} terminated with SIGKILL`);
    }
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

  // 1-Click Container Exec
  const handleExecContainer = (container: ContainerItem) => {
    if (!activeHost) return;
    closeToolbox();
    useLayoutStore.getState().setActiveSection("terminal");
    useMultiplexerStore.getState().openTab(
      {
        title: `${container.names} (sh)`,
        hostId: activeHost.id,
        hostname: activeHost.hostname,
        port: activeHost.port,
        username: activeHost.username ?? undefined,
      },
      `${container.names} (sh)`
    );
  };

  // 1-Click Port Forwarding
  const handleForwardPort = async (port: OpenPortItem) => {
    if (!activeHost) return;
    try {
      const tunnel = await useTunnelStore.getState().createTunnel({
        host_id: activeHost.id,
        name: `${activeHost.label || activeHost.hostname}:${port.local_port}`,
        tunnel_type: "local",
        local_host: "127.0.0.1",
        local_port: port.local_port,
        remote_host: "127.0.0.1",
        remote_port: port.local_port,
        auto_start: true,
      });
      void useTunnelStore.getState().startTunnel(tunnel.id);
      showToast(`Port forward tunnel active on localhost:${port.local_port} -> ${port.local_port}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      useServerToolboxStore.setState({ actionError: `Failed to create port forward: ${msg}` });
    }
  };

  // Kill Process
  const handleKillProcess = async (pid: number, name?: string) => {
    if (!activeHostId) return;
    const confirmed = window.confirm(`Terminate process PID ${pid} (${name || "process"}) on remote host?`);
    if (!confirmed) return;
    const ok = await killProcess(activeHostId, pid);
    if (ok) {
      showToast(`Process ${pid} terminated`);
    }
  };

  // Docker Prune
  const handleDockerPrune = async () => {
    if (!activeHostId) return;
    const confirmed = window.confirm("Run 'docker system prune -f' to clean all unused containers, networks, and build caches?");
    if (!confirmed) return;
    const res = await dockerPrune(activeHostId);
    showToast(res.slice(0, 100));
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

  // Filtered Processes
  const filteredProcesses = useMemo(() => {
    if (!overview?.processes) return [];
    const list = overview.processes.filter((p) => {
      return (
        p.command.toLowerCase().includes(processSearch.toLowerCase()) ||
        p.user.toLowerCase().includes(processSearch.toLowerCase()) ||
        p.pid.toString().includes(processSearch)
      );
    });
    return list.sort((a, b) =>
      processSortBy === "cpu" ? b.cpu_percent - a.cpu_percent : b.memory_percent - a.memory_percent
    );
  }, [overview?.processes, processSearch, processSortBy]);

  if (!isOpen || !activeHostId) {
    return null;
  }

  const runningContainersCount = overview?.containers.filter((c) => c.state === "running").length ?? 0;
  const activeServicesCount = overview?.services.filter((s) => s.active_state === "active").length ?? 0;
  const failedServicesCount = overview?.services.filter((s) => s.active_state === "failed").length ?? 0;
  const inactiveServicesCount = (overview?.services.length ?? 0) - activeServicesCount - failedServicesCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="bg-base-100 border border-base-300 w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
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

        {/* Success Toast */}
        {successToast && (
          <div className="px-6 py-2 bg-success/15 border-b border-success/30 flex items-center gap-2 text-xs text-success font-mono animate-in fade-in">
            <Check className="w-4 h-4 shrink-0" />
            <span className="truncate">{successToast}</span>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1 px-6 pt-2 border-b border-base-300 bg-base-100 select-none overflow-x-auto">
          {/* Tab 1: Containers */}
          <button
            type="button"
            onClick={() => setActiveTab("containers")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
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

          {/* Tab 2: Services */}
          <button
            type="button"
            onClick={() => setActiveTab("services")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "services"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Services</span>
            {overview?.systemd_installed ? (
              <span className={`badge badge-xs font-mono ${failedServicesCount > 0 ? "badge-error font-bold" : "badge-neutral"}`}>
                {overview.services.length}
                {failedServicesCount > 0 ? ` (${failedServicesCount} fail)` : ""}
              </span>
            ) : (
              <span className="badge badge-xs font-mono badge-ghost opacity-60">N/A</span>
            )}
          </button>

          {/* Tab 3: Listening Ports */}
          <button
            type="button"
            onClick={() => setActiveTab("ports")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
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

          {/* Tab 4: Top Processes */}
          <button
            type="button"
            onClick={() => setActiveTab("processes")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "processes"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Top Processes</span>
            {overview?.processes && (
              <span className="badge badge-xs font-mono badge-neutral">
                {overview.processes.length}
              </span>
            )}
          </button>

          {/* Tab 5: Storage & Mounts */}
          <button
            type="button"
            onClick={() => setActiveTab("storage")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "storage"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Storage & Disks</span>
            {overview?.storage && (
              <span className="badge badge-xs font-mono badge-neutral">
                {overview.storage.length}
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
              <span>Querying remote system telemetry, containers, processes, and disks...</span>
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
                        <div className="space-y-3">
                          {filteredContainers.map((container) => {
                            const isRunning = container.state === "running";
                            const parsedPorts = parseContainerPorts(container.ports);
                            return (
                              <div
                                key={container.id}
                                className="bg-base-200/40 hover:bg-base-200/70 border border-base-300 rounded-xl p-4 transition-all duration-150 shadow-xs space-y-3"
                              >
                                {/* Tier 1: Identity & Action Controls */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                          isRunning
                                            ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                            : "bg-base-content/30"
                                        }`}
                                      />
                                      <h4 className="font-mono font-bold text-sm text-base-content break-all">
                                        {container.names}
                                      </h4>
                                      <span className="badge badge-ghost badge-xs font-mono">
                                        {container.id.slice(0, 12)}
                                      </span>
                                      <span className="badge badge-neutral badge-xs font-mono">
                                        {container.engine}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs font-mono text-base-content/60 flex-wrap">
                                      <span className="text-primary font-medium">{container.image}</span>
                                      <span>•</span>
                                      <span>{container.status}</span>
                                    </div>
                                  </div>

                                  {/* Actions Toolbar */}
                                  <div className="flex items-center gap-1.5 shrink-0 self-start">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenContainerLogs(container)}
                                      className="btn btn-ghost btn-xs gap-1 font-mono text-[11px]"
                                      title="View container stdout / stderr logs"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span>Logs</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleExecContainer(container)}
                                      className="btn btn-ghost btn-xs gap-1 font-mono text-[11px] text-secondary hover:bg-secondary/10"
                                      title="Open new terminal tab with shell inside container"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      <span>Exec</span>
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
                                          <RotateCw className="w-3.5 h-3.5" />
                                          <span>Restart</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void containerAction(activeHostId, container.id, "stop")}
                                          disabled={isActionLoading}
                                          className="btn btn-ghost btn-xs text-error gap-1 font-mono text-[11px]"
                                          title="Stop container"
                                        >
                                          <Square className="w-3.5 h-3.5 fill-current" />
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
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>Start</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Tier 2: Live Metrics Bar & Port Popover */}
                                <div className="pt-2.5 border-t border-base-300/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                                  {/* Live Metrics Chips */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {container.cpu_percent ? (
                                      <div
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-base-100 border border-base-300/80 shadow-2xs"
                                        title="Live CPU usage"
                                      >
                                        <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                                        <span className="text-base-content/60 text-[11px]">CPU</span>
                                        <span className="font-bold text-primary">{container.cpu_percent}</span>
                                      </div>
                                    ) : null}

                                    {container.memory_usage ? (
                                      <div
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-base-100 border border-base-300/80 shadow-2xs"
                                        title="Live RAM usage"
                                      >
                                        <MemoryStick className="w-3.5 h-3.5 text-secondary shrink-0" />
                                        <span className="text-base-content/60 text-[11px]">RAM</span>
                                        <span className="font-bold text-secondary">
                                          {container.memory_usage.split("/")[0]?.trim() || container.memory_usage}
                                        </span>
                                        {container.memory_percent && (
                                          <span className="text-[10px] text-base-content/40">
                                            ({container.memory_percent})
                                          </span>
                                        )}
                                      </div>
                                    ) : null}

                                    {!container.cpu_percent && !container.memory_usage && (
                                      <span className="text-[11px] text-base-content/40 italic">
                                        {isRunning ? "Awaiting telemetry..." : "Container is offline"}
                                      </span>
                                    )}
                                  </div>

                                  {/* Ports Clickable Popover */}
                                  {parsedPorts.length > 0 ? (
                                    <div className="dropdown dropdown-end dropdown-top">
                                      <div
                                        tabIndex={0}
                                        role="button"
                                        className="btn btn-ghost btn-xs gap-1.5 font-mono text-[11px] border border-base-300 bg-base-100 shadow-2xs hover:border-primary/50"
                                        title="Click to view all port mappings"
                                      >
                                        <Network className="w-3.5 h-3.5 text-primary" />
                                        <span>
                                          {parsedPorts.length} {parsedPorts.length === 1 ? "Port" : "Ports"}
                                        </span>
                                      </div>
                                      <div
                                        tabIndex={0}
                                        className="dropdown-content z-30 p-3 shadow-2xl bg-base-100 border border-base-300 rounded-xl w-72 text-xs space-y-2"
                                      >
                                        <div className="flex items-center justify-between pb-1.5 border-b border-base-200">
                                          <span className="font-bold text-base-content text-[11px] uppercase tracking-wider">
                                            Port Mappings
                                          </span>
                                          <span className="badge badge-ghost badge-xs font-mono">
                                            {parsedPorts.length} active
                                          </span>
                                        </div>
                                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                          {parsedPorts.map((p, idx) => (
                                            <div
                                              key={idx}
                                              className="flex items-center justify-between p-1.5 rounded-lg bg-base-200/50 hover:bg-base-200 font-mono text-xs"
                                            >
                                              <div className="flex items-center gap-1.5">
                                                {p.hostPort ? (
                                                  <>
                                                    <span className="font-bold text-primary">{p.hostPort}</span>
                                                    <span className="text-base-content/40">→</span>
                                                    <span>{p.containerPort}</span>
                                                  </>
                                                ) : (
                                                  <span>{p.containerPort}</span>
                                                )}
                                                <span className="badge badge-xs font-mono uppercase badge-neutral">
                                                  {p.protocol}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-base-content/40 font-mono">
                                      No exposed ports
                                    </span>
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
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                          <input
                            type="text"
                            placeholder="Search units or description..."
                            value={serviceSearch}
                            onChange={(e) => setServiceSearch(e.target.value)}
                            className="input input-xs input-bordered w-full pl-7 pr-7 font-mono text-xs h-7"
                          />
                          {serviceSearch && (
                            <button
                              type="button"
                              onClick={() => setServiceSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
                              title="Clear search"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[11px] font-mono text-base-content/50 hidden lg:inline">
                            {filteredServices.length} of {overview.services.length}
                          </span>

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
                              Active ({activeServicesCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setServiceStateFilter("failed")}
                              className={`join-item btn btn-xs ${
                                serviceStateFilter === "failed"
                                  ? "btn-active btn-error"
                                  : failedServicesCount > 0
                                  ? "btn-ghost text-error font-bold"
                                  : "btn-ghost"
                              }`}
                            >
                              Failed ({failedServicesCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setServiceStateFilter("inactive")}
                              className={`join-item btn btn-xs ${serviceStateFilter === "inactive" ? "btn-active btn-primary" : "btn-ghost"}`}
                            >
                              Inactive ({inactiveServicesCount})
                            </button>
                          </div>

                          {/* View Mode Toggle */}
                          <div className="join border border-base-300 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setServiceViewMode("cards")}
                              className={`join-item btn btn-xs gap-1 ${serviceViewMode === "cards" ? "btn-primary" : "btn-ghost"}`}
                              title="Compact Cards Layout"
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Cards</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setServiceViewMode("table")}
                              className={`join-item btn btn-xs gap-1 ${serviceViewMode === "table" ? "btn-primary" : "btn-ghost"}`}
                              title="Compact Table Layout"
                            >
                              <List className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Table</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Services Content */}
                      {filteredServices.length === 0 ? (
                        <div className="p-8 text-center text-xs text-base-content/50 font-mono border border-base-300 rounded-xl">
                          No services found matching current filters.
                        </div>
                      ) : serviceViewMode === "table" ? (
                        /* Compact High-Density Table Layout */
                        <div className="border border-base-300 rounded-xl overflow-hidden bg-base-100 shadow-2xs">
                          <div className="overflow-x-auto max-h-[calc(88vh-260px)]">
                            <table className="table table-xs table-pin-rows w-full font-mono">
                              <thead>
                                <tr className="bg-base-200/90 backdrop-blur-xs font-mono text-[11px] text-base-content/70">
                                  <th className="py-2 pl-3">Service Unit</th>
                                  <th className="py-2">State</th>
                                  <th className="py-2">Description</th>
                                  <th className="py-2 pr-3 text-right w-36">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-base-200/80 font-mono text-xs">
                                {filteredServices.map((service) => {
                                  const isActive = service.active_state === "active";
                                  const isFailed = service.active_state === "failed";
                                  return (
                                    <tr key={service.unit} className="hover:bg-base-200/40 transition-colors h-8">
                                      {/* Unit Name + Status Indicator */}
                                      <td className="py-1 pl-3 font-semibold whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                              isActive
                                                ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                                                : isFailed
                                                ? "bg-error shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse"
                                                : "bg-base-content/30"
                                            }`}
                                          />
                                          <span className="font-bold text-base-content">{service.unit}</span>
                                          {service.load_state !== "loaded" && (
                                            <span
                                              className="badge badge-warning badge-xs font-mono text-[9px] px-1 py-0"
                                              title={`Load state: ${service.load_state}`}
                                            >
                                              {service.load_state}
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      {/* Combined State & Substate */}
                                      <td className="py-1 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            className={`badge badge-xs font-mono ${
                                              isActive
                                                ? "badge-success font-semibold"
                                                : isFailed
                                                ? "badge-error font-bold uppercase"
                                                : "badge-ghost"
                                            }`}
                                          >
                                            {service.active_state}
                                          </span>
                                          <span className="text-[10px] text-base-content/50">
                                            ({service.sub_state})
                                          </span>
                                        </div>
                                      </td>

                                      {/* Description */}
                                      <td className="py-1 text-base-content/70 max-w-md truncate" title={service.description}>
                                        {service.description || "—"}
                                      </td>

                                      {/* Compact Action Icon Buttons */}
                                      <td className="py-1 pr-3 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenServiceLogs(service)}
                                            className="btn btn-ghost btn-xs btn-square hover:bg-base-300 text-base-content/70 hover:text-base-content"
                                            title={`View journalctl logs for ${service.unit}`}
                                          >
                                            <Terminal className="w-3.5 h-3.5" />
                                          </button>

                                          {isActive ? (
                                            <button
                                              type="button"
                                              onClick={() => void handleServiceAction(service.unit, "stop")}
                                              disabled={isActionLoading}
                                              className="btn btn-ghost btn-xs btn-square text-warning hover:bg-warning/20"
                                              title={`systemctl stop ${service.unit}`}
                                            >
                                              <Square className="w-3 h-3 fill-current" />
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => void handleServiceAction(service.unit, "start")}
                                              disabled={isActionLoading}
                                              className="btn btn-ghost btn-xs btn-square text-success hover:bg-success/20"
                                              title={`systemctl start ${service.unit}`}
                                            >
                                              <Play className="w-3 h-3 fill-current" />
                                            </button>
                                          )}

                                          <button
                                            type="button"
                                            onClick={() => void handleServiceAction(service.unit, "restart")}
                                            disabled={isActionLoading}
                                            className="btn btn-ghost btn-xs btn-square hover:bg-base-300 text-base-content/70 hover:text-base-content"
                                            title={`systemctl restart ${service.unit}`}
                                          >
                                            <RotateCw className="w-3.5 h-3.5" />
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => void handleKillService(service.unit)}
                                            disabled={isActionLoading}
                                            className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/20"
                                            title={`Force kill service with SIGKILL (${service.unit})`}
                                          >
                                            <Skull className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        /* Compact Single-Row Cards Layout */
                        <div className="space-y-1.5 max-h-[calc(88vh-260px)] overflow-y-auto pr-1">
                          {filteredServices.map((service) => {
                            const isActive = service.active_state === "active";
                            const isFailed = service.active_state === "failed";
                            return (
                              <div
                                key={service.unit}
                                className="bg-base-200/40 hover:bg-base-200/70 border border-base-300 rounded-lg px-3 py-1.5 transition-all duration-100 flex items-center justify-between gap-3 shadow-2xs font-mono text-xs h-9"
                              >
                                {/* Left: Unit Identity, State & Description */}
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isActive
                                        ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                                        : isFailed
                                        ? "bg-error shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse"
                                        : "bg-base-content/30"
                                    }`}
                                  />
                                  <span
                                    className="font-bold text-base-content truncate shrink-0 max-w-[200px]"
                                    title={service.unit}
                                  >
                                    {service.unit}
                                  </span>
                                  <span
                                    className={`badge badge-xs font-mono shrink-0 ${
                                      isActive
                                        ? "badge-success font-semibold"
                                        : isFailed
                                        ? "badge-error font-bold uppercase"
                                        : "badge-ghost"
                                    }`}
                                  >
                                    {service.active_state}
                                  </span>
                                  <span className="text-[10px] text-base-content/40 shrink-0">
                                    ({service.sub_state})
                                  </span>
                                  <span
                                    className="text-base-content/60 truncate hidden md:inline flex-1 text-[11px]"
                                    title={service.description}
                                  >
                                    {service.description || "—"}
                                  </span>
                                </div>

                                {/* Right: Compact Action Buttons */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenServiceLogs(service)}
                                    className="btn btn-ghost btn-xs btn-square hover:bg-base-300 text-base-content/70 hover:text-base-content"
                                    title={`View logs for ${service.unit}`}
                                  >
                                    <Terminal className="w-3.5 h-3.5" />
                                  </button>

                                  {isActive ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleServiceAction(service.unit, "stop")}
                                      disabled={isActionLoading}
                                      className="btn btn-ghost btn-xs btn-square text-warning hover:bg-warning/20"
                                      title={`systemctl stop ${service.unit}`}
                                    >
                                      <Square className="w-3 h-3 fill-current" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void handleServiceAction(service.unit, "start")}
                                      disabled={isActionLoading}
                                      className="btn btn-ghost btn-xs btn-square text-success hover:bg-success/20"
                                      title={`systemctl start ${service.unit}`}
                                    >
                                      <Play className="w-3 h-3 fill-current" />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => void handleServiceAction(service.unit, "restart")}
                                    disabled={isActionLoading}
                                    className="btn btn-ghost btn-xs btn-square hover:bg-base-300 text-base-content/70 hover:text-base-content"
                                    title={`systemctl restart ${service.unit}`}
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => void handleKillService(service.unit)}
                                    disabled={isActionLoading}
                                    className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/20"
                                    title={`Force kill service with SIGKILL (${service.unit})`}
                                  >
                                    <Skull className="w-3.5 h-3.5" />
                                  </button>
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
                          <th>Binding & Exposure</th>
                          <th>Process / Service</th>
                          <th>PID</th>
                          <th className="text-right">Actions</th>
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
                          filteredPorts.map((port, idx) => {
                            const isPublic =
                              port.local_address === "0.0.0.0" ||
                              port.local_address === "::" ||
                              port.local_address === "*";
                            return (
                              <tr key={`${port.protocol}-${port.local_port}-${idx}`} className="hover:bg-base-200/30">
                                <td>
                                  <span className="badge badge-neutral badge-xs font-mono uppercase font-bold">
                                    {port.protocol}
                                  </span>
                                </td>
                                <td className="font-bold text-primary text-sm">{port.local_port}</td>
                                <td>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-base-content/80">{port.local_address}</span>
                                    <span
                                      className={`badge badge-xs font-mono ${
                                        isPublic ? "badge-warning font-semibold" : "badge-success"
                                      }`}
                                      title={isPublic ? "Publicly exposed on all network interfaces" : "Bound to localhost / internal only"}
                                    >
                                      {isPublic ? "Public" : "Internal"}
                                    </span>
                                  </div>
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
                                <td className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleForwardPort(port)}
                                      className="btn btn-ghost btn-xs gap-1 font-mono text-[10px] text-primary hover:bg-primary/10"
                                      title="Open local SSH port forward tunnel"
                                    >
                                      <Network className="w-3 h-3" />
                                      <span>Forward</span>
                                    </button>

                                    {port.pid && (
                                      <button
                                        type="button"
                                        onClick={() => void handleKillProcess(port.pid!, port.process)}
                                        className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                                        title={`Kill process PID ${port.pid}`}
                                      >
                                        <Skull className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: TOP PROCESSES */}
              {activeTab === "processes" && (
                <div className="space-y-4">
                  {/* Filter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                      <input
                        type="text"
                        placeholder="Search command, user, or PID..."
                        value={processSearch}
                        onChange={(e) => setProcessSearch(e.target.value)}
                        className="input input-sm input-bordered w-full pl-8 font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-base-content/60 font-mono">Sort by:</span>
                      <div className="join">
                        <button
                          type="button"
                          onClick={() => setProcessSortBy("cpu")}
                          className={`join-item btn btn-xs ${processSortBy === "cpu" ? "btn-active btn-primary" : "btn-ghost"}`}
                        >
                          CPU %
                        </button>
                        <button
                          type="button"
                          onClick={() => setProcessSortBy("mem")}
                          className={`join-item btn btn-xs ${processSortBy === "mem" ? "btn-active btn-primary" : "btn-ghost"}`}
                        >
                          Memory %
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Processes Table */}
                  <div className="border border-base-300 rounded-xl overflow-hidden">
                    <table className="table table-xs w-full">
                      <thead>
                        <tr className="bg-base-200/60 font-mono text-[11px]">
                          <th>PID</th>
                          <th>User</th>
                          <th>CPU %</th>
                          <th>Memory %</th>
                          <th>Command</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-base-200 font-mono text-xs">
                        {filteredProcesses.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-6 text-base-content/40">
                              No active processes found matching current query.
                            </td>
                          </tr>
                        ) : (
                          filteredProcesses.map((proc) => {
                            const isCpuHeavy = proc.cpu_percent > 30;
                            const isMemHeavy = proc.memory_percent > 25;
                            return (
                              <tr key={proc.pid} className="hover:bg-base-200/30">
                                <td className="font-mono text-primary font-bold">{proc.pid}</td>
                                <td className="text-base-content/70">{proc.user}</td>
                                <td>
                                  <span
                                    className={`badge badge-xs font-mono ${
                                      isCpuHeavy ? "badge-error font-bold" : "badge-ghost"
                                    }`}
                                  >
                                    {proc.cpu_percent.toFixed(1)}%
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`badge badge-xs font-mono ${
                                      isMemHeavy ? "badge-warning font-bold" : "badge-ghost"
                                    }`}
                                  >
                                    {proc.memory_percent.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="text-base-content truncate max-w-md" title={proc.command}>
                                  {proc.command}
                                </td>
                                <td className="text-right">
                                  <button
                                    type="button"
                                    onClick={() => void handleKillProcess(proc.pid, proc.command.split(" ")[0])}
                                    className="btn btn-ghost btn-xs text-error gap-1 text-[10px] hover:bg-error/10"
                                    title={`Kill PID ${proc.pid}`}
                                  >
                                    <Skull className="w-3 h-3" />
                                    <span>Kill</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: STORAGE & MOUNTS */}
              {activeTab === "storage" && (
                <div className="space-y-6">
                  {/* Storage Mounts Grid */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/60 font-mono">
                      Mounted Filesystems & Disks
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {overview?.storage.map((mount) => {
                        const isFull = mount.usage_percent > 85;
                        const isWarning = mount.usage_percent > 70;
                        return (
                          <div
                            key={mount.mount_point}
                            className="bg-base-200/40 border border-base-300 rounded-xl p-4 space-y-2.5 font-mono text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate">
                                <HardDrive className="w-4 h-4 text-primary shrink-0" />
                                <span className="font-bold text-sm text-base-content truncate">
                                  {mount.mount_point}
                                </span>
                              </div>
                              <span
                                className={`font-bold ${
                                  isFull ? "text-error" : isWarning ? "text-warning" : "text-success"
                                }`}
                              >
                                {mount.usage_percent}%
                              </span>
                            </div>

                            <progress
                              className={`progress w-full h-2 ${
                                isFull ? "progress-error" : isWarning ? "progress-warning" : "progress-success"
                              }`}
                              value={mount.usage_percent}
                              max={100}
                            />

                            <div className="flex items-center justify-between text-[11px] text-base-content/60">
                              <span>Used: {mount.used_size} / {mount.total_size}</span>
                              <span>Available: {mount.available_size}</span>
                            </div>

                            <div className="text-[10px] text-base-content/40 truncate">
                              Device: {mount.filesystem}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Docker Storage Breakdown */}
                  {overview?.docker_disk_usage && (
                    <div className="border border-base-300 rounded-xl p-5 bg-base-200/30 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Boxes className="w-4 h-4 text-primary" />
                          <h4 className="font-bold text-xs uppercase font-mono tracking-wider">
                            Docker Engine Space Usage
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDockerPrune()}
                          className="btn btn-ghost btn-xs text-error gap-1 font-mono text-[10px] hover:bg-error/10"
                          title="Prune unused docker images, volumes, and caches"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Prune Cache</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                        <div className="p-3 bg-base-100 border border-base-300 rounded-lg space-y-1">
                          <div className="text-[10px] text-base-content/50">Images</div>
                          <div className="font-bold text-sm text-base-content">
                            {overview.docker_disk_usage.images_size || "0 B"}
                          </div>
                        </div>

                        <div className="p-3 bg-base-100 border border-base-300 rounded-lg space-y-1">
                          <div className="text-[10px] text-base-content/50">Containers</div>
                          <div className="font-bold text-sm text-base-content">
                            {overview.docker_disk_usage.containers_size || "0 B"}
                          </div>
                        </div>

                        <div className="p-3 bg-base-100 border border-base-300 rounded-lg space-y-1">
                          <div className="text-[10px] text-base-content/50">Local Volumes</div>
                          <div className="font-bold text-sm text-base-content">
                            {overview.docker_disk_usage.volumes_size || "0 B"}
                          </div>
                        </div>

                        <div className="p-3 bg-base-100 border border-base-300 rounded-lg space-y-1">
                          <div className="text-[10px] text-base-content/50">Build Cache</div>
                          <div className="font-bold text-sm text-base-content">
                            {overview.docker_disk_usage.build_cache_size || "0 B"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Embedded Sub-Modal: Unified Log Viewer (Containers & Services) */}
      {logViewerTitle && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-6 animate-in fade-in duration-150">
          <div className="bg-base-100 border border-base-300 w-full max-w-4xl h-[75vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-base-300 bg-base-200/60 select-none">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="font-mono text-sm font-bold truncate max-w-md">
                  {logViewerTitle}
                </h3>
                {logViewerSubtitle && (
                  <span className="badge badge-ghost badge-xs font-mono truncate max-w-xs">
                    {logViewerSubtitle}
                  </span>
                )}
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
                  onClick={() => setLogViewerTitle(null)}
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
                  <span>Fetching journalctl / stdout logs...</span>
                </div>
              ) : logsContent ? (
                logsContent
              ) : (
                <div className="text-gray-500 italic">No logs found.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
