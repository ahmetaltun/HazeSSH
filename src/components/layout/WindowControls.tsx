import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { isMacOS } from "@/utils/platform";

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // If on macOS, native traffic lights are drawn at top-left by OS
    if (isMacOS) return;

    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();

    // Check initial maximized state
    appWindow
      .isMaximized()
      .then((max) => setIsMaximized(max))
      .catch(() => {});

    // Listen to resize events to update the maximize/restore icon
    appWindow
      .onResized(() => {
        appWindow
          .isMaximized()
          .then((max) => setIsMaximized(max))
          .catch(() => {});
      })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  // On macOS, native traffic lights are placed automatically on the top-left
  if (isMacOS) {
    return null;
  }

  const appWindow = getCurrentWindow();

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (err) {
      console.warn("Failed to minimize window:", err);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch (err) {
      console.warn("Failed to toggle maximize window:", err);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (err) {
      console.warn("Failed to close window:", err);
    }
  };

  return (
    <div className="flex items-center h-full no-drag select-none ml-2 shrink-0">
      <button
        type="button"
        onClick={handleMinimize}
        className="w-10 h-8 flex items-center justify-center text-base-content/70 hover:text-base-content hover:bg-base-300 transition-colors"
        title="Minimize"
        aria-label="Minimize Window"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={handleToggleMaximize}
        className="w-10 h-8 flex items-center justify-center text-base-content/70 hover:text-base-content hover:bg-base-300 transition-colors"
        title={isMaximized ? "Restore" : "Maximize"}
        aria-label={isMaximized ? "Restore Window" : "Maximize Window"}
      >
        {isMaximized ? (
          <Copy className="w-3 h-3 rotate-180" />
        ) : (
          <Square className="w-3 h-3" />
        )}
      </button>

      <button
        type="button"
        onClick={handleClose}
        className="w-10 h-8 flex items-center justify-center text-base-content/70 hover:text-white hover:bg-error transition-colors"
        title="Close"
        aria-label="Close Window"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
