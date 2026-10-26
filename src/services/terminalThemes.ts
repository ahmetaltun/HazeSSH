import type { ITheme } from "@xterm/xterm";
import { LIGHT_THEMES } from "@/stores/useThemeStore";

export interface TerminalThemeOption {
  readonly id: string;
  readonly label: string;
  readonly group: "auto" | "light" | "dark";
  readonly background: string;
  readonly foreground: string;
}

export const TERMINAL_THEMES: Record<string, ITheme> = {
  // --- Light Terminal Themes ---
  "github-light": {
    background: "#ffffff",
    foreground: "#24292f",
    cursor: "#0969da",
    cursorAccent: "#ffffff",
    selectionBackground: "#c8e1ff",
    black: "#24292f",
    red: "#cf222e",
    green: "#116329",
    yellow: "#4d3800",
    blue: "#0969da",
    magenta: "#8250df",
    cyan: "#1b7c83",
    white: "#6e7781",
    brightBlack: "#57606a",
    brightRed: "#a40e26",
    brightGreen: "#1a7f37",
    brightYellow: "#633c01",
    brightBlue: "#218bff",
    brightMagenta: "#a475f9",
    brightCyan: "#3192aa",
    brightWhite: "#8c959f",
  },
  "one-light": {
    background: "#fafafa",
    foreground: "#383a42",
    cursor: "#526fff",
    cursorAccent: "#fafafa",
    selectionBackground: "#e5e5e6",
    black: "#383a42",
    red: "#e45649",
    green: "#50a14f",
    yellow: "#c18401",
    blue: "#4078f2",
    magenta: "#a626a4",
    cyan: "#0184bc",
    white: "#a0a1a7",
    brightBlack: "#696c77",
    brightRed: "#e45649",
    brightGreen: "#50a14f",
    brightYellow: "#c18401",
    brightBlue: "#4078f2",
    brightMagenta: "#a626a4",
    brightCyan: "#0184bc",
    brightWhite: "#ffffff",
  },
  "solarized-light": {
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#586e75",
    cursorAccent: "#fdf6e3",
    selectionBackground: "#eee8d5",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
  "nord-light": {
    background: "#eceff4",
    foreground: "#2e3440",
    cursor: "#434c5e",
    cursorAccent: "#eceff4",
    selectionBackground: "#d8dee9",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#5e81ac",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#ffffff",
  },

  // --- Dark Terminal Themes ---
  dracula: {
    background: "#1e1f29",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    cursorAccent: "#1e1f29",
    selectionBackground: "#44475a",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  synthwave: {
    background: "#1a102f",
    foreground: "#f92aad",
    cursor: "#f92aad",
    cursorAccent: "#1a102f",
    selectionBackground: "#341f5c",
    black: "#1a102f",
    red: "#fe4450",
    green: "#72f1b8",
    yellow: "#fede5d",
    blue: "#03edf9",
    magenta: "#ff7edb",
    cyan: "#03edf9",
    white: "#ffffff",
    brightBlack: "#495495",
    brightRed: "#fe4450",
    brightGreen: "#72f1b8",
    brightYellow: "#fede5d",
    brightBlue: "#03edf9",
    brightMagenta: "#ff7edb",
    brightCyan: "#03edf9",
    brightWhite: "#ffffff",
  },
  night: {
    background: "#0f172a",
    foreground: "#e2e8f0",
    cursor: "#38bdf8",
    cursorAccent: "#0f172a",
    selectionBackground: "#334155",
    black: "#0f172a",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#facc15",
    blue: "#38bdf8",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#e2e8f0",
    brightBlack: "#64748b",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#0284c7",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#ffffff",
  },
  nord: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    cursorAccent: "#2e3440",
    selectionBackground: "#434c5e",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  "nord-dark": {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    cursorAccent: "#2e3440",
    selectionBackground: "#434c5e",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  dark: {
    background: "#121212",
    foreground: "#d4d4d4",
    cursor: "#ffffff",
    cursorAccent: "#121212",
    selectionBackground: "#264f78",
    black: "#000000",
    red: "#cd3131",
    green: "#0dbc79",
    yellow: "#e5e510",
    blue: "#2472c8",
    magenta: "#bc3fbc",
    cyan: "#11a8cd",
    white: "#e5e5e5",
    brightBlack: "#666666",
    brightRed: "#f14c4c",
    brightGreen: "#23d18b",
    brightYellow: "#f5f543",
    brightBlue: "#3b8eea",
    brightMagenta: "#d670d6",
    brightCyan: "#29b8db",
    brightWhite: "#ffffff",
  },
  "pure-black": {
    background: "#000000",
    foreground: "#e5e5e5",
    cursor: "#ffffff",
    cursorAccent: "#000000",
    selectionBackground: "#333333",
    black: "#000000",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#facc15",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#38bdf8",
    white: "#e5e5e5",
    brightBlack: "#52525b",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#0ea5e9",
    brightWhite: "#ffffff",
  },
  "tokyo-night": {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    cursorAccent: "#1a1b26",
    selectionBackground: "#283457",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#414868",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },
  "catppuccin-mocha": {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    cursorAccent: "#1e1e2e",
    selectionBackground: "#45475a",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
};

export const TERMINAL_THEME_OPTIONS: readonly TerminalThemeOption[] = [
  {
    id: "auto",
    label: "Auto (Match App Theme)",
    group: "auto",
    background: "transparent",
    foreground: "currentColor",
  },
  // Light Themes
  {
    id: "github-light",
    label: "GitHub Light",
    group: "light",
    background: "#ffffff",
    foreground: "#24292f",
  },
  {
    id: "one-light",
    label: "One Light",
    group: "light",
    background: "#fafafa",
    foreground: "#383a42",
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    group: "light",
    background: "#fdf6e3",
    foreground: "#657b83",
  },
  {
    id: "nord-light",
    label: "Nord Light",
    group: "light",
    background: "#eceff4",
    foreground: "#2e3440",
  },
  // Dark Themes
  {
    id: "dracula",
    label: "Dracula",
    group: "dark",
    background: "#1e1f29",
    foreground: "#f8f8f2",
  },
  {
    id: "night",
    label: "Night Slate",
    group: "dark",
    background: "#0f172a",
    foreground: "#e2e8f0",
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    group: "dark",
    background: "#1a1b26",
    foreground: "#c0caf5",
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    group: "dark",
    background: "#1e1e2e",
    foreground: "#cdd6f4",
  },
  {
    id: "nord",
    label: "Nord Dark",
    group: "dark",
    background: "#2e3440",
    foreground: "#d8dee9",
  },
  {
    id: "dark",
    label: "VS Code Dark+",
    group: "dark",
    background: "#121212",
    foreground: "#d4d4d4",
  },
  {
    id: "pure-black",
    label: "Pure Black (OLED)",
    group: "dark",
    background: "#000000",
    foreground: "#e5e5e5",
  },
  {
    id: "synthwave",
    label: "Synthwave '84",
    group: "dark",
    background: "#1a102f",
    foreground: "#f92aad",
  },
];

/**
 * Resolves the appropriate XTerm ITheme object based on the user's terminal theme
 * preference ("auto" or a specific theme id) and the current application theme.
 */
export function resolveTerminalTheme(
  terminalPreference: string = "auto",
  appThemeId: string = "dracula"
): ITheme {
  if (terminalPreference && terminalPreference !== "auto") {
    return TERMINAL_THEMES[terminalPreference] || TERMINAL_THEMES.dracula;
  }

  const isLight = LIGHT_THEMES.some((t) => t.id === appThemeId);

  if (isLight) {
    if (appThemeId === "nord") {
      return TERMINAL_THEMES["nord-light"];
    }
    if (
      appThemeId === "retro" ||
      appThemeId === "garden" ||
      appThemeId === "caramellatte"
    ) {
      return TERMINAL_THEMES["solarized-light"];
    }
    if (appThemeId === "lofi" || appThemeId === "wireframe") {
      return TERMINAL_THEMES["one-light"];
    }
    return TERMINAL_THEMES["github-light"];
  }

  // Dark themes mapping
  if (appThemeId === "dracula") {
    return TERMINAL_THEMES.dracula;
  }
  if (appThemeId === "synthwave") {
    return TERMINAL_THEMES.synthwave;
  }
  if (appThemeId === "night" || appThemeId === "abyss") {
    return TERMINAL_THEMES.night;
  }
  if (appThemeId === "nord") {
    return TERMINAL_THEMES.nord;
  }
  if (appThemeId === "black" || appThemeId === "luxury") {
    return TERMINAL_THEMES["pure-black"];
  }
  if (appThemeId === "sunset") {
    return TERMINAL_THEMES["tokyo-night"];
  }

  return TERMINAL_THEMES[appThemeId] || TERMINAL_THEMES.dracula;
}

/**
 * Legacy lookup helper maintaining backwards compatibility.
 */
export function getTerminalTheme(themeName: string): ITheme {
  return resolveTerminalTheme("auto", themeName);
}
