import { useState, type FormEvent } from "react";
import {
  Download,
  ShieldCheck,
  AlertCircle,
  X,
  KeyRound,
  HardDrive,
  FolderOpen,
  Check,
  Copy,
  Eye,
  EyeOff,
  Lock,
  FileCheck2,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useTunnelStore } from "@/stores/useTunnelStore";
import { useVaultStore } from "@/stores/useVaultStore";
import type { BackupExportResult } from "@/types/backup";

interface ExportBackupModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function getDefaultFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `haze-backup-${ts}.haze`;
}

export function ExportBackupModal({ isOpen, onClose }: ExportBackupModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [destinationPath, setDestinationPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [exportResult, setExportResult] = useState<BackupExportResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const { hosts, groups, identities } = useHostStore();
  const { snippets } = useSnippetStore();
  const { tunnels } = useTunnelStore();

  if (!isOpen) return null;

  const handleBrowseDestination = async () => {
    try {
      const defaultName = destinationPath
        ? destinationPath.split(/[/\\]/).pop() || getDefaultFilename()
        : getDefaultFilename();
      const path = await api.dialogSaveBackupPath(defaultName);
      if (path) {
        setDestinationPath(path);
        setErrorMsg(null);
      }
    } catch (err: unknown) {
      console.warn("Failed to open save file dialog:", err);
    }
  };

  const handleExport = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!passphrase || passphrase.length < 6) {
      setErrorMsg("Export passphrase must be at least 6 characters long to secure your credentials.");
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setErrorMsg("Passphrases do not match. Please verify and re-enter.");
      return;
    }

    const { hasMasterPassword, isLocked, requestUnlock } = useVaultStore.getState();
    if (hasMasterPassword && isLocked) {
      const unlocked = await requestUnlock("export encrypted backup");
      if (!unlocked) return;
    }

    let targetPath = destinationPath;
    if (!targetPath) {
      try {
        const selected = await api.dialogSaveBackupPath(getDefaultFilename());
        if (!selected) {
          // User clicked Cancel in native OS dialog
          return;
        }
        targetPath = selected;
        setDestinationPath(selected);
      } catch (err: unknown) {
        console.warn("Save dialog failed, using fallback:", err);
      }
    }

    setIsExporting(true);
    try {
      if (targetPath) {
        const result = await api.backupExportToFile(targetPath, passphrase);
        setExportResult(result);
      } else {
        // Fallback for environment without native dialog
        const backupJson = await api.backupExport(passphrase);
        const filename = getDefaultFilename();
        const blob = new Blob([backupJson], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setExportResult({
          filePath: filename,
          fileSizeBytes: blob.size,
          exportedAt: Math.floor(Date.now() / 1000),
          hostsCount: hosts.length,
          groupsCount: groups.length,
          identitiesCount: identities.length,
          snippetsCount: snippets.length,
          tunnelsCount: tunnels.length,
        });
      }
      setIsSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShowInFolder = async () => {
    if (!exportResult?.filePath) return;
    try {
      await revealItemInDir(exportResult.filePath);
    } catch (err: unknown) {
      console.warn("Failed to reveal file in directory:", err);
    }
  };

  const handleCopyPath = async () => {
    if (!exportResult?.filePath) return;
    try {
      await navigator.clipboard.writeText(exportResult.filePath);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err: unknown) {
      console.warn("Failed to copy file path to clipboard:", err);
    }
  };

  const handleClose = () => {
    if (isExporting) return;
    setPassphrase("");
    setConfirmPassphrase("");
    setDestinationPath(null);
    setErrorMsg(null);
    setIsSuccess(false);
    setExportResult(null);
    onClose();
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-lg bg-base-100 border border-base-300 shadow-2xl p-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-base-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Export Encrypted Backup</h3>
              <p className="text-xs text-base-content/60">Generate a portable .haze encrypted archive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-circle"
            disabled={isExporting}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="alert alert-error text-xs py-2.5 mt-4 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* State 1: Active In-Progress Loading Screen */}
        {isExporting ? (
          <div className="py-10 text-center space-y-6">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <span className="loading loading-spinner loading-lg text-primary w-16 h-16" />
              <Lock className="w-6 h-6 text-primary absolute animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-sm">Encrypting & Packaging Archive...</h4>
              <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                Deriving high-security master key and encrypting configuration records.
              </p>
            </div>

            {/* Stepper info */}
            <div className="bg-base-200/60 rounded-xl p-3.5 border border-base-300 max-w-sm mx-auto text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-base-content/80 font-medium">
                <span className="loading loading-spinner loading-xs text-primary" />
                <span>Deriving key with Argon2id (anti-brute force)</span>
              </div>
              <div className="flex items-center gap-2 text-base-content/60 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                <span>ChaCha20-Poly1305 authenticated encryption</span>
              </div>
              <div className="flex items-center gap-2 text-base-content/60 text-[11px]">
                <FileCheck2 className="w-3.5 h-3.5 text-info shrink-0" />
                <span>Writing encrypted .haze archive to selected destination</span>
              </div>
            </div>

            <p className="text-[11px] text-base-content/50 italic">
              Please wait a moment. Do not close or restart the application.
            </p>
          </div>
        ) : isSuccess && exportResult ? (
          /* State 2: Persistent Success View (No Auto-Dismiss) */
          <div className="py-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-success/15 text-success mx-auto flex items-center justify-center shadow-inner">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h4 className="font-semibold text-base text-base-content">Backup Archive Generated!</h4>
              <p className="text-xs text-base-content/60">
                Your encrypted backup is ready and securely saved.
              </p>
            </div>

            {/* File info card */}
            <div className="bg-base-200/60 rounded-xl p-3.5 border border-base-300 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-base-content/80">Saved Archive</span>
                <span className="badge badge-sm badge-success font-mono font-medium">
                  {formatBytes(exportResult.fileSizeBytes)}
                </span>
              </div>

              <div className="bg-base-100 p-2.5 rounded-lg border border-base-200 flex items-center justify-between gap-2 overflow-hidden">
                <span
                  className="font-mono text-[11px] text-base-content/80 truncate select-all"
                  title={exportResult.filePath}
                >
                  {exportResult.filePath}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="btn btn-ghost btn-xs gap-1 shrink-0"
                  title="Copy full path to clipboard"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3 text-success" />
                      <span className="text-[10px] text-success">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Entity count breakdown pills */}
              <div className="grid grid-cols-5 gap-1.5 text-center pt-1">
                <div className="bg-base-100/80 p-1.5 rounded-md border border-base-200">
                  <div className="text-xs font-bold text-primary">{exportResult.hostsCount}</div>
                  <div className="text-[9px] text-base-content/60">Hosts</div>
                </div>
                <div className="bg-base-100/80 p-1.5 rounded-md border border-base-200">
                  <div className="text-xs font-bold text-secondary">{exportResult.groupsCount}</div>
                  <div className="text-[9px] text-base-content/60">Groups</div>
                </div>
                <div className="bg-base-100/80 p-1.5 rounded-md border border-base-200">
                  <div className="text-xs font-bold text-accent">{exportResult.identitiesCount}</div>
                  <div className="text-[9px] text-base-content/60">Keys</div>
                </div>
                <div className="bg-base-100/80 p-1.5 rounded-md border border-base-200">
                  <div className="text-xs font-bold text-info">{exportResult.snippetsCount}</div>
                  <div className="text-[9px] text-base-content/60">Snippets</div>
                </div>
                <div className="bg-base-100/80 p-1.5 rounded-md border border-base-200">
                  <div className="text-xs font-bold text-warning">{exportResult.tunnelsCount}</div>
                  <div className="text-[9px] text-base-content/60">Tunnels</div>
                </div>
              </div>
            </div>

            <div className="bg-warning/10 text-base-content/85 border border-warning/30 p-2.5 rounded-xl text-[11px] flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 text-warning mt-0.5" />
              <span className="leading-relaxed">
                <strong className="text-warning font-semibold">Important:</strong> Keep your export passphrase secure. Without it, this archive
                cannot be decrypted or restored on any system.
              </span>
            </div>

            {/* Persistent action buttons */}
            <div className="modal-action mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={handleShowInFolder}
                className="btn btn-sm btn-outline gap-1.5"
                title="Reveal file in Finder / Explorer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Show in Folder</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="btn btn-sm btn-primary px-5"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* State 3: Configuration Form */
          <form onSubmit={handleExport} className="space-y-4 mt-4">
            {/* Entity counts summary */}
            <div className="bg-base-200/60 rounded-xl p-3 border border-base-300">
              <div className="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider mb-2">
                Included Configurations
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-primary">{hosts.length}</div>
                  <div className="text-[10px] text-base-content/60">Hosts</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-secondary">{groups.length}</div>
                  <div className="text-[10px] text-base-content/60">Groups</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-accent">{identities.length}</div>
                  <div className="text-[10px] text-base-content/60">Keys</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-info">{snippets.length}</div>
                  <div className="text-[10px] text-base-content/60">Snippets</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-warning">{tunnels.length}</div>
                  <div className="text-[10px] text-base-content/60">Tunnels</div>
                </div>
              </div>
            </div>

            {/* Destination Selection */}
            <div>
              <label className="block text-xs font-medium text-base-content/80 mb-1">
                Save Destination
              </label>
              <div className="flex gap-2">
                <div
                  className="input input-bordered input-sm flex-1 flex items-center font-mono text-xs text-base-content/80 truncate bg-base-200/40 cursor-pointer"
                  onClick={handleBrowseDestination}
                  title={destinationPath || "Click to choose destination folder"}
                >
                  <FolderOpen className="w-4 h-4 text-primary shrink-0 mr-2" />
                  <span className="truncate">
                    {destinationPath ? destinationPath : "Choose save location..."}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBrowseDestination}
                  className="btn btn-sm btn-outline shrink-0 gap-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Browse...</span>
                </button>
              </div>
              <p className="text-[10px] text-base-content/50 mt-1">
                Default: Click Browse or Export to select your preferred directory.
              </p>
            </div>

            {/* Passphrases */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-base-content/80">
                    Export Passphrase
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="text-[11px] text-base-content/60 hover:text-base-content flex items-center gap-1"
                  >
                    {showPassphrase ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Show</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    placeholder="Enter strong encryption passphrase (min 6 characters)"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="input input-bordered input-sm w-full pl-9 pr-9 text-xs"
                    autoFocus
                  />
                  <KeyRound className="w-4 h-4 text-base-content/40 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-base-content/80 mb-1">
                  Confirm Passphrase
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    placeholder="Re-enter export passphrase"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    className="input input-bordered input-sm w-full pl-9 text-xs"
                  />
                  <KeyRound className="w-4 h-4 text-base-content/40 absolute left-2.5 top-2.5" />
                </div>
                {confirmPassphrase && passphrase !== confirmPassphrase && (
                  <p className="text-[10px] text-error mt-1">Passphrases do not match yet.</p>
                )}
                {confirmPassphrase && passphrase === confirmPassphrase && (
                  <p className="text-[10px] text-success mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Passphrases match
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-base-content/60 leading-relaxed bg-base-200/40 p-2.5 rounded-lg border border-base-300">
              This passphrase is required to decrypt and restore this archive. Haze SSH uses Argon2id key
              derivation and ChaCha20-Poly1305 encryption. The export process takes 2–4 seconds by design
              to prevent brute-force cracking.
            </p>

            <div className="modal-action mt-6">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-sm btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!passphrase || passphrase.length < 6 || passphrase !== confirmPassphrase}
                className="btn btn-sm btn-primary gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export .haze Archive</span>
              </button>
            </div>
          </form>
        )}
      </div>
      <div
        className="modal-backdrop bg-base-900/60 backdrop-blur-xs"
        onClick={isExporting ? undefined : handleClose}
      />
    </div>
  );
}