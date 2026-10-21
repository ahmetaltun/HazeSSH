import { useEffect, useRef, useState } from "react";
import {
  Eye,
  FilePenLine,
  FolderOpen,
  CornerDownRight,
  Copy,
  Edit2,
  Trash2,
  FolderPlus,
  RefreshCw,
  Check,
} from "lucide-react";
import type { FileEntry } from "@/types/sftp";
import { isEditableText } from "@/utils/fileTypes";

export { getFileCategory as getFilePreviewType } from "@/utils/fileTypes";

interface FileContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly targetEntry: FileEntry | null;
  readonly selectedFiles: FileEntry[];
  readonly mode: "remote" | "local";
  readonly transferLabel?: string;
  readonly onOpenFolder?: (entry: FileEntry) => void;
  readonly onPreviewFile?: (entry: FileEntry) => void;
  readonly onEditFile?: (entry: FileEntry) => void;
  readonly onTransfer?: (entries: FileEntry[]) => void;
  readonly onRename?: (entry: FileEntry) => void;
  readonly onDelete?: (entries: FileEntry[]) => void;
  readonly onNewFolder?: () => void;
  readonly onRefresh?: () => void;
  readonly onClose: () => void;
}

export function FileContextMenu({
  x,
  y,
  targetEntry,
  selectedFiles,
  mode: _mode,
  transferLabel = "Transfer",
  onOpenFolder,
  onPreviewFile,
  onEditFile,
  onTransfer,
  onRename,
  onDelete,
  onNewFolder,
  onRefresh,
  onClose,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });
  const [copied, setCopied] = useState(false);

  // Position clamping to keep within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let newLeft = x;
      let newTop = y;

      if (x + rect.width > window.innerWidth - 8) {
        newLeft = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (y + rect.height > window.innerHeight - 8) {
        newTop = Math.max(8, window.innerHeight - rect.height - 8);
      }

      setPos({ top: newTop, left: newLeft });
    }
  }, [x, y]);

  // Outside click & ESC listener
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const activeTargets =
    targetEntry && selectedFiles.some((f) => f.path === targetEntry.path)
      ? selectedFiles
      : targetEntry
      ? [targetEntry]
      : [];

  const isSingle = activeTargets.length === 1;
  const singleItem = isSingle ? activeTargets[0] : null;
  const isFolder = singleItem?.is_dir ?? false;
  const canEdit = !isFolder && singleItem ? isEditableText(singleItem.name) : false;

  const handleCopyPath = async () => {
    if (activeTargets.length > 0) {
      const paths = activeTargets.map((f) => f.path).join("\n");
      await navigator.clipboard.writeText(paths);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 600);
    }
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
      className="fixed z-50 min-w-44 bg-base-100/95 backdrop-blur-md border border-base-300 rounded-lg shadow-2xl py-1 text-xs text-base-content select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* If right-clicked on an entry */}
      {singleItem ? (
        <>
          {isFolder ? (
            <button
              type="button"
              onClick={() => {
                onOpenFolder?.(singleItem);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left font-medium"
            >
              <FolderOpen className="w-3.5 h-3.5 text-warning" />
              <span>Open Folder</span>
            </button>
          ) : (
            <>
              {/* Preview action */}
              <button
                type="button"
                onClick={() => {
                  onPreviewFile?.(singleItem);
                  onClose();
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left font-medium"
              >
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>Preview</span>
              </button>

              {/* Edit action for text/code/md */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    onEditFile?.(singleItem);
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left"
                >
                  <FilePenLine className="w-3.5 h-3.5 text-info" />
                  <span>Edit in Editor</span>
                </button>
              )}
            </>
          )}

          {/* Transfer / Download / Upload */}
          {onTransfer && (
            <button
              type="button"
              onClick={() => {
                onTransfer(activeTargets);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left"
            >
              <CornerDownRight className="w-3.5 h-3.5 text-secondary" />
              <span>
                {transferLabel}
                {activeTargets.length > 1 ? ` (${activeTargets.length})` : ""}
              </span>
            </button>
          )}

          <div className="h-px bg-base-300 my-1" />

          {/* Copy Path */}
          <button
            type="button"
            onClick={handleCopyPath}
            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-base-content/70" />
            )}
            <span>{copied ? "Path Copied!" : "Copy Full Path"}</span>
          </button>

          {/* Rename (only single item) */}
          {isSingle && onRename && (
            <button
              type="button"
              onClick={() => {
                onRename(singleItem);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left"
            >
              <Edit2 className="w-3.5 h-3.5 text-base-content/70" />
              <span>Rename</span>
            </button>
          )}

          <div className="h-px bg-base-300 my-1" />

          {/* Delete */}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(activeTargets);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-error/15 text-error text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                Delete
                {activeTargets.length > 1 ? ` (${activeTargets.length})` : ""}
              </span>
            </button>
          )}
        </>
      ) : (
        /* Empty area context actions */
        <>
          {onNewFolder && (
            <button
              type="button"
              onClick={() => {
                onNewFolder();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left"
            >
              <FolderPlus className="w-3.5 h-3.5 text-secondary" />
              <span>New Folder</span>
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={() => {
                onRefresh();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-base-200 text-left"
            >
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              <span>Refresh Pane</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
