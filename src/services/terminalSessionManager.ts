import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { attachTerminalRenderer, type TerminalRendererHandle } from "@/components/terminal/terminalRenderer";
import { api } from "@/services/api";
import { resolveTerminalTheme } from "@/services/terminalThemes";
import { TerminalHighlighter } from "@/services/keywordHighlightService";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTerminalSettingsStore } from "@/stores/useTerminalSettingsStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useVaultStore } from "@/stores/useVaultStore";
import { resolveHostVariables } from "@/services/snippetInterpolation";
import type { TerminalPane, SplitNode } from "@/types/terminal";
import type { SshEvent } from "@/types/ssh";

const textEncoder = new TextEncoder();

export interface ActiveTerminalSession {
  readonly paneId: string;
  readonly term: Terminal;
  readonly fitAddon: FitAddon;
  readonly webLinksAddon: WebLinksAddon;
  readonly searchAddon: SearchAddon;
  readonly highlighter: TerminalHighlighter;
  rendererHandle: TerminalRendererHandle | null;
  readonly wrapperEl: HTMLDivElement;
  sessionId: string | null;
  isConnecting: boolean;
  isDisposed: boolean;
  hasRunStartupSnippet: boolean;
  pane: TerminalPane;
  lastResizedCols?: number;
  lastResizedRows?: number;
  readonly disposables: Array<() => void>;
}

class TerminalSessionManager {
  private sessions = new Map<string, ActiveTerminalSession>();

  public getSession(paneId: string): ActiveTerminalSession | undefined {
    return this.sessions.get(paneId);
  }

  public hasSession(paneId: string): boolean {
    return this.sessions.has(paneId);
  }

  public getOrCreateSession(pane: TerminalPane): ActiveTerminalSession {
    const existing = this.sessions.get(pane.id);
    if (existing && !existing.isDisposed) {
      existing.pane = pane;
      return existing;
    }

    const currentTheme = useThemeStore.getState().currentTheme;
    const initialSettings = useTerminalSettingsStore.getState();

    // 1. Create Terminal instance
    const term = new Terminal({
      cursorBlink: initialSettings.cursorBlink,
      cursorStyle: initialSettings.cursorStyle,
      fontSize: initialSettings.fontSize,
      fontFamily: initialSettings.fontFamily,
      lineHeight: initialSettings.lineHeight,
      theme: resolveTerminalTheme(initialSettings.terminalTheme, currentTheme),
      allowProposedApi: true,
      scrollback: initialSettings.scrollback,
    });

    // 2. Addons
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    // 3. Wrapper DOM Element
    const wrapperEl = document.createElement("div");
    wrapperEl.className = "w-full h-full min-h-0 relative select-text";
    wrapperEl.style.width = "100%";
    wrapperEl.style.height = "100%";

    term.open(wrapperEl);

    // 4. Renderer handle
    const rendererHandle = attachTerminalRenderer(term, initialSettings.gpuAcceleration);

    // 5. Keyword Regex Highlighter
    const highlighter = new TerminalHighlighter(
      term,
      initialSettings.highlightRules,
      initialSettings.keywordHighlightEnabled,
      initialSettings.highlightStyle,
      initialSettings.highlightBoxOpacity
    );

    const session: ActiveTerminalSession = {
      paneId: pane.id,
      term,
      fitAddon,
      webLinksAddon,
      searchAddon,
      highlighter,
      rendererHandle,
      wrapperEl,
      sessionId: null,
      isConnecting: false,
      isDisposed: false,
      hasRunStartupSnippet: false,
      pane,
      disposables: [],
    };

    // Listen to line feeds to highlight keywords in real time
    const lineFeedDisposable = term.onLineFeed(() => {
      highlighter.scanLine(term.buffer.active.baseY + term.buffer.active.cursorY);
    });

    const scrollDisposable = term.onScroll(() => {
      highlighter.rescanVisibleBuffer();
    });

    session.disposables.push(() => {
      lineFeedDisposable.dispose();
      scrollDisposable.dispose();
      highlighter.dispose();
    });

    // 6. Handle user input typing
    const dataDisposable = term.onData((data) => {
      if (session.isDisposed) return;
      const sessionId = session.sessionId;
      if (!sessionId) return;
      const bytes = Array.from(textEncoder.encode(data));

      if (pane.connectionType === "local") {
        api.ptyWrite(sessionId, bytes).catch((err) => {
          console.error(`[Terminal ${pane.id}] Failed to send PTY input:`, err);
        });
      } else if (pane.connectionType === "serial") {
        api.serialWrite(sessionId, bytes).catch((err) => {
          console.error(`[Terminal ${pane.id}] Failed to send serial input:`, err);
        });
      } else if (pane.connectionType === "telnet") {
        api.telnetWrite(sessionId, bytes).catch((err) => {
          console.error(`[Terminal ${pane.id}] Failed to send telnet input:`, err);
        });
      } else {
        api.sshWrite(sessionId, bytes).catch((err) => {
          console.error(`[Terminal ${pane.id}] Failed to send SSH input:`, err);
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

    session.disposables.push(() => dataDisposable.dispose());

    this.sessions.set(pane.id, session);

    // 6. Connect to backend if host or options configured
    const hasConnectionTarget = Boolean(
      pane.hostId || pane.hostname || pane.serialOptions || pane.telnetOptions || pane.connectionType === "local" || (!pane.hostId && !pane.hostname)
    );

    if (hasConnectionTarget) {
      void this.connectSession(session);
    }

    return session;
  }

  public async connectSession(session: ActiveTerminalSession): Promise<void> {
    if (session.isConnecting || session.sessionId || session.isDisposed) return;
    session.isConnecting = true;

    const { pane, term } = session;

    // Intercept vault unlock if connection requires decrypting host credentials
    if (pane.hostId) {
      const { hasMasterPassword, isLocked, requestUnlock } = useVaultStore.getState();
      if (hasMasterPassword && isLocked) {
        const hostName = pane.title || "host";
        const unlocked = await requestUnlock(`connect to ${hostName}`);
        if (!unlocked || session.isDisposed) {
          session.isConnecting = false;
          term.writeln(`\r\n\x1b[33m[Haze] Connection cancelled (Vault is locked).\x1b[0m\r\n`);
          useMultiplexerStore.getState().updatePaneStatus(pane.id, "disconnected");
          return;
        }
      }
    }

    const handleTerminalEvent = (event: SshEvent) => {
      if (session.isDisposed) return;

      switch (event.type) {
        case "Data": {
          const uint8 = new Uint8Array(event.payload);
          term.write(uint8);
          break;
        }
        case "StatusChange": {
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
            !session.hasRunStartupSnippet &&
            pane.hostId &&
            pane.connectionType !== "serial"
          ) {
            session.hasRunStartupSnippet = true;
            const host = useHostStore.getState().hosts.find((h) => h.id === pane.hostId);

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
                  if (!session.isDisposed && session.sessionId) {
                    api.sshWrite(session.sessionId, bytes).catch((err) => {
                      console.error(`[Terminal ${pane.id}] Failed to run startup snippet:`, err);
                    });
                  }
                }, 600);
              }
            }
          }
          break;
        }
        case "Error": {
          useMultiplexerStore.getState().updatePaneStatus(pane.id, "error", event.payload);
          term.writeln(`\r\n\x1b[31m[Haze Error] ${event.payload}\x1b[0m\r\n`);
          break;
        }
        case "Exit": {
          useMultiplexerStore.getState().updatePaneStatus(pane.id, "disconnected");
          term.writeln(`\r\n\x1b[90m[Session closed with exit code ${event.payload.code}]\x1b[0m\r\n`);
          break;
        }
      }
    };

    try {
      let sessionId: string;

      if (
        pane.connectionType === "local" ||
        (!pane.hostId && !pane.hostname && pane.connectionType !== "serial" && pane.connectionType !== "telnet")
      ) {
        try {
          session.fitAddon.fit();
        } catch {
          // May not be mounted in DOM yet
        }

        const cols = term.cols || 80;
        const rows = term.rows || 24;

        term.writeln("\x1b[90m[Haze Terminal] Spawning local shell session...\x1b[0m\r\n");

        sessionId = await api.ptySpawn({
          cols,
          rows,
          workingDir: pane.workingDir,
          onEvent: handleTerminalEvent,
        });
      } else if (pane.connectionType === "serial") {
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
        const targetHost = pane.hostname || "";
        const targetPort = pane.port || 22;

        if (!pane.hostId && !targetHost) {
          throw new Error("No destination host specified for SSH session.");
        }

        term.writeln(`\x1b[90m[Haze SSH] Initializing SSH session to ${pane.username ? `${pane.username}@` : ""}${targetHost || pane.hostId}:${targetPort}...\x1b[0m`);

        try {
          session.fitAddon.fit();
        } catch {
          // May not be mounted in DOM yet
        }

        const cols = term.cols || 80;
        const rows = term.rows || 24;

        sessionId = await api.sshConnect({
          hostId: pane.hostId,
          hostname: targetHost,
          port: targetPort,
          username: pane.username,
          cols,
          rows,
          onEvent: handleTerminalEvent,
        });
      }

      if (session.isDisposed) {
        // Disconnected before connect finished
        if (pane.connectionType === "local") {
          void api.ptyKill(sessionId);
        } else if (pane.connectionType === "serial") {
          void api.serialDisconnect(sessionId);
        } else if (pane.connectionType === "telnet") {
          void api.telnetDisconnect(sessionId);
        } else {
          void api.sshDisconnect(sessionId);
        }
        return;
      }

      session.sessionId = sessionId;
      session.isConnecting = false;

      // Force fit and notify the remote SSH server of actual PTY dimensions immediately
      requestAnimationFrame(() => {
        this.fitAndResize(pane.id);
      });
      setTimeout(() => {
        this.fitAndResize(pane.id);
      }, 100);

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
          const bytes = Array.from(textEncoder.encode(toSend));
          if (pane.connectionType === "local") {
            await api.ptyWrite(sessionId, bytes);
          } else if (pane.connectionType === "serial") {
            await api.serialWrite(sessionId, bytes);
          } else if (pane.connectionType === "telnet") {
            await api.telnetWrite(sessionId, bytes);
          } else {
            await api.sshWrite(sessionId, bytes);
          }
        },
        writeBytes: async (bytes: number[]) => {
          if (pane.connectionType === "local") {
            await api.ptyWrite(sessionId, bytes);
          } else if (pane.connectionType === "serial") {
            await api.serialWrite(sessionId, bytes);
          } else if (pane.connectionType === "telnet") {
            await api.telnetWrite(sessionId, bytes);
          } else {
            await api.sshWrite(sessionId, bytes);
          }
        },
      });
    } catch (err: unknown) {
      session.isConnecting = false;
      if (session.isDisposed) return;
      const message = err instanceof Error ? err.message : String(err);
      useMultiplexerStore.getState().updatePaneStatus(pane.id, "error", message);
      term.writeln(`\r\n\x1b[31m[Haze Connection Failed] ${message}\x1b[0m\r\n`);
    }
  }

  public fitAndResize(paneId: string): void {
    const session = this.sessions.get(paneId);
    if (!session || session.isDisposed) return;

    // Guard 1: Ensure wrapper is mounted in the live DOM
    const wrapper = session.wrapperEl;
    if (!wrapper.isConnected) return;

    // Guard 2: Ensure parent container is mounted and not hidden (e.g. display: none)
    const parent = wrapper.parentElement;
    if (!parent || parent.clientWidth < 80 || parent.clientHeight < 50) {
      return;
    }

    try {
      // Guard 3: Check proposed dimensions before calling fit() to prevent 1-row/2-col collapse
      const proposed = session.fitAddon.proposeDimensions();
      if (
        !proposed ||
        isNaN(proposed.cols) ||
        isNaN(proposed.rows) ||
        proposed.cols < 10 ||
        proposed.rows < 3
      ) {
        return;
      }

      session.fitAddon.fit();
      const cols = session.term.cols;
      const rows = session.term.rows;
      const sessionId = session.sessionId;

      if (
        sessionId &&
        cols >= 10 &&
        rows >= 3 &&
        session.pane.connectionType !== "serial" &&
        session.pane.connectionType !== "telnet"
      ) {
        if (session.lastResizedCols !== cols || session.lastResizedRows !== rows) {
          session.lastResizedCols = cols;
          session.lastResizedRows = rows;
          if (session.pane.connectionType === "local") {
            api.ptyResize(sessionId, cols, rows).catch((err) => {
              console.warn(`[Terminal ${paneId}] ptyResize failed:`, err);
              session.lastResizedCols = undefined;
              session.lastResizedRows = undefined;
            });
          } else {
            api.sshResize(sessionId, cols, rows).catch((err) => {
              console.warn(`[Terminal ${paneId}] sshResize failed:`, err);
              session.lastResizedCols = undefined;
              session.lastResizedRows = undefined;
            });
          }
        }
      }
    } catch {
      // Ignored if hidden or zero dimensions
    }
  }

  public attachToContainer(paneId: string, container: HTMLElement): void {
    const session = this.sessions.get(paneId);
    if (!session || session.isDisposed) return;

    if (session.wrapperEl.parentElement !== container) {
      container.appendChild(session.wrapperEl);
    }

    requestAnimationFrame(() => {
      this.fitAndResize(paneId);
    });
    setTimeout(() => {
      this.fitAndResize(paneId);
    }, 100);
  }

  public detachFromContainer(paneId: string): void {
    const session = this.sessions.get(paneId);
    if (!session) return;
    session.wrapperEl.remove();
  }

  public focusPane(paneId: string): void {
    const session = this.sessions.get(paneId);
    if (!session || session.isDisposed) return;

    const wrapper = session.wrapperEl;
    if (!wrapper.isConnected) return;

    const parent = wrapper.parentElement;
    if (!parent || parent.clientWidth < 80 || parent.clientHeight < 50) return;

    this.fitAndResize(paneId);
    session.term.focus();
  }

  public async destroySession(paneId: string): Promise<void> {
    const session = this.sessions.get(paneId);
    if (!session) return;

    session.isDisposed = true;
    this.sessions.delete(paneId);

    for (const dispose of session.disposables) {
      try {
        dispose();
      } catch {
        // Ignore dispose error
      }
    }

    const sessionId = session.sessionId;
    if (sessionId) {
      if (session.pane.connectionType === "local") {
        await api.ptyKill(sessionId).catch(() => {});
      } else if (session.pane.connectionType === "serial") {
        await api.serialDisconnect(sessionId).catch(() => {});
      } else if (session.pane.connectionType === "telnet") {
        await api.telnetDisconnect(sessionId).catch(() => {});
      } else {
        await api.sshDisconnect(sessionId).catch(() => {});
      }
    }

    useTerminalRegistryStore.getState().unregisterSession(paneId);

    session.highlighter.dispose();
    session.rendererHandle?.dispose();
    session.rendererHandle = null;
    session.term.dispose();
    session.wrapperEl.remove();
  }

  public syncTheme(terminalPreference?: string, appThemeId?: string): void {
    const pref = terminalPreference ?? useTerminalSettingsStore.getState().terminalTheme;
    const appTheme = appThemeId ?? useThemeStore.getState().currentTheme;
    const theme = resolveTerminalTheme(pref, appTheme);
    for (const session of this.sessions.values()) {
      if (!session.isDisposed) {
        session.term.options.theme = theme;
      }
    }
  }

  public syncSettings(): void {
    const s = useTerminalSettingsStore.getState();
    for (const session of this.sessions.values()) {
      if (!session.isDisposed) {
        session.term.options.fontSize = s.fontSize;
        session.term.options.fontFamily = s.fontFamily;
        session.term.options.lineHeight = s.lineHeight;
        session.term.options.cursorStyle = s.cursorStyle;
        session.term.options.cursorBlink = s.cursorBlink;
        session.term.options.scrollback = s.scrollback;
        session.highlighter.setStyleOptions(s.highlightStyle, s.highlightBoxOpacity);
        session.highlighter.setEnabled(s.keywordHighlightEnabled);
        session.highlighter.updateRules(s.highlightRules);
        try {
          session.fitAddon.fit();
        } catch {
          // Ignored if hidden
        }
      }
    }
  }

  public syncGpuAcceleration(): void {
    const s = useTerminalSettingsStore.getState();
    for (const session of this.sessions.values()) {
      if (!session.isDisposed) {
        session.rendererHandle?.dispose();
        session.rendererHandle = attachTerminalRenderer(session.term, s.gpuAcceleration);
        try {
          session.fitAddon.fit();
        } catch {
          // Ignored if hidden
        }
      }
    }
  }
}

export const terminalSessionManager = new TerminalSessionManager();

// Automatically keep all active terminal sessions synchronized with app and terminal theme changes
useThemeStore.subscribe((state) => {
  terminalSessionManager.syncTheme(undefined, state.currentTheme);
});

useTerminalSettingsStore.subscribe((state) => {
  terminalSessionManager.syncTheme(state.terminalTheme);
  terminalSessionManager.syncSettings();
});

