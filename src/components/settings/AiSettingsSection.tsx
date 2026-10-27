import { useState, useMemo } from "react";
import {
  Sparkles,
  ShieldCheck,
  Server,
  Key,
  Cpu,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sliders,
  FileText,
  Globe,
  Hash,
} from "lucide-react";
import { useAiCopilotStore } from "@/stores/useAiCopilotStore";
import { aiCopilotService } from "@/services/aiCopilotService";
import { api } from "@/services/api";
import type { AiProviderType } from "@/types/ai";

const PROVIDER_METADATA: Record<
  AiProviderType,
  { label: string; tag: string; description: string; isLocal: boolean }
> = {
  ollama: {
    label: "Local Ollama",
    tag: "Local",
    description: "Runs 100% offline. Zero data leaves your computer.",
    isLocal: true,
  },
  lmstudio: {
    label: "LM Studio",
    tag: "Local",
    description: "Local GUI runner with OpenAI-compatible API.",
    isLocal: true,
  },
  openrouter: {
    label: "OpenRouter",
    tag: "BYOK",
    description: "One API key for Claude 3.5, DeepSeek, and GPT-4o.",
    isLocal: false,
  },
  nvidia: {
    label: "Nvidia NIM",
    tag: "Hosted",
    description: "Ultra-fast inference for DeepSeek and Llama 3.",
    isLocal: false,
  },
  openai: {
    label: "OpenAI",
    tag: "Official",
    description: "Direct connection to GPT-4o and o3-mini models.",
    isLocal: false,
  },
  anthropic: {
    label: "Anthropic",
    tag: "Official",
    description: "Direct connection to Claude 3.5 Sonnet & Haiku.",
    isLocal: false,
  },
  deepseek: {
    label: "DeepSeek",
    tag: "Official",
    description: "Official DeepSeek-V3 & DeepSeek-R1 inference API.",
    isLocal: false,
  },
  custom: {
    label: "Custom Gateway",
    tag: "Custom",
    description: "Connect to vLLM, LocalAI, or private gateway.",
    isLocal: false,
  },
};

export function AiSettingsSection() {
  const {
    isEnabled,
    activeProvider,
    providerConfigs,
    availableModels,
    setEnabled,
    setActiveProvider,
    updateProviderConfig,
    setAvailableModels,
  } = useAiCopilotStore();

  const [showApiKey, setShowApiKey] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  const activeConfig = providerConfigs[activeProvider];
  const meta = PROVIDER_METADATA[activeProvider];
  const fetchedModels = useMemo(() => {
    const list = availableModels[activeProvider] || [];
    return [...list].sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id, undefined, {
        sensitivity: "base",
        numeric: true,
      })
    );
  }, [availableModels, activeProvider]);

  const isSelectedModelInFetched = fetchedModels.some((m) => m.id === activeConfig.selectedModel);
  const showCustomInput =
    isCustomModel ||
    fetchedModels.length === 0 ||
    (!isSelectedModelInFetched && Boolean(activeConfig.selectedModel));

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setTestResult(null);

    try {
      const models = await api.aiFetchModels({
        provider: activeProvider,
        endpoint: activeConfig.endpoint,
        api_key: activeConfig.apiKey,
        timeout_seconds: 15,
      });
      const sorted = [...models].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, undefined, {
          sensitivity: "base",
          numeric: true,
        })
      );
      setAvailableModels(activeProvider, sorted);
      if (sorted.length > 0 && !sorted.some((m) => m.id === activeConfig.selectedModel)) {
        updateProviderConfig(activeProvider, { selectedModel: sorted[0].id });
        setIsCustomModel(false);
      }
    } catch (err) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: `Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await aiCopilotService.testConnection(activeProvider);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section Header & Master Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-base-content">
                Privacy-First AI Shell Copilot
              </h3>
              <span className="badge badge-primary badge-xs">Opt-In</span>
            </div>
            <p className="text-xs text-base-content/60 mt-0.5 leading-relaxed">
              Natural language to terminal command translation (<kbd className="kbd kbd-xs">⌘I</kbd> /{" "}
              <kbd className="kbd kbd-xs">Ctrl+I</kbd>), danger detection, and error diagnosis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-xs font-medium text-base-content/75">
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="toggle toggle-primary toggle-sm cursor-pointer"
            title="Toggle AI Shell Copilot"
          />
        </div>
      </div>

      <div className="divider my-0"></div>

      {/* Zero-Cloud Privacy Guarantee Callout */}
      <div className="p-3 rounded-xl bg-success/10 border border-success/20 flex items-start gap-2.5 text-xs">
        <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-success">Zero-Cloud Privacy Guarantee</span>
          <span className="text-base-content/75 leading-relaxed text-[11px]">
            Haze SSH has <strong>no analytics, no telemetry, and no intermediary servers</strong>. Prompts
            and API keys are stored strictly on your local device and sent directly to your chosen provider.
            With Local Ollama or LM Studio, 100% of data stays completely offline on your computer.
          </span>
        </div>
      </div>

      {/* Provider Selector Grid */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-base-content/60">
          Select AI Provider
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {(Object.keys(PROVIDER_METADATA) as AiProviderType[]).map((prov) => {
            const pMeta = PROVIDER_METADATA[prov];
            const isSelected = activeProvider === prov;

            return (
              <button
                key={prov}
                type="button"
                onClick={() => {
                  setActiveProvider(prov);
                  setTestResult(null);
                  setIsCustomModel(false);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 min-w-0 ${
                  isSelected
                    ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/40"
                    : "bg-base-200/40 border-base-300 hover:bg-base-200/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2.5 min-w-0 w-full">
                  <span className="font-semibold text-xs text-base-content truncate min-w-0">
                    {pMeta.label}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 ${
                      pMeta.isLocal
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-base-300 text-base-content/70 border border-base-content/10"
                    }`}
                  >
                    {pMeta.tag}
                  </span>
                </div>
                <p className="text-[11px] text-base-content/60 line-clamp-2 leading-snug">
                  {pMeta.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Provider Configuration Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-base-100/70 border border-base-300/80 flex flex-col gap-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-base-300/60 pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <h4 className="font-bold text-sm text-base-content">
              {meta.label} Configuration
            </h4>
          </div>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="btn btn-xs btn-outline gap-1"
          >
            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>Test Connection</span>
          </button>
        </div>

        {/* Test connection alert banner */}
        {testResult && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              testResult.success
                ? "bg-success/15 border-success/30 text-success"
                : "bg-error/15 border-error/30 text-error"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span className="font-mono truncate">{testResult.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              className="btn btn-ghost btn-xs text-xs opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Unified Symmetrical Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Row 1 Col 1: API Endpoint URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-base-content/80 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-base-content/60" />
              <span>API Endpoint URL</span>
              {meta.isLocal && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  Localhost
                </span>
              )}
            </label>
            <input
              type="text"
              value={activeConfig.endpoint}
              onChange={(e) => updateProviderConfig(activeProvider, { endpoint: e.target.value })}
              placeholder={meta.isLocal ? "http://localhost:11434" : "https://api.openai.com/v1"}
              className="input input-sm input-bordered w-full bg-base-100 font-mono text-xs focus:border-primary"
            />
          </div>

          {/* Row 1 Col 2: API Key (for Cloud) OR Local Privacy/Network Status (for Local) */}
          {!meta.isLocal ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-base-content/60" />
                <span>API Key</span>
              </label>
              <div className="relative w-full">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={activeConfig.apiKey || ""}
                  onChange={(e) => updateProviderConfig(activeProvider, { apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="input input-sm input-bordered w-full pr-8 bg-base-100 font-mono text-xs focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content cursor-pointer"
                  title={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-success" />
                <span>Local Execution Status</span>
              </label>
              <div className="h-8 px-3 rounded-lg bg-base-200/50 border border-base-300 flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-base-content/75 text-[11px] truncate">
                  Offline daemon • Zero data leaves device
                </span>
              </div>
            </div>
          )}

          {/* Row 2: Selected Model (Spans full width across both columns) */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-base-content/60" />
                <span>Selected Model</span>
              </label>
              {showCustomInput && fetchedModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCustomModel(false)}
                  className="text-[11px] text-base-content/60 hover:text-base-content underline cursor-pointer"
                >
                  View available models ({fetchedModels.length})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full">
              {showCustomInput ? (
                <input
                  type="text"
                  value={activeConfig.selectedModel}
                  onChange={(e) => updateProviderConfig(activeProvider, { selectedModel: e.target.value })}
                  placeholder={
                    meta.isLocal
                      ? "e.g. llama3.2, qwen2.5-coder..."
                      : "e.g. gpt-4o-mini, claude-3-5-sonnet, deepseek-chat..."
                  }
                  className="input input-sm input-bordered flex-1 w-full bg-base-100 font-mono text-xs focus:border-primary"
                />
              ) : (
                <select
                  value={activeConfig.selectedModel}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setIsCustomModel(true);
                    } else {
                      updateProviderConfig(activeProvider, { selectedModel: e.target.value });
                    }
                  }}
                  className="select select-sm select-bordered flex-1 w-full bg-base-100 font-mono text-xs"
                >
                  {fetchedModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.description ? `(${m.description})` : ""}
                    </option>
                  ))}
                  <option value="__custom__">+ Enter custom model name...</option>
                </select>
              )}

              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className="btn btn-sm btn-outline gap-1.5 shrink-0 px-3"
                title="Fetch available models from endpoint"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? "animate-spin" : ""}`} />
                <span className="text-xs">{isFetchingModels ? "Fetching..." : "Fetch Models"}</span>
              </button>
            </div>
          </div>

          {/* Row 3 Col 1: Max Output Tokens */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-base-content/60" />
              <span>Max Output Tokens</span>
            </label>
            <select
              value={activeConfig.maxTokens ?? 1024}
              onChange={(e) =>
                updateProviderConfig(activeProvider, { maxTokens: parseInt(e.target.value, 10) })
              }
              className="select select-sm select-bordered w-full bg-base-100 font-mono text-xs"
            >
              <option value={512}>512 tokens (Fast shell commands)</option>
              <option value={1024}>1024 tokens (Standard default)</option>
              <option value={2048}>2048 tokens (Detailed explanations)</option>
              <option value={4096}>4096 tokens (Extended scripts)</option>
            </select>
          </div>

          {/* Row 3 Col 2: Temperature Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-base-content/60" />
                <span>Temperature</span>
              </label>
              <span className="badge badge-sm badge-neutral font-mono font-medium text-xs">
                {activeConfig.temperature ?? 0.2}
              </span>
            </div>
            <div className="flex items-center gap-2.5 h-8">
              <span className="text-[10px] text-base-content/50 font-mono shrink-0 select-none">
                0.0 (Strict)
              </span>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={activeConfig.temperature ?? 0.2}
                onChange={(e) =>
                  updateProviderConfig(activeProvider, { temperature: parseFloat(e.target.value) })
                }
                className="range range-xs range-primary flex-1"
              />
              <span className="text-[10px] text-base-content/50 font-mono shrink-0 select-none">
                1.0 (Creative)
              </span>
            </div>
          </div>

          {/* Row 4: Custom System Rules & Preferences (Spans full width) */}
          <div className="flex flex-col gap-1.5 border-t border-base-300/60 pt-3.5 md:col-span-2">
            <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-base-content/60" />
              <span>Custom System Rules & Preferences (Optional)</span>
            </label>
            <textarea
              rows={2}
              value={activeConfig.customSystemPrompt || ""}
              onChange={(e) => updateProviderConfig(activeProvider, { customSystemPrompt: e.target.value })}
              placeholder="e.g. Prefer Debian/Ubuntu package commands (apt). Never suggest commands using sudo without a warning."
              className="textarea textarea-sm textarea-bordered w-full bg-base-100 text-xs font-mono resize-y focus:border-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
