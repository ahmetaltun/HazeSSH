import { useState, type FormEvent } from "react";
import { Download, ShieldCheck, AlertCircle, X, KeyRound, HardDrive } from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useTunnelStore } from "@/stores/useTunnelStore";

interface ExportBackupModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ExportBackupModal({ isOpen, onClose }: ExportBackupModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { hosts, groups, identities } = useHostStore();
  const { snippets } = useSnippetStore();
  const { tunnels } = useTunnelStore();

  if (!isOpen) return null;

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

    setIsExporting(true);
    try {
      const backupJson = await api.backupExport(passphrase);

      // Trigger client-side file download
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `haze-backup-${timestamp}.haze`;
      const blob = new Blob([backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setPassphrase("");
        setConfirmPassphrase("");
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-lg bg-base-100 border border-base-300 shadow-2xl p-6">
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
            onClick={onClose}
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

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/15 text-success mx-auto flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-sm">Backup Archive Generated!</h4>
            <p className="text-xs text-base-content/60">
              Your encrypted .haze archive has been downloaded to your system.
            </p>
          </div>
        ) : (
          <form onSubmit={handleExport} className="space-y-5 mt-4">
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

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-base-content/80 mb-1">
                  Export Passphrase
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Enter strong encryption passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="input input-bordered input-sm w-full pl-9 text-xs"
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
                    type="password"
                    placeholder="Re-enter export passphrase"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    className="input input-bordered input-sm w-full pl-9 text-xs"
                  />
                  <KeyRound className="w-4 h-4 text-base-content/40 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-base-content/60 leading-relaxed bg-base-200/40 p-2.5 rounded-lg border border-base-300">
              This passphrase will be required to decrypt and restore this archive on any machine.
              Haze SSH uses Argon2id key derivation and ChaCha20-Poly1305 encryption.
            </p>

            <div className="modal-action mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-ghost"
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isExporting || !passphrase}
                className="btn btn-sm btn-primary gap-2"
              >
                {isExporting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Export .haze Archive</span>
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="modal-backdrop bg-base-900/60 backdrop-blur-xs" onClick={onClose} />
    </div>
  );
}
