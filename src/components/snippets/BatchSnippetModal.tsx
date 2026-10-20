import { useState, useEffect, useMemo } from "react";
import {
  Layers,
  X,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Server,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckSquare,
  Square,
  Copy,
  Check,
} from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { api } from "@/services/api";
import {
  resolveHostVariables,
  interpolateScript,
  parseSnippetVariables,
} from "@/services/snippetInterpolation";
import type { Snippet } from "@/types/snippet";
import type { Host } from "@/types/host";
import type { SshEvent } from "@/types/ssh";

interface BatchSnippetModalProps {
  readonly isOpen: boolean;
  readonly initialSnippet?: Snippet | null;
  readonly onClose: () => void;
}

type HostRunStatus = "pending" | "connecting" | "running" | "success" | "failed";

interface HostExecutionState {
  readonly hostId: string;
  readonly hostLabel: string;
  readonly hostname: string;
  readonly status: HostRunStatus;
  readonly logs: string[];
  readonly exitCode?: number;
  readonly durationMs?: number;
  readonly error?: string;
}

export function BatchSnippetModal({
  isOpen,
  initialSnippet,
  onClose,
}: BatchSnippetModalProps) {
  const { hosts, groups } = useHostStore();
  const { snippets } = useSnippetStore();
  const { openTab } = useMultiplexerStore();
  const { setActiveSection } = useLayoutStore();

  const [selectedSnippetId, setSelectedSnippetId] = useState<string>("");
  const [selectedHostIds, setSelectedHostIds] = useState<Set<string>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionMode, setExecutionMode] = useState<"headless" | "tabs">("headless");
  const [executionStates, setExecutionStates] = useState<Record<string, HostExecutionState>>({});
  const [expandedHostLogs, setExpandedHostLogs] = useState<Set<string>>(new Set());
  const [copiedScript, setCopiedScript] = useState(false);

  // Initialize selected snippet and target hosts
  useEffect(() => {
    if (!isOpen) return;

    if (initialSnippet) {
      setSelectedSnippetId(initialSnippet.id);
    } else if (snippets.length > 0) {
      setSelectedSnippetId(snippets[0].id);
    }

    // Default select all hosts initially
    setSelectedHostIds(new Set(hosts.map((h) => h.id)));
    setExecutionStates({});
    setExpandedHostLogs(new Set());
    setIsExecuting(false);
  }, [isOpen, initialSnippet, snippets, hosts]);

  const activeSnippet = useMemo(() => {
    return snippets.find((s) => s.id === selectedSnippetId) || null;
  }, [snippets, selectedSnippetId]);

  // Filter hosts by group
  const filteredHosts = useMemo(() => {
    if (selectedGroupId === "all") return hosts;
    return hosts.filter((h) => h.group_id === selectedGroupId);
  }, [hosts, selectedGroupId]);

  // Extract non-host prompt variables from active snippet
  const promptVariables = useMemo(() => {
    if (!activeSnippet) return [];
    const all = parseSnippetVariables(activeSnippet.script);
    return all.filter((v) => v.type === "prompt" || v.type === "custom");
  }, [activeSnippet]);

  // Initialize default prompt variable values
  useEffect(() => {
    if (!activeSnippet) return;
    const initialVals: Record<string, string> = {};
    for (const v of promptVariables) {
      initialVals[v.token] = v.defaultValue || "";
    }
    setVariableValues(initialVals);
  }, [activeSnippet, promptVariables]);

  if (!isOpen) return null;

  const handleToggleHost = (id: string) => {
    if (isExecuting) return;
    setSelectedHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (isExecuting) return;
    setSelectedHostIds(new Set(filteredHosts.map((h) => h.id)));
  };

  const handleDeselectAll = () => {
    if (isExecuting) return;
    setSelectedHostIds(new Set());
  };

  const toggleLogExpand = (hostId: string) => {
    setExpandedHostLogs((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) {
        next.delete(hostId);
      } else {
        next.add(hostId);
      }
      return next;
    });
  };

  const handleCopyCommand = async () => {
    if (!activeSnippet) return;
    const resolved = interpolateScript(activeSnippet.script, variableValues);
    try {
      await navigator.clipboard.writeText(resolved);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  };

  // Run the batch execution across all selected hosts
  const handleStartBatch = async () => {
    if (!activeSnippet || selectedHostIds.size === 0) return;

    const targetHosts = hosts.filter((h) => selectedHostIds.has(h.id));

    if (executionMode === "tabs") {
      // Interactive Mode: Open separate tabs for each host
      for (const host of targetHosts) {
        openTab(
          {
            hostId: host.id,
            hostname: host.hostname,
            username: host.username || undefined,
            port: host.port,
            title: `${host.label} (${host.hostname})`,
            status: "connecting",
          },
          host.label
        );
      }
      setActiveSection("terminal");
      onClose();
      return;
    }

    // Headless Mode: Initialize execution states
    const initialStates: Record<string, HostExecutionState> = {};
    for (const h of targetHosts) {
      initialStates[h.id] = {
        hostId: h.id,
        hostLabel: h.label,
        hostname: h.hostname,
        status: "pending",
        logs: [],
      };
    }
    setExecutionStates(initialStates);
    setIsExecuting(true);

    // Expand logs for the first target host by default
    if (targetHosts.length > 0) {
      setExpandedHostLogs(new Set([targetHosts[0].id]));
    }

    // Run concurrently across hosts
    await Promise.all(
      targetHosts.map((host) => runSnippetOnHost(host, activeSnippet, variableValues))
    );

    setIsExecuting(false);
  };

  const runSnippetOnHost = async (
    host: Host,
    snippet: Snippet,
    customVariables: Record<string, string>
  ) => {
    const startTime = Date.now();

    // 1. Resolve host context and custom parameters
    const { resolvedScript } = resolveHostVariables(snippet.script, {
      hostname: host.hostname,
      username: host.username,
      port: host.port,
      label: host.label,
    });
    const finalCommand = interpolateScript(resolvedScript, customVariables);

    // Update status to connecting
    setExecutionStates((prev) => ({
      ...prev,
      [host.id]: {
        ...prev[host.id],
        status: "connecting",
        logs: [`[${new Date().toLocaleTimeString()}] Connecting to ${host.hostname}:${host.port}...`],
      },
    }));

    try {
      const sessionId = await api.sshConnect({
        hostId: host.id,
        hostname: host.hostname,
        port: host.port,
        username: host.username || undefined,
        cols: 120,
        rows: 40,
        onEvent: (event: SshEvent) => {
          switch (event.type) {
            case "Data": {
              const text = new TextDecoder().decode(new Uint8Array(event.payload));
              setExecutionStates((prev) => {
                const existing = prev[host.id];
                if (!existing) return prev;
                return {
                  ...prev,
                  [host.id]: {
                    ...existing,
                    logs: [...existing.logs, text],
                  },
                };
              });
              break;
            }
            case "StatusChange": {
              if (event.payload.status === "connected") {
                setExecutionStates((prev) => ({
                  ...prev,
                  [host.id]: {
                    ...prev[host.id],
                    status: "running",
                    logs: [
                      ...prev[host.id].logs,
                      `[${new Date().toLocaleTimeString()}] Connected. Sending snippet command...`,
                    ],
                  },
                }));

                // Send snippet and append newline + exit to cleanly close after completion
                const fullCmd = `${finalCommand}\nexit\n`;
                const bytes = Array.from(new TextEncoder().encode(fullCmd));
                api.sshWrite(sessionId, bytes).catch((err) => {
                  console.error(`Failed to send command to ${host.hostname}:`, err);
                });
              }
              break;
            }
            case "Exit": {
              const code = event.payload.code;
              const durationMs = Date.now() - startTime;
              setExecutionStates((prev) => ({
                ...prev,
                [host.id]: {
                  ...prev[host.id],
                  status: code === 0 ? "success" : "failed",
                  exitCode: code,
                  durationMs,
                  logs: [
                    ...prev[host.id].logs,
                    `[${new Date().toLocaleTimeString()}] Process exited with code ${code} (${durationMs}ms)`,
                  ],
                },
              }));
              break;
            }
            case "Error": {
              const durationMs = Date.now() - startTime;
              setExecutionStates((prev) => ({
                ...prev,
                [host.id]: {
                  ...prev[host.id],
                  status: "failed",
                  durationMs,
                  error: event.payload,
                  logs: [
                    ...prev[host.id].logs,
                    `[${new Date().toLocaleTimeString()}] ERROR: ${event.payload}`,
                  ],
                },
              }));
              break;
            }
          }
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;
      setExecutionStates((prev) => ({
        ...prev,
        [host.id]: {
          ...prev[host.id],
          status: "failed",
          durationMs,
          error: msg,
          logs: [...(prev[host.id]?.logs || []), `Connection failed: ${msg}`],
        },
      }));
    }
  };

  const getStatusBadge = (status: HostRunStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="badge badge-xs badge-ghost text-base-content/50 gap-1 font-mono">
            <Clock className="w-2.5 h-2.5" />
            Pending
          </span>
        );
      case "connecting":
      case "running":
        return (
          <span className="badge badge-xs badge-info text-info-content gap-1 font-mono animate-pulse">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            {status === "connecting" ? "Connecting" : "Running"}
          </span>
        );
      case "success":
        return (
          <span className="badge badge-xs badge-success text-success-content gap-1 font-mono">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Success
          </span>
        );
      case "failed":
        return (
          <span className="badge badge-xs badge-error text-error-content gap-1 font-mono">
            <XCircle className="w-2.5 h-2.5" />
            Failed
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-base-100 border border-base-300 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Batch Snippet Runner</h3>
              <p className="text-xs text-base-content/60">
                Execute automated commands across multiple hosts simultaneously
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="btn btn-sm btn-circle btn-ghost text-base-content/60 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Row: Snippet Picker & Target Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Snippet Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <span>Select Snippet</span>
              </label>
              <select
                value={selectedSnippetId}
                onChange={(e) => setSelectedSnippetId(e.target.value)}
                disabled={isExecuting}
                className="select select-sm select-bordered w-full rounded-lg text-xs font-medium"
              >
                {snippets.map((snip) => (
                  <option key={snip.id} value={snip.id}>
                    {snip.title} {snip.run_on_connect ? "★" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Execution Strategy */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                Execution Strategy
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExecutionMode("headless")}
                  disabled={isExecuting}
                  className={`btn btn-sm text-xs rounded-lg ${
                    executionMode === "headless"
                      ? "btn-primary shadow-sm"
                      : "btn-ghost border border-base-300"
                  }`}
                >
                  Headless Output Board
                </button>
                <button
                  type="button"
                  onClick={() => setExecutionMode("tabs")}
                  disabled={isExecuting}
                  className={`btn btn-sm text-xs rounded-lg ${
                    executionMode === "tabs"
                      ? "btn-primary shadow-sm"
                      : "btn-ghost border border-base-300"
                  }`}
                >
                  Spawn Interactive Tabs
                </button>
              </div>
            </div>
          </div>

          {/* Prompt Variable Inputs (if any) */}
          {promptVariables.length > 0 && (
            <div className="p-4 rounded-xl border border-base-300 bg-base-200/30 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-base-content/70">
                <Sparkles className="w-3.5 h-3.5 text-warning" />
                <span>Custom Parameters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {promptVariables.map((v) => (
                  <div key={v.token} className="space-y-1">
                    <label className="text-[11px] font-medium text-base-content/80 flex items-center justify-between">
                      <span>{v.label}</span>
                      <code className="text-[9px] text-base-content/50 font-mono">
                        {v.token}
                      </code>
                    </label>
                    <input
                      type="text"
                      placeholder={v.defaultValue || "Value..."}
                      value={variableValues[v.token] ?? ""}
                      onChange={(e) =>
                        setVariableValues({ ...variableValues, [v.token]: e.target.value })
                      }
                      disabled={isExecuting}
                      className="input input-sm input-bordered w-full rounded-lg text-xs font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Script Preview Box */}
          {activeSnippet && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                  Command Preview
                </span>
                <button
                  type="button"
                  onClick={handleCopyCommand}
                  className="btn btn-xs btn-ghost gap-1 text-[11px] text-base-content/70"
                >
                  {copiedScript ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedScript ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="font-mono text-xs text-base-content/80 bg-base-300/60 p-3 rounded-xl border border-base-300 max-h-24 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                {interpolateScript(activeSnippet.script, variableValues)}
              </pre>
            </div>
          )}

          {/* Target Host Selection Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-secondary" />
                  <span>Target Hosts ({selectedHostIds.size} of {hosts.length} selected)</span>
                </label>
              </div>

              {/* Group Filter and Quick Selection */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={isExecuting}
                  className="select select-xs select-bordered rounded-lg text-xs"
                >
                  <option value="all">All Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={isExecuting}
                  className="btn btn-xs btn-ghost border border-base-300 rounded-lg gap-1"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>All</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={isExecuting}
                  className="btn btn-xs btn-ghost border border-base-300 rounded-lg gap-1"
                >
                  <Square className="w-3 h-3" />
                  <span>None</span>
                </button>
              </div>
            </div>

            {/* Host Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
              {filteredHosts.map((host) => {
                const isSelected = selectedHostIds.has(host.id);
                return (
                  <button
                    key={host.id}
                    type="button"
                    onClick={() => handleToggleHost(host.id)}
                    disabled={isExecuting}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-base-300 bg-base-200/40 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="checkbox checkbox-xs checkbox-primary rounded pointer-events-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs truncate text-base-content">
                        {host.label}
                      </div>
                      <div className="text-[10px] text-base-content/60 font-mono truncate">
                        {host.username ? `${host.username}@` : ""}{host.hostname}:{host.port}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Headless Results Output Board */}
          {Object.keys(executionStates).length > 0 && (
            <div className="space-y-3 pt-3 border-t border-base-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                  Execution Output Board
                </span>
                <span className="text-xs text-base-content/50 font-mono">
                  {Object.values(executionStates).filter((s) => s.status === "success").length} succeeded,{" "}
                  {Object.values(executionStates).filter((s) => s.status === "failed").length} failed
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.values(executionStates).map((exec) => {
                  const isExpanded = expandedHostLogs.has(exec.hostId);
                  return (
                    <div
                      key={exec.hostId}
                      className="border border-base-300 rounded-xl overflow-hidden bg-base-200/40"
                    >
                      <button
                        type="button"
                        onClick={() => toggleLogExpand(exec.hostId)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-base-200 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-base-content/60" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-base-content/60" />
                          )}
                          <span className="font-bold text-xs text-base-content">
                            {exec.hostLabel}
                          </span>
                          <span className="text-[11px] text-base-content/50 font-mono">
                            ({exec.hostname})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {exec.durationMs && (
                            <span className="text-[10px] text-base-content/50 font-mono">
                              {exec.durationMs}ms
                            </span>
                          )}
                          {getStatusBadge(exec.status)}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-3 bg-base-300/80 border-t border-base-300 max-h-40 overflow-y-auto">
                          <pre className="font-mono text-[11px] text-base-content/90 whitespace-pre-wrap break-all leading-relaxed">
                            {exec.logs.length > 0
                              ? exec.logs.join("")
                              : "Waiting for output..."}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-base-200 flex items-center justify-between bg-base-200/40">
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="btn btn-sm btn-ghost rounded-lg"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleStartBatch}
            disabled={isExecuting || !activeSnippet || selectedHostIds.size === 0}
            className="btn btn-sm btn-primary gap-1.5 rounded-lg px-6 shadow-sm"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Executing ({Object.values(executionStates).filter((s) => s.status === "running" || s.status === "connecting").length} running)...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {executionMode === "headless"
                    ? `Run on ${selectedHostIds.size} ${selectedHostIds.size === 1 ? "Host" : "Hosts"}`
                    : `Open ${selectedHostIds.size} ${selectedHostIds.size === 1 ? "Tab" : "Tabs"} & Execute`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
