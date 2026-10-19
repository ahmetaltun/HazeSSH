import {
  Terminal,
  Server,
  Network,
  ShieldCheck,
  Plus,
  ArrowRight,
} from "lucide-react";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";

export function EmptyWorkspace() {
  const { openTab } = useMultiplexerStore();
  const { setView } = useLayoutStore();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-base-100 select-none overflow-y-auto">
      <div className="max-w-2xl w-full flex flex-col items-center text-center space-y-6">
        {/* Hero Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-primary-content shadow-xl">
          <Terminal className="w-8 h-8" />
        </div>

        {/* Title & Tagline */}
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Haze SSH</h1>
          <p className="text-sm text-base-content/70 max-w-md mx-auto">
            A high-performance, privacy-first SSH client and terminal workspace.
            Zero cloud tracking, zero accounts, 100% stored on your device.
          </p>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-4">
          <button
            type="button"
            onClick={() => openTab({ title: "Local Terminal", status: "idle" })}
            className="flex items-center gap-4 p-4 rounded-xl border border-base-300 bg-base-200/60 hover:bg-base-200 hover:border-primary/50 text-left transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">New Local Session</div>
              <div className="text-xs text-base-content/60">
                Launch a fast local terminal session
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-base-content/30 group-hover:text-primary transition-colors" />
          </button>

          <button
            type="button"
            onClick={() => setView("hosts")}
            className="flex items-center gap-4 p-4 rounded-xl border border-base-300 bg-base-200/60 hover:bg-base-200 hover:border-primary/50 text-left transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Server className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Host Manager</div>
              <div className="text-xs text-base-content/60">
                Configure remote servers and groups
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-base-content/30 group-hover:text-secondary transition-colors" />
          </button>

          <button
            type="button"
            onClick={() => setView("tunnels")}
            className="flex items-center gap-4 p-4 rounded-xl border border-base-300 bg-base-200/60 hover:bg-base-200 hover:border-primary/50 text-left transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Network className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Port Forwarding</div>
              <div className="text-xs text-base-content/60">
                Create Local, Remote, or SOCKS5 tunnels
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-base-content/30 group-hover:text-accent transition-colors" />
          </button>

          <button
            type="button"
            onClick={() => setView("settings")}
            className="flex items-center gap-4 p-4 rounded-xl border border-base-300 bg-base-200/60 hover:bg-base-200 hover:border-primary/50 text-left transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Vault & Importers</div>
              <div className="text-xs text-base-content/60">
                Import ~/.ssh/config or Termius data
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-base-content/30 group-hover:text-info transition-colors" />
          </button>
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2 text-xs text-base-content/50 pt-4">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>Local SQLite Vault • Encrypted with Argon2id + ChaCha20</span>
        </div>
      </div>
    </div>
  );
}
