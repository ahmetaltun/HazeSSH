import { useState, useRef, useCallback, type PointerEvent } from "react";
import type { SplitNode } from "@/types/terminal";
import { PaneContainer } from "@/components/multiplexer/PaneContainer";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";

interface SplitPaneViewProps {
  readonly node: SplitNode;
  readonly tabId: string;
  readonly activePaneId: string;
  readonly isTabActive?: boolean;
}

export function SplitPaneView({
  node,
  tabId,
  activePaneId,
  isTabActive = true,
}: SplitPaneViewProps) {
  if (node.type === "leaf") {
    return (
      <PaneContainer
        pane={node.pane}
        tabId={tabId}
        isFocused={node.pane.id === activePaneId}
      />
    );
  }

  const { updateBranchRatio } = useMultiplexerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isHorizontal = node.direction === "horizontal";
  const firstRatio = node.ratio * 100;
  const secondRatio = (1 - node.ratio) * 100;

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let rawRatio: number;

      if (isHorizontal) {
        rawRatio = (e.clientX - rect.left) / rect.width;
      } else {
        rawRatio = (e.clientY - rect.top) / rect.height;
      }

      // Constrain between 15% and 85% to prevent complete pane collapse
      const clampedRatio = Math.min(0.85, Math.max(0.15, rawRatio));
      updateBranchRatio(tabId, node.id, clampedRatio);
    },
    [isDragging, isHorizontal, node.id, tabId, updateBranchRatio]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (isDragging) {
        setIsDragging(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore if pointer capture was already released
        }
        // Notify xterm ResizeObservers
        window.dispatchEvent(new Event("resize"));
      }
    },
    [isDragging]
  );

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex ${
        isHorizontal ? "flex-row" : "flex-col"
      } overflow-hidden ${isDragging ? "select-none cursor-grabbing" : ""}`}
    >
      {/* First split branch/leaf */}
      <div
        key={`first-${node.first.id}`}
        style={{ flex: `${firstRatio} 1 0%` }}
        className="overflow-hidden min-w-[100px] min-h-[60px]"
      >
        <SplitPaneView
          node={node.first}
          tabId={tabId}
          activePaneId={activePaneId}
          isTabActive={isTabActive}
        />
      </div>

      {/* Interactive Split Divider */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative z-10 shrink-0 select-none transition-colors duration-150 ${
          isHorizontal
            ? "w-1.5 cursor-col-resize hover:w-2"
            : "h-1.5 cursor-row-resize hover:h-2"
        } ${
          isDragging
            ? "bg-primary shadow-xs shadow-primary"
            : "bg-base-300 hover:bg-primary/70"
        }`}
        title="Drag to resize split panes"
      >
        {/* Subtle center drag grip pill */}
        <div
          className={`absolute inset-0 m-auto rounded-full bg-base-content/20 transition-opacity ${
            isDragging ? "opacity-100 bg-primary-content" : "opacity-0 hover:opacity-100"
          } ${isHorizontal ? "w-0.5 h-6" : "h-0.5 w-6"}`}
        />
      </div>

      {/* Second split branch/leaf */}
      <div
        key={`second-${node.second.id}`}
        style={{ flex: `${secondRatio} 1 0%` }}
        className="overflow-hidden min-w-[100px] min-h-[60px]"
      >
        <SplitPaneView
          node={node.second}
          tabId={tabId}
          activePaneId={activePaneId}
          isTabActive={isTabActive}
        />
      </div>
    </div>
  );
}
