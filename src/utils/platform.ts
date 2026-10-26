/**
 * Platform detection and desktop operating system utilities.
 */

export const isMacOS =
  typeof window !== "undefined" &&
  (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
    /Macintosh|Mac OS X/.test(navigator.userAgent));

export const isWindows =
  typeof window !== "undefined" &&
  (/Win/.test(navigator.platform) || /Windows/.test(navigator.userAgent));

export const isLinux =
  typeof window !== "undefined" &&
  (/Linux/.test(navigator.platform) || /Linux/.test(navigator.userAgent));

/**
 * Returns the primary modifier symbol: "⌘" on macOS, "Ctrl" on Windows/Linux.
 */
export const MODIFIER_KEY = isMacOS ? "⌘" : "Ctrl";

/**
 * Formats a shortcut string appropriately for the user's desktop operating system.
 *
 * @example
 * formatShortcut("⌘K", "Ctrl+K") // Returns "⌘K" on Mac, "Ctrl+K" on Win/Linux
 */
export function formatShortcut(macShortcut: string, nonMacShortcut?: string): string {
  if (isMacOS) {
    return macShortcut;
  }
  return nonMacShortcut ?? macShortcut.replace(/⌘/g, "Ctrl+").replace(/⌥/g, "Alt+");
}
