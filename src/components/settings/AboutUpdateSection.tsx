import { useState, useEffect } from "react";
import {
  Sparkles,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  Terminal,
  Zap,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  updateService,
  type UpdateStatus,
  type UpdateInfo,
  type UpdateProgress,
} from "@/services/updateService";

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const APP_VERSION = "0.4.0";
const GITHUB_REPO_URL = "https://github.com/ahmetaltun/HazeSSH";

export function AboutUpdateSection() {
  const [status, setStatus] = useState<UpdateStatus>(updateService.getStatus());
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(updateService.getUpdateInfo());
  const [progress, setProgress] = useState<UpdateProgress>(updateService.getProgress());
  const [errorMessage, setErrorMessage] = useState<string | null>(updateService.getErrorMessage());
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = updateService.subscribe((newStatus, newInfo, newProgress, newError) => {
      setStatus(newStatus);
      if (newInfo !== undefined) setUpdateInfo(newInfo || null);
      if (newProgress !== undefined) setProgress(newProgress);
      setErrorMessage(newError || null);
      setIsChecking(newStatus === "checking");
      setIsInstalling(newStatus === "downloading");
    });
    return unsubscribe;
  }, []);

  const handleCheckForUpdates = async () => {
    try {
      await updateService.checkForUpdates(false);
    } catch {
      // error handled in service
    }
  };

  const handleDownloadAndInstall = async () => {
    try {
      await updateService.downloadAndInstall();
    } catch {
      // error handled in service
    }
  };

  const handleRestart = async () => {
    try {
      await updateService.restartAndApply();
    } catch {
      // error handled in service
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-base-content flex items-center gap-2">
              About & Updates
              <span className="badge badge-sm badge-outline font-mono text-xs">
                v{APP_VERSION}
              </span>
            </h3>
            <p className="text-xs text-base-content/60">
              Application version, cryptographic update pipeline, and project links
            </p>
          </div>
        </div>

        <button
          onClick={handleCheckForUpdates}
          disabled={isChecking || isInstalling}
          className="btn btn-sm btn-outline border-base-300 gap-2 hover:bg-base-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
          {isChecking ? "Checking..." : "Check for Updates"}
        </button>
      </div>

      {/* Update Status Card */}
      <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-4">
        {status === "idle" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-base-content/30" />
              <div>
                <p className="text-sm font-medium text-base-content">
                  Running Haze SSH v{APP_VERSION}
                </p>
                <p className="text-xs text-base-content/50">
                  Updates are signed with Ed25519 and verified before installation
                </p>
              </div>
            </div>
            <button
              onClick={handleCheckForUpdates}
              className="btn btn-xs btn-ghost text-primary"
            >
              Check now
            </button>
          </div>
        )}

        {status === "checking" && (
          <div className="flex items-center gap-3 py-1">
            <RefreshCw className="w-4 h-4 text-primary animate-spin" />
            <p className="text-sm text-base-content/80">
              Querying GitHub Releases for signed update artifacts...
            </p>
          </div>
        )}

        {status === "up-to-date" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <div>
                <p className="text-sm font-medium text-base-content flex items-center gap-2">
                  You are up to date!
                  <span className="badge badge-xs badge-success text-[10px]">Latest</span>
                </p>
                <p className="text-xs text-base-content/50">
                  Haze SSH v{APP_VERSION} is the newest verified version available.
                </p>
              </div>
            </div>
            <button
              onClick={handleCheckForUpdates}
              className="btn btn-xs btn-ghost text-base-content/60"
            >
              Re-check
            </button>
          </div>
        )}

        {status === "available" && updateInfo && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-warning/10 text-warning">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-base-content">
                      Update Available: v{updateInfo.version}
                    </span>
                    <span className="badge badge-xs badge-warning">New</span>
                  </div>
                  <p className="text-xs text-base-content/50">
                    Current: v{APP_VERSION} → New: v{updateInfo.version}
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadAndInstall}
                className="btn btn-sm btn-primary gap-1.5 shadow-xs"
              >
                <Download className="w-4 h-4" />
                Download & Install
              </button>
            </div>

            {updateInfo.body && (
              <div className="p-3 rounded-lg bg-base-200/70 border border-base-300 max-h-36 overflow-y-auto">
                <p className="text-xs font-semibold text-base-content/80 mb-1">
                  Release Notes:
                </p>
                <div className="text-xs text-base-content/70 whitespace-pre-wrap font-sans leading-relaxed">
                  {updateInfo.body}
                </div>
              </div>
            )}
          </div>
        )}

        {status === "downloading" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-base-content font-medium flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-primary animate-bounce" />
                Downloading update bundle...
              </span>
              <span className="font-mono text-primary font-bold">
                {progress.percentage}%
              </span>
            </div>
            <div className="w-full bg-base-300 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            {progress.totalBytes > 0 && (
              <p className="text-[11px] text-base-content/50 text-right font-mono">
                {(progress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB /{" "}
                {(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>
        )}

        {status === "downloaded" && (
          <div className="flex items-center justify-between p-1">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <div>
                <p className="text-sm font-semibold text-base-content">
                  Update Downloaded & Verified!
                </p>
                <p className="text-xs text-base-content/50">
                  Signature verified. Restart Haze SSH to apply update.
                </p>
              </div>
            </div>
            <button
              onClick={handleRestart}
              className="btn btn-sm btn-success gap-2 shadow-xs text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart & Apply
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error shrink-0" />
              <div>
                <p className="text-sm font-semibold text-error">
                  Update Check Failed
                </p>
                <p className="text-xs text-base-content/60">
                  {errorMessage || "Unable to reach update server. Check your network connection."}
                </p>
              </div>
            </div>
            <button
              onClick={handleCheckForUpdates}
              className="btn btn-xs btn-outline border-base-300"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Security & Project Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-base-100 border border-base-300 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success/10 text-success">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-base-content">Developer ID Signed</p>
            <p className="text-[11px] text-base-content/50">Apple Notarized & Hardened</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-base-100 border border-base-300 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-info/10 text-info">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-base-content">Minisign Verified</p>
            <p className="text-[11px] text-base-content/50">Ed25519 Tamper-Proof</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-base-100 border border-base-300 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10 text-warning">
            <GitHubIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-base-content">100% Open Source</p>
            <p className="text-[11px] text-base-content/50">MIT Licensed</p>
          </div>
        </div>
      </div>

      {/* External Links */}
      <div className="flex flex-wrap items-center justify-between pt-2 border-t border-base-300/70 text-xs text-base-content/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleOpenLink(GITHUB_REPO_URL)}
            className="hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <GitHubIcon className="w-3.5 h-3.5" />
            GitHub Repository
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleOpenLink(`${GITHUB_REPO_URL}/releases`)}
            className="hover:text-primary transition-colors flex items-center gap-1.5"
          >
            Changelog & Releases
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleOpenLink(`${GITHUB_REPO_URL}/issues`)}
            className="hover:text-primary transition-colors flex items-center gap-1.5"
          >
            Report an Issue
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <p className="text-[11px] text-base-content/40">
          Built with Tauri v2 & Rust
        </p>
      </div>
    </section>
  );
}
