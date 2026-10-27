import { useEffect, useRef, useState } from "react";
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Columns2,
  Rows2,
  RotateCcw,
  MousePointer2,
  Circle,
  Square,
  Download,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { api } from "@/services/api";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useRecordingStore } from "@/stores/useRecordingStore";
import { useAiCopilotStore } from "@/stores/useAiCopilotStore";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { formatShortcut } from "@/utils/platform";
import { AiErrorExplanationModal } from "@/components/terminal/AiErrorExplanationModal";
import type { TerminalPane } from "@/types/terminal";

interface TerminalContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly pane: TerminalPane;
  readonly onClose: () => void;
}

export function TerminalContextMenu({
  x,
  y,
  pane,
  onClose,
}: TerminalContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { splitActivePane } = useMultiplexerStore();
  const { isPaneRecording, startRecording, saveRecording, exportRecordingDialog } = useRecordingStore();
  const { isEnabled: isAiEnabled, togglePrompt } = useAiCopilotStore();

  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [errorTextToExplain, setErrorTextToExplain] = useState("");

  const session = terminalSessionManager.getSession(pane.id);
  const hasSelection = Boolean(session?.term.hasSelection());

  // Viewport clamping
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let newLeft = x;
      let newTop = y;

      if (x + rect.width > window.innerWidth - 8) {
        newLeft = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (y + rect.height > window.innerHeight - 8) {
        newTop = Math.max(8, window.innerHeight - rect.height - 8);
      }

      menuRef.current.style.left = `${newLeft}px`;
      menuRef.current.style.top = `${newTop}px`;
    }
  }, [x, y]);

  // Outside click & ESC listener
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleCopy = async () => {
    if (session) {
      const selectedText = session.term.getSelection();
      if (selectedText) {
        try {
          await api.clipboardWriteText(selectedText);
        } catch {
          await navigator.clipboard.writeText(selectedText);
        }
      }
    }
    onClose();
  };

  const handlePaste = async () => {
    try {
      let text = "";
      try {
        text = await api.clipboardReadText();
      } catch {
        text = await navigator.clipboard.readText();
      }

      if (text && session) {
        session.term.paste(text);
      }
    } catch (err) {
      console.warn("Failed to read system clipboard:", err);
    }
    onClose();
  };

  const handleSelectAll = () => {
    if (session) {
      session.term.selectAll();
    }
    onClose();
  };

  const handleClearBuffer = () => {
    if (session) {
      session.term.clear();
    }
    onClose();
  };

  const handleResetTerminal = () => {
    if (session) {
      session.term.reset();
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${y}px`, left: `${x}px` }}
      className="fixed z-50 min-w-48 bg-base-100/95 backdrop-blur-md border border-base-300 rounded-lg shadow-2xl py-1 text-xs text-base-content select-none font-sans"
    >
      {/* Copy */}
      <button
        type="button"
        onClick={handleCopy}
        disabled={!hasSelection}
        className={`w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors ${
          !hasSelection ? "opacity-40 cursor-not-allowed" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-primary" />
          <span>Copy</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          {formatShortcut("⌘C", "Ctrl+C")}
        </kbd>
      </button>

      {/* Paste */}
      <button
        type="button"
        onClick={handlePaste}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <ClipboardPaste className="w-3.5 h-3.5 text-info" />
          <span>Paste</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          {formatShortcut("⌘V", "Ctrl+V")}
        </kbd>
      </button>

      {/* Select All */}
      <button
        type="button"
        onClick={handleSelectAll}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <MousePointer2 className="w-3.5 h-3.5 text-base-content/70" />
          <span>Select All</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          {formatShortcut("⌘A", "Ctrl+A")}
        </kbd>
      </button>

      {/* AI Shell Copilot Actions */}
      {isAiEnabled && (
        <>
          <div className="h-px bg-base-300 my-1" />

          <button
            type="button"
            onClick={() => {
              onClose();
              togglePrompt(pane.id);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-primary/10 text-left cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2 text-primary font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask AI Copilot</span>
            </span>
            <kbd className="kbd kbd-xs font-mono text-[9px] text-primary/70">
              {formatShortcut("⌘I", "Ctrl+I")}
            </kbd>
          </button>

          {hasSelection && (
            <button
              type="button"
              onClick={() => {
                const selectedText = session?.term.getSelection() || "";
                setErrorTextToExplain(selectedText);
                setExplainModalOpen(true);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-info" />
                <span>Explain Selection with AI</span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const buffer = terminalSessionManager.getRecentBuffer(pane.id, 25);
              setErrorTextToExplain(buffer || "No recent output detected.");
              setExplainModalOpen(true);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-3.5 h-3.5 text-warning" />
              <span>Diagnose Terminal Output</span>
            </span>
          </button>
        </>
      )}

      <div className="h-px bg-base-300 my-1" />

      {/* Clear Buffer */}
      <button
        type="button"
        onClick={handleClearBuffer}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5 text-warning" />
          <span>Clear Buffer</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          {formatShortcut("⌘K", "Ctrl+L")}
        </kbd>
      </button>

      <div className="h-px bg-base-300 my-1" />

      {/* Session Recording (.cast) */}
      <button
        type="button"
        onClick={async () => {
          onClose();
          if (isPaneRecording(pane.id)) {
            await saveRecording(pane.id, pane.title);
          } else {
            startRecording(pane.id, pane.title);
          }
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          {isPaneRecording(pane.id) ? (
            <>
              <Square className="w-3.5 h-3.5 text-error fill-current" />
              <span className="text-error font-medium">Stop & Save Recording</span>
            </>
          ) : (
            <>
              <Circle className="w-3.5 h-3.5 text-error" />
              <span>Record Session (.cast)</span>
            </>
          )}
        </span>
      </button>

      {isPaneRecording(pane.id) && (
        <button
          type="button"
          onClick={async () => {
            onClose();
            await exportRecordingDialog(pane.id, pane.title);
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-warning" />
            <span>Export Recording As...</span>
          </span>
        </button>
      )}

      <div className="h-px bg-base-300 my-1" />

      {/* Split Horizontal */}
      <button
        type="button"
        onClick={() => {
          splitActivePane("horizontal");
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Columns2 className="w-3.5 h-3.5 text-primary" />
          <span>Split Right</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          {formatShortcut("⌘\\", "Ctrl+\\")}
        </kbd>
      </button>

      {/* Split Vertical */}
      <button
        type="button"
        onClick={() => {
          splitActivePane("vertical");
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Rows2 className="w-3.5 h-3.5 text-primary" />
          <span>Split Down</span>
        </span>
      </button>

      <div className="h-px bg-base-300 my-1" />

      {/* Reset */}
      <button
        type="button"
        onClick={handleResetTerminal}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors text-base-content/70 hover:text-base-content"
      >
        <span className="flex items-center gap-2">
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Terminal</span>
        </span>
      </button>

      {explainModalOpen && (
        <AiErrorExplanationModal
          isOpen={true}
          onClose={() => {
            setExplainModalOpen(false);
            onClose();
          }}
          pane={pane}
          errorOutput={errorTextToExplain}
        />
      )}
    </div>
  );
}
