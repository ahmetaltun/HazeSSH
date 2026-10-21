import { useState, type FormEvent } from "react";
import { Network, Terminal, X, AlertCircle, Globe } from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import type { TelnetConnectOptions } from "@/types/telnet";

interface TelnetConnectModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const COMMON_TERMINAL_TYPES = [
  "xterm-256color",
  "vt100",
  "ansi",
  "xterm",
  "linux",
] as const;

export function TelnetConnectModal({ isOpen, onClose }: TelnetConnectModalProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(23);
  const [terminalType, setTerminalType] = useState("xterm-256color");
  const [error, setError] = useState<string | null>(null);

  const { openTab } = useMultiplexerStore();

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedHost = host.trim();
    if (!trimmedHost) {
      setError("Host address or IP is required.");
      return;
    }

    if (isNaN(port) || port < 1 || port > 65535) {
      setError("Port must be between 1 and 65535.");
      return;
    }

    const telnetOptions: TelnetConnectOptions = {
      host: trimmedHost,
      port,
      terminal_type: terminalType,
    };

    openTab(
      {
        title: `Telnet: ${trimmedHost}:${port}`,
        connectionType: "telnet",
        hostname: trimmedHost,
        port,
        telnetOptions,
        status: "connecting",
      },
      `Telnet: ${trimmedHost}`
    );

    onClose();
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md bg-base-100 border border-base-300 shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-base-200">
          <div className="flex items-center gap-2 text-info">
            <Network className="w-5 h-5" />
            <h3 className="font-bold text-base text-base-content">
              Connect via Telnet
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-square"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="alert alert-error text-xs py-2 mt-4 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5 mb-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Host or IP Address</span>
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. 192.168.1.1 or router.lan"
                className="input input-sm input-bordered w-full font-mono text-xs"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-base-content/80 block mb-1.5">
                Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1}
                max={65535}
                className="input input-sm input-bordered w-full font-mono text-xs"
                required
              />
            </div>
          </div>

          {/* Quick Port Pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-base-content/50 uppercase font-bold">
              Presets:
            </span>
            <button
              type="button"
              onClick={() => setPort(23)}
              className={`badge badge-xs cursor-pointer ${
                port === 23 ? "badge-primary" : "badge-ghost"
              }`}
            >
              23 (Standard)
            </button>
            <button
              type="button"
              onClick={() => setPort(2323)}
              className={`badge badge-xs cursor-pointer ${
                port === 2323 ? "badge-primary" : "badge-ghost"
              }`}
            >
              2323 (Alt)
            </button>
            <button
              type="button"
              onClick={() => setPort(9999)}
              className={`badge badge-xs cursor-pointer ${
                port === 9999 ? "badge-primary" : "badge-ghost"
              }`}
            >
              9999 (Console)
            </button>
          </div>

          {/* Terminal Emulation Type */}
          <div>
            <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5 mb-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>Emulation Type (RFC 1091)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_TERMINAL_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerminalType(t)}
                  className={`btn btn-xs font-mono text-[11px] ${
                    terminalType === t ? "btn-primary" : "btn-ghost border border-base-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* RFC Notice */}
          <div className="p-2.5 rounded-lg bg-base-200/40 border border-base-300 text-[11px] text-base-content/60 leading-relaxed">
            RFC 854 full-duplex negotiation with automatic NAWS window size synchronization and suppress go-ahead handling.
          </div>

          {/* Modal Actions */}
          <div className="modal-action border-t border-base-200 pt-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary text-xs gap-1.5"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Connect Telnet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
