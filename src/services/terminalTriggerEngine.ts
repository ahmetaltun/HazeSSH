export type TriggerMatchType = "regex" | "contains" | "exact";

export type TriggerActionType = "sendText" | "notification" | "sound";

export interface SendTextAction {
  readonly type: "sendText";
  readonly text: string;
}

export interface NotificationAction {
  readonly type: "notification";
  readonly title?: string;
  readonly message?: string;
}

export interface SoundAction {
  readonly type: "sound";
  readonly soundType?: "bell" | "chime" | "warning";
}

export type TriggerAction = SendTextAction | NotificationAction | SoundAction;

export interface TriggerRule {
  readonly id: string;
  readonly name: string;
  readonly pattern: string;
  readonly matchType: TriggerMatchType;
  readonly caseSensitive: boolean;
  readonly scope: "global" | "host";
  readonly hostId?: string;
  readonly enabled: boolean;
  readonly oneShot: boolean;
  readonly cooldownSeconds: number; // Anti-loop cooldown
  readonly action: TriggerAction;
}

// Built-in defaults for common sysadmin scenarios
export const DEFAULT_TRIGGER_RULES: readonly TriggerRule[] = [
  {
    id: "preset-ssh-fingerprint",
    name: "SSH Host Key Confirmation Alert",
    pattern: "Are you sure you want to continue connecting",
    matchType: "contains",
    caseSensitive: false,
    scope: "global",
    enabled: true,
    oneShot: true,
    cooldownSeconds: 10,
    action: {
      type: "notification",
      title: "Haze SSH: Host Key Prompt",
      message: "Remote host key confirmation requested.",
    },
  },
  {
    id: "preset-sudo-password",
    name: "Sudo Password Prompt Sound",
    pattern: "\\[sudo\\] password for",
    matchType: "regex",
    caseSensitive: false,
    scope: "global",
    enabled: true,
    oneShot: false,
    cooldownSeconds: 5,
    action: {
      type: "sound",
      soundType: "warning",
    },
  },
  {
    id: "preset-build-finished",
    name: "Build / Deploy Complete Notification",
    pattern: "(Build succeeded|Deployment complete|Done in [0-9.]+[ms]?|Finished in [0-9.]+[ms]?)",
    matchType: "regex",
    caseSensitive: false,
    scope: "global",
    enabled: true,
    oneShot: false,
    cooldownSeconds: 5,
    action: {
      type: "notification",
      title: "Task Complete",
      message: "Build or long-running command has finished.",
    },
  },
] as const;

// --- Web Audio Alert Synthesizer ---

class WebAudioAlert {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public play(type: "bell" | "chime" | "warning" = "bell"): void {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === "bell") {
        // High-frequency 880Hz bell with exponential decay
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === "chime") {
        // Ascending major chord (C5 -> E5 -> G5)
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + i * 0.08);

          gain.gain.setValueAtTime(0.2, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.4);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.4);
        });
      } else if (type === "warning") {
        // Two-tone alert (440Hz -> 330Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(330, now + 0.15);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (err) {
      console.warn("[WebAudioAlert] Failed to synthesize audio chime:", err);
    }
  }
}

export const audioAlert = new WebAudioAlert();

// --- Desktop Notification Helper ---

export async function sendDesktopNotification(title: string, body?: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      new Notification(title, {
        body: body || "",
        silent: false,
      });
    }
  } catch (err) {
    console.warn("[TriggerEngine] Notification failed:", err);
  }
}

// Regex to strip ANSI formatting for clean regex text comparison
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

const textDecoder = new TextDecoder("utf-8");

/**
 * TerminalTriggerEngine
 * Evaluates streaming terminal output chunks against active Expect / Trigger rules.
 * Enforces rate limiting, single-shot tracking, and loop prevention.
 */
export class TerminalTriggerEngine {
  private tailBuffer = "";
  private readonly maxBufferSize = 2048;
  private readonly lastFiredMap = new Map<string, number>();
  private readonly firedOneShotRules = new Set<string>();

  private readonly onSendText: (text: string) => Promise<void>;
  private readonly hostId?: string;

  constructor(options: {
    hostId?: string;
    onSendText: (text: string) => Promise<void>;
  }) {
    this.hostId = options.hostId;
    this.onSendText = options.onSendText;
  }

  public processChunk(
    data: string | Uint8Array,
    rules: readonly TriggerRule[]
  ): void {
    if (!rules || rules.length === 0) return;

    const rawText = typeof data === "string" ? data : textDecoder.decode(data, { stream: true });
    if (!rawText) return;

    // Strip ANSI escape codes to ensure patterns match raw text predictably
    const cleanText = rawText.replace(ANSI_REGEX, "");

    this.tailBuffer += cleanText;
    if (this.tailBuffer.length > this.maxBufferSize) {
      this.tailBuffer = this.tailBuffer.slice(-this.maxBufferSize);
    }

    const now = performance.now();

    for (const rule of rules) {
      if (!rule.enabled) continue;

      // Scope check: rule must be global or matching current host
      if (rule.scope === "host" && rule.hostId && rule.hostId !== this.hostId) {
        continue;
      }

      // One-shot check
      if (rule.oneShot && this.firedOneShotRules.has(rule.id)) {
        continue;
      }

      // Cooldown / Anti-loop check
      const lastFired = this.lastFiredMap.get(rule.id) || 0;
      const cooldownMs = (rule.cooldownSeconds || 5) * 1000;
      if (now - lastFired < cooldownMs) {
        continue;
      }

      // Pattern evaluation
      let isMatch = false;
      try {
        if (rule.matchType === "regex") {
          const flags = rule.caseSensitive ? "" : "i";
          const regex = new RegExp(rule.pattern, flags);
          isMatch = regex.test(this.tailBuffer);
        } else if (rule.matchType === "exact") {
          if (rule.caseSensitive) {
            isMatch = this.tailBuffer.trim() === rule.pattern;
          } else {
            isMatch = this.tailBuffer.trim().toLowerCase() === rule.pattern.toLowerCase();
          }
        } else {
          // "contains"
          if (rule.caseSensitive) {
            isMatch = this.tailBuffer.includes(rule.pattern);
          } else {
            isMatch = this.tailBuffer.toLowerCase().includes(rule.pattern.toLowerCase());
          }
        }
      } catch (err) {
        console.warn(`[TriggerEngine] Invalid pattern in rule '${rule.name}':`, err);
        continue;
      }

      if (isMatch) {
        this.lastFiredMap.set(rule.id, now);
        if (rule.oneShot) {
          this.firedOneShotRules.add(rule.id);
        }

        // Clear tail buffer on match to avoid immediate re-trigger on subsequent packet
        this.tailBuffer = "";

        this.executeAction(rule);
      }
    }
  }

  private executeAction(rule: TriggerRule): void {
    const action = rule.action;

    switch (action.type) {
      case "sendText": {
        if (action.text) {
          void this.onSendText(action.text);
        }
        break;
      }
      case "notification": {
        const title = action.title || `Haze SSH: ${rule.name}`;
        const message = action.message || `Trigger '${rule.name}' matched.`;
        void sendDesktopNotification(title, message);
        break;
      }
      case "sound": {
        audioAlert.play(action.soundType || "bell");
        break;
      }
    }
  }

  public reset(): void {
    this.tailBuffer = "";
    this.lastFiredMap.clear();
    this.firedOneShotRules.clear();
  }
}
