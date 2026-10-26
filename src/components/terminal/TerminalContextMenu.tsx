import { useEffect, useRef, useState } from "react";
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Columns2,
  Rows2,
  RotateCcw,
  MousePointer2,
  Check,
} from "lucide-react";
import { api } from "@/services/api";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { formatShortcut } from "@/utils/platform";
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
  const [copied, setCopied] = useState(false);
  const { splitActivePane } = useMultiplexerStore();

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
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          onClose();
        }, 500);
        return;
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
      className="fixed z-50 min-w-48 bg-base-100/95 backdrop-blur-md border border-base-300 rounded-lg shadow-2xl py-1 text-xs text-base-content select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
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
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-primary" />
          )}
          <span>{copied ? "Copied!" : "Copy"}</span>
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
    </div>
  );
}
