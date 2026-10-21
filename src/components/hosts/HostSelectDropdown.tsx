import { useState, useRef, useEffect } from "react";
import { Server, ChevronDown, Check, Search } from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import type { Host } from "@/types/host";

export interface HostSelectDropdownProps {
  selectedHostId: string;
  onSelect: (hostId: string) => void;
  hosts?: readonly Host[];
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  placeholder?: string;
}

export function HostSelectDropdown({
  selectedHostId,
  onSelect,
  hosts: customHosts,
  disabled = false,
  align = "end",
  className = "w-72 sm:w-80",
  buttonClassName = "",
  menuClassName = "",
  placeholder = "Select a host...",
}: HostSelectDropdownProps) {
  const storeHosts = useHostStore((state) => state.hosts);
  const hosts = customHosts ?? storeHosts;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedHost = hosts.find((h) => h.id === selectedHostId);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && hosts.length > 5) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, hosts.length]);

  // Handle escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  const filteredHosts = hosts.filter((host) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      host.label.toLowerCase().includes(query) ||
      host.hostname.toLowerCase().includes(query) ||
      host.username?.toLowerCase().includes(query) ||
      host.tags?.some((t) => t.toLowerCase().includes(query))
    );
  });

  const handleSelect = (hostId: string) => {
    onSelect(hostId);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
      className={`dropdown relative ${align === "end" ? "dropdown-end" : ""} ${
        isOpen ? "dropdown-open" : ""
      } ${className}`}
    >
      {/* Trigger Button styled cleanly like a form selector */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full h-8 px-3 rounded-lg border bg-base-100 hover:bg-base-200/60 transition-all font-medium text-xs flex items-center justify-between shadow-xs select-none ${
          isOpen
            ? "border-primary ring-1 ring-primary/25 bg-base-200/40"
            : "border-base-300"
        } ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 text-left">
          {selectedHost ? (
            <>
              {selectedHost.color ? (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: selectedHost.color }}
                />
              ) : (
                <Server className="w-3.5 h-3.5 text-base-content/60 shrink-0" />
              )}
              <span className="font-semibold text-base-content truncate shrink-0 max-w-[140px]">
                {selectedHost.label}
              </span>
              <span className="text-[11px] text-base-content/50 font-normal font-mono truncate">
                ({selectedHost.hostname}:{selectedHost.port})
              </span>
            </>
          ) : (
            <span className="text-base-content/50 truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-base-content/60 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu Content - matches trigger width exactly */}
      {isOpen && (
        <div
          className={`dropdown-content z-50 mt-1.5 p-1.5 shadow-2xl bg-base-200 border border-base-300 rounded-lg w-full min-w-full left-0 right-0 max-h-80 flex flex-col ${menuClassName}`}
        >
          {/* Search bar when there are more than 5 hosts */}
          {hosts.length > 5 && (
            <div className="p-1 pb-1.5 border-b border-base-300/60 mb-1">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search hosts..."
                  className="input input-xs input-bordered w-full pl-8 text-xs bg-base-100 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Hosts List */}
          <div className="flex flex-col gap-0.5 w-full overflow-y-auto max-h-60 flex-1">
            {filteredHosts.length === 0 ? (
              <div className="p-3 text-center text-xs text-base-content/50">
                {hosts.length === 0 ? "No hosts configured" : "No matching hosts found"}
              </div>
            ) : (
              filteredHosts.map((host) => {
                const isSelected = host.id === selectedHostId;
                return (
                  <button
                    key={host.id}
                    type="button"
                    onClick={() => handleSelect(host.id)}
                    className={`w-full py-2 px-2.5 flex items-center justify-between rounded-lg transition-colors text-left ${
                      isSelected
                        ? "bg-primary text-primary-content font-bold shadow-xs"
                        : "hover:bg-base-300/80 text-base-content"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {host.color ? (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: host.color }}
                        />
                      ) : (
                        <Server
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? "text-primary-content" : "text-base-content/50"
                          }`}
                        />
                      )}
                      <div className="min-w-0 flex-1 truncate">
                        <div className="text-xs truncate font-semibold leading-tight">
                          {host.label}
                        </div>
                        <div
                          className={`text-[10px] font-mono truncate ${
                            isSelected ? "text-primary-content/80" : "text-base-content/60"
                          }`}
                        >
                          {host.hostname}:{host.port}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5] ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
