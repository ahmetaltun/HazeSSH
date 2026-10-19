import { Plus, X, Terminal } from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openTab } = useMultiplexerStore();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="h-10 bg-base-300 border-b border-base-200 flex items-center px-2 gap-1 overflow-x-auto select-none shrink-0 no-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative flex items-center gap-2 h-8 px-3 rounded-t-md text-xs font-medium cursor-pointer transition-all duration-150 border-t-2 ${
              isActive
                ? "bg-base-100 text-base-content border-primary shadow-xs"
                : "bg-base-200/60 text-base-content/60 hover:bg-base-200 hover:text-base-content border-transparent"
            }`}
          >
            <Terminal className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-base-content/40"}`} />
            <span className="truncate max-w-[140px] font-mono">{tab.title}</span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-base-300 text-base-content/50 hover:text-base-content transition-opacity"
              title="Close Tab"
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
        title="New Tab"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
