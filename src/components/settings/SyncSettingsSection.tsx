import { useState } from "react";
import {
  Cloud,
  FolderGit2,
  HardDrive,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  GitBranch,
  Server,
  Folder,
} from "lucide-react";
import { useSyncStore } from "@/stores/useSyncStore";
import { decentralizedSyncService } from "@/services/decentralizedSyncService";
import type { GitProviderType } from "@/types/sync";

export function SyncSettingsSection() {
  const {
    activeProvider,
    gitConfig,
    webdavConfig,
    localFolderConfig,
    syncPassphrase,
    status,
    lastSyncedAt,
    lastError,
    autoSyncEnabled,
    defaultStrategy,
    setActiveProvider,
    updateGitConfig,
    updateWebDavConfig,
    updateLocalFolderConfig,
    setSyncPassphrase,
    setAutoSyncEnabled,
    setDefaultStrategy,
  } = useSyncStore();

  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showGitToken, setShowGitToken] = useState(false);
  const [showWebDavPassword, setShowWebDavPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ success: boolean; text: string } | null>(
    null
  );

  const formatLastSynced = (ts: number | null) => {
    if (!ts) return "Never synced";
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const handlePush = async () => {
    setIsProcessing(true);
    setActionMessage(null);
    try {
      const res = await decentralizedSyncService.pushVault();
      setActionMessage({ success: true, text: res.message });
    } catch (err) {
      setActionMessage({
        success: false,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePull = async () => {
    setIsProcessing(true);
    setActionMessage(null);
    try {
      const res = await decentralizedSyncService.pullVault();
      setActionMessage({
        success: true,
        text: `Pulled and applied successfully: ${res.hosts_count} hosts, ${res.snippets_count} snippets restored.`,
      });
    } catch (err) {
      setActionMessage({
        success: false,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestConnection = async () => {
    setIsProcessing(true);
    setActionMessage(null);
    try {
      const res = await decentralizedSyncService.testConnection();
      setActionMessage({
        success: res.success,
        text: res.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="card bg-base-200/50 border border-base-300 shadow-xs">
        <div className="card-body p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-info/15 text-info shrink-0 mt-0.5">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>Decentralized E2EE Cross-Device Sync</span>
                <span className="badge badge-info badge-xs">Cloudless</span>
              </h3>
              <p className="text-xs text-base-content/70 mt-1 max-w-xl leading-relaxed">
                Direct peer-to-peer sync via private Git repositories (GitHub/GitLab/Gitea),
                WebDAV/Nextcloud, or local synced directories (Syncthing, iCloud Drive).
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={`badge badge-sm font-mono gap-1.5 ${
                status === "synced"
                  ? "badge-success"
                  : status === "syncing"
                  ? "badge-warning"
                  : status === "error"
                  ? "badge-error"
                  : "badge-neutral"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>{formatLastSynced(lastSyncedAt)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Encryption & Security Guarantee Banner */}
      <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-primary">Argon2id + ChaCha20-Poly1305 Client-Side Encryption</span>
          <span className="text-base-content/80 leading-relaxed">
            All server configs, private keys, passwords, and snippets are encrypted locally using your
            sync passphrase <strong>before</strong> uploading. The remote storage host (GitHub, Nextcloud, etc.)
            only ever sees ciphertext blobs. Even if your repository is public, your infrastructure data cannot
            be read without your passphrase.
          </span>
        </div>
      </div>

      {/* Sync Passphrase Field */}
      <div className="card bg-base-200/40 border border-base-300 shadow-xs">
        <div className="card-body p-4 sm:p-5 flex flex-col gap-3">
          <label className="text-xs font-semibold text-base-content/90 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-primary" />
            <span>Sync Decryption Passphrase</span>
          </label>
          <div className="relative max-w-md">
            <input
              type={showPassphrase ? "text" : "password"}
              value={syncPassphrase}
              onChange={(e) => setSyncPassphrase(e.target.value)}
              placeholder="Enter strong passphrase for cross-device encryption"
              className="input input-sm input-bordered w-full pr-8 bg-base-100 font-mono text-xs focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
            >
              {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-base-content/60">
            Use the exact same passphrase across all your devices to decrypt and sync your vault.
          </p>
        </div>
      </div>

      {/* Provider Selector Tabs */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-base-content/60">
          Sync Target Backend
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setActiveProvider("git")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              activeProvider === "git"
                ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/40"
                : "bg-base-200/40 border-base-300 hover:bg-base-200/80"
            }`}
          >
            <FolderGit2 className={`w-5 h-5 ${activeProvider === "git" ? "text-primary" : "text-base-content/60"}`} />
            <div>
              <div className="font-semibold text-xs text-base-content">Private Git Repository</div>
              <div className="text-[11px] text-base-content/60">GitHub / GitLab / Gitea</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveProvider("webdav")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              activeProvider === "webdav"
                ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/40"
                : "bg-base-200/40 border-base-300 hover:bg-base-200/80"
            }`}
          >
            <Server className={`w-5 h-5 ${activeProvider === "webdav" ? "text-primary" : "text-base-content/60"}`} />
            <div>
              <div className="font-semibold text-xs text-base-content">WebDAV / Nextcloud</div>
              <div className="text-[11px] text-base-content/60">Self-hosted cloud storage</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveProvider("local_folder")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              activeProvider === "local_folder"
                ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/40"
                : "bg-base-200/40 border-base-300 hover:bg-base-200/80"
            }`}
          >
            <HardDrive className={`w-5 h-5 ${activeProvider === "local_folder" ? "text-primary" : "text-base-content/60"}`} />
            <div>
              <div className="font-semibold text-xs text-base-content">Local Synced Folder</div>
              <div className="text-[11px] text-base-content/60">Syncthing / iCloud / Dropbox</div>
            </div>
          </button>
        </div>
      </div>

      {/* Provider Details Configuration */}
      <div className="card bg-base-200/40 border border-base-300 shadow-xs">
        <div className="card-body p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-base-300/60 pb-3">
            <h4 className="font-bold text-sm text-base-content">
              {activeProvider === "git"
                ? "Git Repository Settings"
                : activeProvider === "webdav"
                ? "WebDAV Server Settings"
                : "Local Folder Settings"}
            </h4>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isProcessing}
              className="btn btn-xs btn-neutral gap-1"
            >
              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span>Test Connection</span>
            </button>
          </div>

          {/* Action result banner */}
          {actionMessage && (
            <div
              className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                actionMessage.success
                  ? "bg-success/15 border-success/30 text-success"
                  : "bg-error/15 border-error/30 text-error"
              }`}
            >
              {actionMessage.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span className="font-mono">{actionMessage.text}</span>
            </div>
          )}

          {lastError && !actionMessage && (
            <div className="p-2.5 rounded-lg border border-error/30 bg-error/15 text-error text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-mono">{lastError}</span>
            </div>
          )}

          {/* Git Form */}
          {activeProvider === "git" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Git Hosting Provider</label>
                <select
                  value={gitConfig.gitProvider}
                  onChange={(e) => updateGitConfig({ gitProvider: e.target.value as GitProviderType })}
                  className="select select-sm select-bordered bg-base-100 font-mono text-xs"
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                  <option value="gitea">Gitea / Forgejo</option>
                  <option value="custom">Custom Git Host</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Repository (owner/repo)</label>
                <input
                  type="text"
                  value={gitConfig.repository}
                  onChange={(e) => updateGitConfig({ repository: e.target.value })}
                  placeholder="e.g. username/haze-sync-vault"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Personal Access Token (PAT)</label>
                <div className="relative">
                  <input
                    type={showGitToken ? "text" : "password"}
                    value={gitConfig.token}
                    onChange={(e) => updateGitConfig({ token: e.target.value })}
                    placeholder="ghp_... or glpat-..."
                    className="input input-sm input-bordered w-full pr-8 bg-base-100 font-mono text-xs focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGitToken(!showGitToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                  >
                    {showGitToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-base-content/60" />
                  <span>Branch Name</span>
                </label>
                <input
                  type="text"
                  value={gitConfig.branch}
                  onChange={(e) => updateGitConfig({ branch: e.target.value })}
                  placeholder="main"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Remote File Path</label>
                <input
                  type="text"
                  value={gitConfig.filePath}
                  onChange={(e) => updateGitConfig({ filePath: e.target.value })}
                  placeholder="haze-vault.haze"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>

              {gitConfig.gitProvider !== "github" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-base-content/80">Custom Base Host URL</label>
                  <input
                    type="text"
                    value={gitConfig.customBaseUrl || ""}
                    onChange={(e) => updateGitConfig({ customBaseUrl: e.target.value })}
                    placeholder="https://gitlab.example.com"
                    className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                  />
                </div>
              )}
            </div>
          )}

          {/* WebDAV Form */}
          {activeProvider === "webdav" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-base-content/80">WebDAV Server URL</label>
                <input
                  type="text"
                  value={webdavConfig.serverUrl}
                  onChange={(e) => updateWebDavConfig({ serverUrl: e.target.value })}
                  placeholder="https://nextcloud.example.com/remote.php/dav/files/user/Haze/"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Username</label>
                <input
                  type="text"
                  value={webdavConfig.username || ""}
                  onChange={(e) => updateWebDavConfig({ username: e.target.value })}
                  placeholder="admin"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Password or App Token</label>
                <div className="relative">
                  <input
                    type={showWebDavPassword ? "text" : "password"}
                    value={webdavConfig.password || ""}
                    onChange={(e) => updateWebDavConfig({ password: e.target.value })}
                    placeholder="••••••••••••"
                    className="input input-sm input-bordered w-full pr-8 bg-base-100 font-mono text-xs focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWebDavPassword(!showWebDavPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                  >
                    {showWebDavPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Remote File Name</label>
                <input
                  type="text"
                  value={webdavConfig.remotePath}
                  onChange={(e) => updateWebDavConfig({ remotePath: e.target.value })}
                  placeholder="haze-vault.haze"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* Local Folder Form */}
          {activeProvider === "local_folder" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 text-base-content/60" />
                  <span>Target Sync Folder Path</span>
                </label>
                <input
                  type="text"
                  value={localFolderConfig.targetDirectory}
                  onChange={(e) => updateLocalFolderConfig({ targetDirectory: e.target.value })}
                  placeholder="/Users/username/Syncthing/Haze"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-base-content/80">Archive File Name</label>
                <input
                  type="text"
                  value={localFolderConfig.fileName || "haze-vault.haze"}
                  onChange={(e) => updateLocalFolderConfig({ fileName: e.target.value })}
                  placeholder="haze-vault.haze"
                  className="input input-sm input-bordered bg-base-100 font-mono text-xs focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* Action Buttons: Push & Pull */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-base-300/60">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-base-content/70">Conflict Policy:</span>
                <div className="join">
                  <button
                    type="button"
                    onClick={() => setDefaultStrategy("merge")}
                    className={`btn btn-xs join-item ${
                      defaultStrategy === "merge" ? "btn-primary font-bold" : "btn-neutral"
                    }`}
                  >
                    Smart Merge (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultStrategy("overwrite")}
                    className={`btn btn-xs join-item ${
                      defaultStrategy === "overwrite" ? "btn-primary font-bold" : "btn-neutral"
                    }`}
                  >
                    Overwrite Local
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                  className="checkbox checkbox-primary checkbox-xs"
                />
                <span className="text-xs font-semibold text-base-content/80">Auto-sync on startup</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePull}
                disabled={isProcessing || !syncPassphrase}
                className="btn btn-sm btn-neutral gap-1.5"
                title="Download remote encrypted vault and merge"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>Pull from Remote</span>
              </button>

              <button
                type="button"
                onClick={handlePush}
                disabled={isProcessing || !syncPassphrase}
                className="btn btn-sm btn-primary gap-1.5 font-bold shadow-xs"
                title="Encrypt local database and upload to remote"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Push to Remote</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
