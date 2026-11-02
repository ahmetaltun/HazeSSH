import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Rewind,
  FolderOpen,
  Video,
  Loader2,
  Maximize2,
  Minimize2,
  Info,
} from "lucide-react";
import { api } from "@/services/api";
import { resolveTerminalTheme } from "@/services/terminalThemes";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTerminalSettingsStore } from "@/stores/useTerminalSettingsStore";
import type { RecordingFileInfo } from "@/types/sessionHistory";
import type { AsciicastHeader, AsciicastEvent } from "@/services/sessionRecordingService";
import "@xterm/xterm/css/xterm.css";

interface RecordingPlayerModalProps {
  readonly recordingFile: RecordingFileInfo | null;
  readonly onClose: () => void;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RecordingPlayerModal({ recordingFile, onClose }: RecordingPlayerModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNoOutput, setHasNoOutput] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const headerRef = useRef<AsciicastHeader | null>(null);
  const eventsRef = useRef<AsciicastEvent[]>([]);

  // Duration
  const totalDurationRef = useRef(0);
  const [totalDuration, setTotalDuration] = useState(0);

  // Current playback time
  const currentTimeRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Playback state
  const isPlayingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Speed
  const playbackSpeedRef = useRef(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Scrubbing state
  const wasPlayingBeforeScrubRef = useRef(false);

  const eventIndexRef = useRef<number>(0);
  const lastRafTimeRef = useRef<number | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seek logic: resets terminal and replays events up to target timestamp
  const seekTo = useCallback((targetSeconds: number) => {
    const maxD = totalDurationRef.current;
    const clamped = Math.max(0, Math.min(targetSeconds, maxD));

    currentTimeRef.current = clamped;
    setCurrentTime(clamped);
    lastRafTimeRef.current = null;

    const term = termInstance.current;
    if (!term) return;

    // Reset terminal display buffer
    term.reset();

    const header = headerRef.current;
    if (header?.width && header?.height) {
      term.resize(header.width, header.height);
    } else {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Ignore fit failure if unattached
      }
    }

    const events = eventsRef.current;
    let nextIdx = 0;
    let textChunk = "";

    // Batch consecutive stdout chunks to optimize xterm parser rendering
    for (let i = 0; i < events.length; i++) {
      const [t, type, data] = events[i];
      if (t <= clamped) {
        if (type === "o") {
          textChunk += data;
        } else if (type === "r") {
          if (textChunk) {
            term.write(textChunk);
            textChunk = "";
          }
          const [w, h] = data.split("x").map(Number);
          if (w && h) term.resize(w, h);
        }
        nextIdx = i + 1;
      } else {
        break;
      }
    }

    if (textChunk) {
      term.write(textChunk);
    }

    eventIndexRef.current = nextIdx;
  }, []);

  const play = useCallback(() => {
    if (currentTimeRef.current >= totalDurationRef.current - 0.1) {
      seekTo(0);
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
    lastRafTimeRef.current = null;
  }, [seekTo]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    lastRafTimeRef.current = null;
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  // 1. Initialize Terminal instance on mount
  useEffect(() => {
    if (!recordingFile || !terminalRef.current) return;

    const termThemePref = useTerminalSettingsStore.getState().terminalTheme;
    const appTheme = useThemeStore.getState().currentTheme;
    const resolvedTheme = resolveTerminalTheme(termThemePref, appTheme);

    const term = new Terminal({
      cursorBlink: false,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
      theme: {
        ...resolvedTheme,
        cursor: "transparent",
      },
      scrollback: 5000,
      disableStdin: true,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    termInstance.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      if (!headerRef.current?.width) {
        try {
          fitAddon.fit();
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      termInstance.current = null;
      fitAddonRef.current = null;
    };
  }, [recordingFile]);

  // Re-fit on maximize toggle if no fixed header dimensions
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!headerRef.current?.width) {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // Ignore
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isMaximized]);

  // 2. Load and parse .cast file
  useEffect(() => {
    if (!recordingFile) return;

    setIsLoading(true);
    setError(null);
    setHasNoOutput(false);
    pause();
    currentTimeRef.current = 0;
    setCurrentTime(0);
    eventIndexRef.current = 0;
    headerRef.current = null;
    eventsRef.current = [];

    api
      .sessionRecordingRead(recordingFile.file_path)
      .then((raw) => {
        const lines = raw.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) {
          setError("The recording file is empty.");
          setIsLoading(false);
          return;
        }

        try {
          const header: AsciicastHeader = JSON.parse(lines[0]);
          headerRef.current = header;
        } catch {
          console.warn("Failed to parse asciicast header from line 0.");
        }

        const events: AsciicastEvent[] = [];
        let maxTime = 0;
        let outputCount = 0;

        for (let i = 1; i < lines.length; i++) {
          try {
            const parsed = JSON.parse(lines[i]);
            if (Array.isArray(parsed) && parsed.length >= 3) {
              const time = typeof parsed[0] === "number" ? parsed[0] : parseFloat(parsed[0]);
              if (!isNaN(time)) {
                const type = parsed[1] as "o" | "i" | "r";
                const data = String(parsed[2]);
                events.push([time, type, data]);
                if (type === "o") outputCount++;
                if (time > maxTime) maxTime = time;
              }
            }
          } catch {
            // Ignore malformed line
          }
        }

        eventsRef.current = events;
        totalDurationRef.current = maxTime;
        setTotalDuration(maxTime);
        setHasNoOutput(events.length > 0 && outputCount === 0);
        setIsLoading(false);

        // Resize terminal to recorded dimensions or fit
        const term = termInstance.current;
        const header = headerRef.current;
        if (term) {
          if (header?.width && header?.height) {
            term.resize(header.width, header.height);
          } else {
            try {
              fitAddonRef.current?.fit();
            } catch {
              // Ignore
            }
          }
        }

        // Render initial state and start playing immediately
        initTimeoutRef.current = setTimeout(() => {
          seekTo(0);
          if (events.length > 0) {
            play();
          }
        }, 50);
      })
      .catch((err) => {
        console.error("Failed to load recording:", err);
        setError(String(err));
        setIsLoading(false);
      });

    return () => {
      if (initTimeoutRef.current !== null) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };
  }, [recordingFile, pause, seekTo, play]);

  // 3. Playback animation loop
  useEffect(() => {
    if (!isPlaying) {
      lastRafTimeRef.current = null;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    const loop = (now: number) => {
      if (lastRafTimeRef.current === null) {
        lastRafTimeRef.current = now;
      }

      // Delta ms clamped to max 200ms to avoid tab-switch leap forward
      const deltaMs = Math.min(now - lastRafTimeRef.current, 200);
      lastRafTimeRef.current = now;

      const deltaSeconds = (deltaMs / 1000) * playbackSpeedRef.current;
      const nextTime = currentTimeRef.current + deltaSeconds;
      const maxD = totalDurationRef.current;
      const events = eventsRef.current;
      const term = termInstance.current;

      if (term) {
        let textChunk = "";
        while (
          eventIndexRef.current < events.length &&
          events[eventIndexRef.current][0] <= nextTime
        ) {
          const [, type, data] = events[eventIndexRef.current];
          if (type === "o") {
            textChunk += data;
          } else if (type === "r") {
            if (textChunk) {
              term.write(textChunk);
              textChunk = "";
            }
            const [w, h] = data.split("x").map(Number);
            if (w && h) term.resize(w, h);
          }
          eventIndexRef.current += 1;
        }
        if (textChunk) {
          term.write(textChunk);
        }
      }

      if (nextTime >= maxD) {
        currentTimeRef.current = maxD;
        setCurrentTime(maxD);
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isPlaying]);

  // 4. Keyboard shortcuts
  useEffect(() => {
    if (!recordingFile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(currentTimeRef.current - 5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(currentTimeRef.current + 5);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recordingFile, onClose, togglePlayPause, seekTo]);

  const handleSpeedChange = (speed: number) => {
    playbackSpeedRef.current = speed;
    setPlaybackSpeed(speed);
  };

  if (!recordingFile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div
        className={`bg-base-100 border border-base-300 shadow-2xl flex flex-col overflow-hidden select-none transition-all duration-200 ${
          isMaximized ? "w-full h-full rounded-none" : "w-full max-w-5xl h-[85vh] rounded-2xl"
        }`}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-base-200 flex items-center justify-between shrink-0 bg-base-200/40 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-error/15 text-error flex items-center justify-center shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0 select-none">
              <h3 className="font-bold text-sm text-base-content truncate select-none">
                {recordingFile.title || recordingFile.filename}
              </h3>
              <div className="flex items-center gap-2 text-xs text-base-content/60 select-none">
                <span className="font-mono">{recordingFile.filename}</span>
                {recordingFile.width && recordingFile.height && (
                  <>
                    <span>•</span>
                    <span className="font-mono">
                      {recordingFile.width}x{recordingFile.height}
                    </span>
                  </>
                )}
                <span>•</span>
                <span>{new Date(recordingFile.modified_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 select-none">
            <button
              type="button"
              onClick={() => api.openDirectoryInOs(recordingFile.file_path)}
              className="btn btn-xs btn-ghost gap-1 text-base-content/70 hover:text-base-content"
              title="Reveal in Finder / File Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reveal</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="btn btn-xs btn-circle btn-ghost"
              title={isMaximized ? "Restore window size" : "Maximize window"}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-xs btn-circle btn-ghost ml-1"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Canvas Container */}
        <div className="flex-1 min-h-0 bg-[#0f141c] p-3 relative overflow-auto flex">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-slate-400 gap-2 bg-[#0f141c]">
              <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
              <p className="text-xs">Loading terminal session recording...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-red-400 text-xs text-center p-4 bg-[#0f141c]">
              <p className="font-semibold mb-1">Failed to load recording</p>
              <p>{error}</p>
            </div>
          )}

          {hasNoOutput && !isLoading && !error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>This session recording contains keystroke events, but no terminal output was returned.</span>
            </div>
          )}

          {/* Centered with m-auto so overflowing terminals scroll cleanly from (0,0) without flex clipping */}
          <div
            ref={terminalRef}
            className="m-auto min-w-fit min-h-fit relative"
          />
        </div>

        {/* Playback Controls Footer */}
        <div className="px-5 py-3 border-t border-base-200 bg-base-200/50 flex flex-col gap-2 shrink-0 select-none">
          {/* Scrubber timeline */}
          <div className="flex items-center gap-3 select-none">
            <span className="text-[11px] font-mono text-base-content/70 select-none w-12 shrink-0 text-right">
              {formatDuration(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={totalDuration > 0 ? totalDuration : 1}
              step={0.05}
              value={currentTime}
              onPointerDown={() => {
                wasPlayingBeforeScrubRef.current = isPlayingRef.current;
                if (isPlayingRef.current) {
                  pause();
                }
              }}
              onChange={(e) => {
                const target = parseFloat(e.target.value);
                seekTo(target);
              }}
              onPointerUp={() => {
                if (wasPlayingBeforeScrubRef.current) {
                  play();
                }
              }}
              className="range range-xs range-primary flex-1 min-w-0 cursor-pointer"
            />
            <span className="text-[11px] font-mono text-base-content/70 select-none w-12 shrink-0 text-left">
              {formatDuration(totalDuration)}
            </span>
          </div>

          {/* Control buttons & speed */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  seekTo(0);
                  play();
                }}
                className="btn btn-xs btn-ghost btn-square"
                title="Replay from start"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => seekTo(currentTimeRef.current - 5)}
                className="btn btn-xs btn-ghost btn-square"
                title="Rewind 5 seconds (Left Arrow)"
              >
                <Rewind className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={togglePlayPause}
                className="btn btn-sm btn-primary gap-1 px-3"
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>
              <button
                type="button"
                onClick={() => seekTo(currentTimeRef.current + 5)}
                className="btn btn-xs btn-ghost btn-square"
                title="Forward 5 seconds (Right Arrow)"
              >
                <FastForward className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 select-none">
              <span className="text-xs text-base-content/60 select-none">Speed:</span>
              <div className="join select-none">
                {[0.5, 1, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => handleSpeedChange(speed)}
                    className={`btn btn-xs join-item select-none ${
                      playbackSpeed === speed ? "btn-active btn-primary" : "btn-ghost"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
