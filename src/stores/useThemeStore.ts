import { create } from "zustand";

export interface ThemeOption {
  readonly id: string;
  readonly label: string;
  readonly group: "dark" | "light";
  readonly primaryColor: string;
  readonly baseColor: string;
}

export const DARK_THEMES: readonly ThemeOption[] = [
  { id: "dracula", label: "Dracula", group: "dark", primaryColor: "#ff79c6", baseColor: "#282a36" },
  { id: "dark", label: "Dark Default", group: "dark", primaryColor: "#7480ff", baseColor: "#1d232a" },
  { id: "night", label: "Night", group: "dark", primaryColor: "#38bdf8", baseColor: "#0f172a" },
  { id: "dim", label: "Dim", group: "dark", primaryColor: "#9fe88d", baseColor: "#2a303c" },
  { id: "synthwave", label: "Synthwave", group: "dark", primaryColor: "#e779c1", baseColor: "#1a103c" },
  { id: "sunset", label: "Sunset", group: "dark", primaryColor: "#ff865b", baseColor: "#1a1b26" },
  { id: "forest", label: "Forest", group: "dark", primaryColor: "#1eb854", baseColor: "#171212" },
  { id: "black", label: "Pure Black", group: "dark", primaryColor: "#343232", baseColor: "#000000" },
  { id: "business", label: "Business", group: "dark", primaryColor: "#1c4e80", baseColor: "#202020" },
  { id: "coffee", label: "Coffee", group: "dark", primaryColor: "#db924b", baseColor: "#20161f" },
  { id: "abyss", label: "Abyss", group: "dark", primaryColor: "#4f46e5", baseColor: "#0b1120" },
  { id: "luxury", label: "Luxury", group: "dark", primaryColor: "#ffffff", baseColor: "#09090b" },
  { id: "halloween", label: "Halloween", group: "dark", primaryColor: "#f28c18", baseColor: "#212121" },
  { id: "aqua", label: "Aqua", group: "dark", primaryColor: "#09ecf3", baseColor: "#345da7" },
];

export const LIGHT_THEMES: readonly ThemeOption[] = [
  { id: "light", label: "Light Default", group: "light", primaryColor: "#4f46e5", baseColor: "#ffffff" },
  { id: "nord", label: "Nord", group: "light", primaryColor: "#5e81ac", baseColor: "#eceff4" },
  { id: "corporate", label: "Corporate", group: "light", primaryColor: "#4b6bfb", baseColor: "#ffffff" },
  { id: "emerald", label: "Emerald", group: "light", primaryColor: "#66cc8a", baseColor: "#ffffff" },
  { id: "cupcake", label: "Cupcake", group: "light", primaryColor: "#65c3c8", baseColor: "#faf7f5" },
  { id: "retro", label: "Retro", group: "light", primaryColor: "#ef9995", baseColor: "#e4d8b4" },
  { id: "cyberpunk", label: "Cyberpunk", group: "light", primaryColor: "#ff7598", baseColor: "#ffee00" },
  { id: "valentine", label: "Valentine", group: "light", primaryColor: "#e96d7b", baseColor: "#f0d6e8" },
  { id: "garden", label: "Garden", group: "light", primaryColor: "#5c7f67", baseColor: "#e9e7e7" },
  { id: "pastel", label: "Pastel", group: "light", primaryColor: "#d1c1d7", baseColor: "#ffffff" },
  { id: "lofi", label: "Lo-Fi", group: "light", primaryColor: "#0d0d0d", baseColor: "#ffffff" },
  { id: "winter", label: "Winter", group: "light", primaryColor: "#047aff", baseColor: "#ffffff" },
  { id: "autumn", label: "Autumn", group: "light", primaryColor: "#8c0327", baseColor: "#f1f1f1" },
  { id: "acid", label: "Acid", group: "light", primaryColor: "#ff00f4", baseColor: "#fafafa" },
  { id: "lemonade", label: "Lemonade", group: "light", primaryColor: "#519903", baseColor: "#f9fbe7" },
  { id: "wireframe", label: "Wireframe", group: "light", primaryColor: "#b8b8b8", baseColor: "#ffffff" },
  { id: "caramellatte", label: "Caramel Latte", group: "light", primaryColor: "#cf7a30", baseColor: "#fbf6ee" },
  { id: "silk", label: "Silk", group: "light", primaryColor: "#3b4252", baseColor: "#f5f3ef" },
];

export const AVAILABLE_THEMES: readonly ThemeOption[] = [...DARK_THEMES, ...LIGHT_THEMES];

export type ThemeId = string;

interface ThemeState {
  readonly currentTheme: ThemeId;
  readonly setTheme: (theme: ThemeId) => void;
  readonly initTheme: () => void;
}

const STORAGE_KEY = "haze_ssh_theme";
const DEFAULT_THEME: ThemeId = "dracula";

const getInitialTheme = (): ThemeId => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && AVAILABLE_THEMES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {
    // Fallback if storage access is restricted
  }
  return DEFAULT_THEME;
};

export const useThemeStore = create<ThemeState>((set) => ({
  currentTheme: getInitialTheme(),

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
      const activeTheme = isValid ? saved : DEFAULT_THEME;
      document.documentElement.setAttribute("data-theme", activeTheme);
      set({ currentTheme: activeTheme });
    } catch (err) {
      console.warn("Could not read saved theme from storage, falling back to default:", err);
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
      set({ currentTheme: DEFAULT_THEME });
    }
  },
}));
