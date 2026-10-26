import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { useLayoutStore } from "@/stores/useLayoutStore";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Robust UI Error Boundary.
 * Catches render-time and lifecycle exceptions within child view components,
 * preventing a complete application crash and rendering an actionable recovery view.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Haze SSH ErrorBoundary] Caught render exception:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReturnToHosts = () => {
    this.handleReset();
    useLayoutStore.getState().setView("hosts");
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-base-100 min-h-[300px]">
          <div className="w-14 h-14 rounded-2xl bg-error/10 text-error flex items-center justify-center mb-4 border border-error/20 shadow-sm">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <h3 className="font-bold text-base text-base-content mb-1">
            {this.props.fallbackTitle || "An unexpected error occurred in this view"}
          </h3>

          <p className="text-xs text-base-content/60 max-w-md mb-4">
            Haze SSH prevented a full app crash. You can retry rendering this section or navigate safely back to your hosts workspace.
          </p>

          {this.state.error && (
            <div className="max-w-xl w-full text-left bg-base-200/80 border border-base-300 rounded-xl p-3 mb-6 font-mono text-[11px] text-error overflow-x-auto whitespace-pre-wrap break-all shadow-inner">
              {this.state.error.name}: {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="btn btn-sm btn-outline gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry View</span>
            </button>

            <button
              type="button"
              onClick={this.handleReturnToHosts}
              className="btn btn-sm btn-primary gap-2"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Return to Hosts</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
