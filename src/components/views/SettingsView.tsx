import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Lock,
  Download,
  Upload,
  HardDrive,
  KeyRound,
  Terminal,
  RotateCcw,
  Highlighter,
  Plus,
  Trash2,
  FileText,
  FolderOpen,
  Video,
  Zap,
  Bell,
  Volume2,
  Send,
  Play,
} from "lucide-react";
import { api } from "@/services/api";
import { useVaultStore } from "@/stores/useVaultStore";
import { useHostStore } from "@/stores/useHostStore";
import { useTerminalSettingsStore, POPULAR_TERMINAL_FONTS } from "@/stores/useTerminalSettingsStore";
import { useTriggerStore } from "@/stores/useTriggerStore";
import { audioAlert, type TriggerMatchType, type TriggerActionType } from "@/services/terminalTriggerEngine";
import { applyOpacity } from "@/services/keywordHighlightService";
import { TERMINAL_THEME_OPTIONS } from "@/services/terminalThemes";
import { terminalSessionManager } from "@/services/terminalSessionManager";
import { VaultModal } from "@/components/vault/VaultModal";
import { IdentityManagerModal } from "@/components/identities/IdentityManagerModal";
import { ExportBackupModal } from "@/components/settings/ExportBackupModal";
import { RestoreBackupModal } from "@/components/settings/RestoreBackupModal";
import { OpenSshImportModal } from "@/components/settings/OpenSshImportModal";
import { TermiusImportModal } from "@/components/settings/TermiusImportModal";
import { PuttyImportModal } from "@/components/settings/PuttyImportModal";
import { AiSettingsSection } from "@/components/settings/AiSettingsSection";
import { SyncSettingsSection } from "@/components/settings/SyncSettingsSection";
import { AboutUpdateSection } from "@/components/settings/AboutUpdateSection";

export function SettingsView() {
  const { hasMasterPassword, isLocked, lock } = useVaultStore();
  const { identities } = useHostStore();
  const {
    fontFamily,
    fontSize,
    lineHeight,
    cursorStyle,
    cursorBlink,
    scrollback,
    gpuAcceleration,
    terminalTheme,
    keywordHighlightEnabled,
    highlightStyle,
    highlightBoxOpacity,
    highlightRules,
    globalAuditLogEnabled,
    auditLogWithTimestamps,
    auditLogStripAnsi,
    setFontFamily,
    setFontSize,
    setLineHeight,
    setCursorStyle,
    setCursorBlink,
    setScrollback,
    setGpuAcceleration,
    setTerminalTheme,
    setKeywordHighlightEnabled,
    setHighlightStyle,
    setHighlightBoxOpacity,
    setGlobalAuditLogEnabled,
    setAuditLogWithTimestamps,
    setAuditLogStripAnsi,
    toggleHighlightRule,
    addHighlightRule,
    deleteHighlightRule,
    resetToDefaults,
  } = useTerminalSettingsStore();

  const [paths, setPaths] = useState<{ logsDir: string; recordingsDir: string } | null>(null);

  useEffect(() => {
    api.auditLogGetPaths().then(setPaths).catch(() => {});
  }, []);

  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleColor, setNewRuleColor] = useState("#ef4444");
  const [isAddingRule, setIsAddingRule] = useState(false);

  // Trigger Store & State
  const {
    triggersEnabled,
    rules: triggerRules,
    setTriggersEnabled,
    addRule: addTriggerRule,
    toggleRule: toggleTriggerRule,
    deleteRule: deleteTriggerRule,
    resetToDefaults: resetTriggerDefaults,
  } = useTriggerStore();

  const [isAddingTrigger, setIsAddingTrigger] = useState(false);
  const [newTriggerName, setNewTriggerName] = useState("");
  const [newTriggerPattern, setNewTriggerPattern] = useState("");
  const [newTriggerMatchType, setNewTriggerMatchType] = useState<TriggerMatchType>("contains");
  const [newTriggerCaseSensitive, setNewTriggerCaseSensitive] = useState(false);
  const [newTriggerOneShot, setNewTriggerOneShot] = useState(false);
  const [newTriggerCooldown, setNewTriggerCooldown] = useState(5);
  const [newTriggerActionType, setNewTriggerActionType] = useState<TriggerActionType>("sound");
  const [newTriggerSendText, setNewTriggerSendText] = useState("");
  const [newTriggerNotificationTitle, setNewTriggerNotificationTitle] = useState("");
  const [newTriggerNotificationMsg, setNewTriggerNotificationMsg] = useState("");
  const [newTriggerSoundType, setNewTriggerSoundType] = useState<"bell" | "chime" | "warning">("bell");

  const handleCreateTrigger = () => {
    if (!newTriggerName.trim() || !newTriggerPattern.trim()) return;

    let action;
    if (newTriggerActionType === "sendText") {
      action = { type: "sendText" as const, text: newTriggerSendText };
    } else if (newTriggerActionType === "notification") {
      action = {
        type: "notification" as const,
        title: newTriggerNotificationTitle || newTriggerName,
        message: newTriggerNotificationMsg || `Trigger '${newTriggerName}' matched.`,
      };
    } else {
      action = {
        type: "sound" as const,
        soundType: newTriggerSoundType,
      };
    }

    addTriggerRule({
      name: newTriggerName.trim(),
      pattern: newTriggerPattern.trim(),
      matchType: newTriggerMatchType,
      caseSensitive: newTriggerCaseSensitive,
      scope: "global",
      enabled: true,
      oneShot: newTriggerOneShot,
      cooldownSeconds: Math.max(1, newTriggerCooldown),
      action,
    });

    setNewTriggerName("");
    setNewTriggerPattern("");
    setNewTriggerSendText("");
    setNewTriggerNotificationTitle("");
    setNewTriggerNotificationMsg("");
    setIsAddingTrigger(false);
  };

  const [modalMode, setModalMode] = useState<"unlock" | "setup" | "disable" | null>(null);
  const [isIdentityManagerOpen, setIsIdentityManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isOpenSshModalOpen, setIsOpenSshModalOpen] = useState(false);
  const [isTermiusModalOpen, setIsTermiusModalOpen] = useState(false);
  const [isPuttyModalOpen, setIsPuttyModalOpen] = useState(false);

  const handleToggle = () => {
    if (hasMasterPassword) {
      if (isLocked) {
        setModalMode("unlock");
        return;
      }
      setModalMode("disable");
    } else {
      setModalMode("setup");
    }
  };

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

      <div className="flex-1 w-full p-6 overflow-y-auto space-y-6">
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
              onChange={handleToggle}
              className="toggle toggle-primary toggle-sm"
            />
          </div>

          {hasMasterPassword && (
            <div className="p-3 bg-base-300/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/80">Vault Status:</span>
                <span className={`badge badge-sm ${isLocked ? "badge-warning" : "badge-success"}`}>
                  {isLocked ? "Locked" : "Unlocked"}
                </span>
              </div>

              {isLocked ? (
                <button
                  type="button"
                  onClick={() => setModalMode("unlock")}
                  className="btn btn-sm btn-primary w-full gap-2"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Unlock Vault with Master Password</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => lock()}
                  className="btn btn-sm btn-outline btn-warning w-full gap-2"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock Vault Immediately</span>
                </button>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-base-300">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold">Vault Credentials</span>
              <p className="text-[11px] text-base-content/60">
                View, add, or permanently delete encrypted SSH keys and passwords stored in the vault.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                if (hasMasterPassword && isLocked) {
                  const unlocked = await useVaultStore.getState().requestUnlock("manage stored vault credentials");
                  if (!unlocked) return;
                }
                setIsIdentityManagerOpen(true);
              }}
              className="btn btn-sm btn-outline gap-1.5 text-xs"
            >
              <KeyRound className="w-3.5 h-3.5 text-warning" />
              <span>Manage Credentials ({identities.length})</span>
            </button>
          </div>
        </section>

        {/* Terminal Appearance & Typography Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Terminal Appearance & Typography</h3>
                <p className="text-xs text-base-content/60">
                  Fonts, line height, cursor behavior, and buffer size applied across all sessions.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                resetToDefaults();
                terminalSessionManager.syncSettings();
                terminalSessionManager.syncTheme("auto");
              }}
              className="btn btn-ghost btn-xs gap-1 text-base-content/60 hover:text-base-content"
              title="Reset terminal appearance to defaults"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Defaults</span>
            </button>
          </div>

          <div className="divider my-1"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Terminal Color Palette */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-base-content/80 flex items-center justify-between">
                <span>Terminal Color Palette</span>
                <span className="text-[10px] text-base-content/50 font-mono">
                  {terminalTheme === "auto" ? "Synchronized with App Theme" : "Custom Override"}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={terminalTheme}
                  onChange={(e) => {
                    const nextTheme = e.target.value;
                    setTerminalTheme(nextTheme);
                    terminalSessionManager.syncTheme(nextTheme);
                  }}
                  className="select select-sm select-bordered flex-1 text-xs"
                >
                  <optgroup label="Automatic Synchronization">
                    <option value="auto">Auto (Match Active App Theme)</option>
                  </optgroup>
                  <optgroup label="Light Color Themes">
                    {TERMINAL_THEME_OPTIONS.filter((t) => t.group === "light").map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Dark Color Themes">
                    {TERMINAL_THEME_OPTIONS.filter((t) => t.group === "dark").map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {terminalTheme !== "auto" && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerminalTheme("auto");
                      terminalSessionManager.syncTheme("auto");
                    }}
                    className="btn btn-sm btn-ghost text-xs text-primary shrink-0"
                    title="Reset to automatic app theme synchronization"
                  >
                    Reset to Auto
                  </button>
                )}
              </div>
            </div>
            {/* Font Family Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-base-content/80 flex items-center justify-between">
                <span>Font Family</span>
                <span className="text-[10px] text-base-content/50 font-mono">Nerd Fonts / Ligatures</span>
              </label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="select select-sm select-bordered w-full font-mono text-xs"
              >
                {POPULAR_TERMINAL_FONTS.map((font) => (
                  <option key={font.id} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-base-content/80">Font Size</label>
                <span className="badge badge-sm badge-neutral font-mono font-bold text-xs">{fontSize}px</span>
              </div>
              <input
                type="range"
                min="11"
                max="24"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="range range-xs range-primary w-full"
              />
              <div className="flex justify-between text-[10px] text-base-content/40 font-mono px-0.5">
                <span>11px</span>
                <span>14px</span>
                <span>18px</span>
                <span>24px</span>
              </div>
            </div>

            {/* Line Height */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-base-content/80">Line Height</label>
                <span className="badge badge-sm badge-neutral font-mono font-bold text-xs">{lineHeight.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="1.8"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="range range-xs range-secondary w-full"
              />
              <div className="flex justify-between text-[10px] text-base-content/40 font-mono px-0.5">
                <span>1.0 (Compact)</span>
                <span>1.2 (Standard)</span>
                <span>1.8 (Relaxed)</span>
              </div>
            </div>

            {/* Cursor Style */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-base-content/80">Cursor Style</label>
              <div className="join w-full">
                {(["block", "bar", "underline"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setCursorStyle(style)}
                    className={`btn btn-sm join-item flex-1 capitalize text-xs ${
                      cursorStyle === style ? "btn-primary font-bold shadow-xs" : "btn-ghost border border-base-300"
                    }`}
                  >
                    {style === "block" && "█ Block"}
                    {style === "bar" && "| Bar"}
                    {style === "underline" && "_ Underline"}
                  </button>
                ))}
              </div>
            </div>

            {/* Cursor Blinking */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-base-100 border border-base-300">
              <div>
                <span className="text-xs font-semibold block">Cursor Blinking</span>
                <span className="text-[11px] text-base-content/60">Animate the cursor while terminal is idle</span>
              </div>
              <input
                type="checkbox"
                checked={cursorBlink}
                onChange={(e) => setCursorBlink(e.target.checked)}
                className="toggle toggle-sm toggle-primary"
              />
            </div>

            {/* Scrollback Buffer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-base-content/80">Scrollback Buffer</label>
                <span className="badge badge-sm badge-neutral font-mono font-bold text-xs">
                  {scrollback.toLocaleString()} lines
                </span>
              </div>
              <select
                value={scrollback}
                onChange={(e) => setScrollback(parseInt(e.target.value, 10))}
                className="select select-sm select-bordered w-full font-mono text-xs"
              >
                <option value={2000}>2,000 lines (Light memory)</option>
                <option value={5000}>5,000 lines</option>
                <option value={10000}>10,000 lines (Standard)</option>
                <option value={25000}>25,000 lines</option>
                <option value={50000}>50,000 lines (Power user)</option>
              </select>
            </div>

            {/* GPU Hardware Acceleration */}
            <div className="space-y-2 md:col-span-2 p-3.5 rounded-xl bg-base-100 border border-base-300">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">GPU Hardware Acceleration</span>
                    <span className="badge badge-xs badge-primary font-mono uppercase">
                      {gpuAcceleration === "auto" ? "Adaptive" : gpuAcceleration}
                    </span>
                  </div>
                  <p className="text-[11px] text-base-content/60 mt-0.5">
                    Offloads terminal text rasterization to your GPU (WebGL2 / Metal / DirectX) for 60–120 FPS high throughput.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setGpuAcceleration("auto")}
                  className={`btn btn-xs flex-col h-auto py-2 px-2.5 items-start text-left ${
                    gpuAcceleration === "auto"
                      ? "btn-primary shadow-xs"
                      : "btn-ghost border border-base-300"
                  }`}
                >
                  <span className="font-bold text-xs">Auto (Adaptive)</span>
                  <span className="text-[10px] opacity-75 font-normal">WebGL2 with Canvas fallback</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGpuAcceleration("webgl")}
                  className={`btn btn-xs flex-col h-auto py-2 px-2.5 items-start text-left ${
                    gpuAcceleration === "webgl"
                      ? "btn-primary shadow-xs"
                      : "btn-ghost border border-base-300"
                  }`}
                >
                  <span className="font-bold text-xs">WebGL2 Force</span>
                  <span className="text-[10px] opacity-75 font-normal">Max FPS & throughput</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGpuAcceleration("canvas")}
                  className={`btn btn-xs flex-col h-auto py-2 px-2.5 items-start text-left ${
                    gpuAcceleration === "canvas"
                      ? "btn-primary shadow-xs"
                      : "btn-ghost border border-base-300"
                  }`}
                >
                  <span className="font-bold text-xs">Canvas 2D</span>
                  <span className="text-[10px] opacity-75 font-normal">Bypasses 16-context limit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGpuAcceleration("off")}
                  className={`btn btn-xs flex-col h-auto py-2 px-2.5 items-start text-left ${
                    gpuAcceleration === "off"
                      ? "btn-primary shadow-xs"
                      : "btn-ghost border border-base-300"
                  }`}
                >
                  <span className="font-bold text-xs">Disabled (DOM)</span>
                  <span className="text-[10px] opacity-75 font-normal">Pure software safe mode</span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="rounded-xl bg-base-300/80 p-3.5 border border-base-300 space-y-1.5">
            <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-base-content/50">
              Live Terminal Preview
            </span>
            <div
              style={{
                fontFamily,
                fontSize: `${fontSize}px`,
                lineHeight,
              }}
              className="p-3 rounded-lg bg-base-100 font-mono text-xs text-base-content overflow-x-auto shadow-inner select-none border border-base-300/60"
            >
              <div className="text-success">$ haze-ssh connect server-01</div>
              <div className="text-base-content/70">Connected to 192.168.1.100 (Linux 6.8.0-generic x86_64)</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-primary font-bold">ahmet@server-01:~$</span>
                <span>uptime</span>
                <span
                  className={`inline-block ml-0.5 bg-primary text-primary-content ${
                    cursorBlink ? "animate-pulse" : ""
                  }`}
                  style={{
                    width: cursorStyle === "bar" ? "2px" : cursorStyle === "underline" ? "8px" : "8px",
                    height: cursorStyle === "underline" ? "2px" : "1em",
                    alignSelf: cursorStyle === "underline" ? "flex-end" : "center",
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Real-Time Keyword & Regex Highlighting Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                <Highlighter className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Real-Time Keyword & Regex Highlighting</h3>
                  <span className="badge badge-xs badge-warning font-mono">SecureCRT Mode</span>
                </div>
                <p className="text-xs text-base-content/60">
                  Scans terminal output in real time and highlights critical words, errors, IP addresses, and regexes.
                </p>
              </div>
            </div>

            <input
              type="checkbox"
              checked={keywordHighlightEnabled}
              onChange={(e) => {
                const next = e.target.checked;
                setKeywordHighlightEnabled(next);
                terminalSessionManager.syncSettings();
              }}
              className="toggle toggle-warning toggle-sm"
              title="Toggle real-time terminal keyword highlighting"
            />
          </div>

          <div className="divider my-1"></div>

          {keywordHighlightEnabled ? (
            <div className="space-y-4">
              {/* Highlight Rendering Style Selector & Opacity Controls */}
              <div className="p-3.5 rounded-xl bg-base-100 border border-base-300 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-base-content">Highlight Style</span>
                    <p className="text-[11px] text-base-content/60">
                      Choose how matches are rendered on top of terminal text.
                    </p>
                  </div>
                  <div className="join">
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightStyle("underline");
                        terminalSessionManager.syncSettings();
                      }}
                      className={`join-item btn btn-xs ${
                        highlightStyle === "underline"
                          ? "btn-warning"
                          : "btn-ghost border border-base-300 text-base-content/70"
                      }`}
                      title="Underline only: Text glyphs remain 100% visible and unblocked"
                    >
                      Underline Only
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightStyle("badge");
                        terminalSessionManager.syncSettings();
                      }}
                      className={`join-item btn btn-xs ${
                        highlightStyle === "badge"
                          ? "btn-warning"
                          : "btn-ghost border border-base-300 text-base-content/70"
                      }`}
                      title="Subtle Badge: Soft translucent tinted box with delicate border"
                    >
                      Subtle Badge
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightStyle("outline");
                        terminalSessionManager.syncSettings();
                      }}
                      className={`join-item btn btn-xs ${
                        highlightStyle === "outline"
                          ? "btn-warning"
                          : "btn-ghost border border-base-300 text-base-content/70"
                      }`}
                      title="Outline: Colored border with transparent interior"
                    >
                      Outline Box
                    </button>
                  </div>
                </div>

                {/* Opacity slider for Subtle Badge */}
                {highlightStyle === "badge" && (
                  <div className="pt-2 border-t border-base-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-medium text-base-content/80">Badge Box Opacity</span>
                      <p className="text-[11px] text-base-content/50">
                        Adjust background color fill intensity (5% – 30%).
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.05"
                        max="0.30"
                        step="0.01"
                        value={highlightBoxOpacity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setHighlightBoxOpacity(val);
                          terminalSessionManager.syncSettings();
                        }}
                        className="range range-xs range-warning w-36"
                      />
                      <span className="font-mono text-xs w-10 text-right text-base-content/70">
                        {Math.round(highlightBoxOpacity * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Rules Section Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-base-content/80">
                  Active Highlighting Rules ({highlightRules.filter((r) => r.enabled).length}/{highlightRules.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingRule(!isAddingRule)}
                  className="btn btn-xs btn-outline btn-warning gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Custom Rule</span>
                </button>
              </div>

              {isAddingRule && (
                <div className="p-3.5 rounded-xl bg-base-300/80 border border-base-300 space-y-3">
                  <span className="text-xs font-semibold text-base-content">Create New Highlight Pattern</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Rule Name (e.g. Postgres Fatal)"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="input input-xs input-bordered w-full text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Pattern (e.g. \bFATAL\b or DB_CONN_ERR)"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      className="input input-xs input-bordered w-full font-mono text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={newRuleColor}
                        onChange={(e) => setNewRuleColor(e.target.value)}
                        className="select select-xs select-bordered flex-1 text-xs"
                      >
                        <option value="#ef4444">Red (Error)</option>
                        <option value="#f59e0b">Amber (Warning)</option>
                        <option value="#10b981">Green (Success)</option>
                        <option value="#06b6d4">Cyan (Network)</option>
                        <option value="#8b5cf6">Purple (Notice)</option>
                        <option value="#ec4899">Pink (Debug)</option>
                      </select>
                      <button
                        type="button"
                        disabled={!newRuleName.trim() || !newRulePattern.trim()}
                        onClick={() => {
                          const hexToRgba = (hex: string, alpha: number) => {
                            const clean = hex.replace("#", "");
                            const r = parseInt(clean.substring(0, 2), 16) || 0;
                            const g = parseInt(clean.substring(2, 4), 16) || 0;
                            const b = parseInt(clean.substring(4, 6), 16) || 0;
                            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                          };

                          addHighlightRule({
                            id: `rule-custom-${Date.now()}`,
                            name: newRuleName.trim(),
                            pattern: newRulePattern.trim(),
                            isRegex: true,
                            caseSensitive: false,
                            style: {
                              backgroundColor: hexToRgba(newRuleColor, 0.10),
                              borderColor: newRuleColor,
                              fontWeight: "bold",
                            },
                            enabled: true,
                            category: "custom",
                          });
                          setNewRuleName("");
                          setNewRulePattern("");
                          setIsAddingRule(false);
                          terminalSessionManager.syncSettings();
                        }}
                        className="btn btn-xs btn-primary shrink-0"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {highlightRules.map((rule) => {
                  const accentColor = rule.style.borderColor || rule.style.backgroundColor || "#ef4444";
                  let sampleStyle: React.CSSProperties;

                  if (highlightStyle === "underline") {
                    sampleStyle = {
                      borderBottom: `2px solid ${accentColor}`,
                      borderRadius: "0px",
                      color: "inherit",
                      fontWeight: rule.style.fontWeight || "normal",
                    };
                  } else if (highlightStyle === "outline") {
                    sampleStyle = {
                      border: `1px solid ${accentColor}`,
                      borderRadius: "3px",
                      color: "inherit",
                      fontWeight: rule.style.fontWeight || "normal",
                    };
                  } else {
                    sampleStyle = {
                      backgroundColor: applyOpacity(rule.style.backgroundColor, highlightBoxOpacity),
                      border: `1px solid ${applyOpacity(accentColor, Math.min(0.45, highlightBoxOpacity * 2.5))}`,
                      borderRadius: "3px",
                      color: "inherit",
                      fontWeight: rule.style.fontWeight || "normal",
                    };
                  }

                  return (
                    <div
                      key={rule.id}
                      className="p-2.5 rounded-xl border border-base-300 bg-base-100 flex items-center justify-between gap-2.5 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => {
                            toggleHighlightRule(rule.id);
                            terminalSessionManager.syncSettings();
                          }}
                          className="checkbox checkbox-xs checkbox-warning"
                        />
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-base-content truncate">
                              {rule.name}
                            </span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 font-mono truncate transition-all"
                              style={sampleStyle}
                            >
                              SAMPLE
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-base-content/60 truncate mt-0.5" title={rule.pattern}>
                            {rule.pattern}
                          </p>
                        </div>
                      </div>

                      {rule.category === "custom" && (
                        <button
                          type="button"
                          onClick={() => {
                            deleteHighlightRule(rule.id);
                            terminalSessionManager.syncSettings();
                          }}
                          className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
                          title="Delete custom highlight rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-base-100 rounded-xl text-center text-xs text-base-content/60">
              Keyword highlighting is currently disabled. Toggle the switch to activate real-time token highlighting.
            </div>
          )}
        </section>

        {/* Session Audit Logging & asciinema Recording Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Session Audit Logging & asciinema Recording</h3>
                <p className="text-xs text-base-content/60">
                  Continuous timestamped session capture, compliance logging, and .cast recording
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => api.openDirectoryInOs(paths?.logsDir)}
                className="btn btn-xs btn-outline gap-1.5"
                title="Open local audit logs folder"
              >
                <FolderOpen className="w-3 h-3 text-info" />
                <span>Logs Folder</span>
              </button>
              <button
                type="button"
                onClick={() => api.openDirectoryInOs(paths?.recordingsDir)}
                className="btn btn-xs btn-outline gap-1.5"
                title="Open asciinema recordings folder"
              >
                <Video className="w-3 h-3 text-error" />
                <span>Recordings Folder</span>
              </button>
            </div>
          </div>

          <div className="divider my-1"></div>

          <div className="space-y-3">
            {/* Global Auto-Log Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-base-100 border border-base-300">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block text-base-content">
                  Automatically Log All Sessions
                </span>
                <span className="text-[11px] text-base-content/60 block">
                  Write continuous stdout streams for all SSH, Serial, Telnet, and Local sessions to ~/.haze/logs/
                </span>
              </div>
              <input
                type="checkbox"
                checked={globalAuditLogEnabled}
                onChange={(e) => setGlobalAuditLogEnabled(e.target.checked)}
                className="toggle toggle-sm toggle-info"
              />
            </div>

            {/* Timestamp Formatting Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-base-100 border border-base-300">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block text-base-content">
                  Prepend Millisecond Timestamps
                </span>
                <span className="text-[11px] text-base-content/60 block">
                  Prefix every line with [YYYY-MM-DD HH:mm:ss.SSS] for chronological audit compliance
                </span>
              </div>
              <input
                type="checkbox"
                checked={auditLogWithTimestamps}
                onChange={(e) => setAuditLogWithTimestamps(e.target.checked)}
                className="toggle toggle-sm toggle-info"
              />
            </div>

            {/* ANSI Stripping Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-base-100 border border-base-300">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block text-base-content">
                  Strip ANSI Escape Sequences
                </span>
                <span className="text-[11px] text-base-content/60 block">
                  Strip terminal color codes and cursor movement escapes to generate clean, grep-friendly plain text
                </span>
              </div>
              <input
                type="checkbox"
                checked={auditLogStripAnsi}
                onChange={(e) => setAuditLogStripAnsi(e.target.checked)}
                className="toggle toggle-sm toggle-info"
              />
            </div>

            {/* Directory Locations */}
            {paths && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] font-mono text-base-content/60">
                <div className="p-2 rounded-lg bg-base-300/40 border border-base-300 truncate">
                  <span className="font-semibold block text-[10px] text-base-content/80 mb-0.5">LOGS DIR:</span>
                  <span className="truncate" title={paths.logsDir}>{paths.logsDir}</span>
                </div>
                <div className="p-2 rounded-lg bg-base-300/40 border border-base-300 truncate">
                  <span className="font-semibold block text-[10px] text-base-content/80 mb-0.5">RECORDINGS DIR:</span>
                  <span className="truncate" title={paths.recordingsDir}>{paths.recordingsDir}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Automated Triggers & Expect Rules Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Automated Triggers & Expect Rules</h3>
                <p className="text-xs text-base-content/60">
                  Auto-respond to interactive prompts, sound alerts, and notify when tasks finish
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-base-content/70">Enable Triggers</span>
                <input
                  type="checkbox"
                  checked={triggersEnabled}
                  onChange={(e) => setTriggersEnabled(e.target.checked)}
                  className="toggle toggle-sm toggle-warning"
                />
              </div>
            </div>
          </div>

          <div className="divider my-1"></div>

          {triggersEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-base-content/80">
                  Active Triggers ({triggerRules.filter((r) => r.enabled).length}/{triggerRules.length})
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingTrigger(!isAddingTrigger)}
                    className="btn btn-xs btn-outline btn-warning gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Trigger</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetTriggerDefaults}
                    className="btn btn-xs btn-ghost text-base-content/60 hover:text-base-content gap-1"
                    title="Restore default trigger presets"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Add Trigger Inline Form */}
              {isAddingTrigger && (
                <div className="p-4 rounded-xl bg-base-300/80 border border-base-300 space-y-3">
                  <span className="text-xs font-semibold text-base-content block">
                    Create New Automation Trigger
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                        Trigger Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Confirm SSH Host Key"
                        value={newTriggerName}
                        onChange={(e) => setNewTriggerName(e.target.value)}
                        className="input input-xs input-bordered w-full text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                        Pattern to Match
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Are you sure you want to continue"
                        value={newTriggerPattern}
                        onChange={(e) => setNewTriggerPattern(e.target.value)}
                        className="input input-xs input-bordered w-full font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                        Match Strategy
                      </label>
                      <select
                        value={newTriggerMatchType}
                        onChange={(e) => setNewTriggerMatchType(e.target.value as TriggerMatchType)}
                        className="select select-xs select-bordered w-full text-xs"
                      >
                        <option value="contains">Contains Substring</option>
                        <option value="regex">Regular Expression (Regex)</option>
                        <option value="exact">Exact Match</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                        Action to Perform
                      </label>
                      <select
                        value={newTriggerActionType}
                        onChange={(e) => setNewTriggerActionType(e.target.value as TriggerActionType)}
                        className="select select-xs select-bordered w-full text-xs"
                      >
                        <option value="sound">Play Audio Chime</option>
                        <option value="notification">Desktop Notification</option>
                        <option value="sendText">Auto-Respond (Send Stdin)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                        Cooldown Seconds
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={newTriggerCooldown}
                        onChange={(e) => setNewTriggerCooldown(parseInt(e.target.value, 10) || 5)}
                        className="input input-xs input-bordered w-full text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Action Specific Fields */}
                  {newTriggerActionType === "sendText" && (
                    <div>
                      <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                        Text Response to Send (Stdin)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. yes"
                        value={newTriggerSendText}
                        onChange={(e) => setNewTriggerSendText(e.target.value)}
                        className="input input-xs input-bordered w-full font-mono text-xs"
                      />
                      <span className="text-[10px] text-warning mt-1 block">
                        Safety note: A newline (\n) is automatically appended. Cooldown prevents infinite feedback loops.
                      </span>
                    </div>
                  )}

                  {newTriggerActionType === "notification" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                          Notification Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Build Succeeded"
                          value={newTriggerNotificationTitle}
                          onChange={(e) => setNewTriggerNotificationTitle(e.target.value)}
                          className="input input-xs input-bordered w-full text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                          Message Body
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. The remote task has completed."
                          value={newTriggerNotificationMsg}
                          onChange={(e) => setNewTriggerNotificationMsg(e.target.value)}
                          className="input input-xs input-bordered w-full text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {newTriggerActionType === "sound" && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-base-content/70 block mb-1">
                          Synthesized Sound Chime
                        </label>
                        <select
                          value={newTriggerSoundType}
                          onChange={(e) => setNewTriggerSoundType(e.target.value as "bell" | "chime" | "warning")}
                          className="select select-xs select-bordered w-full text-xs"
                        >
                          <option value="bell">Sine Bell (880Hz)</option>
                          <option value="chime">Ascending Major Chord (C-E-G)</option>
                          <option value="warning">Two-Tone Warning Alert</option>
                        </select>
                      </div>
                      <div className="pt-5">
                        <button
                          type="button"
                          onClick={() => audioAlert.play(newTriggerSoundType)}
                          className="btn btn-xs btn-outline gap-1"
                        >
                          <Play className="w-3 h-3" />
                          <span>Test Sound</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={newTriggerCaseSensitive}
                          onChange={(e) => setNewTriggerCaseSensitive(e.target.checked)}
                          className="checkbox checkbox-xs checkbox-primary"
                        />
                        <span className="text-base-content/80 text-[11px]">Case Sensitive</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={newTriggerOneShot}
                          onChange={(e) => setNewTriggerOneShot(e.target.checked)}
                          className="checkbox checkbox-xs checkbox-primary"
                        />
                        <span className="text-base-content/80 text-[11px]">Fire Once Per Session (One-Shot)</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingTrigger(false)}
                        className="btn btn-xs btn-ghost"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateTrigger}
                        className="btn btn-xs btn-warning font-semibold"
                        disabled={!newTriggerName.trim() || !newTriggerPattern.trim()}
                      >
                        Save Trigger
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Trigger Rules List */}
              <div className="space-y-2">
                {triggerRules.map((rule) => {
                  return (
                    <div
                      key={rule.id}
                      className="p-3 rounded-xl border border-base-300 bg-base-100 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => toggleTriggerRule(rule.id)}
                          className="checkbox checkbox-xs checkbox-warning"
                        />
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-base-content truncate">
                              {rule.name}
                            </span>
                            <span className="badge badge-xs badge-neutral font-mono text-[10px]">
                              {rule.matchType}
                            </span>
                            {rule.oneShot && (
                              <span className="badge badge-xs badge-ghost text-[10px]">
                                1-shot
                              </span>
                            )}
                            {rule.action.type === "sound" && (
                              <span className="badge badge-xs badge-warning/20 text-warning text-[10px] gap-1">
                                <Volume2 className="w-2.5 h-2.5" />
                                <span>{rule.action.soundType || "bell"}</span>
                              </span>
                            )}
                            {rule.action.type === "notification" && (
                              <span className="badge badge-xs badge-info/20 text-info text-[10px] gap-1">
                                <Bell className="w-2.5 h-2.5" />
                                <span>notification</span>
                              </span>
                            )}
                            {rule.action.type === "sendText" && (
                              <span className="badge badge-xs badge-success/20 text-success text-[10px] gap-1 font-mono">
                                <Send className="w-2.5 h-2.5" />
                                <span>"{rule.action.text}"</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-base-content/60 truncate mt-0.5" title={rule.pattern}>
                            Pattern: {rule.pattern}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {rule.action.type === "sound" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (rule.action.type === "sound") {
                                audioAlert.play(rule.action.soundType || "bell");
                              }
                            }}
                            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
                            title="Test Sound"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteTriggerRule(rule.id)}
                          className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
                          title="Delete trigger"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-base-100 rounded-xl text-center text-xs text-base-content/60">
              Automated triggers are currently disabled. Toggle the switch to activate stream monitoring.
            </div>
          )}
        </section>

        {/* Privacy-First AI Copilot Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <AiSettingsSection />
        </section>

        {/* Decentralized Cloudless E2EE Sync Section */}
        <section className="bg-base-200/50 rounded-2xl p-5 border border-base-300 space-y-4">
          <SyncSettingsSection />
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
            <div
              onClick={() => setIsOpenSshModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsOpenSshModalOpen(true);
                }
              }}
              role="button"
              tabIndex={0}
              className="p-4 rounded-xl border border-base-300 bg-base-100 hover:border-primary/50 hover:bg-base-200/40 transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs font-mono">~/.ssh/config</span>
                  <span className="badge badge-xs badge-ghost font-mono text-[9px]">system</span>
                </div>
                <p className="text-[11px] text-base-content/60 mt-1">
                  Secure read-only parse of your system SSH config and known_hosts.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-outline btn-primary pointer-events-none group-hover:btn-active transition-all"
              >
                Import from OpenSSH
              </button>
            </div>

            <div
              onClick={() => setIsTermiusModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsTermiusModalOpen(true);
                }
              }}
              role="button"
              tabIndex={0}
              className="p-4 rounded-xl border border-base-300 bg-base-100 hover:border-secondary/50 hover:bg-base-200/40 transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">Termius JSON</span>
                  <span className="badge badge-xs badge-ghost font-mono text-[9px]">.json</span>
                </div>
                <p className="text-[11px] text-base-content/60 mt-1">
                  Import exported Termius hosts, snippets, and connection groups.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-outline btn-secondary pointer-events-none group-hover:btn-active transition-all"
              >
                Import Termius Export
              </button>
            </div>

            <div
              onClick={() => setIsPuttyModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsPuttyModalOpen(true);
                }
              }}
              role="button"
              tabIndex={0}
              className="p-4 rounded-xl border border-base-300 bg-base-100 hover:border-accent/50 hover:bg-base-200/40 transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">PuTTY Sessions</span>
                  <span className="badge badge-xs badge-ghost font-mono text-[9px]">.reg / sessions</span>
                </div>
                <p className="text-[11px] text-base-content/60 mt-1">
                  Import saved sessions from Windows Registry or local PuTTY sessions.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-outline btn-accent pointer-events-none group-hover:btn-active transition-all"
              >
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
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="btn btn-sm btn-primary flex-1 gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Encrypted Backup (.haze)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRestoreModalOpen(true)}
              className="btn btn-sm btn-ghost border border-base-300 flex-1 gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Restore from Backup File</span>
            </button>
          </div>
        </section>

        {/* Application About & Cryptographic Update Section */}
        <AboutUpdateSection />
      </div>

      {modalMode && (
        <VaultModal
          isOpen={true}
          mode={modalMode}
          onClose={() => setModalMode(null)}
        />
      )}

      <IdentityManagerModal
        isOpen={isIdentityManagerOpen}
        onClose={() => setIsIdentityManagerOpen(false)}
      />

      <ExportBackupModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

      <RestoreBackupModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
      />

      <OpenSshImportModal
        isOpen={isOpenSshModalOpen}
        onClose={() => setIsOpenSshModalOpen(false)}
      />

      <TermiusImportModal
        isOpen={isTermiusModalOpen}
        onClose={() => setIsTermiusModalOpen(false)}
      />

      <PuttyImportModal
        isOpen={isPuttyModalOpen}
        onClose={() => setIsPuttyModalOpen(false)}
      />
    </div>
  );
}
