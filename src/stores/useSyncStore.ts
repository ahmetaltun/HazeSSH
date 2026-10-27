import { create } from "zustand";
import type {
  SyncProviderType,
  GitSyncConfig,
  WebDavSyncConfig,
  LocalFolderSyncConfig,
  SyncStatus,
  SyncConflictInfo,
} from "@/types/sync";

const STORAGE_KEY = "haze_ssh_sync_settings";

export const DEFAULT_GIT_CONFIG: GitSyncConfig = {
  gitProvider: "github",
  repository: "",
  branch: "main",
  filePath: "haze-vault.haze",
  token: "",
};

export const DEFAULT_WEBDAV_CONFIG: WebDavSyncConfig = {
  serverUrl: "",
  username: "",
  password: "",
  remotePath: "haze-vault.haze",
};

export const DEFAULT_LOCAL_FOLDER_CONFIG: LocalFolderSyncConfig = {
  targetDirectory: "",
  fileName: "haze-vault.haze",
};

interface SyncStoreState {
  readonly activeProvider: SyncProviderType;
  readonly gitConfig: GitSyncConfig;
  readonly webdavConfig: WebDavSyncConfig;
  readonly localFolderConfig: LocalFolderSyncConfig;
  readonly syncPassphrase: string;
  readonly status: SyncStatus;
  readonly lastSyncedAt: number | null;
  readonly lastRemoteSha: string | null;
  readonly lastRemoteEtag: string | null;
  readonly lastError: string | null;
  readonly autoSyncEnabled: boolean;
  readonly autoSyncIntervalMinutes: number;
  readonly defaultStrategy: "merge" | "overwrite";
  readonly conflictInfo: SyncConflictInfo | null;
  readonly isConflictModalOpen: boolean;

  readonly setActiveProvider: (provider: SyncProviderType) => void;
  readonly updateGitConfig: (partial: Partial<GitSyncConfig>) => void;
  readonly updateWebDavConfig: (partial: Partial<WebDavSyncConfig>) => void;
  readonly updateLocalFolderConfig: (partial: Partial<LocalFolderSyncConfig>) => void;
  readonly setSyncPassphrase: (passphrase: string) => void;
  readonly setAutoSyncEnabled: (enabled: boolean) => void;
  readonly setAutoSyncIntervalMinutes: (minutes: number) => void;
  readonly setDefaultStrategy: (strategy: "merge" | "overwrite") => void;
  readonly setStatus: (status: SyncStatus) => void;
  readonly setLastError: (error: string | null) => void;
  readonly setConflictInfo: (info: SyncConflictInfo | null) => void;
  readonly setIsConflictModalOpen: (isOpen: boolean) => void;
  readonly recordSyncSuccess: (timestamp: number, sha?: string, etag?: string) => void;
}

function loadSavedSyncSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        activeProvider: "git" as SyncProviderType,
        gitConfig: DEFAULT_GIT_CONFIG,
        webdavConfig: DEFAULT_WEBDAV_CONFIG,
        localFolderConfig: DEFAULT_LOCAL_FOLDER_CONFIG,
        syncPassphrase: "",
        lastSyncedAt: null,
        lastRemoteSha: null,
        lastRemoteEtag: null,
        autoSyncEnabled: false,
        autoSyncIntervalMinutes: 30,
        defaultStrategy: "merge" as const,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      activeProvider: (parsed.activeProvider as SyncProviderType) || "git",
      gitConfig: { ...DEFAULT_GIT_CONFIG, ...(parsed.gitConfig || {}) },
      webdavConfig: { ...DEFAULT_WEBDAV_CONFIG, ...(parsed.webdavConfig || {}) },
      localFolderConfig: { ...DEFAULT_LOCAL_FOLDER_CONFIG, ...(parsed.localFolderConfig || {}) },
      syncPassphrase: parsed.syncPassphrase || "",
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      lastRemoteSha: parsed.lastRemoteSha ?? null,
      lastRemoteEtag: parsed.lastRemoteEtag ?? null,
      autoSyncEnabled: parsed.autoSyncEnabled ?? false,
      autoSyncIntervalMinutes: parsed.autoSyncIntervalMinutes ?? 30,
      defaultStrategy: parsed.defaultStrategy === "overwrite" ? ("overwrite" as const) : ("merge" as const),
    };
  } catch {
    return {
      activeProvider: "git" as SyncProviderType,
      gitConfig: DEFAULT_GIT_CONFIG,
      webdavConfig: DEFAULT_WEBDAV_CONFIG,
      localFolderConfig: DEFAULT_LOCAL_FOLDER_CONFIG,
      syncPassphrase: "",
      lastSyncedAt: null,
      lastRemoteSha: null,
      lastRemoteEtag: null,
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 30,
      defaultStrategy: "merge" as const,
    };
  }
}

export const useSyncStore = create<SyncStoreState>((set, get) => {
  const initial = loadSavedSyncSettings();

  const persist = (partial: Partial<typeof initial>) => {
    try {
      const current = {
        activeProvider: get().activeProvider,
        gitConfig: get().gitConfig,
        webdavConfig: get().webdavConfig,
        localFolderConfig: get().localFolderConfig,
        syncPassphrase: get().syncPassphrase,
        lastSyncedAt: get().lastSyncedAt,
        lastRemoteSha: get().lastRemoteSha,
        lastRemoteEtag: get().lastRemoteEtag,
        autoSyncEnabled: get().autoSyncEnabled,
        autoSyncIntervalMinutes: get().autoSyncIntervalMinutes,
        defaultStrategy: get().defaultStrategy,
        ...partial,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
      console.warn("Failed to persist Sync settings to localStorage:", err);
    }
  };

  return {
    activeProvider: initial.activeProvider,
    gitConfig: initial.gitConfig,
    webdavConfig: initial.webdavConfig,
    localFolderConfig: initial.localFolderConfig,
    syncPassphrase: initial.syncPassphrase,
    status: "idle",
    lastSyncedAt: initial.lastSyncedAt,
    lastRemoteSha: initial.lastRemoteSha,
    lastRemoteEtag: initial.lastRemoteEtag,
    lastError: null,
    autoSyncEnabled: initial.autoSyncEnabled,
    autoSyncIntervalMinutes: initial.autoSyncIntervalMinutes,
    defaultStrategy: initial.defaultStrategy,
    conflictInfo: null,
    isConflictModalOpen: false,

    setActiveProvider: (activeProvider) => {
      persist({ activeProvider });
      set({ activeProvider, status: "idle", lastError: null });
    },

    updateGitConfig: (partial) => {
      const next = { ...get().gitConfig, ...partial };
      persist({ gitConfig: next });
      set({ gitConfig: next });
    },

    updateWebDavConfig: (partial) => {
      const next = { ...get().webdavConfig, ...partial };
      persist({ webdavConfig: next });
      set({ webdavConfig: next });
    },

    updateLocalFolderConfig: (partial) => {
      const next = { ...get().localFolderConfig, ...partial };
      persist({ localFolderConfig: next });
      set({ localFolderConfig: next });
    },

    setSyncPassphrase: (syncPassphrase) => {
      persist({ syncPassphrase });
      set({ syncPassphrase });
    },

    setAutoSyncEnabled: (autoSyncEnabled) => {
      persist({ autoSyncEnabled });
      set({ autoSyncEnabled });
    },

    setAutoSyncIntervalMinutes: (autoSyncIntervalMinutes) => {
      persist({ autoSyncIntervalMinutes });
      set({ autoSyncIntervalMinutes });
    },

    setDefaultStrategy: (defaultStrategy) => {
      persist({ defaultStrategy });
      set({ defaultStrategy });
    },

    setStatus: (status) => set({ status }),

    setLastError: (lastError) => set({ lastError, status: lastError ? "error" : "idle" }),

    setConflictInfo: (conflictInfo) => set({ conflictInfo, isConflictModalOpen: Boolean(conflictInfo) }),

    setIsConflictModalOpen: (isConflictModalOpen) => set({ isConflictModalOpen }),

    recordSyncSuccess: (timestamp, sha, etag) => {
      const update = {
        lastSyncedAt: timestamp,
        lastRemoteSha: sha ?? get().lastRemoteSha,
        lastRemoteEtag: etag ?? get().lastRemoteEtag,
      };
      persist(update);
      set({
        ...update,
        status: "synced",
        lastError: null,
        conflictInfo: null,
        isConflictModalOpen: false,
      });
    },
  };
});
