import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import {
  Folder,
  File,
  FileCode,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Trash2,
  Edit2,
  Search,
  HardDrive,
  Globe,
  CornerDownRight,
  FilePenLine,
  UploadCloud,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/services/api";
import type { FileEntry } from "@/types/sftp";

interface FileExplorerPaneProps {
  readonly title: string;
  readonly mode: "local" | "remote";
  readonly hostId?: string;
  readonly currentPath: string;
  readonly selectedFile?: FileEntry | null;
  readonly onSelectFile?: (file: FileEntry | null) => void;
  readonly onNavigate: (path: string) => void;
  readonly onOpenFile?: (file: FileEntry) => void;
  readonly onTransfer?: (file: FileEntry) => void;
  readonly transferLabel?: string;
  readonly refreshKey?: number;
  readonly onDropFromOpposite?: (entry: FileEntry) => void;
  readonly isDropTarget?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(epochSec: number): string {
  if (!epochSec) return "-";
  const date = new Date(epochSec * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) {
    return <Folder className="w-4 h-4 text-warning fill-warning/20 shrink-0" />;
  }
  const ext = entry.name.split(".").pop()?.toLowerCase();
  if (["conf", "sh", "yaml", "yml", "json", "toml", "txt", "env", "md", "rs", "ts", "js", "py"].includes(ext || "")) {
    return <FileCode className="w-4 h-4 text-info shrink-0" />;
  }
  return <File className="w-4 h-4 text-base-content/60 shrink-0" />;
}

export function FileExplorerPane({
  title,
  mode,
  hostId,
  currentPath,
  selectedFile: externalSelectedFile,
  onSelectFile,
  onNavigate,
  onOpenFile,
  onTransfer,
  transferLabel = "Transfer",
  refreshKey = 0,
  onDropFromOpposite,
  isDropTarget = false,
}: FileExplorerPaneProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [internalSelectedFile, setInternalSelectedFile] = useState<FileEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInternalDragOver, setIsInternalDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // New folder dialog
  const [isMkdirOpen, setIsMkdirOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Rename dialog
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [newFileName, setNewFileName] = useState("");

  // Delete confirmation dialog (replaces browser confirm)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeSelectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;

  const handleSelect = (file: FileEntry | null) => {
    if (externalSelectedFile === undefined) {
      setInternalSelectedFile(file);
    }
    onSelectFile?.(file);
  };

  const loadDirectory = async (path: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    handleSelect(null);

    try {
      if (mode === "remote") {
        if (!hostId) {
          setEntries([]);
          setIsLoading(false);
          return;
        }
        const data = await api.sftpListRemote(hostId, path);
        setEntries(data);
      } else {
        const data = await api.sftpListLocal(path);
        setEntries(data);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(currentPath);
  }, [mode, hostId, currentPath, refreshKey]);

  // Navigate up one folder
  const handleGoUp = () => {
    if (currentPath === "/" || currentPath === "" || currentPath === ".") return;
    const parts = currentPath.replace(/\/+$/, "").split("/");
    parts.pop();
    const parent = parts.join("/") || "/";
    onNavigate(parent);
  };

  const handleRowDoubleClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      onNavigate(entry.path);
    } else {
      onOpenFile?.(entry);
    }
  };

  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const targetPath = currentPath.endsWith("/")
      ? `${currentPath}${newFolderName.trim()}`
      : `${currentPath}/${newFolderName.trim()}`;

    try {
      if (mode === "remote" && hostId) {
        await api.sftpMkdir(hostId, targetPath);
      } else {
        await api.sftpLocalMkdir(targetPath);
      }
      setIsMkdirOpen(false);
      setNewFolderName("");
      loadDirectory(currentPath);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenDelete = (entry: FileEntry) => {
    setFileToDelete(entry);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      if (mode === "remote" && hostId) {
        await api.sftpDeleteFile(hostId, fileToDelete.path, fileToDelete.is_dir);
      } else {
        await api.sftpLocalDelete(fileToDelete.path, fileToDelete.is_dir);
      }
      setIsDeleteOpen(false);
      setFileToDelete(null);
      loadDirectory(currentPath);
      if (activeSelectedFile?.path === fileToDelete.path) {
        handleSelect(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !newFileName.trim()) return;

    const parent = currentPath.endsWith("/")
      ? currentPath
      : `${currentPath}/`;
    const newPath = `${parent}${newFileName.trim()}`;

    try {
      if (mode === "remote" && hostId) {
        await api.sftpRenameFile(hostId, renameTarget.path, newPath);
      } else {
        await api.sftpLocalRename(renameTarget.path, newPath);
      }
      setIsRenameOpen(false);
      setRenameTarget(null);
      setNewFileName("");
      loadDirectory(currentPath);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePaneDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsInternalDragOver(true);
  };

  const handlePaneDragOver = (e: React.DragEvent) => {
    // ALWAYS call preventDefault() on dragOver to indicate drop is allowed
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isInternalDragOver) {
      setIsInternalDragOver(true);
    }
  };

  const handlePaneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsInternalDragOver(false);
    }
  };

  const handlePaneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsInternalDragOver(false);

    const sourceMode = e.dataTransfer.getData("application/haze-sftp-source-mode");
    const rawEntry = e.dataTransfer.getData("application/haze-sftp-entry");

    if (rawEntry && sourceMode && sourceMode !== mode) {
      try {
        const entry: FileEntry = JSON.parse(rawEntry);
        onDropFromOpposite?.(entry);
      } catch (err) {
        console.error("Failed to parse dropped entry:", err);
      }
    }
  };

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const q = searchTerm.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, searchTerm]);

  const showDropHighlight = isInternalDragOver || isDropTarget;

  return (
    <div
      onDragEnter={handlePaneDragEnter}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
      className={`flex-1 flex flex-col h-full bg-base-100 border rounded-xl overflow-hidden select-none relative transition-all ${
        showDropHighlight ? "border-primary ring-2 ring-primary/40" : "border-base-300"
      }`}
    >
      {/* Drag & Drop Visual Overlay */}
      {showDropHighlight && (
        <div className="absolute inset-0 z-30 bg-base-300/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary animate-in fade-in duration-100 pointer-events-none">
          <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-2 shadow-md animate-bounce">
            <UploadCloud className="w-6 h-6" />
          </div>
          <span className="font-bold text-xs text-base-content">
            Drop here to {mode === "remote" ? "Upload to Remote Directory" : "Download to Local Directory"}
          </span>
          <span className="text-[10px] text-base-content/60 font-mono mt-0.5 truncate max-w-xs">
            Target: {currentPath}
          </span>
        </div>
      )}

      {/* Pane Top Header */}
      <div className="h-11 bg-base-200/70 border-b border-base-300 px-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          {mode === "remote" ? (
            <Globe className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <HardDrive className="w-4 h-4 text-secondary shrink-0" />
          )}
          <span className="font-bold text-xs truncate">{title}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleGoUp}
            disabled={currentPath === "/" || currentPath === "" || currentPath === "."}
            className="btn btn-ghost btn-xs btn-square"
            title="Go to Parent Directory"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading}
            className="btn btn-ghost btn-xs btn-square"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsMkdirOpen(true)}
            className="btn btn-ghost btn-xs btn-square"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-secondary" />
          </button>
        </div>
      </div>

      {/* Breadcrumb Path Bar & Search Bar */}
      <div className="px-3 py-1.5 bg-base-200/30 border-b border-base-300 flex items-center justify-between gap-2 text-xs">
        <div className="font-mono text-[11px] text-base-content/80 truncate flex-1 bg-base-100 px-2 py-1 rounded-md border border-base-300">
          {currentPath}
        </div>

        <div className="relative w-36">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter files..."
            className="input input-xs input-bordered w-full pl-6 text-[10px]"
          />
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-2 bg-error/10 text-error text-xs border-b border-error/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="btn btn-ghost btn-xs btn-circle text-error"
          >
            ✕
          </button>
        </div>
      )}

      {/* File List Table */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-base-100">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-2">
            <span className="loading loading-spinner loading-sm text-primary" />
            <span className="text-xs text-base-content/50 font-mono">Loading entries...</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-base-content/40 text-xs">
            <span>Empty directory</span>
          </div>
        ) : (
          <table className="table table-xs table-pin-rows w-full font-mono">
            <thead>
              <tr className="bg-base-200/50 text-[10px] text-base-content/60">
                <th>Name</th>
                <th className="w-20 text-right">Size</th>
                <th className="w-28 text-right hidden sm:table-cell">Modified</th>
                <th className="w-16 text-right hidden md:table-cell">Perms</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const isSelected = activeSelectedFile?.path === entry.path;

                return (
                  <tr
                    key={entry.path}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/haze-sftp-entry", JSON.stringify(entry));
                      e.dataTransfer.setData("application/haze-sftp-source-mode", mode);
                      e.dataTransfer.setData("text/plain", entry.path);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => handleSelect(entry)}
                    onDoubleClick={() => handleRowDoubleClick(entry)}
                    className={`cursor-pointer transition-colors text-xs ${
                      isSelected
                        ? "bg-primary/20 text-primary font-semibold"
                        : "hover:bg-base-200/50"
                    }`}
                  >
                    <td className="truncate max-w-[180px] flex items-center gap-2 font-sans">
                      {getFileIcon(entry)}
                      <span className="truncate">{entry.name}</span>
                    </td>
                    <td className="text-right text-[11px] text-base-content/60">
                      {entry.is_dir ? "-" : formatBytes(entry.size)}
                    </td>
                    <td className="text-right text-[10px] text-base-content/50 hidden sm:table-cell">
                      {formatDate(entry.modified)}
                    </td>
                    <td className="text-right text-[10px] text-base-content/40 hidden md:table-cell">
                      {entry.permissions}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pane Footer / Selected File Actions */}
      <div className="h-9 bg-base-200/50 border-t border-base-300 px-3 flex items-center justify-between text-xs shrink-0">
        <span className="text-[11px] text-base-content/50 truncate max-w-[150px]">
          {activeSelectedFile ? activeSelectedFile.name : `${filteredEntries.length} items`}
        </span>

        {activeSelectedFile && (
          <div className="flex items-center gap-1">
            {!activeSelectedFile.is_dir && onOpenFile && (
              <button
                type="button"
                onClick={() => onOpenFile(activeSelectedFile)}
                className="btn btn-ghost btn-xs text-info gap-1"
                title="Edit in In-App Editor"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            )}

            {onTransfer && (
              <button
                type="button"
                onClick={() => onTransfer(activeSelectedFile)}
                className="btn btn-primary btn-xs gap-1"
              >
                <CornerDownRight className="w-3 h-3" />
                <span>{transferLabel}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setRenameTarget(activeSelectedFile);
                setNewFileName(activeSelectedFile.name);
                setIsRenameOpen(true);
              }}
              className="btn btn-ghost btn-xs btn-square text-base-content/70 hover:text-base-content"
              title="Rename"
            >
              <FilePenLine className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={() => handleOpenDelete(activeSelectedFile)}
              className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/20"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal (Native In-App) */}
      {isDeleteOpen && fileToDelete && (
        <div className="modal modal-open z-50">
          <div className="modal-box bg-base-200 border border-base-300 max-w-sm shadow-2xl">
            <h4 className="font-bold text-sm mb-2 text-error flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete {fileToDelete.is_dir ? "Folder" : "File"}
            </h4>
            <p className="text-xs text-base-content/80 mt-1 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <span className="font-mono font-bold text-base-content">
                &ldquo;{fileToDelete.name}&rdquo;
              </span>
              ?
            </p>
            {fileToDelete.is_dir && (
              <p className="text-[11px] text-warning mt-1.5">
                Warning: This folder and all its contents will be permanently removed.
              </p>
            )}
            <div className="modal-action mt-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setFileToDelete(null);
                }}
                disabled={isDeleting}
                className="btn btn-xs btn-ghost border border-base-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn btn-xs btn-error"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop bg-black/60"
            onClick={() => {
              if (!isDeleting) {
                setIsDeleteOpen(false);
                setFileToDelete(null);
              }
            }}
          />
        </div>
      )}

      {/* New Folder Modal */}
      {isMkdirOpen && (
        <div className="modal modal-open z-40">
          <div className="modal-box bg-base-200 border border-base-300 max-w-xs shadow-2xl">
            <h4 className="font-bold text-sm mb-3">Create New Folder</h4>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="input input-sm input-bordered w-full bg-base-100 text-xs"
                autoFocus
              />
              <div className="modal-action mt-4 gap-2">
                <button
                  type="button"
                  onClick={() => setIsMkdirOpen(false)}
                  className="btn btn-xs btn-ghost border border-base-300"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-xs btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setIsMkdirOpen(false)} />
        </div>
      )}

      {/* Rename Modal */}
      {isRenameOpen && renameTarget && (
        <div className="modal modal-open z-40">
          <div className="modal-box bg-base-200 border border-base-300 max-w-xs shadow-2xl">
            <h4 className="font-bold text-sm mb-3">Rename Item</h4>
            <form onSubmit={handleRename} className="space-y-3">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="New name..."
                className="input input-sm input-bordered w-full bg-base-100 text-xs font-mono"
                autoFocus
              />
              <div className="modal-action mt-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRenameOpen(false);
                    setRenameTarget(null);
                  }}
                  className="btn btn-xs btn-ghost border border-base-300"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-xs btn-primary">
                  Rename
                </button>
              </div>
            </form>
          </div>
          <div
            className="modal-backdrop bg-black/50"
            onClick={() => {
              setIsRenameOpen(false);
              setRenameTarget(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
