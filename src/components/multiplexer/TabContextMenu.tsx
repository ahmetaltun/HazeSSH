import { useEffect, useRef } from "react";
import {
  X,
  Copy,
  Edit2,
  Columns2,
  Rows2,
  ArrowRightToLine,
  XCircle,
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { formatShortcut } from "@/utils/platform";
import type { WorkspaceTab } from "@/types/terminal";

interface TabContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly tab: WorkspaceTab;
  readonly onRenameRequest: (tab: WorkspaceTab) => void;
  readonly onClose: () => void;
}

export function TabContextMenu({
  x,
  y,
  tab,
  onRenameRequest,
  onClose,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    tabs,
    closeTab,
    closeOtherTabs,
    closeTabsToTheRight,
    duplicateTab,
    splitActivePane,
    setActiveTab,
  } = useMultiplexerStore();

  const tabIndex = tabs.findIndex((t) => t.id === tab.id);
  const hasTabsToRight = tabIndex !== -1 && tabIndex < tabs.length - 1;
  const hasOtherTabs = tabs.length > 1;

  // Position clamping inside viewport bounds
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

  // Outside click and ESC handler
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

  return (
    <div
      ref={menuRef}
      style={{ top: `${y}px`, left: `${x}px` }}
      className="fixed z-50 min-w-52 bg-base-100/95 backdrop-blur-md border border-base-300 rounded-lg shadow-2xl py-1 text-xs text-base-content select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Tab Title preview header */}
      <div className="px-3 py-1.5 border-b border-base-300/60 mb-0.5 flex items-center justify-between opacity-60">
        <span className="font-mono text-[10px] truncate max-w-[170px]">
          {tab.title}
        </span>
      </div>

      {/* Duplicate Session */}
      <button
        type="button"
        onClick={() => {
          duplicateTab(tab.id);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-info" />
          <span>Duplicate Tab</span>
        </span>
      </button>

      {/* Rename Tab */}
      <button
        type="button"
        onClick={() => {
          onRenameRequest(tab);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Edit2 className="w-3.5 h-3.5 text-warning" />
          <span>Rename Tab...</span>
        </span>
      </button>

      <div className="h-px bg-base-300 my-1" />

      {/* Split Right (Horizontal) */}
      <button
        type="button"
        onClick={() => {
          setActiveTab(tab.id);
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

      {/* Split Down (Vertical) */}
      <button
        type="button"
        onClick={() => {
          setActiveTab(tab.id);
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

      {/* Close Other Tabs */}
      {hasOtherTabs && (
        <button
          type="button"
          onClick={() => {
            closeOtherTabs(tab.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-base-content/60" />
            <span>Close Other Tabs</span>
          </span>
        </button>
      )}

      {/* Close Tabs to the Right */}
      {hasTabsToRight && (
        <button
          type="button"
          onClick={() => {
            closeTabsToTheRight(tab.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            <ArrowRightToLine className="w-3.5 h-3.5 text-base-content/60" />
            <span>Close Tabs to the Right</span>
          </span>
        </button>
      )}

      {/* Close This Tab */}
      <button
        type="button"
        onClick={() => {
          closeTab(tab.id);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-error/15 text-error text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <X className="w-3.5 h-3.5" />
          <span>Close Tab</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-error/60">
          {formatShortcut("⌘W", "Ctrl+W")}
        </kbd>
      </button>
    </div>
  );
}
