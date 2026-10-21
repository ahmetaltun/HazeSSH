import type { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import type { GpuAccelerationMode } from "@/stores/useTerminalSettingsStore";

export type ActiveRendererType = "webgl" | "canvas" | "dom";

export interface TerminalRendererHandle {
  readonly activeType: ActiveRendererType;
  readonly dispose: () => void;
}

/**
 * Attaches the appropriate rendering backend to an Xterm.js instance according
 * to the requested GPU acceleration mode, implementing a graceful fallback cascade:
 *
 * Tier 1: WebGL2 (Hardware-accelerated batch rendering at 60–120 FPS)
 * Tier 2: Canvas 2D (Hardware-accelerated 2D context; immune to the 16-WebGL context limit)
 * Tier 3: DOM (Universal pure software fallback for constrained/broken environments)
 *
 * @param term Initialized and DOM-mounted Terminal instance
 * @param mode Configured GPU acceleration mode ("auto" | "webgl" | "canvas" | "off")
 * @returns Handle containing active renderer type and a cleanup callback
 */
export function attachTerminalRenderer(
  term: Terminal,
  mode: GpuAccelerationMode = "auto"
): TerminalRendererHandle {
  let currentWebgl: WebglAddon | null = null;
  let currentCanvas: CanvasAddon | null = null;
  let activeType: ActiveRendererType = "dom";
  let isDisposed = false;

  const cleanup = () => {
    isDisposed = true;
    if (currentWebgl) {
      try {
        currentWebgl.dispose();
      } catch (err) {
        console.warn("[Haze Terminal] Error while disposing WebGL addon:", err);
      }
      currentWebgl = null;
    }

    if (currentCanvas) {
      try {
        currentCanvas.dispose();
      } catch (err) {
        console.warn("[Haze Terminal] Error while disposing Canvas addon:", err);
      }
      currentCanvas = null;
    }

    activeType = "dom";
  };

  const tryLoadCanvas = (): boolean => {
    if (isDisposed) return false;
    try {
      const canvasAddon = new CanvasAddon();
      term.loadAddon(canvasAddon);
      currentCanvas = canvasAddon;
      activeType = "canvas";
      return true;
    } catch (err) {
      console.warn(
        "[Haze Terminal] Canvas 2D renderer failed to initialize. Falling back to native DOM renderer:",
        err
      );
      activeType = "dom";
      return false;
    }
  };

  const tryLoadWebGL = (): boolean => {
    if (isDisposed) return false;
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        console.warn(
          "[Haze Terminal] WebGL context was lost (GPU driver reset or browser max 16-context limit reached). Gracefully hot-swapping to 2D Canvas renderer."
        );
        try {
          webglAddon.dispose();
        } catch {
          // Addon context might already be dead
        }
        currentWebgl = null;
        if (!isDisposed) {
          tryLoadCanvas();
        }
      });

      term.loadAddon(webglAddon);
      currentWebgl = webglAddon;
      activeType = "webgl";
      return true;
    } catch (err) {
      console.warn(
        "[Haze Terminal] WebGL initialization failed (unsupported GPU, virtualized display, or restricted webview context). Cascading to Canvas 2D renderer:",
        err
      );
      return tryLoadCanvas();
    }
  };

  // Dispatch based on user preference
  switch (mode) {
    case "off":
      // Explicitly requested software DOM rendering
      activeType = "dom";
      break;

    case "canvas":
      // Explicitly requested 2D Canvas acceleration (bypasses WebGL context limits)
      tryLoadCanvas();
      break;

    case "webgl":
      // Explicitly requested WebGL2; falls back to Canvas if WebGL crashes
      if (!tryLoadWebGL()) {
        tryLoadCanvas();
      }
      break;

    case "auto":
    default:
      // Adaptive tiering: WebGL -> Canvas -> DOM
      if (!tryLoadWebGL()) {
        tryLoadCanvas();
      }
      break;
  }

  return {
    get activeType() {
      return activeType;
    },
    dispose: cleanup,
  };
}
