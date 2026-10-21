import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

import { api } from "@/services/api";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { resolveHostVariables } from "@/services/snippetInterpolation";
import { getTerminalTheme } from "@/services/terminalThemes";
import type { TerminalPane } from "@/types/terminal";
import type { SshEvent } from "@/types/ssh";

interface XTermTerminalProps {
  readonly pane: TerminalPane;
  readonly isFocused: boolean;
}

export function XTermTerminal({ pane, isFocused }: XTermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const hasRunStartupSnippetRef = useRef<boolean>(false);

  const [connectionStatus, setConnectionStatus] = useState<string>("initializing");
  const { currentTheme } = useThemeStore();

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Create Terminal instance
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      theme: getTerminalTheme(currentTheme),
      allowProposedApi: true,
      scrollback: 10000,
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

    // 4. Handle incoming user typing
    const dataDisposable = term.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const bytes = Array.from(new TextEncoder().encode(data));
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
                    const bytes = Array.from(new TextEncoder().encode(toSend));

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
              term.writeln(`\r\n\x1b[31m[Haze Error] ${event.payload}\x1b[0m\r\n`);
              break;
            }
            case "Exit": {
              setConnectionStatus("disconnected");
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
        });
      } catch (err: unknown) {
        if (isDisposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setConnectionStatus("error");
        term.writeln(`\r\n\x1b[31m[Haze Connection Failed] ${message}\x1b[0m\r\n`);
      }
    };

    connectToBackend();

    // 6. Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed || !containerRef.current) return;
      try {
        fitAddon.fit();
        const sessionId = sessionIdRef.current;
        if (
          sessionId &&
          term.cols &&
          term.rows &&
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

  // Focus terminal when pane becomes active
  useEffect(() => {
    if (isFocused && termRef.current) {
      termRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-2 bg-base-100 overflow-hidden select-text relative"
      onClick={() => termRef.current?.focus()}
    >
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
