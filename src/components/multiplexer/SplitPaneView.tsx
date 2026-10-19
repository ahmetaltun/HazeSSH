import type { SplitNode } from "@/types/terminal";
import { PaneContainer } from "@/components/multiplexer/PaneContainer";

interface SplitPaneViewProps {
  readonly node: SplitNode;
  readonly tabId: string;
  readonly activePaneId: string;
}

export function SplitPaneView({ node, tabId, activePaneId }: SplitPaneViewProps) {
  if (node.type === "leaf") {
    return (
      <PaneContainer
        pane={node.pane}
        tabId={tabId}
        isFocused={node.pane.id === activePaneId}
      />
    );
  }

  const isHorizontal = node.direction === "horizontal";
  const firstRatio = node.ratio * 100;
  const secondRatio = (1 - node.ratio) * 100;

  return (
    <div
      className={`w-full h-full flex ${
        isHorizontal ? "flex-row" : "flex-col"
      } overflow-hidden`}
    >
      {/* First split branch/leaf */}
      <div
        style={{ flex: `${firstRatio} 1 0%` }}
        className="overflow-hidden min-w-[150px] min-h-[100px]"
      >
        <SplitPaneView
          node={node.first}
          tabId={tabId}
          activePaneId={activePaneId}
        />
      </div>

      {/* Split Divider */}
      <div
        className={`bg-base-300 shrink-0 select-none ${
          isHorizontal
            ? "w-1 hover:w-1.5 cursor-col-resize hover:bg-primary transition-all"
            : "h-1 hover:h-1.5 cursor-row-resize hover:bg-primary transition-all"
        }`}
      />

      {/* Second split branch/leaf */}
      <div
        style={{ flex: `${secondRatio} 1 0%` }}
        className="overflow-hidden min-w-[150px] min-h-[100px]"
      >
        <SplitPaneView
          node={node.second}
          tabId={tabId}
          activePaneId={activePaneId}
        />
      </div>
    </div>
  );
}
