import { useEffect } from "react";
import { Command, X, Laptop, Terminal, Split, FolderGit2 } from "lucide-react";
import { formatShortcut } from "@/utils/platform";

interface ShortcutsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

interface ShortcutItem {
  readonly description: string;
  readonly mac: string;
  readonly win: string;
}

interface ShortcutSection {
  readonly title: string;
  readonly icon: React.ReactNode;
  readonly shortcuts: readonly ShortcutItem[];
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections: readonly ShortcutSection[] = [
    {
      title: "General Navigation",
      icon: <Laptop className="w-4 h-4 text-primary" />,
      shortcuts: [
        { description: "Open Command Palette", mac: "⌘K", win: "Ctrl+K" },
        { description: "Developer Command Palette", mac: "⌘⇧P", win: "Ctrl+Shift+P" },
        { description: "Open Preferences / Settings", mac: "⌘,", win: "Ctrl+," },
        { description: "Toggle Sidebar Collapse", mac: "⌘B", win: "Ctrl+B" },
        { description: "Switch to View 1–6", mac: "⌘1–6", win: "Ctrl+1–6" },
        { description: "Keyboard Shortcuts Help", mac: "⌘/", win: "Ctrl+/" },
      ],
    },
    {
      title: "Terminal & Sessions",
      icon: <Terminal className="w-4 h-4 text-warning" />,
      shortcuts: [
        { description: "New Terminal Tab", mac: "⌘T", win: "Ctrl+T" },
        { description: "Close Active Pane", mac: "⌘W", win: "Ctrl+W" },
        { description: "Close Entire Tab", mac: "⌘⇧W", win: "Ctrl+Shift+W" },
        { description: "Switch to Tab 1–9", mac: "⌘1–9", win: "Alt+1–9" },
        { description: "Next / Previous Tab", mac: "⌃Tab", win: "Ctrl+Tab" },
        { description: "Broadcast Keystrokes Toggle", mac: "⌘⌥B", win: "Ctrl+Alt+B" },
      ],
    },
    {
      title: "Split Panes & Window",
      icon: <Split className="w-4 h-4 text-info" />,
      shortcuts: [
        { description: "Split Right (Horizontal)", mac: "⌘\\", win: "Ctrl+\\" },
        { description: "Split Down (Vertical)", mac: "⌘⇧\\", win: "Ctrl+Shift+\\" },
        { description: "Search in Buffer / View", mac: "⌘F", win: "Ctrl+F" },
        { description: "Dismiss / Close Modal", mac: "Esc", win: "Esc" },
      ],
    },
    {
      title: "SFTP & File Manager",
      icon: <FolderGit2 className="w-4 h-4 text-secondary" />,
      shortcuts: [
        { description: "Select All Files", mac: "⌘A", win: "Ctrl+A" },
        { description: "Deselect All Files", mac: "Esc / ⌘⇧A", win: "Esc / Ctrl+Shift+A" },
        { description: "Delete Selected", mac: "⌘⌫ / Del", win: "Del" },
        { description: "Switch Active Pane", mac: "Tab", win: "Tab" },
        { description: "Multi-select Items", mac: "⌘Click / ⇧Click", win: "Ctrl+Click / ⇧Click" },
      ],
    },
  ];

  return (
    <div
      className="modal modal-open bg-black/60 backdrop-blur-xs select-none z-50 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="modal-box max-w-2xl bg-base-100 border border-base-300 p-0 shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-300 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Command className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-base-content">
                Desktop Keyboard Shortcuts
              </h3>
              <p className="text-xs text-base-content/60">
                Native hotkeys for maximum productivity in Haze SSH
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost btn-circle text-base-content/60 hover:text-base-content"
            aria-label="Close shortcuts modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-base-content/70">
                {sec.icon}
                <span>{sec.title}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sec.shortcuts.map((sc) => (
                  <div
                    key={sc.description}
                    className="flex items-center justify-between p-2 rounded-lg bg-base-200/40 border border-base-300/60 text-xs"
                  >
                    <span className="text-base-content/80 font-medium">
                      {sc.description}
                    </span>
                    <kbd className="kbd kbd-sm font-mono text-xs font-semibold px-2 py-0.5 bg-base-100 shadow-2xs border-base-300">
                      {formatShortcut(sc.mac, sc.win)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-base-300 bg-base-200/30 flex items-center justify-between text-xs text-base-content/60">
          <span>
            Press <kbd className="kbd kbd-xs">Esc</kbd> anytime to dismiss
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-primary px-4"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
