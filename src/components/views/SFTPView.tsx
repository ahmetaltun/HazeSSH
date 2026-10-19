import { FolderGit2, RefreshCw } from "lucide-react";

export function SFTPView() {
  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div>
          <h2 className="text-base font-bold">SFTP File Manager</h2>
          <p className="text-xs text-base-content/60">
            Dual-pane visual file browser, remote file editing, and queue
          </p>
        </div>

        <button type="button" className="btn btn-sm btn-ghost border border-base-300 gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex items-center justify-center">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg">
          <div className="w-12 h-12 rounded-xl bg-info/10 text-info flex items-center justify-center">
            <FolderGit2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Select a Host for SFTP</h3>
            <p className="text-xs text-base-content/60 mt-1">
              Connect to any saved host to open a dual-pane file manager with drag & drop transfers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
