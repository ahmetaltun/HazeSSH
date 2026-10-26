import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { Server, Plus, X, Network, Code2, Lock, Eye, EyeOff } from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import type { Host } from "@/types/host";
import { IdentityModal } from "@/components/identities/IdentityModal";
import { GroupModal } from "@/components/hosts/GroupModal";
import { TextInput } from "@/components/common/TextInput";

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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [authType, setAuthType] = useState<"password" | "identity" | "interactive" | "agent" | "telnet">("password");
  const [identityId, setIdentityId] = useState("");
  const [jumpHostId, setJumpHostId] = useState("");
  const [startupSnippetId, setStartupSnippetId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { hosts, groups, identities, createHost, updateHost } = useHostStore();
  const { snippets, fetchSnippets } = useSnippetStore();

  useEffect(() => {
    if (isOpen) {
      fetchSnippets();
    }
  }, [isOpen, fetchSnippets]);

  const prevOpenRef = useRef(false);
  const prevHostIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isOpening = isOpen && !prevOpenRef.current;
    const isHostChanging = hostToEdit?.id !== prevHostIdRef.current;

    if (isOpen && (isOpening || isHostChanging)) {
      if (hostToEdit) {
        setLabel(hostToEdit.label);
        setHostname(hostToEdit.hostname);
        setPort(hostToEdit.port);
        setUsername(hostToEdit.username || "");
        setPassword("");
        setShowPassword(false);
        setGroupId(hostToEdit.group_id || "");
        setAuthType(
          (hostToEdit.auth_type as "password" | "identity" | "interactive" | "agent" | "telnet") || "password"
        );
        setIdentityId(hostToEdit.identity_id || "");
        setJumpHostId(hostToEdit.jump_host_id || "");
        setStartupSnippetId(hostToEdit.startup_snippet_id || "");
        setTags(hostToEdit.tags || []);
        setColor(hostToEdit.color || PRESET_COLORS[0]);
      } else {
        setLabel("");
        setHostname("");
        setPort(22);
        setUsername("");
        setPassword("");
        setShowPassword(false);
        setGroupId("");
        setAuthType("password");
        setIdentityId("");
        setJumpHostId("");
        setStartupSnippetId("");
        setTags([]);
        setColor(PRESET_COLORS[0]);
      }
      setErrorMsg(null);
    }

    prevOpenRef.current = isOpen;
    prevHostIdRef.current = hostToEdit?.id;
  }, [hostToEdit, isOpen]);

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
    if (isNaN(port) || port < 1 || port > 65535) {
      setErrorMsg("Port must be a valid number between 1 and 65535.");
      return;
    }
    if (authType === "identity" && !identityId.trim()) {
      setErrorMsg("Please select or create a saved credential identity for private key authentication.");
      return;
    }

    setIsSubmitting(true);
    try {
      let effectiveIdentityId: string | undefined = undefined;

      if (authType === "password") {
        if (!hostToEdit && !password.trim()) {
          setErrorMsg("Password is required for password authentication.");
          setIsSubmitting(false);
          return;
        }

        if (password.trim()) {
          const createdIdentity = await useHostStore.getState().createIdentity({
            name: `${label.trim()} (${username.trim() || "ssh"})`,
            identity_type: "password",
            username: username.trim() || undefined,
            secret: password.trim(),
          });
          effectiveIdentityId = createdIdentity.id;
        } else if (hostToEdit) {
          effectiveIdentityId = hostToEdit.identity_id || undefined;
        }
      } else if (authType === "identity") {
        effectiveIdentityId = identityId.trim() || undefined;
      }

      if (hostToEdit) {
        const updated = await updateHost({
          id: hostToEdit.id,
          label: label.trim(),
          hostname: hostname.trim(),
          port,
          username: username.trim() || undefined,
          group_id: groupId.trim() || undefined,
          auth_type: authType,
          identity_id: effectiveIdentityId,
          jump_host_id: jumpHostId.trim() || undefined,
          tags,
          color,
          terminal_theme: hostToEdit.terminal_theme,
          startup_snippet_id: startupSnippetId.trim() || undefined,
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
          identity_id: effectiveIdentityId,
          jump_host_id: jumpHostId.trim() || undefined,
          tags,
          color,
          startup_snippet_id: startupSnippetId.trim() || undefined,
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
                <TextInput
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
                <TextInput
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
                <TextInput
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
                <TextInput
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root, ubuntu..."
                  className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">Protocol / Auth</span>
                </label>
                <select
                  value={authType}
                  onChange={(e) => {
                    const newType = e.target.value as "password" | "identity" | "interactive" | "agent" | "telnet";
                    setAuthType(newType);
                    if (newType === "telnet" && port === 22) {
                      setPort(23);
                    } else if (newType !== "telnet" && port === 23) {
                      setPort(22);
                    }
                  }}
                  className="select select-sm select-bordered w-full bg-base-100 text-xs"
                >
                  <option value="password">SSH (Username & Password)</option>
                  <option value="identity">SSH (Private Key / Identity)</option>
                  <option value="agent">SSH (Local SSH Agent)</option>
                  <option value="interactive">SSH (Prompt on Connect)</option>
                  <option value="telnet">Telnet (Legacy RFC 854)</option>
                </select>
              </div>
            </div>

            {/* Direct Password Input (if auth_type === 'password') */}
            {authType === "password" && (
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                    SSH Password {hostToEdit ? "(Leave blank to keep current)" : "*"}
                  </span>
                </label>
                <div className="relative">
                  <TextInput
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      hostToEdit
                        ? "•••••••••••• (Leave blank to keep current)"
                        : "Enter SSH password..."
                    }
                    className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn btn-ghost btn-xs btn-square absolute right-1.5 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-base-content/50 mt-1">
                  Credentials are encrypted at rest with ChaCha20-Poly1305.
                </span>
              </div>
            )}

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

            {/* Bastion / Jump Host (SSH only) */}
            {authType !== "telnet" && (
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
            )}

            {/* Startup Snippet (Run on Connect) */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-warning" />
                  Startup Snippet (Run on Connect)
                </span>
              </label>
              <select
                value={startupSnippetId}
                onChange={(e) => setStartupSnippetId(e.target.value)}
                className="select select-sm select-bordered w-full bg-base-100 text-xs"
              >
                <option value="">None (Standard Interactive Shell)</option>
                {snippets.map((snip) => (
                  <option key={snip.id} value={snip.id}>
                    {snip.title} {snip.run_on_connect ? "★" : ""}
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
                <TextInput
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
            setAuthType("identity");
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
