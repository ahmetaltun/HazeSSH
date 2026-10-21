import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { TabBar } from "@/components/multiplexer/TabBar";
import { BroadcastBanner } from "@/components/multiplexer/BroadcastBanner";
import { SplitPaneView } from "@/components/multiplexer/SplitPaneView";
import { EmptyWorkspace } from "@/components/multiplexer/EmptyWorkspace";

export function MultiplexerArea() {
  const { tabs, activeTabId } = useMultiplexerStore();
  const { activeSection } = useLayoutStore();

  if (tabs.length === 0) {
    return <EmptyWorkspace />;
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-base-100">
      <TabBar />
      <BroadcastBanner />
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`w-full h-full ${isActive ? "block" : "hidden"}`}
            >
              <SplitPaneView
                node={tab.rootNode}
                tabId={tab.id}
                activePaneId={tab.activePaneId}
                isTabActive={isActive && activeSection === "terminal"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
