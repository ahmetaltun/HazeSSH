import { useEffect, useRef, useState, type DragEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { attachTerminalRenderer, type TerminalRendererHandle } from "@/components/terminal/terminalRenderer";
import { UploadCloud } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "@xterm/xterm/css/xterm.css";

import { api } from "@/services/api";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { useTerminalSettingsStore } from "@/stores/useTerminalSettingsStore";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { resolveHostVariables } from "@/services/snippetInterpolation";
import { getTerminalTheme } from "@/services/terminalThemes";
import { FileDropModal, type DroppedFileInfo } from "@/components/terminal/FileDropModal";
import type { TerminalPane, SplitNode } from "@/types/terminal";
import type { SshEvent } from "@/types/ssh";

const textEncoder = new TextEncoder();

interface XTermTerminalProps {
  readonly pane: TerminalPane;
  readonly isFocused: boolean;
}

export function XTermTerminal({ pane, isFocused }: XTermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const rendererHandleRef = useRef<TerminalRendererHandle | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const hasRunStartupSnippetRef = useRef<boolean>(false);

  const [connectionStatus, setConnectionStatus] = useState<string>("initializing");
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<DroppedFileInfo | null>(null);
  const { currentTheme } = useThemeStore();

  const handlePastePath = (path: string) => {
    const toSend = path.includes(" ") ? `"${path}" ` : `${path} `;
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      const bytes = Array.from(textEncoder.encode(toSend));
      if (pane.connectionType === "serial") {
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

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Create Terminal instance with user settings
    const initialSettings = useTerminalSettingsStore.getState();
    const term = new Terminal({
      cursorBlink: initialSettings.cursorBlink,
      cursorStyle: initialSettings.cursorStyle,
      fontSize: initialSettings.fontSize,
      fontFamily: initialSettings.fontFamily,
      lineHeight: initialSettings.lineHeight,
      theme: getTerminalTheme(currentTheme),
      allowProposedApi: true,
      scrollback: initialSettings.scrollback,
    });
    termRef.current = term;

    // 2. Addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    // 3. Open terminal in DOM
    term.open(containerRef.current);
    fitAddon.fit();

    // 4. Attach adaptive GPU / Canvas / DOM hardware acceleration renderer
    const rendererHandle = attachTerminalRenderer(term, initialSettings.gpuAcceleration);
    rendererHandleRef.current = rendererHandle;

    // 5. Handle incoming user typing
    const dataDisposable = term.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const bytes = Array.from(textEncoder.encode(data));

      if (pane.connectionType === "serial") {
        api.serialWrite(sessionId, bytes).catch((err) => {
          console.error("Failed to send serial input:", err);
        });
      } else if (pane.connectionType === "telnet") {
        api.telnetWrite(sessionId, bytes).catch((err) => {
          console.error("Failed to send telnet input:", err);
        });
      } else {
        api.sshWrite(sessionId, bytes).catch((err) => {
          console.error("Failed to send terminal input:", err);
        });
      }

      // Replicate keystrokes across other active sessions if broadcast mode is active
      const broadcastState = useBroadcastStore.getState();
      if (broadcastState.isBroadcastEnabled && !broadcastState.isPaneExcluded(pane.id)) {
        let targetPaneIds: string[] | undefined;
        if (broadcastState.scope === "tab") {
          const activeTab = useMultiplexerStore.getState().getActiveTab();
          if (activeTab) {
            const collectPaneIds = (node: SplitNode): string[] => {
              if (node.type === "leaf") return [node.pane.id];
              return [...collectPaneIds(node.first), ...collectPaneIds(node.second)];
            };
            const tabPaneIds = collectPaneIds(activeTab.rootNode);
            targetPaneIds = tabPaneIds.filter((id) => !broadcastState.isPaneExcluded(id));
          }
        }

        void useTerminalRegistryStore.getState().broadcastBytes(pane.id, bytes, targetPaneIds);
      }
    });

    // 5. Connect to Backend (SSH or Hardware Serial)
    let isDisposed = false;

    const connectToBackend = async () => {
      try {
        const handleTerminalEvent = (event: SshEvent) => {
          if (isDisposed) return;

          switch (event.type) {
            case "Data": {
              const uint8 = new Uint8Array(event.payload);
              term.write(uint8);
              break;
            }
            case "StatusChange": {
              setConnectionStatus(event.payload.status);
              const mappedStatus: TerminalPane["status"] =
                event.payload.status === "connected"
                  ? "connected"
                  : event.payload.status === "error"
                  ? "error"
                  : "connecting";
              useMultiplexerStore.getState().updatePaneStatus(pane.id, mappedStatus);

              if (event.payload.message) {
                term.writeln(`\r\n\x1b[33m[Haze] ${event.payload.message}\x1b[0m`);
              }

              // Run startup snippet on successful connection if configured (SSH only)
              if (
                event.payload.status === "connected" &&
                !hasRunStartupSnippetRef.current &&
                pane.hostId &&
                pane.connectionType !== "serial"
              ) {
                hasRunStartupSnippetRef.current = true;
                const host = useHostStore
                  .getState()
                  .hosts.find((h) => h.id === pane.hostId);

                if (host?.startup_snippet_id) {
                  const snippet = useSnippetStore
                    .getState()
                    .snippets.find((s) => s.id === host.startup_snippet_id);

                  if (snippet) {
                    const { resolvedScript } = resolveHostVariables(snippet.script, {
                      hostname: host.hostname,
                      username: host.username,
                      port: host.port,
                      label: host.label,
                    });

                    term.writeln(
                      `\r\n\x1b[36m[Haze SSH] Executing startup snippet: ${snippet.title}...\x1b[0m\r\n`
                    );

                    const toSend = resolvedScript.endsWith("\n")
                      ? resolvedScript
                      : `${resolvedScript}\n`;
                    const bytes = Array.from(textEncoder.encode(toSend));

                    setTimeout(() => {
                      if (!isDisposed && sessionIdRef.current) {
                        api.sshWrite(sessionIdRef.current, bytes).catch((err) => {
                          console.error("Failed to run startup snippet:", err);
                        });
                      }
                    }, 600);
                  }
                }
              }
              break;
            }
            case "Error": {
              setConnectionStatus("error");
              useMultiplexerStore.getState().updatePaneStatus(pane.id, "error", event.payload);
              term.writeln(`\r\n\x1b[31m[Haze Error] ${event.payload}\x1b[0m\r\n`);
              break;
            }
            case "Exit": {
              setConnectionStatus("disconnected");
              useMultiplexerStore.getState().updatePaneStatus(pane.id, "disconnected");
              term.writeln(`\r\n\x1b[90m[Session closed with exit code ${event.payload.code}]\x1b[0m\r\n`);
              break;
            }
          }
        };

        let sessionId: string;

        if (pane.connectionType === "serial") {
          term.writeln(
            `\x1b[90m[Haze Serial] Opening hardware port ${
              pane.serialOptions?.port_name || pane.title
            } at ${pane.serialOptions?.baud_rate || 115200} baud...\x1b[0m`
          );

          sessionId = await api.serialConnect({
            options: pane.serialOptions || {
              port_name: pane.title,
              baud_rate: 115200,
            },
            onEvent: handleTerminalEvent,
          });
        } else if (pane.connectionType === "telnet") {
          const cols = term.cols || 80;
          const rows = term.rows || 24;
          const host = pane.telnetOptions?.host || pane.hostname || "127.0.0.1";
          const port = pane.telnetOptions?.port || pane.port || 23;

          term.writeln(`\x1b[90m[Haze Telnet] Connecting to ${host}:${port}...\x1b[0m`);

          sessionId = await api.telnetConnect({
            options: pane.telnetOptions || {
              host,
              port,
              terminal_type: "xterm-256color",
              cols,
              rows,
            },
            onEvent: handleTerminalEvent,
          });
        } else {
          term.writeln("\x1b[90m[Haze SSH] Initializing SSH session...\x1b[0m");

          const cols = term.cols || 80;
          const rows = term.rows || 24;

          sessionId = await api.sshConnect({
            hostId: pane.hostId,
            hostname: pane.hostname || "127.0.0.1",
            port: pane.port || 22,
            username: pane.username,
            cols,
            rows,
            onEvent: handleTerminalEvent,
          });
        }

        sessionIdRef.current = sessionId;

        useTerminalRegistryStore.getState().registerSession({
          paneId: pane.id,
          sessionId,
          hostId: pane.hostId,
          hostname: pane.hostname,
          username: pane.username,
          port: pane.port,
          title: pane.title,
          sendCommand: async (command: string) => {
            const toSend = command.endsWith("\n") ? command : `${command}\n`;
            const bytes = Array.from(new TextEncoder().encode(toSend));
            if (pane.connectionType === "serial") {
              await api.serialWrite(sessionId, bytes);
            } else if (pane.connectionType === "telnet") {
              await api.telnetWrite(sessionId, bytes);
            } else {
              await api.sshWrite(sessionId, bytes);
            }
          },
          writeBytes: async (bytes: number[]) => {
            if (pane.connectionType === "serial") {
              await api.serialWrite(sessionId, bytes);
            } else if (pane.connectionType === "telnet") {
              await api.telnetWrite(sessionId, bytes);
            } else {
              await api.sshWrite(sessionId, bytes);
            }
          },
        });
      } catch (err: unknown) {
        if (isDisposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setConnectionStatus("error");
        useMultiplexerStore.getState().updatePaneStatus(pane.id, "error", message);
        term.writeln(`\r\n\x1b[31m[Haze Connection Failed] ${message}\x1b[0m\r\n`);
      }
    };

    connectToBackend();

    // 6. Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed || !containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;

      try {
        fitAddon.fit();
        const sessionId = sessionIdRef.current;
        if (
          sessionId &&
          term.cols > 0 &&
          term.rows > 0 &&
          pane.connectionType !== "serial" &&
          pane.connectionType !== "telnet"
        ) {
          api.sshResize(sessionId, term.cols, term.rows).catch((err) => {
            console.warn("Resize notification failed:", err);
          });
        }
      } catch {
        // Container might be hidden or detaching
      }
    });

    resizeObserver.observe(containerRef.current);

    // 7. Cleanup
    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        if (pane.connectionType === "serial") {
          api.serialDisconnect(sessionId).catch(() => {});
        } else if (pane.connectionType === "telnet") {
          api.telnetDisconnect(sessionId).catch(() => {});
        } else {
          api.sshDisconnect(sessionId).catch(() => {});
        }
      }

      useTerminalRegistryStore.getState().unregisterSession(pane.id);
      hasRunStartupSnippetRef.current = false;

      rendererHandleRef.current?.dispose();
      rendererHandleRef.current = null;
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      sessionIdRef.current = null;
    };
  }, [
    pane.id,
    pane.hostId,
    pane.hostname,
    pane.port,
    pane.username,
    pane.connectionType,
    pane.serialOptions,
    pane.telnetOptions,
  ]);

  // Sync active pane in registry when focused
  useEffect(() => {
    if (isFocused) {
      useTerminalRegistryStore.getState().setActivePaneId(pane.id);
    }
  }, [isFocused, pane.id]);

  // Sync theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTerminalTheme(currentTheme);
    }
  }, [currentTheme]);

  // Sync typography, appearance & GPU hardware acceleration settings live across all panes
  const {
    fontSize,
    fontFamily,
    lineHeight,
    cursorStyle,
    cursorBlink,
    scrollback,
    gpuAcceleration,
  } = useTerminalSettingsStore();

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      termRef.current.options.fontFamily = fontFamily;
      termRef.current.options.lineHeight = lineHeight;
      termRef.current.options.cursorStyle = cursorStyle;
      termRef.current.options.cursorBlink = cursorBlink;
      termRef.current.options.scrollback = scrollback;
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Container might be transitionally hidden
      }
    }
  }, [fontSize, fontFamily, lineHeight, cursorStyle, cursorBlink, scrollback]);

  // Hot-swap hardware acceleration renderer when setting changes
  useEffect(() => {
    if (termRef.current) {
      rendererHandleRef.current?.dispose();
      rendererHandleRef.current = attachTerminalRenderer(termRef.current, gpuAcceleration);
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Container might be transitionally hidden
      }
    }
  }, [gpuAcceleration]);

  // Focus terminal when pane becomes active
  useEffect(() => {
    if (isFocused && termRef.current) {
      if (
        containerRef.current &&
        containerRef.current.clientWidth > 0 &&
        containerRef.current.clientHeight > 0
      ) {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // Container might be hidden or transition in progress
        }
      }
      termRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full h-full p-2 bg-base-100 overflow-hidden select-text relative transition-all ${
        isDragOver ? "ring-2 ring-primary ring-inset" : ""
      }`}
      onClick={() => termRef.current?.focus()}
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

      {connectionStatus !== "connected" && (
        <div className="absolute bottom-2 right-3 z-10 pointer-events-none">
          <span
            className={`badge badge-xs text-[10px] font-mono shadow-md ${
              connectionStatus === "error"
                ? "badge-error"
                : connectionStatus === "disconnected"
                ? "badge-neutral"
                : "badge-warning animate-pulse"
            }`}
          >
            {connectionStatus}
          </span>
        </div>
      )}
    </div>
  );
}
