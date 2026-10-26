import { create } from "zustand";

export type CursorStyle = "block" | "underline" | "bar";

export type GpuAccelerationMode = "auto" | "webgl" | "canvas" | "off";

export interface TerminalFontOption {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export const POPULAR_TERMINAL_FONTS: readonly TerminalFontOption[] = [
  {
    id: "jetbrains",
    label: "JetBrains Mono (Recommended)",
    value: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
  },
  {
    id: "fira",
    label: "Fira Code",
    value: "'Fira Code', 'JetBrains Mono', monospace",
  },
  {
    id: "hack",
    label: "Hack",
    value: "'Hack', Menlo, Monaco, monospace",
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    value: "'Cascadia Code', Consolas, monospace",
  },
  {
    id: "nerd",
    label: "Nerd Font (Meslo / Symbols)",
    value: "'MesloLGS NF', 'Symbols Nerd Font', monospace",
  },
  {
    id: "system",
    label: "System Monospace",
    value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
] as const;

interface TerminalSettingsState {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly cursorStyle: CursorStyle;
  readonly cursorBlink: boolean;
  readonly scrollback: number;
  readonly copyOnSelect: boolean;
  readonly gpuAcceleration: GpuAccelerationMode;
  readonly terminalTheme: string;

  readonly setFontFamily: (fontFamily: string) => void;
  readonly setFontSize: (fontSize: number) => void;
  readonly setLineHeight: (lineHeight: number) => void;
  readonly setCursorStyle: (cursorStyle: CursorStyle) => void;
  readonly setCursorBlink: (cursorBlink: boolean) => void;
  readonly setScrollback: (scrollback: number) => void;
  readonly setCopyOnSelect: (copyOnSelect: boolean) => void;
  readonly setGpuAcceleration: (gpuAcceleration: GpuAccelerationMode) => void;
  readonly setTerminalTheme: (terminalTheme: string) => void;
  readonly resetToDefaults: () => void;
}

const STORAGE_KEY = "haze_ssh_terminal_settings";

const DEFAULT_SETTINGS = {
  fontFamily: POPULAR_TERMINAL_FONTS[0].value,
  fontSize: 13,
  lineHeight: 1.2,
  cursorStyle: "block" as CursorStyle,
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  gpuAcceleration: "auto" as GpuAccelerationMode,
  terminalTheme: "auto",
};

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useTerminalSettingsStore = create<TerminalSettingsState>((set, get) => {
  const initial = loadSavedSettings();

  const persist = (partial: Partial<typeof DEFAULT_SETTINGS>) => {
    try {
      const current = {
        fontFamily: get().fontFamily,
        fontSize: get().fontSize,
        lineHeight: get().lineHeight,
        cursorStyle: get().cursorStyle,
        cursorBlink: get().cursorBlink,
        scrollback: get().scrollback,
        copyOnSelect: get().copyOnSelect,
        gpuAcceleration: get().gpuAcceleration,
        terminalTheme: get().terminalTheme,
        ...partial,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
      console.warn("Failed to persist terminal settings to localStorage:", err);
    }
  };

  return {
    ...initial,

    setFontFamily: (fontFamily) => {
      persist({ fontFamily });
      set({ fontFamily });
    },

    setFontSize: (fontSize) => {
      persist({ fontSize });
      set({ fontSize });
    },

    setLineHeight: (lineHeight) => {
      persist({ lineHeight });
      set({ lineHeight });
    },

    setCursorStyle: (cursorStyle) => {
      persist({ cursorStyle });
      set({ cursorStyle });
    },

    setCursorBlink: (cursorBlink) => {
      persist({ cursorBlink });
      set({ cursorBlink });
    },

    setScrollback: (scrollback) => {
      persist({ scrollback });
      set({ scrollback });
    },

    setCopyOnSelect: (copyOnSelect) => {
      persist({ copyOnSelect });
      set({ copyOnSelect });
    },

    setGpuAcceleration: (gpuAcceleration) => {
      persist({ gpuAcceleration });
      set({ gpuAcceleration });
    },

    setTerminalTheme: (terminalTheme) => {
      persist({ terminalTheme });
      set({ terminalTheme });
    },

    resetToDefaults: () => {
      persist(DEFAULT_SETTINGS);
      set(DEFAULT_SETTINGS);
    },
  };
});
