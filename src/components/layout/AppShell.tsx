import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { StatusBar } from "@/components/layout/StatusBar";
import { MultiplexerArea } from "@/components/multiplexer/MultiplexerArea";
import { HostsView } from "@/components/views/HostsView";
import { TunnelsView } from "@/components/views/TunnelsView";
import { SFTPView } from "@/components/views/SFTPView";
import { SnippetsView } from "@/components/views/SnippetsView";
import { HistoryView } from "@/components/views/HistoryView";
import { SettingsView } from "@/components/views/SettingsView";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useVaultStore } from "@/stores/useVaultStore";
import { useHostStore } from "@/stores/useHostStore";
import { Terminal, Layers } from "lucide-react";

export function AppShell() {
  const { currentView, activeSection, setActiveSection, setCommandPaletteOpen } =
    useLayoutStore();
  const { initTheme } = useThemeStore();
  const { fetchStatus } = useVaultStore();
  const { fetchAll } = useHostStore();
  const { tabs, openTab, closePane, getActiveTab } =
    useMultiplexerStore();

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

  const renderActiveManagementView = () => {
    switch (currentView) {
      case "hosts":
        return <HostsView />;
      case "tunnels":
        return <TunnelsView />;
      case "sftp":
        return <SFTPView />;
      case "snippets":
        return <SnippetsView />;
      case "history":
        return <HistoryView />;
      case "settings":
        return <SettingsView />;
      default:
        return <HostsView />;
    }
  };

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
          {activeSection === "terminal" ? (
            <MultiplexerArea />
          ) : (
            renderActiveManagementView()
          )}
        </main>

        {/* Status Bar */}
        <StatusBar />
      </div>
    </div>
  );
}
