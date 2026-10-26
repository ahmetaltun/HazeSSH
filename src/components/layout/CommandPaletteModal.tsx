import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import {
  Search,
  Server,
  FolderGit2,
  Network,
  Code2,
  History,
  Settings,
  Columns2,
  Rows2,
  X,
  Palette,
  Play,
  ArrowRight,
  Plus,
  Radio,
  Keyboard,
  Sidebar,
  Maximize2,
  Minus,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useBroadcastStore } from "@/stores/useBroadcastStore";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useThemeStore, AVAILABLE_THEMES } from "@/stores/useThemeStore";
import { useTerminalRegistryStore } from "@/stores/useTerminalRegistryStore";
import { formatShortcut } from "@/utils/platform";
import type { NavigationView } from "@/types/navigation";

interface PaletteItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly category: "Hosts" | "Actions" | "Navigation" | "Snippets" | "Themes";
  readonly icon: typeof Search;
  readonly badge?: string;
  readonly onSelect: () => void;
}

export function CommandPaletteModal() {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setView,
    setActiveSection,
    toggleSidebar,
    setShortcutsModalOpen,
  } = useLayoutStore();
  const { hosts } = useHostStore();
  const { snippets } = useSnippetStore();
  const { openTab, splitActivePane, closePane, getActiveTab } = useMultiplexerStore();
  const { setTheme, currentTheme } = useThemeStore();
  const { getActiveSession } = useTerminalRegistryStore();
  const { isBroadcastEnabled, toggleBroadcast } = useBroadcastStore();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input automatically when opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCommandPaletteOpen]);

  // Construct all possible actions
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // 1. Hosts
    hosts.forEach((h) => {
      items.push({
        id: `host_${h.id}`,
        title: h.label || h.hostname,
        subtitle: `${h.username ? `${h.username}@` : ""}${h.hostname}:${h.port}`,
        category: "Hosts",
        icon: Server,
        badge: h.auth_type === "telnet" ? "telnet" : "ssh",
        onSelect: () => {
          openTab(
            {
              title: h.label || h.hostname,
              hostname: h.hostname,
              port: h.port,
              username: h.username ?? undefined,
              hostId: h.id,
              connectionType: h.auth_type === "telnet" ? "telnet" : "ssh",
              status: "connecting",
            },
            h.label || h.hostname
          );
          setActiveSection("terminal");
        },
      });
    });

    // 2. Terminal Workspace Actions
    items.push(
      {
        id: "action_new_tab",
        title: "New Local Terminal Tab",
        subtitle: "Launch a clean local shell in a new tab",
        category: "Actions",
        icon: Plus,
        badge: formatShortcut("⌘T", "Ctrl+T"),
        onSelect: () => {
          openTab({ title: "Local Terminal", status: "idle" });
          setActiveSection("terminal");
        },
      },
      {
        id: "action_split_vert",
        title: "Split Active Pane Right (Horizontal)",
        subtitle: "Add a side-by-side terminal pane",
        category: "Actions",
        icon: Columns2,
        badge: formatShortcut("⌘\\", "Ctrl+\\"),
        onSelect: () => {
          splitActivePane("horizontal");
          setActiveSection("terminal");
        },
      },
      {
        id: "action_split_horiz",
        title: "Split Active Pane Down (Vertical)",
        subtitle: "Add a stacked terminal pane",
        category: "Actions",
        icon: Rows2,
        badge: formatShortcut("⌘⇧\\", "Ctrl+Shift+\\"),
        onSelect: () => {
          splitActivePane("vertical");
          setActiveSection("terminal");
        },
      },
      {
        id: "action_close_pane",
        title: "Close Current Pane",
        subtitle: "Close the currently focused terminal pane",
        category: "Actions",
        icon: X,
        badge: formatShortcut("⌘W", "Ctrl+W"),
        onSelect: () => {
          const tab = getActiveTab();
          if (tab) {
            closePane(tab.id, tab.activePaneId);
          }
        },
      },
      {
        id: "action_toggle_broadcast",
        title: isBroadcastEnabled ? "Disable Broadcast Input Mode" : "Enable Broadcast Input Mode",
        subtitle: isBroadcastEnabled
          ? "Stop mirroring keystrokes across open terminal panes"
          : "Mirror keystrokes entered in active pane to other panes",
        category: "Actions",
        icon: Radio,
        badge: formatShortcut("⌘⌥B", "Ctrl+Alt+B"),
        onSelect: () => {
          toggleBroadcast();
        },
      },
      {
        id: "action_toggle_sidebar",
        title: "Toggle Sidebar",
        subtitle: "Expand or collapse navigation sidebar",
        category: "Actions",
        icon: Sidebar,
        badge: formatShortcut("⌘B", "Ctrl+B"),
        onSelect: () => {
          toggleSidebar();
        },
      },
      {
        id: "action_shortcuts_modal",
        title: "Keyboard Shortcuts",
        subtitle: "View comprehensive list of all desktop hotkeys",
        category: "Actions",
        icon: Keyboard,
        badge: formatShortcut("⌘/", "Ctrl+/"),
        onSelect: () => {
          setShortcutsModalOpen(true);
        },
      },
      {
        id: "action_toggle_maximize",
        title: "Toggle Window Maximize",
        subtitle: "Maximize or restore desktop application window",
        category: "Actions",
        icon: Maximize2,
        onSelect: () => {
          void getCurrentWindow().toggleMaximize();
        },
      },
      {
        id: "action_minimize_window",
        title: "Minimize Window",
        subtitle: "Minimize desktop application window",
        category: "Actions",
        icon: Minus,
        onSelect: () => {
          void getCurrentWindow().minimize();
        },
      }
    );

    // 3. Navigation Views
    const navViews: Array<{
      id: NavigationView;
      label: string;
      shortcut: string;
      icon: typeof Search;
    }> = [
      { id: "hosts", label: "Hosts & Groups", shortcut: "⌘1", icon: Server },
      { id: "tunnels", label: "Port Forwarding & Tunnels", shortcut: "⌘2", icon: Network },
      { id: "sftp", label: "SFTP File Manager", shortcut: "⌘3", icon: FolderGit2 },
      { id: "snippets", label: "Snippets & Scripts", shortcut: "⌘4", icon: Code2 },
      { id: "history", label: "Session Logs", shortcut: "⌘5", icon: History },
      { id: "settings", label: "Settings & Vault", shortcut: "⌘,", icon: Settings },
    ];

    navViews.forEach((nav) => {
      items.push({
        id: `nav_${nav.id}`,
        title: `Go to ${nav.label}`,
        subtitle: `Switch to ${nav.label} management view`,
        category: "Navigation",
        icon: nav.icon,
        badge: formatShortcut(nav.shortcut),
        onSelect: () => {
          setView(nav.id);
          setActiveSection("management");
        },
      });
    });

    // 4. Snippets
    snippets.forEach((s) => {
      items.push({
        id: `snippet_${s.id}`,
        title: `Run: ${s.title}`,
        subtitle: s.script,
        category: "Snippets",
        icon: Play,
        badge: s.tags?.[0],
        onSelect: () => {
          const activeSession = getActiveSession();
          if (activeSession) {
            void activeSession.sendCommand(s.script);
            setActiveSection("terminal");
          } else {
            // Open snippets view if no terminal is open
            setView("snippets");
            setActiveSection("management");
          }
        },
      });
    });

    // 5. Themes
    AVAILABLE_THEMES.forEach((t) => {
      items.push({
        id: `theme_${t.id}`,
        title: `Set Theme: ${t.label}`,
        subtitle: t.id === currentTheme ? "Currently active" : `Switch aesthetic to ${t.label}`,
        category: "Themes",
        icon: Palette,
        badge: t.id === currentTheme ? "Active" : undefined,
        onSelect: () => {
          setTheme(t.id);
        },
      });
    });

    return items;
  }, [
    hosts,
    snippets,
    openTab,
    splitActivePane,
    closePane,
    getActiveTab,
    setView,
    setActiveSection,
    getActiveSession,
    setTheme,
    currentTheme,
  ]);

  // Filter items based on user query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 40); // show top items by default

    return allItems
      .filter((item) => {
        return (
          item.title.toLowerCase().includes(q) ||
          item.subtitle?.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.badge?.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [allItems, query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        target.onSelect();
        setCommandPaletteOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-[12vh] px-4 animate-in fade-in duration-150"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="bg-base-200 border border-base-300 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-base-300 gap-3 bg-base-100/50">
          <Search className="w-5 h-5 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search hosts, commands, views, snippets, themes..."
            className="flex-1 bg-transparent border-none outline-none text-base font-medium placeholder:text-base-content/40 text-base-content"
          />
          <kbd className="kbd kbd-sm font-mono text-[10px]">esc</kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 space-y-1 divide-y divide-base-300/30"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-base-content/50 text-sm">
              No matching commands or hosts found for "{query}"
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.onSelect();
                    setCommandPaletteOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-100 ${
                    isSelected
                      ? "bg-primary text-primary-content font-medium shadow-xs"
                      : "hover:bg-base-300/60 text-base-content"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-primary-content/20 text-primary-content"
                          : "bg-base-300 text-primary"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <div className="truncate text-sm leading-tight flex items-center gap-2">
                        <span>{item.title}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-semibold font-mono ${
                            isSelected
                              ? "bg-primary-content/20 text-primary-content"
                              : "bg-base-300 text-base-content/60"
                          }`}
                        >
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <div
                          className={`truncate text-xs mt-0.5 ${
                            isSelected ? "text-primary-content/80 font-normal" : "text-base-content/50"
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.badge && (
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                          isSelected
                            ? "bg-primary-content/25 text-primary-content"
                            : "bg-base-300 text-base-content/70"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isSelected && <ArrowRight className="w-4 h-4 text-primary-content/90" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div className="px-4 py-2 border-t border-base-300 bg-base-100/40 text-[11px] text-base-content/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="kbd kbd-xs">↑</kbd> <kbd className="kbd kbd-xs">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="kbd kbd-xs">↵</kbd> Select
            </span>
            <span>
              <kbd className="kbd kbd-xs">esc</kbd> Close
            </span>
          </div>
          <span className="font-mono text-[10px] text-primary">Haze SSH</span>
        </div>
      </div>
    </div>
  );
}
