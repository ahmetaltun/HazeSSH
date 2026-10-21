import { useState, useEffect, useRef } from "react";
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
import { useLayoutStore } from "@/stores/useLayoutStore";
import { api } from "@/services/api";
import type { FileEntry, TransferTask } from "@/types/sftp";
import { FileExplorerPane } from "@/components/sftp/FileExplorerPane";
import { RemoteEditorModal } from "@/components/sftp/RemoteEditorModal";

export function SFTPView() {
  const { hosts } = useHostStore();
  const { sftpTargetHostId, setSftpTargetHostId } = useLayoutStore();
  const [selectedHostId, setSelectedHostId] = useState<string>("");

  // Navigation states
  const [localPath, setLocalPath] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>(".");

  // Selection states
  const [selectedLocalFile, setSelectedLocalFile] = useState<FileEntry | null>(null);
  const [selectedRemoteFile, setSelectedRemoteFile] = useState<FileEntry | null>(null);

  // Refresh keys to trigger pane reloads after transfers
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [remoteRefreshKey, setRemoteRefreshKey] = useState(0);

  // In-app Editor state
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null);

  // Transfer Queue state
  const [queue, setQueue] = useState<TransferTask[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);

  const selectedHost = hosts.find((h) => h.id === selectedHostId) || hosts[0];

  const remotePathRef = useRef(remotePath);
  remotePathRef.current = remotePath;

  const localPathRef = useRef(localPath);
  localPathRef.current = localPath;

  const selectedHostRef = useRef(selectedHost);
  selectedHostRef.current = selectedHost;

  useEffect(() => {
    if (sftpTargetHostId) {
      setSelectedHostId(sftpTargetHostId);
      setSftpTargetHostId(null);
    }
  }, [sftpTargetHostId, setSftpTargetHostId]);

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

  // Canonicalize remote path on host selection to avoid starting at raw "."
  useEffect(() => {
    if (selectedHost) {
      api
        .sftpCanonicalize(selectedHost.id, ".")
        .then((canonical) => setRemotePath(canonical))
        .catch(() => setRemotePath("."));
    }
  }, [selectedHost?.id]);

  const handleOpenRemoteFile = (file: FileEntry) => {
    setEditingFile(file);
  };

  const handleUploadFile = async (file: FileEntry) => {
    const host = selectedHostRef.current || selectedHost;
    if (!host) return;
    const currentRemote = remotePathRef.current || remotePath;
    const dest = currentRemote.endsWith("/")
      ? `${currentRemote}${file.name}`
      : `${currentRemote}/${file.name}`;

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const task: TransferTask = {
      id: taskId,
      filename: file.name,
      sourcePath: file.path,
      destinationPath: dest,
      direction: "upload",
      size: file.size,
      status: "transferring",
      progress: 25,
    };

    setQueue((prev) => [task, ...prev]);
    setIsQueueExpanded(true);

    try {
      await api.sftpUploadFile(host.id, file.path, dest);
      setQueue((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "completed", progress: 100 } : t
        )
      );
      setRemoteRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueue((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "error", errorMessage: msg } : t
        )
      );
    }
  };

  const handleDownloadFile = async (file: FileEntry) => {
    const host = selectedHostRef.current || selectedHost;
    if (!host) return;
    const currentLocal = localPathRef.current || localPath;
    const dest = currentLocal.endsWith("/")
      ? `${currentLocal}${file.name}`
      : `${currentLocal}/${file.name}`;

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const task: TransferTask = {
      id: taskId,
      filename: file.name,
      sourcePath: file.path,
      destinationPath: dest,
      direction: "download",
      size: file.size,
      status: "transferring",
      progress: 25,
    };

    setQueue((prev) => [task, ...prev]);
    setIsQueueExpanded(true);

    try {
      await api.sftpDownloadFile(host.id, file.path, dest);
      setQueue((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "completed", progress: 100 } : t
        )
      );
      setLocalRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueue((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "error", errorMessage: msg } : t
        )
      );
    }
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
            selectedFile={selectedLocalFile}
            onSelectFile={setSelectedLocalFile}
            onNavigate={setLocalPath}
            onTransfer={handleUploadFile}
            transferLabel="Upload"
            refreshKey={localRefreshKey}
          />
        </div>

        {/* Center Transfer Buttons */}
        <div className="flex flex-col justify-center items-center gap-2 shrink-0 select-none">
          <div className="tooltip tooltip-right" data-tip="Upload to Remote">
            <button
              type="button"
              onClick={() => selectedLocalFile && handleUploadFile(selectedLocalFile)}
              disabled={!selectedLocalFile || !selectedHost}
              className="btn btn-sm btn-circle btn-primary shadow-md disabled:opacity-40"
              title={
                selectedLocalFile
                  ? `Upload "${selectedLocalFile.name}" to Remote`
                  : "Select a local file to upload"
              }
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="tooltip tooltip-right" data-tip="Download to Local">
            <button
              type="button"
              onClick={() => selectedRemoteFile && handleDownloadFile(selectedRemoteFile)}
              disabled={!selectedRemoteFile || !selectedHost}
              className="btn btn-sm btn-circle btn-secondary shadow-md disabled:opacity-40"
              title={
                selectedRemoteFile
                  ? `Download "${selectedRemoteFile.name}" to Local`
                  : "Select a remote file to download"
              }
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
              selectedFile={selectedRemoteFile}
              onSelectFile={setSelectedRemoteFile}
              onNavigate={setRemotePath}
              onOpenFile={handleOpenRemoteFile}
              onTransfer={handleDownloadFile}
              transferLabel="Download"
              refreshKey={remoteRefreshKey}
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
                {queue.filter((q) => q.status === "completed").length} completed
                {queue.some((q) => q.status === "error") && (
                  <span className="text-error ml-1">
                    ({queue.filter((q) => q.status === "error").length} failed)
                  </span>
                )}
                )
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
                    {task.errorMessage && (
                      <span className="text-[10px] text-error truncate max-w-[150px]">
                        {task.errorMessage}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <progress
                      className={`progress w-24 h-1.5 ${
                        task.status === "error"
                          ? "progress-error"
                          : task.status === "completed"
                          ? "progress-success"
                          : "progress-primary"
                      }`}
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
          onSaved={() => setRemoteRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
