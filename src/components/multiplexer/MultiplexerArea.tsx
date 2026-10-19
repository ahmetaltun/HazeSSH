import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { TabBar } from "@/components/multiplexer/TabBar";
import { SplitPaneView } from "@/components/multiplexer/SplitPaneView";
import { EmptyWorkspace } from "@/components/multiplexer/EmptyWorkspace";

export function MultiplexerArea() {
  const { tabs, getActiveTab } = useMultiplexerStore();
  const activeTab = getActiveTab();

  if (tabs.length === 0 || !activeTab) {
    return <EmptyWorkspace />;
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-base-100">
      <TabBar />
      <div className="flex-1 w-full h-full overflow-hidden relative">
        <SplitPaneView
          node={activeTab.rootNode}
          tabId={activeTab.id}
          activePaneId={activeTab.activePaneId}
        />
      </div>
    </div>
  );
}
