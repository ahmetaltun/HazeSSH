import { useState, useEffect, lazy, Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { StatusBar } from "@/components/layout/StatusBar";
import { CommandPaletteModal } from "@/components/layout/CommandPaletteModal";
import { AboutModal } from "@/components/layout/AboutModal";
import { MultiplexerArea } from "@/components/multiplexer/MultiplexerArea";
import { HostsView } from "@/components/views/HostsView";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useVaultStore } from "@/stores/useVaultStore";
import { useHostStore } from "@/stores/useHostStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
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
  const { currentView, activeSection, setActiveSection, setCommandPaletteOpen } =
    useLayoutStore();
  const { initTheme } = useThemeStore();
  const { fetchStatus } = useVaultStore();
  const { fetchAll } = useHostStore();
  const { tabs, openTab, closePane, getActiveTab } =
    useMultiplexerStore();

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
  }, [initTheme, fetchStatus, fetchAll]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      if (isMetaOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (isMetaOrCtrl && e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useBroadcastStore.getState().toggleBroadcast();
      } else if (isMetaOrCtrl && e.key.toLowerCase() === "t") {
        e.preventDefault();
        openTab({ title: "Local Terminal", status: "idle" });
      } else if (isMetaOrCtrl && e.key.toLowerCase() === "w") {
        const activeTab = getActiveTab();
        if (activeTab) {
          e.preventDefault();
          closePane(activeTab.id, activeTab.activePaneId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen, openTab, closePane, getActiveTab]);

  const renderActiveManagementViews = () => (
    <>
      <div className={`w-full h-full flex flex-col ${currentView === "hosts" ? "" : "hidden"}`}>
        <HostsView />
      </div>

      {visitedViews.has("sftp") && (
        <div className={`w-full h-full flex flex-col ${currentView === "sftp" ? "" : "hidden"}`}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <SFTPView />
          </Suspense>
        </div>
      )}

      {visitedViews.has("tunnels") && (
        <div className={`w-full h-full flex flex-col ${currentView === "tunnels" ? "" : "hidden"}`}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <TunnelsView />
          </Suspense>
        </div>
      )}

      {visitedViews.has("snippets") && (
        <div className={`w-full h-full flex flex-col ${currentView === "snippets" ? "" : "hidden"}`}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <SnippetsView />
          </Suspense>
        </div>
      )}

      {visitedViews.has("history") && (
        <div className={`w-full h-full flex flex-col ${currentView === "history" ? "" : "hidden"}`}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <HistoryView />
          </Suspense>
        </div>
      )}

      {visitedViews.has("settings") && (
        <div className={`w-full h-full flex flex-col ${currentView === "settings" ? "" : "hidden"}`}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <SettingsView />
          </Suspense>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content antialiased">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Topbar */}
        <Topbar />

        {/* Section Pill Switcher (if user has open terminal sessions) */}
        {tabs.length > 0 && (
          <div className="h-9 bg-base-300/80 border-b border-base-300 flex items-center justify-between px-3 shrink-0">
            <div className="join bg-base-200/80 p-0.5 rounded-lg border border-base-300">
              <button
                type="button"
                onClick={() => setActiveSection("terminal")}
                className={`btn btn-xs join-item gap-1.5 transition-all ${
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
                className={`btn btn-xs join-item gap-1.5 transition-all ${
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
              Shortcut: <kbd className="kbd kbd-xs">⌘T</kbd> New Tab
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

        {/* Status Bar */}
        <StatusBar />
      </div>

      {/* Global Command Palette & About Modals */}
      <CommandPaletteModal />
      <AboutModal />
    </div>
  );
}
