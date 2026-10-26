import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import {
  POPULAR_LANGUAGES,
  getAllAvailableLanguages,
} from "@/utils/codeLanguages";

interface LanguagePickerProps {
  readonly selectedLanguage: string;
  readonly activeLanguageName: string;
  readonly onSelectLanguage: (lang: string) => void;
  readonly className?: string;
}

export function LanguagePicker({
  selectedLanguage,
  activeLanguageName,
  onSelectLanguage,
  className = "",
}: LanguagePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const allLanguages = useMemo(() => getAllAvailableLanguages(), []);

  // Filter languages by search query
  const filteredLanguages = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return allLanguages.filter((l) => l.toLowerCase().includes(q));
  }, [allLanguages, search]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSelect = (lang: string) => {
    onSelectLanguage(lang);
    setIsOpen(false);
    setSearch("");
  };

  const isAuto = selectedLanguage === "auto" || !selectedLanguage;

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="badge badge-sm badge-outline font-mono text-[10px] text-primary border-primary/30 shrink-0 cursor-pointer hover:bg-primary/10 gap-1 select-none transition-colors"
        title="Click to change language syntax highlighting"
      >
        <span>
          {isAuto ? activeLanguageName : `${selectedLanguage} (Manual)`}
        </span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 w-52 max-h-72 bg-base-200 border border-base-300 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-2 border-b border-base-300 bg-base-300/40 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2 text-base-content/40 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search language..."
                className="input input-xs w-full pl-7 pr-2 bg-base-100 text-base-content border-base-300 focus:outline-hidden font-mono text-[11px]"
              />
            </div>
          </div>

          {/* List of Languages */}
          <div className="overflow-y-auto flex-1 p-1 space-y-0.5 max-h-56">
            {search.trim() ? (
              filteredLanguages.length > 0 ? (
                filteredLanguages.map((lang) => {
                  const isSelected = selectedLanguage.toLowerCase() === lang.toLowerCase();
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleSelect(lang)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-content font-bold"
                          : "hover:bg-base-300/70 text-base-content"
                      }`}
                    >
                      <span className="truncate">{lang}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-base-content/50 text-[11px]">
                  No matching languages
                </div>
              )
            ) : (
              <>
                <div className="px-2 py-1 text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                  Mode
                </div>
                <button
                  type="button"
                  onClick={() => handleSelect("auto")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                    isAuto
                      ? "bg-primary text-primary-content font-bold"
                      : "hover:bg-base-300/70 text-base-content"
                  }`}
                >
                  <span className="truncate">Auto ({activeLanguageName})</span>
                  {isAuto && <Check className="w-3 h-3 shrink-0" />}
                </button>

                <div className="px-2 pt-2 pb-1 text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                  Popular Languages
                </div>
                {POPULAR_LANGUAGES.filter((l) => l !== "Auto").map((lang) => {
                  const isSelected =
                    !isAuto && selectedLanguage.toLowerCase() === lang.toLowerCase();
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleSelect(lang)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-content font-bold"
                          : "hover:bg-base-300/70 text-base-content"
                      }`}
                    >
                      <span className="truncate">{lang}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0" />}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
