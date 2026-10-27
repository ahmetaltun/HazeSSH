import { api } from "@/services/api";
import { useSyncStore } from "@/stores/useSyncStore";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useTunnelStore } from "@/stores/useTunnelStore";
import type { BackupSummary } from "@/types/backup";

export const decentralizedSyncService = {
  /**
   * Encrypts the local vault with Argon2id + ChaCha20-Poly1305 and uploads to remote
   */
  pushVault: async (customPassphrase?: string): Promise<{ success: boolean; sha?: string; message: string }> => {
    const {
      activeProvider,
      gitConfig,
      webdavConfig,
      localFolderConfig,
      syncPassphrase,
      lastRemoteSha,
      setStatus,
      setLastError,
      recordSyncSuccess,
    } = useSyncStore.getState();

    const passphrase = (customPassphrase || syncPassphrase).trim();
    if (!passphrase) {
      const err = "Sync passphrase is required to encrypt your vault before uploading.";
      setLastError(err);
      throw new Error(err);
    }

    setStatus("syncing");

    try {
      // 1. Export local DB to encrypted BackupEnvelope JSON
      const backupJson = await api.backupExport(passphrase);

      let resultingSha: string | undefined;
      let resultingEtag: string | undefined;

      // 2. Dispatch to target provider
      if (activeProvider === "git") {
        if (!gitConfig.repository.trim() || !gitConfig.token.trim()) {
          throw new Error("Git repository and Personal Access Token must be configured in Sync Settings.");
        }

        const res = await api.syncGitFilePut({
          provider: gitConfig.gitProvider,
          repository: gitConfig.repository.trim(),
          branch: gitConfig.branch.trim() || "main",
          file_path: gitConfig.filePath.trim() || "haze-vault.haze",
          token: gitConfig.token.trim(),
          content: backupJson,
          sha: lastRemoteSha ?? undefined,
          base_url: gitConfig.customBaseUrl?.trim() || undefined,
        });

        resultingSha = res.sha;
      } else if (activeProvider === "webdav") {
        if (!webdavConfig.serverUrl.trim()) {
          throw new Error("WebDAV server URL must be configured in Sync Settings.");
        }

        const baseUrl = webdavConfig.serverUrl.trim().replace(/\/+$/, "");
        const fileName = (webdavConfig.remotePath.trim() || "haze-vault.haze").replace(/^\/+/, "");
        const fullUrl = `${baseUrl}/${fileName}`;

        const res = await api.syncWebDavRequest({
          url: fullUrl,
          method: "PUT",
          username: webdavConfig.username?.trim(),
          password: webdavConfig.password?.trim(),
          body: backupJson,
          timeout_seconds: 45,
        });

        if (res.status >= 400) {
          throw new Error(`WebDAV server returned HTTP ${res.status}: ${res.body}`);
        }

        resultingEtag = res.etag;
      } else if (activeProvider === "local_folder") {
        if (!localFolderConfig.targetDirectory.trim()) {
          throw new Error("Local sync folder path must be configured in Sync Settings.");
        }

        await api.syncLocalFolder({
          folder_path: localFolderConfig.targetDirectory.trim(),
          file_name: localFolderConfig.fileName?.trim() || "haze-vault.haze",
          content: backupJson,
        });
      }

      const now = Date.now();
      recordSyncSuccess(now, resultingSha, resultingEtag);

      return {
        success: true,
        sha: resultingSha,
        message: "Encrypted vault pushed successfully.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      throw err;
    }
  },

  /**
   * Downloads remote encrypted vault, verifies passphrase, and merges/overwrites local database
   */
  pullVault: async (
    customPassphrase?: string,
    strategyOverride?: "merge" | "overwrite"
  ): Promise<BackupSummary> => {
    const {
      activeProvider,
      gitConfig,
      webdavConfig,
      localFolderConfig,
      syncPassphrase,
      defaultStrategy,
      setStatus,
      setLastError,
      recordSyncSuccess,
    } = useSyncStore.getState();

    const passphrase = (customPassphrase || syncPassphrase).trim();
    if (!passphrase) {
      const err = "Sync passphrase is required to decrypt the remote vault.";
      setLastError(err);
      throw new Error(err);
    }

    setStatus("syncing");

    try {
      let remotePayload = "";
      let fetchedSha: string | undefined;
      let fetchedEtag: string | undefined;

      // 1. Fetch remote ciphertext
      if (activeProvider === "git") {
        if (!gitConfig.repository.trim() || !gitConfig.token.trim()) {
          throw new Error("Git repository and Personal Access Token must be configured in Sync Settings.");
        }

        const res = await api.syncGitFileGet({
          provider: gitConfig.gitProvider,
          repository: gitConfig.repository.trim(),
          branch: gitConfig.branch.trim() || "main",
          file_path: gitConfig.filePath.trim() || "haze-vault.haze",
          token: gitConfig.token.trim(),
          base_url: gitConfig.customBaseUrl?.trim() || undefined,
        });

        remotePayload = res.content;
        fetchedSha = res.sha;
      } else if (activeProvider === "webdav") {
        if (!webdavConfig.serverUrl.trim()) {
          throw new Error("WebDAV server URL must be configured in Sync Settings.");
        }

        const baseUrl = webdavConfig.serverUrl.trim().replace(/\/+$/, "");
        const fileName = (webdavConfig.remotePath.trim() || "haze-vault.haze").replace(/^\/+/, "");
        const fullUrl = `${baseUrl}/${fileName}`;

        const res = await api.syncWebDavRequest({
          url: fullUrl,
          method: "GET",
          username: webdavConfig.username?.trim(),
          password: webdavConfig.password?.trim(),
          timeout_seconds: 45,
        });

        if (res.status >= 400) {
          throw new Error(`WebDAV server returned HTTP ${res.status}: ${res.body}`);
        }

        remotePayload = res.body;
        fetchedEtag = res.etag;
      } else if (activeProvider === "local_folder") {
        if (!localFolderConfig.targetDirectory.trim()) {
          throw new Error("Local sync folder path must be configured in Sync Settings.");
        }

        const res = await api.syncLocalFolder({
          folder_path: localFolderConfig.targetDirectory.trim(),
          file_name: localFolderConfig.fileName?.trim() || "haze-vault.haze",
        });

        remotePayload = res.content;
      }

      // 2. Validate and inspect backup structure
      await api.backupInspect(remotePayload, passphrase);

      // 3. Apply restore with chosen strategy (defaults to "merge" per user decision)
      const strategy = strategyOverride || defaultStrategy || "merge";
      const restored = await api.backupRestore(remotePayload, passphrase, strategy);

      // 4. Reload local memory stores
      await Promise.all([
        useHostStore.getState().fetchHosts(),
        useHostStore.getState().fetchGroups(),
        useHostStore.getState().fetchIdentities(),
        useSnippetStore.getState().fetchSnippets(),
        useTunnelStore.getState().fetchTunnels(),
      ]);

      const now = Date.now();
      recordSyncSuccess(now, fetchedSha, fetchedEtag);

      return restored;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      throw err;
    }
  },

  /**
   * Tests remote connection to verify credentials and endpoint availability
   */
  testConnection: async (): Promise<{ success: boolean; message: string }> => {
    const { activeProvider, gitConfig, webdavConfig, localFolderConfig } = useSyncStore.getState();

    try {
      if (activeProvider === "git") {
        if (!gitConfig.repository.trim() || !gitConfig.token.trim()) {
          return { success: false, message: "Repository and Token are required." };
        }

        try {
          await api.syncGitFileGet({
            provider: gitConfig.gitProvider,
            repository: gitConfig.repository.trim(),
            branch: gitConfig.branch.trim() || "main",
            file_path: gitConfig.filePath.trim() || "haze-vault.haze",
            token: gitConfig.token.trim(),
            base_url: gitConfig.customBaseUrl?.trim() || undefined,
          });
          return { success: true, message: "Connected to repository. Existing vault found." };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404")) {
            return {
              success: true,
              message: "Connected to repository. Remote vault does not exist yet (will be created on first push).",
            };
          }
          throw err;
        }
      } else if (activeProvider === "webdav") {
        if (!webdavConfig.serverUrl.trim()) {
          return { success: false, message: "WebDAV Server URL is required." };
        }

        const res = await api.syncWebDavRequest({
          url: webdavConfig.serverUrl.trim(),
          method: "PROPFIND",
          username: webdavConfig.username?.trim(),
          password: webdavConfig.password?.trim(),
          timeout_seconds: 15,
        });

        if (res.status >= 400 && res.status !== 405) {
          return { success: false, message: `WebDAV server returned HTTP ${res.status}: ${res.body}` };
        }

        return { success: true, message: `WebDAV server responded successfully (HTTP ${res.status}).` };
      } else if (activeProvider === "local_folder") {
        if (!localFolderConfig.targetDirectory.trim()) {
          return { success: false, message: "Folder path is required." };
        }

        // Test creating/checking folder
        await api.syncLocalFolder({
          folder_path: localFolderConfig.targetDirectory.trim(),
          file_name: ".haze-sync-check",
          content: "test",
        });

        return { success: true, message: "Local sync folder is writable and ready." };
      }

      return { success: false, message: "Unknown provider." };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  },
};
