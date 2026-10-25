import { useState, useEffect, useRef, type FormEvent } from "react";
import { Network, ArrowRight, ShieldCheck, X, AlertCircle, Laptop, Globe, Server } from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { useTunnelStore } from "@/stores/useTunnelStore";
import type { CreateTunnelInput } from "@/types/tunnel";

interface TunnelModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

export function TunnelModal({ isOpen, onClose, onSaved }: TunnelModalProps) {
  const { hosts } = useHostStore();
  const { createTunnel } = useTunnelStore();

  const [name, setName] = useState("");
  const [hostId, setHostId] = useState("");
  const [tunnelType, setTunnelType] = useState<"local" | "remote" | "dynamic">("local");
  const [localHost, setLocalHost] = useState("127.0.0.1");
  const [localPort, setLocalPort] = useState<number | "">(5432);
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState<number | "">(5432);
  const [autoStart, setAutoStart] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setName("");
      setHostId(hosts[0]?.id || "");
      setTunnelType("local");
      setLocalHost("127.0.0.1");
      setLocalPort(5432);
      setRemoteHost("127.0.0.1");
      setRemotePort(5432);
      setAutoStart(false);
      setErrorMsg(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  // If opened before hosts finished loading and hostId is not set, select first host once available
  useEffect(() => {
    if (isOpen && !hostId && hosts.length > 0) {
      setHostId(hosts[0].id);
    }
  }, [isOpen, hostId, hosts]);

  if (!isOpen) return null;

  const selectedHost = hosts.find((h) => h.id === hostId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("Tunnel name is required");
      return;
    }

    if (!hostId) {
      setErrorMsg("Please select an SSH host to route through");
      return;
    }

    if (!localPort || Number(localPort) < 1 || Number(localPort) > 65535) {
      setErrorMsg("Please provide a valid local port (1 - 65535)");
      return;
    }

    if (tunnelType !== "dynamic") {
      if (!remoteHost.trim()) {
        setErrorMsg("Remote destination host is required");
        return;
      }
      if (!remotePort || Number(remotePort) < 1 || Number(remotePort) > 65535) {
        setErrorMsg("Please provide a valid remote port (1 - 65535)");
        return;
      }
    }

    const payload: CreateTunnelInput = {
      name: name.trim(),
      host_id: hostId,
      tunnel_type: tunnelType,
      local_host: localHost.trim() || "127.0.0.1",
      local_port: Number(localPort),
      remote_host: tunnelType === "dynamic" ? undefined : remoteHost.trim(),
      remote_port: tunnelType === "dynamic" ? undefined : Number(remotePort),
      auto_start: autoStart,
    };

    setIsSubmitting(true);
    try {
      await createTunnel(payload);
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-base-100 border border-base-300 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-200/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Create Port Forwarding Tunnel</h3>
              <p className="text-xs text-base-content/60">
                Forward ports securely over encrypted SSH connections
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="alert alert-error text-xs py-2.5 px-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tunnel Type Selector */}
          <div>
            <label className="text-xs font-semibold text-base-content/70 uppercase tracking-wider block mb-2">
              Tunnel Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTunnelType("local");
                  if (localPort === 1080) setLocalPort(5432);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  tunnelType === "local"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-base-300 hover:border-base-content/30 bg-base-200/40"
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  <span>Local (-L)</span>
                  <span className="badge badge-xs badge-primary">Client</span>
                </div>
                <p className="text-[11px] text-base-content/60 mt-1 line-clamp-2">
                  Access remote DBs or services through a local port.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTunnelType("remote");
                  if (localPort === 1080) setLocalPort(3000);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  tunnelType === "remote"
                    ? "border-secondary bg-secondary/10 text-secondary font-medium"
                    : "border-base-300 hover:border-base-content/30 bg-base-200/40"
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  <span>Remote (-R)</span>
                  <span className="badge badge-xs badge-secondary">Server</span>
                </div>
                <p className="text-[11px] text-base-content/60 mt-1 line-clamp-2">
                  Expose a local port on the remote SSH server.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTunnelType("dynamic");
                  setLocalPort(1080);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  tunnelType === "dynamic"
                    ? "border-accent bg-accent/10 text-accent font-medium"
                    : "border-base-300 hover:border-base-content/30 bg-base-200/40"
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  <span>Dynamic (-D)</span>
                  <span className="badge badge-xs badge-accent">SOCKS5</span>
                </div>
                <p className="text-[11px] text-base-content/60 mt-1 line-clamp-2">
                  Route arbitrary app traffic through SSH SOCKS5 proxy.
                </p>
              </button>
            </div>
          </div>

          {/* Visual Route Preview Banner */}
          <div className="bg-base-200/60 rounded-xl p-3 border border-base-300/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-base-content/80">
              <Laptop className="w-3.5 h-3.5 text-primary" />
              <span>
                {tunnelType === "remote" ? `${remoteHost || "0.0.0.0"}:${remotePort || "???"}` : `${localHost}:${localPort || "???"}`}
              </span>
            </div>

            <div className="flex items-center gap-1 text-base-content/40 text-[11px]">
              <div className="h-px w-6 bg-base-content/30" />
              <ArrowRight className="w-3 h-3 text-base-content/60" />
              <span className="font-sans font-semibold text-primary">
                {selectedHost ? selectedHost.label : "SSH Host"}
              </span>
              <ArrowRight className="w-3 h-3 text-base-content/60" />
              <div className="h-px w-6 bg-base-content/30" />
            </div>

            <div className="flex items-center gap-1.5 text-base-content/80">
              {tunnelType === "dynamic" ? (
                <>
                  <Globe className="w-3.5 h-3.5 text-accent" />
                  <span className="text-accent font-semibold">SOCKS5 Dynamic</span>
                </>
              ) : (
                <>
                  <Server className="w-3.5 h-3.5 text-secondary" />
                  <span>
                    {tunnelType === "remote" ? `${localHost}:${localPort || "???"}` : `${remoteHost}:${remotePort || "???"}`}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Tunnel Name & Host */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-base-content/70 uppercase tracking-wider block mb-1.5">
                Tunnel Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Postgres Staging, K8s Proxy"
                className="input input-bordered input-sm w-full rounded-xl bg-base-100"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-base-content/70 uppercase tracking-wider block mb-1.5">
                SSH Target Host
              </label>
              <select
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
                className="select select-bordered select-sm w-full rounded-xl bg-base-100"
                required
              >
                {hosts.length === 0 ? (
                  <option value="" disabled>
                    No hosts configured yet
                  </option>
                ) : (
                  hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label} ({h.hostname}:{h.port})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Local Binding */}
          <div className="p-4 rounded-xl bg-base-200/30 border border-base-200 space-y-3">
            <div className="text-xs font-bold text-base-content/80 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-primary" />
              <span>Local Machine Configuration</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] text-base-content/60 block mb-1">
                  Bind Interface
                </label>
                <input
                  type="text"
                  value={localHost}
                  onChange={(e) => setLocalHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="input input-bordered input-sm w-full rounded-lg font-mono text-xs bg-base-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-base-content/60 block mb-1">
                  Local Port
                </label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="5432"
                  min="1"
                  max="65535"
                  className="input input-bordered input-sm w-full rounded-lg font-mono text-xs bg-base-100"
                  required
                />
              </div>
            </div>
          </div>

          {/* Remote Target (Hidden if dynamic SOCKS5) */}
          {tunnelType !== "dynamic" && (
            <div className="p-4 rounded-xl bg-base-200/30 border border-base-200 space-y-3">
              <div className="text-xs font-bold text-base-content/80 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-secondary" />
                <span>
                  {tunnelType === "local" ? "Remote Destination" : "Remote Server Listener"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] text-base-content/60 block mb-1">
                    {tunnelType === "local" ? "Remote Host / IP" : "Remote Bind Address"}
                  </label>
                  <input
                    type="text"
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.target.value)}
                    placeholder={tunnelType === "local" ? "127.0.0.1 or db.internal" : "0.0.0.0"}
                    className="input input-bordered input-sm w-full rounded-lg font-mono text-xs bg-base-100"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-base-content/60 block mb-1">
                    Remote Port
                  </label>
                  <input
                    type="number"
                    value={remotePort}
                    onChange={(e) => setRemotePort(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="5432"
                    min="1"
                    max="65535"
                    className="input input-bordered input-sm w-full rounded-lg font-mono text-xs bg-base-100"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Auto-start Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-base-200/30 border border-base-200">
            <div>
              <div className="text-xs font-semibold">Auto-Start Tunnel</div>
              <div className="text-[11px] text-base-content/60">
                Automatically establish this tunnel when opening Haze SSH
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="toggle toggle-primary toggle-sm"
            />
          </div>
        </form>

        {/* Modal Actions */}
        <div className="px-6 py-4 border-t border-base-200 flex items-center justify-end gap-3 bg-base-200/20">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-sm btn-primary gap-1.5"
            disabled={isSubmitting || hosts.length === 0}
          >
            {isSubmitting ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span>Save Tunnel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
