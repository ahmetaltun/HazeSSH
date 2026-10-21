import { Radio, X, Layers, LayoutGrid } from "lucide-react";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import type { SplitNode } from "@/types/terminal";

export function BroadcastBanner() {
  const { isBroadcastEnabled, scope, setScope, toggleBroadcast, excludedPaneIds } =
    useBroadcastStore();
  const { getActiveTab } = useMultiplexerStore();
  const { getAllSessions } = useTerminalRegistryStore();

  if (!isBroadcastEnabled) return null;

  // Calculate participating panes count
  const allSessions = getAllSessions();
  let targetCount = 0;

  if (scope === "tab") {
    const activeTab = getActiveTab();
    if (activeTab) {
      const collectPaneIds = (node: SplitNode): string[] => {
        if (node.type === "leaf") return [node.pane.id];
        return [...collectPaneIds(node.first), ...collectPaneIds(node.second)];
      };
      const tabPaneIds = collectPaneIds(activeTab.rootNode);
      targetCount = tabPaneIds.filter((id) => !excludedPaneIds.includes(id)).length;
    }
  } else {
    targetCount = allSessions.filter((s) => !excludedPaneIds.includes(s.paneId)).length;
  }

  return (
    <div className="h-8 bg-warning/15 border-b border-warning/30 px-3 flex items-center justify-between text-xs text-warning select-none shrink-0 animate-in slide-in-from-top-1 duration-150">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
        </span>
        <Radio className="w-3.5 h-3.5" />
        <span className="font-bold tracking-tight uppercase text-[11px]">
          Broadcast Input Active:
        </span>
        <span className="text-base-content/80 text-[11px]">
          Typing will execute on{" "}
          <span className="font-bold font-mono text-warning underline underline-offset-2">
            {targetCount} {targetCount === 1 ? "pane" : "panes"}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Scope Pill Selector */}
        <div className="join bg-base-300/80 p-0.5 rounded-md border border-warning/20">
          <button
            type="button"
            onClick={() => setScope("tab")}
            className={`btn btn-xs join-item h-5 min-h-0 px-2 text-[10px] font-mono ${
              scope === "tab" ? "btn-warning font-bold" : "btn-ghost text-base-content/60"
            }`}
            title="Mirror keystrokes only within the active tab"
          >
            <LayoutGrid className="w-2.5 h-2.5 mr-1" />
            Tab Panes
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`btn btn-xs join-item h-5 min-h-0 px-2 text-[10px] font-mono ${
              scope === "all" ? "btn-warning font-bold" : "btn-ghost text-base-content/60"
            }`}
            title="Mirror keystrokes across all tabs in workspace"
          >
            <Layers className="w-2.5 h-2.5 mr-1" />
            All Tabs
          </button>
        </div>

        {/* Stop Broadcast Button */}
        <button
          type="button"
          onClick={toggleBroadcast}
          className="btn btn-warning btn-xs h-5 min-h-0 px-2 gap-1 text-[10px] font-bold"
          title="Turn off broadcast mode (⌘⌥B)"
        >
          <span>Stop</span>
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
