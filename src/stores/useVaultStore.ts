import { create } from "zustand";
import { api } from "@/services/api";
import { useLayoutStore } from "@/stores/useLayoutStore";

interface VaultState {
  readonly isLocked: boolean;
  readonly hasMasterPassword: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;

  readonly fetchStatus: () => Promise<void>;
  readonly setMasterPassword: (password: string | null) => Promise<void>;
  readonly unlock: (password: string) => Promise<boolean>;
  readonly lock: () => Promise<void>;
}

export const useVaultStore = create<VaultState>((set) => ({
  isLocked: false,
  hasMasterPassword: false,
  isLoading: false,
  error: null,

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
