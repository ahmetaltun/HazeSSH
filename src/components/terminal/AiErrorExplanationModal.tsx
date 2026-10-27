import { useState, useEffect } from "react";
import {
  Sparkles,
  AlertTriangle,
  Play,
  Copy,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { aiCopilotService } from "@/services/aiCopilotService";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { api } from "@/services/api";
import type { TerminalPane } from "@/types/terminal";
import type { AiErrorExplanation } from "@/types/ai";

const textEncoder = new TextEncoder();

interface AiErrorExplanationModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly pane: TerminalPane;
  readonly errorOutput: string;
  readonly failingCommand?: string;
}

export function AiErrorExplanationModal({
  isOpen,
  onClose,
  pane,
  errorOutput,
  failingCommand,
}: AiErrorExplanationModalProps) {
  const [explanation, setExplanation] = useState<AiErrorExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setExplanation(null);
    setCopied(false);

    aiCopilotService
      .explainError(errorOutput, failingCommand, {
        hostname: pane.title || pane.hostname,
        username: pane.username,
      })
      .then((res) => {
        if (!cancelled) {
          setExplanation(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, errorOutput, failingCommand, pane.title, pane.hostname, pane.username]);

  if (!isOpen) return null;

  const handleRunFix = async () => {
    if (!explanation?.fixCommand) return;
    const session = terminalSessionManager.getSession(pane.id);
    const sessionId = session?.sessionId;
    if (!sessionId) return;

    const payload = `${explanation.fixCommand}\n`;
    const bytes = Array.from(textEncoder.encode(payload));

    if (pane.connectionType === "local") {
      await api.ptyWrite(sessionId, bytes);
    } else if (pane.connectionType === "serial") {
      await api.serialWrite(sessionId, bytes);
    } else if (pane.connectionType === "telnet") {
      await api.telnetWrite(sessionId, bytes);
    } else {
      await api.sshWrite(sessionId, bytes);
    }

    onClose();
    session?.term.focus();
  };

  const handleCopyFix = async () => {
    if (!explanation?.fixCommand) return;
    try {
      await api.clipboardWriteText(explanation.fixCommand);
    } catch {
      await navigator.clipboard.writeText(explanation.fixCommand);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="modal modal-open bg-black/60 backdrop-blur-xs z-50 animate-in fade-in duration-150 select-text"
      onClick={onClose}
    >
      <div
        className="modal-box max-w-xl bg-base-100 border border-base-300 shadow-2xl p-5 flex flex-col gap-4 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-base-content flex items-center gap-2">
                <span>AI Error Diagnosis</span>
                <span className="badge badge-error badge-xs font-mono">Error Analysis</span>
              </h3>
              <p className="text-[11px] text-base-content/60">
                Root cause diagnosis and automated troubleshooting
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-square hover:bg-base-200 text-base-content/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-base-content/70">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
            <p className="font-mono text-xs">Analyzing terminal trace with AI Copilot...</p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Failed to diagnose error</p>
              <p className="font-mono text-[11px] break-all">{error}</p>
            </div>
          </div>
        )}

        {/* Diagnosis content */}
        {explanation && !isLoading && (
          <div className="flex flex-col gap-3">
            {/* Diagnosis summary banner */}
            <div className="p-3 rounded-lg bg-base-200/80 border border-base-300 flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold text-base-content/50 tracking-wider">
                Diagnosis
              </span>
              <p className="font-semibold text-sm text-base-content leading-snug">
                {explanation.summary}
              </p>
            </div>

            {/* Root cause explanation */}
            <div className="p-3 rounded-lg bg-base-200/40 border border-base-300 flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold text-base-content/50 tracking-wider flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-info" />
                <span>Why Did This Happen?</span>
              </span>
              <p className="text-base-content/85 leading-relaxed">
                {explanation.cause}
              </p>
            </div>

            {/* Recommended Fix Command */}
            {explanation.fixCommand && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/25 flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-primary tracking-wider">
                  Recommended Fix
                </span>
                <pre className="p-2.5 rounded-md bg-base-300 font-mono text-xs text-primary font-bold overflow-x-auto select-all">
                  {explanation.fixCommand}
                </pre>
                {explanation.fixExplanation && (
                  <p className="text-[11px] text-base-content/70">
                    {explanation.fixExplanation}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyFix}
                    className="btn btn-ghost btn-xs gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? "Copied" : "Copy Fix"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRunFix}
                    className="btn btn-primary btn-xs gap-1 font-bold shadow-xs"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run Fix in Terminal</span>
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible raw error trace */}
            <div className="border-t border-base-200 pt-2">
              <button
                type="button"
                onClick={() => setShowRawOutput(!showRawOutput)}
                className="flex items-center gap-1.5 text-base-content/60 hover:text-base-content text-[11px] font-mono cursor-pointer"
              >
                {showRawOutput ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>{showRawOutput ? "Hide Raw Output Trace" : "View Raw Output Trace"}</span>
              </button>

              {showRawOutput && (
                <pre className="mt-2 p-2.5 rounded-lg bg-base-300/80 font-mono text-[11px] max-h-48 overflow-y-auto text-base-content/75 whitespace-pre-wrap break-all">
                  {failingCommand ? `$ ${failingCommand}\n` : ""}
                  {errorOutput}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="modal-action m-0 border-t border-base-200 pt-3 flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
