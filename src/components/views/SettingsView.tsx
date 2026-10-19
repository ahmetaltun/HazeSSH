import {
  ShieldCheck,
  Lock,
  Download,
  Upload,
  HardDrive,
} from "lucide-react";
import { useLayoutStore } from "@/stores/useLayoutStore";

export function SettingsView() {
  const { hasMasterPassword, setHasMasterPassword, isVaultLocked, setVaultLocked } =
    useLayoutStore();

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div>
          <h2 className="text-base font-bold">Settings & Vault Security</h2>
          <p className="text-xs text-base-content/60">
            Privacy controls, master encryption passphrase, importers, and backups
          </p>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-6 max-w-4xl">
        {/* Security & Vault Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Security & Local Encryption Vault</h3>
              <p className="text-xs text-base-content/60">
                All host credentials, private keys, and passwords are encrypted locally.
              </p>
            </div>
          </div>

          <div className="divider my-1"></div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold">Master Password Protection</span>
              <p className="text-[11px] text-base-content/60 max-w-lg">
                Require a master passphrase when launching Haze SSH to derive an Argon2id key.
                If disabled, Haze uses your local device-key / OS Keychain for zero-friction security.
              </p>
            </div>

            <input
              type="checkbox"
              checked={hasMasterPassword}
              onChange={(e) => setHasMasterPassword(e.target.checked)}
              className="toggle toggle-primary toggle-sm"
            />
          </div>

          {hasMasterPassword && (
            <div className="p-3 bg-base-300/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/80">Vault Status:</span>
                <span className={`badge badge-sm ${isVaultLocked ? "badge-warning" : "badge-success"}`}>
                  {isVaultLocked ? "Locked" : "Unlocked"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setVaultLocked(!isVaultLocked)}
                className="btn btn-sm btn-outline btn-warning w-full"
              >
                <Lock className="w-3.5 h-3.5 mr-1" />
                {isVaultLocked ? "Unlock Vault Now" : "Lock Vault Immediately"}
              </button>
            </div>
          )}
        </section>

        {/* Data Importers Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Import Data from Other Clients</h3>
              <p className="text-xs text-base-content/60">
                Migrate smoothly from OpenSSH, Termius, or PuTTY with safe diff preview.
              </p>
            </div>
          </div>

          <div className="divider my-1"></div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-base-300 bg-base-100 flex flex-col justify-between space-y-3">
              <div>
                <span className="font-semibold text-xs font-mono">~/.ssh/config</span>
                <p className="text-[11px] text-base-content/60 mt-1">
                  Secure read-only parse of your system SSH config and known_hosts.
                </p>
              </div>
              <button type="button" className="btn btn-xs btn-outline btn-primary">
                Import from OpenSSH
              </button>
            </div>

            <div className="p-4 rounded-xl border border-base-300 bg-base-100 flex flex-col justify-between space-y-3">
              <div>
                <span className="font-semibold text-xs">Termius JSON</span>
                <p className="text-[11px] text-base-content/60 mt-1">
                  Import exported Termius hosts, snippets, and connection groups.
                </p>
              </div>
              <button type="button" className="btn btn-xs btn-outline btn-secondary">
                Import Termius Export
              </button>
            </div>

            <div className="p-4 rounded-xl border border-base-300 bg-base-100 flex flex-col justify-between space-y-3">
              <div>
                <span className="font-semibold text-xs">PuTTY Sessions</span>
                <p className="text-[11px] text-base-content/60 mt-1">
                  Import saved sessions from Windows Registry or .reg export.
                </p>
              </div>
              <button type="button" className="btn btn-xs btn-outline btn-accent">
                Import PuTTY
              </button>
            </div>
          </div>
        </section>

        {/* Backup & Portability Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Backup & Portability</h3>
              <p className="text-xs text-base-content/60">
                Export and restore full encrypted backups of all your configurations.
              </p>
            </div>
          </div>

          <div className="divider my-1"></div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" className="btn btn-sm btn-primary flex-1 gap-2">
              <Download className="w-4 h-4" />
              <span>Export Encrypted Backup (.haze)</span>
            </button>
            <button type="button" className="btn btn-sm btn-ghost border border-base-300 flex-1 gap-2">
              <Upload className="w-4 h-4" />
              <span>Restore from Backup File</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
