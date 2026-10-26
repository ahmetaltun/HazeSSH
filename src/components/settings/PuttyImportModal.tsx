import { useState, useMemo, useRef, useEffect, type ChangeEvent, type DragEvent } from "react";
import {
  Download,
  AlertCircle,
  X,
  Search,
  CheckCircle2,
  Folder,
  FileCode,
  CopyCheck,
  HardDrive,
  Key,
  UploadCloud,
  FileText,
  ClipboardPaste,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import { readFileAsTextSmart } from "@/utils/fileEncoding";
import type { SshConfigHostCandidate, ImportResultSummary, PuttyDetectResult } from "@/types/importer";

interface PuttyImportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function PuttyImportModal({ isOpen, onClose }: PuttyImportModalProps) {
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteContent, setPasteContent] = useState("");
  const [candidates, setCandidates] = useState<SshConfigHostCandidate[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCopiedCommand, setIsCopiedCommand] = useState(false);

  // Auto-detection state
  const [detectResult, setDetectResult] = useState<PuttyDetectResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResultSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const WIN_REG_EXPORT_CMD = 'reg export "HKCU\\Software\\SimonTatham\\PuTTY\\Sessions" sessions.reg';

  // Auto-detect and reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setIsDetecting(true);
      api
        .puttyDetect()
        .then((res) => {
          setDetectResult(res);
          // If system sessions were found and user hasn't loaded any sessions yet, auto-load them!
          if (res.found && res.candidates.length > 0) {
            setCandidates(res.candidates);
            setFileName(`Local PuTTY (~/.putty/sessions)`);
            const initialSelected = new Set<string>();
            res.candidates.forEach((c) => {
              if (!c.is_duplicate) {
                initialSelected.add(c.label);
              }
            });
            setSelectedLabels(initialSelected);
          }
        })
        .catch((err) => {
          console.warn("Failed to auto-detect PuTTY sessions:", err);
        })
        .finally(() => {
          setIsDetecting(false);
        });
    } else {
      setCandidates([]);
      setFileName(null);
      setFileSizeBytes(null);
      setPasteContent("");
      setSelectedLabels(new Set());
      setSearchQuery("");
      setErrorMsg(null);
      setImportResult(null);
      setDetectResult(null);
      setIsDragging(false);
    }
  }, [isOpen]);

  // IMPORTANT: All hooks are called at the top level before any conditional return
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filterDuplicates && c.is_duplicate) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.hostname.toLowerCase().includes(q) ||
        (c.username && c.username.toLowerCase().includes(q)) ||
        (c.group_name && c.group_name.toLowerCase().includes(q))
      );
    });
  }, [candidates, searchQuery, filterDuplicates]);

  if (!isOpen) {
    return null;
  }

  const parseRegData = async (text: string, displayName?: string, sizeBytes?: number) => {
    if (!text.trim()) {
      setErrorMsg("Please provide PuTTY registry export or session content.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await api.puttyParse(text);
      if (result.length === 0) {
        setErrorMsg(
          "No SSH sessions were discovered in the provided content. Please ensure this is a valid PuTTY registry export containing saved sessions."
        );
        return;
      }

      setCandidates(result);
      if (displayName) setFileName(displayName);
      if (sizeBytes !== undefined) setFileSizeBytes(sizeBytes);

      const initialSelected = new Set<string>();
      result.forEach((c) => {
        if (!c.is_duplicate) {
          initialSelected.add(c.label);
        }
      });
      setSelectedLabels(initialSelected);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to parse PuTTY .reg file: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    try {
      const text = await readFileAsTextSmart(file);
      await parseRegData(text, file.name, file.size);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleResetSource = () => {
    setCandidates([]);
    setFileName(null);
    setFileSizeBytes(null);
    setPasteContent("");
    setSelectedLabels(new Set());
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(WIN_REG_EXPORT_CMD);
      setIsCopiedCommand(true);
      setTimeout(() => setIsCopiedCommand(false), 2000);
    } catch {
      // Fallback
    }
  };

  const toggleSelectAll = () => {
    if (selectedLabels.size === filteredCandidates.length && filteredCandidates.length > 0) {
      setSelectedLabels(new Set());
    } else {
      const newSelected = new Set(selectedLabels);
      filteredCandidates.forEach((c) => newSelected.add(c.label));
      setSelectedLabels(newSelected);
    }
  };

  const toggleSelectCandidate = (label: string) => {
    const next = new Set(selectedLabels);
    if (next.has(label)) {
      next.delete(label);
    } else {
      next.add(label);
    }
    setSelectedLabels(next);
  };

  const handleImport = async () => {
    const selectedList = candidates.filter((c) => selectedLabels.has(c.label));
    if (selectedList.length === 0) {
      setErrorMsg("Please select at least one PuTTY session to import.");
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);

    try {
      const result = await api.puttyImport({
        candidates: selectedList,
        import_keys_as_identities: true,
      });

      setImportResult(result);
      await useHostStore.getState().fetchAll();

      setTimeout(() => {
        onClose();
        setImportResult(null);
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  const hasPpkKeys = candidates.some((c) => c.identity_file && c.identity_file.endsWith(".ppk"));

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-4xl bg-base-100 border border-base-300 shadow-2xl p-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-base-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Import PuTTY Sessions</h3>
              <p className="text-xs text-base-content/60">
                Import saved SSH sessions from Windows Registry export (.reg) or local PuTTY sessions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            disabled={isImporting}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="alert alert-error text-xs py-2 mt-4 rounded-xl flex items-start gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {importResult ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/15 text-success mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-base">PuTTY Sessions Successfully Imported!</h4>
            <div className="flex justify-center gap-4 text-xs pt-2">
              <span className="badge badge-accent gap-1 p-3">
                {importResult.imported_hosts_count} Hosts
              </span>
              <span className="badge badge-secondary gap-1 p-3">
                {importResult.imported_groups_count} Groups
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Auto-detected notification banner or detecting status */}
            {isDetecting && candidates.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-base-content/60 py-2 mt-2 px-1">
                <span className="loading loading-spinner loading-xs text-accent" />
                <span>Checking system for local PuTTY sessions...</span>
              </div>
            ) : detectResult?.found && candidates.length === 0 ? (
              <div className="alert alert-info text-xs py-2.5 mt-4 rounded-xl flex items-center justify-between shrink-0 shadow-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-info" />
                  <span>
                    Detected <strong>{detectResult.candidates.length}</strong> local PuTTY sessions in{" "}
                    <code className="font-mono text-[11px] bg-base-300/60 px-1 py-0.5 rounded">
                      ~/.putty/sessions
                    </code>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCandidates(detectResult.candidates);
                    setFileName("Local ~/.putty/sessions");
                    const initialSelected = new Set<string>();
                    detectResult.candidates.forEach((c) => {
                      if (!c.is_duplicate) {
                        initialSelected.add(c.label);
                      }
                    });
                    setSelectedLabels(initialSelected);
                  }}
                  className="btn btn-xs btn-primary gap-1"
                >
                  <span>Load Sessions</span>
                </button>
              </div>
            ) : null}

            {/* Input Selection Toolbar (Tabs) */}
            {candidates.length === 0 ? (
              <div className="space-y-4 mt-4 shrink-0">
                <div className="flex items-center gap-2 border-b border-base-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setInputMode("file")}
                    className={`btn btn-xs gap-1.5 ${
                      inputMode === "file"
                        ? "btn-accent text-accent-content"
                        : "btn-ghost text-base-content/70"
                    }`}
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload .reg File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("paste")}
                    className={`btn btn-xs gap-1.5 ${
                      inputMode === "paste"
                        ? "btn-accent text-accent-content"
                        : "btn-ghost text-base-content/70"
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste .reg Content</span>
                  </button>
                </div>

                {inputMode === "file" ? (
                  /* Drag & Drop Zone */
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-3 ${
                      isDragging
                        ? "border-accent bg-accent/5 scale-[1.01]"
                        : "border-base-300 hover:border-accent/50 hover:bg-base-200/40"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".reg,.txt"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                      <HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Drop PuTTY .reg file here</h4>
                      <p className="text-xs text-base-content/60 mt-1 max-w-sm">
                        Drag your Windows Registry export (.reg) or PuTTY session file here, or click
                        to browse. UTF-16LE and UTF-8 encodings are automatically detected.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Direct Text Paste Area */
                  <div className="space-y-3">
                    <textarea
                      rows={7}
                      placeholder="Paste Windows Registry export content here (Windows Registry Editor Version 5.00 [HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\...])..."
                      value={pasteContent}
                      onChange={(e) => setPasteContent(e.target.value)}
                      className="textarea textarea-bordered w-full text-xs font-mono select-text"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => parseRegData(pasteContent, "Pasted Content")}
                        disabled={isLoading || !pasteContent.trim()}
                        className="btn btn-xs btn-accent gap-1.5"
                      >
                        {isLoading && <span className="loading loading-spinner loading-xs" />}
                        <span>Parse Content</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Windows Export Guide Banner */}
                <div className="bg-base-200/60 p-3 rounded-xl border border-base-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="space-y-1">
                    <span className="font-semibold text-base-content/80">
                      Need to export sessions from Windows?
                    </span>
                    <p className="text-[11px] text-base-content/60">
                      Run this in PowerShell or Command Prompt to export all saved PuTTY sessions:
                    </p>
                    <code className="text-[10px] font-mono bg-base-300/80 px-2 py-0.5 rounded text-accent block sm:inline-block">
                      {WIN_REG_EXPORT_CMD}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="btn btn-xs btn-outline gap-1.5 shrink-0 self-end sm:self-center"
                  >
                    {isCopiedCommand ? (
                      <>
                        <Check className="w-3 h-3 text-success" />
                        <span className="text-success font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Command</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Selected Source Pill */
              <div className="bg-base-200/50 p-3 rounded-xl border border-base-300 mt-4 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="font-mono text-xs font-semibold truncate text-base-content/90">
                      {fileName || "PuTTY Registry Data"}
                    </div>
                    <div className="text-[10px] text-base-content/60">
                      {fileSizeBytes ? `${(fileSizeBytes / 1024).toFixed(1)} KB • ` : ""}
                      {candidates.length} SSH sessions found
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetSource}
                  className="btn btn-ghost btn-xs text-base-content/60 hover:text-error gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Change Source</span>
                </button>
              </div>
            )}

            {/* Candidates Table & Filters */}
            {candidates.length > 0 && (
              <>
                {/* PPK Notice if keys are detected */}
                {hasPpkKeys && (
                  <div className="bg-info/10 text-info border border-info/20 px-3 py-2 rounded-xl text-[11px] flex items-center gap-2 shrink-0 my-2">
                    <Key className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      PuTTY PPK keys are linked to their original file path. If you connect from macOS or
                      Linux, ensure your keys are exported to OpenSSH format or stored in the Key Vault.
                    </span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 my-2 shrink-0">
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Filter by session name, address..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input input-bordered input-xs w-full pl-7 text-xs"
                    />
                    <Search className="w-3.5 h-3.5 text-base-content/40 absolute left-2 top-2" />
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <label className="cursor-pointer label py-0 gap-2">
                      <span className="label-text text-xs">Hide existing duplicates</span>
                      <input
                        type="checkbox"
                        checked={filterDuplicates}
                        onChange={(e) => setFilterDuplicates(e.target.checked)}
                        className="checkbox checkbox-xs checkbox-accent"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="btn btn-xs btn-ghost text-xs gap-1"
                    >
                      <CopyCheck className="w-3.5 h-3.5" />
                      <span>
                        {selectedLabels.size === filteredCandidates.length &&
                        filteredCandidates.length > 0
                          ? "Deselect All"
                          : "Select All"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto border border-base-300 rounded-xl bg-base-100 min-h-[220px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-48 text-xs text-base-content/60 gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      <span>Parsing PuTTY sessions...</span>
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2">
                      <FileCode className="w-8 h-8 text-base-content/30" />
                      <p className="text-xs text-base-content/60">No matching sessions found.</p>
                    </div>
                  ) : (
                    <table className="table table-xs table-pin-rows">
                      <thead>
                        <tr className="bg-base-200/80 text-[11px]">
                          <th className="w-8"></th>
                          <th>Session Name</th>
                          <th>Address</th>
                          <th>User</th>
                          <th>Group</th>
                          <th>Key File</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCandidates.map((c) => {
                          const isSelected = selectedLabels.has(c.label);
                          return (
                            <tr
                              key={c.label}
                              onClick={() => toggleSelectCandidate(c.label)}
                              className={`cursor-pointer hover:bg-base-200/40 transition-colors ${
                                isSelected ? "bg-accent/5" : ""
                              }`}
                            >
                              <td onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectCandidate(c.label)}
                                  className="checkbox checkbox-xs checkbox-accent"
                                />
                              </td>
                              <td className="font-semibold text-xs font-mono text-base-content/90">
                                {c.label}
                              </td>
                              <td className="font-mono text-[11px] text-base-content/70">
                                {c.hostname}
                                {c.port !== 22 && (
                                  <span className="text-accent font-bold">:{c.port}</span>
                                )}
                              </td>
                              <td className="text-[11px] text-base-content/80">
                                {c.username || <span className="opacity-40 italic">—</span>}
                              </td>
                              <td>
                                {c.group_name ? (
                                  <span className="badge badge-xs badge-ghost gap-1 text-[10px]">
                                    <Folder className="w-2.5 h-2.5 text-secondary" />
                                    <span>{c.group_name}</span>
                                  </span>
                                ) : (
                                  <span className="opacity-30 text-[10px]">—</span>
                                )}
                              </td>
                              <td>
                                {c.identity_file ? (
                                  <span className="badge badge-xs badge-outline gap-1 text-[10px] font-mono">
                                    <Key className="w-2.5 h-2.5 text-accent" />
                                    <span>{c.identity_file.split(/[\\/]/).pop()}</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] opacity-40">Password</span>
                                )}
                              </td>
                              <td>
                                {c.is_duplicate ? (
                                  <span className="badge badge-xs badge-warning text-[9px]">
                                    Duplicate
                                  </span>
                                ) : (
                                  <span className="badge badge-xs badge-ghost text-[9px]">
                                    New
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-base-200 mt-4 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-ghost"
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting || selectedLabels.size === 0}
                className="btn btn-sm btn-accent gap-1.5"
              >
                {isImporting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Import {selectedLabels.size} Sessions</span>
              </button>
            </div>
          </>
        )}
      </div>
      <div className="modal-backdrop bg-base-900/60 backdrop-blur-xs" onClick={onClose} />
    </div>
  );
}
