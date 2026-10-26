import { create } from "zustand";
import type { NavigationView } from "@/types/navigation";

interface LayoutState {
  readonly currentView: NavigationView;
  readonly isSidebarCollapsed: boolean;
  readonly isCommandPaletteOpen: boolean;
  readonly isAboutModalOpen: boolean;
  readonly isShortcutsModalOpen: boolean;
  readonly isQuickConnectOpen: boolean;
  readonly isVaultUnlockModalOpen: boolean;
  readonly isVaultLocked: boolean;
  readonly hasMasterPassword: boolean;
  readonly activeHostCount: number;
  readonly activeTunnelCount: number;

  readonly activeSection: "management" | "terminal";
  readonly sftpTargetHostId: string | null;
  readonly setSftpTargetHostId: (hostId: string | null) => void;
  readonly setActiveSection: (section: "management" | "terminal") => void;
  readonly setView: (view: NavigationView) => void;
  readonly toggleSidebar: () => void;
  readonly setCommandPaletteOpen: (open: boolean) => void;
  readonly setAboutModalOpen: (open: boolean) => void;
  readonly setShortcutsModalOpen: (open: boolean) => void;
  readonly setQuickConnectOpen: (open: boolean) => void;
  readonly setVaultUnlockModalOpen: (open: boolean) => void;
  readonly setVaultLocked: (locked: boolean) => void;
  readonly setHasMasterPassword: (hasPassword: boolean) => void;
  readonly updateCounters: (counters: { activeHosts?: number; activeTunnels?: number }) => void;
}

const SIDEBAR_STORAGE_KEY = "haze_ssh_sidebar_collapsed";

export const useLayoutStore = create<LayoutState>((set) => ({
  currentView: "hosts",
  isSidebarCollapsed: (() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  })(),
  isCommandPaletteOpen: false,
  isAboutModalOpen: false,
  isShortcutsModalOpen: false,
  isQuickConnectOpen: false,
  isVaultUnlockModalOpen: false,
  isVaultLocked: false,
  hasMasterPassword: false,
  activeHostCount: 0,
  activeTunnelCount: 0,
  activeSection: "management",
  sftpTargetHostId: null,

  setSftpTargetHostId: (hostId) => set({ sftpTargetHostId: hostId }),
  setActiveSection: (section) => set({ activeSection: section }),
  setView: (view: NavigationView) => set({ currentView: view, activeSection: "management" }),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.isSidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch (err) {
        console.warn("Failed to persist sidebar state to localStorage:", err);
      }
      return { isSidebarCollapsed: next };
    }),

  setCommandPaletteOpen: (open: boolean) => set({ isCommandPaletteOpen: open }),
  setAboutModalOpen: (open: boolean) => set({ isAboutModalOpen: open }),
  setShortcutsModalOpen: (open: boolean) => set({ isShortcutsModalOpen: open }),
  setQuickConnectOpen: (open: boolean) => set({ isQuickConnectOpen: open }),
  setVaultUnlockModalOpen: (open: boolean) => set({ isVaultUnlockModalOpen: open }),
  setVaultLocked: (locked: boolean) => set({ isVaultLocked: locked }),
  setHasMasterPassword: (hasPassword: boolean) => set({ hasMasterPassword: hasPassword }),

  updateCounters: ({ activeHosts, activeTunnels }) =>
    set((state) => ({
      activeHostCount: activeHosts !== undefined ? activeHosts : state.activeHostCount,
      activeTunnelCount: activeTunnels !== undefined ? activeTunnels : state.activeTunnelCount,
    })),
}));
