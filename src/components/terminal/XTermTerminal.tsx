import { useEffect, useRef, useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "@xterm/xterm/css/xterm.css";

import { api } from "@/services/api";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import { useTerminalSettingsStore } from "@/stores/useTerminalSettingsStore";
import { resolveTerminalTheme } from "@/services/terminalThemes";
import { FileDropModal, type DroppedFileInfo } from "@/components/terminal/FileDropModal";
import { TerminalContextMenu } from "@/components/terminal/TerminalContextMenu";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { attachTerminalRenderer } from "@/components/terminal/terminalRenderer";
import type { TerminalPane } from "@/types/terminal";

const textEncoder = new TextEncoder();

interface XTermTerminalProps {
  readonly pane: TerminalPane;
  readonly isFocused: boolean;
  readonly isTabActive?: boolean;
}

export function XTermTerminal({
  pane,
  isFocused,
  isTabActive = true,
}: XTermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<DroppedFileInfo | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const { currentTheme } = useThemeStore();
  const {
    fontSize,
    fontFamily,
    lineHeight,
    cursorStyle,
    cursorBlink,
    scrollback,
    gpuAcceleration,
    terminalTheme,
  } = useTerminalSettingsStore();

  const activeTheme = resolveTerminalTheme(terminalTheme, currentTheme);

  const handlePastePath = (path: string) => {
    const toSend = path.includes(" ") ? `"${path}" ` : `${path} `;
    const session = terminalSessionManager.getSession(pane.id);
    const sessionId = session?.sessionId;
    if (sessionId) {
      const bytes = Array.from(textEncoder.encode(toSend));
      if (pane.connectionType === "local") {
        void api.ptyWrite(sessionId, bytes);
      } else if (pane.connectionType === "serial") {
        void api.serialWrite(sessionId, bytes);
      } else if (pane.connectionType === "telnet") {
        void api.telnetWrite(sessionId, bytes);
      } else {
        void api.sshWrite(sessionId, bytes);
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const filePath = (file as unknown as { path?: string }).path;
      if (filePath) {
        const fileInfo: DroppedFileInfo = {
          name: file.name,
          path: filePath,
          size: file.size,
        };

        if (!pane.hostId) {
          handlePastePath(filePath);
        } else {
          setDroppedFile(fileInfo);
        }
      }
    }
  };

  // Native Tauri drag-and-drop listener for OS-level file drops
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isCancelled = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (isCancelled || !containerRef.current) return;

        if (event.payload.type === "leave") {
          setIsDragOver(false);
          return;
        }

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const pos = event.payload.position;
        const dpr = window.devicePixelRatio || 1;

        const elDirect = document.elementFromPoint(pos.x, pos.y);
        const elScaled = document.elementFromPoint(pos.x / dpr, pos.y / dpr);
        const inDirect =
          pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
        const inScaled =
          pos.x / dpr >= rect.left &&
          pos.x / dpr <= rect.right &&
          pos.y / dpr >= rect.top &&
          pos.y / dpr <= rect.bottom;

        const isOverMe =
          Boolean(elDirect && container.contains(elDirect)) ||
          Boolean(elScaled && container.contains(elScaled)) ||
          inDirect ||
          inScaled;

        if (event.payload.type === "over" || event.payload.type === "enter") {
          setIsDragOver(isOverMe);
        } else if (event.payload.type === "drop") {
          if (isOverMe && event.payload.paths.length > 0) {
            setIsDragOver(false);
            const rawPath = event.payload.paths[0];
            const fileName = rawPath.replace(/\\/g, "/").split("/").pop() || rawPath;
            const fileInfo: DroppedFileInfo = {
              name: fileName,
              path: rawPath,
            };

            if (!pane.hostId) {
              handlePastePath(rawPath);
            } else {
              setDroppedFile(fileInfo);
            }
          } else {
            setIsDragOver(false);
          }
        }
      })
      .then((cleanup) => {
        if (isCancelled) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch((err) => {
        console.warn("Failed to attach Tauri drag drop listener in XTermTerminal:", err);
      });

    return () => {
      isCancelled = true;
      unlisten?.();
    };
  }, [pane.hostId]);

  // Main Terminal Mount & Persistence Effect
  useEffect(() => {
    if (!containerRef.current) return;

    // Get or create persistent terminal session
    terminalSessionManager.getOrCreateSession(pane);

    // Attach wrapper DOM node to container
    terminalSessionManager.attachToContainer(pane.id, containerRef.current);

    // Handle container resize & fit
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;

      terminalSessionManager.fitAndResize(pane.id);
    });

    resizeObserver.observe(containerRef.current);

    const handleWindowResize = () => {
      terminalSessionManager.fitAndResize(pane.id);
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();
      // Detach from container DOM without destroying the underlying SSH session or xterm instance!
      terminalSessionManager.detachFromContainer(pane.id);
    };
  }, [
    pane.id,
    pane.hostId,
    pane.hostname,
    pane.port,
    pane.username,
    pane.connectionType,
  ]);

  // Sync active pane in registry and refit/focus when focused & tab is visible
  useEffect(() => {
    if (isFocused && isTabActive) {
      useTerminalRegistryStore.getState().setActivePaneId(pane.id);

      let cancelled = false;

      const frameId = requestAnimationFrame(() => {
        if (cancelled) return;
        terminalSessionManager.fitAndResize(pane.id);
        const session = terminalSessionManager.getSession(pane.id);
        session?.term.focus();
      });

      const timerId = setTimeout(() => {
        if (cancelled) return;
        terminalSessionManager.fitAndResize(pane.id);
        const session = terminalSessionManager.getSession(pane.id);
        session?.term.focus();
      }, 50);

      return () => {
        cancelled = true;
        cancelAnimationFrame(frameId);
        clearTimeout(timerId);
      };
    }
  }, [isFocused, isTabActive, pane.id]);

  // Sync theme changes live
  useEffect(() => {
    const session = terminalSessionManager.getSession(pane.id);
    if (session) {
      session.term.options.theme = activeTheme;
    }
  }, [activeTheme, pane.id]);

  // Sync typography and appearance settings live
  useEffect(() => {
    const session = terminalSessionManager.getSession(pane.id);
    if (session) {
      session.term.options.fontSize = fontSize;
      session.term.options.fontFamily = fontFamily;
      session.term.options.lineHeight = lineHeight;
      session.term.options.cursorStyle = cursorStyle;
      session.term.options.cursorBlink = cursorBlink;
      session.term.options.scrollback = scrollback;
      try {
        session.fitAddon.fit();
      } catch {
        // Ignored if hidden
      }
    }
  }, [fontSize, fontFamily, lineHeight, cursorStyle, cursorBlink, scrollback, pane.id]);

  // Hot-swap hardware acceleration renderer when setting changes
  useEffect(() => {
    const session = terminalSessionManager.getSession(pane.id);
    if (session) {
      session.rendererHandle?.dispose();
      session.rendererHandle = attachTerminalRenderer(session.term, gpuAcceleration);
      try {
        session.fitAddon.fit();
      } catch {
        // Ignored if hidden
      }
    }
  }, [gpuAcceleration, pane.id]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      style={{ backgroundColor: activeTheme.background }}
      className={`w-full h-full p-2 overflow-hidden select-text relative transition-colors duration-150 ${
        isDragOver ? "ring-2 ring-primary ring-inset" : ""
      }`}
      onClick={() => {
        const session = terminalSessionManager.getSession(pane.id);
        session?.term.focus();
      }}
    >
      {/* Drag Over Visual Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-30 bg-base-300/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary animate-in fade-in duration-100 pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-3 shadow-lg animate-bounce">
            <UploadCloud className="w-7 h-7" />
          </div>
          <span className="font-bold text-sm text-base-content">
            Drop file to {pane.hostId ? "Upload via SFTP" : "Paste Path"}
          </span>
          <span className="text-xs text-base-content/60 mt-1">
            {pane.hostname ? `Target server: ${pane.hostname}` : "Paste path into active shell"}
          </span>
        </div>
      )}

      {/* File Drop Confirmation / SFTP Upload Modal */}
      <FileDropModal
        isOpen={droppedFile !== null}
        file={droppedFile}
        pane={pane}
        onClose={() => setDroppedFile(null)}
        onPastePath={handlePastePath}
      />

      {pane.status !== "connected" && (
        <div className="absolute bottom-2 right-3 z-10 pointer-events-none">
          <span
            className={`badge badge-xs text-[10px] font-mono shadow-md ${
              pane.status === "error"
                ? "badge-error"
                : pane.status === "disconnected"
                ? "badge-neutral"
                : "badge-warning animate-pulse"
            }`}
          >
            {pane.status}
          </span>
        </div>
      )}
      {/* Terminal Right-Click Context Menu */}
      {contextMenu && (
        <TerminalContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          pane={pane}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
