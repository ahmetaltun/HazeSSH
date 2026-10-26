import { create } from "zustand";
import { api } from "@/services/api";
import { useLayoutStore } from "@/stores/useLayoutStore";

interface VaultState {
  readonly isLocked: boolean;
  readonly hasMasterPassword: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly unlockReason: string | null;

  readonly fetchStatus: () => Promise<void>;
  readonly setMasterPassword: (password: string | null) => Promise<void>;
  readonly unlock: (password: string) => Promise<boolean>;
  readonly lock: () => Promise<void>;
  readonly requestUnlock: (reason?: string) => Promise<boolean>;
  readonly resolveUnlockRequest: (success: boolean) => void;
}

let pendingUnlockResolver: ((unlocked: boolean) => void) | null = null;

export const useVaultStore = create<VaultState>((set, get) => ({
  isLocked: false,
  hasMasterPassword: false,
  isLoading: false,
  error: null,
  unlockReason: null,

  requestUnlock: async (reason?: string) => {
    const { hasMasterPassword, isLocked } = get();
    if (!hasMasterPassword || !isLocked) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      if (pendingUnlockResolver) {
        pendingUnlockResolver(false);
      }
      pendingUnlockResolver = resolve;

      set({ unlockReason: reason || null });
      useLayoutStore.getState().setVaultUnlockModalOpen(true);
    });
  },

  resolveUnlockRequest: (success: boolean) => {
    if (pendingUnlockResolver) {
      pendingUnlockResolver(success);
      pendingUnlockResolver = null;
    }
    set({ unlockReason: null });
    useLayoutStore.getState().setVaultUnlockModalOpen(false);
  },

  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await api.vaultGetStatus();
      set({
        isLocked: status.is_locked,
        hasMasterPassword: status.has_master_password,
        isLoading: false,
      });

      // Synchronize with layout store
      useLayoutStore.getState().setVaultLocked(status.is_locked);
      useLayoutStore.getState().setHasMasterPassword(status.has_master_password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
    }
  },

  setMasterPassword: async (password: string | null) => {
    set({ isLoading: true, error: null });
    try {
      await api.vaultSetMasterPassword(password);
      const status = await api.vaultGetStatus();
      set({
        isLocked: status.is_locked,
        hasMasterPassword: status.has_master_password,
        isLoading: false,
      });

      useLayoutStore.getState().setVaultLocked(status.is_locked);
      useLayoutStore.getState().setHasMasterPassword(status.has_master_password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  unlock: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      const success = await api.vaultUnlock(password);
      if (success) {
        set({ isLocked: false, isLoading: false });
        useLayoutStore.getState().setVaultLocked(false);
        get().resolveUnlockRequest(true);
      }
      return success;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  lock: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.vaultLock();
      set({ isLocked: true, isLoading: false });
      useLayoutStore.getState().setVaultLocked(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
    }
  },
}));
