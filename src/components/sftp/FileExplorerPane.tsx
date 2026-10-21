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
  AlertTriangle,
} from "lucide-react";
import { api } from "@/services/api";
import type { FileEntry } from "@/types/sftp";

interface FileExplorerPaneProps {
  readonly title: string;
  readonly mode: "local" | "remote";
  readonly hostId?: string;
  readonly currentPath: string;
  readonly selectedFiles?: FileEntry[];
  readonly onSelectFiles?: (files: FileEntry[]) => void;
  readonly onNavigate: (path: string) => void;
  readonly onOpenFile?: (file: FileEntry) => void;
  readonly onTransfer?: (files: FileEntry[]) => void;
  readonly transferLabel?: string;
  readonly refreshKey?: number;
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
  selectedFiles: externalSelectedFiles,
  onSelectFiles,
  onNavigate,
  onOpenFile,
  onTransfer,
  transferLabel = "Transfer",
  refreshKey = 0,
}: FileExplorerPaneProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [internalSelectedFiles, setInternalSelectedFiles] = useState<FileEntry[]>([]);
  const lastClickedEntryRef = useRef<FileEntry | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // In-memory directory cache for instant (0ms) folder navigation
  const dirCacheRef = useRef<Map<string, FileEntry[]>>(new Map());
  const activePathRef = useRef<string>(currentPath);
  activePathRef.current = currentPath;

  const getCacheKey = (p: string) => `${mode}:${mode === "remote" ? hostId || "" : "local"}:${p}`;

  // New folder dialog
  const [isMkdirOpen, setIsMkdirOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Rename dialog
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [newFileName, setNewFileName] = useState("");

  // Delete confirmation dialog (native in-app)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [filesToDelete, setFilesToDelete] = useState<FileEntry[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeSelectedFiles = externalSelectedFiles !== undefined ? externalSelectedFiles : internalSelectedFiles;
  const singleSelectedFile = activeSelectedFiles.length === 1 ? activeSelectedFiles[0] : null;

  const handleSelectFiles = (files: FileEntry[]) => {
    if (externalSelectedFiles === undefined) {
      setInternalSelectedFiles(files);
    }
    onSelectFiles?.(files);
  };

  const loadDirectory = async (path: string, forceFresh = false) => {
    const cacheKey = getCacheKey(path);
    const cached = dirCacheRef.current.get(cacheKey);

    if (!forceFresh && cached) {
      // Instant display from cache (0ms perceived latency)
      setEntries(cached);
      setIsLoading(false);
      setIsRevalidating(true);
    } else {
      setIsLoading(true);
    }

    setErrorMsg(null);
    handleSelectFiles([]);
    lastClickedEntryRef.current = null;

    try {
      let data: FileEntry[] = [];
      if (mode === "remote") {
        if (!hostId) {
          setEntries([]);
          setIsLoading(false);
          setIsRevalidating(false);
          return;
        }
        data = await api.sftpListRemote(hostId, path);
      } else {
        data = await api.sftpListLocal(path);
      }

      // Always update cache with latest fetched entries
      dirCacheRef.current.set(cacheKey, data);

      // Only update state if user is still on this path
      if (activePathRef.current === path) {
        setEntries(data);
      }
    } catch (err: unknown) {
      if (activePathRef.current === path) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        if (!cached) {
          setEntries([]);
        }
      }
    } finally {
      if (activePathRef.current === path) {
        setIsLoading(false);
        setIsRevalidating(false);
      }
    }
  };

  useEffect(() => {
    // If refreshKey triggered this update, force fresh listing from backend
    loadDirectory(currentPath, refreshKey > 0);
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

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const q = searchTerm.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, searchTerm]);

  // Multi-selection click handler with Shift and Cmd/Ctrl
  const handleRowClick = (entry: FileEntry, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle individual entry
      const exists = activeSelectedFiles.some((f) => f.path === entry.path);
      const updated = exists
        ? activeSelectedFiles.filter((f) => f.path !== entry.path)
        : [...activeSelectedFiles, entry];
      lastClickedEntryRef.current = entry;
      handleSelectFiles(updated);
    } else if (e.shiftKey && lastClickedEntryRef.current) {
      // Range selection
      const fromIdx = filteredEntries.findIndex((f) => f.path === lastClickedEntryRef.current?.path);
      const toIdx = filteredEntries.findIndex((f) => f.path === entry.path);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const range = filteredEntries.slice(start, end + 1);

        const rangePaths = new Set(range.map((r) => r.path));
        const nonRangeSelected = activeSelectedFiles.filter((f) => !rangePaths.has(f.path));
        handleSelectFiles([...nonRangeSelected, ...range]);
      } else {
        lastClickedEntryRef.current = entry;
        handleSelectFiles([entry]);
      }
    } else {
      // Single selection
      lastClickedEntryRef.current = entry;
      handleSelectFiles([entry]);
    }
  };

  const handleToggleEntryCheckbox = (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const exists = activeSelectedFiles.some((f) => f.path === entry.path);
    const updated = exists
      ? activeSelectedFiles.filter((f) => f.path !== entry.path)
      : [...activeSelectedFiles, entry];
    lastClickedEntryRef.current = entry;
    handleSelectFiles(updated);
  };

  const isAllSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((e) => activeSelectedFiles.some((f) => f.path === e.path));

  const isIndeterminate =
    activeSelectedFiles.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      handleSelectFiles([]);
    } else {
      handleSelectFiles([...filteredEntries]);
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
      dirCacheRef.current.delete(getCacheKey(currentPath));
      loadDirectory(currentPath, true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenDelete = (targets: FileEntry[]) => {
    if (targets.length === 0) return;
    setFilesToDelete(targets);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (filesToDelete.length === 0) return;
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      for (const item of filesToDelete) {
        if (mode === "remote" && hostId) {
          await api.sftpDeleteFile(hostId, item.path, item.is_dir);
        } else {
          await api.sftpLocalDelete(item.path, item.is_dir);
        }
      }
      setIsDeleteOpen(false);
      setFilesToDelete([]);
      handleSelectFiles([]);
      dirCacheRef.current.delete(getCacheKey(currentPath));
      loadDirectory(currentPath, true);
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
      dirCacheRef.current.delete(getCacheKey(currentPath));
      loadDirectory(currentPath, true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 border border-base-300 rounded-xl overflow-hidden select-none relative">
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
            onClick={() => loadDirectory(currentPath, true)}
            disabled={isLoading}
            className="btn btn-ghost btn-xs btn-square"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRevalidating ? "animate-spin text-primary" : ""}`} />
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
                <th className="w-8 px-2 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate;
                    }}
                    onChange={handleToggleSelectAll}
                    className="checkbox checkbox-xs rounded"
                    title={isAllSelected ? "Deselect All" : "Select All"}
                  />
                </th>
                <th>Name</th>
                <th className="w-20 text-right">Size</th>
                <th className="w-28 text-right hidden sm:table-cell">Modified</th>
                <th className="w-16 text-right hidden md:table-cell">Perms</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const isSelected = activeSelectedFiles.some((f) => f.path === entry.path);

                return (
                  <tr
                    key={entry.path}
                    onClick={(e) => handleRowClick(entry, e)}
                    onDoubleClick={() => handleRowDoubleClick(entry)}
                    className={`cursor-pointer transition-colors text-xs ${
                      isSelected
                        ? "bg-primary/20 text-primary font-semibold"
                        : "hover:bg-base-200/50"
                    }`}
                  >
                    <td
                      className="w-8 px-2 text-center"
                      onClick={(e) => handleToggleEntryCheckbox(entry, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="checkbox checkbox-xs rounded pointer-events-none"
                      />
                    </td>
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
        <span className="text-[11px] text-base-content/60 truncate max-w-[220px]">
          {activeSelectedFiles.length === 0
            ? `${filteredEntries.length} items`
            : activeSelectedFiles.length === 1
            ? `${activeSelectedFiles[0].name} (${
                activeSelectedFiles[0].is_dir ? "folder" : formatBytes(activeSelectedFiles[0].size)
              })`
            : `${activeSelectedFiles.length} items selected (${formatBytes(
                activeSelectedFiles.reduce((acc, cur) => acc + (cur.is_dir ? 0 : cur.size), 0)
              )})`}
        </span>

        {activeSelectedFiles.length > 0 && (
          <div className="flex items-center gap-1">
            {singleSelectedFile && !singleSelectedFile.is_dir && onOpenFile && (
              <button
                type="button"
                onClick={() => onOpenFile(singleSelectedFile)}
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
                onClick={() => onTransfer(activeSelectedFiles)}
                className="btn btn-primary btn-xs gap-1"
              >
                <CornerDownRight className="w-3 h-3" />
                <span>
                  {transferLabel}
                  {activeSelectedFiles.length > 1 ? ` (${activeSelectedFiles.length})` : ""}
                </span>
              </button>
            )}

            {singleSelectedFile && (
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(singleSelectedFile);
                  setNewFileName(singleSelectedFile.name);
                  setIsRenameOpen(true);
                }}
                className="btn btn-ghost btn-xs btn-square text-base-content/70 hover:text-base-content"
                title="Rename"
              >
                <FilePenLine className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              onClick={() => handleOpenDelete(activeSelectedFiles)}
              className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/20"
              title={
                activeSelectedFiles.length > 1
                  ? `Delete ${activeSelectedFiles.length} items`
                  : "Delete item"
              }
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal (Native In-App) */}
      {isDeleteOpen && filesToDelete.length > 0 && (
        <div className="modal modal-open z-50">
          <div className="modal-box bg-base-200 border border-base-300 max-w-sm shadow-2xl">
            <h4 className="font-bold text-sm mb-2 text-error flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {filesToDelete.length === 1
                ? `Delete ${filesToDelete[0].is_dir ? "Folder" : "File"}`
                : `Delete ${filesToDelete.length} Items`}
            </h4>
            <p className="text-xs text-base-content/80 mt-1 leading-relaxed">
              {filesToDelete.length === 1 ? (
                <>
                  Are you sure you want to permanently delete{" "}
                  <span className="font-mono font-bold text-base-content">
                    &ldquo;{filesToDelete[0].name}&rdquo;
                  </span>
                  ?
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete these{" "}
                  <span className="font-bold text-base-content">{filesToDelete.length}</span> items?
                </>
              )}
            </p>
            {filesToDelete.some((f) => f.is_dir) && (
              <p className="text-[11px] text-warning mt-1.5">
                Warning: Any selected folders and their contents will be permanently removed.
              </p>
            )}
            <div className="modal-action mt-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setFilesToDelete([]);
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
                setFilesToDelete([]);
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
