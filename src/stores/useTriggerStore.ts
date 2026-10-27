import { create } from "zustand";
import {
  type TriggerRule,
  DEFAULT_TRIGGER_RULES,
} from "@/services/terminalTriggerEngine";

interface TriggerStoreState {
  readonly triggersEnabled: boolean;
  readonly rules: readonly TriggerRule[];

  readonly setTriggersEnabled: (enabled: boolean) => void;
  readonly addRule: (rule: Omit<TriggerRule, "id">) => void;
  readonly updateRule: (id: string, partial: Partial<TriggerRule>) => void;
  readonly deleteRule: (id: string) => void;
  readonly toggleRule: (id: string) => void;
  readonly resetToDefaults: () => void;
}

const STORAGE_KEY = "haze_ssh_triggers";

function loadStoredRules(): { triggersEnabled: boolean; rules: readonly TriggerRule[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { triggersEnabled: true, rules: DEFAULT_TRIGGER_RULES };
    }
    const parsed = JSON.parse(raw);
    return {
      triggersEnabled: parsed.triggersEnabled ?? true,
      rules: Array.isArray(parsed.rules) && parsed.rules.length > 0 ? parsed.rules : DEFAULT_TRIGGER_RULES,
    };
  } catch {
    return { triggersEnabled: true, rules: DEFAULT_TRIGGER_RULES };
  }
}

export const useTriggerStore = create<TriggerStoreState>((set, get) => {
  const initial = loadStoredRules();

  const persist = (partial: { triggersEnabled?: boolean; rules?: readonly TriggerRule[] }) => {
    try {
      const current = {
        triggersEnabled: partial.triggersEnabled ?? get().triggersEnabled,
        rules: partial.rules ?? get().rules,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
      console.warn("Failed to persist triggers to localStorage:", err);
    }
  };

  return {
    ...initial,

    setTriggersEnabled: (triggersEnabled) => {
      persist({ triggersEnabled });
      set({ triggersEnabled });
    },

    addRule: (ruleInput) => {
      const newRule: TriggerRule = {
        ...ruleInput,
        id: `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      const nextRules = [...get().rules, newRule];
      persist({ rules: nextRules });
      set({ rules: nextRules });
    },

    updateRule: (id, partial) => {
      const nextRules = get().rules.map((r) => (r.id === id ? { ...r, ...partial } : r));
      persist({ rules: nextRules });
      set({ rules: nextRules });
    },

    deleteRule: (id) => {
      const nextRules = get().rules.filter((r) => r.id !== id);
      persist({ rules: nextRules });
      set({ rules: nextRules });
    },

    toggleRule: (id) => {
      const nextRules = get().rules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      );
      persist({ rules: nextRules });
      set({ rules: nextRules });
    },

    resetToDefaults: () => {
      persist({ rules: DEFAULT_TRIGGER_RULES });
      set({ rules: DEFAULT_TRIGGER_RULES });
    },
  };
});
