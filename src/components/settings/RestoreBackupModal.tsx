import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import {
  Upload,
  ShieldCheck,
  AlertCircle,
  X,
  KeyRound,
  FileText,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useTunnelStore } from "@/stores/useTunnelStore";
import type { BackupSummary, RestoreStrategy } from "@/types/backup";

interface RestoreBackupModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function RestoreBackupModal({ isOpen, onClose }: RestoreBackupModalProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [strategy, setStrategy] = useState<RestoreStrategy>("merge");
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSummary(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
    };
    reader.onerror = () => {
      setErrorMsg("Failed to read the selected backup file. Please try again.");
    };
    reader.readAsText(file);
  };

  const handleInspect = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fileContent) {
      setErrorMsg("Please select a .haze backup archive first.");
      return;
    }

    if (!passphrase) {
      setErrorMsg("Please enter the decryption passphrase for this backup.");
      return;
    }

    setIsInspecting(true);
    try {
      const inspected = await api.backupInspect(fileContent, passphrase);
      setSummary(inspected);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Inspection failed: ${msg}`);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleRestore = async () => {
    if (!fileContent || !passphrase) return;

    setErrorMsg(null);
    setIsRestoring(true);
    try {
      await api.backupRestore(fileContent, passphrase, strategy);

      // Refresh all core application stores
      await Promise.all([
        useHostStore.getState().fetchAll(),
        useSnippetStore.getState().fetchSnippets(),
        useTunnelStore.getState().fetchTunnels(),
      ]);

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Restore failed: ${msg}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleReset = () => {
    setFileContent(null);
    setFileName(null);
    setSummary(null);
    setErrorMsg(null);
    setPassphrase("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-lg bg-base-100 border border-base-300 shadow-2xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-base-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-info/10 text-info flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Restore Encrypted Backup</h3>
              <p className="text-xs text-base-content/60">Import and decrypt a .haze backup archive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            disabled={isRestoring || isInspecting}
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

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/15 text-success mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-sm">Backup Restored Successfully!</h4>
            <p className="text-xs text-base-content/60">
              All hosts, keys, snippets, and tunnels have been synchronized with your local vault.
            </p>
          </div>
        ) : !summary ? (
          /* Step 1: Select File & Passphrase */
          <form onSubmit={handleInspect} className="space-y-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-base-content/80 mb-1">
                Select .haze Backup File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".haze,.json"
                onChange={handleFileChange}
                className="file-input file-input-bordered file-input-sm w-full text-xs"
              />
              {fileName && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-base-content/70">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span className="font-mono">{fileName}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-base-content/80 mb-1">
                Decryption Passphrase
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter the passphrase used when exporting"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="input input-bordered input-sm w-full pl-9 text-xs"
                />
                <KeyRound className="w-4 h-4 text-base-content/40 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="modal-action mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-ghost"
                disabled={isInspecting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isInspecting || !fileContent || !passphrase}
                className="btn btn-sm btn-primary gap-2"
              >
                {isInspecting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>Decrypt & Inspect Archive</span>
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Inspected Summary & Strategy Selection */
          <div className="space-y-4 mt-4">
            <div className="bg-base-200/60 rounded-xl p-3 border border-base-300 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Archive Metadata</span>
                <span className="badge badge-sm badge-success gap-1">
                  <ShieldCheck className="w-3 h-3" /> Validated V{summary.version}
                </span>
              </div>

              <div className="text-[11px] text-base-content/60">
                Exported on: {new Date(summary.exported_at * 1000).toLocaleString()}
              </div>

              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-primary">{summary.hosts_count}</div>
                  <div className="text-[10px] text-base-content/60">Hosts</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-secondary">{summary.groups_count}</div>
                  <div className="text-[10px] text-base-content/60">Groups</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-accent">{summary.identities_count}</div>
                  <div className="text-[10px] text-base-content/60">Keys</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-info">{summary.snippets_count}</div>
                  <div className="text-[10px] text-base-content/60">Snippets</div>
                </div>
                <div className="bg-base-100 p-2 rounded-lg border border-base-200">
                  <div className="text-xs font-bold text-warning">{summary.tunnels_count}</div>
                  <div className="text-[10px] text-base-content/60">Tunnels</div>
                </div>
              </div>
            </div>

            {/* Strategy Radio Cards */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-base-content/80">Collision Strategy</span>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    strategy === "merge"
                      ? "border-primary bg-primary/5"
                      : "border-base-300 hover:bg-base-200/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="strategy"
                    value="merge"
                    checked={strategy === "merge"}
                    onChange={() => setStrategy("merge")}
                    className="radio radio-xs radio-primary mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold">Merge with Existing Data</span>
                    <p className="text-[11px] text-base-content/60 leading-normal">
                      Preserves all current hosts and keys. Any colliding entity IDs will be assigned
                      new unique identifiers and references resolved automatically.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    strategy === "overwrite"
                      ? "border-error bg-error/5"
                      : "border-base-300 hover:bg-base-200/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="strategy"
                    value="overwrite"
                    checked={strategy === "overwrite"}
                    onChange={() => setStrategy("overwrite")}
                    className="radio radio-xs radio-error mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-error">Clean Overwrite</span>
                      <AlertTriangle className="w-3 h-3 text-error" />
                    </div>
                    <p className="text-[11px] text-base-content/60 leading-normal">
                      Completely replaces your current database with this backup archive. Existing
                      hosts, keys, snippets, and tunnels will be overwritten.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="modal-action mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-sm btn-ghost gap-1.5"
                disabled={isRestoring}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-sm btn-ghost"
                  disabled={isRestoring}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className={`btn btn-sm gap-2 ${
                    strategy === "overwrite" ? "btn-error" : "btn-primary"
                  }`}
                >
                  {isRestoring ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>
                    {strategy === "overwrite" ? "Overwrite & Restore" : "Confirm Merge Restore"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="modal-backdrop bg-base-900/60 backdrop-blur-xs" onClick={onClose} />
    </div>
  );
}
