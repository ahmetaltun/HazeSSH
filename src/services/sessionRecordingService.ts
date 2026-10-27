import { api } from "@/services/api";

const textDecoder = new TextDecoder("utf-8");

// --- Asciicast v2 Specification Types ---

export interface AsciicastHeader {
  readonly version: 2;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
  readonly title?: string;
  readonly env?: Record<string, string>;
}

export type AsciicastEvent = [number, "o" | "i" | "r", string];

/**
 * AsciinemaRecorder
 * Records terminal session stdout, user keystrokes (stdin), and window resize events
 * into the industry-standard asciicast v2 format (.cast).
 */
export class AsciinemaRecorder {
  private startTime: number | null = null;
  private header: AsciicastHeader | null = null;
  private events: AsciicastEvent[] = [];
  private recording = false;

  public isRecording(): boolean {
    return this.recording;
  }

  public getDuration(): number {
    if (!this.recording || this.startTime === null) return 0;
    return (performance.now() - this.startTime) / 1000;
  }

  public getEventCount(): number {
    return this.events.length;
  }

  public start(cols: number, rows: number, title?: string): void {
    this.startTime = performance.now();
    this.events = [];
    this.recording = true;

    this.header = {
      version: 2,
      width: Math.max(1, cols || 80),
      height: Math.max(1, rows || 24),
      timestamp: Math.floor(Date.now() / 1000),
      title: title || "Haze Terminal Session",
      env: {
        TERM: "xterm-256color",
        HAZE_CLIENT: "Haze SSH",
      },
    };
  }

  public recordOutput(data: string | Uint8Array): void {
    if (!this.recording || this.startTime === null) return;
    const elapsed = Number(((performance.now() - this.startTime) / 1000).toFixed(6));
    const text = typeof data === "string" ? data : textDecoder.decode(data, { stream: true });
    if (!text) return;
    this.events.push([elapsed, "o", text]);
  }

  public recordInput(data: string): void {
    if (!this.recording || this.startTime === null || !data) return;
    const elapsed = Number(((performance.now() - this.startTime) / 1000).toFixed(6));
    this.events.push([elapsed, "i", data]);
  }

  public recordResize(cols: number, rows: number): void {
    if (!this.recording || this.startTime === null) return;
    const elapsed = Number(((performance.now() - this.startTime) / 1000).toFixed(6));
    this.events.push([elapsed, "r", `${cols}x${rows}`]);
  }

  public stop(): string {
    if (!this.recording) return "";
    this.recording = false;

    const lines: string[] = [];
    if (this.header) {
      lines.push(JSON.stringify(this.header));
    }

    for (const event of this.events) {
      lines.push(JSON.stringify(event));
    }

    // Newline-delimited JSON (.cast v2 format)
    return lines.join("\n") + "\n";
  }
}

// --- Session Audit Logger ---

export interface SessionAuditLogOptions {
  readonly filePath: string;
  readonly withTimestamps?: boolean;
  readonly stripAnsi?: boolean;
}

// Standard regex to match ANSI 7-bit and 8-bit escape sequences
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function formatTimestamp(date: Date): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const millis = pad(date.getMilliseconds(), 3);
  return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}] `;
}

/**
 * SessionAuditLogger
 * Continuously writes terminal stdout to a persistent disk log file.
 * Employs an in-memory queue and 500ms batching flush to prevent disk I/O bottlenecks.
 */
export class SessionAuditLogger {
  private filePath: string;
  private withTimestamps: boolean;
  private stripAnsi: boolean;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;
  private isFlushing = false;
  private isLineStart = true;

  constructor(options: SessionAuditLogOptions) {
    this.filePath = options.filePath;
    this.withTimestamps = options.withTimestamps ?? true;
    this.stripAnsi = options.stripAnsi ?? false;
  }

  public write(data: string | Uint8Array): void {
    if (this.isDisposed) return;

    let text = typeof data === "string" ? data : textDecoder.decode(data, { stream: true });
    if (!text) return;

    if (this.stripAnsi) {
      text = text.replace(ANSI_REGEX, "");
    }

    if (this.withTimestamps) {
      // Prepend timestamp at line beginnings
      let formatted = "";
      for (let i = 0; i < text.length; i++) {
        if (this.isLineStart && text[i] !== "\r" && text[i] !== "\n") {
          formatted += formatTimestamp(new Date());
          this.isLineStart = false;
        }
        formatted += text[i];
        if (text[i] === "\n") {
          this.isLineStart = true;
        }
      }
      this.buffer.push(formatted);
    } else {
      this.buffer.push(text);
    }

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null || this.isDisposed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 500);
  }

  public async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isFlushing) return;
    this.isFlushing = true;
    const chunk = this.buffer.join("");
    this.buffer = [];

    try {
      await api.auditLogAppend(this.filePath, chunk);
    } catch (err) {
      console.error(`[AuditLogger] Failed to write chunk to '${this.filePath}':`, err);
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0 && !this.isDisposed) {
        this.scheduleFlush();
      }
    }
  }

  public async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
