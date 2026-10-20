import { useState, useMemo, useRef, type ChangeEvent } from "react";
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
} from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import type { SshConfigHostCandidate, ImportResultSummary } from "@/types/importer";

interface PuttyImportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function PuttyImportModal({ isOpen, onClose }: PuttyImportModalProps) {
  const [candidates, setCandidates] = useState<SshConfigHostCandidate[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDuplicates, setFilterDuplicates] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResultSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setFileName(file.name);
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const result = await api.puttyParse(text);
        setCandidates(result);

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

    reader.onerror = () => {
      setErrorMsg("Failed to read file.");
      setIsLoading(false);
    };

    reader.readAsText(file);
  };

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
                Import saved sessions from Windows Registry export (.reg)
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
            <h4 className="font-semibold text-base">PuTTY Sessions Imported!</h4>
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
            {/* File Selector */}
            <div className="bg-base-200/50 p-3 rounded-xl border border-base-300 mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                <span className="text-xs font-semibold whitespace-nowrap text-base-content/70">
                  Registry File (.reg):
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".reg,.txt"
                  onChange={handleFileChange}
                  className="file-input file-input-bordered file-input-xs w-full text-xs"
                />
              </div>

              {candidates.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="badge badge-xs badge-accent text-[10px]">
                    {candidates.length} sessions found
                  </span>
                </div>
              )}
            </div>

            {candidates.length > 0 && (
              <>
                {/* Search & Filter Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 my-3 shrink-0">
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

                {/* Candidates Table */}
                <div className="flex-1 overflow-y-auto border border-base-300 rounded-xl bg-base-100 min-h-[220px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-48 text-xs text-base-content/60 gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      <span>Parsing PuTTY registry export...</span>
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

            {!fileName && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
                <HardDrive className="w-12 h-12 text-accent/30" />
                <h4 className="font-semibold text-sm">Select PuTTY .reg Export</h4>
                <p className="text-xs text-base-content/60 max-w-sm">
                  Export your PuTTY sessions from Windows Registry using:
                  <br />
                  <code className="text-[10px] font-mono bg-base-300 px-1.5 py-0.5 rounded text-accent">
                    reg export &quot;HKCU\Software\SimonTatham\PuTTY\Sessions&quot; sessions.reg
                  </code>
                </p>
              </div>
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
