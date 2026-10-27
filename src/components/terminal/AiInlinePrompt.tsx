import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  Sparkles,
  Send,
  AlertTriangle,
  Play,
  ArrowRightToLine,
  Copy,
  X,
  Loader2,
  Check,
  ShieldCheck,
} from "lucide-react";
import { useAiCopilotStore } from "@/stores/useAiCopilotStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { aiCopilotService } from "@/services/aiCopilotService";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { api } from "@/services/api";
import type { TerminalPane } from "@/types/terminal";
import type { AiGeneratedCommand } from "@/types/ai";

const textEncoder = new TextEncoder();

interface AiInlinePromptProps {
  readonly pane: TerminalPane;
  readonly isFocused?: boolean;
}

export function AiInlinePrompt({ pane }: AiInlinePromptProps) {
  const {
    isEnabled,
    activeProvider,
    isPromptOpen,
    activePaneId,
    closePrompt,
    isGenerating,
    setEnabled,
  } = useAiCopilotStore();

  const isVisible = isPromptOpen && activePaneId === pane.id;

  const [prompt, setPrompt] = useState("");
  const [generated, setGenerated] = useState<AiGeneratedCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible) {
      setPrompt("");
      setGenerated(null);
      setError(null);
      setCopied(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isVisible]);

  const handleGenerate = async (e?: FormEvent) => {
    e?.preventDefault();
    const query = prompt.trim();
    if (!query || isGenerating) return;

    setError(null);
    setGenerated(null);

    try {
      const recentBuffer = terminalSessionManager.getRecentBuffer(pane.id, 25);
      const res = await aiCopilotService.generateCommand(query, {
        hostname: pane.title || pane.hostname,
        username: pane.username,
        recentBuffer,
      });
      setGenerated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const writeToSession = async (text: string, sendEnter: boolean) => {
    const session = terminalSessionManager.getSession(pane.id);
    const sessionId = session?.sessionId;
    if (!sessionId) return;

    const payload = sendEnter ? `${text}\n` : text;
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

    closePrompt();
    session?.term.focus();
  };

  const handleRun = () => {
    if (!generated?.command) return;
    void writeToSession(generated.command, true);
  };

  const handleInsert = () => {
    if (!generated?.command) return;
    void writeToSession(generated.command, false);
  };

  const handleCopy = async () => {
    if (!generated?.command) return;
    try {
      await api.clipboardWriteText(generated.command);
    } catch {
      await navigator.clipboard.writeText(generated.command);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Window-level capture listener ensures Enter (Run), Tab (Insert), and Esc (Dismiss)
  // always work regardless of whether input, buttons, or card surface has focus.
  useEffect(() => {
    if (!isVisible) return;

    const handleWindowKeyDown = (e: globalThis.KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      const isKeyI = e.key.toLowerCase() === "i" || e.code === "KeyI";

      // Dismiss (Esc or ⌘I / Ctrl+I)
      if (e.key === "Escape" || (isMetaOrCtrl && !e.altKey && !e.shiftKey && isKeyI)) {
        e.preventDefault();
        e.stopPropagation();
        closePrompt();
        terminalSessionManager.getSession(pane.id)?.term.focus();
        return;
      }

      if (isGenerating) return;

      // When a command has been generated, intercept Tab and Enter
      if (generated?.command) {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          handleInsert();
          return;
        }

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          handleRun();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
    };
  }, [isVisible, isGenerating, generated, pane.id]);

  const isLocalProvider = activeProvider === "ollama" || activeProvider === "lmstudio";

  if (!isVisible) return null;

  return (
    <div
      className="absolute bottom-2 left-2 right-2 z-30 flex flex-col bg-base-200/95 backdrop-blur-md border border-primary/40 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 select-text"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-base-300/60 border-b border-base-content/10 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="font-semibold text-base-content/90">AI Shell Copilot</span>
          <span className="badge badge-xs badge-neutral font-mono uppercase">{activeProvider}</span>
          {isLocalProvider && (
            <span
              className="badge badge-xs badge-success gap-1 text-[10px] font-mono"
              title="100% Offline: Data never leaves your device"
            >
              <ShieldCheck className="w-2.5 h-2.5" />
              100% Local
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            closePrompt();
            terminalSessionManager.getSession(pane.id)?.term.focus();
          }}
          className="btn btn-ghost btn-xs btn-square hover:bg-base-300 text-base-content/60"
          title="Dismiss (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!isEnabled ? (
        <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-base-100/60">
          <div className="flex items-start gap-2.5 text-base-content/80 text-[11px] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-base-content block">
                AI Shell Copilot is currently off
              </span>
              <span className="text-base-content/65">
                Privacy-first and 100% telemetry-free. Prompts and keys stay on your local device.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                useLayoutStore.getState().setView("settings");
                closePrompt();
              }}
              className="btn btn-xs btn-outline text-xs"
            >
              Configure
            </button>
            <button
              type="button"
              onClick={() => {
                setEnabled(true);
                setTimeout(() => inputRef.current?.focus(), 60);
              }}
              className="btn btn-xs btn-primary font-bold shadow-xs gap-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>Enable Copilot</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Input bar */}
          <form onSubmit={handleGenerate} className="p-2 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (generated) setGenerated(null);
                if (error) setError(null);
              }}
              placeholder="Ask in English: e.g. find all logs modified today over 50MB..."
              className="input input-sm input-bordered flex-1 bg-base-100 font-mono text-xs focus:border-primary focus:outline-hidden"
              disabled={isGenerating}
            />

            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              className="btn btn-primary btn-sm gap-1 px-3"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Generate</span>
                </>
              )}
            </button>
          </form>

          {/* Error display */}
          {error && (
            <div className="mx-2 mb-2 p-2 rounded-lg bg-error/15 border border-error/30 text-error text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-mono break-all">{error}</span>
            </div>
          )}

          {/* Generated command preview & actions */}
          {generated && (
            <div className="mx-2 mb-2 p-2.5 rounded-lg bg-base-100/90 border border-base-300 flex flex-col gap-2">
              {/* Danger alert badge */}
              {generated.isDangerous && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-error/20 border border-error/40 text-error text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Warning: {generated.dangerReason || "Destructive or high-risk command"}</span>
                </div>
              )}

              {/* Code block */}
              <div className="relative group">
                <pre className="p-2.5 rounded-md bg-base-300 font-mono text-xs text-primary font-bold overflow-x-auto whitespace-pre-wrap break-all select-all">
                  {generated.command}
                </pre>
              </div>

              {/* Explanation */}
              {generated.explanation && (
                <p className="text-xs text-base-content/80 leading-relaxed px-1">
                  {generated.explanation}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1 border-t border-base-200">
                <div className="text-[10px] text-base-content/50 font-mono">
                  Press <kbd className="kbd kbd-xs">↵</kbd> to Run · <kbd className="kbd kbd-xs">Tab</kbd> to Insert · <kbd className="kbd kbd-xs">Esc</kbd> to Dismiss
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="btn btn-ghost btn-xs gap-1 text-base-content/70 hover:text-base-content"
                    title="Copy command to clipboard"
                  >
                    {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleInsert}
                    className="btn btn-neutral btn-xs gap-1"
                    title="Insert into prompt without executing (Tab)"
                  >
                    <ArrowRightToLine className="w-3 h-3" />
                    <span>Insert</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRun}
                    className={`btn btn-xs gap-1 ${
                      generated.isDangerous
                        ? "btn-error font-bold"
                        : "btn-primary font-bold shadow-xs"
                    }`}
                    title="Run command immediately in terminal (Enter)"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
