import { useState, useRef, type FormEvent, type ChangeEvent, type DragEvent } from "react";
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
  Eye,
  EyeOff,
  FolderOpen,
  Database,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useTunnelStore } from "@/stores/useTunnelStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import type { BackupSummary, RestoreStrategy } from "@/types/backup";

interface RestoreBackupModalProps {
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

export function RestoreBackupModal({ isOpen, onClose }: RestoreBackupModalProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [strategy, setStrategy] = useState<RestoreStrategy>("merge");
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const processFile = (file: File) => {
    setErrorMsg(null);
    setSummary(null);
    setFileName(file.name);
    setFileSizeBytes(file.size);
    setIsReadingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      setIsReadingFile(false);
    };
    reader.onerror = () => {
      setErrorMsg("Failed to read the selected backup file. Please try again.");
      setIsReadingFile(false);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleBrowseNative = async () => {
    try {
      const selected = await api.dialogPickBackupFile();
      if (selected) {
        setIsReadingFile(true);
        setErrorMsg(null);
        try {
          const content = await api.backupReadFile(selected);
          const fname = selected.split(/[/\\]/).pop() || "backup.haze";
          setFileName(fname);
          setFileContent(content);
          setFileSizeBytes(new Blob([content]).size);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMsg(`Failed to read file: ${msg}`);
        } finally {
          setIsReadingFile(false);
        }
      }
    } catch (err: unknown) {
      console.warn("Native file pick dialog failed:", err);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
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
    setFileSizeBytes(null);
    setSummary(null);
    setErrorMsg(null);
    setPassphrase("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (isInspecting || isRestoring) return;
    handleReset();
    setIsSuccess(false);
    onClose();
  };

  const handleGoToHosts = () => {
    useLayoutStore.getState().setView("hosts");
    handleClose();
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-lg bg-base-100 border border-base-300 shadow-2xl p-6">
        {/* Modal Header */}
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
            onClick={handleClose}
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

        {/* State: Decrypting / Inspecting In-Progress */}
        {isInspecting ? (
          <div className="py-10 text-center space-y-6">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <span className="loading loading-spinner loading-lg text-info w-16 h-16" />
              <Lock className="w-6 h-6 text-info absolute animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-sm">Decrypting & Verifying Archive...</h4>
              <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                Deriving key with Argon2id and verifying ChaCha20-Poly1305 MAC tag.
              </p>
            </div>

            <div className="bg-base-200/60 rounded-xl p-3.5 border border-base-300 max-w-sm mx-auto text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-base-content/80 font-medium">
                <span className="loading loading-spinner loading-xs text-info" />
                <span>Running Argon2id key derivation</span>
              </div>
              <div className="flex items-center gap-2 text-base-content/60 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                <span>Checking payload integrity and cryptographic signature</span>
              </div>
            </div>

            <p className="text-[11px] text-base-content/50 italic">
              Cryptographic verification protects your vault from tampered archives.
            </p>
          </div>
        ) : isRestoring ? (
          /* State: Restoring In-Progress */
          <div className="py-10 text-center space-y-6">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <span className="loading loading-spinner loading-lg text-primary w-16 h-16" />
              <Database className="w-6 h-6 text-primary absolute animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-sm">Synchronizing Database...</h4>
              <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                Re-encrypting records with current master vault key and updating application state.
              </p>
            </div>

            <div className="bg-base-200/60 rounded-xl p-3.5 border border-base-300 max-w-sm mx-auto text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-base-content/80 font-medium">
                <span className="loading loading-spinner loading-xs text-primary" />
                <span>Writing records with {strategy === "overwrite" ? "clean overwrite" : "entity merge"}</span>
              </div>
              <div className="flex items-center gap-2 text-base-content/60 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Synchronizing hosts, snippets, identities, and tunnels</span>
              </div>
            </div>

            <p className="text-[11px] text-base-content/50 italic">
              Applying changes. Please do not close Haze SSH.
            </p>
          </div>
        ) : isSuccess ? (
          /* State: Persistent Success Screen (No Auto-Dismiss) */
          <div className="py-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-success/15 text-success mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-semibold text-base text-base-content">Backup Restored Successfully!</h4>
              <p className="text-xs text-base-content/60">
                All records have been decrypted and synchronized with your local vault.
              </p>
            </div>

            {/* Summary card */}
            {summary && (
              <div className="bg-base-200/60 rounded-xl p-3.5 border border-base-300 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-base-content/80">Synchronized Items</span>
                  <span className="badge badge-sm badge-success font-medium">
                    {strategy === "overwrite" ? "Clean Overwrite" : "Merged"}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center pt-1">
                  <div className="bg-base-100 p-1.5 rounded-md border border-base-200">
                    <div className="text-xs font-bold text-primary">{summary.hosts_count}</div>
                    <div className="text-[9px] text-base-content/60">Hosts</div>
                  </div>
                  <div className="bg-base-100 p-1.5 rounded-md border border-base-200">
                    <div className="text-xs font-bold text-secondary">{summary.groups_count}</div>
                    <div className="text-[9px] text-base-content/60">Groups</div>
                  </div>
                  <div className="bg-base-100 p-1.5 rounded-md border border-base-200">
                    <div className="text-xs font-bold text-accent">{summary.identities_count}</div>
                    <div className="text-[9px] text-base-content/60">Keys</div>
                  </div>
                  <div className="bg-base-100 p-1.5 rounded-md border border-base-200">
                    <div className="text-xs font-bold text-info">{summary.snippets_count}</div>
                    <div className="text-[9px] text-base-content/60">Snippets</div>
                  </div>
                  <div className="bg-base-100 p-1.5 rounded-md border border-base-200">
                    <div className="text-xs font-bold text-warning">{summary.tunnels_count}</div>
                    <div className="text-[9px] text-base-content/60">Tunnels</div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-success/10 text-base-content/85 border border-success/30 p-2.5 rounded-xl text-[11px] flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0 text-success" />
              <span className="leading-relaxed">
                Your hosts and keys are ready. You can now connect or manage them directly.
              </span>
            </div>

            {/* Persistent action buttons */}
            <div className="modal-action mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-sm btn-ghost"
              >
                Done
              </button>
              <button
                type="button"
                onClick={handleGoToHosts}
                className="btn btn-sm btn-primary px-5 gap-1.5"
              >
                <span>View Hosts</span>
              </button>
            </div>
          </div>
        ) : !summary ? (
          /* Step 1: Select File & Passphrase */
          <form onSubmit={handleInspect} className="space-y-4 mt-4">
            {/* Drag & Drop zone */}
            <div>
              <label className="block text-xs font-medium text-base-content/80 mb-1">
                Select .haze Backup File
              </label>

              {fileName && fileContent ? (
                /* Selected file pill */
                <div className="flex items-center justify-between p-3 rounded-xl bg-base-200/60 border border-base-300">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="font-mono text-xs font-semibold truncate text-base-content/90">
                        {fileName}
                      </div>
                      <div className="text-[10px] text-base-content/60">
                        {fileSizeBytes ? formatBytes(fileSizeBytes) : "Archive Loaded"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-error"
                    title="Choose a different file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                /* Empty dropzone */
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
                    isDragging
                      ? "border-info bg-info/5 scale-[1.01]"
                      : "border-base-300 hover:border-info/50 hover:bg-base-200/40"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".haze,.json,application/json,*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-xl bg-base-200 text-base-content/60 flex items-center justify-center mx-auto mb-2">
                    <Upload className="w-5 h-5 text-info" />
                  </div>
                  <div className="text-xs font-semibold text-base-content/80">
                    {isReadingFile ? "Reading archive..." : "Drop your .haze backup archive here"}
                  </div>
                  <p className="text-[11px] text-base-content/50 mt-1">
                    Drag and drop or click to choose from your computer
                  </p>

                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBrowseNative();
                      }}
                      className="btn btn-xs btn-outline gap-1"
                    >
                      <FolderOpen className="w-3 h-3" />
                      <span>Browse Files</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Passphrase Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-base-content/80">
                  Decryption Passphrase
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
                  placeholder="Enter the passphrase used when exporting"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="input input-bordered input-sm w-full pl-9 pr-9 text-xs"
                />
                <KeyRound className="w-4 h-4 text-base-content/40 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <p className="text-[11px] text-base-content/60 leading-relaxed bg-base-200/40 p-2.5 rounded-lg border border-base-300">
              The archive will be decrypted locally using Argon2id. Once unlocked, you will have a
              chance to preview included items and choose your restore collision strategy.
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
                disabled={!fileContent || !passphrase}
                className="btn btn-sm btn-primary gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Decrypt & Inspect Archive</span>
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Inspected Summary & Strategy Selection */
          <div className="space-y-4 mt-4">
            <div className="bg-base-200/60 rounded-xl p-3.5 border border-base-300 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-base-content/90">Archive Contents</span>
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
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-sm btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  className={`btn btn-sm gap-2 ${
                    strategy === "overwrite" ? "btn-error" : "btn-primary"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {strategy === "overwrite" ? "Overwrite & Restore" : "Confirm Merge Restore"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div
        className="modal-backdrop bg-base-900/60 backdrop-blur-xs"
        onClick={isInspecting || isRestoring ? undefined : handleClose}
      />
    </div>
  );
}