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
  Plug,
  Unplug,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { api } from "@/services/api";
import type { FileEntry, TransferTask } from "@/types/sftp";
import { FileExplorerPane } from "@/components/sftp/FileExplorerPane";
import { RemoteEditorModal } from "@/components/sftp/RemoteEditorModal";
import { FilePreviewModal } from "@/components/sftp/FilePreviewModal";

export function SFTPView() {
  const { hosts } = useHostStore();
  const { sftpTargetHostId, setSftpTargetHostId } = useLayoutStore();
  const [selectedHostId, setSelectedHostId] = useState<string>("");

  // Connection states
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Navigation states
  const [localPath, setLocalPath] = useState<string>("");
  const [remotePath, setRemotePath] = useState<string>(".");

  // Selection states
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<FileEntry[]>([]);
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<FileEntry[]>([]);

  // Refresh keys to trigger pane reloads after transfers
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [remoteRefreshKey, setRemoteRefreshKey] = useState(0);

  // In-app Editor state
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null);

  // File Preview state
  const [previewTarget, setPreviewTarget] = useState<{
    file: FileEntry;
    mode: "local" | "remote";
  } | null>(null);

  // Transfer Queue state
  const [queue, setQueue] = useState<TransferTask[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);

  const selectedHost = hosts.find((h) => h.id === selectedHostId) || (hosts.length > 0 ? hosts[0] : null);

  const remotePathRef = useRef(remotePath);
  remotePathRef.current = remotePath;

  const localPathRef = useRef(localPath);
  localPathRef.current = localPath;

  const selectedHostRef = useRef(selectedHost);
  selectedHostRef.current = selectedHost;

  // Auto-connect if navigated here with an explicit target host
  useEffect(() => {
    if (sftpTargetHostId) {
      setSelectedHostId(sftpTargetHostId);
      setSftpTargetHostId(null);
      void handleConnect(sftpTargetHostId);
    }
  }, [sftpTargetHostId, setSftpTargetHostId]);

  // Set default selected host dropdown value if none set, without connecting
  useEffect(() => {
    if (!selectedHostId && hosts.length > 0) {
      setSelectedHostId(hosts[0].id);
    }
  }, [hosts, selectedHostId]);

  // Fetch local user home directory on mount
  useEffect(() => {
    api.sftpGetLocalHome().then(setLocalPath).catch(() => setLocalPath("/"));
  }, []);

  const handleConnect = async (hostIdOverride?: string) => {
    const hostToConnect = hosts.find((h) => h.id === (hostIdOverride || selectedHostId)) || selectedHost;
    if (!hostToConnect) {
      setConnectionError("No remote host selected. Please choose a host to connect.");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      // Canonicalize remote path to verify authentication & retrieve home directory
      const canonical = await api.sftpCanonicalize(hostToConnect.id, ".");
      setRemotePath(canonical || ".");
      setIsConnected(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectionError(`Could not establish SFTP session to ${hostToConnect.label}: ${msg}`);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (selectedHostId) {
      api.sftpDisconnect(selectedHostId).catch(console.error);
    }
    setIsConnected(false);
    setSelectedRemoteFiles([]);
    setRemotePath(".");
    setConnectionError(null);
  };

  const handleHostChange = (newHostId: string) => {
    if (newHostId !== selectedHostId) {
      if (isConnected) {
        handleDisconnect();
      }
      setSelectedHostId(newHostId);
    }
  };

  const handleOpenRemoteFile = (file: FileEntry) => {
    setEditingFile(file);
  };

  const handleUploadFiles = async (files: FileEntry[]) => {
    const host = selectedHostRef.current || selectedHost;
    if (!host || !isConnected || files.length === 0) return;
    const currentRemote = remotePathRef.current || remotePath;

    setIsQueueExpanded(true);

    for (const file of files) {
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

      try {
        await api.sftpUploadFile(host.id, file.path, dest);
        setQueue((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: "completed", progress: 100 } : t
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: "error", errorMessage: msg } : t
          )
        );
      }
    }
    setRemoteRefreshKey((k) => k + 1);
  };

  const handleDownloadFiles = async (files: FileEntry[]) => {
    const host = selectedHostRef.current || selectedHost;
    if (!host || !isConnected || files.length === 0) return;
    const currentLocal = localPathRef.current || localPath;

    setIsQueueExpanded(true);

    for (const file of files) {
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

      try {
        await api.sftpDownloadFile(host.id, file.path, dest);
        setQueue((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: "completed", progress: 100 } : t
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: "error", errorMessage: msg } : t
          )
        );
      }
    }
    setLocalRefreshKey((k) => k + 1);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      {/* View Header with Host Selector and Session Status */}
      <div className="h-14 border-b border-base-200 px-5 flex items-center justify-between gap-4 shrink-0 bg-base-200/40 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold leading-tight">SFTP File Manager</h2>
              {isConnected && selectedHost && (
                <span className="badge badge-success badge-xs gap-1 py-1 font-semibold text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Connected
                </span>
              )}
            </div>
            <p className="text-[11px] text-base-content/60">
              Dual-pane file transfer, directory navigation, and remote file editing
            </p>
          </div>
        </div>

        {/* Remote Host Picker & Session Actions */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-base-content/60 font-semibold flex items-center gap-1">
            <Server className="w-3.5 h-3.5" /> Host:
          </span>
          <select
            value={selectedHostId}
            onChange={(e) => handleHostChange(e.target.value)}
            disabled={isConnecting}
            className="select select-sm select-bordered bg-base-100 text-xs font-semibold max-w-xs"
          >
            {hosts.length === 0 && <option value="">(No Hosts Configured)</option>}
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label} ({h.hostname}:{h.port})
              </option>
            ))}
          </select>

          {isConnected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              className="btn btn-sm btn-outline btn-error text-xs gap-1.5 shadow-sm"
              title="Close SFTP session"
            >
              <Unplug className="w-3.5 h-3.5" />
              <span>Close Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleConnect()}
              disabled={isConnecting || !selectedHost}
              className="btn btn-sm btn-primary text-xs gap-1.5 shadow-sm"
              title="Connect to selected host"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Plug className="w-3.5 h-3.5" />
                  <span>Connect</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-error/15 border-b border-error/30 px-5 py-2 flex items-center justify-between text-xs text-error">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{connectionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setConnectionError(null)}
            className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/20"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dual Pane Workspace */}
      <div className="flex-1 min-h-0 p-3 flex gap-3 overflow-hidden">
        {/* Left Pane: Local Filesystem */}
        <div className="flex-1 min-w-0 h-full">
          <FileExplorerPane
            title="Local Computer"
            mode="local"
            currentPath={localPath}
            selectedFiles={selectedLocalFiles}
            onSelectFiles={setSelectedLocalFiles}
            onNavigate={setLocalPath}
            onOpenFile={(f) => setPreviewTarget({ file: f, mode: "local" })}
            onPreviewFile={(f) => setPreviewTarget({ file: f, mode: "local" })}
            onTransfer={handleUploadFiles}
            transferLabel="Upload"
            refreshKey={localRefreshKey}
          />
        </div>

        {/* Center Transfer Buttons */}
        <div className="flex flex-col justify-center items-center gap-2 shrink-0 select-none">
          <div
            className="tooltip tooltip-right"
            data-tip={
              !isConnected
                ? "Connect to Remote first"
                : selectedLocalFiles.length > 0
                ? `Upload ${selectedLocalFiles.length} selected item${selectedLocalFiles.length > 1 ? "s" : ""} to Remote`
                : "Select local file(s) to upload"
            }
          >
            <button
              type="button"
              onClick={() => handleUploadFiles(selectedLocalFiles)}
              disabled={selectedLocalFiles.length === 0 || !isConnected || !selectedHost}
              className="btn btn-sm btn-circle btn-primary shadow-md disabled:opacity-40"
              title={
                selectedLocalFiles.length > 0
                  ? isConnected
                    ? `Upload ${selectedLocalFiles.length} item(s) to Remote`
                    : "Connect to remote server to upload"
                  : "Select local file(s) to upload"
              }
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div
            className="tooltip tooltip-right"
            data-tip={
              !isConnected
                ? "Connect to Remote first"
                : selectedRemoteFiles.length > 0
                ? `Download ${selectedRemoteFiles.length} selected item${selectedRemoteFiles.length > 1 ? "s" : ""} to Local`
                : "Select remote file(s) to download"
            }
          >
            <button
              type="button"
              onClick={() => handleDownloadFiles(selectedRemoteFiles)}
              disabled={selectedRemoteFiles.length === 0 || !isConnected || !selectedHost}
              className="btn btn-sm btn-circle btn-secondary shadow-md disabled:opacity-40"
              title={
                selectedRemoteFiles.length > 0
                  ? `Download ${selectedRemoteFiles.length} item(s) to Local`
                  : "Select remote file(s) to download"
              }
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Pane: Remote SFTP Filesystem / Disconnected State */}
        <div className="flex-1 min-w-0 h-full">
          {isConnected && selectedHost ? (
            <FileExplorerPane
              title={`Remote: ${selectedHost.label}`}
              mode="remote"
              hostId={selectedHost.id}
              currentPath={remotePath}
              selectedFiles={selectedRemoteFiles}
              onSelectFiles={setSelectedRemoteFiles}
              onNavigate={setRemotePath}
              onOpenFile={handleOpenRemoteFile}
              onPreviewFile={(f) => setPreviewTarget({ file: f, mode: "remote" })}
              onTransfer={handleDownloadFiles}
              transferLabel="Download"
              refreshKey={remoteRefreshKey}
            />
          ) : (
            <div className="border border-base-300 rounded-xl h-full flex flex-col items-center justify-center p-6 text-center space-y-4 bg-base-200/20">
              <div className="w-14 h-14 rounded-2xl bg-base-300/50 flex items-center justify-center text-base-content/40">
                <Server className="w-7 h-7" />
              </div>
              <div className="max-w-xs space-y-1">
                <h3 className="text-sm font-bold text-base-content/90">
                  {selectedHost ? `Ready to connect: ${selectedHost.label}` : "No Remote Host Selected"}
                </h3>
                <p className="text-xs text-base-content/60 leading-relaxed">
                  {selectedHost
                    ? `Select "${selectedHost.label}" (${selectedHost.hostname}:${selectedHost.port}) and click Connect to browse and transfer remote files.`
                    : "Please add or configure a host in the Hosts tab to open an SFTP connection."}
                </p>
              </div>

              {selectedHost && (
                <button
                  type="button"
                  onClick={() => handleConnect()}
                  disabled={isConnecting}
                  className="btn btn-sm btn-primary gap-2 shadow-sm"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Connecting to {selectedHost.label}...</span>
                    </>
                  ) : (
                    <>
                      <Plug className="w-4 h-4" />
                      <span>Connect to {selectedHost.label}</span>
                    </>
                  )}
                </button>
              )}
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

      {/* File Preview Modal */}
      {previewTarget && (
        <FilePreviewModal
          isOpen={true}
          file={previewTarget.file}
          mode={previewTarget.mode}
          hostId={selectedHost?.id}
          hostLabel={selectedHost?.label}
          onClose={() => setPreviewTarget(null)}
          onOpenInEditor={(f) => {
            setPreviewTarget(null);
            if (previewTarget.mode === "remote") {
              handleOpenRemoteFile(f);
            }
          }}
          onTransfer={(f) => {
            if (previewTarget.mode === "remote") {
              handleDownloadFiles([f]);
            } else {
              handleUploadFiles([f]);
            }
          }}
        />
      )}
    </div>
  );
}
