import { useState, useRef, useEffect, type MouseEvent } from "react";
import { Plus, X, Terminal } from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { TabContextMenu } from "@/components/multiplexer/TabContextMenu";
import { formatShortcut } from "@/utils/platform";
import type { WorkspaceTab } from "@/types/terminal";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openTab, renameTab } =
    useMultiplexerStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tab: WorkspaceTab;
  } | null>(null);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  if (tabs.length === 0) {
    return null;
  }

  const handleStartRename = (tab: WorkspaceTab) => {
    setEditingTabId(tab.id);
    setEditingTitle(tab.title);
  };

  const handleSaveRename = (tabId: string) => {
    if (editingTitle.trim()) {
      renameTab(tabId, editingTitle.trim());
    }
    setEditingTabId(null);
  };

  const handleTabMouseDown = (e: MouseEvent, tabId: string) => {
    // Universal desktop behavior: Middle click (wheel click) closes the tab
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const handleContextMenu = (e: MouseEvent, tab: WorkspaceTab) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tab,
    });
  };

  return (
    <>
      <div className="h-10 bg-base-300 border-b border-base-200 flex items-center px-2 gap-1 overflow-x-auto select-none shrink-0 no-scrollbar">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingTabId;
          const shortcutIndex = idx < 9 ? idx + 1 : null;

          return (
            <div
              key={tab.id}
              onClick={() => {
                if (isEditing) return;
                setActiveTab(tab.id);
                if (isActive && tab.activePaneId) {
                  terminalSessionManager.focusPane(tab.activePaneId);
                }
              }}
              onDoubleClick={() => handleStartRename(tab)}
              onMouseDown={(e) => handleTabMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              className={`group relative flex items-center gap-2 h-8 px-3 rounded-t-md text-xs font-medium cursor-pointer transition-all duration-150 border-t-2 ${
                isActive
                  ? "bg-base-100 text-base-content border-primary shadow-xs"
                  : "bg-base-200/60 text-base-content/60 hover:bg-base-200 hover:text-base-content border-transparent"
              }`}
              title={
                shortcutIndex
                  ? `${tab.title} (${formatShortcut(`⌘${shortcutIndex}`, `Alt+${shortcutIndex}`)})`
                  : tab.title
              }
            >
              <Terminal
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive ? "text-primary" : "text-base-content/40"
                }`}
              />

              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleSaveRename(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveRename(tab.id);
                    } else if (e.key === "Escape") {
                      setEditingTabId(null);
                    }
                  }}
                  className="bg-base-200 border border-primary text-xs font-mono px-1 py-0.5 rounded outline-hidden w-28 text-base-content"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate max-w-[140px] font-mono">{tab.title}</span>
              )}

              {/* Close Button (Hover to show on inactive, always subtle on active) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-base-300 text-base-content/50 hover:text-base-content transition-opacity"
                title={`Close Tab (${formatShortcut("⌘W", "Ctrl+W")})`}
                aria-label={`Close tab ${tab.title}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Quick Add Tab Button */}
        <button
          type="button"
          onClick={() => openTab({ title: "Local Terminal", status: "idle" })}
          className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-base-content ml-1"
          title={`New Tab (${formatShortcut("⌘T", "Ctrl+T")})`}
          aria-label="New Terminal Tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab Context Menu */}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tab={contextMenu.tab}
          onRenameRequest={handleStartRename}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
