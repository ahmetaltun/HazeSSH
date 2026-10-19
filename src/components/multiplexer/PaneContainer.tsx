import {
  Columns2,
  Rows2,
  X,
  Terminal,
} from "lucide-react";
import type { TerminalPane } from "@/types/terminal";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";

interface PaneContainerProps {
  readonly pane: TerminalPane;
  readonly tabId: string;
  readonly isFocused: boolean;
}

export function PaneContainer({ pane, tabId, isFocused }: PaneContainerProps) {
  const { splitActivePane, closePane, setActivePane } = useMultiplexerStore();

  const getStatusBadge = () => {
    switch (pane.status) {
      case "connecting":
        return <span className="badge badge-warning badge-xs">connecting...</span>;
      case "connected":
        return <span className="badge badge-success badge-xs">connected</span>;
      case "error":
        return <span className="badge badge-error badge-xs">error</span>;
      default:
        return <span className="badge badge-neutral badge-xs">local</span>;
    }
  };

  return (
    <div
      onClick={() => setActivePane(tabId, pane.id)}
      className={`flex flex-col h-full w-full bg-base-100 overflow-hidden border transition-colors duration-150 ${
        isFocused ? "border-primary/60 shadow-xs" : "border-base-300"
      }`}
    >
      {/* Pane Top Bar */}
      <div
        className={`h-7 px-2.5 flex items-center justify-between text-xs select-none border-b transition-colors ${
          isFocused
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
      <div className="flex-1 bg-black/90 p-4 font-mono text-xs text-success flex flex-col justify-between overflow-auto relative">
        <div className="space-y-1">
          <p className="text-base-content/40">Haze SSH Native Terminal Environment [PTY Engine]</p>
          <p className="text-base-content/60">
            Target: <span className="text-info">{pane.username || "local"}@{pane.hostname || "localhost"}</span>
          </p>
          <p className="text-warning">Status: {pane.status.toUpperCase()}</p>
          {pane.errorMessage && (
            <p className="text-error bg-error/10 p-2 rounded-sm border border-error/20">
              Error: {pane.errorMessage}
            </p>
          )}
          <div className="pt-2 text-base-content/30 text-[11px]">
            Ready for russh connection streaming in Phase 4.
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-base-content/30 pt-2 border-t border-base-300/20">
          <span>ID: {pane.id}</span>
          <span>{isFocused ? "● FOCUSED" : "INACTIVE"}</span>
        </div>
      </div>
    </div>
  );
}
