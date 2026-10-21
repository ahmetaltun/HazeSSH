import { Activity, RefreshCw, AlertCircle, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useServerMonitorStore } from "@/stores/useServerMonitorStore";
import type { ServerMetrics } from "@/types/monitor";

interface ServerHealthGaugesProps {
  readonly hostId: string;
  readonly variant?: "card" | "table";
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(1)} ${units[idx]}`;
}

function getMetricStatusColor(percent?: number): string {
  if (percent === undefined || percent === null) return "text-base-content/40";
  if (percent < 65) return "text-success";
  if (percent < 85) return "text-warning";
  return "text-error";
}

function getProgressColor(percent?: number): string {
  if (percent === undefined || percent === null) return "progress-neutral";
  if (percent < 65) return "progress-success";
  if (percent < 85) return "progress-warning";
  return "progress-error";
}

export function ServerHealthGauges({ hostId, variant = "card" }: ServerHealthGaugesProps) {
  const { healthByHostId, fetchMetrics } = useServerMonitorStore();
  const hostHealth = healthByHostId[hostId];
  const isLoading = hostHealth?.isLoading ?? false;
  const metrics: ServerMetrics | undefined = hostHealth?.metrics;
  const error = hostHealth?.error;

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    void fetchMetrics(hostId);
  };

  if (variant === "table") {
    if (isLoading) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-base-content/60">
          <RefreshCw className="w-3 h-3 animate-spin text-primary" />
          <span className="text-[11px] font-mono">Probing...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div
          className="flex items-center gap-1 text-[11px] text-warning cursor-help"
          title={`Health check error: ${error}`}
        >
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[120px]">Offline / Unreachable</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="btn btn-ghost btn-xs btn-square p-0.5 ml-1"
            title="Retry probe"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (!metrics) {
      return (
        <button
          type="button"
          onClick={handleRefresh}
          className="btn btn-ghost btn-xs gap-1 text-[10px] opacity-60 hover:opacity-100"
          title="Query CPU, RAM & Disk metrics"
        >
          <Activity className="w-3 h-3" />
          <span>Probe</span>
        </button>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${getMetricStatusColor(
            metrics.cpu_usage_percent ?? undefined,
          )}`}
          title={`CPU Load: ${metrics.load_1m ?? 0} (${metrics.cpu_cores} cores)`}
        >
          <Cpu className="w-2.5 h-2.5" />
          <span>{metrics.cpu_usage_percent !== null && metrics.cpu_usage_percent !== undefined ? `${Math.round(metrics.cpu_usage_percent)}%` : "-"}</span>
        </div>

        <div
          className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${getMetricStatusColor(
            metrics.memory_usage_percent ?? undefined,
          )}`}
          title={`RAM: ${formatBytes(metrics.memory_used_bytes ?? undefined)} / ${formatBytes(
            metrics.memory_total_bytes ?? undefined,
          )}`}
        >
          <MemoryStick className="w-2.5 h-2.5" />
          <span>{metrics.memory_usage_percent !== null && metrics.memory_usage_percent !== undefined ? `${Math.round(metrics.memory_usage_percent)}%` : "-"}</span>
        </div>

        <div
          className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${getMetricStatusColor(
            metrics.disk_usage_percent ?? undefined,
          )}`}
          title={`Disk: ${formatBytes(metrics.disk_used_bytes ?? undefined)} / ${formatBytes(
            metrics.disk_total_bytes ?? undefined,
          )}`}
        >
          <HardDrive className="w-2.5 h-2.5" />
          <span>{metrics.disk_usage_percent !== null && metrics.disk_usage_percent !== undefined ? `${Math.round(metrics.disk_usage_percent)}%` : "-"}</span>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="btn btn-ghost btn-xs btn-square p-0 text-base-content/40 hover:text-base-content"
          title={`Refresh (Updated ${metrics.uptime_formatted ?? "recently"})`}
        >
          <RefreshCw className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  }

  // --- Card Variant ---
  if (isLoading) {
    return (
      <div className="bg-base-100/40 border border-base-300/40 rounded-lg p-2.5 space-y-1.5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-3 bg-base-300 rounded w-20" />
          <RefreshCw className="w-3 h-3 animate-spin text-primary" />
        </div>
        <div className="h-1.5 bg-base-300 rounded-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-warning/10 border border-warning/20 rounded-lg p-2 flex items-center justify-between text-warning text-xs">
        <div className="flex items-center gap-1.5 truncate pr-2" title={error}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-medium truncate">Check failed</span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="btn btn-ghost btn-xs btn-square text-warning"
          title="Retry probe"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-between bg-base-100/30 border border-base-300/30 rounded-lg px-2.5 py-1.5">
        <span className="text-[10px] text-base-content/50 font-mono">No telemetry</span>
        <button
          type="button"
          onClick={handleRefresh}
          className="btn btn-ghost btn-xs gap-1 text-[10px] text-primary hover:bg-primary/10 h-6 px-2 min-h-0"
        >
          <Activity className="w-3 h-3" />
          <span>Probe Health</span>
        </button>
      </div>
    );
  }

  const cpuPct = metrics.cpu_usage_percent ?? 0;
  const memPct = metrics.memory_usage_percent ?? 0;
  const diskPct = metrics.disk_usage_percent ?? 0;

  return (
    <div className="bg-base-100/60 border border-base-300/40 rounded-lg p-2.5 space-y-2 text-xs">
      {/* Top Header: Uptime & OS + Refresh */}
      <div className="flex items-center justify-between text-[10px] text-base-content/60 font-mono pb-1 border-b border-base-200/60">
        <span className="truncate max-w-[170px]" title={metrics.os_name ?? "Unix"}>
          {metrics.uptime_formatted ? `up ${metrics.uptime_formatted}` : (metrics.os_name ?? "Online")}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          className="btn btn-ghost btn-xs btn-square p-0 h-4 w-4 min-h-0 text-base-content/40 hover:text-primary transition-colors"
          title="Refresh server telemetry"
        >
          <RefreshCw className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Metric 1: CPU */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-base-content/60 flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5" /> CPU
          </span>
          <span
            className={`font-mono font-semibold ${getMetricStatusColor(cpuPct)}`}
            title={`Load 1m: ${metrics.load_1m ?? 0} on ${metrics.cpu_cores} core(s)`}
          >
            {Math.round(cpuPct)}%
          </span>
        </div>
        <progress
          className={`progress ${getProgressColor(cpuPct)} w-full h-1`}
          value={cpuPct}
          max={100}
        />
      </div>

      {/* Metric 2: RAM */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-base-content/60 flex items-center gap-1">
            <MemoryStick className="w-2.5 h-2.5" /> RAM
          </span>
          <span
            className={`font-mono font-semibold ${getMetricStatusColor(memPct)}`}
            title={`Used: ${formatBytes(metrics.memory_used_bytes ?? undefined)} / ${formatBytes(
              metrics.memory_total_bytes ?? undefined,
            )}`}
          >
            {Math.round(memPct)}%
          </span>
        </div>
        <progress
          className={`progress ${getProgressColor(memPct)} w-full h-1`}
          value={memPct}
          max={100}
        />
      </div>

      {/* Metric 3: Disk */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-base-content/60 flex items-center gap-1">
            <HardDrive className="w-2.5 h-2.5" /> Disk ({metrics.disk_mount_path || "/"})
          </span>
          <span
            className={`font-mono font-semibold ${getMetricStatusColor(diskPct)}`}
            title={`Used: ${formatBytes(metrics.disk_used_bytes ?? undefined)} / ${formatBytes(
              metrics.disk_total_bytes ?? undefined,
            )}`}
          >
            {Math.round(diskPct)}%
          </span>
        </div>
        <progress
          className={`progress ${getProgressColor(diskPct)} w-full h-1`}
          value={diskPct}
          max={100}
        />
      </div>
    </div>
  );
}
