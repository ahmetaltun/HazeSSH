import type { ReactNode } from "react";
import {
  Server,
  Network,
  FolderGit2,
  Code2,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
} from "lucide-react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { formatShortcut } from "@/utils/platform";
import type { NavigationView } from "@/types/navigation";

interface NavItemConfig {
  readonly id: NavigationView;
  readonly label: string;
  readonly icon: ReactNode;
  readonly shortcut: string;
  readonly badge?: number;
}

interface NavButtonProps {
  readonly item: NavItemConfig;
  readonly isActive: boolean;
  readonly isCollapsed: boolean;
  readonly onClick: () => void;
}

function NavButton({
  item,
  isActive,
  isCollapsed,
  onClick,
}: NavButtonProps) {
  const shortcutHint = formatShortcut(item.shortcut);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-ghost w-full justify-start gap-3 h-10 px-2.5 transition-all duration-150 rounded-lg ${
        isActive
          ? "bg-primary/15 text-primary font-semibold border-l-3 border-primary shadow-2xs"
          : "text-base-content/75 hover:bg-base-200 hover:text-base-content"
      } ${isCollapsed ? "justify-center px-0" : ""}`}
      title={isCollapsed ? `${item.label} (${shortcutHint})` : undefined}
      aria-label={`${item.label} (${shortcutHint})`}
    >
      <span className="text-lg shrink-0">{item.icon}</span>
      {!isCollapsed && <span className="truncate flex-1 text-left text-xs">{item.label}</span>}
      {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="badge badge-primary badge-xs font-mono">{item.badge}</span>
      )}
    </button>
  );
}

export function Sidebar() {
  const {
    currentView,
    setView,
    isSidebarCollapsed,
    toggleSidebar,
    activeHostCount,
    activeTunnelCount,
    isVaultLocked,
    hasMasterPassword,
    setVaultLocked,
    setAboutModalOpen,
  } = useLayoutStore();

  const navItems: readonly NavItemConfig[] = [
    {
      id: "hosts",
      label: "Hosts & Groups",
      icon: <Server className="w-4 h-4" />,
      shortcut: "⌘1",
      badge: activeHostCount,
    },
    {
      id: "tunnels",
      label: "Port Forwarding",
      icon: <Network className="w-4 h-4" />,
      shortcut: "⌘2",
      badge: activeTunnelCount,
    },
    {
      id: "sftp",
      label: "SFTP File Manager",
      icon: <FolderGit2 className="w-4 h-4" />,
      shortcut: "⌘3",
    },
    {
      id: "snippets",
      label: "Snippets & Scripts",
      icon: <Code2 className="w-4 h-4" />,
      shortcut: "⌘4",
    },
    {
      id: "history",
      label: "Session Logs",
      icon: <History className="w-4 h-4" />,
      shortcut: "⌘5",
    },
    {
      id: "settings",
      label: "Settings & Vault",
      icon: <Settings className="w-4 h-4" />,
      shortcut: "⌘6",
    },
  ];

  return (
    <aside
      className={`flex flex-col bg-base-300/90 border-r border-base-200 select-none transition-all duration-200 z-20 shrink-0 ${
        isSidebarCollapsed ? "w-14" : "w-56"
      }`}
    >
      {/* Brand Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-base-200">
        <div
          onClick={() => setAboutModalOpen(true)}
          className="flex items-center overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
          title="About Haze SSH"
        >
          {isSidebarCollapsed ? (
            <BrandLogo variant="mark" size={24} />
          ) : (
            <BrandLogo variant="horizontal" size={24} />
          )}
        </div>

        <button
          type="button"
          onClick={toggleSidebar}
          className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
          title={
            isSidebarCollapsed
              ? `Expand sidebar (${formatShortcut("⌘B", "Ctrl+B")})`
              : `Collapse sidebar (${formatShortcut("⌘B", "Ctrl+B")})`
          }
          aria-label="Toggle sidebar collapse"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-2 px-1.5 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={currentView === item.id}
            isCollapsed={isSidebarCollapsed}
            onClick={() => setView(item.id)}
          />
        ))}
      </nav>

      {/* Vault Status Footer */}
      <div className="p-2 border-t border-base-200 bg-base-300/60">
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-base-200/50 ${
            isSidebarCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                isVaultLocked ? "bg-warning animate-pulse" : "bg-success"
              }`}
            />
            {!isSidebarCollapsed && (
              <span className="text-[11px] text-base-content/70 truncate">
                {hasMasterPassword
                  ? isVaultLocked
                    ? "Vault Locked"
                    : "Vault Unlocked"
                  : "Device Vault"}
              </span>
            )}
          </div>

          {!isSidebarCollapsed && hasMasterPassword && (
            <button
              type="button"
              onClick={() => setVaultLocked(!isVaultLocked)}
              className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
              title={isVaultLocked ? "Unlock Vault" : "Lock Vault"}
              aria-label={isVaultLocked ? "Unlock Vault" : "Lock Vault"}
            >
              {isVaultLocked ? (
                <Lock className="w-3 h-3 text-warning" />
              ) : (
                <Unlock className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
