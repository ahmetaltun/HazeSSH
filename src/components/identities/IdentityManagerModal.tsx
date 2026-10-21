import { useState, useMemo } from "react";
import {
  KeyRound,
  Lock,
  Trash2,
  Plus,
  Search,
  Server,
  Calendar,
  User,
  X,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import type { Identity } from "@/types/host";
import { IdentityModal } from "@/components/identities/IdentityModal";

interface IdentityManagerModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function IdentityManagerModal({ isOpen, onClose }: IdentityManagerModalProps) {
  const { identities, hosts, deleteIdentity } = useHostStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [identityToDelete, setIdentityToDelete] = useState<Identity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredIdentities = useMemo(() => {
    if (!searchTerm.trim()) return identities;
    const q = searchTerm.toLowerCase();
    return identities.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        item.identity_type.toLowerCase().includes(q)
    );
  }, [identities, searchTerm]);

  if (!isOpen) return null;

  // Find hosts associated with a given identity
  const getLinkedHosts = (identityId: string) => {
    return hosts.filter((h) => h.identity_id === identityId);
  };

  const handleDeleteConfirm = async () => {
    if (!identityToDelete) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await deleteIdentity(identityToDelete.id);
      setIdentityToDelete(null);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : `Failed to delete identity: ${String(err)}`
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const linkedHostsForDelete = identityToDelete ? getLinkedHosts(identityToDelete.id) : [];

  return (
    <>
      <div className="modal modal-open z-40">
        <div className="modal-box bg-base-200 border border-base-300 max-w-2xl shadow-2xl flex flex-col max-h-[85vh] p-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-base-300 flex items-center justify-between bg-base-300/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/15 text-warning flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-base-content">
                    Vault Credentials & Identities
                  </h3>
                  <span className="badge badge-sm badge-neutral font-mono">
                    {identities.length}
                  </span>
                </div>
                <p className="text-xs text-base-content/60">
                  Manage encrypted SSH private keys and passwords stored inside your vault.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost btn-circle text-base-content/60 hover:text-base-content"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search & Actions Bar */}
          <div className="px-6 py-3 border-b border-base-300 flex items-center gap-3 bg-base-100/50">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search credentials by label, user, or type..."
                className="input input-sm input-bordered w-full pl-9 bg-base-100 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn btn-sm btn-primary gap-1.5 text-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Credential</span>
            </button>
          </div>

          {/* Error Message Notification */}
          {actionError && (
            <div className="mx-6 mt-3 alert alert-error text-xs py-2 px-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Credentials List */}
          <div className="flex-1 p-6 overflow-y-auto space-y-2.5">
            {filteredIdentities.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-base-300 rounded-xl bg-base-100/40">
                <KeyRound className="w-10 h-10 mx-auto text-base-content/25 mb-3" />
                <h4 className="text-sm font-semibold text-base-content/75 mb-1">
                  {searchTerm ? "No matching credentials found" : "No vault credentials yet"}
                </h4>
                <p className="text-xs text-base-content/50 max-w-sm mx-auto mb-4">
                  {searchTerm
                    ? "Try adjusting your search keywords."
                    : "Add reusable SSH private keys or host passwords to encrypt and securely store them in your vault."}
                </p>
                {!searchTerm && (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="btn btn-sm btn-outline btn-primary gap-1.5 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Your First Identity</span>
                  </button>
                )}
              </div>
            ) : (
              filteredIdentities.map((identity) => {
                const linkedHosts = getLinkedHosts(identity.id);
                const isKey = identity.identity_type === "key";
                const isPassword = identity.identity_type === "password";

                return (
                  <div
                    key={identity.id}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-base-300 bg-base-100/70 hover:bg-base-100 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isKey
                            ? "bg-primary/10 text-primary"
                            : isPassword
                            ? "bg-secondary/10 text-secondary"
                            : "bg-accent/10 text-accent"
                        }`}
                        title={isKey ? "SSH Key" : isPassword ? "Password" : "Certificate"}
                      >
                        {isKey ? (
                          <KeyRound className="w-4 h-4" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-base-content truncate">
                            {identity.name}
                          </span>
                          <span
                            className={`badge badge-xs uppercase font-mono tracking-wider ${
                              isKey
                                ? "badge-primary badge-outline"
                                : "badge-secondary badge-outline"
                            }`}
                          >
                            {identity.identity_type}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-base-content/60">
                          {identity.username ? (
                            <span className="flex items-center gap-1 font-mono">
                              <User className="w-3 h-3 opacity-60" />
                              <span>{identity.username}</span>
                            </span>
                          ) : (
                            <span className="opacity-40 italic">No default user</span>
                          )}

                          <span className="flex items-center gap-1">
                            <Server className="w-3 h-3 opacity-60" />
                            <span>
                              {linkedHosts.length === 0
                                ? "Unassigned"
                                : `${linkedHosts.length} host${
                                    linkedHosts.length > 1 ? "s" : ""
                                  }`}
                            </span>
                          </span>

                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 opacity-60" />
                            <span>
                              {new Date(identity.created_at * 1000).toLocaleDateString()}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setIdentityToDelete(identity);
                        }}
                        className="btn btn-sm btn-ghost btn-square text-error/70 hover:text-error hover:bg-error/10"
                        title={`Delete ${identity.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-base-300 flex items-center justify-between text-xs text-base-content/60 bg-base-300/20">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-success" />
              <span>All secrets encrypted with Argon2id + ChaCha20-Poly1305</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {identityToDelete && (
        <div className="modal modal-open z-50">
          <div className="modal-box bg-base-200 border border-error/30 max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-error/15 text-error flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-base-content">
                  Delete Vault Credential?
                </h3>
                <p className="text-xs text-base-content/60">
                  This action permanently removes the secret from the encrypted vault.
                </p>
              </div>
            </div>

            <div className="p-3 bg-base-100 rounded-xl border border-base-300 text-xs mb-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-base-content/60">Label:</span>
                <span className="font-semibold text-base-content font-mono">
                  {identityToDelete.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Type:</span>
                <span className="capitalize font-mono text-base-content">
                  {identityToDelete.identity_type}
                </span>
              </div>
              {identityToDelete.username && (
                <div className="flex justify-between">
                  <span className="text-base-content/60">Default Username:</span>
                  <span className="font-mono text-base-content">
                    {identityToDelete.username}
                  </span>
                </div>
              )}
            </div>

            {linkedHostsForDelete.length > 0 ? (
              <div className="alert alert-warning text-xs py-2 px-3 mb-4 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Warning: Used by {linkedHostsForDelete.length} host
                    {linkedHostsForDelete.length > 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 pl-5">
                  Deleting this identity will detach authentication from:{" "}
                  <span className="font-semibold">
                    {linkedHostsForDelete.map((h) => h.label).join(", ")}
                  </span>
                  .
                </p>
              </div>
            ) : (
              <p className="text-xs text-base-content/70 mb-4">
                No hosts are currently using this credential. It is safe to remove.
              </p>
            )}

            <div className="modal-action mt-0">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIdentityToDelete(null)}
                className="btn btn-sm btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="btn btn-sm btn-error text-white gap-1.5"
              >
                {isDeleting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {isCreateModalOpen && (
        <IdentityModal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}
    </>
  );
}
