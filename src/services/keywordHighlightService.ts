import type { Terminal, IDecoration, IMarker } from "@xterm/xterm";

export type HighlightStyleMode = "underline" | "badge" | "outline";

export interface HighlightRule {
  id: string;
  name: string;
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  style: {
    backgroundColor: string;
    borderColor?: string;
    color?: string;
    fontWeight?: string;
  };
  enabled: boolean;
  category: "error" | "warning" | "success" | "network" | "custom";
}

export const DEFAULT_HIGHLIGHT_RULES: readonly HighlightRule[] = [
  {
    id: "rule-critical",
    name: "Critical & Fatal",
    pattern: "\\b(FATAL|CRITICAL|EMERGENCY|FAILURE|FAILED|PANIC|SEGFAULT)\\b",
    isRegex: true,
    caseSensitive: false,
    style: {
      backgroundColor: "rgba(239, 68, 68, 0.12)",
      borderColor: "#ef4444",
      fontWeight: "bold",
    },
    enabled: true,
    category: "error",
  },
  {
    id: "rule-error",
    name: "Errors & Exceptions",
    pattern: "\\b(ERROR|ERR|EXCEPTION|DENIED|REFUSED|TIMEOUT|TIMED OUT)\\b",
    isRegex: true,
    caseSensitive: false,
    style: {
      backgroundColor: "rgba(239, 68, 68, 0.08)",
      borderColor: "#f87171",
      fontWeight: "600",
    },
    enabled: true,
    category: "error",
  },
  {
    id: "rule-warning",
    name: "Warnings & Notices",
    pattern: "\\b(WARNING|WARN|DEPRECATED|CAUTION|ALERT)\\b",
    isRegex: true,
    caseSensitive: false,
    style: {
      backgroundColor: "rgba(245, 158, 11, 0.08)",
      borderColor: "#f59e0b",
      fontWeight: "600",
    },
    enabled: true,
    category: "warning",
  },
  {
    id: "rule-success",
    name: "Success & Active",
    pattern: "\\b(SUCCESS|SUCCESSFUL|PASSED|ONLINE|READY|ACTIVE:\\s*ACTIVE)\\b",
    isRegex: true,
    caseSensitive: false,
    style: {
      backgroundColor: "rgba(16, 185, 129, 0.08)",
      borderColor: "#10b981",
      fontWeight: "600",
    },
    enabled: true,
    category: "success",
  },
  {
    id: "rule-ipv4",
    name: "IPv4 Addresses",
    pattern: "\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b",
    isRegex: true,
    caseSensitive: false,
    style: {
      backgroundColor: "rgba(6, 182, 212, 0.08)",
      borderColor: "#06b6d4",
    },
    enabled: true,
    category: "network",
  },
  {
    id: "rule-urls",
    name: "URLs",
    pattern: "https?:\\/\\/[^\\s<>'\"{}|\\\\^`]+",
    isRegex: true,
    caseSensitive: false,
    style: {
      backgroundColor: "rgba(139, 92, 246, 0.08)",
      borderColor: "#8b5cf6",
    },
    enabled: true,
    category: "network",
  },
];

interface ActiveDecorationEntry {
  decoration: IDecoration;
  marker: IMarker;
}

export function applyOpacity(colorStr: string, opacity: number): string {
  if (!colorStr) return `rgba(239, 68, 68, ${opacity})`;
  if (colorStr.startsWith("rgba(")) {
    return colorStr.replace(/,\s*[\d.]+\)$/, `, ${opacity})`);
  }
  if (colorStr.startsWith("rgb(")) {
    return colorStr.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }
  if (colorStr.startsWith("#")) {
    const clean = colorStr.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return colorStr;
}

export class TerminalHighlighter {
  private lineDecorations = new Map<number, ActiveDecorationEntry[]>();
  private compiledRules: Array<{ rule: HighlightRule; regex: RegExp }> = [];

  constructor(
    private readonly term: Terminal,
    private rules: readonly HighlightRule[] = DEFAULT_HIGHLIGHT_RULES,
    private isEnabled = true,
    private styleMode: HighlightStyleMode = "underline",
    private boxOpacity = 0.10
  ) {
    this.recompileRules();
  }

  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) return;
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearDecorations();
    } else {
      this.rescanVisibleBuffer();
    }
  }

  public setStyleOptions(styleMode: HighlightStyleMode, boxOpacity: number): void {
    const changed = this.styleMode !== styleMode || Math.abs(this.boxOpacity - boxOpacity) > 0.005;
    this.styleMode = styleMode;
    this.boxOpacity = boxOpacity;
    if (changed && this.isEnabled) {
      this.clearDecorations();
      this.rescanVisibleBuffer();
    }
  }

  public updateRules(newRules: readonly HighlightRule[]): void {
    this.rules = newRules;
    this.recompileRules();
    this.clearDecorations();
    if (this.isEnabled) {
      this.rescanVisibleBuffer();
    }
  }

  private recompileRules(): void {
    this.compiledRules = [];
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      try {
        const flags = rule.caseSensitive ? "g" : "gi";
        const regex = rule.isRegex
          ? new RegExp(rule.pattern, flags)
          : new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
        this.compiledRules.push({ rule, regex });
      } catch (err) {
        console.warn(`[Haze Highlighter] Failed to compile rule '${rule.name}':`, err);
      }
    }
  }

  public clearLineDecorations(lineIndex: number): void {
    const entries = this.lineDecorations.get(lineIndex);
    if (entries) {
      for (const entry of entries) {
        entry.decoration.dispose();
        entry.marker.dispose();
      }
      this.lineDecorations.delete(lineIndex);
    }
  }

  public scanLine(lineIndex: number): void {
    if (!this.isEnabled || this.compiledRules.length === 0) return;

    // Remove any previous decorations on this line to prevent overlapping and stacking opacity
    this.clearLineDecorations(lineIndex);

    const buffer = this.term.buffer.active;
    const line = buffer.getLine(lineIndex);
    if (!line) return;

    const text = line.translateToString(true);
    if (!text.trim()) return;

    const cursorYOffset = lineIndex - buffer.baseY - buffer.cursorY;
    const lineEntries: ActiveDecorationEntry[] = [];

    for (const { rule, regex } of this.compiledRules) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchIndex = match.index;
        const matchLength = match[0].length;
        if (matchLength === 0) break;

        try {
          const marker = this.term.registerMarker(cursorYOffset);
          if (!marker) continue;

          const decoration = this.term.registerDecoration({
            marker,
            x: matchIndex,
            width: matchLength,
          });

          if (decoration) {
            const currentMode = this.styleMode;
            const currentOpacity = this.boxOpacity;
            const accentColor = rule.style.borderColor || rule.style.backgroundColor || "#ef4444";

            decoration.onRender((element: HTMLElement) => {
              element.style.boxSizing = "border-box";
              element.style.pointerEvents = "none";

              if (currentMode === "underline") {
                // Highlight text only with crisp colored bottom rule; zero background box obscuring text
                element.style.backgroundColor = "transparent";
                element.style.border = "none";
                element.style.borderBottom = `2px solid ${accentColor}`;
                element.style.borderRadius = "0px";
              } else if (currentMode === "outline") {
                // Crisp colored outline box without background fill
                element.style.backgroundColor = "transparent";
                element.style.border = `1px solid ${accentColor}`;
                element.style.borderRadius = "3px";
              } else {
                // Subtle badge mode: low-opacity tinted background + soft outline
                element.style.backgroundColor = applyOpacity(rule.style.backgroundColor, currentOpacity);
                element.style.border = `1px solid ${applyOpacity(accentColor, Math.min(0.45, currentOpacity * 2.5))}`;
                element.style.borderRadius = "3px";
              }
            });

            const entry: ActiveDecorationEntry = { decoration, marker };
            lineEntries.push(entry);

            marker.onDispose(() => {
              decoration.dispose();
            });
          }
        } catch {
          // Alternative buffer or marker limit hit
        }
      }
    }

    if (lineEntries.length > 0) {
      this.lineDecorations.set(lineIndex, lineEntries);
    }

    // Prune distant off-screen lines to prevent unbounded memory growth
    if (this.lineDecorations.size > 500) {
      const minKeptLine = Math.max(0, buffer.baseY - 100);
      for (const [idx, entries] of this.lineDecorations.entries()) {
        if (idx < minKeptLine) {
          for (const entry of entries) {
            entry.decoration.dispose();
            entry.marker.dispose();
          }
          this.lineDecorations.delete(idx);
        }
      }
    }
  }

  public rescanVisibleBuffer(): void {
    if (!this.isEnabled) return;
    const buffer = this.term.buffer.active;
    const startY = Math.max(0, buffer.baseY);
    const endY = Math.min(buffer.length, buffer.baseY + this.term.rows);

    for (let y = startY; y < endY; y++) {
      this.scanLine(y);
    }
  }

  public clearDecorations(): void {
    for (const entries of this.lineDecorations.values()) {
      for (const entry of entries) {
        entry.decoration.dispose();
        entry.marker.dispose();
      }
    }
    this.lineDecorations.clear();
  }

  public dispose(): void {
    this.clearDecorations();
    this.compiledRules = [];
  }
}
