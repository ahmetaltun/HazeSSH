import { useState, useEffect, useMemo } from "react";
import {
  Terminal,
  Play,
  X,
  Copy,
  Check,
  Sparkles,
  Server,
  AlertCircle,
  Laptop,
} from "lucide-react";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import { useHostStore } from "@/stores/useHostStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import {
  resolveHostVariables,
  interpolateScript,
} from "@/services/snippetInterpolation";
import type { Snippet } from "@/types/snippet";

interface SnippetRunnerModalProps {
  readonly isOpen: boolean;
  readonly snippet: Snippet | null;
  readonly onClose: () => void;
}

export function SnippetRunnerModal({
  isOpen,
  snippet,
  onClose,
}: SnippetRunnerModalProps) {
  const { getAllSessions, getActiveSession } = useTerminalRegistryStore();
  const { hosts } = useHostStore();
  const { openTab } = useMultiplexerStore();
  const { setActiveSection } = useLayoutStore();

  const sessions = getAllSessions();
  const activeSession = getActiveSession();

  // Target mode: "session" (running in an already connected terminal) or "new_host" (connect to host)
  const [targetType, setTargetType] = useState<"session" | "new_host">("session");
  const [selectedPaneId, setSelectedPaneId] = useState<string>("");
  const [selectedHostId, setSelectedHostId] = useState<string>("");

  // Parameter values: token -> user value
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isCopied, setIsCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize target and variables when opened
  useEffect(() => {
    if (!isOpen || !snippet) return;

    setErrorMessage(null);
    setIsCopied(false);
    setIsExecuting(false);

    if (sessions.length > 0) {
      setTargetType("session");
      const defaultPaneId = activeSession ? activeSession.paneId : sessions[0].paneId;
      setSelectedPaneId(defaultPaneId);
    } else {
      setTargetType("new_host");
      if (hosts.length > 0) {
        setSelectedHostId(hosts[0].id);
      }
    }
  }, [isOpen, snippet, sessions.length, activeSession, hosts]);

  // Determine current host context based on selected destination
  const currentHostContext = useMemo(() => {
    if (targetType === "session") {
      const sess = sessions.find((s) => s.paneId === selectedPaneId);
      if (!sess) return null;
      return {
        hostname: sess.hostname,
        username: sess.username,
        port: sess.port,
        label: sess.title,
      };
    } else {
      const host = hosts.find((h) => h.id === selectedHostId);
      if (!host) return null;
      return {
        hostname: host.hostname,
        username: host.username,
        port: host.port,
        label: host.label,
      };
    }
  }, [targetType, selectedPaneId, selectedHostId, sessions, hosts]);

  // Compute partially resolved script and remaining interactive variables
  const { resolvedScript, remainingVariables } = useMemo(() => {
    if (!snippet) {
      return { resolvedScript: "", remainingVariables: [] };
    }
    return resolveHostVariables(snippet.script, currentHostContext);
  }, [snippet, currentHostContext]);

  // Synchronize initial default values for remaining variables
  useEffect(() => {
    if (!isOpen) return;

    setVariableValues((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const v of remainingVariables) {
        if (next[v.token] === undefined) {
          next[v.token] = v.defaultValue || "";
        }
      }
      return next;
    });
  }, [isOpen, remainingVariables]);

  // Compute the final interpolated script preview
  const finalScript = useMemo(() => {
    if (!resolvedScript) return "";
    return interpolateScript(resolvedScript, variableValues);
  }, [resolvedScript, variableValues]);

  // Check if any prompt or custom variables remain empty
  const missingVariables = useMemo(() => {
    return remainingVariables.filter((v) => !variableValues[v.token]?.trim());
  }, [remainingVariables, variableValues]);

  if (!isOpen || !snippet) return null;

  const handleVariableChange = (token: string, value: string) => {
    setVariableValues((prev) => ({
      ...prev,
      [token]: value,
    }));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(finalScript);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy interpolated command:", err);
    }
  };

  const handleExecute = async () => {
    setErrorMessage(null);
    setIsExecuting(true);

    try {
      if (targetType === "session") {
        const session = sessions.find((s) => s.paneId === selectedPaneId);
        if (!session) {
          throw new Error("Target terminal session is no longer available. Please select another.");
        }
        await session.sendCommand(finalScript);
        setActiveSection("terminal");
        onClose();
      } else {
        const host = hosts.find((h) => h.id === selectedHostId);
        if (!host) {
          throw new Error("Selected host was not found. Please pick an existing host.");
        }
        // Open new terminal tab connected to this host
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
        setActiveSection("terminal");
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Execution failed: ${msg}`);
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-base-100 border border-base-300 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-success/10 text-success flex items-center justify-center">
              <Play className="w-5 h-5 ml-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">Run Snippet</h3>
                <span className="badge badge-sm badge-ghost font-mono text-[11px]">
                  {snippet.title}
                </span>
              </div>
              <p className="text-xs text-base-content/60">
                Configure parameters and select terminal destination
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-base-content/60 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="alert alert-error text-xs py-2.5 px-3 rounded-xl flex items-center gap-2 shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Destination Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span>Execution Destination</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Active Connected Sessions */}
              <button
                type="button"
                onClick={() => setTargetType("session")}
                disabled={sessions.length === 0}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                  targetType === "session"
                    ? "border-primary bg-primary/5 text-base-content shadow-sm"
                    : "border-base-300 bg-base-200/30 text-base-content/70 hover:bg-base-200/60"
                } ${sessions.length === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Laptop className="w-4 h-4 text-primary" />
                    <span>Active Terminal Session</span>
                  </div>
                  <span className="badge badge-xs font-mono">
                    {sessions.length} open
                  </span>
                </div>
                <p className="text-[11px] text-base-content/60">
                  Send commands directly into an active, connected shell
                </p>
              </button>

              {/* Option 2: Connect to Host in New Tab */}
              <button
                type="button"
                onClick={() => setTargetType("new_host")}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
                  targetType === "new_host"
                    ? "border-primary bg-primary/5 text-base-content shadow-sm"
                    : "border-base-300 bg-base-200/30 text-base-content/70 hover:bg-base-200/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Server className="w-4 h-4 text-secondary" />
                    <span>New Tab on Host</span>
                  </div>
                  <span className="badge badge-xs font-mono">
                    {hosts.length} saved
                  </span>
                </div>
                <p className="text-[11px] text-base-content/60">
                  Open a new SSH session to a saved host profile
                </p>
              </button>
            </div>

            {/* Sub-selector Dropdown */}
            {targetType === "session" ? (
              <div className="pt-1">
                <select
                  value={selectedPaneId}
                  onChange={(e) => setSelectedPaneId(e.target.value)}
                  className="select select-sm select-bordered w-full rounded-lg text-xs"
                >
                  {sessions.map((sess) => (
                    <option key={sess.paneId} value={sess.paneId}>
                      {sess.title} ({sess.username ? `${sess.username}@` : ""}{sess.hostname || "local"})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="pt-1">
                <select
                  value={selectedHostId}
                  onChange={(e) => setSelectedHostId(e.target.value)}
                  className="select select-sm select-bordered w-full rounded-lg text-xs"
                >
                  {hosts.map((host) => (
                    <option key={host.id} value={host.id}>
                      {host.label} — {host.username ? `${host.username}@` : ""}{host.hostname}:{host.port}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Dynamic Variables Prompt Form */}
          {remainingVariables.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-base-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-warning" />
                  <span>Interactive Parameters</span>
                </label>
                <span className="text-[11px] text-base-content/50">
                  {remainingVariables.length} variable{remainingVariables.length === 1 ? "" : "s"} required
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {remainingVariables.map((v) => (
                  <div key={v.token} className="space-y-1">
                    <label className="text-xs font-medium text-base-content/80 flex items-center justify-between">
                      <span>{v.label}</span>
                      <code className="text-[10px] text-base-content/50 font-mono">
                        {v.token}
                      </code>
                    </label>
                    <input
                      type="text"
                      placeholder={v.defaultValue ? `Default: ${v.defaultValue}` : "Enter value..."}
                      value={variableValues[v.token] ?? ""}
                      onChange={(e) => handleVariableChange(v.token, e.target.value)}
                      className="input input-sm input-bordered w-full rounded-lg text-xs font-mono focus:input-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Real-time Interpolated Command Preview */}
          <div className="space-y-1.5 pt-2 border-t border-base-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                Command Preview
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-xs btn-ghost gap-1 text-[11px] text-base-content/70 hover:text-base-content"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3 text-success" />
                    <span className="text-success">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div className="rounded-xl border border-base-300 bg-base-300/60 p-3 max-h-36 overflow-y-auto">
              <pre className="font-mono text-xs text-base-content/90 whitespace-pre-wrap break-all leading-relaxed">
                {finalScript}
              </pre>
            </div>
            {missingVariables.length > 0 && (
              <p className="text-[11px] text-warning flex items-center gap-1 pt-0.5">
                <AlertCircle className="w-3 h-3" />
                <span>
                  {missingVariables.length} variable{missingVariables.length === 1 ? " is" : "s are"} currently empty.
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-base-200 flex items-center justify-between bg-base-200/40">
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="btn btn-sm btn-ghost rounded-lg"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-sm btn-outline border-base-300 gap-1.5 rounded-lg text-xs"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Command</span>
            </button>

            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting || (!selectedPaneId && !selectedHostId)}
              className="btn btn-sm btn-success text-success-content gap-1.5 rounded-lg px-5 shadow-sm"
            >
              {isExecuting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {targetType === "session" ? "Run in Terminal" : "Connect & Run"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
