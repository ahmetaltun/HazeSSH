import { create } from "zustand";

export const AVAILABLE_THEMES = [
  { id: "dark", label: "Dark Default" },
  { id: "dracula", label: "Dracula" },
  { id: "synthwave", label: "Synthwave" },
  { id: "night", label: "Night" },
  { id: "dim", label: "Dim" },
  { id: "nord", label: "Nord" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "forest", label: "Forest" },
  { id: "black", label: "Pure Black" },
  { id: "business", label: "Business" },
  { id: "coffee", label: "Coffee" },
  { id: "sunset", label: "Sunset" },
  { id: "light", label: "Light" },
] as const;

export type ThemeId = (typeof AVAILABLE_THEMES)[number]["id"];

interface ThemeState {
  readonly currentTheme: ThemeId;
  readonly setTheme: (theme: ThemeId) => void;
  readonly initTheme: () => void;
}

const STORAGE_KEY = "haze_ssh_theme";
const DEFAULT_THEME: ThemeId = "dracula";

export const useThemeStore = create<ThemeState>((set) => ({
  currentTheme: DEFAULT_THEME,

  setTheme: (theme: ThemeId) => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
      set({ currentTheme: theme });
    } catch (err) {
      console.error(`Failed to apply or persist theme "${theme}":`, err);
    }
  },

  initTheme: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      const isValid = saved && AVAILABLE_THEMES.some((t) => t.id === saved);
      const activeTheme = isValid ? (saved as ThemeId) : DEFAULT_THEME;
      document.documentElement.setAttribute("data-theme", activeTheme);
      set({ currentTheme: activeTheme });
    } catch (err) {
      console.warn("Could not read saved theme from storage, falling back to default:", err);
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
      set({ currentTheme: DEFAULT_THEME });
    }
  },
}));
