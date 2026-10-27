import { create } from "zustand";
import type {
  AiProviderType,
  AiProviderConfig,
  AiModelInfo,
  AiHistoryItem,
} from "@/types/ai";

const STORAGE_KEY = "haze_ssh_ai_settings";

export const DEFAULT_AI_CONFIGS: Record<AiProviderType, AiProviderConfig> = {
  ollama: {
    endpoint: "http://localhost:11434",
    selectedModel: "llama3.2",
    temperature: 0.2,
    maxTokens: 1024,
  },
  lmstudio: {
    endpoint: "http://localhost:1234/v1",
    selectedModel: "qwen2.5-coder-7b-instruct",
    temperature: 0.2,
    maxTokens: 1024,
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1",
    apiKey: "",
    selectedModel: "deepseek/deepseek-chat",
    temperature: 0.2,
    maxTokens: 1024,
  },
  nvidia: {
    endpoint: "https://integrate.api.nvidia.com/v1",
    apiKey: "",
    selectedModel: "meta/llama-3.1-70b-instruct",
    temperature: 0.2,
    maxTokens: 1024,
  },
  openai: {
    endpoint: "https://api.openai.com/v1",
    apiKey: "",
    selectedModel: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 1024,
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1",
    apiKey: "",
    selectedModel: "claude-3-5-sonnet-latest",
    temperature: 0.2,
    maxTokens: 1024,
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1",
    apiKey: "",
    selectedModel: "deepseek-chat",
    temperature: 0.2,
    maxTokens: 1024,
  },
  custom: {
    endpoint: "http://localhost:8000/v1",
    apiKey: "",
    selectedModel: "default",
    temperature: 0.2,
    maxTokens: 1024,
  },
};

interface AiCopilotState {
  readonly isEnabled: boolean;
  readonly activeProvider: AiProviderType;
  readonly providerConfigs: Record<AiProviderType, AiProviderConfig>;
  readonly availableModels: Partial<Record<AiProviderType, readonly AiModelInfo[]>>;
  readonly isPromptOpen: boolean;
  readonly activePaneId: string | null;
  readonly history: readonly AiHistoryItem[];
  readonly isGenerating: boolean;
  readonly lastLatencyMs: number | null;

  readonly setEnabled: (enabled: boolean) => void;
  readonly setActiveProvider: (provider: AiProviderType) => void;
  readonly updateProviderConfig: (
    provider: AiProviderType,
    partial: Partial<AiProviderConfig>
  ) => void;
  readonly setAvailableModels: (
    provider: AiProviderType,
    models: readonly AiModelInfo[]
  ) => void;
  readonly openPrompt: (paneId: string) => void;
  readonly closePrompt: () => void;
  readonly togglePrompt: (paneId: string) => void;
  readonly addHistory: (item: Omit<AiHistoryItem, "id" | "timestamp">) => void;
  readonly clearHistory: () => void;
  readonly setIsGenerating: (isGenerating: boolean) => void;
  readonly setLastLatencyMs: (ms: number | null) => void;
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        isEnabled: false,
        activeProvider: "ollama" as AiProviderType,
        providerConfigs: DEFAULT_AI_CONFIGS,
        history: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      isEnabled: parsed.isEnabled ?? false,
      activeProvider: (parsed.activeProvider as AiProviderType) || "ollama",
      providerConfigs: {
        ...DEFAULT_AI_CONFIGS,
        ...(parsed.providerConfigs || {}),
      },
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return {
      isEnabled: false,
      activeProvider: "ollama" as AiProviderType,
      providerConfigs: DEFAULT_AI_CONFIGS,
      history: [],
    };
  }
}

export const useAiCopilotStore = create<AiCopilotState>((set, get) => {
  const initial = loadSavedSettings();

  const persist = (partial: Partial<typeof initial>) => {
    try {
      const current = {
        isEnabled: get().isEnabled,
        activeProvider: get().activeProvider,
        providerConfigs: get().providerConfigs,
        history: get().history,
        ...partial,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
      console.warn("Failed to persist AI settings to localStorage:", err);
    }
  };

  return {
    isEnabled: initial.isEnabled,
    activeProvider: initial.activeProvider,
    providerConfigs: initial.providerConfigs,
    availableModels: {},
    isPromptOpen: false,
    activePaneId: null,
    history: initial.history,
    isGenerating: false,
    lastLatencyMs: null,

    setEnabled: (isEnabled) => {
      persist({ isEnabled });
      set({ isEnabled });
    },

    setActiveProvider: (activeProvider) => {
      persist({ activeProvider });
      set({ activeProvider });
    },

    updateProviderConfig: (provider, partial) => {
      const currentConfigs = get().providerConfigs;
      const nextConfigs = {
        ...currentConfigs,
        [provider]: {
          ...currentConfigs[provider],
          ...partial,
        },
      };
      persist({ providerConfigs: nextConfigs });
      set({ providerConfigs: nextConfigs });
    },

    setAvailableModels: (provider, models) => {
      set((state) => ({
        availableModels: {
          ...state.availableModels,
          [provider]: models,
        },
      }));
    },

    openPrompt: (paneId) => {
      set({ isPromptOpen: true, activePaneId: paneId });
    },

    closePrompt: () => {
      set({ isPromptOpen: false, activePaneId: null });
    },

    togglePrompt: (paneId) => {
      const current = get();
      if (current.isPromptOpen && current.activePaneId === paneId) {
        set({ isPromptOpen: false, activePaneId: null });
      } else {
        set({ isPromptOpen: true, activePaneId: paneId });
      }
    },

    addHistory: (item) => {
      const newItem: AiHistoryItem = {
        ...item,
        id: crypto.randomUUID ? crypto.randomUUID() : `ai-${Date.now()}`,
        timestamp: Date.now(),
      };
      const nextHistory = [newItem, ...get().history.slice(0, 49)];
      persist({ history: nextHistory });
      set({ history: nextHistory });
    },

    clearHistory: () => {
      persist({ history: [] });
      set({ history: [] });
    },

    setIsGenerating: (isGenerating) => set({ isGenerating }),
    setLastLatencyMs: (lastLatencyMs) => set({ lastLatencyMs }),
  };
});
