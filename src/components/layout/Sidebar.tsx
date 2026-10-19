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
  Terminal,
} from "lucide-react";
import { useLayoutStore } from "@/stores/useLayoutStore";
import type { NavigationView } from "@/types/navigation";

interface NavButtonProps {
  readonly id: NavigationView;
  readonly label: string;
  readonly icon: ReactNode;
  readonly isActive: boolean;
  readonly isCollapsed: boolean;
  readonly badge?: number;
  readonly onClick: () => void;
}

function NavButton({
  label,
  icon,
  isActive,
  isCollapsed,
  badge,
  onClick,
}: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-ghost w-full justify-start gap-3 h-11 px-3 transition-all duration-200 ${
        isActive
          ? "bg-primary/15 text-primary font-semibold border-l-4 border-primary rounded-l-none"
          : "text-base-content/75 hover:bg-base-200 hover:text-base-content"
      } ${isCollapsed ? "justify-center px-0" : ""}`}
      title={isCollapsed ? label : undefined}
    >
      <span className="text-xl shrink-0">{icon}</span>
      {!isCollapsed && <span className="truncate flex-1 text-left">{label}</span>}
      {!isCollapsed && badge !== undefined && badge > 0 && (
        <span className="badge badge-primary badge-sm font-mono">{badge}</span>
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
  } = useLayoutStore();

  const navItems = [
    {
      id: "hosts" as const,
      label: "Hosts & Groups",
      icon: <Server className="w-5 h-5" />,
      badge: activeHostCount,
    },
    {
      id: "tunnels" as const,
      label: "Port Forwarding",
      icon: <Network className="w-5 h-5" />,
      badge: activeTunnelCount,
    },
    {
      id: "sftp" as const,
      label: "SFTP File Manager",
      icon: <FolderGit2 className="w-5 h-5" />,
    },
    {
      id: "snippets" as const,
      label: "Snippets & Scripts",
      icon: <Code2 className="w-5 h-5" />,
    },
    {
      id: "history" as const,
      label: "Session Logs",
      icon: <History className="w-5 h-5" />,
    },
    {
      id: "settings" as const,
      label: "Settings & Vault",
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <aside
      className={`flex flex-col bg-base-300 border-r border-base-200 select-none transition-all duration-300 z-20 ${
        isSidebarCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-base-200">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-primary-content shadow-md shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-base leading-none">Haze SSH</span>
              <span className="text-[10px] text-base-content/50 uppercase tracking-widest font-semibold mt-0.5">
                Privacy-First
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleSidebar}
          className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            isActive={currentView === item.id}
            isCollapsed={isSidebarCollapsed}
            badge={item.badge}
            onClick={() => setView(item.id)}
          />
        ))}
      </nav>

      {/* Vault Status Footer */}
      <div className="p-2 border-t border-base-200 bg-base-300/60">
        <div
          className={`flex items-center gap-2 px-2 py-2 rounded-lg bg-base-200/50 ${
            isSidebarCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isVaultLocked ? "bg-warning animate-pulse" : "bg-success"
              }`}
            />
            {!isSidebarCollapsed && (
              <span className="text-xs text-base-content/70 truncate">
                {hasMasterPassword
                  ? isVaultLocked
                    ? "Vault Locked"
                    : "Vault Unlocked"
                  : "Local Device Vault"}
              </span>
            )}
          </div>

          {!isSidebarCollapsed && hasMasterPassword && (
            <button
              type="button"
              onClick={() => setVaultLocked(!isVaultLocked)}
              className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
              title={isVaultLocked ? "Unlock Vault" : "Lock Vault"}
            >
              {isVaultLocked ? <Lock className="w-3.5 h-3.5 text-warning" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
