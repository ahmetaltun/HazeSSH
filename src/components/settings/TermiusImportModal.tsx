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
  Terminal,
  FileJson,
  UploadCloud,
  FileText,
  ClipboardPaste,
} from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { readFileAsTextSmart } from "@/utils/fileEncoding";
import type { SshConfigHostCandidate, ImportResultSummary } from "@/types/importer";
import type { CreateSnippetInput } from "@/types/snippet";

interface TermiusImportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function TermiusImportModal({ isOpen, onClose }: TermiusImportModalProps) {
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteContent, setPasteContent] = useState("");
  const [candidates, setCandidates] = useState<SshConfigHostCandidate[]>([]);
  const [snippets, setSnippets] = useState<CreateSnippetInput[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [importSnippetsToggle, setImportSnippetsToggle] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResultSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean state when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setCandidates([]);
      setSnippets([]);
      setFileName(null);
      setFileSizeBytes(null);
      setPasteContent("");
      setSelectedLabels(new Set());
      setSearchQuery("");
      setErrorMsg(null);
      setImportResult(null);
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

  const parseJsonData = async (text: string, displayName?: string, sizeBytes?: number) => {
    if (!text.trim()) {
      setErrorMsg("Please provide Termius JSON export content to import.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await api.termiusParse(text);
      if (result.candidates.length === 0 && result.snippets.length === 0) {
        setErrorMsg(
          "No hosts or command snippets found in the provided JSON data. Ensure you exported from Termius via Settings → Data Management → Export Data."
        );
        return;
      }

      setCandidates(result.candidates);
      setSnippets(result.snippets);
      if (displayName) setFileName(displayName);
      if (sizeBytes !== undefined) setFileSizeBytes(sizeBytes);

      // By default select all non-duplicate hosts
      const initialSelected = new Set<string>();
      result.candidates.forEach((c) => {
        if (!c.is_duplicate) {
          initialSelected.add(c.label);
        }
      });
      setSelectedLabels(initialSelected);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to parse Termius JSON export: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    try {
      const text = await readFileAsTextSmart(file);
      await parseJsonData(text, file.name, file.size);
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
    setSnippets([]);
    setFileName(null);
    setFileSizeBytes(null);
    setPasteContent("");
    setSelectedLabels(new Set());
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
    if (selectedList.length === 0 && (!importSnippetsToggle || snippets.length === 0)) {
      setErrorMsg("Please select at least one host or snippet to import.");
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);

    try {
      const result = await api.termiusImport({
        candidates: selectedList,
        snippets: importSnippetsToggle ? snippets : [],
        import_keys_as_identities: true,
      });

      setImportResult(result);
      await Promise.all([
        useHostStore.getState().fetchAll(),
        useSnippetStore.getState().fetchSnippets(),
      ]);

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

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-4xl bg-base-100 border border-base-300 shadow-2xl p-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-base-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Import from Termius</h3>
              <p className="text-xs text-base-content/60">
                Migrate hosts, folder groupings, and command snippets from Termius JSON exports
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
            <h4 className="font-semibold text-base">Termius Data Successfully Imported!</h4>
            <div className="flex justify-center gap-4 text-xs pt-2">
              <span className="badge badge-primary gap-1 p-3">
                {importResult.imported_hosts_count} Hosts
              </span>
              <span className="badge badge-secondary gap-1 p-3">
                {importResult.imported_groups_count} Groups
              </span>
              {importSnippetsToggle && snippets.length > 0 && (
                <span className="badge badge-info gap-1 p-3">{snippets.length} Snippets</span>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Input Selection Toolbar (Tabs) */}
            {candidates.length === 0 ? (
              <div className="space-y-3 mt-4 shrink-0">
                <div className="flex items-center gap-2 border-b border-base-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setInputMode("file")}
                    className={`btn btn-xs gap-1.5 ${
                      inputMode === "file"
                        ? "btn-secondary text-secondary-content"
                        : "btn-ghost text-base-content/70"
                    }`}
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload JSON File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("paste")}
                    className={`btn btn-xs gap-1.5 ${
                      inputMode === "paste"
                        ? "btn-secondary text-secondary-content"
                        : "btn-ghost text-base-content/70"
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste JSON Content</span>
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
                        ? "border-secondary bg-secondary/5 scale-[1.01]"
                        : "border-base-300 hover:border-secondary/50 hover:bg-base-200/40"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
                      <FileJson className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Drop Termius JSON export here</h4>
                      <p className="text-xs text-base-content/60 mt-1 max-w-sm">
                        Export your data from Termius (Settings → Data Management → Export Data) and
                        drag the JSON file here, or click to browse.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Direct Text Paste Area */
                  <div className="space-y-3">
                    <textarea
                      rows={7}
                      placeholder='Paste Termius export JSON here (e.g. {"hosts": [{"label": "Server", "address": "1.2.3.4"}]})...'
                      value={pasteContent}
                      onChange={(e) => setPasteContent(e.target.value)}
                      className="textarea textarea-bordered w-full text-xs font-mono select-text"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => parseJsonData(pasteContent, "Pasted Content")}
                        disabled={isLoading || !pasteContent.trim()}
                        className="btn btn-xs btn-secondary gap-1.5"
                      >
                        {isLoading && <span className="loading loading-spinner loading-xs" />}
                        <span>Parse JSON</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Selected Source Pill */
              <div className="bg-base-200/50 p-3 rounded-xl border border-base-300 mt-4 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="font-mono text-xs font-semibold truncate text-base-content/90">
                      {fileName || "Termius Data"}
                    </div>
                    <div className="text-[10px] text-base-content/60">
                      {fileSizeBytes ? `${(fileSizeBytes / 1024).toFixed(1)} KB • ` : ""}
                      {candidates.length} hosts found
                      {snippets.length > 0 ? ` • ${snippets.length} snippets` : ""}
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 my-3 shrink-0">
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Filter by label, host, group..."
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
                        className="checkbox checkbox-xs checkbox-primary"
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
                      <span>Parsing Termius JSON export...</span>
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2">
                      <FileCode className="w-8 h-8 text-base-content/30" />
                      <p className="text-xs text-base-content/60">No matching hosts found.</p>
                    </div>
                  ) : (
                    <table className="table table-xs table-pin-rows">
                      <thead>
                        <tr className="bg-base-200/80 text-[11px]">
                          <th className="w-8"></th>
                          <th>Host / Alias</th>
                          <th>Address</th>
                          <th>User</th>
                          <th>Group</th>
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
                                isSelected ? "bg-primary/5" : ""
                              }`}
                            >
                              <td onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectCandidate(c.label)}
                                  className="checkbox checkbox-xs checkbox-primary"
                                />
                              </td>
                              <td className="font-semibold text-xs font-mono text-base-content/90">
                                {c.label}
                              </td>
                              <td className="font-mono text-[11px] text-base-content/70">
                                {c.hostname}
                                {c.port !== 22 && (
                                  <span className="text-secondary font-bold">:{c.port}</span>
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

            {/* Bottom Actions and Options */}
            <div className="pt-4 border-t border-base-200 mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              {snippets.length > 0 ? (
                <label className="cursor-pointer label py-0 gap-2">
                  <input
                    type="checkbox"
                    checked={importSnippetsToggle}
                    onChange={(e) => setImportSnippetsToggle(e.target.checked)}
                    className="toggle toggle-secondary toggle-xs"
                  />
                  <span className="label-text text-xs text-base-content/80 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-info" />
                    <span>Also import {snippets.length} command snippets</span>
                  </span>
                </label>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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
                  disabled={
                    isImporting ||
                    (selectedLabels.size === 0 && (!importSnippetsToggle || snippets.length === 0))
                  }
                  className="btn btn-sm btn-secondary gap-1.5"
                >
                  {isImporting ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    Import {selectedLabels.size} Hosts
                    {importSnippetsToggle && snippets.length > 0
                      ? ` & ${snippets.length} Snippets`
                      : ""}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="modal-backdrop bg-base-900/60 backdrop-blur-xs" onClick={onClose} />
    </div>
  );
}
