import { useState, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Server, Plus, X, Network } from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import type { Host } from "@/types/host";
import { IdentityModal } from "@/components/identities/IdentityModal";
import { GroupModal } from "@/components/hosts/GroupModal";

interface HostModalProps {
  readonly isOpen: boolean;
  readonly hostToEdit?: Host | null;
  readonly onClose: () => void;
  readonly onSaved?: (host: Host) => void;
}

const PRESET_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#8b5cf6", // purple
  "#f59e0b", // yellow
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
];

export function HostModal({ isOpen, hostToEdit, onClose, onSaved }: HostModalProps) {
  const [label, setLabel] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [groupId, setGroupId] = useState("");
  const [authType, setAuthType] = useState<"identity" | "interactive" | "agent">("identity");
  const [identityId, setIdentityId] = useState("");
  const [jumpHostId, setJumpHostId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { hosts, groups, identities, createHost, updateHost } = useHostStore();

  useEffect(() => {
    if (hostToEdit) {
      setLabel(hostToEdit.label);
      setHostname(hostToEdit.hostname);
      setPort(hostToEdit.port);
      setUsername(hostToEdit.username || "");
      setGroupId(hostToEdit.group_id || "");
      setAuthType(hostToEdit.auth_type as "identity" | "interactive" | "agent");
      setIdentityId(hostToEdit.identity_id || "");
      setJumpHostId(hostToEdit.jump_host_id || "");
      setTags(hostToEdit.tags || []);
      setColor(hostToEdit.color || PRESET_COLORS[0]);
    } else {
      setLabel("");
      setHostname("");
      setPort(22);
      setUsername("");
      setGroupId("");
      setAuthType("identity");
      setIdentityId(identities[0]?.id || "");
      setJumpHostId("");
      setTags([]);
      setColor(PRESET_COLORS[0]);
    }
  }, [hostToEdit, isOpen, identities]);

  if (!isOpen) return null;

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = tagInput.trim().replace(/^,+|,+$/g, "");
      if (trimmed && !tags.includes(trimmed)) {
        setTags([...tags, trimmed]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!label.trim()) {
      setErrorMsg("Host label is required.");
      return;
    }
    if (!hostname.trim()) {
      setErrorMsg("Hostname or IP address is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (hostToEdit) {
        const updated = await updateHost({
          id: hostToEdit.id,
          label: label.trim(),
          hostname: hostname.trim(),
          port,
          username: username.trim() || undefined,
          group_id: groupId.trim() || undefined,
          auth_type: authType,
          identity_id: authType === "identity" && identityId.trim() ? identityId : undefined,
          jump_host_id: jumpHostId.trim() || undefined,
          tags,
          color,
          terminal_theme: hostToEdit.terminal_theme,
          startup_snippet_id: hostToEdit.startup_snippet_id,
          created_at: hostToEdit.created_at,
          updated_at: Date.now(),
        });
        onSaved?.(updated);
      } else {
        const created = await createHost({
          label: label.trim(),
          hostname: hostname.trim(),
          port,
          username: username.trim() || undefined,
          group_id: groupId.trim() || undefined,
          auth_type: authType,
          identity_id: authType === "identity" && identityId.trim() ? identityId : undefined,
          jump_host_id: jumpHostId.trim() || undefined,
          tags,
          color,
        });
        onSaved?.(created);
      }

      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="modal modal-open">
        <div className="modal-box bg-base-200 border border-base-300 max-w-lg shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">
                {hostToEdit ? "Edit Host" : "Add SSH Host"}
              </h3>
              <p className="text-xs text-base-content/60">
                Configure connection parameters, jump hosts, and credentials.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="alert alert-error text-xs py-2 px-3 mb-4">
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Label & Group */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Label *</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Production Web"
                  className="input input-sm input-bordered w-full bg-base-100 text-xs"
                  autoFocus
                />
              </div>

              <div className="form-control">
                <div className="flex items-center justify-between">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">Group</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsGroupModalOpen(true)}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="select select-sm select-bordered w-full bg-base-100 text-xs"
                >
                  <option value="">(No Group)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Hostname & Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Hostname or IP *</span>
                </label>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="192.168.1.100 or ec2.aws.com"
                  className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Port</span>
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value, 10) || 22)}
                  className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
                />
              </div>
            </div>

            {/* Username & Auth Method */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Username</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root, ubuntu..."
                  className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Authentication</span>
                </label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as "identity" | "interactive" | "agent")}
                  className="select select-sm select-bordered w-full bg-base-100 text-xs"
                >
                  <option value="identity">Vault Identity</option>
                  <option value="agent">Local SSH Agent</option>
                  <option value="interactive">Prompt on Connect</option>
                </select>
              </div>
            </div>

            {/* Identity Selector (if auth_type === 'identity') */}
            {authType === "identity" && (
              <div className="form-control">
                <div className="flex items-center justify-between">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">Saved Credential Identity</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsIdentityModalOpen(true)}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> New Identity
                  </button>
                </div>
                <select
                  value={identityId}
                  onChange={(e) => setIdentityId(e.target.value)}
                  className="select select-sm select-bordered w-full bg-base-100 text-xs"
                >
                  <option value="">(Select an identity...)</option>
                  {identities.map((id) => (
                    <option key={id.id} value={id.id}>
                      {id.name} ({id.identity_type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bastion / Jump Host */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-secondary" />
                  Jump Host / Bastion (ProxyJump)
                </span>
              </label>
              <select
                value={jumpHostId}
                onChange={(e) => setJumpHostId(e.target.value)}
                className="select select-sm select-bordered w-full bg-base-100 text-xs"
              >
                <option value="">Direct Connection (No Jump Host)</option>
                {hosts
                  .filter((h) => !hostToEdit || h.id !== hostToEdit.id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      via {h.label} ({h.hostname}:{h.port})
                    </option>
                  ))}
              </select>
            </div>

            {/* Tags Input */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold">Tags (Press Enter)</span>
              </label>
              <div className="flex flex-wrap gap-1 p-2 bg-base-100 border border-base-300 rounded-lg min-h-[38px] items-center">
                {tags.map((t) => (
                  <span key={t} className="badge badge-sm badge-neutral gap-1 font-mono text-[10px]">
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-error"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder={tags.length === 0 ? "Add tags (e.g. web, k8s, db)..." : ""}
                  className="input input-xs bg-transparent border-0 focus:outline-hidden flex-1 min-w-[80px] text-xs"
                />
              </div>
            </div>

            {/* Color Marker */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold">Color Marker</span>
              </label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      color === c ? "border-base-content scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

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
                ) : hostToEdit ? (
                  "Save Changes"
                ) : (
                  "Add Host"
                )}
              </button>
            </div>
          </form>
        </div>
        <div className="modal-backdrop bg-black/60" onClick={onClose} />
      </div>

      {/* Sub-modals for inline creation */}
      {isIdentityModalOpen && (
        <IdentityModal
          isOpen={true}
          onClose={() => setIsIdentityModalOpen(false)}
          onCreated={(newId) => {
            setIdentityId(newId);
            setIsIdentityModalOpen(false);
          }}
        />
      )}

      {isGroupModalOpen && (
        <GroupModal
          isOpen={true}
          onClose={() => setIsGroupModalOpen(false)}
          onCreated={(newGroupId) => {
            setGroupId(newGroupId);
            setIsGroupModalOpen(false);
          }}
        />
      )}
    </>
  );
}
