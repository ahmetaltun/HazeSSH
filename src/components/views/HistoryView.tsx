import { History, Trash2 } from "lucide-react";

export function HistoryView() {
  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div>
          <h2 className="text-base font-bold">Session History & Logs</h2>
          <p className="text-xs text-base-content/60">
            Recorded terminal sessions and connection audit trail
          </p>
        </div>

        <button type="button" className="btn btn-sm btn-ghost text-error gap-1.5 border border-base-300">
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Logs</span>
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex items-center justify-center">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg">
          <div className="w-12 h-12 rounded-xl bg-base-300 text-base-content/60 flex items-center justify-center">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">No recent connection history</h3>
            <p className="text-xs text-base-content/60 mt-1">
              Your connection logs and session recordings will be listed here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
