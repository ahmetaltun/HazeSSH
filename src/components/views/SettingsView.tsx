import { useState } from "react";
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
} from "lucide-react";
import { useVaultStore } from "@/stores/useVaultStore";
import { useHostStore } from "@/stores/useHostStore";
import { useTerminalSettingsStore, POPULAR_TERMINAL_FONTS } from "@/stores/useTerminalSettingsStore";
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
    toggleHighlightRule,
    addHighlightRule,
    deleteHighlightRule,
    resetToDefaults,
  } = useTerminalSettingsStore();

  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleColor, setNewRuleColor] = useState("#ef4444");
  const [isAddingRule, setIsAddingRule] = useState(false);

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
