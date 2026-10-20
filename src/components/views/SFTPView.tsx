import { useState, useEffect } from "react";
import {
  FolderGit2,
  Server,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { api } from "@/services/api";
import type { FileEntry, TransferTask } from "@/types/sftp";
import { FileExplorerPane } from "@/components/sftp/FileExplorerPane";
import { RemoteEditorModal } from "@/components/sftp/RemoteEditorModal";

export function SFTPView() {
  const { hosts } = useHostStore();
  const [selectedHostId, setSelectedHostId] = useState<string>("");

  // Navigation states
  const [localPath, setLocalPath] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>(".");

  // In-app Editor state
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null);

  // Transfer Queue state
  const [queue, setQueue] = useState<TransferTask[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);

  const selectedHost = hosts.find((h) => h.id === selectedHostId) || hosts[0];

  useEffect(() => {
    // Select first host by default if none selected
    if (!selectedHostId && hosts.length > 0) {
      setSelectedHostId(hosts[0].id);
    }
  }, [hosts, selectedHostId]);

  useEffect(() => {
    // Fetch local user home directory
    api.sftpGetLocalHome().then(setLocalPath).catch(() => setLocalPath("/"));
  }, []);

  const handleOpenRemoteFile = (file: FileEntry) => {
    setEditingFile(file);
  };

  const handleUploadFile = (file: FileEntry) => {
    if (!selectedHost) return;
    const dest = remotePath.endsWith("/")
      ? `${remotePath}${file.name}`
      : `${remotePath}/${file.name}`;

    const task: TransferTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      filename: file.name,
      sourcePath: file.path,
      destinationPath: dest,
      direction: "upload",
      size: file.size,
      status: "transferring",
      progress: 50,
    };

    setQueue((prev) => [task, ...prev]);
    setIsQueueExpanded(true);

    // Simulate completion
    setTimeout(() => {
      setQueue((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "completed", progress: 100 } : t
        )
      );
    }, 1200);
  };

  const handleDownloadFile = (file: FileEntry) => {
    const dest = localPath.endsWith("/")
      ? `${localPath}${file.name}`
      : `${localPath}/${file.name}`;

    const task: TransferTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      filename: file.name,
      sourcePath: file.path,
      destinationPath: dest,
      direction: "download",
      size: file.size,
      status: "transferring",
      progress: 50,
    };

    setQueue((prev) => [task, ...prev]);
    setIsQueueExpanded(true);

    // Simulate completion
    setTimeout(() => {
      setQueue((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "completed", progress: 100 } : t
        )
      );
    }, 1200);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      {/* View Header with Host Selector */}
      <div className="h-14 border-b border-base-200 px-5 flex items-center justify-between gap-4 shrink-0 bg-base-200/40 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight">SFTP File Manager</h2>
            <p className="text-[11px] text-base-content/60">
              Dual-pane file transfer, directory navigation, and remote file editing
            </p>
          </div>
        </div>

        {/* Remote Host Picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-base-content/60 font-semibold flex items-center gap-1">
            <Server className="w-3.5 h-3.5" /> Target Host:
          </span>
          <select
            value={selectedHostId}
            onChange={(e) => {
              setSelectedHostId(e.target.value);
              setRemotePath(".");
            }}
            className="select select-sm select-bordered bg-base-100 text-xs font-semibold max-w-xs"
          >
            {hosts.length === 0 && <option value="">(No Hosts Configured)</option>}
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label} ({h.hostname}:{h.port})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dual Pane Workspace */}
      <div className="flex-1 min-h-0 p-3 flex gap-3 overflow-hidden">
        {/* Left Pane: Local Filesystem */}
        <div className="flex-1 min-w-0 h-full">
          <FileExplorerPane
            title="Local Computer"
            mode="local"
            currentPath={localPath}
            onNavigate={setLocalPath}
            onTransfer={handleUploadFile}
            transferLabel="Upload"
          />
        </div>

        {/* Center Transfer Buttons */}
        <div className="flex flex-col justify-center items-center gap-2 shrink-0 select-none">
          <div className="tooltip tooltip-right" data-tip="Upload to Remote">
            <button
              type="button"
              className="btn btn-sm btn-circle btn-primary shadow-md"
              title="Upload file"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="tooltip tooltip-right" data-tip="Download to Local">
            <button
              type="button"
              className="btn btn-sm btn-circle btn-secondary shadow-md"
              title="Download file"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Pane: Remote SFTP Filesystem */}
        <div className="flex-1 min-w-0 h-full">
          {selectedHost ? (
            <FileExplorerPane
              title={`Remote: ${selectedHost.label}`}
              mode="remote"
              hostId={selectedHost.id}
              currentPath={remotePath}
              onNavigate={setRemotePath}
              onOpenFile={handleOpenRemoteFile}
              onTransfer={handleDownloadFile}
              transferLabel="Download"
            />
          ) : (
            <div className="border border-base-300 rounded-xl h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-base-200/20">
              <Server className="w-8 h-8 text-base-content/30" />
              <p className="text-xs text-base-content/60">
                Please add or select a host to open an SFTP connection.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Queue Tray */}
      {queue.length > 0 && (
        <div className="border-t border-base-300 bg-base-200/80 shrink-0 select-none transition-all duration-200">
          <div
            onClick={() => setIsQueueExpanded(!isQueueExpanded)}
            className="h-8 px-4 flex items-center justify-between text-xs cursor-pointer hover:bg-base-300/50"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-[11px]">
                Transfer Queue ({queue.filter((q) => q.status === "transferring").length} active,{" "}
                {queue.filter((q) => q.status === "completed").length} completed)
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQueue([]);
              }}
              className="btn btn-ghost btn-xs text-[10px]"
            >
              Clear Finished
            </button>
          </div>

          {isQueueExpanded && (
            <div className="max-h-36 overflow-y-auto px-4 py-2 space-y-1.5 border-t border-base-300/40">
              {queue.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between text-xs bg-base-100 p-2 rounded-lg border border-base-300/60"
                >
                  <div className="flex items-center gap-2 truncate max-w-sm">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                    ) : task.status === "error" ? (
                      <XCircle className="w-3.5 h-3.5 text-error shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-warning animate-spin shrink-0" />
                    )}
                    <span className="font-mono text-[11px] truncate">{task.filename}</span>
                    <span className="badge badge-xs uppercase text-[9px]">
                      {task.direction}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <progress
                      className="progress progress-primary w-24 h-1.5"
                      value={task.progress}
                      max="100"
                    />
                    <span className="text-[10px] font-mono text-base-content/60 w-8 text-right">
                      {task.progress}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* In-App Remote File Editor Modal */}
      {editingFile && selectedHost && (
        <RemoteEditorModal
          isOpen={true}
          hostId={selectedHost.id}
          hostLabel={selectedHost.label}
          filePath={editingFile.path}
          fileName={editingFile.name}
          onClose={() => setEditingFile(null)}
        />
      )}
    </div>
  );
}
