import { useState, type FormEvent } from "react";
import { Lock, Unlock, ShieldAlert, KeyRound } from "lucide-react";
import { useVaultStore } from "@/stores/useVaultStore";

interface VaultModalProps {
  readonly isOpen: boolean;
  readonly mode: "unlock" | "setup" | "disable";
  readonly onClose: () => void;
  readonly onSuccess?: () => void;
}

export function VaultModal({ isOpen, mode, onClose, onSuccess }: VaultModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { unlock, setMasterPassword, unlockReason, resolveUnlockRequest } = useVaultStore();

  if (!isOpen) return null;

  const handleClose = () => {
    if (mode === "unlock") {
      resolveUnlockRequest(false);
    }
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === "setup") {
      if (!password || password.length < 6) {
        setErrorMsg("Master password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("Passwords do not match. Please re-enter.");
        return;
      }

      setIsSubmitting(true);
      try {
        await setMasterPassword(password);
        setPassword("");
        setConfirmPassword("");
        onSuccess?.();
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    } else if (mode === "disable") {
      setIsSubmitting(true);
      try {
        await setMasterPassword(null);
        setPassword("");
        onSuccess?.();
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // unlock mode
      if (!password) {
        setErrorMsg("Please enter your master password.");
        return;
      }

      setIsSubmitting(true);
      try {
        await unlock(password);
        setPassword("");
        onSuccess?.();
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box bg-base-200 border border-base-300 max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {mode === "unlock" ? (
              <Lock className="w-5 h-5 text-warning" />
            ) : mode === "setup" ? (
              <KeyRound className="w-5 h-5 text-primary" />
            ) : (
              <Unlock className="w-5 h-5 text-error" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-base">
              {mode === "unlock"
                ? "Unlock Local Vault"
                : mode === "setup"
                ? "Set Master Password"
                : "Remove Master Password"}
            </h3>
            <p className="text-xs text-base-content/60">
              {mode === "unlock"
                ? unlockReason
                  ? `Required to ${unlockReason}.`
                  : "Enter your master passphrase to decrypt stored SSH credentials."
                : mode === "setup"
                ? "Your credentials will be encrypted using an Argon2id-derived key."
                : "Credentials will use local device-key encryption without a password."}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="alert alert-error text-xs py-2 px-3 mb-4">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== "disable" && (
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold">
                  {mode === "setup" ? "New Master Password" : "Master Password"}
                </span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
                autoFocus
              />
            </div>
          )}

          {mode === "setup" && (
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold">
                  Confirm Master Password
                </span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
              />
            </div>
          )}

          <div className="modal-action mt-6 gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="btn btn-sm btn-ghost border border-base-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`btn btn-sm ${
                mode === "disable" ? "btn-error" : "btn-primary"
              }`}
            >
              {isSubmitting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : mode === "unlock" ? (
                "Unlock Vault"
              ) : mode === "setup" ? (
                "Save & Encrypt"
              ) : (
                "Confirm Disable"
              )}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop bg-black/60" onClick={onClose} />
    </div>
  );
}
