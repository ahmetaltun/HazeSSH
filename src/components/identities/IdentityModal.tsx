import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Copy, Check, Sparkles } from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { api } from "@/services/api";
import type { GeneratedKeyPair } from "@/types/crypto";

interface IdentityModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated?: (identityId: string) => void;
}

export function IdentityModal({ isOpen, onClose, onCreated }: IdentityModalProps) {
  const [tab, setTab] = useState<"password" | "key" | "generate">("password");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  // Key generator state
  const [keyType, setKeyType] = useState<"ed25519" | "rsa">("ed25519");
  const [keyComment, setKeyComment] = useState("");
  const [generatedKey, setGeneratedKey] = useState<GeneratedKeyPair | null>(null);
  const [copied, setCopied] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { createIdentity } = useHostStore();

  if (!isOpen) return null;

  const handleGenerateKey = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const result = await api.keyGenerate(keyType, keyComment.trim() || undefined);
      setGeneratedKey(result);
      setPrivateKey(result.private_key);
      if (!name) {
        setName(`Key (${keyType.toUpperCase()} - ${new Date().toLocaleDateString()})`);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPublicKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey.public_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("Please provide a name for this identity.");
      return;
    }

    let secret = "";
    let identityType: "password" | "key" = "password";

    if (tab === "password") {
      if (!password) {
        setErrorMsg("Please enter the password.");
        return;
      }
      secret = password;
      identityType = "password";
    } else {
      if (!privateKey.trim()) {
        setErrorMsg("Private key cannot be empty.");
        return;
      }
      secret = privateKey;
      identityType = "key";
    }

    setIsSubmitting(true);
    try {
      const created = await createIdentity({
        name: name.trim(),
        identity_type: identityType,
        username: username.trim() || undefined,
        secret,
        passphrase: passphrase.trim() || undefined,
      });

      onCreated?.(created.id);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box bg-base-200 border border-base-300 max-w-lg shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">New Identity</h3>
            <p className="text-xs text-base-content/60">
              Credentials are encrypted at rest with ChaCha20-Poly1305.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="tabs tabs-boxed bg-base-300 p-1 mb-4 grid grid-cols-3">
          <button
            type="button"
            onClick={() => setTab("password")}
            className={`tab text-xs ${tab === "password" ? "tab-active" : ""}`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setTab("key")}
            className={`tab text-xs ${tab === "key" ? "tab-active" : ""}`}
          >
            Import SSH Key
          </button>
          <button
            type="button"
            onClick={() => setTab("generate")}
            className={`tab text-xs ${tab === "generate" ? "tab-active" : ""}`}
          >
            Generate Key
          </button>
        </div>

        {errorMsg && (
          <div className="alert alert-error text-xs py-2 px-3 mb-4">
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-semibold">Identity Label</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Key, Root Password..."
              className="input input-sm input-bordered w-full bg-base-100 text-xs"
              autoFocus
            />
          </div>

          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-semibold">Default Username (Optional)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. root, ubuntu, ec2-user..."
              className="input input-sm input-bordered w-full bg-base-100 text-xs"
            />
          </div>

          {tab === "password" && (
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold">Password</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
              />
            </div>
          )}

          {tab === "key" && (
            <>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Private Key (OpenSSH / PEM)</span>
                </label>
                <textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                  rows={4}
                  className="textarea textarea-bordered w-full bg-base-100 font-mono text-[11px]"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Key Passphrase (Optional)</span>
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Leave empty if key is not encrypted"
                  className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
                />
              </div>
            </>
          )}

          {tab === "generate" && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">Algorithm</span>
                  </label>
                  <select
                    value={keyType}
                    onChange={(e) => setKeyType(e.target.value as "ed25519" | "rsa")}
                    className="select select-sm select-bordered w-full bg-base-100 text-xs"
                  >
                    <option value="ed25519">Ed25519 (Recommended)</option>
                    <option value="rsa">RSA 4096-bit</option>
                  </select>
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">Comment</span>
                  </label>
                  <input
                    type="text"
                    value={keyComment}
                    onChange={(e) => setKeyComment(e.target.value)}
                    placeholder="user@haze-ssh"
                    className="input input-sm input-bordered w-full bg-base-100 text-xs"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateKey}
                disabled={isSubmitting}
                className="btn btn-sm btn-outline btn-primary w-full gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Keypair Now</span>
              </button>

              {generatedKey && (
                <div className="p-3 bg-base-300 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-success flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Keypair Generated Successfully
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPublicKey}
                      className="btn btn-ghost btn-xs gap-1"
                    >
                      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? "Copied!" : "Copy Public Key"}</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-base-content/60 font-mono truncate">
                    Fingerprint: {generatedKey.fingerprint}
                  </div>
                  <p className="text-[11px] text-base-content/70">
                    Add the public key to your remote server's{" "}
                    <code className="text-primary font-mono">~/.ssh/authorized_keys</code> file.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="modal-action mt-6 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-sm btn-ghost border border-base-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-sm btn-primary"
            >
              {isSubmitting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Save to Vault"
              )}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop bg-black/60" onClick={onClose} />
    </div>
  );
}
