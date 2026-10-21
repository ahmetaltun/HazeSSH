import {
  Columns2,
  Rows2,
  X,
  Terminal,
  Radio,
  VolumeX,
} from "lucide-react";
import type { TerminalPane } from "@/types/terminal";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { XTermTerminal } from "@/components/terminal/XTermTerminal";

interface PaneContainerProps {
  readonly pane: TerminalPane;
  readonly tabId: string;
  readonly isFocused: boolean;
}

export function PaneContainer({ pane, tabId, isFocused }: PaneContainerProps) {
  const { splitActivePane, closePane, setActivePane } = useMultiplexerStore();
  const { isBroadcastEnabled, isPaneExcluded, togglePaneExclusion } = useBroadcastStore();

  const isExcludedFromBroadcast = isPaneExcluded(pane.id);

  const getStatusBadge = () => {
    switch (pane.status) {
      case "connecting":
        return <span className="badge badge-warning badge-xs">connecting...</span>;
      case "connected":
        return <span className="badge badge-success badge-xs">connected</span>;
      case "error":
        return (
          <span
            className="badge badge-error badge-xs cursor-help"
            title={pane.errorMessage || "Connection error"}
          >
            error
          </span>
        );
      case "disconnected":
        return <span className="badge badge-neutral badge-xs">disconnected</span>;
      default:
        return <span className="badge badge-neutral badge-xs">local</span>;
    }
  };

  return (
    <div
      onClick={() => setActivePane(tabId, pane.id)}
      className={`flex flex-col h-full w-full bg-base-100 overflow-hidden border transition-colors duration-150 ${
        isBroadcastEnabled && !isExcludedFromBroadcast
          ? isFocused
            ? "border-warning ring-1 ring-warning/50 shadow-xs"
            : "border-warning/50"
          : isFocused
          ? "border-primary/60 shadow-xs"
          : "border-base-300"
      }`}
    >
      {/* Pane Top Bar */}
      <div
        className={`h-7 px-2.5 flex items-center justify-between text-xs select-none border-b transition-colors ${
          isBroadcastEnabled && !isExcludedFromBroadcast
            ? isFocused
              ? "bg-warning/20 text-warning border-warning/40"
              : "bg-warning/10 text-base-content/80 border-warning/20"
            : isFocused
            ? "bg-base-200 text-base-content border-primary/30"
            : "bg-base-200/50 text-base-content/60 border-base-300"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Terminal className={`w-3.5 h-3.5 shrink-0 ${isFocused ? "text-primary" : "text-base-content/40"}`} />
          <span className="font-mono text-xs font-semibold truncate max-w-[200px]">
            {pane.title}
          </span>
          {getStatusBadge()}

          {/* Broadcast Exclusion Status Toggle */}
          {isBroadcastEnabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePaneExclusion(pane.id);
              }}
              className={`badge badge-xs gap-1 cursor-pointer font-mono transition-all ${
                isExcludedFromBroadcast
                  ? "badge-neutral opacity-50 hover:opacity-100"
                  : "badge-warning font-semibold animate-pulse"
              }`}
              title={
                isExcludedFromBroadcast
                  ? "Click to include this pane in broadcast"
                  : "Click to exclude this pane from broadcast"
              }
            >
              {isExcludedFromBroadcast ? (
                <>
                  <VolumeX className="w-2.5 h-2.5" />
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <Radio className="w-2.5 h-2.5" />
                  <span>Mirroring</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Pane Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              splitActivePane("horizontal");
            }}
            className="btn btn-ghost btn-xs btn-square p-0.5 hover:bg-base-300 text-base-content/60 hover:text-base-content"
            title="Split Right (Horizontal)"
          >
            <Columns2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              splitActivePane("vertical");
            }}
            className="btn btn-ghost btn-xs btn-square p-0.5 hover:bg-base-300 text-base-content/60 hover:text-base-content"
            title="Split Down (Vertical)"
          >
            <Rows2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closePane(tabId, pane.id);
            }}
            className="btn btn-ghost btn-xs btn-square p-0.5 hover:bg-error hover:text-error-content text-base-content/60"
            title="Close Pane"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Pane Terminal Canvas (xterm.js mount area) */}
      <div className="flex-1 w-full h-full min-h-0 bg-base-100 relative overflow-hidden">
        <XTermTerminal pane={pane} isFocused={isFocused} />
      </div>
    </div>
  );
}
