import { useEffect } from "react";
import { X, ExternalLink, ShieldCheck, Cpu, Terminal, Zap, GitBranch } from "lucide-react";
import { BrandLogo } from "@/components/common/BrandLogo";
import { useLayoutStore } from "@/stores/useLayoutStore";

export function AboutModal() {
  const { isAboutModalOpen, setAboutModalOpen } = useLayoutStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isAboutModalOpen) {
        setAboutModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAboutModalOpen, setAboutModalOpen]);

  if (!isAboutModalOpen) return null;

  const handleOpenGithub = () => {
    try {
      window.open("https://github.com/ahmet/haze-ssh", "_blank");
    } catch {
      // Fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={() => setAboutModalOpen(false)}
    >
      <div
        className="bg-base-200 border border-base-300 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Brand Logo & Close */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-base-300/60 bg-base-100/40">
          <div className="flex items-center gap-3">
            <BrandLogo variant="horizontal" size={40} />
            <span className="badge badge-primary badge-sm font-mono font-semibold">
              v0.1.0-alpha
            </span>
          </div>

          <button
            type="button"
            onClick={() => setAboutModalOpen(false)}
            className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-sm">
          <p className="text-base-content/80 leading-relaxed">
            <strong>Haze SSH</strong> is a lightweight, zero-cloud desktop terminal multiplexer,
            SSH client, and hardware UART console built for speed, privacy, and power users.
          </p>

          {/* Pillars Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-base-300/50 border border-base-300 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-xs">100% Local-First</div>
                <div className="text-[11px] text-base-content/60 mt-0.5 leading-tight">
                  Zero telemetry. Secrets encrypted via Argon2id + ChaCha20-Poly1305.
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-base-300/50 border border-base-300 flex items-start gap-2.5">
              <Zap className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-xs">Tauri v2 + Rust Core</div>
                <div className="text-[11px] text-base-content/60 mt-0.5 leading-tight">
                  Sub-50MB RAM footprint with WebGL-accelerated terminal canvas.
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-base-300/50 border border-base-300 flex items-start gap-2.5">
              <Terminal className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-xs">Multiplexer & Panes</div>
                <div className="text-[11px] text-base-content/60 mt-0.5 leading-tight">
                  Binary-tree split panes, multi-tabs, draggable dividers.
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-base-300/50 border border-base-300 flex items-start gap-2.5">
              <Cpu className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-xs">Multi-Protocol Hub</div>
                <div className="text-[11px] text-base-content/60 mt-0.5 leading-tight">
                  SSH (`ssh://`), Serial UART (`serial://`), Telnet (`telnet://`).
                </div>
              </div>
            </div>
          </div>

          {/* Shortcuts Summary */}
          <div className="space-y-1.5 pt-2">
            <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
              Essential Shortcuts
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-base-300/40">
                <span className="text-base-content/70">Command Palette</span>
                <kbd className="kbd kbd-xs">⌘K</kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-base-300/40">
                <span className="text-base-content/70">New Tab</span>
                <kbd className="kbd kbd-xs">⌘T</kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-base-300/40">
                <span className="text-base-content/70">Split Vertically</span>
                <kbd className="kbd kbd-xs">⌘D</kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-base-300/40">
                <span className="text-base-content/70">Close Pane</span>
                <kbd className="kbd kbd-xs">⌘W</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-base-300 bg-base-100/50 flex items-center justify-between text-xs">
          <span className="text-base-content/50">Released under MIT License</span>

          <button
            type="button"
            onClick={handleOpenGithub}
            className="btn btn-ghost btn-xs gap-1.5 text-base-content/70 hover:text-base-content"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>GitHub Repository</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </div>
    </div>
  );
}
