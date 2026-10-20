import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

import { api } from "@/services/api";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
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
      api.sshWrite(sessionId, bytes).catch((err) => {
        console.error("Failed to send terminal input:", err);
      });
    });

    // 5. Connect to SSH backend
    let isDisposed = false;

    const connectToSsh = async () => {
      try {
        term.writeln("\x1b[90m[Haze SSH] Initializing SSH session...\x1b[0m");

        const cols = term.cols || 80;
        const rows = term.rows || 24;

        const sessionId = await api.sshConnect({
          hostId: pane.hostId,
          hostname: pane.hostname || "127.0.0.1",
          port: pane.port || 22,
          username: pane.username,
          cols,
          rows,
          onEvent: (event: SshEvent) => {
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
                  term.writeln(`\r\n\x1b[33m[Haze SSH] ${event.payload.message}\x1b[0m`);
                }
                break;
              }
              case "Error": {
                setConnectionStatus("error");
                term.writeln(`\r\n\x1b[31m[Haze SSH Error] ${event.payload}\x1b[0m\r\n`);
                break;
              }
              case "Exit": {
                setConnectionStatus("disconnected");
                term.writeln(`\r\n\x1b[90m[Process finished with exit code ${event.payload.code}]\x1b[0m\r\n`);
                break;
              }
            }
          },
        });

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
            await api.sshWrite(sessionId, bytes);
          },
        });
      } catch (err: unknown) {
        if (isDisposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setConnectionStatus("error");
        term.writeln(`\r\n\x1b[31m[Haze SSH Connection Failed] ${message}\x1b[0m\r\n`);
      }
    };

    connectToSsh();

    // 6. Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed || !containerRef.current) return;
      try {
        fitAddon.fit();
        const sessionId = sessionIdRef.current;
        if (sessionId && term.cols && term.rows) {
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
        api.sshDisconnect(sessionId).catch(() => {});
      }

      useTerminalRegistryStore.getState().unregisterSession(pane.id);

      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      sessionIdRef.current = null;
    };
  }, [pane.id, pane.hostId, pane.hostname, pane.port, pane.username]);

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
