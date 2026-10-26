import { useEffect, useRef, useState } from "react";
import {
  Terminal,
  FolderGit2,
  Copy,
  Edit2,
  Trash2,
  Check,
  PlusSquare,
  TerminalSquare,
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useHostStore } from "@/stores/useHostStore";
import { formatShortcut } from "@/utils/platform";
import type { Host } from "@/types/host";

interface HostContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly host: Host;
  readonly onEdit: (host: Host) => void;
  readonly onDelete: (host: Host) => void;
  readonly onClose: () => void;
}

export function HostContextMenu({
  x,
  y,
  host,
  onEdit,
  onDelete,
  onClose,
}: HostContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedType, setCopiedType] = useState<"address" | "command" | null>(null);

  const { openTab } = useMultiplexerStore();
  const { setView, setSftpTargetHostId } = useLayoutStore();
  const { createHost } = useHostStore();

  // Position clamping inside viewport bounds
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

      menuRef.current.style.left = `${newLeft}px`;
      menuRef.current.style.top = `${newTop}px`;
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

  const handleConnect = () => {
    if (host.auth_type === "telnet") {
      openTab(
        {
          title: `Telnet: ${host.label}`,
          connectionType: "telnet",
          hostId: host.id,
          hostname: host.hostname,
          port: host.port,
          telnetOptions: { host: host.hostname, port: host.port },
          status: "connecting",
        },
        `Telnet: ${host.label}`
      );
    } else {
      openTab(
        {
          title: host.label,
          hostId: host.id,
          hostname: host.hostname,
          port: host.port,
          username: host.username ?? undefined,
          status: "connecting",
        },
        host.label
      );
    }
    onClose();
  };

  const handleOpenSftp = () => {
    setSftpTargetHostId(host.id);
    setView("sftp");
    onClose();
  };

  const handleCopyAddress = async () => {
    const fullAddress = `${host.username ? `${host.username}@` : ""}${host.hostname}:${host.port}`;
    await navigator.clipboard.writeText(fullAddress);
    setCopiedType("address");
    setTimeout(() => {
      setCopiedType(null);
      onClose();
    }, 500);
  };

  const handleCopySshCommand = async () => {
    const userPart = host.username ? `${host.username}@` : "";
    const portPart = host.port && host.port !== 22 ? ` -p ${host.port}` : "";
    const cmd = `ssh ${userPart}${host.hostname}${portPart}`;
    await navigator.clipboard.writeText(cmd);
    setCopiedType("command");
    setTimeout(() => {
      setCopiedType(null);
      onClose();
    }, 500);
  };

  const handleDuplicate = async () => {
    try {
      const duplicateLabel = `${host.label} (Copy)`;
      await createHost({
        label: duplicateLabel,
        hostname: host.hostname,
        port: host.port,
        username: host.username ?? undefined,
        auth_type: host.auth_type,
        identity_id: host.identity_id ?? undefined,
        group_id: host.group_id ?? undefined,
        tags: host.tags,
        color: host.color ?? undefined,
        jump_host_id: host.jump_host_id ?? undefined,
      });
    } catch (err) {
      console.warn("Failed to duplicate host:", err);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${y}px`, left: `${x}px` }}
      className="fixed z-50 min-w-52 bg-base-100/95 backdrop-blur-md border border-base-300 rounded-lg shadow-2xl py-1 text-xs text-base-content select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {/* Header with host label */}
      <div className="px-3 py-1.5 border-b border-base-300/60 mb-0.5 flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: host.color || "#3b82f6" }}
        />
        <span className="font-semibold text-xs truncate max-w-[170px]">
          {host.label}
        </span>
      </div>

      {/* Connect in Terminal */}
      <button
        type="button"
        onClick={handleConnect}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors font-medium text-primary"
      >
        <span className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5" />
          <span>Connect SSH</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          ↵
        </kbd>
      </button>

      {/* Open SFTP */}
      <button
        type="button"
        onClick={handleOpenSftp}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <FolderGit2 className="w-3.5 h-3.5 text-secondary" />
          <span>Open SFTP Browser</span>
        </span>
      </button>

      <div className="h-px bg-base-300 my-1" />

      {/* Copy SSH Command */}
      <button
        type="button"
        onClick={handleCopySshCommand}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          {copiedType === "command" ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <TerminalSquare className="w-3.5 h-3.5 text-base-content/70" />
          )}
          <span>{copiedType === "command" ? "Command Copied!" : "Copy SSH Command"}</span>
        </span>
      </button>

      {/* Copy Host Address */}
      <button
        type="button"
        onClick={handleCopyAddress}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          {copiedType === "address" ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-base-content/70" />
          )}
          <span>{copiedType === "address" ? "Address Copied!" : "Copy Address"}</span>
        </span>
      </button>

      <div className="h-px bg-base-300 my-1" />

      {/* Duplicate Host */}
      <button
        type="button"
        onClick={handleDuplicate}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <PlusSquare className="w-3.5 h-3.5 text-info" />
          <span>Duplicate Host</span>
        </span>
      </button>

      {/* Edit Host */}
      <button
        type="button"
        onClick={() => {
          onEdit(host);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-base-200 text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Edit2 className="w-3.5 h-3.5 text-base-content/70" />
          <span>Edit Host...</span>
        </span>
        <kbd className="kbd kbd-xs font-mono text-[9px] text-base-content/40">
          {formatShortcut("⌘E", "Ctrl+E")}
        </kbd>
      </button>

      <div className="h-px bg-base-300 my-1" />

      {/* Delete Host */}
      <button
        type="button"
        onClick={() => {
          onDelete(host);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-error/15 text-error text-left cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Host...</span>
        </span>
      </button>
    </div>
  );
}
