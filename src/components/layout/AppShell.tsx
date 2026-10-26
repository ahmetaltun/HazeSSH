import { useState, useEffect, lazy, Suspense } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { StatusBar } from "@/components/layout/StatusBar";
import { CommandPaletteModal } from "@/components/layout/CommandPaletteModal";
import { AboutModal } from "@/components/layout/AboutModal";
import { VaultModal } from "@/components/vault/VaultModal";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { MultiplexerArea } from "@/components/multiplexer/MultiplexerArea";
import { HostsView } from "@/components/views/HostsView";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useVaultStore } from "@/stores/useVaultStore";
import { useHostStore } from "@/stores/useHostStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { initDesktopInterceptors } from "@/utils/desktopInterceptors";
import { formatShortcut } from "@/utils/platform";
import type { NavigationView } from "@/types/navigation";
import { Terminal, Layers, Loader2 } from "lucide-react";

// Code-split secondary management views to optimize bundle size and cold-start latency
const TunnelsView = lazy(() =>
  import("@/components/views/TunnelsView").then((m) => ({ default: m.TunnelsView }))
);
const SFTPView = lazy(() =>
  import("@/components/views/SFTPView").then((m) => ({ default: m.SFTPView }))
);
const SnippetsView = lazy(() =>
  import("@/components/views/SnippetsView").then((m) => ({ default: m.SnippetsView }))
);
const HistoryView = lazy(() =>
  import("@/components/views/HistoryView").then((m) => ({ default: m.HistoryView }))
);
const SettingsView = lazy(() =>
  import("@/components/views/SettingsView").then((m) => ({ default: m.SettingsView }))
);

function ViewLoadingFallback() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-base-content/50 select-none">
      <Loader2 className="w-8 h-8 animate-spin text-primary opacity-80" />
      <span className="text-xs font-mono mt-3 tracking-wider uppercase text-base-content/40">
        Loading module...
      </span>
    </div>
  );
}

export function AppShell() {
  const {
    currentView,
    setView,
    toggleSidebar,
    activeSection,
    setActiveSection,
    setCommandPaletteOpen,
    setShortcutsModalOpen,
    isVaultUnlockModalOpen,
  } = useLayoutStore();
  const { initTheme } = useThemeStore();
  const { fetchStatus, resolveUnlockRequest } = useVaultStore();
  const { fetchAll } = useHostStore();
  const {
    tabs,
    openTab,
    closeTab,
    closePane,
    splitActivePane,
    getActiveTab,
  } = useMultiplexerStore();

  // Track visited management views to retain their DOM state across view navigation while preserving lazy-loading
  const [visitedViews, setVisitedViews] = useState<Set<string>>(() => new Set([currentView]));

  useEffect(() => {
    setVisitedViews((prev) => {
      if (prev.has(currentView)) return prev;
      const next = new Set(prev);
      next.add(currentView);
      return next;
    });
  }, [currentView]);

  useEffect(() => {
    initTheme();
    fetchStatus();
    fetchAll();

    // Reveal native window smoothly only after the first frame has rasterized
    const revealWindow = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          try {
            const appWindow = getCurrentWindow();
            await appWindow.show();
            await appWindow.setFocus();
          } catch {
            // Graceful fallback for non-Tauri / web browser environment
          }
        });
      });
    };

    revealWindow();
  }, [initTheme, fetchStatus, fetchAll]);

  // Global Desktop Environment Interceptors & Hotkeys
  useEffect(() => {
    // 1. Suppress browser-level right click, file-drop navigation, and accidental reloads
    const cleanupInterceptors = initDesktopInterceptors();

    // 2. Desktop Keyboard Navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      // ⌘K or ⌘⇧P : Command Palette
      if (
        (isMetaOrCtrl && e.key.toLowerCase() === "k") ||
        (isMetaOrCtrl && e.shiftKey && e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // ⌘, : Open Settings & Vault (Universal Desktop Standard)
      if (isMetaOrCtrl && e.key === ",") {
        e.preventDefault();
        setView("settings");
        return;
      }

      // ⌘B : Toggle Sidebar Collapse
      if (isMetaOrCtrl && e.key.toLowerCase() === "b" && !e.altKey) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // ⌘/ or ⌘? : Open Keyboard Shortcuts Modal
      if (isMetaOrCtrl && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        setShortcutsModalOpen(true);
        return;
      }

      // ⌘⌥B : Toggle Broadcast Keystrokes
      if (isMetaOrCtrl && e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useBroadcastStore.getState().toggleBroadcast();
        return;
      }

      // ⌘T : Open New Local Terminal Tab
      if (isMetaOrCtrl && e.key.toLowerCase() === "t") {
        e.preventDefault();
        openTab({ title: "Local Terminal", status: "idle" });
        return;
      }

      // ⌘⇧W : Close Entire Active Tab
      if (isMetaOrCtrl && e.shiftKey && e.key.toLowerCase() === "w") {
        const activeTab = getActiveTab();
        if (activeTab) {
          e.preventDefault();
          closeTab(activeTab.id);
        }
        return;
      }

      // ⌘W : Close Active Pane (or Tab if single pane)
      if (isMetaOrCtrl && e.key.toLowerCase() === "w") {
        const activeTab = getActiveTab();
        if (activeTab) {
          e.preventDefault();
          closePane(activeTab.id, activeTab.activePaneId);
        }
        return;
      }

      // ⌘\ : Split Pane Right (Horizontal)
      if (isMetaOrCtrl && !e.shiftKey && e.key === "\\") {
        e.preventDefault();
        splitActivePane("horizontal");
        setActiveSection("terminal");
        return;
      }

      // ⌘⇧\ or ⌘⇧D : Split Pane Down (Vertical)
      if (
        (isMetaOrCtrl && e.shiftKey && e.key === "\\") ||
        (isMetaOrCtrl && e.shiftKey && e.key.toLowerCase() === "d")
      ) {
        e.preventDefault();
        splitActivePane("vertical");
        setActiveSection("terminal");
        return;
      }

      // ⌘1 to ⌘6: Switch View (in management) OR switch Tab (in terminal)
      if (isMetaOrCtrl && e.key >= "1" && e.key <= "9") {
        const num = parseInt(e.key, 10);
        const currentActiveSection = useLayoutStore.getState().activeSection;
        const currentTabs = useMultiplexerStore.getState().tabs;

        if (currentActiveSection === "terminal" && currentTabs.length > 0) {
          const targetTab = currentTabs[num - 1];
          if (targetTab) {
            e.preventDefault();
            useMultiplexerStore.getState().setActiveTab(targetTab.id);
            return;
          }
        } else if (num >= 1 && num <= 6) {
          const views: readonly NavigationView[] = [
            "hosts",
            "tunnels",
            "sftp",
            "snippets",
            "history",
            "settings",
          ];
          e.preventDefault();
          setView(views[num - 1]);
          return;
        }
      }

      // ⌃Tab / ⌃⇧Tab : Cycle active tabs
      if (e.ctrlKey && e.key === "Tab") {
        const { tabs: currentTabs, activeTabId, setActiveTab } =
          useMultiplexerStore.getState();
        if (currentTabs.length > 1 && activeTabId) {
          e.preventDefault();
          const currentIdx = currentTabs.findIndex((t) => t.id === activeTabId);
          if (currentIdx !== -1) {
            const step = e.shiftKey ? -1 : 1;
            const nextIdx = (currentIdx + step + currentTabs.length) % currentTabs.length;
            setActiveTab(currentTabs[nextIdx].id);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cleanupInterceptors?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    setCommandPaletteOpen,
    setView,
    toggleSidebar,
    setShortcutsModalOpen,
    openTab,
    closeTab,
    closePane,
    splitActivePane,
    setActiveSection,
    getActiveTab,
  ]);

  const renderActiveManagementViews = () => (
    <>
      <div className={`w-full h-full flex flex-col ${currentView === "hosts" ? "" : "hidden"}`}>
        <ErrorBoundary fallbackTitle="Hosts view encountered an error">
          <HostsView />
        </ErrorBoundary>
      </div>

      {visitedViews.has("sftp") && (
        <div className={`w-full h-full flex flex-col ${currentView === "sftp" ? "" : "hidden"}`}>
          <ErrorBoundary fallbackTitle="SFTP explorer encountered an error">
            <Suspense fallback={<ViewLoadingFallback />}>
              <SFTPView />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {visitedViews.has("tunnels") && (
        <div className={`w-full h-full flex flex-col ${currentView === "tunnels" ? "" : "hidden"}`}>
          <ErrorBoundary fallbackTitle="Port forwarding view encountered an error">
            <Suspense fallback={<ViewLoadingFallback />}>
              <TunnelsView />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {visitedViews.has("snippets") && (
        <div className={`w-full h-full flex flex-col ${currentView === "snippets" ? "" : "hidden"}`}>
          <ErrorBoundary fallbackTitle="Snippets view encountered an error">
            <Suspense fallback={<ViewLoadingFallback />}>
              <SnippetsView />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {visitedViews.has("history") && (
        <div className={`w-full h-full flex flex-col ${currentView === "history" ? "" : "hidden"}`}>
          <ErrorBoundary fallbackTitle="Session history encountered an error">
            <Suspense fallback={<ViewLoadingFallback />}>
              <HistoryView />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {visitedViews.has("settings") && (
        <div className={`w-full h-full flex flex-col ${currentView === "settings" ? "" : "hidden"}`}>
          <ErrorBoundary fallbackTitle="Settings & Preferences encountered an error">
            <Suspense fallback={<ViewLoadingFallback />}>
              <SettingsView />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-base-100 text-base-content antialiased select-none">
      {/* Topbar: Unified Desktop Window Header & Draggable Titlebar */}
      <Topbar />

      {/* Main Row: Sidebar + Workspace */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Workspace Column */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Section Pill Switcher (if user has open terminal sessions) */}
          {tabs.length > 0 && (
            <div className="h-8 bg-base-300/80 border-b border-base-300 flex items-center justify-between px-3 shrink-0">
              <div className="join bg-base-200/80 p-0.5 rounded-lg border border-base-300">
                <button
                  type="button"
                  onClick={() => setActiveSection("terminal")}
                  className={`btn btn-xs h-6 join-item gap-1.5 transition-all ${
                    activeSection === "terminal"
                      ? "btn-primary font-semibold shadow-xs"
                      : "btn-ghost text-base-content/60 hover:text-base-content"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Terminals ({tabs.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection("management")}
                  className={`btn btn-xs h-6 join-item gap-1.5 transition-all ${
                    activeSection === "management"
                      ? "btn-primary font-semibold shadow-xs"
                      : "btn-ghost text-base-content/60 hover:text-base-content"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="capitalize">{currentView}</span>
                </button>
              </div>

              <div className="text-[11px] text-base-content/40 font-mono">
                New Tab: <kbd className="kbd kbd-xs">{formatShortcut("⌘T", "Ctrl+T")}</kbd>
              </div>
            </div>
          )}

          {/* Workspace Body */}
          <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
            <div
              className={`flex-1 min-h-0 flex flex-col overflow-hidden relative ${
                activeSection === "terminal" ? "" : "hidden"
              }`}
            >
              <MultiplexerArea />
            </div>
            <div
              className={`flex-1 min-h-0 flex flex-col overflow-hidden relative ${
                activeSection === "management" ? "" : "hidden"
              }`}
            >
              {renderActiveManagementViews()}
            </div>
          </main>
        </div>
      </div>

      {/* Desktop Status Bar */}
      <StatusBar />

      {/* Global Command Palette & About Modals */}
      <CommandPaletteModal />
      <AboutModal />

      {/* Global Vault Unlock Modal */}
      <VaultModal
        isOpen={isVaultUnlockModalOpen}
        mode="unlock"
        onClose={() => resolveUnlockRequest(false)}
        onSuccess={() => resolveUnlockRequest(true)}
      />
    </div>
  );
}
